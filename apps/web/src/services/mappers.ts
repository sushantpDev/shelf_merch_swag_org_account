import type { AuthUser } from "./auth-store";
import { extractVariantColors } from "../lib/variantColors";
import { normalizeMongoId } from "@/lib/mongoId";
import {
  currencyKeyFromMode,
  normalizeCurrencyMode,
  type ShopCurrencyMode,
} from "@/lib/storeCurrency";
import { netPriceExGst } from "@/features/send/money";

export type UiPrintArea = {
  key?: string;
  label?: string;
  mockupImageUrl?: string;
  /** Inch geometry — source of truth when present. */
  xIn?: number;
  yIn?: number;
  widthIn?: number;
  heightIn?: number;
  rotationDeg?: number;
  scale?: number;
  lockSize?: boolean;
  box: { xPct: number; yPct: number; widthPct: number; heightPct: number };
  maxWidthCm?: number;
  maxHeightCm?: number;
  dpi?: number;
  methods?: string[];
};

export type UiProduct = {
  id?: string;
  createdAt?: string;
  g: string;
  brand: string;
  nm: string;
  category?: string;
  subcategory?: string;
  childCategory?: string;
  /** All category names along every assigned path (multi-category placements). */
  categoryLabels?: string[];
  description?: string;
  keyFeatures?: string;
  sizeGuide?: string;
  price: string;
  /**
   * Numeric catalog selling price (INR), GST-inclusive as stored in catalogProducts.
   * Display uses `price` (ex-GST); kit checkout strips GST from this value by category.
   */
  basePriceInr?: number;
  sw: number;
  colors?: string[];
  /** Variant colour name → hex (from catalog variants). */
  colorHexByName?: Record<string, string>;
  /** Resolved marketing/catalog photo URL (primary product image). */
  photoUrl?: string;
  /** All marketing/catalog gallery URLs (e.g. Shopify product images). */
  imageUrls?: string[];
  /** Display URL for mockup/design flows — prefers production mask when set. */
  imgUrl?: string;
  /** Product-stage/base image used behind artwork previews. */
  baseImageUrl?: string;
  /** Transparent design/production image used by artwork mockups. */
  maskImageUrl?: string;
  /** Optional back-view stage image. */
  baseBackImageUrl?: string;
  /** Optional back-view transparent design/production mask. */
  maskBackImageUrl?: string;
  /** Optional left-side stage image. */
  baseLeftImageUrl?: string;
  /** Optional left-side transparent design/production mask. */
  maskLeftImageUrl?: string;
  /** Optional right-side stage image. */
  baseRightImageUrl?: string;
  /** Optional right-side transparent design/production mask. */
  maskRightImageUrl?: string;
  /** Pre-baked design mockup served to shop/storefront. */
  mockupUrl?: string;
  /** Pre-baked back-view design mockup (optional). */
  mockupBackUrl?: string;
  /** Real-world size of the mockup frame (inches) — drives print-area mapping. */
  physicalDimensions?: { width: number; height: number; length?: number };
  /** Product print DPI (default 300). */
  dpi?: number;
  /** Saved artwork placement from the design wizard (matches the baked mockup). */
  placement?: {
    xPct: number;
    yPct: number;
    wPct: number;
    rot: number;
    printCxPct?: number;
    printCyPct?: number;
    printWPct?: number;
  };
  /** Per print-area placements keyed by area key (Area 1, Area 2, …). */
  areaPlacements?: Record<
    string,
    {
      xPct: number;
      yPct: number;
      wPct: number;
      rot: number;
      printCxPct?: number;
      printCyPct?: number;
      printWPct?: number;
      /** Hosted artwork for this print area (colour-tint live composite). */
      artworkUrl?: string;
    }
  >;
  /** Super-admin design zones — designer places on pickPrintArea() for now. */
  printAreas?: UiPrintArea[];
  variants?: Array<{ size?: string; color?: string; colorHex?: string; material?: string; sku?: string }>;
};

export type UiShop = {
  id: string;
  name: string;
  slug?: string;
  currency: string;
  currencyMode: ShopCurrencyMode;
  pointsConversionEnabled: boolean;
  /** Company work-email domain for public store signup (e.g. "acme.com"). */
  companyEmailDomain?: string;
  live: boolean;
  categories: string[];
  collections: string[];
  selectedCatalogProductIds: string[];
  featuredCatalogProductIds: string[];
  activeListingKeys: string[];
  featuredListingKeys: string[];
  logoUrl?: string;
  bannerConfig?: Record<string, unknown>;
  createdAt?: string;
  createdBy?: string;
};

export type UiContact = {
  id: string;
  email: string;
  name: string;
  role: string;
  address: string;
  loc: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  phone?: string;
  department?: string;
  employeeCode?: string;
  designation?: string;
  dateOfJoining?: string | null;
  employmentStatus?: string;
  effectiveEmploymentStatus?: string;
};

export type UiKitProductRef = {
  catalogProductId: string;
  brand?: string;
  name: string;
  group?: string;
  /** Pre-baked branded mockup from kit creation. */
  mockupUrl?: string;
  /** Saved logo placement for this kit item (used when mockup is not baked). */
  placement?: ReturnType<typeof mapPlacement>;
};

export type UiKit = {
  id: string;
  name: string;
  description?: string;
  items: number;
  status: string;
  sent: boolean;
  /** ISO timestamp when this kit was last sent (kit campaign launch). */
  lastSentAt?: string;
  productRefs?: UiKitProductRef[];
  packaging?: string;
  designNotes?: string;
  artworkUrl?: string;
  /** Persisted sum of product basePriceInr at publish time. */
  kitPrice?: number;
};

export type UiCollection = {
  id: string;
  code: string;
  name: string;
  created: string;
  by: string;
  status: string;
  shopId: string;
  shopIds: string[];
  artworkUrl?: string;
  preferredColors?: string[];
  products: UiProduct[];
  isShopSpecific?: boolean;
  shopPublish?: Array<{ shopId: string; publishedAt?: string }>;
  createdAt?: string;
};

export type UiOrder = {
  id: string;
  date: string;
  name: string;
  orderNumber: string;
  status: string;
  rawStatus: string;
  amount: number;
  track: string;
  delivered: string;
  items: [string, string][];
  invoicePdfUrl?: string;
  invoiceNumber?: string;
};

export type UiCampaign = {
  id: string;
  name: string;
  status: string;
  type: string;
  shopId?: string;
  kitId?: string;
  senderName?: string;
  createdAt?: string;
  recipientCount: number;
  totalBudget: number;
  creditsPerRecipient: number;
  pointsScope?: "stadium" | "shop";
  messageBody?: string;
  orderNumber?: string;
  orderId?: string;
  draftState?: {
    step?: 0 | 1 | 2 | 3;
    selectedWalletId?: string;
    selRecips?: string[];
    recips?: number;
    pay?: "wallet" | "card";
    preview?: "landing" | "email";
    when?: "now" | "scheduled" | "self";
  };
};

export type UiWallet = {
  id: string;
  name: string;
  cur: string;
  balance: number;
  unalloc: number;
  alloc: number;
  owner: string;
  email: string;
  activity: Array<{ t: string; who: string; amt: number; on: string }>;
};

export type UiOrgDept = {
  id: string | number;
  walletId?: string;
  name: string;
  desc: string;
  users: number;
  allocated: number;
  spent: number;
  color: string;
  mgr: {
    name: string;
    email: string;
    mobile: string;
    role: string;
    /** @deprecated use inviteStatus */
    invite: boolean;
    inviteStatus: 'unassigned' | 'pending' | 'active';
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiProduct = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiEntity = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiUser = any;

function formatInr(n: number): string {
  if (n >= 1000) return `as low as ₹${Math.round(n).toLocaleString("en-IN")}`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function formatDate(d: string | Date | undefined): string {
  if (!d) return "N/A";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function resolveMediaUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")) return url;
  return `/${url.replace(/^\//, "")}`;
}

const GROUP_BY_CATEGORY: Record<string, string> = {
  Apparel: "tee",
  Drinkware: "bottle",
  Bags: "bag",
  Technology: "power",
  "Office Supplies": "note",
  Accessories: "key",
  "Key Chains": "key",
  "Card Holders": "card",
  // "Health & Wellness": "pillow",
};

function mapPrintArea(a: Record<string, unknown> | null | undefined): UiPrintArea | null {
  if (!a || typeof a !== "object") return null;
  const boxRaw = (a.box as UiPrintArea["box"] | undefined) || {
    xPct: 0,
    yPct: 0,
    widthPct: 0,
    heightPct: 0,
  };
  const box = {
    xPct: Number(boxRaw.xPct) || 0,
    yPct: Number(boxRaw.yPct) || 0,
    widthPct: Number(boxRaw.widthPct) || 0,
    heightPct: Number(boxRaw.heightPct) || 0,
  };
  const widthIn = Number(a.widthIn) || 0;
  const heightIn = Number(a.heightIn) || 0;
  const hasBox = box.widthPct > 0 && box.heightPct > 0;
  const hasInches = widthIn > 0 && heightIn > 0;
  if (!hasBox && !hasInches) return null;
  return {
    key: typeof a.key === "string" ? a.key : undefined,
    label: typeof a.label === "string" ? a.label : undefined,
    mockupImageUrl: resolveMediaUrl(typeof a.mockupImageUrl === "string" ? a.mockupImageUrl : undefined),
    xIn: Number.isFinite(Number(a.xIn)) ? Number(a.xIn) : undefined,
    yIn: Number.isFinite(Number(a.yIn)) ? Number(a.yIn) : undefined,
    widthIn: hasInches ? widthIn : undefined,
    heightIn: hasInches ? heightIn : undefined,
    rotationDeg: Number.isFinite(Number(a.rotationDeg)) ? Number(a.rotationDeg) : undefined,
    scale: Number(a.scale) > 0 ? Number(a.scale) : undefined,
    lockSize: Boolean(a.lockSize),
    box,
    maxWidthCm: Number(a.maxWidthCm) || undefined,
    maxHeightCm: Number(a.maxHeightCm) || undefined,
    dpi: Number(a.dpi) > 0 ? Number(a.dpi) : undefined,
    methods: Array.isArray(a.methods) ? (a.methods as string[]) : undefined,
  };
}

export function mapCatalogProduct(p: ApiProduct): UiProduct {
  const { colors: variantColors, colorHexByName } = extractVariantColors(p.variants);
  const photoUrl = resolveMediaUrl(p.primaryImageUrl || p.imageUrls?.[0]);
  const baseImageUrl = resolveMediaUrl(p.baseImageUrl);
  const baseBackImageUrl = resolveMediaUrl(p.baseBackImageUrl);
  const imgUrl = resolveMediaUrl(p.maskImageUrl || photoUrl);
  const printAreas = Array.isArray(p.printAreas)
    ? (p.printAreas as Record<string, unknown>[]).map(mapPrintArea).filter((a): a is UiPrintArea => !!a)
    : undefined;
  const phys = p.physicalDimensions;
  const physicalDimensions =
    phys && typeof phys === "object"
      ? {
          width: Number(phys.width) || 0,
          height: Number(phys.height) || 0,
          length: Number(phys.length) || undefined,
        }
      : undefined;
  return {
    id: String(p._id),
    createdAt: typeof p.createdAt === "string" ? p.createdAt : undefined,
    g: p.group || GROUP_BY_CATEGORY[p.category] || "tee",
    brand: p.brand || "",
    nm: p.name,
    category: p.category || "",
    subcategory: p.subcategory || "",
    childCategory: p.childCategory || "",
    categoryLabels: Array.isArray(p.categoryLabels)
      ? p.categoryLabels.map((label: unknown) => String(label || "").trim()).filter(Boolean)
      : [],
    description: p.description || "",
    keyFeatures: p.keyFeatures || "",
    sizeGuide: p.sizeGuide || "",
    // Display excludes category GST: base = inclusive / (1 + rate). basePriceInr stays GST-inclusive from DB.
    price: formatInr(netPriceExGst(Number(p.basePriceInr) || 0, p.category)),
    basePriceInr: Math.round(Number(p.basePriceInr) || 0),
    sw: Array.isArray(p.variants) ? Math.max(p.variants.length, 2) : 4,
    colors: variantColors,
    colorHexByName: Object.keys(colorHexByName).length ? colorHexByName : undefined,
    photoUrl,
    imageUrls: Array.isArray(p.imageUrls)
      ? p.imageUrls.map((u: string) => resolveMediaUrl(u)).filter(Boolean)
      : undefined,
    baseImageUrl,
    imgUrl,
    maskImageUrl: resolveMediaUrl(p.maskImageUrl),
    baseBackImageUrl,
    maskBackImageUrl: resolveMediaUrl(p.maskBackImageUrl),
    baseLeftImageUrl: resolveMediaUrl(p.baseLeftImageUrl),
    maskLeftImageUrl: resolveMediaUrl(p.maskLeftImageUrl),
    baseRightImageUrl: resolveMediaUrl(p.baseRightImageUrl),
    maskRightImageUrl: resolveMediaUrl(p.maskRightImageUrl),
    physicalDimensions:
      physicalDimensions && physicalDimensions.width > 0 && physicalDimensions.height > 0
        ? physicalDimensions
        : undefined,
    dpi: Number(p.dpi) > 0 ? Number(p.dpi) : undefined,
    printAreas: printAreas?.length ? printAreas : undefined,
    variants: p.variants,
  };
}

/** Fill in catalog copy (description, features, size guide) when a collection ref is sparse. */
export function mergeCatalogProductDetails(
  product: UiProduct,
  catalogProducts: UiProduct[],
): UiProduct {
  const id = product.id;
  if (!id) return product;
  const fromCatalog = catalogProducts.find((p) => p.id === id);
  if (!fromCatalog) return product;
  return {
    ...product,
    category: product.category || fromCatalog.category,
    subcategory: product.subcategory || fromCatalog.subcategory,
    childCategory: product.childCategory || fromCatalog.childCategory,
    categoryLabels: product.categoryLabels?.length
      ? product.categoryLabels
      : fromCatalog.categoryLabels,
    description: product.description || fromCatalog.description,
    keyFeatures: product.keyFeatures || fromCatalog.keyFeatures,
    sizeGuide: product.sizeGuide || fromCatalog.sizeGuide,
    colors: product.colors?.length ? product.colors : fromCatalog.colors,
    colorHexByName: product.colorHexByName ?? fromCatalog.colorHexByName,
    variants: product.variants?.length ? product.variants : fromCatalog.variants,
    // Garment images drive the live colour tint — fall back to the catalog
    // when the collection ref never captured them (e.g. the catalog product
    // wasn't loaded when the workspace was first mapped). Keep the design's
    // own baked mockup/placement untouched.
    maskImageUrl: product.maskImageUrl || fromCatalog.maskImageUrl,
    baseImageUrl: product.baseImageUrl || fromCatalog.baseImageUrl,
    maskBackImageUrl: product.maskBackImageUrl || fromCatalog.maskBackImageUrl,
    baseBackImageUrl: product.baseBackImageUrl || fromCatalog.baseBackImageUrl,
    maskLeftImageUrl: product.maskLeftImageUrl || fromCatalog.maskLeftImageUrl,
    baseLeftImageUrl: product.baseLeftImageUrl || fromCatalog.baseLeftImageUrl,
    maskRightImageUrl: product.maskRightImageUrl || fromCatalog.maskRightImageUrl,
    baseRightImageUrl: product.baseRightImageUrl || fromCatalog.baseRightImageUrl,
    photoUrl: product.photoUrl || fromCatalog.photoUrl,
    imageUrls: product.imageUrls?.length ? product.imageUrls : fromCatalog.imageUrls,
    imgUrl: product.imgUrl || fromCatalog.imgUrl,
    printAreas: product.printAreas?.length ? product.printAreas : fromCatalog.printAreas,
    physicalDimensions: product.physicalDimensions || fromCatalog.physicalDimensions,
    dpi: product.dpi ?? fromCatalog.dpi,
    price: product.price || fromCatalog.price,
    basePriceInr: product.basePriceInr ?? fromCatalog.basePriceInr,
    sw: product.sw ?? fromCatalog.sw,
  };
}

export function mapProductRef(ref: ApiProduct, catalogById?: Map<string, UiProduct>): UiProduct {
  const id = ref.catalogProductId ? String(ref.catalogProductId) : undefined;
  const fromCatalog = id ? catalogById?.get(id) : undefined;
  const photoUrl = resolveMediaUrl(
    ref.primaryImageUrl || ref.imageUrls?.[0] || fromCatalog?.photoUrl,
  );
  const baseImageUrl = resolveMediaUrl(ref.baseImageUrl) || fromCatalog?.baseImageUrl;
  const imgUrl = resolveMediaUrl(
    ref.maskImageUrl || ref.imgUrl || photoUrl || fromCatalog?.imgUrl,
  );
  return {
    id,
    g: ref.group || fromCatalog?.g || "tee",
    brand: ref.brand || fromCatalog?.brand || "",
    nm: ref.name,
    category: ref.category || fromCatalog?.category || "",
    description: ref.description || fromCatalog?.description || "",
    keyFeatures: ref.keyFeatures || fromCatalog?.keyFeatures || "",
    sizeGuide: ref.sizeGuide || fromCatalog?.sizeGuide || "",
    price: fromCatalog?.price || "",
    sw: fromCatalog?.sw ?? 4,
    colors: fromCatalog?.colors,
    colorHexByName: fromCatalog?.colorHexByName,
    variants: fromCatalog?.variants,
    photoUrl: photoUrl || fromCatalog?.photoUrl,
    baseImageUrl,
    imgUrl,
    maskImageUrl: resolveMediaUrl(ref.maskImageUrl) || fromCatalog?.maskImageUrl,
    baseBackImageUrl:
      resolveMediaUrl(ref.baseBackImageUrl) || fromCatalog?.baseBackImageUrl,
    maskBackImageUrl:
      resolveMediaUrl(ref.maskBackImageUrl) || fromCatalog?.maskBackImageUrl,
    baseLeftImageUrl:
      resolveMediaUrl(ref.baseLeftImageUrl) || fromCatalog?.baseLeftImageUrl,
    maskLeftImageUrl:
      resolveMediaUrl(ref.maskLeftImageUrl) || fromCatalog?.maskLeftImageUrl,
    baseRightImageUrl:
      resolveMediaUrl(ref.baseRightImageUrl) || fromCatalog?.baseRightImageUrl,
    maskRightImageUrl:
      resolveMediaUrl(ref.maskRightImageUrl) || fromCatalog?.maskRightImageUrl,
    mockupUrl: resolveMediaUrl(ref.mockupUrl),
    mockupBackUrl: resolveMediaUrl(ref.mockupBackUrl),
    placement: mapPlacement((ref as { placement?: unknown }).placement),
    areaPlacements: mapAreaPlacements(ref),
    printAreas: fromCatalog?.printAreas,
    physicalDimensions: fromCatalog?.physicalDimensions,
    dpi: fromCatalog?.dpi,
  };
}

function mapAreaPlacements(
  ref: ApiProduct,
): UiProduct["areaPlacements"] {
  const raw = (ref as { placements?: unknown }).placements;
  const out: NonNullable<UiProduct["areaPlacements"]> = {};
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || typeof row !== "object") continue;
      const key = String((row as { key?: string }).key || "").trim();
      const pl = mapPlacement(row);
      if (key && pl) {
        const art = String((row as { artworkUrl?: string }).artworkUrl || "").trim();
        out[key] = {
          ...pl,
          ...(art ? { artworkUrl: resolveMediaUrl(art) || art } : {}),
        };
      }
    }
  }
  if (!Object.keys(out).length) {
    const legacy = mapPlacement((ref as { placement?: unknown }).placement);
    if (legacy) out.area_1 = legacy;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Validate a stored artwork placement — all four numbers or nothing. */
export function mapPlacement(
  raw: unknown,
):
  | {
      xPct: number;
      yPct: number;
      wPct: number;
      rot: number;
      printCxPct?: number;
      printCyPct?: number;
      printWPct?: number;
    }
  | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const p = raw as Record<string, unknown>;
  const nums = [p.xPct, p.yPct, p.wPct, p.rot].map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return undefined;
  const printCxPct = Number(p.printCxPct);
  const printCyPct = Number(p.printCyPct);
  const printWPct = Number(p.printWPct);
  return {
    xPct: nums[0],
    yPct: nums[1],
    wPct: nums[2],
    rot: nums[3],
    ...(Number.isFinite(printCxPct) ? { printCxPct } : {}),
    ...(Number.isFinite(printCyPct) ? { printCyPct } : {}),
    ...(Number.isFinite(printWPct) ? { printWPct } : {}),
  };
}

export function mapShop(s: ApiProduct): UiShop {
  const currencyMode = normalizeCurrencyMode(
    (s as { currencyMode?: string }).currencyMode,
  );
  return {
    id: String(s._id),
    name: s.name,
    slug: String((s as { slug?: string }).slug || ""),
    currency: currencyKeyFromMode(currencyMode),
    currencyMode,
    pointsConversionEnabled: Boolean(s.pointsConversionEnabled),
    companyEmailDomain: String((s as { companyEmailDomain?: string }).companyEmailDomain || ""),
    live: s.status === "live",
    categories: s.categories || [],
    collections: [],
    selectedCatalogProductIds: Array.isArray(s.selectedCatalogProductIds)
      ? s.selectedCatalogProductIds.map(String)
      : [],
    featuredCatalogProductIds: Array.isArray((s as { featuredCatalogProductIds?: unknown }).featuredCatalogProductIds)
      ? ((s as { featuredCatalogProductIds: unknown[] }).featuredCatalogProductIds).map(String)
      : [],
    activeListingKeys: Array.isArray((s as { activeListingKeys?: unknown }).activeListingKeys)
      ? ((s as { activeListingKeys: unknown[] }).activeListingKeys).map(String)
      : [],
    featuredListingKeys: Array.isArray((s as { featuredListingKeys?: unknown }).featuredListingKeys)
      ? ((s as { featuredListingKeys: unknown[] }).featuredListingKeys).map(String)
      : [],
    logoUrl: s.logoUrl || "",
    bannerConfig: s.bannerConfig || {},
    createdAt: s.createdAt ? String(s.createdAt) : undefined,
    createdBy: s.createdBy || "",
  };
}

export function mapContact(c: ApiProduct): UiContact {
  const addr = c.address || {};
  const loc = [addr.city, addr.state, addr.country === "IN" ? "IN" : addr.country]
    .filter(Boolean)
    .join(", ");
  return {
    id: String(c._id),
    email: c.email,
    name: c.name,
    role: c.role || "Member",
    address: addr.line1 || "",
    loc,
    city: addr.city || "",
    state: addr.state || "",
    pincode: addr.pincode || "",
    country: addr.country || "",
    phone: c.phone || "",
    department: c.department || "",
    employeeCode: c.employeeCode || "",
    designation: c.designation || "",
    dateOfJoining: c.dateOfJoining ? String(c.dateOfJoining) : null,
    employmentStatus: c.employmentStatus || "",
    effectiveEmploymentStatus: c.effectiveEmploymentStatus || "",
  };
}

export function mapKit(k: ApiProduct): UiKit {
  const productRefs = Array.isArray(k.productRefs)
    ? k.productRefs.map((ref: ApiProduct) => ({
        catalogProductId: String(ref.catalogProductId ?? ""),
        brand: ref.brand || "",
        name: ref.name || "",
        group: ref.group || "",
        mockupUrl:
          resolveMediaUrl(ref.mockupUrl) ||
          (typeof ref.mockupUrl === "string" ? ref.mockupUrl : ""),
        placement: mapPlacement(ref.placement),
      }))
    : [];
  return {
    id: String(k._id),
    name: k.name,
    description: typeof k.description === "string" ? k.description : "",
    items: productRefs.length,
    status: k.status === "live" ? "live" : k.status === "archived" ? "archived" : "draft",
    sent: Boolean(k.lastSentAt),
    lastSentAt: k.lastSentAt ? String(k.lastSentAt) : undefined,
    productRefs,
    packaging: k.packaging || "none",
    designNotes: k.designNotes || "",
    artworkUrl:
      resolveMediaUrl(k.artworkUrl) ||
      (typeof k.artworkUrl === "string" ? k.artworkUrl : "") ||
      "",
    kitPrice:
      typeof k.kitPrice === "number" && Number.isFinite(k.kitPrice)
        ? Math.round(k.kitPrice)
        : undefined,
  };
}

export function mapCollection(c: ApiProduct, createdByName = "", catalogById?: Map<string, UiProduct>): UiCollection {
  const shopIds = Array.isArray((c as { shopIds?: unknown[] }).shopIds)
    ? (c as { shopIds: unknown[] }).shopIds.map(String)
    : c.shopId
      ? [String(c.shopId)]
      : [];
  return {
    id: String(c._id),
    code: c.code || "",
    name: c.name,
    created: formatDate(c.createdAt),
    by: createdByName,
    status: c.status || "draft",
    shopId: shopIds[0] || (c.shopId ? String(c.shopId) : ""),
    shopIds,
    artworkUrl: (c as { artworkUrl?: string }).artworkUrl || "",
    preferredColors: Array.isArray(c.preferredColors) ? c.preferredColors : [],
    products: (c.productRefs || []).map((ref: ApiProduct) => mapProductRef(ref, catalogById)),
    isShopSpecific: Boolean((c as { isShopSpecific?: boolean }).isShopSpecific),
    shopPublish: Array.isArray((c as { shopPublish?: Array<{ shopId: unknown; publishedAt?: string }> }).shopPublish)
      ? (c as { shopPublish: Array<{ shopId: unknown; publishedAt?: string }> }).shopPublish.map((p) => ({
          shopId: String(p.shopId),
          publishedAt: p.publishedAt,
        }))
      : [],
    createdAt: (c as { createdAt?: string }).createdAt,
  };
}

function mapOrderDisplayStatus(status: string): string {
  if (status === "delivered") return "Delivered";
  if (status === "shipped") return "Shipped";
  return "Processing";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapOrder(o: any, campaignName = ""): UiOrder {
  const deliveredEntry = (o.statusHistory || []).find((h: { status: string }) => h.status === "delivered");
  return {
    id: String(o._id),
    date: formatDate(o.createdAt),
    name: campaignName || o.orderNumber,
    orderNumber: o.orderNumber,
    status: mapOrderDisplayStatus(o.status),
    rawStatus: o.status,
    amount: o.amountBreakdown?.total ?? 0,
    track: o.trackingNumber || "",
    delivered: deliveredEntry ? formatDate(deliveredEntry.at) : "",
    items: (o.items || []).map((i: { name: string; qty: number }) => [i.name, String(i.qty)]),
    invoicePdfUrl: o.invoicePdfUrl || "",
    invoiceNumber: o.invoiceNumber || o.orderNumber,
  };
}

export function mapCampaign(c: ApiProduct): UiCampaign {
  const raw = c as {
    draftState?: UiCampaign["draftState"];
    schedule?: { mode?: string; timezone?: string; sendAt?: string };
  };
  const draftState = raw.draftState
    ? {
        step:
          raw.draftState.step === 0 ||
          raw.draftState.step === 1 ||
          raw.draftState.step === 2 ||
          raw.draftState.step === 3
            ? raw.draftState.step
            : undefined,
        selectedWalletId:
          typeof raw.draftState.selectedWalletId === "string"
            ? raw.draftState.selectedWalletId
            : undefined,
        selRecips: Array.isArray(raw.draftState.selRecips)
          ? raw.draftState.selRecips.map(String)
          : undefined,
        recips: typeof raw.draftState.recips === "number" ? raw.draftState.recips : undefined,
        pay: raw.draftState.pay === "wallet" || raw.draftState.pay === "card" ? raw.draftState.pay : undefined,
        preview:
          raw.draftState.preview === "landing" || raw.draftState.preview === "email"
            ? raw.draftState.preview
            : undefined,
        when:
          raw.draftState.when === "now" ||
          raw.draftState.when === "scheduled" ||
          raw.draftState.when === "self"
            ? raw.draftState.when
            : undefined,
      }
    : undefined;
  return {
    id: String(c._id),
    name: c.name,
    status: c.status,
    type: c.type,
    shopId: c.shopId ? String(c.shopId) : "",
    kitId: c.kitId ? String(c.kitId) : undefined,
    senderName:
      typeof (c as { message?: { from?: unknown } }).message?.from === "string"
        ? String((c as { message?: { from?: string } }).message?.from || "")
        : "",
    createdAt:
      typeof (c as { createdAt?: unknown }).createdAt === "string"
        ? String((c as { createdAt?: string }).createdAt || "")
        : undefined,
    recipientCount: (() => {
      const incomplete = ["draft", "recipients_uploaded", "credits_allocated", "approved"].includes(
        String(c.status),
      );
      const planned = draftState?.recips;
      if (incomplete && typeof planned === "number" && planned > 0) return planned;
      return c.recipientCount ?? 0;
    })(),
    totalBudget: c.totalBudget ?? 0,
    creditsPerRecipient: c.creditsPerRecipient ?? 0,
    pointsScope:
      (c as { pointsScope?: string }).pointsScope === "stadium" ||
      (c as { pointsScope?: string }).pointsScope === "shop"
        ? ((c as { pointsScope?: "stadium" | "shop" }).pointsScope as "stadium" | "shop")
        : undefined,
    messageBody:
      typeof (c as { message?: { body?: unknown } }).message?.body === "string"
        ? String((c as { message?: { body?: string } }).message?.body || "")
        : undefined,
    orderNumber:
      typeof (c as { orderNumber?: unknown }).orderNumber === "string"
        ? String((c as { orderNumber?: string }).orderNumber)
        : undefined,
    orderId: (c as { orderId?: unknown }).orderId
      ? String((c as { orderId?: string }).orderId)
      : undefined,
    draftState,
  };
}

export function mapWallet(w: ApiProduct, owner?: ApiUser): UiWallet {
  // Live cash balance (decreases on campaign_spend). Do not use totalAmount —
  // that is lifetime funded amount and never shrinks after sends.
  const balance = Math.round(Number(w.balance) || 0);
  const alloc = Math.round(Number(w.allocatedAmount) || 0);
  return {
    id: normalizeMongoId(w._id ?? w.id),
    name: w.name,
    cur: (w.currency || "INR").toUpperCase(),
    balance,
    unalloc: Math.max(0, balance - alloc),
    alloc,
    owner: owner?.name || "N/A",
    email: owner?.email || "",
    activity: [],
  };
}

export function mapEntityToDept(e: ApiEntity, usersById: Map<string, ApiUser>): UiOrgDept {
  const mgrRef = e.managerUserId;
  const mgr =
    mgrRef && typeof mgrRef === "object"
      ? mgrRef
      : mgrRef
        ? usersById.get(String(mgrRef))
        : null;
  const mgrName = mgr?.name?.trim() || e.managerName?.trim() || "";
  const mgrEmail = mgr?.email?.trim() || e.managerEmail?.trim() || "";
  const hasManager = Boolean(e.managerUserId || mgrEmail || mgrName);
  let inviteStatus: 'unassigned' | 'pending' | 'active' = 'unassigned';
  if (hasManager) {
    // Active ONLY when the linked user account is actually active.
    // Missing/deleted users, pending invites, or email-only drafts must not look Active.
    if (mgr?.status === 'active' && !e.managerInvitePending) {
      inviteStatus = 'active';
    } else if (e.managerUserId || e.managerInvitePending || mgr?.status === 'invited' || mgrEmail) {
      inviteStatus = 'pending';
    }
  }
  return {
    id: String(e._id),
    walletId: normalizeMongoId(e.walletId) || undefined,
    name: e.name,
    desc: e.description || "",
    users: e.expectedUsers ?? 0,
    allocated: e.allocatedAmount ?? 0,
    spent: e.spentAmount ?? 0,
    color: e.colorHex || "#2563EB",
    mgr: {
      name: mgrName,
      email: mgrEmail,
      mobile: mgr?.phone || "",
      role: e.managerTitle || (mgr ? "Entity Manager" : ""),
      invite: inviteStatus !== 'active',
      inviteStatus,
    },
  };
}

export function userInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

export function applyAuthUser(user: AuthUser, tenantName: string) {
  return {
    account: tenantName,
    user: { name: user.name, initials: userInitials(user.name), email: user.email },
  };
}
