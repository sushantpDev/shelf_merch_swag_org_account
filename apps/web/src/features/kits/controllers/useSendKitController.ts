import { validateArtworkFile } from "@/lib/artworkValidation";
import { useMemo, useReducer, useState, useEffect, useRef, type Dispatch } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { useWorkspace, useInvalidateWorkspace } from "@/hooks/useWorkspace";
import type { UiContact, UiProduct } from "@/services/mappers";
import type { UiWallet } from "@/services/mappers";
import { openRazorpayCheckout } from "@/lib/razorpay";
import {
  createRazorpayOrderApi,
  ensureSpendEntityForWalletApi,
  verifyRazorpayPaymentApi,
} from "@/services/mutations-api";
import { refreshPlatformKit } from "@/services/api-bridge";
import { entityIdForWallet, spendableForWallet, walletsForCheckout } from "@/services/workspace-api";
import {
  curatedKitSendTotals,
  customisedKitSendTotals,
  netPriceExGst,
  sumCustomisedKitNetPrices,
  type KitSendTotals,
} from "@/features/send/money";
import { toSchedulePayload } from "@/features/send/types";
import { CONTACTS_QUERY_KEY } from "@/features/contacts/model";
import { persistNewRecipientContacts } from "@/features/send/persistNewRecipientContacts";
import { validateSingleLocation } from "@/features/send/singleLocationValidation";
import {
  addRecipientRowsUpToLimit,
  addRecipientsUpToLimit,
  applyProfileToContact,
  hasCompleteRecipientAddress,
  isManualRecipientId,
  mergePickerContacts,
  normalizeRecipientEmail,
  parseCsvRecipientRows,
  parseEmailInput,
  profileHasDetails,
  selectAllRecipientIds,
  type RecipientProfileInput,
} from "@/features/send/recipientSelection";
import {
  addContactFlow,
  updateContactFlow,
  listContactsApi,
  ApiError,
} from "@/services/api-bridge";
import { kitPickedIndices } from "../wizard/kitDraft";
import {
  useLaunchKitCampaign,
  useSaveKitCampaignDraft,
  useUpdateKit,
  useUploadKitArtwork,
  usePlatformKits,
} from "../model";
import { canPayKitWithWallet } from "@/features/send/fundsGate";
import type { UiKit } from "../model";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { variantImageUrls, type KitVariantImage } from "@/lib/kitVariantImages";
import { curatedKitRequiresLogo } from "../curatedRequireLogo";
import {
  initialSendKitDraft,
  sendKitReducer,
  type SendKitAction,
  type SendKitDraft,
} from "../send/sendDraft";

/** No hard cap on kit recipients — use a large ceiling for shared helpers. */
const KIT_RECIPIENT_CEILING = 50_000;

const NO_SIZE_GROUPS = new Set([
  'bottle',
  'mug',
  'tumbler',
  'drinkware',
  'pen',
  'notebook',
  'pack',
  'bag',
  'cap',
  'hat',
  'keychain',
  'sticker',
  'tech',
  'charger',
  'speaker',
]);

const APPAREL_GROUPS = new Set([
  'tee',
  'hoodie',
  'polo',
  'shirt',
  'sweatshirt',
  'jacket',
  'pant',
  'pants',
  'shorts',
  'apron',
  'tank',
  'crew',
]);

const GROUP_BY_CATEGORY: Record<string, string> = {
  Apparel: 'tee',
  Drinkware: 'bottle',
  Bags: 'bag',
  Technology: 'power',
  Office : 'note',
  // 'Health & Wellness': 'pillow',
  'Food & Beverages': 'bottle',
};

const DRINKWARE_NAME = /\bbottle\b|\bmug\b|\btumbler\b|\bflask\b|\bdrinkware\b/i;

function distinctVariantValues(
  variants: UiProduct["variants"],
  key: "size" | "color",
): string[] {
  return [
    ...new Set(
      (variants ?? [])
        .map((variant) => variant[key])
        .filter((value): value is string => Boolean(value?.trim())),
    ),
  ];
}

function effectiveProductGroup(product: UiProduct, ref: any = {}) {
  const fromProduct = String(product.g || '').toLowerCase().trim();
  if (fromProduct) return fromProduct;
  const fromCategory = GROUP_BY_CATEGORY[product.category || ''];
  if (fromCategory) return fromCategory.toLowerCase();
  return String(ref.group || '').toLowerCase().trim();
}

function isDrinkwareProduct(product: UiProduct, ref: any = {}) {
  const group = effectiveProductGroup(product, ref);
  const category = String(product.category || '').toLowerCase();
  const name = String(ref.name || product.nm || '');

  if (NO_SIZE_GROUPS.has(group) && !['pack', 'bag'].includes(group)) return true;
  if (/drink|bottle|mug|tumbler|beverage/.test(category)) return true;
  if (DRINKWARE_NAME.test(name)) return true;
  return false;
}

/** Sentinel matching API CURATED_VARIANT_KEY for curated kit appearance picks. */
export const CURATED_VARIANT_KEY = "__curated__";

function isApparelProduct(product: UiProduct, ref: any = {}) {
  if (isDrinkwareProduct(product, ref)) return false;
  const group = effectiveProductGroup(product, ref);
  const category = String(product.category || '').toLowerCase();
  return APPAREL_GROUPS.has(group) || category === 'apparel';
}

export function resolveKitItemOptions(product: UiProduct, ref: any = {}) {
  const rawSizes = distinctVariantValues(product.variants, 'size');
  const rawColors = distinctVariantValues(product.variants, 'color');

  if (isDrinkwareProduct(product, ref)) {
    return {
      sizes: [],
      colors: rawColors,
      requiresSize: false,
      requiresColor: rawColors.length > 0,
    };
  }

  if (isApparelProduct(product, ref)) {
    return {
      sizes: rawSizes,
      colors: rawColors,
      requiresSize: rawSizes.length > 0,
      requiresColor: rawColors.length > 0,
    };
  }

  return {
    sizes: rawSizes,
    colors: rawColors,
    requiresSize: rawSizes.length > 0,
    requiresColor: rawColors.length > 0,
  };
}

/** Curated kit metadata stored on workspace kits cloned from platform templates. */
export type CuratedKitMeta = {
  curated: boolean;
  originalId: string;
  description: string;
  approxValueInr?: number;
  imageUrls: string[];
  heroImage?: string;
  itemImages?: Array<{ imageUrl: string; label?: string }>;
  variantImages?: Array<string | KitVariantImage>;
  brandLogoUploaded?: boolean;
  brandLogoUrl?: string;
  /** Snapshotted from platform rules.requireLogo (default true when unset). */
  requireLogo?: boolean;
};

export function getCuratedKitMeta(kit: UiKit | undefined): CuratedKitMeta | null {
  if (!kit?.designNotes) return null;
  try {
    const parsed = JSON.parse(kit.designNotes);
    if (parsed && parsed.curated) {
      return parsed as CuratedKitMeta;
    }
  } catch {
    // ignore
  }
  return null;
}

/** True when the tenant has uploaded a brand logo (not just the platform hero image). */
export function curatedKitHasBrandLogo(kit: UiKit | undefined) {
  const meta = getCuratedKitMeta(kit);
  if (!meta) return false;
  if (meta.brandLogoUploaded && (kit?.artworkUrl || meta.brandLogoUrl)) return true;
  const hero = String(meta.heroImage || meta.imageUrls?.[0] || "").trim();
  const art = String(kit?.artworkUrl || "").trim();
  if (!art) return false;
  if (!hero) return true;
  return art !== hero;
}

export type SendKitStep = 0 | 1 | 2 | 3 | 4;

export type SendKitVm = {
  isLoading: boolean;
  isSending: boolean;
  notFound: boolean;
  kit: UiKit | undefined;
  account: string | undefined;
  shopName: string | undefined;
  step: SendKitStep;
  draft: SendKitDraft;
  dispatch: Dispatch<SendKitAction>;
  contacts: UiContact[];
  /** Workspace contacts plus any manually added email recipients. */
  pickerContacts: UiContact[];
  catalog: UiProduct[];
  /** Line items for checkout kit price breakdown. */
  pricedItems: Array<{ id: string; name: string; priceInr: number; mockupUrl?: string }>;
  kitUnitPrice: number;
  /** True when this workspace kit was cloned from a curated platform template. */
  isCuratedKit: boolean;
  totals: KitSendTotals;
  surpriseMissing: UiContact[];
  wallet: UiWallet | undefined;
  wallets: UiWallet[];
  selectedWalletId: string | undefined;
  onWalletSelect: (walletId: string) => void;
  walletAvailable: (wallet: UiWallet) => number;
  onSelectAllRecips: () => void;
  onAddRecipientEmails: (raw: string, profile?: RecipientProfileInput) => void;
  onImportRecipientCsv: (file: File) => void;
  onUpdateRecipientProfile: (contactId: string, profile: RecipientProfileInput) => void;
  onExit: () => void;
  onNext: () => void | Promise<void>;
  onBack: () => void;
  onPayAndSend: () => void;
  /** False when wallet is pending approval or cannot cover the order total. */
  walletPayEnabled: boolean;
  walletDisabledHint: string;
  walletDisabledBadge: string;
  isSavingDraft: boolean;
  onSaveAsDraft: () => void;
  kitName: string;
  setKitName: (name: string) => void;
  /** Curated kits: logo upload on Items step. */
  curatedLogoPreview: string;
  hasCuratedLogo: boolean;
  /** From platform kit rules.requireLogo (default true). */
  curatedRequiresLogo: boolean;
  isUploadingCuratedLogo: boolean;
  onCuratedLogoFile: (file: File | null) => void;
};

function missingAddress(contacts: UiContact[], selected: string[]): UiContact[] {
  return contacts.filter((c) => selected.includes(c.id) && !hasCompleteRecipientAddress(c));
}

function isDuplicateContactError(err: unknown): boolean {
  if (err instanceof ApiError) {
    return (
      err.status === 409
      || err.code === "DUPLICATE"
      || err.code === "CONFLICT"
      || /already exists|duplicate/i.test(err.message)
    );
  }
  return /already exists|duplicate|E11000/i.test(String((err as Error)?.message || err));
}

function findContactByEmailOrId(
  list: UiContact[],
  email: string,
  contactId?: string,
): UiContact | undefined {
  const byEmail = list.find(
    (c) => normalizeRecipientEmail(c.email) === email && !isManualRecipientId(c.id),
  );
  if (byEmail) return byEmail;
  if (contactId && !isManualRecipientId(contactId)) {
    return list.find((c) => c.id === contactId);
  }
  return undefined;
}

async function upsertRecipientContact(
  contact: UiContact,
  workspaceContacts: UiContact[],
): Promise<UiContact> {
  const email = normalizeRecipientEmail(contact.email);

  const payload = {
    name: contact.name || email.split("@")[0] || email,
    email,
    phone: contact.phone || "",
    role: contact.role?.trim() || "Member",
    department: contact.department || "",
    employeeCode: contact.employeeCode || "",
    address: {
      line1: contact.address || "",
      city: contact.city || "",
      state: contact.state || "",
      pincode: contact.pincode || "",
      country: contact.country || "IN",
    },
  };

  const patch = {
    name: payload.name,
    phone: payload.phone,
    role: payload.role,
    department: payload.department,
    employeeCode: payload.employeeCode,
    address: payload.address,
  };

  let existing = findContactByEmailOrId(workspaceContacts, email, contact.id);
  // Workspace snapshot can lag behind contacts created in a prior CSV/import attempt.
  if (!existing) {
    try {
      const latest = await listContactsApi();
      existing = findContactByEmailOrId(latest, email, contact.id);
    } catch {
      /* fall through to create */
    }
  }

  if (existing) {
    return updateContactFlow(existing.id, patch);
  }

  try {
    return await addContactFlow(payload);
  } catch (err) {
    if (!isDuplicateContactError(err)) throw err;
    const latest = await listContactsApi();
    const again = findContactByEmailOrId(latest, email, contact.id);
    if (!again) throw err;
    return updateContactFlow(again.id, patch);
  }
}

/** Controller for the send-kit wizard: recipient/experience/checkout state, pay flow. */
export function useSendKitController(): SendKitVm {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams() as { id: string };
  const { data: workspace, isLoading } = useWorkspace();
  const refreshWorkspace = useInvalidateWorkspace();
  const launch = useLaunchKitCampaign();
  const saveDraft = useSaveKitCampaignDraft();
  const updateKit = useUpdateKit();
  const uploadArtwork = useUploadKitArtwork();
  const [step, setStep] = useState<SendKitStep>(0);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [curatedLogoPreview, setCuratedLogoPreview] = useState("");
  const logoObjectUrlRef = useRef<string | null>(null);
  const pendingEmailContacts = useRef<Promise<void>>(Promise.resolve());

  const catalog: UiProduct[] = useMemo(() => workspace?.catalogProducts ?? [], [workspace]);
  const contacts: UiContact[] = useMemo(() => workspace?.contacts ?? [], [workspace]);
  const kit = workspace?.kits.find((k) => k.id === id);

  const [kitName, setKitName] = useState("");

  useEffect(() => {
    if (kit) {
      setKitName(kit.name);
    }
  }, [kit]);

  const initial = useMemo(() => {
    const picked = kit ? kitPickedIndices(kit, catalog) : [];
    // Premium packaging is the default at send time.
    const packaging: "none" | "box" = "box";
    const firstRecips = contacts.slice(0, 2).map((c) => c.id);
    return initialSendKitDraft(picked, packaging, firstRecips, workspace?.account ?? "Shelf Merch");
  }, [kit, catalog, contacts, workspace?.account]);

  const [draft, dispatch] = useReducer(sendKitReducer, initial);
  const seededKitId = useRef<string | null>(null);
  /** Local address/name overlays for CSV + email recipients (keyed by normalized email). */
  const [recipientOverlays, setRecipientOverlays] = useState<Record<string, UiContact>>({});

  // Seed draft once kit data is available (workspace may load after first render).
  useEffect(() => {
    if (!kit?.id) return;
    if (seededKitId.current === kit.id) return;
    seededKitId.current = kit.id;
    const picked = kitPickedIndices(kit, catalog);
    const firstRecips = contacts.slice(0, 2).map((c) => c.id);
    dispatch({
      type: "hydrate",
      draft: initialSendKitDraft(
        picked,
        "box",
        firstRecips,
        workspace?.account ?? "Shelf Merch",
      ),
    });
  }, [kit, catalog, contacts, workspace?.account]);

  const pickerContacts = useMemo(
    () => mergePickerContacts(contacts, draft.selRecips, recipientOverlays),
    [contacts, draft.selRecips, recipientOverlays],
  );

  useEffect(() => {
    for (const id of draft.selRecips) {
      if (!isManualRecipientId(id)) continue;
      const email = id.slice("email:".length);
      const contact = contacts.find((row) => normalizeRecipientEmail(row.email) === email);
      if (contact) dispatch({ type: "remapRecipId", fromId: id, toId: contact.id });
    }
  }, [contacts, draft.selRecips]);

  const pricedItems = useMemo(() => {
    if (!kit) return [];
    return draft.picked
      .map((idx) => {
        const product = catalog[idx];
        if (!product) return null;
        const ref = kit.productRefs?.find((r) => r.catalogProductId === product.id);
        return {
          id: product.id || product.nm,
          name: product.nm,
          priceInr: netPriceExGst(Number(product.basePriceInr) || 0, product.category),
          mockupUrl: ref?.mockupUrl || product.mockupUrl || "",
        };
      })
      .filter(Boolean) as Array<{ id: string; name: string; priceInr: number; mockupUrl?: string }>;
  }, [kit, draft.picked, catalog]);

  const { data: platformKits } = usePlatformKits();

  const curatedMetaForRules = getCuratedKitMeta(kit);
  const isCuratedKit = !!curatedMetaForRules;
  const curatedOriginalId = curatedMetaForRules?.originalId
    ? String(curatedMetaForRules.originalId)
    : "";

  // Fresh platform kit read so requireLogo toggles are not stuck behind list cache.
  const { data: livePlatformKit } = useQuery({
    queryKey: ["platform-kit", curatedOriginalId],
    queryFn: () => refreshPlatformKit(curatedOriginalId),
    enabled: Boolean(isCuratedKit && curatedOriginalId),
    staleTime: 0,
  });

  useEffect(() => {
    if (!kit || !isCuratedKit) return;
    if (logoObjectUrlRef.current) return; // keep local blob preview while uploading
    const meta = getCuratedKitMeta(kit);
    const url = meta?.brandLogoUrl || (curatedKitHasBrandLogo(kit) ? kit.artworkUrl : "") || "";
    if (url) setCuratedLogoPreview(resolveMediaUrl(url) || url);
  }, [kit, isCuratedKit]);

  useEffect(() => {
    return () => {
      if (logoObjectUrlRef.current) URL.revokeObjectURL(logoObjectUrlRef.current);
    };
  }, []);

  const hasCuratedLogo = curatedKitHasBrandLogo(kit) || Boolean(curatedLogoPreview);

  const curatedRequiresLogo = useMemo(() => {
    const meta = getCuratedKitMeta(kit);
    const fromList = platformKits?.find((k) => String(k._id) === String(meta?.originalId));
    const platform = livePlatformKit || fromList;
    return curatedKitRequiresLogo(meta, platform?.rules);
  }, [kit, livePlatformKit, platformKits]);

  const pickedProducts = useMemo(
    () => draft.picked.map((idx) => catalog[idx]).filter(Boolean) as UiProduct[],
    [draft.picked, catalog],
  );

  const curatedPricePerKit = useMemo(() => {
    if (!isCuratedKit) return 0;
    const meta = getCuratedKitMeta(kit);
    if (meta?.approxValueInr && meta.approxValueInr > 0) {
      return Math.round(meta.approxValueInr);
    }
    const platformKit = platformKits?.find(
      (k) => String(k._id) === String(meta?.originalId),
    );
    if (platformKit?.approxValueInr && platformKit.approxValueInr > 0) {
      return Math.round(platformKit.approxValueInr);
    }
    if (kit?.kitPrice && kit.kitPrice > 0) return Math.round(kit.kitPrice);
    return 0;
  }, [isCuratedKit, kit, platformKits]);

  const totals = useMemo(() => {
    if (!isCuratedKit) {
      return customisedKitSendTotals(draft.selRecips.length, draft.pkg, pickedProducts);
    }
    return curatedKitSendTotals(draft.selRecips.length, curatedPricePerKit, draft.pkg);
  }, [isCuratedKit, draft.selRecips.length, draft.pkg, pickedProducts, curatedPricePerKit]);

  const checkoutWallets = useMemo(
    () => (workspace ? walletsForCheckout(workspace) : []),
    [workspace],
  );
  const wallet =
    checkoutWallets.find((w) => w.id === selectedWalletId) ?? checkoutWallets[0];

  const kitUnitPrice = isCuratedKit
    ? curatedPricePerKit
    : sumCustomisedKitNetPrices(pickedProducts);
  const surpriseMissing =
    draft.mode === "surprise" ? missingAddress(pickerContacts, draft.selRecips) : [];

  function reportRecipientAddResult(result: {
    added: string[];
    invalid: string[];
    duplicates: string[];
    truncated: number;
  }) {
    if (result.invalid.length) {
      toast.error(
        result.invalid.length === 1 ? "Skipped 1 invalid email" : `Skipped ${result.invalid.length} invalid emails`,
      );
    }
    if (result.duplicates.length) {
      toast.message(
        result.duplicates.length === 1 ? "Skipped 1 duplicate" : `Skipped ${result.duplicates.length} duplicates`,
      );
    }
    if (result.truncated > 0) {
      toast.error("Could not add all recipients");
    }
    if (result.added.length) {
      toast.success(
        result.added.length === 1 ? "Added 1 recipient" : `Added ${result.added.length} recipients`,
      );
    } else if (!result.invalid.length && !result.duplicates.length && !result.truncated) {
      toast.error("No new recipients to add");
    }
  }

  function onSelectAllRecips() {
    if (!contacts.length) {
      toast.message("No contacts yet");
      return;
    }
    const ids = selectAllRecipientIds(contacts, draft.selRecips, KIT_RECIPIENT_CEILING);
    if (ids.length === draft.selRecips.length) {
      toast.message("All contacts already selected");
      return;
    }
    dispatch({ type: "setSelRecips", selRecips: ids });
  }

  function mergeOverlays(next: Record<string, UiContact>) {
    if (!Object.keys(next).length) return;
    setRecipientOverlays((prev) => ({ ...prev, ...next }));
  }

  function saveAddedEmails(emails: string[]) {
    if (!emails.length) return;
    pendingEmailContacts.current = pendingEmailContacts.current.then(async () => {
      const { saved, failed } = await persistNewRecipientContacts(emails.map((email) => ({ email })), contacts);
      if (saved.length) {
        await queryClient.invalidateQueries({ queryKey: CONTACTS_QUERY_KEY });
        try {
          await refreshWorkspace();
        } catch {
          // The saved contacts will appear on the next workspace read.
        }
        for (const { fromId, contact } of saved) {
          dispatch({ type: "remapRecipId", fromId, toId: contact.id });
        }
      }
      if (failed.length) {
        toast.error(`Could not save ${failed.length === 1 ? "1 contact" : `${failed.length} contacts`} to Contacts`);
      }
    }).catch(() => {
      toast.error("Could not refresh Contacts");
    });
  }

  function onAddRecipientEmails(raw: string, profile?: RecipientProfileInput) {
    const hasProfile = profileHasDetails(profile);
    const { ids, result, overlays } = addRecipientsUpToLimit(
      parseEmailInput(raw),
      draft.selRecips,
      contacts,
      KIT_RECIPIENT_CEILING,
      hasProfile ? profile : undefined,
    );
    dispatch({ type: "setSelRecips", selRecips: ids });
    mergeOverlays(overlays);
    reportRecipientAddResult(result);
    saveAddedEmails(result.added.filter((email) => !overlays[normalizeRecipientEmail(email)]));

    if (hasProfile && result.added.length) {
      void persistRecipientOverlays(overlays, ids).catch((err) => {
        toast.error(err instanceof Error ? err.message : "Could not save recipient details");
      });
    }
  }

  function onImportRecipientCsv(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const rows = parseCsvRecipientRows(text);
      const { ids, result, overlays } = addRecipientRowsUpToLimit(
        rows,
        draft.selRecips,
        contacts,
        KIT_RECIPIENT_CEILING,
      );
      dispatch({ type: "setSelRecips", selRecips: ids });
      mergeOverlays(overlays);
      reportRecipientAddResult(result);
      saveAddedEmails(result.added.filter((email) => !overlays[normalizeRecipientEmail(email)]));

      if (Object.keys(overlays).length) {
        void persistRecipientOverlays(overlays, ids).catch((err) => {
          toast.error(err instanceof Error ? err.message : "Could not save recipient addresses");
        });
      }
    };
    reader.onerror = () => toast.error("Could not read CSV file");
    reader.readAsText(file);
  }

  function onUpdateRecipientProfile(contactId: string, profile: RecipientProfileInput) {
    const contact = pickerContacts.find((c) => c.id === contactId);
    if (!contact) return;
    const email = normalizeRecipientEmail(contact.email);
    const next = applyProfileToContact(contact, profile);
    setRecipientOverlays((prev) => ({ ...prev, [email]: next }));
    void upsertRecipientContact(next, contacts)
      .then((saved) => {
        setRecipientOverlays((prev) => ({
          ...prev,
          [email]: { ...next, id: saved.id },
        }));
        if (saved.id !== contactId) {
          dispatch({ type: "remapRecipId", fromId: contactId, toId: saved.id });
        }
        void refreshWorkspace().catch(() => undefined);
        void queryClient.invalidateQueries({ queryKey: CONTACTS_QUERY_KEY });
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Could not save contact details");
      });
  }

  async function persistRecipientOverlays(
    overlays: Record<string, UiContact>,
    selectedIds: string[],
  ) {
    let nextIds = [...selectedIds];
    for (const contact of Object.values(overlays)) {
      const saved = await upsertRecipientContact(contact, contacts);
      const email = normalizeRecipientEmail(contact.email);
      const fromIds = [contact.id, `email:${email}`];
      for (const fromId of fromIds) {
        if (fromId !== saved.id && nextIds.includes(fromId)) {
          dispatch({ type: "remapRecipId", fromId, toId: saved.id });
          nextIds = nextIds.map((id) => (id === fromId ? saved.id : id));
        }
      }
      setRecipientOverlays((prev) => ({
        ...prev,
        [email]: { ...contact, id: saved.id },
      }));
    }
    void refreshWorkspace().catch(() => undefined);
    void queryClient.invalidateQueries({ queryKey: CONTACTS_QUERY_KEY });
  }

  async function syncSelectedRecipientContacts() {
    const overlaysToFlush = Object.fromEntries(
      pickerContacts
        .filter((c) => draft.selRecips.includes(c.id) && profileHasDetails({
          name: c.name,
          phone: c.phone,
          role: c.role,
          department: c.department,
          employeeCode: c.employeeCode,
          address: {
            line1: c.address,
            city: c.city,
            state: c.state,
            pincode: c.pincode,
            country: c.country,
          },
        }))
        .map((c) => [normalizeRecipientEmail(c.email), c]),
    );
    if (!Object.keys(overlaysToFlush).length) return;
    await persistRecipientOverlays(overlaysToFlush, draft.selRecips);
  }

  async function onNext() {
    if (step === 0) {
      if (isCuratedKit && curatedRequiresLogo && !hasCuratedLogo) {
        toast.error("Please upload a logo before continuing");
        return;
      }
      if (kit && kitName.trim() && kitName !== kit.name) {
        updateKit.mutateAsync({
          id: kit.id,
          name: kitName.trim(),
          pickedIndices: kitPickedIndices(kit, catalog),
          catalog,
        }).catch((err) => {
          console.error("Failed to rename kit:", err);
        });
      }
      setStep(1);
      return;
    }
    if (step === 1) {
      await pendingEmailContacts.current;
      if (!draft.selRecips.length) {
        toast.error("Select at least one recipient");
        return;
      }
      if (draft.mode === "surprise") {
        if (surpriseMissing.length) {
          toast.error("Complete all shipping addresses");
          return;
        }
        try {
          await syncSelectedRecipientContacts();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not save recipient addresses");
          return;
        }
      }
      if (draft.mode === "single") {
        const locationError = validateSingleLocation(draft.singleLocation);
        if (locationError) {
          toast.error(locationError);
          return;
        }
      }
      const isCurated = !!getCuratedKitMeta(kit);
      if ((draft.mode === "surprise" || draft.mode === "single")) {
        const missingList: string[] = [];
        if (isCurated) {
          const meta = getCuratedKitMeta(kit);
          const platformVariantUrls = variantImageUrls(
            platformKits?.find((k) => String(k._id) === String(meta?.originalId))?.variantImages,
          );
          const metaVariantUrls = variantImageUrls(meta?.variantImages);
          const variantUrls = platformVariantUrls.length ? platformVariantUrls : metaVariantUrls;
          if (variantUrls.length) {
            for (const rid of draft.selRecips) {
              const contact = pickerContacts.find((c) => c.id === rid);
              const name = contact?.name || "Recipient";
              const sel = draft.recipVariants[rid]?.[CURATED_VARIANT_KEY];
              if (!sel?.variantImage) missingList.push(`${name}'s kit design`);
            }
          }
        } else {
          const pickedProds = draft.picked.map((idx) => catalog[idx]).filter(Boolean);
          for (const rid of draft.selRecips) {
            const contact = pickerContacts.find((c) => c.id === rid);
            const name = contact?.name || "Recipient";
            const variants = draft.recipVariants[rid] || {};
            for (const prod of pickedProds) {
              const ref = kit?.productRefs?.find((r) => r.catalogProductId === prod.id) ?? {};
              const opts = resolveKitItemOptions(prod, ref);
              if (!opts.requiresSize && !opts.requiresColor) continue;
              const sel = variants[prod.id || ""] || {};
              if (opts.requiresSize && !sel.size?.trim()) missingList.push(`${name}'s size for ${prod.nm}`);
              if (opts.requiresColor && !sel.color?.trim()) missingList.push(`${name}'s color for ${prod.nm}`);
            }
          }
        }
        if (missingList.length > 0) {
          toast.error(`Select missing variants: ${missingList.slice(0, 3).join(", ")}${missingList.length > 3 ? ` and ${missingList.length - 3} more` : ""}`);
          return;
        }
      }
    }
    setStep((s) => Math.min(s + 1, 4) as SendKitStep);
  }

  async function resolveEntityId(walletId: string | undefined): Promise<string | undefined> {
    if (!walletId || !workspace) return undefined;

    const local = entityIdForWallet(workspace, walletId);
    if (local) return local;

    if (workspace.userPatch.role === "entity_manager") return undefined;

    return ensureSpendEntityForWalletApi(walletId);
  }

  function buildKitCampaignPayload(entityId: string, paymentTotal: number) {
    return {
      entityId: String(entityId),
      kitId: String(kit!.id),
      name: kit!.name,
      totalBudget: paymentTotal,
      packaging: draft.pkg,
      fulfillmentMode:
        draft.mode === "surprise" ? "surprise" as const : draft.mode === "single" ? "single" as const : "redeem" as const,
      singleLocation: draft.mode === "single" ? draft.singleLocation : undefined,
      message: { from: draft.from, body: draft.msg },
      schedule: toSchedulePayload(draft.when, draft.schedule),
      contactIds: draft.selRecips,
      contacts: pickerContacts.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
      })),
      recipVariants: draft.recipVariants,
    };
  }

  async function onSaveAsDraft() {
    const walletId = selectedWalletId || checkoutWallets[0]?.id || workspace?.wallets[0]?.id;
    let entityId: string | undefined;
    try {
      entityId = await resolveEntityId(walletId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resolve wallet budget");
      return;
    }
    if (!entityId) {
      toast.error("Allocate funds to a department first");
      return;
    }
    if (!draft.selRecips.length) {
      toast.error("Select at least one recipient");
      return;
    }
    if (!kit) return;
    const paymentTotal = Math.round(totals.total);
    setSavingDraft(true);
    try {
      await saveDraft.mutateAsync(buildKitCampaignPayload(entityId, paymentTotal));
      toast.success("Draft saved");
      navigate("/app/campaigns");
      void refreshWorkspace().catch(() => undefined);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      setSavingDraft(false);
    }
  }

  async function onPayAndSend() {
    const walletId = selectedWalletId || checkoutWallets[0]?.id || workspace?.wallets[0]?.id;
    let entityId: string | undefined;
    try {
      entityId = await resolveEntityId(walletId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resolve wallet budget");
      return;
    }
    if (!entityId) {
      toast.error("Allocate funds to a department first");
      return;
    }
    if (!draft.selRecips.length) {
      toast.error("Select at least one recipient");
      return;
    }
    if (draft.mode === "surprise") {
      try {
        await syncSelectedRecipientContacts();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save recipient addresses");
        return;
      }
    }
    const paymentTotal = Math.round(totals.total);
    const walletPayOk = canPayKitWithWallet(workspace, paymentTotal, walletId);
    const payingWithWallet = draft.pay === "wallet" && walletPayOk;
    const paymentMode = payingWithWallet
      ? "wallet"
      : draft.pay === "card"
        ? "card"
        : "upi";

    if (draft.pay === "wallet" && !walletPayOk) {
      toast.error("Choose UPI or card instead");
      return;
    }

    if (!payingWithWallet && !walletId) {
      toast.error("Select a wallet first");
      return;
    }

    let razorpay:
      | { orderId: string; paymentId: string; signature: string }
      | undefined;

    try {
      if (!payingWithWallet) {
        const order = await createRazorpayOrderApi(walletId!, paymentTotal, "campaign_spend");
        const response = await new Promise<{
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }>((resolve, reject) => {
          void openRazorpayCheckout({
            order,
            description: `Pay ₹${paymentTotal.toLocaleString("en-IN")} for kit send`,
            preferredMethod: paymentMode === "card" ? "card" : "upi",
            onSuccess: resolve,
            onDismiss: () => reject(new Error("Payment cancelled")),
          }).catch(reject);
        });

        await verifyRazorpayPaymentApi({
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        });

        razorpay = {
          orderId: response.razorpay_order_id,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        };
      }

      setSending(true);
      if (kit && kit.status !== "live") {
        await updateKit.mutateAsync({
          id: kit.id,
          pickedIndices: kitPickedIndices(kit, catalog),
          catalog,
          status: "live",
        });
      }
      await launch.mutateAsync({
        ...buildKitCampaignPayload(String(entityId), paymentTotal),
        paymentMode,
        razorpay,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send kit");
      return;
    } finally {
      setSending(false);
    }

    toast.success(
      draft.when === "sched"
        ? payingWithWallet
          ? "Kit scheduled 🙌"
          : "Kit scheduled 🙌"
        : draft.mode === "redeem"
          ? draft.selRecips.length === 1 ? "1 invite sent 🙌" : `${draft.selRecips.length} invites sent 🙌`
          : draft.selRecips.length === 1 ? "Order placed for 1 recipient 🎉" : `Order placed for ${draft.selRecips.length} recipients 🎉`,
    );
    navigate(draft.mode === "redeem" ? "/app/kits" : "/app/orders");
    void refreshWorkspace().catch(() => undefined);
  }

  async function onCuratedLogoFile(file: File | null) {
    if (!kit || !file) return;
    try {
      await validateArtworkFile(file);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read artwork");
      return;
    }
    if (logoObjectUrlRef.current) URL.revokeObjectURL(logoObjectUrlRef.current);
    const localUrl = URL.createObjectURL(file);
    logoObjectUrlRef.current = localUrl;
    setCuratedLogoPreview(localUrl);
    try {
      const updated = await uploadArtwork.mutateAsync({
        kitId: kit.id,
        artwork: { file, preview: localUrl, name: file.name },
      });
      const saved = updated.artworkUrl ? resolveMediaUrl(updated.artworkUrl) || updated.artworkUrl : localUrl;
      if (logoObjectUrlRef.current) {
        URL.revokeObjectURL(logoObjectUrlRef.current);
        logoObjectUrlRef.current = null;
      }
      setCuratedLogoPreview(saved);
      toast.success("Logo uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload logo");
      setCuratedLogoPreview("");
      if (logoObjectUrlRef.current) {
        URL.revokeObjectURL(logoObjectUrlRef.current);
        logoObjectUrlRef.current = null;
      }
    }
  }

  return {
    isLoading: isLoading && !workspace,
    isSending: sending || launch.isPending,
    notFound: !isLoading && !!workspace && !kit,
    kit,
    account: workspace?.account,
    shopName: workspace?.shops[0]?.name,
    step,
    draft,
    dispatch,
    contacts,
    pickerContacts,
    catalog,
    pricedItems,
    kitUnitPrice,
    isCuratedKit,
    totals,
    surpriseMissing,
    wallet,
    wallets: checkoutWallets,
    selectedWalletId: selectedWalletId || checkoutWallets[0]?.id,
    onWalletSelect: setSelectedWalletId,
    walletAvailable: (w) => (workspace ? spendableForWallet(workspace, w.id) : 0),
    onSelectAllRecips,
    onAddRecipientEmails,
    onImportRecipientCsv,
    onUpdateRecipientProfile,
    onExit: () => navigate("/app/kits"),
    onNext,
    onBack: () => setStep((s) => Math.max(s - 1, 0) as SendKitStep),
    onPayAndSend,
    walletPayEnabled: canPayKitWithWallet(
      workspace,
      totals.total,
      selectedWalletId || checkoutWallets[0]?.id,
    ),
    walletDisabledHint: "Pay via UPI or card",
    walletDisabledBadge:
      workspace?.org.wallet.fundingApproval === "pending"
        ? "Wallet under review"
        : "Insufficient funds",
    isSavingDraft: savingDraft || saveDraft.isPending,
    onSaveAsDraft: () => void onSaveAsDraft(),
    kitName,
    setKitName,
    curatedLogoPreview,
    hasCuratedLogo,
    curatedRequiresLogo,
    isUploadingCuratedLogo: uploadArtwork.isPending,
    onCuratedLogoFile,
  };
}
