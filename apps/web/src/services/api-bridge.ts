/**
 * Typed API helpers shared by React features and public surfaces.
 */
import { ApiError, apiFetch, publicFetch } from "./api";
import {
  clearSession,
  getStoredUser,
  isAuthenticated,
  isPlatformUser,
  setSession,
  type AuthUser,
} from "./auth-store";
import { USE_MOCKS } from "./config";
import {
  createCollectionApi,
  createKitApi,
  ensureCuratedKitApi,
  updateCollectionApi,
  updateKitApi,
  uploadCollectionArtworkApi,
  uploadCollectionMockupsApi,
  uploadKitArtworkApi,
  uploadKitMockupsApi,
  prepareArtworkUploadFile,
  launchKitCampaignApi,
  saveKitCampaignDraftApi,
  launchPointsCampaignApi,
  linkCollectionToShopApi,
  archiveCollectionApi,
  restoreCollectionApi,
  deleteCollectionApi,
  addProductToShopApi,
  syncOrgWizardApi,
} from "./mutations-api";
import type { UiCollection } from "./mappers";
import { mapCatalogProduct } from "./mappers";
import {
  createContactsApi,
  createShopApi,
  deleteContactApi,
  fetchContactsImportStatusApi,
  fetchWorkspaceSnapshot,
  listContactsApi,
  publishShopApi,
  updateContactApi,
  updateShopApi,
  uploadContactsImportApi,
  uploadShopAssetApi,
  type ContactImportStatus,
  type WorkspaceSnapshot,
} from "./workspace-api";
import type { UiContact, UiProduct } from "./mappers";

export { ApiError, getStoredUser, isAuthenticated, isPlatformUser };
export { listContactsApi };
export type { AuthUser };

export function useMocks(): boolean {
  return USE_MOCKS;
}

type AuthResult = {
  accessToken: string;
  user: Parameters<typeof setSession>[0]["user"];
};

async function establishSession(result: AuthResult) {
  setSession(result);
  return result.user;
}

const DEMO_EMAIL = "hr@rubix.net";
const DEMO_PASSWORD = "demo1234";

const DEMO_SESSION: AuthResult = {
  accessToken: "demo-access-token",
  user: {
    id: "demo-hr-rubix",
    tenantId: "demo-tenant",
    name: "Chandra Sekhar",
    email: DEMO_EMAIL,
    role: "company_admin",
    scopeType: "tenant",
    assignedEntityIds: [],
  },
};

/** One-click entry from the marketing site — no login screen. */
export async function enterApp(): Promise<void> {
  if (isAuthenticated()) return;
  if (USE_MOCKS) {
    setSession(DEMO_SESSION);
    return;
  }
  try {
    await login(DEMO_EMAIL, DEMO_PASSWORD);
  } catch {
    if (import.meta.env.DEV) {
      setSession(DEMO_SESSION);
      return;
    }
    throw new Error("Could not sign in. Start the API and run npm run seed.");
  }
}

export async function login(email: string, password: string) {
  const result = await apiFetch<AuthResult>("/auth/login", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  return establishSession(result);
}

export async function requestPasswordReset(email: string) {
  return apiFetch<{ success: boolean; message: string }>("/auth/forgot-password", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
}

export async function validatePasswordResetToken(token: string) {
  const params = new URLSearchParams({ token });
  return apiFetch<{ valid: boolean; email?: string; reason?: string | null }>(
    `/auth/reset-password/validate?${params.toString()}`,
    { auth: false },
  );
}

export async function resetPasswordWithToken(token: string, newPassword: string) {
  return apiFetch<{ success: boolean }>("/auth/reset-password", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ token, newPassword }),
  });
}

export async function register(payload: {
  name: string;
  email: string;
  password: string;
  companyName: string;
}) {
  const result = await apiFetch<AuthResult>("/auth/register", {
    method: "POST",
    auth: false,
    body: JSON.stringify(payload),
  });
  return establishSession(result);
}

export type SignupStartResult = {
  pendingId: string;
  email: string;
  emailMasked: string;
  otpExpiresInSec: number;
  resendAvailableInSec: number;
};

/** Begin email/password signup — sends OTP; does not create the user yet. */
export async function startSignup(payload: {
  name: string;
  email: string;
  password: string;
  companyName: string;
}) {
  return apiFetch<SignupStartResult>("/auth/signup/start", {
    method: "POST",
    auth: false,
    body: JSON.stringify({
      ...payload,
      email: payload.email.trim().toLowerCase(),
    }),
  });
}

export async function resendSignupOtp(pendingId: string) {
  return apiFetch<SignupStartResult>("/auth/signup/resend", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ pendingId }),
  });
}

export async function verifySignupOtp(pendingId: string, otp: string) {
  const result = await apiFetch<AuthResult>("/auth/signup/verify", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ pendingId, otp }),
  });
  return establishSession(result);
}

/** Redirect browser to Google OAuth (login or signup). */
export function startGoogleAuth(mode: "login" | "signup" = "login") {
  const params = new URLSearchParams({ mode });
  window.location.assign(`/api/v1/auth/google?${params.toString()}`);
}

/** Current device, or every device when `everywhere` is set (bumps sessionVersion). */
export async function logout(options?: { everywhere?: boolean }) {
  const everywhere = Boolean(options?.everywhere);
  try {
    await apiFetch("/auth/logout", {
      method: "POST",
      auth: everywhere,
      body: JSON.stringify({ everywhere }),
    });
  } catch {
    /* still leave the app */
  }
  clearSession();
  window.location.assign("/");
}

export async function logoutEverywhere() {
  return logout({ everywhere: true });
}

export async function tryRestoreSession(): Promise<WorkspaceSnapshot | "platform" | null> {
  if (!isAuthenticated()) return null;
  const me = getStoredUser();
  if (isPlatformUser(me)) return "platform";
  try {
    return await fetchWorkspaceSnapshot(me);
  } catch {
    return null;
  }
}

export async function hydrateWorkspace(sessionUser?: AuthUser | null): Promise<WorkspaceSnapshot> {
  return fetchWorkspaceSnapshot(sessionUser);
}

/** Fresh catalog from DB — call when opening the Catalog page. */
export type CatalogProductsResult = {
  items: UiProduct[];
  total: number;
};

export async function refreshCatalogProducts(category?: string): Promise<CatalogProductsResult> {
  const params = new URLSearchParams({ limit: "100" });
  if (category) params.set("category", category);
  type CatalogPage = {
    items: unknown[];
    pagination?: { total?: number; limit?: number };
  };
  const catalog = await apiFetch<CatalogPage>(`/catalog/products?${params.toString()}`);
  const allItems = [...(catalog.items || [])];
  const total = catalog.pagination?.total ?? allItems.length;
  const pageSize = catalog.pagination?.limit ?? allItems.length;
  // Category filtering runs in the browser, so include every page in the parent.
  // Fetch in small groups to avoid flooding the API for large catalogs.
  const pages = pageSize > 0 ? Math.ceil(total / pageSize) : 1;
  for (let start = 2; start <= pages; start += 4) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(4, pages - start + 1) }, (_, index) => {
        const pageParams = new URLSearchParams(params);
        pageParams.set("page", String(start + index));
        return apiFetch<CatalogPage>(`/catalog/products?${pageParams.toString()}`);
      }),
    );
    for (const page of batch) allItems.push(...(page.items || []));
  }
  const items = allItems.map((p) => mapCatalogProduct(p));
  return {
    items,
    total: catalog.pagination?.total ?? items.length,
  };
}

export async function fetchCatalogProduct(id: string) {
  const product = await apiFetch<unknown>(`/catalog/products/${id}`);
  return mapCatalogProduct(product);
}

/** Active platform-curated kits for tenant kit templates. */
export type PlatformKitTemplate = {
  _id: string;
  name: string;
  description?: string;
  packaging?: "none" | "box" | "premium_box";
  imageUrls?: string[];
  heroImage?: string;
  galleryImages?: string[];
  itemImages?: Array<{ imageUrl: string; label?: string }>;
  variantImages?: Array<{ imageUrl: string; label?: string }>;
  approxValueInr?: number;
  items?: Array<{ catalogProductId: string; qty?: number }>;
  status?: string;
  rules?: {
    fixedComposition?: boolean;
    customizationAllowed?: boolean;
    /** Default true — when false, Send Kit skips the logo step for this curated kit. */
    requireLogo?: boolean;
    minQtyPerRecipient?: number;
    maxQtyPerRecipient?: number;
  };
};

export async function refreshPlatformKits(): Promise<PlatformKitTemplate[]> {
  return apiFetch<PlatformKitTemplate[]>("/catalog/kits");
}

/** Single active platform kit (includes rules.requireLogo) — fresh read for send flow. */
export async function refreshPlatformKit(id: string): Promise<PlatformKitTemplate> {
  return apiFetch<PlatformKitTemplate>(`/catalog/kits/${encodeURIComponent(id)}`);
}

/** Active platform kits for public catalog browse (no tenant auth required). */
export async function refreshCatalogKitsPublic(): Promise<PlatformKitTemplate[]> {
  return publicFetch<PlatformKitTemplate[]>("/catalog/kits/public");
}

export type PublicCatalogCategory = {
  _id: string;
  name: string;
  slug: string;
  sortOrder: number;
  description?: string;
  children: PublicCatalogCategory[];
  /** Client-side browse adapter only; absent from the API/database. */
  productScope?: string;
};

/** Active Parent → Category → Sub-Category tree for public catalog browse. */
export async function fetchPublicCatalogCategories(): Promise<PublicCatalogCategory[]> {
  return publicFetch<PublicCatalogCategory[]>("/catalog/categories");
}

/** Apply a workspace snapshot onto the legacy shelf-merch.js global state object. */
export function applyWorkspaceToState(S: Record<string, unknown>, data: WorkspaceSnapshot) {
  const prevOrg = (S.org ?? {}) as {
    step?: number;
    seq?: number;
    inWizard?: boolean;
    _c?: number;
  };
  S.account = data.account;
  S.user = {
    ...data.userPatch,
    email: data.userPatch.email,
    role: data.userPatch.role || "company_admin",
  };
  S.shops = data.shops;
  S.contacts = data.contacts;
  S.kits = data.kits;
  S.collections = data.collections;
  S.catalogProducts = data.catalogProducts;
  S.catalogTotal = data.catalogTotal;
  S.campaigns = data.campaigns;
  S.orders = data.orders;
  S.wallets = data.wallets;
  S.primaryEntityId = data.primaryEntityId;
  // Replace org data from API; keep only in-progress wizard navigation state.
  S.org = {
    step: prevOrg.step ?? 1,
    seq: prevOrg.seq ?? 6,
    _c: prevOrg._c,
    ...data.org,
    // Preserve in-progress wizard navigation state over the API snapshot.
    inWizard: prevOrg.inWizard ?? false,
  };
}

export { fetchPlatformDashboard } from "./platform-api";

/** Turn in-memory data:/blob: images into hosted `/uploads/…` URLs before JSON save. */
async function persistShopImageUrl(
  url: string | undefined,
  kind: "logo" | "banner",
  name: string,
): Promise<string> {
  if (!url) return "";
  if (!url.startsWith("data:") && !url.startsWith("blob:")) return url;
  const file = await prepareArtworkUploadFile({ preview: url, name });
  if (!file) {
    throw new Error(
      kind === "logo"
        ? "Could not prepare logo for upload. Try re-uploading your logo"
        : "Could not prepare banner for upload. Try re-uploading your banner",
    );
  }
  return uploadShopAssetApi(file, kind);
}

async function persistShopLookMedia(payload: {
  logoUrl?: string;
  bannerConfig?: Record<string, unknown>;
}): Promise<{ logoUrl?: string; bannerConfig?: Record<string, unknown> }> {
  const logoUrl =
    payload.logoUrl !== undefined
      ? await persistShopImageUrl(payload.logoUrl, "logo", "shop-logo")
      : undefined;

  let bannerConfig = payload.bannerConfig;
  if (bannerConfig && typeof bannerConfig.imageUrl === "string") {
    const imageUrl = await persistShopImageUrl(bannerConfig.imageUrl, "banner", "shop-banner");
    bannerConfig = { ...bannerConfig, imageUrl };
  }

  return { logoUrl, bannerConfig };
}

export async function createShopFlow(payload: {
  name: string;
  currency: string;
  categories: string[];
  companyEmailDomain?: string;
  logoUrl?: string;
  bannerConfig?: Record<string, unknown>;
}) {
  const currencyMode = payload.currency === "INR" ? "inr" : "points";
  const look = await persistShopLookMedia({
    logoUrl: payload.logoUrl || "",
    bannerConfig: payload.bannerConfig || {},
  });
  const draft = await createShopApi({
    name: payload.name,
    currencyMode,
    categories: payload.categories,
    companyEmailDomain: payload.companyEmailDomain || "",
    logoUrl: look.logoUrl || "",
    bannerConfig: look.bannerConfig || {},
  });
  return publishShopApi(draft.id);
}

export async function updateShopFlow(
  shopId: string,
  payload: {
    name?: string;
    currencyMode?: "points" | "inr";
    pointsConversionEnabled?: boolean;
    companyEmailDomain?: string;
    logoUrl?: string;
    bannerConfig?: Record<string, unknown>;
    categories?: string[];
    selectedCatalogProductIds?: string[];
    featuredCatalogProductIds?: string[];
    activeListingKeys?: string[];
    featuredListingKeys?: string[];
  },
) {
  const look = await persistShopLookMedia({
    logoUrl: payload.logoUrl,
    bannerConfig: payload.bannerConfig,
  });
  return updateShopApi(shopId, {
    ...payload,
    ...(look.logoUrl !== undefined ? { logoUrl: look.logoUrl } : {}),
    ...(look.bannerConfig !== undefined ? { bannerConfig: look.bannerConfig } : {}),
  });
}

export async function addContactsFlow(emails: string[], role: string) {
  const entries = emails.map((email) => ({
    email,
    name: email.split("@")[0] || email,
    role,
  }));
  return createContactsApi(entries);
}

export async function addContactFlow(payload: {
  name: string;
  email: string;
  phone?: string;
  role: string;
  department?: string;
  employeeCode?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
  };
}) {
  const result = await createContactsApi([payload]);
  return result[0];
}

export async function updateContactFlow(
  contactId: string,
  payload: {
    name?: string;
    email?: string;
    phone?: string;
    role?: string;
    department?: string;
    employeeCode?: string;
    address?: {
      line1?: string;
      city?: string;
      state?: string;
      pincode?: string;
      country?: string;
    };
  },
): Promise<UiContact> {
  return updateContactApi(contactId, payload);
}

export async function deleteContactFlow(contactId: string): Promise<void> {
  await deleteContactApi(contactId);
}

export type { ContactImportStatus };

export async function importContactsFlow(
  file: File,
  onStatus?: (status: ContactImportStatus) => void,
): Promise<ContactImportStatus> {
  const { importJobId } = await uploadContactsImportApi(file);
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const status = await fetchContactsImportStatusApi(importJobId);
    onStatus?.(status);
    if (status.status === "done" || status.status === "failed") return status;
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  throw new Error("Import is taking longer than expected. Please try again in a moment.");
}

export async function refreshContactsFlow(): Promise<UiContact[]> {
  return listContactsApi();
}

export async function createKitFlow(payload: {
  name: string;
  description?: string;
  pickedIndices: number[];
  catalog: UiProduct[];
  packaging: string;
  designNotes?: string;
  kitPrice?: number;
  artwork?: { file?: File; preview?: string; name?: string };
  mockups?: Array<{ catalogProductId: string; dataUrl: string }>;
}) {
  const createOnce = () =>
    createKitApi({
      ...payload,
      packaging: payload.packaging === "box" ? "box" : "none",
    });

  // Retry briefly on gateway blips (API restart / proxy 502).
  let kit = await createOnce().catch(async (err) => {
    const status = err && typeof err === "object" && "status" in err ? Number(err.status) : 0;
    if (status !== 502 && status !== 503) throw err;
    await new Promise((r) => setTimeout(r, 800));
    return createOnce();
  });

  if (payload.artwork) {
    const file = await prepareArtworkUploadFile(payload.artwork);
    if (!file) {
      throw new Error("Could not prepare artwork for upload. Try re-uploading your logo");
    }
    kit = await uploadKitArtworkApi(kit.id, file);
  }
  if (payload.mockups?.length) {
    const withMockups = await uploadKitMockupsApi(kit.id, payload.mockups);
    if (!withMockups) {
      throw new Error("Failed to save product mockups. Try publishing again");
    }
    kit = withMockups;
  }
  return kit;
}

/** Clone (or reuse) a curated platform kit for the send workflow. */
export async function ensureCuratedKitFlow(
  platformKitId: string,
  productRefs?: Array<{
    catalogProductId: string;
    brand?: string;
    name: string;
    group?: string;
  }>,
) {
  return ensureCuratedKitApi(platformKitId, productRefs);
}

export async function updateKitFlow(payload: {
  id: string;
  name?: string;
  pickedIndices: number[];
  catalog: UiProduct[];
  packaging?: string;
  designNotes?: string;
  artwork?: { file?: File; preview?: string; name?: string };
  status?: string;
}) {
  let kit = await updateKitApi({
    ...payload,
    packaging: payload.packaging === "box" ? "box" : payload.packaging === "none" ? "none" : undefined,
  });
  if (payload.artwork) {
    const file = await prepareArtworkUploadFile(payload.artwork);
    if (!file) {
      throw new Error("Could not prepare artwork for upload. Try re-uploading your logo");
    }
    kit = await uploadKitArtworkApi(kit.id, file);
  }
  return kit;
}

/** Upload logo/artwork onto an existing kit without a metadata PATCH (campaignOps-safe). */
export async function uploadKitArtworkFlow(
  kitId: string,
  artwork: { file?: File; preview?: string; name?: string },
) {
  const file = await prepareArtworkUploadFile(artwork);
  if (!file) throw new Error("No artwork file to upload");
  return uploadKitArtworkApi(kitId, file);
}

export async function createCollectionFlow(payload: {
  shopId?: string;
  shopIds?: string[];
  name: string;
  pickedIndices: number[];
  catalog: UiProduct[];
  preferredColors?: string[];
  artwork?: { file?: File; preview?: string; name?: string };
  mockups?: Array<{ catalogProductId: string; dataUrl: string }>;
}) {
  return createCollectionApi(payload);
}

export async function updateCollectionFlow(payload: {
  collectionId: string;
  name: string;
  pickedIndices: number[];
  catalog: UiProduct[];
  artwork?: { file?: File; preview?: string; name?: string };
  mockups?: Array<{ catalogProductId: string; dataUrl: string }>;
}) {
  return updateCollectionApi(payload);
}

export async function updateCollectionArtworkFlow(payload: {
  collectionId: string;
  artwork: { file: File };
  mockups?: Array<{ catalogProductId: string; dataUrl: string }>;
  catalog?: UiProduct[];
}) {
  let collection = await uploadCollectionArtworkApi(payload.collectionId, payload.artwork.file);
  if (payload.mockups?.length) {
    const catalogById = payload.catalog
      ? new Map(payload.catalog.filter((p) => p.id).map((p) => [p.id as string, p]))
      : undefined;
    const withMockups = await uploadCollectionMockupsApi(
      payload.collectionId,
      payload.mockups,
      catalogById,
    );
    if (withMockups) collection = withMockups;
  }
  return collection;
}

export async function linkCollectionToShopFlow(collectionId: string, shopId: string) {
  return linkCollectionToShopApi(collectionId, shopId);
}

export async function archiveCollectionFlow(collectionId: string) {
  return archiveCollectionApi(collectionId);
}

export async function restoreCollectionFlow(collectionId: string) {
  return restoreCollectionApi(collectionId);
}

export async function deleteCollectionFlow(collectionId: string) {
  return deleteCollectionApi(collectionId);
}

export async function addProductToShopFlow(payload: {
  shopId: string;
  collection: UiCollection;
  product: UiProduct;
  catalog: UiProduct[];
}) {
  return addProductToShopApi(payload);
}

export async function launchPointsCampaignFlow(payload: {
  campaignId?: string;
  entityId: string;
  shopId: string;
  name: string;
  pointsScope?: "stadium" | "shop";
  creditsPerRecipient: number;
  totalBudget?: number;
  message: { from: string; body: string };
  schedule?: { mode: "now" | "scheduled" | "self"; sendAt?: string | null; timezone?: string };
  contactIds: string[];
  contacts: Array<{ id: string; name: string; email: string; phone?: string }>;
  paymentMode?: "wallet" | "upi" | "card";
  razorpay?: {
    orderId: string;
    paymentId: string;
    signature?: string;
  };
}) {
  const recipients = payload.contactIds
    .map((id) => {
      if (id.startsWith("email:")) {
        const email = id.slice(6);
        return {
          name: email.split("@")[0] || email,
          email,
        };
      }
      const contact = payload.contacts.find((c) => c.id === id);
      if (!contact) return null;
      return {
        contactId: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
      };
    })
    .filter(Boolean)
    .map((r) => r!);
  if (!recipients.length) throw new Error("Select at least one recipient");
  return launchPointsCampaignApi({
    campaignId: payload.campaignId,
    entityId: payload.entityId,
    shopId: payload.shopId,
    name: payload.name,
    pointsScope: payload.pointsScope,
    creditsPerRecipient: payload.creditsPerRecipient,
    totalBudget: payload.totalBudget,
    message: payload.message,
    schedule: payload.schedule,
    recipients,
    paymentMode: payload.paymentMode,
    razorpay: payload.razorpay,
  });
}

export async function launchKitCampaignFlow(payload: {
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
  contactIds: string[];
  contacts: Array<{ id: string; name: string; email: string; phone?: string }>;
  recipVariants?: Record<string, Record<string, { size?: string; color?: string; variantImage?: string }>>;
  isSample?: boolean;
  brandingEnabled?: boolean;
  paymentMode?: "wallet" | "upi" | "card";
  razorpay?: {
    orderId: string;
    paymentId: string;
    signature?: string;
  };
}) {
  const recipients = payload.contactIds
    .map((id) => {
      if (id.startsWith("email:")) {
        const email = id.slice("email:".length);
        const extra = payload.contacts.find((c) => c.id === id || c.email === email);
        return {
          name: extra?.name || email.split("@")[0] || email,
          email,
          phone: extra?.phone,
          variants: payload.recipVariants?.[id],
        };
      }
      const contact = payload.contacts.find((c) => c.id === id);
      if (!contact) return null;
      return {
        contactId: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        variants: payload.recipVariants?.[contact.id],
      };
    })
    .filter(Boolean)
    .map((r) => r!);
  if (!recipients.length) throw new Error("Select at least one recipient");
  return launchKitCampaignApi({
    entityId: payload.entityId,
    kitId: payload.kitId,
    name: payload.name,
    totalBudget: payload.totalBudget,
    packaging: payload.packaging,
    fulfillmentMode: payload.fulfillmentMode,
    singleLocation: payload.singleLocation,
    message: payload.message,
    schedule: payload.schedule,
    recipients,
    isSample: payload.isSample,
    brandingEnabled: payload.brandingEnabled,
    paymentMode: payload.paymentMode,
    razorpay: payload.razorpay,
  });
}

/** Persist a kit campaign as draft without launching/charging. */
export async function saveKitCampaignDraftFlow(
  payload: Parameters<typeof launchKitCampaignFlow>[0],
) {
  const recipients = payload.contactIds
    .map((id) => {
      if (id.startsWith("email:")) {
        const email = id.slice("email:".length);
        const extra = payload.contacts.find((c) => c.id === id || c.email === email);
        return {
          name: extra?.name || email.split("@")[0] || email,
          email,
          phone: extra?.phone,
          variants: payload.recipVariants?.[id],
        };
      }
      const contact = payload.contacts.find((c) => c.id === id);
      if (!contact) return null;
      return {
        contactId: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        variants: payload.recipVariants?.[contact.id],
      };
    })
    .filter(Boolean)
    .map((r) => r!);
  if (!recipients.length) throw new Error("Select at least one recipient");
  return saveKitCampaignDraftApi({
    entityId: payload.entityId,
    kitId: payload.kitId,
    name: payload.name,
    totalBudget: payload.totalBudget,
    packaging: payload.packaging,
    fulfillmentMode: payload.fulfillmentMode,
    singleLocation: payload.singleLocation,
    message: payload.message,
    schedule: payload.schedule,
    recipients,
    isSample: payload.isSample,
    brandingEnabled: payload.brandingEnabled,
  });
}

export async function syncOrgWizard(org: Parameters<typeof syncOrgWizardApi>[0]) {
  return syncOrgWizardApi(org);
}

export async function acceptInvite(token: string, password: string) {
  const result = await apiFetch<{ success: boolean; email: string }>("/users/accept-invite", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ token, password }),
  });
  try {
    return await login(result.email, password);
  } catch (err) {
    // Account was activated even if auto-login fails (e.g. stale session).
    if (err instanceof ApiError && err.code === "INVITE_PENDING") {
      throw err;
    }
    return { email: result.email, activated: true as const };
  }
}

// --- Public redemption API (no auth) ---

export async function getRedemptionPortal(token: string) {
  return publicFetch(`/redemptions/${token}`);
}

export type StorefrontData = {
  shop: {
    id: string;
    slug?: string;
    name: string;
    logoUrl?: string;
    bannerTheme?: string;
    bannerPreset?: string;
    bannerImageUrl?: string;
    currencyMode: string;
    companyEmailDomain?: string;
    featuredCatalogProductIds?: string[];
    featuredListingKeys?: string[];
    activeListingKeys?: string[];
  };
  products: Array<{
    _id: string;
    catalogProductId?: string;
    collectionId?: string;
    name: string;
    brand?: string;
    group?: string;
    category?: string;
    subcategory?: string;
    description?: string;
    keyFeatures?: string;
    sizeGuide?: string;
    basePriceInr: number;
    primaryImageUrl?: string;
    imageUrls?: string[];
    maskImageUrl?: string;
    baseImageUrl?: string;
    maskBackImageUrl?: string;
    baseBackImageUrl?: string;
    maskLeftImageUrl?: string;
    baseLeftImageUrl?: string;
    maskRightImageUrl?: string;
    baseRightImageUrl?: string;
    artworkUrl?: string;
    mockupUrl?: string;
    mockupBackUrl?: string;
    placement?: { xPct: number; yPct: number; wPct: number; rot: number };
    preferredColors?: string[];
    printAreas?: Array<{
      key?: string;
      label?: string;
      mockupImageUrl?: string;
      box: { xPct: number; yPct: number; widthPct: number; heightPct: number };
    }>;
    variants?: Array<{ size?: string; color?: string; colorHex?: string; material?: string; sku?: string }>;
  }>;
};

export async function getPublicStorefront(shopId: string) {
  return publicFetch<StorefrontData>(`/storefront/${shopId}`);
}

export async function getPublicStorefrontBySlug(slug: string) {
  return publicFetch<{ shop: StorefrontData["shop"] }>(`/storefront/by-slug/${encodeURIComponent(slug)}`);
}

export type ShopAuthSessionResponse = {
  accessToken: string;
  customer: {
    id: string;
    shopId: string;
    email: string;
    name: string;
    claimedViaRedeem?: boolean;
  };
  shop: StorefrontData["shop"];
  creditAmount: number;
  redemptionToken: string | null;
};

export type ShopSignupStartResponse = {
  pendingId: string;
  email: string;
  emailMasked: string;
  otpExpiresInSec: number;
  resendAvailableInSec: number;
  shop: StorefrontData["shop"];
};

export async function startShopSignup(
  shopId: string,
  body: { name: string; email: string; password: string },
) {
  return publicFetch<ShopSignupStartResponse>(`/storefront/${shopId}/auth/signup/start`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function resendShopSignupOtp(shopId: string, pendingId: string) {
  return publicFetch<Omit<ShopSignupStartResponse, "shop">>(`/storefront/${shopId}/auth/signup/resend`, {
    method: "POST",
    body: JSON.stringify({ pendingId }),
  });
}

export async function verifyShopSignupOtp(shopId: string, body: { pendingId: string; otp: string }) {
  return publicFetch<ShopAuthSessionResponse>(`/storefront/${shopId}/auth/signup/verify`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function loginShopCustomer(shopId: string, body: { email: string; password: string }) {
  return publicFetch<ShopAuthSessionResponse>(`/storefront/${shopId}/auth/login`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchShopCustomerMe(shopId: string, accessToken: string) {
  return publicFetch<Omit<ShopAuthSessionResponse, "accessToken">>(`/storefront/${shopId}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function forgotShopPassword(shopId: string, email: string) {
  return publicFetch<{ success: boolean; message: string }>(
    `/storefront/${shopId}/auth/forgot-password`,
    {
      method: "POST",
      body: JSON.stringify({ email }),
    },
  );
}

export async function resetShopPassword(token: string, newPassword: string) {
  return publicFetch<{ success: boolean; shopId: string }>(`/storefront/auth/reset-password`, {
    method: "POST",
    body: JSON.stringify({ token, newPassword }),
  });
}

export type ClaimRedeemResponse =
  | {
      needsPassword: true;
      email: string;
      emailMasked: string;
      name: string;
      shop: StorefrontData["shop"];
    }
  | (ShopAuthSessionResponse & { needsPassword: false; created: boolean });

export async function claimRedeemShopAccount(token: string, password?: string) {
  return publicFetch<ClaimRedeemResponse>(`/storefront/auth/claim-redeem`, {
    method: "POST",
    body: JSON.stringify(password ? { token, password } : { token }),
  });
}

export async function sendRedemptionOtp(token: string, contact: string) {
  return publicFetch(`/redemptions/${token}/send-otp`, {
    method: "POST",
    body: JSON.stringify({ contact }),
  });
}

export async function verifyRedemptionOtp(token: string, code: string) {
  return publicFetch<{ sessionToken: string }>(`/redemptions/${token}/verify-otp`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function getRedemptionCatalog(token: string, sessionToken: string) {
  return publicFetch(`/redemptions/${token}/catalog`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
}

export type KitRedemptionItem = {
  productId: string;
  name: string;
  brand: string;
  group: string;
  category?: string;
  isDrinkware?: boolean;
  imageUrl: string;
  /** Pre-baked branded mockup from kit publish — preferred for redeem previews. */
  mockupUrl?: string;
  artworkUrl: string;
  /** Saved logo placement from kit branding (matches baked mockup). */
  placement?: {
    xPct: number;
    yPct: number;
    wPct: number;
    rot: number;
    printCxPct?: number;
    printCyPct?: number;
    printWPct?: number;
  };
  maskImageUrl?: string;
  baseImageUrl?: string;
  maskBackImageUrl?: string;
  baseBackImageUrl?: string;
  maskLeftImageUrl?: string;
  baseLeftImageUrl?: string;
  maskRightImageUrl?: string;
  baseRightImageUrl?: string;
  primaryImageUrl?: string;
  imageUrls?: string[];
  /** Pre-baked branded mockup saved on the kit at publish. */
  mockupUrl?: string;
  placement?: {
    xPct: number;
    yPct: number;
    wPct: number;
    rot: number;
    printCxPct?: number;
    printCyPct?: number;
    printWPct?: number;
  };
  printAreas?: Array<{
    key?: string;
    label?: string;
    mockupImageUrl?: string;
    box: { xPct: number; yPct: number; widthPct: number; heightPct: number };
  }>;
  requiresSize: boolean;
  requiresColor: boolean;
  sizes: string[];
  colors: string[];
  /** Variant colour name → hex when catalog rows include colorHex. */
  colorHexByName?: Record<string, string>;
  qty: number;
};

export type KitRedemptionData = {
  kit: { name: string; artworkUrl: string; packaging: string };
  items: KitRedemptionItem[];
  /** Curated kit with no catalog products — recipient confirms address (+ optional kit variant). */
  curatedBundle?: boolean;
  /** Curated kit appearance variants (same gallery roles as superadmin). */
  variantImages?: string[];
  /** Named variant rows — prefer for display labels. */
  kitVariants?: Array<{ imageUrl: string; label?: string }>;
  requiresKitVariant?: boolean;
};

export async function getRedemptionKit(token: string, sessionToken: string) {
  return publicFetch<KitRedemptionData>(`/redemptions/${token}/kit`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
}

export async function submitRedemption(
  token: string,
  sessionToken: string,
  payload: unknown,
  idempotencyKey: string,
) {
  return publicFetch(`/redemptions/${token}/submit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sessionToken}` },
    idempotencyKey,
    body: JSON.stringify(payload),
  });
}

export type RedemptionRazorpayOrder = {
  orderId: string;
  amount: number;
  amountPaise: number;
  currency: string;
  keyId: string;
  paymentId: string;
};

export async function createRedemptionRazorpayOrder(
  token: string,
  sessionToken: string,
  amountInr: number,
) {
  return publicFetch<RedemptionRazorpayOrder>(`/redemptions/${token}/razorpay/order`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sessionToken}` },
    body: JSON.stringify({ amountInr }),
  });
}

export async function trackRedemption(token: string) {
  return publicFetch(`/redemptions/${token}/track`);
}

export type RedemptionOrderSummary = {
  orderNumber: string;
  status: string;
  total: number;
  itemCount: number;
  createdAt?: string;
  items?: Array<{
    name: string;
    qty: number;
    unitPriceInr?: number;
    imageUrl?: string;
    catalogProductId?: string;
    collectionId?: string;
    variant?: { size?: string; color?: string };
  }>;
  shippingAddress?: {
    name?: string;
    phone?: string;
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
  } | null;
  amountBreakdown?: {
    subtotal?: number;
    serviceFee?: number;
    gst?: number;
    total?: number;
  } | null;
  statusHistory?: Array<{ status: string; at?: string; note?: string }>;
};

export async function listRedemptionOrders(token: string, sessionToken: string) {
  return publicFetch<{ orders: RedemptionOrderSummary[]; creditAmount: number }>(
    `/redemptions/${token}/orders`,
    { headers: { Authorization: `Bearer ${sessionToken}` } },
  );
}

// ── Employee support tickets (raised from the redemption store) ──

export type StoreSupportMessage = {
  _id?: string;
  authorName?: string;
  fromPlatform?: boolean;
  body: string;
  at: string;
};

export type StoreSupportTicket = {
  _id: string;
  subject: string;
  description?: string;
  type: string;
  status: string;
  messages: StoreSupportMessage[];
  createdAt: string;
};

export async function listRedemptionTickets(token: string, sessionToken: string) {
  return publicFetch<{ items: StoreSupportTicket[] }>(`/redemptions/${token}/support-tickets`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
}

export async function raiseRedemptionTicket(
  token: string,
  sessionToken: string,
  body: { subject: string; description?: string; type?: string },
) {
  return publicFetch<StoreSupportTicket>(`/redemptions/${token}/support-tickets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sessionToken}` },
    body: JSON.stringify(body),
  });
}

export async function replyRedemptionTicket(
  token: string,
  sessionToken: string,
  ticketId: string,
  body: string,
) {
  return publicFetch<StoreSupportTicket>(
    `/redemptions/${token}/support-tickets/${ticketId}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ body }),
    },
  );
}

export async function confirmRedemptionTicket(token: string, sessionToken: string, ticketId: string) {
  return publicFetch<StoreSupportTicket>(
    `/redemptions/${token}/support-tickets/${ticketId}/confirm`,
    { method: "POST", headers: { Authorization: `Bearer ${sessionToken}` } },
  );
}
