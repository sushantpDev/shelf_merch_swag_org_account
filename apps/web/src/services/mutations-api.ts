import { validateArtworkFile } from "@/lib/artworkValidation";
import { normalizeMongoId } from "@/lib/mongoId";
import { chunkBySize } from "@/lib/uploadBatches";
import { ApiError, apiFetch } from "./api";
import { getStoredUser } from "./auth-store";
import { mediaUrlForCanvas, resolveMediaUrl } from "@/lib/mediaUrl";
import { mapCampaign, mapCollection, mapKit, type UiProduct } from "./mappers";

const MONGO_ID = /^[a-f0-9]{24}$/i;

type OrgWizardState = {
  wallet: {
    id?: string;
    name: string;
    amount: number;
    start: string;
    end: string;
    address: string;
    pinCode: string;
    mobileNumber: string;
    gstin: string;
    funding: string;
    docType: string;
    docNumber: string;
    uploadFile?: { file?: File } | null;
  };
  departments: Array<{
    id: string | number;
    name: string;
    desc: string;
    users: number;
    allocated: number;
    color: string;
    selected?: boolean;
    mgr: { name: string; email: string; mobile: string; role: string; invite: boolean };
  }>;
  createNewWallet?: boolean;
};

function walletIdFromResponse(wallet: Record<string, unknown>): string {
  const id = wallet._id ?? wallet.id;
  const normalized = normalizeMongoId(id);
  if (!normalized || !MONGO_ID.test(normalized)) {
    throw new Error("Wallet create response missing a valid id");
  }
  return normalized;
}

async function ensureWalletFunded(
  walletId: string,
  amount: number,
  fundingMethod: "po_upload" | "online" = "po_upload",
  opts?: { docType?: string; docNumber?: string },
): Promise<void> {
  if (amount <= 0) return;
  const existing = await apiFetch<{
    balance?: number;
    fundingMethod?: string;
    fundingDocument?: { approvalStatus?: string };
  }>(`/wallets/${walletId}`);
  const method = existing.fundingMethod ?? fundingMethod;
  const approval = existing.fundingDocument?.approvalStatus ?? "";

  if (method === "po_upload") {
    if (approval === "pending") return;
    if (approval === "approved" && Number(existing.balance ?? 0) > 0) return;
    try {
      await apiFetch(`/wallets/${walletId}/fund`, {
        method: "POST",
        idempotencyKey: `fund-${walletId}-setup`,
        body: JSON.stringify({
          amount,
          description: "Organization wallet setup funding",
          fundingMethod: "po_upload",
          docType: opts?.docType ?? "",
          docNumber: opts?.docNumber ?? "",
        }),
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === "FUNDING_PENDING") return;
      throw err;
    }
    return;
  }

  // Online funding uses Razorpay checkout — not POST /fund.
}

async function completePoFundingSubmission(
  walletId: string,
  org: OrgWizardState,
  fundingMethod: "po_upload" | "online",
): Promise<void> {
  if (fundingMethod !== "po_upload") return;
  if (org.wallet.uploadFile?.file) {
    await uploadWalletFundingDocumentApi(walletId, org.wallet.uploadFile.file);
  }
  await ensureWalletFunded(walletId, org.wallet.amount, "po_upload", {
    docType: org.wallet.docType,
    docNumber: org.wallet.docNumber,
  });
}

async function tryResolveExistingWalletId(id: string): Promise<string | null> {
  if (!MONGO_ID.test(id)) return null;
  try {
    await apiFetch(`/wallets/${id}`);
    return id;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function uploadWalletFundingDocumentApi(walletId: string, file: File) {
  const form = new FormData();
  form.append("document", file);
  return apiFetch<Record<string, unknown>>(`/wallets/${walletId}/funding-document`, {
    method: "POST",
    body: form,
  });
}

async function rollbackIncompleteWallet(walletId: string): Promise<void> {
  try {
    await apiFetch(`/wallets/${walletId}`, { method: "DELETE" });
  } catch {
    // Best-effort cleanup; the original error is still thrown to the caller.
  }
}

async function cleanupOrphanDraftByName(name: string): Promise<void> {
  const nameKey = name.trim().toLowerCase();
  if (!nameKey) return;
  try {
    const wallets = await apiFetch<Array<Record<string, unknown>>>("/wallets");
    for (const row of wallets) {
      const rowName = String(row.name ?? "").trim().toLowerCase();
      const status = String(row.status ?? "draft");
      const approval = (row.fundingDocument as { approvalStatus?: string } | undefined)
        ?.approvalStatus;
      if (rowName !== nameKey || status !== "draft" || approval === "pending") continue;
      const id = normalizeMongoId(row._id ?? row.id);
      if (MONGO_ID.test(id)) await rollbackIncompleteWallet(id);
    }
  } catch {
    // Best-effort only.
  }
}

async function findRecoverableWalletId(name: string): Promise<string | null> {
  const nameKey = name.trim().toLowerCase();
  if (!nameKey) return null;
  try {
    const wallets = await apiFetch<Array<Record<string, unknown>>>("/wallets");
    const match = wallets.find((row) => {
      const rowName = String(row.name ?? "").trim().toLowerCase();
      if (rowName !== nameKey) return false;
      const status = String(row.status ?? "draft");
      const approval = (row.fundingDocument as { approvalStatus?: string } | undefined)
        ?.approvalStatus;
      if (approval === "pending") return true;
      return status === "draft" && Number(row.balance ?? 0) === 0;
    });
    if (!match) return null;
    return walletIdFromResponse(match);
  } catch {
    return null;
  }
}

async function createWalletAndFund(org: OrgWizardState): Promise<string> {
  const fundingMethod = org.wallet.funding === "pay" ? "online" : "po_upload";
  const form = new FormData();
  form.append("name", org.wallet.name);
  form.append("currency", "INR");
  if (org.wallet.start) form.append("validFrom", org.wallet.start);
  if (org.wallet.end) form.append("validTo", org.wallet.end);
  form.append("fundingMethod", fundingMethod);
  form.append("docType", org.wallet.docType || "");
  form.append("docNumber", org.wallet.docNumber || "");
  form.append("amount", String(org.wallet.amount));
  form.append("address", org.wallet.address.trim());
  form.append("pinCode", org.wallet.pinCode.trim());
  form.append("mobileNumber", org.wallet.mobileNumber.trim());
  form.append("gstin", org.wallet.gstin.trim().toUpperCase());
  if (fundingMethod === "po_upload" && org.wallet.uploadFile?.file) {
    form.append("document", org.wallet.uploadFile.file);
  }

  const existing = await findRecoverableWalletId(org.wallet.name);
  if (existing) {
    await completePoFundingSubmission(existing, org, fundingMethod);
    return existing;
  }

  try {
    const wallet = await apiFetch<Record<string, unknown>>("/wallets/setup", {
      method: "POST",
      body: form,
    });
    return walletIdFromResponse(wallet);
  } catch (err) {
    const recovered = await findRecoverableWalletId(org.wallet.name);
    if (recovered) {
      await completePoFundingSubmission(recovered, org, fundingMethod);
      return recovered;
    }
    await cleanupOrphanDraftByName(org.wallet.name);
    throw err;
  }
}

/** Step 1 only — create wallet, upload PO, submit funding request for finance review. */
export async function createWalletOnlyApi(
  org: Pick<OrgWizardState, "wallet">,
): Promise<{ walletId: string }> {
  const walletId = await createWalletAndFund(org as OrgWizardState);
  return { walletId };
}

/** Update wallet contact / billing details (address, pin, mobile, GSTIN). */
export async function updateWalletContactApi(
  walletId: string,
  fields: {
    address: string;
    pinCode: string;
    mobileNumber: string;
    gstin: string;
  },
): Promise<void> {
  await apiFetch(`/wallets/${walletId}`, {
    method: "PATCH",
    body: JSON.stringify({
      address: fields.address.trim(),
      pinCode: fields.pinCode.trim(),
      mobileNumber: fields.mobileNumber.trim(),
      gstin: fields.gstin.trim().toUpperCase(),
    }),
  });
}

async function resolveWalletId(org: OrgWizardState, createNewWallet = false): Promise<string> {
  if (createNewWallet) {
    return createWalletAndFund(org);
  }

  let candidate = org.wallet.id?.trim();
  const tenantId = getStoredUser()?.tenantId;

  // Stale UI state sometimes stores tenantId where a wallet id belongs.
  if (candidate && tenantId && candidate === tenantId) {
    candidate = undefined;
  }

  if (candidate) {
    const resolved = await tryResolveExistingWalletId(candidate);
    if (resolved) {
      await ensureWalletFunded(
        resolved,
        org.wallet.amount,
        org.wallet.funding === "pay" ? "online" : "po_upload",
      );
      return resolved;
    }
  }

  // Reuse an existing tenant wallet before creating a duplicate.
  const wallets = await apiFetch<Array<Record<string, unknown>>>("/wallets");
  const nameKey = org.wallet.name?.trim().toLowerCase();
  const ranked = [...wallets].sort(
    (a, b) => Number(b.balance ?? 0) - Number(a.balance ?? 0),
  );
  const byName = nameKey
    ? ranked.find((w) => String(w.name ?? "").trim().toLowerCase() === nameKey)
    : undefined;
  if (byName) {
    const walletId = walletIdFromResponse(byName);
    await ensureWalletFunded(
      walletId,
      org.wallet.amount,
      org.wallet.funding === "pay" ? "online" : "po_upload",
    );
    return walletId;
  }

  return createWalletAndFund(org);
}

function productRefFromUi(p: UiProduct) {
  if (!p.id) throw new Error(`Product "${p.nm}" has no catalog id — reload the catalog`);
  const mockupUrl = p.mockupUrl ? resolveMediaUrl(p.mockupUrl) : "";
  const mockupBackUrl = p.mockupBackUrl ? resolveMediaUrl(p.mockupBackUrl) : "";
  const placements = p.areaPlacements
    ? Object.entries(p.areaPlacements).map(([key, pl]) => ({ key, ...pl }))
    : undefined;
  return {
    catalogProductId: p.id,
    brand: p.brand || "",
    name: p.nm,
    group: p.g || "tee",
    ...(mockupUrl ? { mockupUrl } : {}),
    ...(mockupBackUrl ? { mockupBackUrl } : {}),
    // Carry the saved Konva placement so live colour tints match the baked mockup.
    ...(p.placement ? { placement: p.placement } : {}),
    ...(placements?.length ? { placements } : {}),
  };
}

function collectionMediaUrl(url?: string) {
  if (!url || url.startsWith("blob:")) return "";
  return resolveMediaUrl(url);
}

function cleanPreferredColors(colors?: string[]) {
  return (colors || []).filter((c) => typeof c === "string" && c.trim());
}

export async function createKitApi(payload: {
  name: string;
  description?: string;
  pickedIndices: number[];
  catalog: UiProduct[];
  packaging: "none" | "box";
  designNotes?: string;
  kitPrice?: number;
}) {
  const productRefs = payload.pickedIndices.map((i) => {
    const p = payload.catalog[i];
    if (!p) throw new Error("Invalid product selection");
    return productRefFromUi(p);
  });
  const kit = await apiFetch<Record<string, unknown>>("/kits", {
    method: "POST",
    body: JSON.stringify({
      name: payload.name,
      description: payload.description || "",
      productRefs,
      packaging: payload.packaging === "box" ? "box" : "none",
      designNotes: payload.designNotes || "",
      kitPrice: Math.round(Number(payload.kitPrice) || 0),
      status: "live",
    }),
  });
  return mapKit(kit);
}

/**
 * Ensure a workspace clone of a curated platform kit exists for the send flow.
 * Allowed for campaignOps write (entity_manager) — does not require kits write.
 * Optional productRefs (from tenant catalog) avoid empty curated kits with no item IDs.
 */
export async function ensureCuratedKitApi(
  platformKitId: string,
  productRefs?: Array<{
    catalogProductId: string;
    brand?: string;
    name: string;
    group?: string;
  }>,
) {
  const kit = await apiFetch<Record<string, unknown>>(`/kits/from-platform/${platformKitId}`, {
    method: "POST",
    body: JSON.stringify(productRefs?.length ? { productRefs } : {}),
  });
  return mapKit(kit);
}

export async function updateKitApi(payload: {
  id: string;
  name?: string;
  pickedIndices: number[];
  catalog: UiProduct[];
  packaging?: "none" | "box";
  designNotes?: string;
  status?: string;
}) {
  const productRefs = payload.pickedIndices.map((i) => {
    const p = payload.catalog[i];
    if (!p) throw new Error("Invalid product selection");
    return productRefFromUi(p);
  });
  const body: Record<string, unknown> = { productRefs };
  if (payload.name != null) body.name = payload.name;
  if (payload.packaging != null) body.packaging = payload.packaging;
  if (payload.designNotes != null) body.designNotes = payload.designNotes;
  if (payload.status != null) body.status = payload.status;

  const kit = await apiFetch<Record<string, unknown>>(`/kits/${payload.id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return mapKit(kit);
}

export async function uploadKitArtworkApi(kitId: string, file: File) {
  await validateArtworkFile(file);
  const form = new FormData();
  form.append("artwork", file);
  const kit = await apiFetch<Record<string, unknown>>(`/kits/${kitId}/artwork`, {
    method: "POST",
    body: form,
  });
  return mapKit(kit);
}

type MockupPlacement = {
  printCxPct?: number;
  printCyPct?: number;
  printWPct?: number;
  xPct: number;
  yPct: number;
  wPct: number;
  rot: number;
  artworkUrl?: string;
};

type KitMockupUploadItem = {
  catalogProductId: string;
  dataUrl: string;
  placement?: MockupPlacement;
  designOnlyDataUrl?: string;
  printSpec?: {
    widthIn: number;
    heightIn: number;
    dpi: number;
    widthPx: number;
    heightPx: number;
  };
};

export async function uploadKitMockupsApi(kitId: string, items: KitMockupUploadItem[]) {
  const meta: Array<{
    catalogProductId: string;
    placement?: MockupPlacement;
    printSpec?: KitMockupUploadItem["printSpec"];
    hasDesignOnly?: boolean;
  }> = [];
  const form = new FormData();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.dataUrl?.startsWith("data:")) continue;
    const res = await fetch(item.dataUrl);
    const blob = await res.blob();
    form.append("mockups", new File([blob], `kit-mockup-${i}.png`, { type: blob.type || "image/png" }));
    const hasDesignOnly = Boolean(item.designOnlyDataUrl?.startsWith("data:"));
    if (hasDesignOnly && item.designOnlyDataUrl) {
      const dRes = await fetch(item.designOnlyDataUrl);
      const dBlob = await dRes.blob();
      form.append("designOnly", new File([dBlob], `kit-design-${i}.png`, { type: dBlob.type || "image/png" }));
    }
    meta.push({
      catalogProductId: item.catalogProductId,
      ...(item.placement ? { placement: item.placement } : {}),
      ...(item.printSpec ? { printSpec: item.printSpec } : {}),
      ...(hasDesignOnly ? { hasDesignOnly: true } : {}),
    });
  }
  if (!meta.length) return null;
  form.append("meta", JSON.stringify(meta));
  const kit = await apiFetch<Record<string, unknown>>(`/kits/${kitId}/mockups`, {
    method: "POST",
    body: form,
  });
  return mapKit(kit);
}

type ArtworkInput = { file?: File; preview?: string; name?: string };

const UPLOADABLE_ART_EXT = /\.(png|jpe?g|webp|gif)$/i;

/** Map MIME → extension the API upload allowlist accepts. */
function extForArtworkMime(mime: string): string {
  if (mime === "image/jpeg" || mime === "image/jpg") return ".jpg";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  return ".png";
}

/**
 * API multer filter requires BOTH an allowlisted MIME and extension. Reused
 * artwork often has a display name with no extension ("Existing artwork", or
 * history labels with the suffix stripped) — that yields 415 with
 * "Unsupported file type: image/png".
 */
function artworkUploadFilename(name: string | undefined, mime: string): string {
  const raw = (name || "artwork").trim() || "artwork";
  if (UPLOADABLE_ART_EXT.test(raw)) return raw;
  const base = raw.replace(/\.[^.]+$/, "") || "artwork";
  return `${base}${extForArtworkMime(mime)}`;
}

/** Ensure filename + MIME pair will pass the server upload allowlist. */
function withUploadableArtworkName(file: File, preferredName?: string): File {
  const mime = file.type || "image/png";
  const filename = artworkUploadFilename(file.name || preferredName, mime);
  if (filename === file.name && file.type === mime) return file;
  return new File([file], filename, { type: mime });
}

/** Preserve original PNG bytes, including the physical resolution metadata. */
async function ensureUploadableArtworkFile(file: File, preferredName?: string): Promise<File> {
  const namedFile = withUploadableArtworkName(file, preferredName);
  await validateArtworkFile(namedFile);
  return namedFile;
}

async function artworkFileFromInput(art: ArtworkInput): Promise<File | null> {
  let file: File | null = null;
  if (art.file instanceof File) {
    file = art.file;
  } else if (art.preview) {
    // Fetch the preview back into a File so collection.artworkUrl is persisted.
    // Fresh uploads/pastes are data:/blob:; artwork reused from history comes in
    // as an already-hosted URL. That reused case previously returned null here,
    // so artworkUrl stayed empty and the artwork was missing from live
    // colour-tinted mockups (only baked into the mockup).
    const src = art.preview;
    let fetchUrl = "";
    if (src.startsWith("data:") || src.startsWith("blob:") || src.startsWith("/")) {
      fetchUrl = src;
    } else if (/^https?:\/\//i.test(src)) {
      // Route remote (e.g. S3) artwork through the media proxy so the fetch is
      // same-origin — a direct cross-origin fetch is blocked by CORS, which
      // silently left artworkUrl empty.
      fetchUrl = mediaUrlForCanvas(src);
    }
    if (fetchUrl) {
      try {
        const res = await fetch(fetchUrl);
        const blob = await res.blob();
        const mime = blob.type || "image/png";
        file = new File([blob], artworkUploadFilename(art.name, mime), { type: mime });
      } catch {
        file = null;
      }
    }
  }
  if (!file) return null;
  return ensureUploadableArtworkFile(file, art.name);
}

/** Build an upload-ready artwork File (SVG → PNG). Exported for kit/collection flows. */
export async function prepareArtworkUploadFile(art: ArtworkInput): Promise<File | null> {
  return artworkFileFromInput(art);
}

export async function uploadCollectionArtworkApi(collectionId: string, file: File) {
  await validateArtworkFile(file);
  const form = new FormData();
  form.append("artwork", file);
  const col = await apiFetch<Record<string, unknown>>(`/collections/${collectionId}/artwork`, {
    method: "POST",
    body: form,
  });
  return mapCollection(col);
}

type MockupUploadItem = {
  catalogProductId: string;
  dataUrl: string;
  backDataUrl?: string;
  placement?: MockupPlacement;
  placements?: Array<{ key: string; artworkDataUrl?: string } & MockupPlacement>;
  designOnlyDataUrl?: string;
  printSpec?: {
    widthIn: number;
    heightIn: number;
    dpi: number;
    widthPx: number;
    heightPx: number;
  };
};

type MockupMetaItem = {
  catalogProductId: string;
  placement?: MockupPlacement;
  placements?: Array<{ key: string; hasArtwork?: boolean; artworkUrl?: string } & MockupPlacement>;
  printSpec?: MockupUploadItem["printSpec"];
  hasDesignOnly?: boolean;
  hasMockupBack?: boolean;
};

type PreparedCollectionMockup = {
  mockup: File;
  mockupBack?: File;
  designOnly?: File;
  areaArts: File[];
  meta: MockupMetaItem;
  byteSize: number;
};

async function blobFile(dataUrl: string, name: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || "image/png" });
}

async function prepareCollectionMockups(items: MockupUploadItem[]): Promise<PreparedCollectionMockup[]> {
  const prepared: PreparedCollectionMockup[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.dataUrl?.startsWith("data:")) continue;
    const mockup = await blobFile(item.dataUrl, `mockup-${i}.png`);
    let byteSize = mockup.size;
    const row: PreparedCollectionMockup = {
      mockup,
      areaArts: [],
      meta: { catalogProductId: item.catalogProductId },
      byteSize,
    };
    if (item.backDataUrl?.startsWith("data:")) {
      row.mockupBack = await blobFile(item.backDataUrl, `mockup-back-${i}.png`);
      row.byteSize += row.mockupBack.size;
      row.meta.hasMockupBack = true;
    }
    if (item.designOnlyDataUrl?.startsWith("data:")) {
      row.designOnly = await blobFile(item.designOnlyDataUrl, `design-${i}.png`);
      row.byteSize += row.designOnly.size;
      row.meta.hasDesignOnly = true;
    }
    if (item.placement) row.meta.placement = item.placement;
    if (item.printSpec) row.meta.printSpec = item.printSpec;

    const placementsMeta: NonNullable<MockupMetaItem["placements"]> = [];
    for (const placement of item.placements || []) {
      const { artworkDataUrl, ...rest } = placement;
      const hasArtwork = Boolean(
        artworkDataUrl &&
          (artworkDataUrl.startsWith("data:") || artworkDataUrl.startsWith("blob:")),
      );
      if (hasArtwork && artworkDataUrl) {
        const aRes = await fetch(artworkDataUrl);
        const aBlob = await aRes.blob();
        const ext = (aBlob.type || "image/png").includes("jpeg") ? "jpg" : "png";
        const named = new File([aBlob], `area-art-${i}-${placementsMeta.length}.${ext}`, {
          type: aBlob.type || "image/png",
        });
        await validateArtworkFile(named);
        row.areaArts.push(named);
        row.byteSize += named.size;
        placementsMeta.push({ ...rest, hasArtwork: true });
      } else if (artworkDataUrl && !artworkDataUrl.startsWith("data:") && !artworkDataUrl.startsWith("blob:")) {
        placementsMeta.push({ ...rest, artworkUrl: resolveMediaUrl(artworkDataUrl) || artworkDataUrl });
      } else {
        placementsMeta.push(rest);
      }
    }
    if (placementsMeta.length) row.meta.placements = placementsMeta;
    prepared.push(row);
  }
  return prepared;
}

function formFromPreparedMockups(batch: PreparedCollectionMockup[]): FormData {
  const form = new FormData();
  const meta: MockupMetaItem[] = [];
  let backCount = 0;
  for (const row of batch) {
    form.append("mockups", row.mockup);
    if (row.mockupBack) {
      form.append(
        "mockupsBack",
        new File([row.mockupBack], `mockup-back-${backCount}.png`, { type: row.mockupBack.type }),
      );
      backCount += 1;
    }
    if (row.designOnly) form.append("designOnly", row.designOnly);
    for (const art of row.areaArts) {
      form.append("areaArts", art);
    }
    meta.push(row.meta);
  }
  form.append("meta", JSON.stringify(meta));
  return form;
}

export async function uploadCollectionMockupsApi(
  collectionId: string,
  items: MockupUploadItem[],
  catalogById?: Map<string, UiProduct>,
  options?: { budgetBytes?: number },
) {
  const prepared = await prepareCollectionMockups(items);
  if (!prepared.length) return null;

  // Backend merges each POST into productRefs, so batches stay additive.
  const batches = chunkBySize(prepared, (row) => row.byteSize, options?.budgetBytes);
  let mapped: ReturnType<typeof mapCollection> | null = null;
  for (const batch of batches) {
    const col = await apiFetch<Record<string, unknown>>(`/collections/${collectionId}/mockups`, {
      method: "POST",
      body: formFromPreparedMockups(batch),
    });
    mapped = mapCollection(col, "", catalogById);
  }
  return mapped;
}

export async function linkCollectionToShopApi(collectionId: string, shopId: string) {
  const col = await apiFetch<Record<string, unknown>>(`/collections/${collectionId}`, {
    method: "PATCH",
    body: JSON.stringify({ shopId }),
  });
  return mapCollection(col);
}

export async function updateCollectionApi(payload: {
  collectionId: string;
  name: string;
  pickedIndices: number[];
  catalog: UiProduct[];
  artwork?: ArtworkInput;
  mockups?: MockupUploadItem[];
}) {
  const productRefs = payload.pickedIndices.map((i) => {
    const p = payload.catalog[i];
    if (!p) throw new Error("Invalid product selection");
    return productRefFromUi(p);
  });
  const catalogById = new Map(
    payload.catalog.filter((p) => p.id).map((p) => [p.id as string, p]),
  );

  let result = mapCollection(
    await apiFetch<Record<string, unknown>>(`/collections/${payload.collectionId}`, {
      method: "PATCH",
      body: JSON.stringify({ name: payload.name, productRefs }),
    }),
    "",
    catalogById,
  );

  if (payload.artwork) {
    // Not just `?.file` — reused-from-history artwork has only a hosted preview,
    // and it must still be uploaded so collection.artworkUrl is persisted.
    const file = await artworkFileFromInput(payload.artwork);
    if (file) result = await uploadCollectionArtworkApi(result.id, file);
  }
  if (payload.mockups?.length) {
    const withMockups = await uploadCollectionMockupsApi(result.id, payload.mockups, catalogById);
    if (!withMockups) {
      throw new Error("Failed to save product mockups — try generating designs again");
    }
    result = withMockups;
  }
  return result;
}

export async function archiveCollectionApi(collectionId: string) {
  const col = await apiFetch<Record<string, unknown>>(`/collections/${collectionId}/archive`, {
    method: "POST",
  });
  return mapCollection(col);
}

export async function restoreCollectionApi(collectionId: string) {
  const col = await apiFetch<Record<string, unknown>>(`/collections/${collectionId}/restore`, {
    method: "POST",
  });
  return mapCollection(col);
}

export async function deleteCollectionApi(collectionId: string) {
  await apiFetch(`/collections/${collectionId}`, { method: "DELETE" });
}

export async function addProductToShopApi(payload: {
  shopId: string;
  collection: { name: string; artworkUrl?: string; preferredColors?: string[] };
  product: UiProduct;
  catalog: UiProduct[];
}) {
  const catalogProduct =
    payload.catalog.find((p) => p.id && p.id === payload.product.id) ||
    payload.product;
  if (!catalogProduct.id) {
    throw new Error("Could not match this product to the catalog");
  }

  const productRef = {
    ...productRefFromUi(catalogProduct),
    ...(payload.product.mockupUrl
      ? { mockupUrl: resolveMediaUrl(payload.product.mockupUrl) }
      : {}),
    ...(payload.product.mockupBackUrl
      ? { mockupBackUrl: resolveMediaUrl(payload.product.mockupBackUrl) }
      : {}),
    // catalogProduct has no placement — take it from the designed product so the
    // shop-specific collection keeps the artwork size/position on colour variants.
    ...(payload.product.placement ? { placement: payload.product.placement } : {}),
  };
  const catalogById = new Map(
    payload.catalog.filter((p) => p.id).map((p) => [p.id as string, p]),
  );
  const body = {
    name: payload.collection.name,
    productRefs: [productRef],
    preferredColors: cleanPreferredColors(payload.collection.preferredColors),
    shopId: payload.shopId,
    artworkUrl: collectionMediaUrl(payload.collection.artworkUrl),
    isShopSpecific: true,
  };

  let createdId: string | undefined;
  try {
    const col = await apiFetch<Record<string, unknown>>("/collections", {
      method: "POST",
      body: JSON.stringify(body),
    });
    let result = mapCollection(col, "", catalogById);
    createdId = result.id;

    const mockup = resolveMediaUrl(payload.product.mockupUrl);
    const mockupBack = resolveMediaUrl(payload.product.mockupBackUrl);
    if (mockup?.startsWith("data:") && catalogProduct.id) {
      const withMockups = await uploadCollectionMockupsApi(
        result.id,
        [
          {
            catalogProductId: catalogProduct.id,
            dataUrl: mockup,
            ...(mockupBack?.startsWith("data:") ? { backDataUrl: mockupBack } : {}),
          },
        ],
        catalogById,
      );
      if (!withMockups) {
        throw new Error("Failed to save product mockups — try again");
      }
      result = withMockups;
    }

    return result;
  } catch (err) {
    if (createdId) await rollbackFailedCollection(createdId);
    throw err;
  }
}

export async function createCollectionApi(payload: {
  shopId?: string;
  shopIds?: string[];
  name: string;
  pickedIndices: number[];
  catalog: UiProduct[];
  preferredColors?: string[];
  artworkUrl?: string;
  artwork?: ArtworkInput;
  mockups?: MockupUploadItem[];
  isShopSpecific?: boolean;
}) {
  const productRefs = payload.pickedIndices.map((i) => {
    const p = payload.catalog[i];
    if (!p) throw new Error("Invalid product selection");
    return productRefFromUi(p);
  });
  const catalogById = new Map(
    payload.catalog.filter((p) => p.id).map((p) => [p.id as string, p]),
  );
  const body: Record<string, unknown> = {
    name: payload.name,
    productRefs,
    preferredColors: cleanPreferredColors(payload.preferredColors),
  };
  if (payload.shopId) body.shopId = payload.shopId;
  if (payload.artworkUrl) body.artworkUrl = collectionMediaUrl(payload.artworkUrl);
  if (payload.isShopSpecific) body.isShopSpecific = true;

  let createdId: string | undefined;
  try {
    const col = await apiFetch<Record<string, unknown>>("/collections", {
      method: "POST",
      body: JSON.stringify(body),
    });
    let result = mapCollection(col, "", catalogById);
    createdId = result.id;

    if (payload.artwork) {
      const file = await artworkFileFromInput(payload.artwork);
      if (file) result = await uploadCollectionArtworkApi(result.id, file);
    }
    if (payload.mockups?.length) {
      const withMockups = await uploadCollectionMockupsApi(result.id, payload.mockups, catalogById);
      if (!withMockups) {
        throw new Error("Failed to save product mockups — try generating designs again");
      }
      result = withMockups;
    }
    const shopIds = [...new Set((payload.shopIds || []).filter(Boolean))];
    if (shopIds.length) {
      const published = await apiFetch<Record<string, unknown>>(
        `/collections/${result.id}/publish`,
        {
          method: "POST",
          body: JSON.stringify({ shopIds }),
        },
      );
      result = mapCollection(published, "", catalogById);
    }
    return result;
  } catch (err) {
    // Create runs before artwork/mockup/publish — remove the orphan so a failed
    // design never shows up in Branded Swag / shop UI.
    if (createdId) await rollbackFailedCollection(createdId);
    throw err;
  }
}

async function rollbackFailedCollection(collectionId: string): Promise<void> {
  try {
    await deleteCollectionApi(collectionId);
  } catch {
    // Best-effort cleanup; the original design error is still thrown.
  }
}

export async function getCampaignApi(campaignId: string) {
  const campaign = await apiFetch<Record<string, unknown>>(`/campaigns/${campaignId}`);
  return mapCampaign(campaign);
}

/** Ensure the wallet has a department entity campaigns can bill against. */
export async function ensureSpendEntityForWalletApi(walletId: string): Promise<string> {
  const entities = await apiFetch<Array<{ _id?: string; id?: string }>>(
    `/entities?walletId=${encodeURIComponent(walletId)}`,
  );
  if (entities.length) {
    const id = entities[0]._id ?? entities[0].id;
    if (id) return String(id);
  }

  const wallet = await apiFetch<{ name?: string }>(`/wallets/${walletId}`);
  const entity = await apiFetch<{ _id?: string; id?: string }>("/entities", {
    method: "POST",
    body: JSON.stringify({
      walletId,
      name: wallet.name?.trim() || "General",
      description: "Default department for campaign spending",
    }),
  });
  const id = entity._id ?? entity.id;
  if (!id) throw new Error("Could not resolve spend entity for wallet");
  return String(id);
}

export async function savePointsCampaignDraftApi(payload: {
  campaignId?: string;
  entityId: string;
  shopId: string;
  name: string;
  pointsScope?: "stadium" | "shop";
  creditsPerRecipient: number;
  message: { from: string; body: string };
  schedule?: { mode: "now" | "scheduled" | "self"; sendAt?: string | null; timezone?: string };
  draftState: {
    step: 0 | 1 | 2 | 3;
    selectedWalletId: string;
    selRecips: string[];
    recips: number;
    pay: "wallet" | "upi" | "card";
    preview: "landing" | "email";
    when: "now" | "scheduled" | "self";
  };
  recipients?: Array<{ name: string; email: string; phone?: string; contactId?: string }>;
}) {
  const campaign = await apiFetch<Record<string, unknown>>("/campaigns/points-draft", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return mapCampaign(campaign);
}

export async function deleteCampaignApi(campaignId: string) {
  return apiFetch<{ ok: boolean }>(`/campaigns/${campaignId}`, { method: "DELETE" });
}

export type CampaignRecipientRow = {
  _id?: string;
  name: string;
  email: string;
  creditAmount?: number;
  redemptionStatus?: string;
};

export async function fetchCampaignReportApi(campaignId: string) {
  return apiFetch<{ recipients: CampaignRecipientRow[] }>(`/campaigns/${campaignId}/report`);
}

export async function launchPointsCampaignApi(payload: {
  campaignId?: string;
  entityId: string;
  shopId: string;
  name: string;
  pointsScope?: "stadium" | "shop";
  creditsPerRecipient: number;
  totalBudget?: number;
  message: { from: string; body: string };
  schedule?: { mode: "now" | "scheduled" | "self"; sendAt?: string | null; timezone?: string };
  recipients: Array<{ name: string; email: string; phone?: string; contactId?: string }>;
  paymentMode?: "wallet" | "upi" | "card";
  razorpay?: {
    orderId: string;
    paymentId: string;
    signature?: string;
  };
}) {
  let campaignId = payload.campaignId;
  let existingStatus: string | undefined;
  const schedule = payload.schedule ?? { mode: "now" as const };
  const paymentMode = payload.paymentMode ?? "wallet";
  const razorpayBody =
    payload.razorpay && paymentMode !== "wallet"
      ? {
          razorpay_order_id: payload.razorpay.orderId,
          razorpay_payment_id: payload.razorpay.paymentId,
        }
      : {};

  if (campaignId) {
    const existing = await apiFetch<Record<string, unknown>>(`/campaigns/${campaignId}`);
    existingStatus = String(existing.status ?? "");
    await apiFetch(`/campaigns/${campaignId}`, {
      method: "PATCH",
      body: JSON.stringify({
        entityId: payload.entityId,
        shopId: payload.shopId,
        name: payload.name,
        pointsScope: payload.pointsScope ?? "shop",
        message: payload.message,
        schedule,
      }),
    });
  } else {
    const campaign = await apiFetch<Record<string, unknown>>("/campaigns", {
      method: "POST",
      body: JSON.stringify({
        entityId: payload.entityId,
        name: payload.name,
        type: "points",
        shopId: payload.shopId,
        pointsScope: payload.pointsScope ?? "shop",
        message: payload.message,
        schedule,
      }),
    });
    campaignId = String(campaign._id);
    existingStatus = String(campaign.status ?? "draft");
  }

  const canImport = !existingStatus || ["draft", "recipients_uploaded"].includes(existingStatus);
  if (canImport && payload.recipients.length) {
    await apiFetch(`/campaigns/${campaignId}/recipients/import`, {
      method: "POST",
      body: JSON.stringify({
        recipients: payload.recipients.map((r) => ({
          name: r.name,
          email: r.email,
          phone: r.phone || "",
          ...(r.contactId ? { contactId: r.contactId } : {}),
        })),
      }),
    });
    existingStatus = "recipients_uploaded";
  }

  if (!existingStatus || existingStatus === "recipients_uploaded" || existingStatus === "draft") {
    await apiFetch(`/campaigns/${campaignId}/allocate-credits`, {
      method: "POST",
      body: JSON.stringify({
        creditsPerRecipient: payload.creditsPerRecipient,
        ...(payload.totalBudget != null ? { totalBudget: payload.totalBudget } : {}),
        paymentMode,
        ...razorpayBody,
      }),
    });
  }

  const launched = await apiFetch<Record<string, unknown>>(`/campaigns/${campaignId}/launch`, {
    method: "POST",
    idempotencyKey: `launch-${campaignId}-${Date.now()}`,
    body: JSON.stringify({
      paymentMode,
      ...razorpayBody,
    }),
  });
  return mapCampaign(launched);
}

type KitCampaignPayload = {
  entityId: string;
  kitId: string;
  name: string;
  totalBudget?: number;
  packaging?: "none" | "box" | "wrap";
  fulfillmentMode?: "redeem" | "surprise" | "single";
  singleLocation?: {
    name: string;
    email: string;
    phone?: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
  };
  message: { from: string; body: string };
  schedule?: { mode: "now" | "scheduled" | "self"; sendAt?: string | null; timezone?: string };
  recipients: Array<{
    contactId?: string;
    name: string;
    email: string;
    phone?: string;
    variants?: Record<string, { size?: string; color?: string; variantImage?: string }>;
  }>;
  isSample?: boolean;
  brandingEnabled?: boolean;
  paymentMode?: "wallet" | "upi" | "card";
  razorpay?: {
    orderId: string;
    paymentId: string;
    signature?: string;
  };
};

async function createKitCampaignDraft(payload: KitCampaignPayload) {
  const paymentMode = payload.paymentMode ?? "wallet";
  const razorpayBody =
    payload.razorpay && paymentMode !== "wallet"
      ? {
          razorpay_order_id: payload.razorpay.orderId,
          razorpay_payment_id: payload.razorpay.paymentId,
        }
      : {};

  const campaign = await apiFetch<Record<string, unknown>>("/campaigns", {
    method: "POST",
    body: JSON.stringify({
      entityId: payload.entityId,
      name: payload.name,
      type: "kit",
      fulfillmentMode: payload.fulfillmentMode ?? "redeem",
      singleLocation: payload.singleLocation,
      kitId: payload.kitId,
      isSample: payload.isSample === true,
      brandingEnabled: payload.brandingEnabled === true,
      message: payload.message,
      schedule: payload.schedule ?? { mode: "now" },
    }),
  });
  const campaignId = String(campaign._id);

  if (payload.recipients.length) {
    await apiFetch(`/campaigns/${campaignId}/recipients/import`, {
      method: "POST",
      body: JSON.stringify({
        recipients: payload.recipients.map((r) => ({
          contactId: r.contactId,
          name: r.name,
          email: r.email,
          phone: r.phone || "",
          variants: r.variants,
        })),
        ...(payload.totalBudget != null ? { totalBudget: payload.totalBudget } : {}),
        ...(payload.packaging === "none" || payload.packaging === "box" || payload.packaging === "wrap"
          ? { packaging: payload.packaging }
          : {}),
        paymentMode,
        ...razorpayBody,
      }),
    });
  }

  return { campaign, campaignId, paymentMode, razorpayBody };
}

/** Create a kit campaign draft (and import recipients) without launching. */
export async function saveKitCampaignDraftApi(payload: KitCampaignPayload) {
  const { campaign } = await createKitCampaignDraft({
    ...payload,
    // Drafts always attach as wallet-mode; payment is collected at launch.
    paymentMode: "wallet",
    razorpay: undefined,
  });
  return mapCampaign(campaign);
}

export async function launchKitCampaignApi(payload: KitCampaignPayload) {
  const { campaignId, paymentMode, razorpayBody } = await createKitCampaignDraft(payload);

  const launched = await apiFetch<Record<string, unknown>>(`/campaigns/${campaignId}/launch`, {
    method: "POST",
    idempotencyKey: `launch-kit-${campaignId}-${Date.now()}`,
    body: JSON.stringify({
      paymentMode,
      ...razorpayBody,
    }),
  });
  return mapCampaign(launched);
}

export type OrgWizardInvite = {
  email: string;
  name: string;
  entityName: string;
  inviteToken?: string;
};

type ApiEntityRow = {
  _id?: string;
  id?: string;
  name?: string;
  walletId?: string;
  allocatedAmount?: number;
  managerEmail?: string;
  managerName?: string;
  managerUserId?: { email?: string } | string;
};

export async function fundWalletApi(
  walletId: string,
  payload: {
    amount: number;
    description?: string;
    fundingMethod?: "po_upload" | "online";
    docType?: string;
    docNumber?: string;
  },
): Promise<{ pending?: boolean; wallet?: { balance?: number }; transaction?: { _id?: string } }> {
  return apiFetch(`/wallets/${walletId}/fund`, {
    method: "POST",
    idempotencyKey: `fund-${walletId}-${payload.amount}-${Date.now()}`,
    body: JSON.stringify({
      amount: payload.amount,
      description: payload.description || "Wallet top-up",
      fundingMethod: payload.fundingMethod,
      docType: payload.docType,
      docNumber: payload.docNumber,
    }),
  });
}

export type RazorpayOrderResult = {
  orderId: string;
  amount: number;
  amountPaise: number;
  currency: string;
  keyId: string;
  paymentId: string;
  walletId: string;
};

export async function createRazorpayOrderApi(
  walletId: string,
  amount: number,
  purpose: "wallet_funding" | "campaign_spend" = "wallet_funding",
): Promise<RazorpayOrderResult> {
  return apiFetch("/payments/razorpay/order", {
    method: "POST",
    idempotencyKey: `rzp-order-${walletId}-${amount}-${purpose}-${Date.now()}`,
    body: JSON.stringify({ walletId, amount, purpose }),
  });
}

export type VerifyRazorpayPaymentResult = {
  verified: boolean;
  idempotent?: boolean;
  paymentId: string;
  walletId: string;
  amount: number;
  status: string;
  pendingApproval?: boolean;
  invoiceId?: string;
};

export async function verifyRazorpayPaymentApi(payload: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): Promise<VerifyRazorpayPaymentResult> {
  return apiFetch("/payments/razorpay/verify", {
    method: "POST",
    idempotencyKey: `rzp-verify-${payload.razorpay_payment_id}`,
    body: JSON.stringify(payload),
  });
}

export type WalletTransactionRow = {
  _id?: string;
  type: string;
  amount: number;
  balanceAfter?: number;
  availableAfter?: number;
  relatedEntityId?: string;
  description?: string;
  createdAt?: string;
};

export async function fetchWalletTransactionsApi(
  walletId: string,
  limit = 20,
): Promise<WalletTransactionRow[]> {
  const res = await apiFetch<{ items?: WalletTransactionRow[] }>(
    `/wallets/${walletId}/transactions?limit=${limit}`,
  );
  return res.items ?? [];
}

export async function fetchEntityTransactionsApi(
  entityId: string,
  limit = 50,
): Promise<WalletTransactionRow[]> {
  const res = await apiFetch<{ items?: WalletTransactionRow[] }>(
    `/entities/${entityId}/transactions?limit=${limit}`,
  );
  return res.items ?? [];
}

export async function syncOrgWizardApi(
  org: OrgWizardState,
): Promise<{ walletId: string; invites: OrgWizardInvite[] }> {
  const walletId = org.wallet.id?.trim();
  if (!walletId || !MONGO_ID.test(walletId)) {
    throw new Error("No wallet found. Create and fund your wallet first.");
  }
  const defaultWalletId = walletId;
  const allocationsByWallet = new Map<string, Array<{ entityId: string; amount: number }>>();
  const walletsToActivate = new Set<string>();
  const invites: OrgWizardInvite[] = [];
  /** Entities created during this sync — rolled back if finish fails mid-way. */
  const createdEntityIds = new Set<string>();

  const pushAllocation = (walletId: string, entityId: string, amount: number) => {
    if (amount === 0) return;
    const list = allocationsByWallet.get(walletId) ?? [];
    list.push({ entityId, amount });
    allocationsByWallet.set(walletId, list);
    walletsToActivate.add(walletId);
  };

  const isIncompleteEntity = (entity: ApiEntityRow) => {
    const allocated = Number(entity.allocatedAmount ?? 0);
    const mgrRef = entity.managerUserId;
    const mgrEmail = String(
      entity.managerEmail ??
        (mgrRef && typeof mgrRef === "object" ? mgrRef.email : "") ??
        "",
    ).trim();
    return allocated <= 0 && !mgrRef && !mgrEmail;
  };

  const deleteIfIncomplete = async (entityId: string) => {
    if (!MONGO_ID.test(entityId)) return;
    try {
      const entity = await apiFetch<ApiEntityRow>(`/entities/${entityId}`);
      if (!isIncompleteEntity(entity)) return;
      await apiFetch(`/entities/${entityId}`, { method: "DELETE" });
    } catch {
      // Best-effort rollback — original error is still thrown to the caller.
    }
  };

  /** Remove stub departments left behind when allocate/invite fails. */
  const rollbackFailedAllocation = async (candidateIds: Iterable<string>) => {
    const ids = new Set([...candidateIds, ...createdEntityIds]);
    await Promise.all([...ids].map((id) => deleteIfIncomplete(id)));
  };

  const allocationDeltas: Array<{
    walletId: string;
    entityId: string;
    delta: number;
    target: number;
  }> = [];
  const plannedAllocations: Array<{ entityId: string; amount: number }> = [];

  const allEntities = await apiFetch<ApiEntityRow[]>("/entities");
  const walletEntities = (allEntities ?? []).filter(
    (entity) => normalizeMongoId(entity.walletId) === defaultWalletId,
  );
  const entityByName = new Map<string, ApiEntityRow>();
  for (const entity of walletEntities ?? []) {
    const name = String(entity.name ?? "").trim().toLowerCase();
    if (name) entityByName.set(name, entity);
  }
  const managerEmailOf = (entity: ApiEntityRow) => {
    const mgrRef = entity.managerUserId;
    const populated = mgrRef && typeof mgrRef === "object" ? mgrRef.email : "";
    return String(entity.managerEmail ?? populated ?? "").trim().toLowerCase();
  };
  const identityKey = (name?: string, email?: string) => {
    const n = String(name ?? "").trim().toLowerCase();
    const e = String(email ?? "").trim().toLowerCase();
    return n && e ? `${n}|${e}` : "";
  };
  const entityByDepartmentManager = new Map<string, ApiEntityRow>();
  for (const entity of walletEntities ?? []) {
    const key = identityKey(entity.name, managerEmailOf(entity));
    if (key) entityByDepartmentManager.set(key, entity);
  }

  const entityBelongsToWallet = (entity: ApiEntityRow) =>
    normalizeMongoId(entity.walletId) === defaultWalletId;

  type EntityPlan = {
    dept: (typeof org.departments)[number];
    entityId: string;
    target: number;
    currentAllocated: number;
  };
  const entityPlans = new Map<string, EntityPlan>();

  try {
    for (const dept of org.departments) {
      const existingId = String(dept.id);
      const isMongoId = MONGO_ID.test(existingId);
      let entityId = isMongoId ? existingId : "";
      let currentAllocated = 0;

      if (entityId) {
        const entity = await apiFetch<ApiEntityRow>(`/entities/${entityId}`);
        const entityWalletId = normalizeMongoId(entity.walletId);
        if (entityWalletId && entityWalletId !== defaultWalletId) {
          entityId = "";
          currentAllocated = 0;
        } else {
          currentAllocated = Number(entity.allocatedAmount ?? 0);
          await apiFetch(`/entities/${entityId}`, {
            method: "PATCH",
            body: JSON.stringify({
              name: dept.name,
              description: dept.desc || "",
              colorHex: dept.color || "#2563EB",
              expectedUsers: dept.users || 0,
              managerEmail: entity.managerEmail,
              managerName: entity.managerName,
            }),
          });
        }
      }

      if (!entityId) {
        const byIdentity = entityByDepartmentManager.get(
          identityKey(dept.name, dept.mgr?.email),
        );
        const byName = byIdentity ?? entityByName.get(dept.name.trim().toLowerCase());
        if (byName && entityBelongsToWallet(byName)) {
          entityId = normalizeMongoId(byName._id ?? byName.id);
          currentAllocated = Number(byName.allocatedAmount ?? 0);
          await apiFetch(`/entities/${entityId}`, {
            method: "PATCH",
            body: JSON.stringify({
              name: dept.name,
              description: dept.desc || "",
              colorHex: dept.color || "#2563EB",
              expectedUsers: dept.users || 0,
            }),
          });
        }
      }

      if (!entityId) {
        const entity = await apiFetch<ApiEntityRow>("/entities", {
          method: "POST",
          body: JSON.stringify({
            walletId: defaultWalletId,
            name: dept.name,
            description: dept.desc || "",
            colorHex: dept.color || "#2563EB",
            expectedUsers: dept.users || 0,
          }),
        });
        entityId = normalizeMongoId(entity._id ?? entity.id);
        createdEntityIds.add(entityId);
      }

      const selected = (dept as { selected?: boolean }).selected !== false;
      if (!selected) continue;

      const target = Number(dept.allocated) || 0;
      const prev = entityPlans.get(entityId);
      if (!prev) {
        entityPlans.set(entityId, { dept, entityId, target, currentAllocated });
      }
    }

    for (const { dept, entityId, target, currentAllocated } of entityPlans.values()) {
      const mgrEmail = dept.mgr?.email?.trim();
      if (mgrEmail) {
        const mgrName = dept.mgr.name?.trim() || mgrEmail.split("@")[0] || "Manager";
        const res = await apiFetch<{
          manager?: { email?: string };
          inviteToken?: string;
        }>(`/entities/${entityId}/assign-manager`, {
          method: "POST",
          body: JSON.stringify({
            name: mgrName,
            email: mgrEmail,
            role: dept.mgr.role || "",
            mobile: dept.mgr.mobile || "",
            sendInvite: dept.mgr.inviteStatus !== "active" && dept.mgr.invite !== false,
          }),
        });
        if (dept.mgr.invite !== false && dept.mgr.inviteStatus !== "active") {
          invites.push({
            email: mgrEmail,
            name: mgrName,
            entityName: dept.name,
            inviteToken: res.inviteToken,
          });
        }
      } else if (dept.mgr?.name?.trim() || dept.mgr?.role?.trim()) {
        await apiFetch(`/entities/${entityId}`, {
          method: "PATCH",
          body: JSON.stringify({
            managerName: dept.mgr.name?.trim() || "",
            managerTitle: dept.mgr.role || "",
          }),
        });
      }

      if (target > 0) {
        plannedAllocations.push({ entityId, amount: target });
      }

      const delta = target - currentAllocated;
      if (delta !== 0) {
        allocationDeltas.push({ walletId: defaultWalletId, entityId, delta, target });
      }
    }

    allocationDeltas.sort((a, b) => a.delta - b.delta);
    for (const { walletId, entityId, delta } of allocationDeltas) {
      pushAllocation(walletId, entityId, delta);
    }

    const walletMeta = await apiFetch<{
      fundingMethod?: string;
      fundingDocument?: { approvalStatus?: string };
    }>(`/wallets/${defaultWalletId}`);
    const poPending =
      walletMeta.fundingMethod === "po_upload" &&
      walletMeta.fundingDocument?.approvalStatus === "pending";

    if (poPending) {
      if (plannedAllocations.length > 0) {
        await apiFetch(`/wallets/${defaultWalletId}`, {
          method: "PATCH",
          body: JSON.stringify({
            fundingDocument: { plannedAllocations },
          }),
        });
      }
      return { walletId: defaultWalletId, invites };
    }

    for (const [walletId, allocations] of allocationsByWallet) {
      if (!allocations.length) continue;
      const ordered = [...allocations].sort((a, b) => a.amount - b.amount);
      // Key by target totals so retries of the same finish are safe, but a new
      // top-up to a different target (e.g. another +₹500) is never deduped away.
      const targetKey = allocationDeltas
        .filter((d) => d.walletId === walletId)
        .map((d) => `${d.entityId}:to:${d.target}`)
        .sort()
        .join("|");
      await apiFetch(`/wallets/${walletId}/allocate`, {
        method: "POST",
        idempotencyKey: `alloc-${walletId}-${targetKey || ordered.map((a) => `${a.entityId}:${a.amount}`).join("|")}`,
        body: JSON.stringify({ allocations: ordered }),
      });
    }

    for (const walletId of walletsToActivate) {
      await apiFetch(`/wallets/${walletId}/activate`, { method: "POST" });
    }

    return { walletId: defaultWalletId, invites };
  } catch (err) {
    await rollbackFailedAllocation(entityPlans.keys());
    // Also clear any other stub departments left on this wallet from a prior failed run.
    try {
      const fresh = await apiFetch<ApiEntityRow[]>("/entities");
      const stubs = (fresh ?? [])
        .filter((e) => normalizeMongoId(e.walletId) === defaultWalletId && isIncompleteEntity(e))
        .map((e) => normalizeMongoId(e._id ?? e.id));
      await Promise.all(stubs.map((id) => deleteIfIncomplete(id)));
    } catch {
      // Best-effort.
    }
    throw err;
  }
}
