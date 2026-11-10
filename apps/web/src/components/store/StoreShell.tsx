import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import "./store-catalog.css";
import { type StoreShop } from "../StoreBanner";
import { resolveColorHex } from "@/lib/colorMap";
import { curatedColorSwatches, productVariantSwatches } from "@/lib/variantColors";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { shopBannerPresetLabel, shopHeroBannerUrl } from "@/lib/shop-banners";
import { DesignedProductThumb,
  storeProductAsUi,
} from "@/features/swag/DesignedProductThumb";
import { getMockupTintHex, defaultWhiteColorIndex } from "@/features/swag/colors";
import { listPrintAreas, listProductViews, type ProductViewKey } from "@/features/swag/mockup-bake";
import { ShelfMerchLogo } from "@/components/brand/ShelfMerchLogo";
import {
  appliedLabel,
  formatStoreAmount,
  formatStoreBalance,
  formatStoreCardPrice,
  formatStorePrice,
  inrToPoints,
  myWalletLabel,
  rewardWalletLabel,
  type ShopCurrencyMode,
  unitLabel,
} from "@/lib/storeCurrency";
import { createRedemptionRazorpayOrder, type StoreSupportTicket } from "@/services/api-bridge";
import { openRazorpayCheckout } from "@/lib/razorpay";
import walletIconImg from "../../../assets/wallet-icon.svg";
import emptyBagImg from "../../../assets/empty-bag.svg";
import orderPlacedImg from "../../../assets/order-placed.png";
import { StoreAccountMenu, type StoreOrderItem, type StoreOrderSummary } from "./StoreAccountMenu";
import { StoreEmptyState } from "./StoreEmptyState";
import { StorePageShell } from "./StorePageShell";
import { HOME_RAIL_COUNT, StoreHomePage } from "./StoreHomePage";
import { SizeGuideTable } from "@/components/SizeGuideTable";
import { ProductInfoTabs } from "@/features/catalog/views/ProductInfoTabs";
import { CATALOG_SUBCATEGORIES } from "@/features/catalog/types";
import { CountrySelect } from "@/features/send/CountrySelect";
import {
  checkoutFormValid,
  checkoutPhonePrefix,
  sanitizeCheckoutField,
  validateCheckoutField,
  validateCheckoutForm,
  type CheckoutFieldKey,
  type CheckoutFormValues,
} from "./storeCheckoutValidation";

type PrintArea = {
  key?: string;
  label?: string;
  mockupImageUrl?: string;
  box: { xPct: number; yPct: number; widthPct: number; heightPct: number };
};

export type StoreProduct = {
  _id: string;
  catalogProductId?: string;
  collectionId?: string;
  name: string;
  brand?: string;
  group?: string;
  category?: string;
  /** Admin-assigned catalog subcategory (source of truth for shop PLP filters). */
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
  /** Pre-baked design mockup (mask + artwork flattened) — shown as-is when set. */
  mockupUrl?: string;
  /** Pre-baked back-view design mockup. */
  mockupBackUrl?: string;
  /** Saved Konva placement — keeps live colour previews aligned with the bake. */
  placement?: {
    xPct: number;
    yPct: number;
    wPct: number;
    rot: number;
    printCxPct?: number;
    printCyPct?: number;
    printWPct?: number;
  };
  /** Per print-area placements + artwork URLs (multi-area colour tints). */
  placements?: Array<{
    key: string;
    xPct: number;
    yPct: number;
    wPct: number;
    rot: number;
    printCxPct?: number;
    printCyPct?: number;
    printWPct?: number;
    artworkUrl?: string;
  }>;
  preferredColors?: string[];
  printAreas?: PrintArea[];
  variants?: Array<{ size?: string; color?: string; colorHex?: string; material?: string; sku?: string }>;
};

function distinct(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((v): v is string => !!v)));
}

function primaryColorIndex(colors: Array<{ name: string; hex: string }>) {
  return defaultWhiteColorIndex(colors);
}

function productColorOptions(p: StoreProduct): Array<{ name: string; hex: string }> {
  return curatedColorSwatches(productVariantSwatches(p), p.preferredColors);
}

function ArtworkMockup({
  product,
  tintHex,
  view,
  onViewChange,
  hoverSwapViews,
  frontOnly,
  viewTogglePlacement,
  className,
  style,
}: {
  product: StoreProduct;
  tintHex?: string;
  view?: ProductViewKey;
  onViewChange?: (view: ProductViewKey) => void;
  hoverSwapViews?: boolean;
  frontOnly?: boolean;
  viewTogglePlacement?: "overlay" | "below";
  className?: string;
  style?: CSSProperties;
}) {
  const raw = storeProductAsUi(product);
  const canPrint = listPrintAreas(raw).length > 0;
  const ui = canPrint
    ? raw
    : {
        ...raw,
        mockupUrl: undefined,
        mockupBackUrl: undefined,
        placement: undefined,
        areaPlacements: undefined,
      };
  if (!ui.imgUrl && !ui.mockupUrl && !ui.mockupBackUrl && !(canPrint && product.artworkUrl)) {
    return (
      <div className={className} style={{ display: "grid", placeItems: "center", height: "100%", ...style }}>
        <span className="mut3" style={{ fontSize: 12 }}>No image</span>
      </div>
    );
  }
  return (
    <DesignedProductThumb
      product={ui}
      artworkUrl={canPrint ? product.artworkUrl : undefined}
      tintHex={tintHex}
      view={view}
      onViewChange={onViewChange}
      hoverSwapViews={hoverSwapViews}
      frontOnly={frontOnly}
      viewTogglePlacement={viewTogglePlacement}
      className={className}
      style={style}
    />
  );
}

function productViewKeys(product: StoreProduct): ProductViewKey[] {
  return listProductViews(storeProductAsUi(product));
}

function viewAriaLabel(view: ProductViewKey) {
  if (view === "front") return "Front view";
  if (view === "back") return "Back view";
  if (view === "left") return "Left side";
  return "Right side";
}

function ColorSwatches({
  colors,
  selected,
  onSelect,
  size = "md",
  className,
}: {
  colors: Array<{ name: string; hex: string }>;
  selected: number;
  onSelect: (index: number) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  if (!colors.length) return null;
  const btnClass = size === "sm" ? "sw" : "pd-sw";
  const wrapClass = size === "sm" ? "swatches" : "pd-swatches";
  return (
    <div className={className ? `${wrapClass} ${className}` : wrapClass}>
      {colors.map((c, i) => (
        <button
          key={c.name}
          type="button"
          className={`${btnClass} ${i === selected ? "on" : ""}`}
          style={{ background: c.hex }}
          onClick={() => onSelect(i)}
          title={c.name}
          aria-label={c.name}
          aria-pressed={i === selected}
        />
      ))}
    </div>
  );
}

export type CheckoutItem = { productId: string; qty: number; variant?: { size?: string; color?: string } };
export type CheckoutPayment = {
  mode: "points" | "points_upi" | "upi";
  razorpay?: {
    orderId: string;
    paymentId: string;
    signature: string;
  };
};
export type ShippingAddress = {
  name: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
};

type AddedToBagInfo = {
  name: string;
  brand: string;
  linePriceInr: number;
  qty: number;
  image?: string;
};

type Mode = "preview" | "redeem" | "store";
type Page = "home" | "products" | "product" | "cart" | "checkout" | "done" | "orders" | "order-detail" | "support";

const SUPPORT_TYPE_LABELS: Record<string, string> = {
  delivery_issue: "Delivery issue",
  address_change: "Address change",
  replacement: "Replacement",
  redemption_issue: "Redemption issue",
  billing: "Billing",
  other: "Other",
};

type CartLine = {
  key: string;
  productId: string;
  name: string;
  brand?: string;
  priceInr: number;
  qty: number;
  variant?: { size?: string; color?: string };
  image?: string;
};

const HOME_BADGES = ["Best seller", "Popular", "Trending"] as const;

/** Only a few cards get a promo tag — roughly 2 per 5-product rail. */
function homeBadgeForIndex(index: number): string | undefined {
  if (index !== 0 && index !== 2) return undefined;
  return HOME_BADGES[index === 0 ? 0 : 1];
}

/** Stable shuffle so guest recommendations don't flicker every render. */
function seededShuffle<T>(items: T[], seed: string): T[] {
  const out = [...items];
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  for (let i = out.length - 1; i > 0; i--) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    const j = Math.abs(h) % (i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function productMatchesSignal(p: StoreProduct, signalIds: Set<string>): boolean {
  if (signalIds.has(p._id)) return true;
  if (p.catalogProductId && signalIds.has(p.catalogProductId)) return true;
  if (p.collectionId && p.catalogProductId && signalIds.has(`${p.collectionId}:${p.catalogProductId}`)) {
    return true;
  }
  return false;
}

/**
 * Recommended rail: cart + purchase signals for returning shoppers;
 * stable random sample for guests / new users with no history.
 * Prefers products outside `preferExcludeIds` (New arrivals) so the two
 * home rails are not identical when the catalog is large enough.
 */
function pickRecommendedProducts(
  products: StoreProduct[],
  cart: CartLine[],
  orders: StoreOrderSummary[],
  seed: string,
  count = HOME_RAIL_COUNT,
  preferExcludeIds?: Set<string>,
): StoreProduct[] {
  if (!products.length || count <= 0) return [];

  const exclude = preferExcludeIds ?? new Set<string>();
  const outsideNew = products.filter((p) => !exclude.has(p._id));
  const insideNew = products.filter((p) => exclude.has(p._id));

  const signalIds = new Set<string>();
  for (const line of cart) {
    if (line.productId) signalIds.add(line.productId);
  }
  for (const order of orders) {
    for (const item of order.items || []) {
      if (item.catalogProductId) signalIds.add(item.catalogProductId);
      if (item.collectionId && item.catalogProductId) {
        signalIds.add(`${item.collectionId}:${item.catalogProductId}`);
      }
    }
  }

  let picked: StoreProduct[];

  if (signalIds.size === 0) {
    // Guests / new users: randomize from non-new-arrivals first, then fill.
    picked = [
      ...seededShuffle(outsideNew, `${seed}:rec`),
      ...seededShuffle(insideNew, `${seed}:rec-fill`),
    ].slice(0, Math.min(count, products.length));
  } else {
    const matched: StoreProduct[] = [];
    const relatedOut: StoreProduct[] = [];
    const relatedIn: StoreProduct[] = [];
    const restOut: StoreProduct[] = [];
    const restIn: StoreProduct[] = [];
    const matchedCats = new Set<string>();

    for (const p of products) {
      if (productMatchesSignal(p, signalIds)) {
        matched.push(p);
        if (p.category) matchedCats.add(p.category);
      }
    }
    for (const p of products) {
      if (productMatchesSignal(p, signalIds)) continue;
      const inNew = exclude.has(p._id);
      if (p.category && matchedCats.has(p.category)) {
        (inNew ? relatedIn : relatedOut).push(p);
      } else {
        (inNew ? restIn : restOut).push(p);
      }
    }

    picked = [
      ...matched,
      ...relatedOut,
      ...restOut,
      ...relatedIn,
      ...restIn,
    ].slice(0, Math.min(count, products.length));
  }

  // Tiny catalogs can still force the same items — change order so rails differ.
  const newArrivalList = insideNew.slice(0, count);
  const identicalOrder =
    picked.length === newArrivalList.length &&
    picked.length > 1 &&
    picked.every((p, i) => p._id === newArrivalList[i]?._id);
  if (identicalOrder) {
    return [...picked].reverse();
  }

  return picked;
}

const CART_STORAGE_PREFIX = "shelf-merch:cart:v1:";

function cartStorageKey(persistId?: string) {
  return persistId ? `${CART_STORAGE_PREFIX}${persistId}` : null;
}

function readStoredCart(key: string): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (line): line is CartLine =>
        !!line &&
        typeof line === "object" &&
        typeof (line as CartLine).key === "string" &&
        typeof (line as CartLine).productId === "string" &&
        typeof (line as CartLine).qty === "number" &&
        (line as CartLine).qty > 0,
    );
  } catch {
    return [];
  }
}

function reconcileCartLines(lines: CartLine[], products: StoreProduct[], shopName: string): CartLine[] {
  if (!products.length) return lines;
  return lines
    .filter((line) => products.some((p) => p._id === line.productId))
    .map((line) => {
      const product = products.find((p) => p._id === line.productId);
      if (!product) return line;
      return {
        ...line,
        name: product.name,
        brand: product.brand || shopName,
        priceInr: product.basePriceInr,
        image: storeProductThumb(product),
      };
    });
}

function persistStoredCart(key: string, cart: CartLine[]) {
  if (typeof window === "undefined") return;
  try {
    if (cart.length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(cart));
  } catch {
    // Private mode / quota — cart still works for this session.
  }
}

function productImage(p: StoreProduct) {
  return resolveMediaUrl(p.primaryImageUrl || p.imageUrls?.[0] || p.maskImageUrl || "");
}

function storeProductThumb(p: StoreProduct) {
  return resolveMediaUrl(p.mockupUrl) || resolveMediaUrl(p.mockupBackUrl) || productImage(p);
}

/* ─── SVG Icons (inline for zero dependencies) ─── */
function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.39 6.96H22l-5.8 4.21 2.22 6.83L12 16.9l-6.42 4.1 2.22-6.83L2 8.96h7.61L12 2z" />
    </svg>
  );
}

function PointsIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" style={{ flex: "none" }}>
      <circle cx="12" cy="12" r="10" opacity=".15" /><path d="M12 2a10 10 0 1010 10A10 10 0 0012 2zm0 18a8 8 0 118-8 8 8 0 01-8 8z" /><path d="M15.09 11.41l-2.59-1.5V7a.5.5 0 00-1 0v3.18a.5.5 0 00.25.43l2.84 1.64a.5.5 0 00.5-.87z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function ZoomIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 18V6a2 2 0 00-2-2H4a2 2 0 00-2 2v11a1 1 0 001 1h2" />
      <path d="M15 18h2a1 1 0 001-1v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.316.948V17a1 1 0 001 1h1" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  );
}

function LeafIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 20A7 7 0 019.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M5 12h14" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12l3 3 5-6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function ShoppingBagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0" />
    </svg>
  );
}

function GiftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="13" rx="2" />
      <path d="M12 8v13M3 12h18M12 8c-2-2.5-5-3-5 0s3 2 5 0 5-2.5 5 0-3-3-5 0" />
    </svg>
  );
}

function PlayCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M10 8l6 4-6 4V8z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      className={className || "topbar-chevron"}
      width={11}
      height={11}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16.5 9.4 7.55 4.24" />
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" />
    </svg>
  );
}

function UserFieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21a8 8 0 00-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function BriefcaseFieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2M2 13h20" />
    </svg>
  );
}

function GlobeFieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  );
}

function PhoneFieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.8 19.8 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.8 19.8 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}

function MapPinFieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function BuildingFieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 9h.01M15 9h.01M9 13h.01M15 13h.01" />
    </svg>
  );
}

function MapFieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z" />
      <path d="M9 3v15M15 6v15" />
    </svg>
  );
}

function ZipFieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 10h4M7 14h2M15 10h2M15 14h2" />
    </svg>
  );
}

function SummaryDocIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  );
}

function WalletMiniIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8h15a3 3 0 013 3v7a3 3 0 01-3 3H6a3 3 0 01-3-3V8z" />
      <path d="M3 8V6a2 2 0 012-2h12" />
      <circle cx="17" cy="14.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function formatOrderStatus(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatOrderDate(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatOrderTime(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function orderStatusDisplay(order: StoreOrderSummary) {
  const status = order.status.toLowerCase();
  const historyDate =
    order.statusHistory?.find((h) => h.status === order.status)?.at ||
    order.statusHistory?.[order.statusHistory.length - 1]?.at ||
    order.createdAt;
  const date = formatOrderDate(historyDate);

  if (status === "delivered") {
    return {
      tone: "delivered" as const,
      title: "Delivered",
      message: date ? `Delivered on ${date}` : "Your item has been delivered",
    };
  }
  if (status === "cancelled") {
    return {
      tone: "danger" as const,
      title: "Cancelled",
      message: date ? `Cancelled on ${date}` : "Your order was cancelled",
    };
  }
  if (["shipped", "packed", "in_production", "qc_pending"].includes(status)) {
    return {
      tone: "shipped" as const,
      title: "Shipped",
      message: "Your order is on the way",
    };
  }
  return {
    tone: "placed" as const,
    title: "Order placed",
    message: "Your order has been confirmed",
  };
}

function orderItemImage(url?: string) {
  return url ? resolveMediaUrl(url) : "";
}

function findStoreProductForOrderItem(products: StoreProduct[], item?: StoreOrderItem) {
  const catalogId = item?.catalogProductId?.trim();
  const collectionId = item?.collectionId?.trim();
  if (collectionId && catalogId) {
    const branded = products.find(
      (p) =>
        p.collectionId === collectionId &&
        (p.catalogProductId === catalogId || p._id === `${collectionId}:${catalogId}`),
    );
    if (branded) return branded;
  }
  if (!catalogId) return undefined;
  return products.find(
    (p) =>
      p.catalogProductId === catalogId ||
      p._id === catalogId ||
      (p._id.includes(":") && p._id.split(":").pop() === catalogId),
  );
}

function orderItemKey(item: StoreOrderItem, idx: number) {
  return `${item.collectionId || ""}:${item.catalogProductId || item.name}:${idx}`;
}

function orderItemTintHex(product: StoreProduct | undefined, color?: string) {
  if (!color || !product) return undefined;
  return resolveColorHex(color, product.variants?.find((v) => v.color === color)?.colorHex);
}

function orderItemLinePrice(item?: StoreOrderItem) {
  if (item?.unitPriceInr == null) return null;
  return item.unitPriceInr * (item.qty || 1);
}

function OrderItemVariants({
  item,
  products,
  className,
  layout = "row",
}: {
  item?: StoreOrderItem;
  products: StoreProduct[];
  className?: string;
  layout?: "row" | "detail";
}) {
  const color = item?.variant?.color;
  const size = item?.variant?.size;
  if (!color && !size) return null;

  const product = findStoreProductForOrderItem(products, item);
  const colorHex = color
    ? resolveColorHex(color, product?.variants?.find((v) => v.color === color)?.colorHex)
    : undefined;

  if (layout === "detail") {
    return (
      <div className="sf-order-detail-variant-row">
        {color ? (
          <span className="sf-order-detail-chip">
            <span className="sf-order-color-swatch" style={{ background: colorHex }} title={color} aria-hidden="true" />
            {color}
          </span>
        ) : null}
        {size ? <span className="sf-order-detail-chip">Size {size}</span> : null}
      </div>
    );
  }

  return (
    <>
      {color ? (
        <div className={className}>
          Color:{" "}
          <span className="sf-order-color-swatch" style={{ background: colorHex }} title={color} aria-hidden="true" />
          {color}
        </div>
      ) : null}
      {size ? <div className={className}>Size: {size}</div> : null}
    </>
  );
}

function OrderItemLine({
  item,
  products,
  priceLabel,
  layout,
}: {
  item: StoreOrderItem;
  products: StoreProduct[];
  priceLabel: (inr: number) => string;
  layout: "row" | "detail";
}) {
  const linePrice = orderItemLinePrice(item);

  if (layout === "row") {
    return (
      <div className="sf-order-row-item">
        <div className="sf-order-row-img">
          <OrderItemThumb item={item} products={products} layout="row" />
        </div>
        <div className="sf-order-row-main">
          <div className="sf-order-row-title">{item.name}</div>
          <OrderItemVariants item={item} products={products} className="sf-order-row-variant" />
        </div>
        <div className="sf-order-row-price">
          {linePrice != null ? priceLabel(linePrice) : "—"}
        </div>
      </div>
    );
  }

  return (
    <div className="sf-order-detail-product">
      <div className="sf-order-detail-product-media">
        <OrderItemThumb item={item} products={products} layout="detail" />
      </div>
      <div className="sf-order-detail-product-copy">
        <h3 className="sf-order-detail-title">{item.name}</h3>
        <OrderItemVariants item={item} products={products} layout="detail" />
        <div className="sf-order-detail-product-foot">
          {item.qty && item.qty > 1 ? (
            <span className="sf-order-detail-qty">Qty {item.qty}</span>
          ) : null}
          <span className="sf-order-detail-price">
            {linePrice != null ? priceLabel(linePrice) : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

function OrderItemThumb({
  item,
  products,
  className,
  layout = "row",
}: {
  item?: StoreOrderItem;
  products: StoreProduct[];
  className?: string;
  layout?: "row" | "detail";
}) {
  const product = findStoreProductForOrderItem(products, item);
  const tintHex = orderItemTintHex(product, item?.variant?.color);
  const canTint = !!(product && item?.variant?.color && (product.maskImageUrl || product.artworkUrl));

  if (canTint && product) {
    return (
      <ArtworkMockup
        product={product}
        tintHex={tintHex}
        className={className}
        frontOnly={layout === "row"}
        viewTogglePlacement={layout === "detail" ? "below" : "overlay"}
      />
    );
  }

  const img = orderItemImage(item?.imageUrl);
  if (img) {
    const image = <img src={img} alt="" className={className} />;
    if (layout === "detail") {
      return <div className="dpt-stack"><div className="dpt-stack-image">{image}</div></div>;
    }
    return image;
  }
  if (layout === "detail") {
    return (
      <div className="dpt-stack">
        <div className="dpt-stack-image"><PackageIcon /></div>
      </div>
    );
  }
  return <PackageIcon />;
}

function truncTopbarName(name: string, max = 8) {
  const n = name.trim();
  return n.length > max ? `${n.slice(0, max - 1)}…` : n;
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function StoreShell({
  shop,
  products,
  mode,
  currency = "inr",
  creditInr,
  recipientName,
  recipientEmail,
  welcome,
  redemptionToken,
  sessionToken,
  cartPersistId,
  initialShippingAddress,
  onCheckout,
  onLogout,
  onRequireAuth,
  authenticated = false,
  onFetchOrders,
  onFetchTickets,
  onRaiseTicket,
  onReplyTicket,
  onConfirmTicket,
}: {
  shop: StoreShop;
  products: StoreProduct[];
  mode: Mode;
  currency?: ShopCurrencyMode;
  creditInr?: number;
  recipientName?: string;
  recipientEmail?: string;
  /** Prefill from Contacts (admin-entered). Edits stay on this order only. */
  initialShippingAddress?: Partial<ShippingAddress> | null;
  welcome?: string;
  redemptionToken?: string;
  sessionToken?: string;
  /** Scope cart persistence across page refreshes (redemption token or shop id). */
  cartPersistId?: string;
  /** Public storefront: prompt sign-in before cart actions. */
  onRequireAuth?: () => void;
  authenticated?: boolean;
  onCheckout?: (
    items: CheckoutItem[],
    address: ShippingAddress,
    payment?: CheckoutPayment,
  ) => Promise<{
    orderNumber: string;
    remainingCredit?: number;
  }>;
  onLogout?: () => void;
  onFetchOrders?: () => Promise<{ orders: StoreOrderSummary[]; creditAmount: number }>;
  onFetchTickets?: () => Promise<{ items: StoreSupportTicket[] }>;
  onRaiseTicket?: (body: {
    subject: string;
    description?: string;
    type?: string;
  }) => Promise<StoreSupportTicket>;
  onReplyTicket?: (ticketId: string, body: string) => Promise<StoreSupportTicket>;
  onConfirmTicket?: (ticketId: string) => Promise<StoreSupportTicket>;
}) {
  const storageKey = cartStorageKey(cartPersistId);
  const isShopper = mode === "redeem" || mode === "store";
  const [page, setPage] = useState<Page>("home");
  const [plpCategoryNavigate, setPlpCategoryNavigate] = useState<{ category: string | null; at: number } | null>(
    null,
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>(() => (storageKey ? readStoredCart(storageKey) : []));
  const [error, setError] = useState("");
  const [placing, setPlacing] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [balanceInr, setBalanceInr] = useState(creditInr);
  const [orders, setOrders] = useState<StoreOrderSummary[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<string | null>(null);
  const [tickets, setTickets] = useState<StoreSupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsError, setTicketsError] = useState("");
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [ticketReply, setTicketReply] = useState("");
  const [ticketBusy, setTicketBusy] = useState(false);
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketType, setTicketType] = useState("other");
  const [ticketDetails, setTicketDetails] = useState("");
  const [address, setAddress] = useState<ShippingAddress>(() => ({
    name: initialShippingAddress?.name || recipientName || "",
    phone: initialShippingAddress?.phone || "",
    line1: initialShippingAddress?.line1 || "",
    line2: initialShippingAddress?.line2 || "",
    city: initialShippingAddress?.city || "",
    state: initialShippingAddress?.state || "",
    pincode: initialShippingAddress?.pincode || "",
    country: initialShippingAddress?.country || "IN",
  }));
  const [searchQuery, setSearchQuery] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const [checkoutFirst, setCheckoutFirst] = useState(() => {
    const full = (initialShippingAddress?.name || recipientName || "").trim();
    return full.split(/\s+/)[0] || "";
  });
  const [checkoutLast, setCheckoutLast] = useState(() => {
    const full = (initialShippingAddress?.name || recipientName || "").trim();
    return full.split(/\s+/).slice(1).join(" ") || "";
  });
  const [checkoutShowErrors, setCheckoutShowErrors] = useState(false);
  const [checkoutTouched, setCheckoutTouched] = useState<Partial<Record<CheckoutFieldKey, boolean>>>({});
  /** @deprecated Manual continue step — Pay Now now tracks form validity directly. */
  const [shippingConfirmed, setShippingConfirmed] = useState(false);
  const checkoutSummaryRef = useRef<HTMLElement>(null);
  const shippingPrefillDone = useRef(false);
  const [useRewardPoints, setUseRewardPoints] = useState(true);
  const [addedToBag, setAddedToBag] = useState<AddedToBagInfo | null>(null);
  const catalogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const base = "ShelfMerch";
    const name = (shop?.name || "").trim();
    document.title = name ? `${name} | ${base}` : base;
  }, [shop?.name]);

  useEffect(() => {
    setBalanceInr(creditInr);
  }, [creditInr]);

  // Prefill checkout from Contacts once (admin-saved address). Recipient edits are local only.
  useEffect(() => {
    if (shippingPrefillDone.current || !initialShippingAddress) return;
    const hasAddress = Boolean(
      initialShippingAddress.line1?.trim() ||
        initialShippingAddress.city?.trim() ||
        initialShippingAddress.pincode?.trim() ||
        initialShippingAddress.phone?.trim(),
    );
    if (!hasAddress && !initialShippingAddress.name?.trim()) return;
    shippingPrefillDone.current = true;
    const fullName = (initialShippingAddress.name || recipientName || "").trim();
    const parts = fullName.split(/\s+/).filter(Boolean);
    setCheckoutFirst(parts[0] || "");
    setCheckoutLast(parts.slice(1).join(" ") || "");
    setAddress({
      name: fullName,
      phone: initialShippingAddress.phone || "",
      line1: initialShippingAddress.line1 || "",
      line2: initialShippingAddress.line2 || "",
      city: initialShippingAddress.city || "",
      state: initialShippingAddress.state || "",
      pincode: initialShippingAddress.pincode || "",
      country: initialShippingAddress.country || "IN",
    });
  }, [initialShippingAddress, recipientName]);

  useEffect(() => {
    if (!storageKey || products.length === 0) return;
    setCart((prev) => reconcileCartLines(prev.length ? prev : readStoredCart(storageKey), products, shop.name));
  }, [storageKey, products, shop.name]);

  useEffect(() => {
    if (!storageKey) return;
    persistStoredCart(storageKey, cart);
  }, [storageKey, cart]);

  useEffect(() => {
    if (page === "orders") void refreshOrders();
  }, [page]);

  // Prefetch order history for personalized home recommendations (signed-in only).
  useEffect(() => {
    if (!authenticated || !onFetchOrders) return;
    if (orders.length > 0) return;
    void refreshOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot when session becomes available
  }, [authenticated, onFetchOrders]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [page]);

  useEffect(() => {
    if (!addedToBag) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAddedToBag(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addedToBag]);

  useEffect(() => {
    if (page !== "checkout") {
      return;
    }
    // Only seed name fields from recipient when they are still empty (avoid clobbering prefill/edits).
    if (checkoutFirst.trim() || checkoutLast.trim()) return;
    const full = (address.name || recipientName || "").trim();
    if (!full) return;
    const parts = full.split(/\s+/);
    setCheckoutFirst(parts[0] || "");
    setCheckoutLast(parts.slice(1).join(" ") || "");
  }, [page, recipientName, address.name, checkoutFirst, checkoutLast]);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const active = products.find((p) => p._id === activeId) || null;
  const cartCount = cart.reduce((n, l) => n + l.qty, 0);
  const cartTotalInr = cart.reduce((n, l) => n + l.priceInr * l.qty, 0);
  const storeCurrency: ShopCurrencyMode = currency ?? "points";
  const usesPointsDisplay = storeCurrency === "points";
  const creditUnit = unitLabel(storeCurrency);
  const pointsAvailable = balanceInr ?? 0;
  const pointsApplied = useRewardPoints ? Math.min(pointsAvailable, cartTotalInr) : 0;
  const upiDueInr = useRewardPoints ? Math.max(0, cartTotalInr - pointsApplied) : cartTotalInr;
  const hasEnoughPoints = balanceInr != null && cartTotalInr <= balanceInr;
  const paysWithUpi = isShopper && upiDueInr > 0;
  const canCheckout = !isShopper || cart.length > 0;

  const checkoutValues = useMemo<CheckoutFormValues>(
    () => ({
      firstName: checkoutFirst,
      lastName: checkoutLast,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2 || "",
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      country: address.country || "IN",
    }),
    [checkoutFirst, checkoutLast, address],
  );

  const shippingValid = useMemo(() => checkoutFormValid(checkoutValues), [checkoutValues]);

  function markCheckoutTouched(key: CheckoutFieldKey) {
    setCheckoutTouched((prev) => ({ ...prev, [key]: true }));
  }

  function shouldShowCheckoutError(key: CheckoutFieldKey): boolean {
    const error = validateCheckoutField(key, checkoutValues);
    if (!error) return false;
    const value = checkoutValues[key];
    return Boolean(checkoutShowErrors || checkoutTouched[key] || (typeof value === "string" && value.trim()));
  }

  function checkoutFieldError(key: CheckoutFieldKey): string | null {
    return shouldShowCheckoutError(key) ? validateCheckoutField(key, checkoutValues) : null;
  }

  function checkoutInputClass(invalid: boolean) {
    return `sf-checkout-inp sf-checkout-inp--icon${invalid ? " sf-checkout-inp--invalid" : ""}`;
  }

  const selectedOrder = useMemo(
    () => (selectedOrderNumber ? orders.find((o) => o.orderNumber === selectedOrderNumber) : undefined),
    [orders, selectedOrderNumber],
  );

  function fmt(inr: number) {
    return formatStorePrice(inr, storeCurrency);
  }

  function fmtUpiAmount(inr: number) {
    return `₹${inr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  /** Stadium-style product price — points stores show Pts only; INR stores show ₹ only. */
  function fmtCardPrice(inr: number) {
    return formatStoreCardPrice(inr, storeCurrency);
  }

  function navBalanceLabel() {
    return storeCurrency === "inr" ? "Credits" : "Points";
  }

  function navBalanceValue(inr: number) {
    return formatStoreBalance(inr, storeCurrency);
  }

  function fmtApplied(inr: number) {
    return storeCurrency === "inr" ? formatStoreAmount(inr, storeCurrency) : fmtCardPrice(inr);
  }

  /** Checkout "You pay" — 0 when wallet covers all; partial shows Pts (₹). */
  function fmtYouPayDue(inr: number) {
    if (inr <= 0) {
      return storeCurrency === "inr" ? "₹0 Credits" : "0 Pts";
    }
    if (storeCurrency === "points") {
      return `${inrToPoints(inr).toLocaleString("en-IN")} Pts (${fmtUpiAmount(inr)})`;
    }
    return fmtUpiAmount(inr);
  }

  function youPayAmountInr() {
    if (!isShopper) return cartTotalInr;
    if (!useRewardPoints) return cartTotalInr;
    return upiDueInr;
  }

  async function collectRazorpayPayment(amountInr: number) {
    if (!redemptionToken || !sessionToken) {
      throw new Error("Payment session expired — refresh and try again.");
    }
    const order = await createRedemptionRazorpayOrder(redemptionToken, sessionToken, amountInr);
    const response = await new Promise<{
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    }>((resolve, reject) => {
      void openRazorpayCheckout({
        order: { ...order, walletId: order.paymentId },
        description: `Pay ${fmtUpiAmount(amountInr)} via UPI`,
        onSuccess: resolve,
        onDismiss: () => reject(new Error("Payment cancelled")),
      }).catch(reject);
    });
    return {
      orderId: response.razorpay_order_id,
      paymentId: response.razorpay_payment_id,
      signature: response.razorpay_signature,
    };
  }

  function fmtCheckoutInr(inr: number) {
    return `INR ${inr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function checkoutPaymentMode(): CheckoutPayment["mode"] {
    if (!useRewardPoints) return "upi";
    if (hasEnoughPoints) return "points";
    return "points_upi";
  }

  function resetCheckoutProgress() {
    // Kept for potential restore of the manual "Continue to order summary" step.
    // Pay Now now reacts to shippingValid automatically.
    setShippingConfirmed(false);
  }

  function buildAddressFromCheckout(): ShippingAddress {
    return {
      ...address,
      name: [checkoutFirst, checkoutLast].filter(Boolean).join(" ").trim(),
    };
  }

  function continueToOrderSummary() {
    const next = buildAddressFromCheckout();
    const missing = (["name", "phone", "line1", "city", "state", "pincode"] as const).filter(
      (k) => !(k === "name" ? next.name : next[k]).trim(),
    );
    if (missing.length) {
      setError("Please complete all required shipping fields.");
      return;
    }
    setAddress(next);
    setError("");
    setShippingConfirmed(true);
    window.setTimeout(() => {
      checkoutSummaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function openProduct(id: string) {
    setActiveId(id);
    setPage("product");
  }

  function browseRewards(category: string | null = null) {
    setPlpCategoryNavigate({ category, at: Date.now() });
    setPage("products");
  }

  function goHowItWorks() {
    const scroll = () => catalogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (page !== "home") {
      setPage("home");
      window.setTimeout(scroll, 80);
    } else {
      scroll();
    }
  }

  function onHeaderSearch(q: string) {
    setSearchQuery(q);
    const trimmed = q.trim();
    if (trimmed && page !== "products" && page !== "product") {
      setPage("products");
    }
  }

  function addToCart(p: StoreProduct, variant: { size?: string; color?: string }, qty: number) {
    if (mode === "store" && !authenticated) {
      onRequireAuth?.();
      return;
    }
    const key = `${p._id}|${variant.size || ""}|${variant.color || ""}`;
    const existing = cart.find((l) => l.key === key);
    const next = existing
      ? cart.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l))
      : [
          ...cart,
          {
            key,
            productId: p._id,
            name: p.name,
            brand: p.brand || shop.name,
            priceInr: p.basePriceInr,
            qty,
            variant: variant.size || variant.color ? variant : undefined,
            image: storeProductThumb(p),
          },
        ];
    setCart(next);
    setAddedToBag({
      name: p.name,
      brand: p.brand || shop.name,
      linePriceInr: p.basePriceInr * qty,
      qty,
      image: storeProductThumb(p),
    });
  }

  function closeAddedToBag() {
    setAddedToBag(null);
  }

  function viewBagFromModal() {
    setAddedToBag(null);
    setPage("cart");
  }

  function checkoutFromModal() {
    setAddedToBag(null);
    setPage("checkout");
  }

  function setLineQty(key: string, qty: number) {
    setCart((prev) =>
      qty <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, qty } : l)),
    );
  }

  function bumpLineQty(key: string, delta: number) {
    const line = cart.find((l) => l.key === key);
    if (!line) return;
    setLineQty(key, line.qty + delta);
  }

  function clearCart() {
    setCart([]);
  }

  function editCartLine(productId: string) {
    setActiveId(productId);
    setPage("product");
  }

  async function refreshOrders() {
    if (!onFetchOrders) return;
    setOrdersLoading(true);
    setOrdersError("");
    try {
      const data = await onFetchOrders();
      setOrders(data.orders);
      if (data.creditAmount != null) setBalanceInr(data.creditAmount);
    } catch (err) {
      setOrdersError(err instanceof Error ? err.message : "Could not load orders");
    } finally {
      setOrdersLoading(false);
    }
  }

  async function refreshTickets() {
    if (!onFetchTickets) return;
    setTicketsLoading(true);
    setTicketsError("");
    try {
      const data = await onFetchTickets();
      setTickets(data.items);
    } catch (err) {
      setTicketsError(err instanceof Error ? err.message : "Could not load tickets");
    } finally {
      setTicketsLoading(false);
    }
  }

  function openSupport() {
    setPage("support");
    void refreshTickets();
  }

  async function raiseTicket() {
    if (!onRaiseTicket || !ticketSubject.trim()) return;
    setTicketBusy(true);
    setTicketsError("");
    try {
      await onRaiseTicket({
        subject: ticketSubject.trim(),
        description: ticketDetails.trim(),
        type: ticketType,
      });
      setTicketSubject("");
      setTicketDetails("");
      setTicketType("other");
      setShowTicketForm(false);
      await refreshTickets();
    } catch (err) {
      setTicketsError(err instanceof Error ? err.message : "Could not raise the ticket");
    } finally {
      setTicketBusy(false);
    }
  }

  async function sendTicketReply() {
    if (!onReplyTicket || !openTicketId || !ticketReply.trim()) return;
    setTicketBusy(true);
    setTicketsError("");
    try {
      const updated = await onReplyTicket(openTicketId, ticketReply.trim());
      setTicketReply("");
      setTickets((prev) => prev.map((t) => (t._id === updated._id ? updated : t)));
    } catch (err) {
      setTicketsError(err instanceof Error ? err.message : "Could not send the reply");
    } finally {
      setTicketBusy(false);
    }
  }

  async function confirmTicketResolved(ticketId: string) {
    if (!onConfirmTicket) return;
    setTicketBusy(true);
    setTicketsError("");
    try {
      const updated = await onConfirmTicket(ticketId);
      setTickets((prev) => prev.map((t) => (t._id === updated._id ? updated : t)));
    } catch (err) {
      setTicketsError(err instanceof Error ? err.message : "Could not confirm the ticket");
    } finally {
      setTicketBusy(false);
    }
  }

  function openCart() {
    setPage("cart");
  }

  function continueShopping() {
    setCart([]);
    setOrderNumber("");
    setError("");
    setPage("home");
    void refreshOrders();
  }

  async function placeOrder() {
    setError("");
    const formError = validateCheckoutForm(checkoutValues);
    if (formError) {
      setCheckoutShowErrors(true);
      setError(formError);
      return;
    }
    const next = buildAddressFromCheckout();
    setAddress(next);
    if (!onCheckout) return;
    const missingSize = cart.find((line) => {
      const product = products.find((p) => p._id === line.productId);
      const sizes = distinct(product?.variants?.map((v) => v.size) ?? []);
      return sizes.length > 1 && !line.variant?.size;
    });
    if (missingSize) {
      setError(`Please select a size for ${missingSize.name}.`);
      return;
    }
    setPlacing(true);
    try {
      const items: CheckoutItem[] = cart.map((l) => ({ productId: l.productId, qty: l.qty, variant: l.variant }));
      const paymentMode = checkoutPaymentMode();
      let razorpay: CheckoutPayment["razorpay"];

      if (isShopper && upiDueInr > 0) {
        razorpay = await collectRazorpayPayment(upiDueInr);
      }

      const res = await onCheckout(items, next, { mode: paymentMode, razorpay });
      setOrderNumber(res.orderNumber);
      if (res.remainingCredit != null) setBalanceInr(res.remainingCredit);
      setCart([]);
      setPage("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not place your order");
    } finally {
      setPlacing(false);
    }
  }

  const homeNewArrivals = useMemo(
    () => products.slice(0, HOME_RAIL_COUNT),
    [products],
  );
  const homeRecommended = useMemo(() => {
    const excludeNewArrivalIds = new Set(homeNewArrivals.map((p) => p._id));
    return pickRecommendedProducts(
      products,
      cart,
      orders,
      `${cartPersistId || shop.name || "shop"}:${products.map((p) => p._id).join(",")}`,
      HOME_RAIL_COUNT,
      excludeNewArrivalIds,
    );
  }, [products, cart, orders, cartPersistId, shop.name, homeNewArrivals]);

  function addProductFromHome(p: StoreProduct) {
    const colors = productColorOptions(p);
    const sizes = distinct(p.variants?.map((v) => v.size) ?? []);
    addToCart(
      p,
      {
        ...(sizes.length === 1 ? { size: sizes[0] } : {}),
        ...(colors.length === 1 ? { color: colors[0]?.name } : {}),
      },
      1,
    );
  }

  const userInitials = recipientName
    ? recipientName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "SM";
  const displayName = truncTopbarName(recipientName || (mode === "preview" ? "Preview" : "Guest"));
  const workspaceLabel = shop.name.toLowerCase();
  const homeBannerUrl = shopHeroBannerUrl(shop);
  const homeBannerAlt = shop.bannerImageUrl
    ? `${shop.name} banner`
    : shopBannerPresetLabel(shop.bannerPreset) || `${shop.name} banner`;

  /* ─── RENDER ─── */
  return (
    <div className="sf-root sf-catalog-theme" data-store-page={page}>
      {/* Preview mode strip */}
      {mode === "preview" && (
        <div className="sf-preview-strip">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
          Employees: open your private invite link to redeem your gift.
        </div>
      )}

      {/* Shared store navigation */}
      <div className={`sf-topbar sf-topbar--two-row${scrolled ? " scrolled" : ""}`}>
        <div className="sf-topbar-row sf-topbar-row--main">
          <div className="sf-topbar-inner sf-topbar-inner--stadium">
            <div className="sf-topbar-left">
              <button type="button" className="sf-shopbrand sf-shopbrand--stadium" onClick={() => setPage("home")}>
                {shop.logoUrl ? (
                  <img src={shop.logoUrl} alt="" className="sf-shopbrand-mark" />
                ) : null}
                <span className="sf-shopbrand-name">{shop.name}</span>
              </button>

              <span className="sf-topbar-vrule" aria-hidden="true" />

              <div className="sf-powered-by" aria-label="Powered by Shelf Merch">
                <span className="sf-powered-by-label">Powered by</span>
                <ShelfMerchLogo height={22} className="sf-powered-by-logo" />
              </div>
            </div>

            <nav className="sf-store-nav" aria-label="Store navigation">
              <button type="button" aria-current={page === "home" ? "page" : undefined} onClick={() => setPage("home")}>
                Home
              </button>
              <button type="button" aria-current={page === "products" || page === "product" ? "page" : undefined} onClick={() => browseRewards()}>
                All products
              </button>
              {isShopper && onFetchOrders ? (
                <button type="button" aria-current={page === "orders" || page === "order-detail" ? "page" : undefined} onClick={() => setPage("orders")}>
                  My orders
                </button>
              ) : null}
            </nav>

            <div className="sf-topbar-search">
              <input
                type="search"
                className="sf-topbar-search-input"
                placeholder="Search all products"
                value={searchQuery}
                onChange={(e) => onHeaderSearch(e.target.value)}
                aria-label="Search all products"
              />
            </div>

            <div className="sf-topbar-right sf-topbar-right--stadium">
              {isShopper && balanceInr != null && (
                <button
                  type="button"
                  className="topbar-wallet sf-topbar-wallet"
                  aria-label={
                    storeCurrency === "inr" ? "Your credits balance" : "Your points balance"
                  }
                  onClick={() => setPage("home")}
                >
                  <span className="topbar-wallet-icon">
                    <img src={walletIconImg} alt="" className="topbar-wallet-img" aria-hidden="true" />
                  </span>
                  <span className="topbar-wallet-copy">
                    <span className="k">{navBalanceLabel()}</span>
                    <span className="v">{navBalanceValue(balanceInr)}</span>
                  </span>
                </button>
              )}

              {isShopper && onLogout ? (
                <StoreAccountMenu
                  recipientName={recipientName || "Guest"}
                  recipientEmail={recipientEmail}
                  shopName={shop.name}
                  initials={userInitials}
                  truncName={displayName}
                  balanceLabel={navBalanceLabel()}
                  balanceValue={balanceInr != null ? navBalanceValue(balanceInr) : "—"}
                  onOpenOrders={() => {
                    setPage("orders");
                    void refreshOrders();
                  }}
                  onOpenSupport={onFetchTickets ? openSupport : undefined}
                  onLogout={onLogout}
                />
              ) : mode === "store" && onRequireAuth ? (
                <button
                  type="button"
                  className="btn btn-dark"
                  style={{ padding: "8px 14px", fontSize: 13 }}
                  onClick={() => onRequireAuth()}
                >
                  Sign in
                </button>
              ) : (
              <button type="button" className="topbar-user sf-topbar-user" aria-label="Account">
                <span className="topbar-user-avatar">{userInitials}</span>
                <span className="topbar-user-copy">
                  <span className="topbar-user-name">{displayName}</span>
                  <span className="topbar-user-sub">{workspaceLabel}</span>
                </span>
                <ChevronDown className="topbar-chevron sf-topbar-user-chevron" />
              </button>
              )}

              {isShopper && (
                <button
                  type="button"
                  className="sf-topbar-cart"
                  onClick={openCart}
                  aria-label={cartCount > 0 ? `Cart, ${cartCount} items` : "Cart"}
                >
                  <ShoppingBagIcon />
                  {cartCount > 0 ? <span className="sf-topbar-cart-badge">{cartCount}</span> : null}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {addedToBag ? (
        <>
          <button
            type="button"
            className="sf-bag-added-scrim"
            aria-label="Close"
            onClick={closeAddedToBag}
          />
          <div
            className="sf-bag-added"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sf-bag-added-title"
          >
            <div className="sf-bag-added-panel">
              <div className="sf-bag-added-head">
                <div className="sf-bag-added-head-left">
                  <span className="sf-bag-added-check" aria-hidden="true">
                    <CheckCircleIcon />
                  </span>
                  <h2 id="sf-bag-added-title" className="sf-bag-added-title">
                    Added to bag
                  </h2>
                </div>
                <button
                  type="button"
                  className="sf-bag-added-close"
                  aria-label="Close"
                  onClick={closeAddedToBag}
                >
                  <CloseIcon />
                </button>
              </div>

              <div className="sf-bag-added-item">
                <div className="sf-bag-added-item-img">
                  {addedToBag.image ? <img src={addedToBag.image} alt="" /> : null}
                </div>
                <div className="sf-bag-added-item-body">
                  <div className="sf-bag-added-item-brand">{addedToBag.brand.toUpperCase()}</div>
                  <div className="sf-bag-added-item-name">{addedToBag.name}</div>
                  <div className="sf-bag-added-item-qty">QTY: {addedToBag.qty}</div>
                </div>
                <div className="sf-bag-added-item-price">{fmtCardPrice(addedToBag.linePriceInr)}</div>
              </div>

              <div className="sf-bag-added-actions">
                <button type="button" className="sf-bag-added-view" onClick={viewBagFromModal}>
                  View bag ({cartCount})
                </button>
                <button type="button" className="sf-bag-added-checkout" onClick={checkoutFromModal}>
                  Checkout
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {/* ═══ MAIN CONTENT ═══ */}

      {error && page !== "checkout" && (
        <div className="sf-content" style={{ paddingTop: 16 }}>
          <div className="card" style={{ padding: 12, color: "var(--danger)" }}>{error}</div>
        </div>
      )}

      {/* ────── HOME ────── */}
      {page === "home" && (
        <StoreHomePage
          products={products}
          contentRef={catalogRef}
          bannerUrl={homeBannerUrl || undefined}
          bannerAlt={homeBannerAlt}
          onViewAllProducts={() => browseRewards()}
          onBrowseCategory={(category) => browseRewards(category)}
          recommendedGrid={
            homeRecommended.length > 0 ? (
              <StadiumProductGrid
                products={homeRecommended}
                shopBrand={shop.name}
                onOpen={openProduct}
                priceLabel={fmtCardPrice}
                onAddToBag={addProductFromHome}
                showSwatches
                addLabel="Add to cart"
                gridClassName="sf-product-grid--home"
              />
            ) : null
          }
          newArrivalsGrid={
            homeNewArrivals.length > 0 ? (
              <StadiumProductGrid
                products={homeNewArrivals}
                shopBrand={shop.name}
                onOpen={openProduct}
                priceLabel={fmtCardPrice}
                onAddToBag={addProductFromHome}
                showSwatches
                addLabel="Add to cart"
                gridClassName="sf-product-grid--home"
              />
            ) : null
          }
        />
      )}

      {/* ────── PRODUCTS ────── */}
      {page === "products" && (
        <div className="sf-content sf-plp">
          <ProductsPageWithFilters
            products={products}
            searchQuery={searchQuery}
            categoryNavigate={plpCategoryNavigate}
            onOpen={openProduct}
            onAddToBag={(p) => {
              const colors = productColorOptions(p);
              const sizes = distinct(p.variants?.map((v) => v.size) ?? []);
              addToCart(
                p,
                {
                  ...(sizes.length === 1 ? { size: sizes[0] } : {}),
                  ...(colors.length === 1 ? { color: colors[0]?.name } : {}),
                },
                1,
              );
            }}
            priceLabel={fmtCardPrice}
            shopBrand={shop.name}
            currencyMode={storeCurrency}
          />
        </div>
      )}

      {/* ────── PRODUCT DETAIL ────── */}
      {page === "product" && active && (
        <div className="sf-content sf-pdp-page">
          <ProductDetail
            product={active}
            mode={mode}
            priceLabel={fmtCardPrice}
            onBack={() => setPage("products")}
            onAdd={(variant, qty) => addToCart(active, variant, qty)}
          />
        </div>
      )}

      {/* ────── CART ────── */}
      {page === "cart" && cart.length === 0 && (
        <div className="sf-content sf-bag-page sf-bag-page--empty">
          <StoreEmptyState
            variant="cart"
            title="Your bag is empty"
            description={
              <>
                Fill up your bag with our endless options.{" "}
                <button type="button" className="sf-empty-state-link" onClick={() => setPage("products")}>
                  Shop Menu
                </button>
              </>
            }
          />
        </div>
      )}

      {page === "cart" && cart.length > 0 && (
        <div className="sf-content sf-bag-page">
          <button type="button" className="sf-bag-back" onClick={() => setPage("products")}>
            ← Continue shopping
          </button>

          <div className="sf-bag-layout">
            <div className="sf-bag-main">
              <div className="sf-bag-heading">
                <h1 className="sf-bag-title">My Bag ({cartCount})</h1>
                <p className="sf-bag-lead">
                  Review your items and redeem your{" "}
                  {storeCurrency === "inr" ? "credits" : "points"}.
                </p>
              </div>

              {isShopper && balanceInr != null ? (
                <div className={`sf-bag-funds sf-bag-funds--v2${useRewardPoints ? "" : " sf-bag-funds--off"}`}>
                  <div className="sf-bag-funds-copy">
                    <div className="sf-bag-funds-label">
                      <WalletMiniIcon />
                      {myWalletLabel(storeCurrency)}
                    </div>
                    <label className="sf-bag-funds-wallet">
                      <input
                        type="checkbox"
                        checked={useRewardPoints}
                        onChange={(e) => setUseRewardPoints(e.target.checked)}
                      />
                      <span className="sf-bag-funds-check" aria-hidden="true" />
                      <span>
                        {storeCurrency === "inr"
                          ? rewardWalletLabel(storeCurrency)
                          : `${recipientName ? `${recipientName}'s ` : ""}${shop.name} Wallet`}
                      </span>
                    </label>
                    <div className="sf-bag-funds-balance">
                      Available: <b>{navBalanceValue(balanceInr)}</b>
                    </div>
                    {!useRewardPoints ? (
                      <p className="sf-bag-funds-hint">Pay at checkout via UPI, cards, or net banking.</p>
                    ) : !hasEnoughPoints ? (
                      <p className="sf-bag-funds-warning">
                        Insufficient {creditUnit.toLowerCase()} — remaining balance can be paid via UPI at
                        checkout.
                      </p>
                    ) : (
                      <p className="sf-bag-funds-hint">
                        {storeCurrency === "inr"
                          ? "Credits will be applied at checkout."
                          : "Reward points will be applied at checkout."}
                      </p>
                    )}
                  </div>
                </div>
              ) : null}

              <div className="sf-bag-items">
                {cart.map((l) => {
                  const variantLabel = [l.variant?.size, l.variant?.color].filter(Boolean).join(" · ");
                  return (
                    <div key={l.key} className="sf-bag-item">
                      <div className="sf-bag-item-img">
                        {l.image ? <img src={l.image} alt={l.name} /> : null}
                      </div>
                      <div className="sf-bag-item-body">
                        <div className="sf-bag-item-brand">{(l.brand || shop.name).toUpperCase()}</div>
                        <div className="sf-bag-item-name">{l.name}</div>
                        {variantLabel ? (
                          <span className="sf-bag-item-tag">{variantLabel.toUpperCase()}</span>
                        ) : null}
                        <div className="sf-bag-item-price">{fmtCardPrice(l.priceInr * l.qty)}</div>
                        <div className="sf-bag-item-actions">
                          <div className="sf-bag-qty">
                            <button
                              type="button"
                              className="sf-bag-qty-btn"
                              aria-label="Decrease quantity"
                              onClick={() => bumpLineQty(l.key, -1)}
                            >
                              <MinusIcon />
                            </button>
                            <span className="sf-bag-qty-val">{l.qty}</span>
                            <button
                              type="button"
                              className="sf-bag-qty-btn"
                              aria-label="Increase quantity"
                              onClick={() => bumpLineQty(l.key, 1)}
                            >
                              <PlusIcon />
                            </button>
                          </div>
                          <button
                            type="button"
                            className="sf-bag-icon-btn"
                            aria-label="Edit item"
                            onClick={() => editCartLine(l.productId)}
                          >
                            <PencilIcon />
                          </button>
                          <button
                            type="button"
                            className="sf-bag-icon-btn sf-bag-icon-btn--danger"
                            aria-label="Remove item"
                            onClick={() => setLineQty(l.key, 0)}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button type="button" className="sf-bag-remove-all" onClick={clearCart}>
                <TrashIcon />
                Remove all items
              </button>
            </div>

            <aside className="sf-bag-sidebar">
              <div className="sf-bag-summary">
                <h2 className="sf-bag-summary-title">Order Summary</h2>
                <div className="sf-bag-summary-row">
                  <span>Bag Total (Inc. of GST)</span>
                  <b>{fmtCardPrice(cartTotalInr)}</b>
                </div>
                {isShopper && balanceInr != null && useRewardPoints && pointsApplied > 0 ? (
                  <div className="sf-bag-summary-row sf-bag-summary-row--credit">
                    <span>{appliedLabel(storeCurrency)}</span>
                    <b>-{fmtApplied(pointsApplied)}</b>
                  </div>
                ) : null}
                {isShopper && paysWithUpi ? (
                  <div className="sf-bag-summary-row sf-bag-summary-row--muted">
                    <span>Pay via UPI</span>
                    <b>{fmtYouPayDue(upiDueInr)}</b>
                  </div>
                ) : null}
                {isShopper && balanceInr != null && useRewardPoints ? (
                  <div className="sf-bag-summary-row sf-bag-summary-row--muted">
                    <span>Remaining After Order</span>
                    <b>
                      {fmtCardPrice(Math.max(0, balanceInr - (useRewardPoints ? pointsApplied : 0)))}
                    </b>
                  </div>
                ) : null}

                <div className="sf-bag-summary-total">
                  <span>Total</span>
                  <b>
                    {isShopper && useRewardPoints
                      ? fmtYouPayDue(youPayAmountInr())
                      : paysWithUpi
                        ? fmtUpiAmount(upiDueInr)
                        : canCheckout
                          ? fmtCardPrice(cartTotalInr)
                          : "—"}
                  </b>
                </div>

                {isShopper ? (
                  <>
                    <button
                      type="button"
                      className="sf-bag-checkout-btn"
                      disabled={!canCheckout || (mode === "store" && !authenticated)}
                      onClick={() => {
                        if (mode === "store" && !authenticated) {
                          onRequireAuth?.();
                          return;
                        }
                        setPage("checkout");
                      }}
                    >
                      {mode === "store" && !authenticated ? "Sign in to check out" : "Proceed to Checkout"}
                      <ArrowRightIcon />
                    </button>
                    <p className="sf-bag-secure-note">
                      <LockIcon />
                      Your {storeCurrency === "inr" ? "credits" : "points"} will be applied at checkout.
                    </p>
                  </>
                ) : (
                  <p className="sf-bag-preview-note">Open your invite link to check out.</p>
                )}
              </div>
            </aside>
          </div>

          <section className="sf-plp-trust sf-bag-trust" aria-label="Store promises">
            <div className="sf-plp-trust-item">
              <span className="sf-plp-trust-icon"><ShieldCheckIcon /></span>
              <div>
                <div className="sf-plp-trust-title">Secure Checkout</div>
                <div className="sf-plp-trust-desc">Your points are safe with us.</div>
              </div>
            </div>
            <div className="sf-plp-trust-item">
              <span className="sf-plp-trust-icon"><GiftIcon /></span>
              <div>
                <div className="sf-plp-trust-title">Hassle-free Gifting</div>
                <div className="sf-plp-trust-desc">Send joy in just a few clicks.</div>
              </div>
            </div>
            <div className="sf-plp-trust-item">
              <span className="sf-plp-trust-icon"><HeadsetIcon /></span>
              <div>
                <div className="sf-plp-trust-title">Need Help?</div>
                <div className="sf-plp-trust-desc">We&apos;re here for you.</div>
              </div>
            </div>
            <div className="sf-plp-trust-item">
              <span className="sf-plp-trust-icon"><RibbonIcon /></span>
              <div>
                <div className="sf-plp-trust-title">100% Satisfaction</div>
                <div className="sf-plp-trust-desc">Quality you can trust.</div>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ────── CHECKOUT ────── */}
      {page === "checkout" && (
        <div className="sf-content sf-checkout-page">
          <button type="button" className="sf-bag-back" onClick={() => setPage("cart")}>
            ← Back to shop
          </button>

          <div className="sf-checkout-titlebar">
            <div>
              <h1 className="sf-checkout-title">Checkout</h1>
              <p className="sf-checkout-lead">Review your details and complete your order.</p>
            </div>
            {/* <div className="sf-checkout-currency" aria-label="Currency">
              {usesPointsDisplay ? "Pts" : "₹"}
              <ChevronDown className="sf-checkout-currency-chevron" />
            </div> */}
          </div>

          {error ? <div className="sf-checkout-error">{error}</div> : null}

          <div className="sf-checkout-layout">
            <div className="sf-checkout-main">
              <div className="sf-checkout-shipping-card">
                <div className="sf-checkout-section-head">
                  <span className="sf-checkout-head-icon">
                    <TruckIcon />
                  </span>
                  <div>
                    <h2>Shipping address</h2>
                    <p>We&apos;ll deliver your order to this address</p>
                  </div>
                </div>

                <div className="sf-checkout-form">
                  <div className="sf-checkout-form-row sf-checkout-form-row--2">
                    <label className="sf-checkout-field">
                      <span className="sf-checkout-label">First name <i>*</i></span>
                      <div className="sf-checkout-inp-wrap">
                        <span className="sf-checkout-inp-icon" aria-hidden="true">
                          <UserFieldIcon />
                        </span>
                        <input
                          className={checkoutInputClass(Boolean(checkoutFieldError("firstName")))}
                          value={checkoutFirst}
                          onChange={(e) => {
                            setCheckoutFirst(sanitizeCheckoutField("firstName", e.target.value));
                            resetCheckoutProgress();
                          }}
                          onBlur={() => markCheckoutTouched("firstName")}
                          aria-invalid={Boolean(checkoutFieldError("firstName"))}
                        />
                      </div>
                      {checkoutFieldError("firstName") ? (
                        <p className="sf-checkout-field-error" role="alert">{checkoutFieldError("firstName")}</p>
                      ) : null}
                    </label>
                    <label className="sf-checkout-field">
                      <span className="sf-checkout-label">Last name <i>*</i></span>
                      <div className="sf-checkout-inp-wrap">
                        <span className="sf-checkout-inp-icon" aria-hidden="true">
                          <UserFieldIcon />
                        </span>
                        <input
                          className={checkoutInputClass(Boolean(checkoutFieldError("lastName")))}
                          value={checkoutLast}
                          onChange={(e) => {
                            setCheckoutLast(sanitizeCheckoutField("lastName", e.target.value));
                            resetCheckoutProgress();
                          }}
                          onBlur={() => markCheckoutTouched("lastName")}
                          aria-invalid={Boolean(checkoutFieldError("lastName"))}
                        />
                      </div>
                      {checkoutFieldError("lastName") ? (
                        <p className="sf-checkout-field-error" role="alert">{checkoutFieldError("lastName")}</p>
                      ) : null}
                    </label>
                  </div>

                  <div className="sf-checkout-form-row sf-checkout-form-row--2">
                    <div className="sf-checkout-field">
                      <span className="sf-checkout-label">Country <i>*</i></span>
                      <CountrySelect
                        hideLabel
                        variant="checkout"
                        required
                        value={address.country || "IN"}
                        invalid={Boolean(checkoutFieldError("country"))}
                        errorId={checkoutFieldError("country") ? "checkout-country-error" : undefined}
                        onBlur={() => markCheckoutTouched("country")}
                        onChange={(value) => {
                          setAddress({ ...address, country: value });
                          resetCheckoutProgress();
                        }}
                      />
                      {checkoutFieldError("country") ? (
                        <p id="checkout-country-error" className="sf-checkout-field-error" role="alert">
                          {checkoutFieldError("country")}
                        </p>
                      ) : null}
                    </div>
                    <label className="sf-checkout-field">
                      <span className="sf-checkout-label">Phone number <i>*</i></span>
                      <div className={`sf-checkout-phone${checkoutFieldError("phone") ? " sf-checkout-phone--invalid" : ""}`}>
                        <span className="sf-checkout-inp-icon sf-checkout-inp-icon--phone" aria-hidden="true">
                          <PhoneFieldIcon />
                        </span>
                        <span className="sf-checkout-phone-prefix">
                          {checkoutPhonePrefix(address.country || "IN")}
                        </span>
                        <input
                          className="sf-checkout-inp sf-checkout-inp--phone"
                          inputMode="numeric"
                          maxLength={10}
                          placeholder="9876543210"
                          value={address.phone}
                          onChange={(e) => {
                            setAddress({
                              ...address,
                              phone: sanitizeCheckoutField("phone", e.target.value),
                            });
                            resetCheckoutProgress();
                          }}
                          onBlur={() => markCheckoutTouched("phone")}
                          aria-invalid={Boolean(checkoutFieldError("phone"))}
                        />
                      </div>
                      {checkoutFieldError("phone") ? (
                        <p className="sf-checkout-field-error" role="alert">{checkoutFieldError("phone")}</p>
                      ) : null}
                    </label>
                  </div>

                  <label className="sf-checkout-field">
                    <span className="sf-checkout-label">Address <i>*</i></span>
                    <div className="sf-checkout-inp-wrap">
                      <span className="sf-checkout-inp-icon" aria-hidden="true">
                        <MapPinFieldIcon />
                      </span>
                      <input
                        className={checkoutInputClass(Boolean(checkoutFieldError("line1")))}
                        placeholder="Street address"
                        value={address.line1}
                        onChange={(e) => {
                          setAddress({ ...address, line1: e.target.value });
                          resetCheckoutProgress();
                        }}
                        onBlur={() => markCheckoutTouched("line1")}
                        aria-invalid={Boolean(checkoutFieldError("line1"))}
                      />
                    </div>
                    {checkoutFieldError("line1") ? (
                      <p className="sf-checkout-field-error" role="alert">{checkoutFieldError("line1")}</p>
                    ) : null}
                  </label>

                  <div className="sf-checkout-form-row sf-checkout-form-row--2">
                    <label className="sf-checkout-field">
                      <span className="sf-checkout-label">Apartment, suite, etc. (optional)</span>
                      <div className="sf-checkout-inp-wrap">
                        <span className="sf-checkout-inp-icon" aria-hidden="true">
                          <BuildingFieldIcon />
                        </span>
                        <input
                          className="sf-checkout-inp sf-checkout-inp--icon"
                          placeholder="Apt 000"
                          value={address.line2 || ""}
                          onChange={(e) => {
                            setAddress({ ...address, line2: e.target.value });
                            resetCheckoutProgress();
                          }}
                        />
                      </div>
                    </label>
                    <label className="sf-checkout-field">
                      <span className="sf-checkout-label">City <i>*</i></span>
                      <div className="sf-checkout-inp-wrap">
                        <span className="sf-checkout-inp-icon" aria-hidden="true">
                          <BuildingFieldIcon />
                        </span>
                        <input
                          className={checkoutInputClass(Boolean(checkoutFieldError("city")))}
                          value={address.city}
                          onChange={(e) => {
                            setAddress({
                              ...address,
                              city: sanitizeCheckoutField("city", e.target.value),
                            });
                            resetCheckoutProgress();
                          }}
                          onBlur={() => markCheckoutTouched("city")}
                          aria-invalid={Boolean(checkoutFieldError("city"))}
                        />
                      </div>
                      {checkoutFieldError("city") ? (
                        <p className="sf-checkout-field-error" role="alert">{checkoutFieldError("city")}</p>
                      ) : null}
                    </label>
                  </div>

                  <div className="sf-checkout-form-row sf-checkout-form-row--2">
                    <label className="sf-checkout-field">
                      <span className="sf-checkout-label">State / County / Province <i>*</i></span>
                      <div className="sf-checkout-inp-wrap">
                        <span className="sf-checkout-inp-icon" aria-hidden="true">
                          <MapFieldIcon />
                        </span>
                        <input
                          className={checkoutInputClass(Boolean(checkoutFieldError("state")))}
                          placeholder="State or province"
                          value={address.state}
                          onChange={(e) => {
                            setAddress({
                              ...address,
                              state: sanitizeCheckoutField("state", e.target.value),
                            });
                            resetCheckoutProgress();
                          }}
                          onBlur={() => markCheckoutTouched("state")}
                          aria-invalid={Boolean(checkoutFieldError("state"))}
                        />
                      </div>
                      {checkoutFieldError("state") ? (
                        <p className="sf-checkout-field-error" role="alert">{checkoutFieldError("state")}</p>
                      ) : null}
                    </label>
                    <label className="sf-checkout-field">
                      <span className="sf-checkout-label">Zip code / Pin <i>*</i></span>
                      <div className="sf-checkout-inp-wrap">
                        <span className="sf-checkout-inp-icon" aria-hidden="true">
                          <ZipFieldIcon />
                        </span>
                        <input
                          className={checkoutInputClass(Boolean(checkoutFieldError("pincode")))}
                          inputMode="numeric"
                          maxLength={10}
                          placeholder="000000"
                          value={address.pincode}
                          onChange={(e) => {
                            setAddress({
                              ...address,
                              pincode: sanitizeCheckoutField("pincode", e.target.value),
                            });
                            resetCheckoutProgress();
                          }}
                          onBlur={() => markCheckoutTouched("pincode")}
                          aria-invalid={Boolean(checkoutFieldError("pincode"))}
                        />
                      </div>
                      {checkoutFieldError("pincode") ? (
                        <p className="sf-checkout-field-error" role="alert">{checkoutFieldError("pincode")}</p>
                      ) : null}
                    </label>
                  </div>
                </div>

                <div className={`sf-checkout-delivery-note${shippingValid ? " is-valid" : ""}`}>
                  <CheckCircleIcon />
                  <span>
                    {shippingValid
                      ? "Your order will be securely delivered to the address above."
                      : "Complete the required fields to confirm your delivery address."}
                  </span>
                </div>

                {/* Manual continue step disabled — Pay Now enables when shipping is valid.
                <button
                  type="button"
                  className="sf-checkout-continue sf-checkout-continue--inline"
                  onClick={continueToOrderSummary}
                >
                  Continue to order summary
                </button>
                <p className="sf-checkout-continue-hint">
                  Review your totals and pay in the order summary below.
                </p>
                */}
              </div>
            </div>

            <aside ref={checkoutSummaryRef} className="sf-checkout-sidebar">
              <div className="sf-checkout-summary">
                <div className="sf-checkout-summary-head">
                  <h2 className="sf-checkout-summary-title">Order summary</h2>
                </div>

                {isShopper && balanceInr != null ? (
                  <div className={`sf-checkout-wallet${useRewardPoints ? "" : " sf-checkout-wallet--off"}`}>
                    <div className="sf-checkout-wallet-header">
                      <div>
                        <p className="sf-checkout-wallet-kicker">{myWalletLabel(storeCurrency)}</p>
                        <p className="sf-checkout-wallet-name">
                          {storeCurrency === "inr"
                            ? rewardWalletLabel(storeCurrency)
                            : `${recipientName ? `${recipientName}'s ` : ""}${shop.name} wallet`}
                        </p>
                      </div>
                      <div className="sf-checkout-wallet-balance">
                        <span className="sf-checkout-wallet-balance-label">Available</span>
                        <span className="sf-checkout-wallet-balance-value">{navBalanceValue(balanceInr)}</span>
                      </div>
                    </div>
                    <label className="sf-checkout-wallet-toggle">
                      <input
                        type="checkbox"
                        checked={useRewardPoints}
                        onChange={(e) => setUseRewardPoints(e.target.checked)}
                      />
                      <span>Use wallet balance for this order</span>
                    </label>
                    {!useRewardPoints ? (
                      <p className="sf-checkout-wallet-note">Pay the full amount via UPI at checkout.</p>
                    ) : !hasEnoughPoints ? (
                      <p className="sf-checkout-wallet-note sf-checkout-wallet-note--warn">
                        Insufficient balance. The remainder will be collected via UPI.
                      </p>
                    ) : (
                      <p className="sf-checkout-wallet-note">
                        Your {storeCurrency === "inr" ? "credits" : "points"} will be applied automatically.
                      </p>
                    )}
                  </div>
                ) : null}

                <div className="sf-checkout-summary-lines">
                  <div className="sf-checkout-summary-line">
                    <span>Bag total <span className="sf-checkout-summary-line-sub">(incl. GST)</span></span>
                    <span className="sf-checkout-summary-amount">{fmtCardPrice(cartTotalInr)}</span>
                  </div>
                  {isShopper && useRewardPoints && pointsApplied > 0 ? (
                    <div className="sf-checkout-summary-line sf-checkout-summary-line--credit">
                      <span>{appliedLabel(storeCurrency)}</span>
                      <span className="sf-checkout-summary-amount sf-checkout-summary-amount--credit">
                        -{fmtApplied(pointsApplied)}
                      </span>
                    </div>
                  ) : null}
                  {isShopper && paysWithUpi ? (
                    <div className="sf-checkout-summary-line">
                      <span>Pay via UPI</span>
                      <span className="sf-checkout-summary-amount">{fmtYouPayDue(upiDueInr)}</span>
                    </div>
                  ) : null}
                  {isShopper && balanceInr != null && useRewardPoints ? (
                    <div className="sf-checkout-summary-line sf-checkout-summary-line--muted">
                      <span>Remaining in wallet</span>
                      <span className="sf-checkout-summary-amount sf-checkout-summary-amount--muted">
                        {navBalanceValue(Math.max(0, balanceInr - pointsApplied))}
                      </span>
                    </div>
                  ) : null}
                </div>

                <div className="sf-checkout-summary-due">
                  <span className="sf-checkout-summary-due-label">You pay</span>
                  <span className="sf-checkout-summary-due-value">
                    {isShopper && useRewardPoints
                      ? fmtYouPayDue(youPayAmountInr())
                      : paysWithUpi
                        ? fmtUpiAmount(upiDueInr)
                        : fmtCardPrice(cartTotalInr)}
                  </span>
                </div>

                <button
                  type="button"
                  className="sf-checkout-pay"
                  disabled={placing || !canCheckout || cart.length === 0}
                  onClick={() => {
                    if (!shippingValid) {
                      setCheckoutShowErrors(true);
                      setError(validateCheckoutForm(checkoutValues) || "Complete all required shipping fields.");
                      return;
                    }
                    void placeOrder();
                  }}
                >
                  {placing ? (
                    "Processing…"
                  ) : paysWithUpi ? (
                    <>Pay {fmtYouPayDue(upiDueInr)} via UPI</>
                  ) : (
                    <>
                      <LockIcon />
                      Place order
                    </>
                  )}
                </button>
                {shippingValid ? (
                  <p className="sf-checkout-pay-status sf-checkout-pay-status--ready">
                    <CheckCircleIcon />
                    Shipping details complete
                  </p>
                ) : (
                  <p className="sf-checkout-pay-status">Complete shipping details to continue</p>
                )}
              </div>

              <div className="sf-checkout-items">
                <div className="sf-checkout-items-toggle" aria-hidden="false">
                  <span className="sf-checkout-items-title">
                    <PackageIcon />
                    Your item{cartCount === 1 ? "" : "s"} ({cartCount})
                  </span>
                  
                </div>
                <div className="sf-checkout-items-body">
                  {cart.map((l) => {
                    const variantLabel = [l.variant?.size, l.variant?.color].filter(Boolean).join(" · ");
                    return (
                      <div key={l.key} className="sf-checkout-item">
                        <div className="sf-checkout-item-img">
                          {l.image ? <img src={l.image} alt={l.name} /> : null}
                        </div>
                        <div className="sf-checkout-item-info">
                          <div className="sf-checkout-item-name">{l.name}</div>
                          {variantLabel ? (
                            <div className="sf-checkout-item-variant">{variantLabel}</div>
                          ) : null}
                          <div className="sf-checkout-item-meta">
                            <div className="sf-bag-qty sf-checkout-item-qty">
                              <button
                                type="button"
                                className="sf-bag-qty-btn"
                                aria-label="Decrease quantity"
                                onClick={() => bumpLineQty(l.key, -1)}
                              >
                                <MinusIcon />
                              </button>
                              <span className="sf-bag-qty-val">{l.qty}</span>
                              <button
                                type="button"
                                className="sf-bag-qty-btn"
                                aria-label="Increase quantity"
                                onClick={() => bumpLineQty(l.key, 1)}
                              >
                                <PlusIcon />
                              </button>
                            </div>
                            <b className="sf-checkout-item-price">{fmtCardPrice(l.priceInr * l.qty)}</b>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </aside>
          </div>

          <p className="sf-checkout-secure-footer">
            <ShieldCheckIcon />
            Your data is secure and will only be used to process your order.
          </p>
        </div>
      )}

      {/* ────── DONE ────── */}
      {page === "done" && (
        <div className="sf-content sf-order-success">
          <div className="sf-order-success-layout sf-fade-in">
            <div className="sf-order-success-copy">
              <div className="sf-order-success-icon-wrap" aria-hidden="true">
                <div className="sf-order-success-icon-glow" />
                <div className="sf-order-success-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
              </div>
              <div className="sf-order-success-eyebrow">
                <span className="sf-order-success-eyebrow-dot" aria-hidden="true" />
                Order placed
              </div>
              <h1 className="sf-order-success-title">Thank you{recipientName ? `, ${recipientName}` : ""}!</h1>
              <p className="sf-order-success-copy-text">
                Order <b>#{orderNumber}</b> is confirmed. We&apos;ll email you tracking once it ships.
              </p>
              {balanceInr != null && balanceInr > 0 ? (
                <div className="sf-order-success-balance">
                  <span className="sf-order-success-balance-icon" aria-hidden="true">
                    <StarIcon />
                  </span>
                  <span>
                    You still have <b>{navBalanceValue(balanceInr)}</b> to spend in the store.
                  </span>
                </div>
              ) : null}
              <div className="sf-order-success-actions">
                <button type="button" className="sf-order-success-primary" onClick={continueShopping}>
                  <span>Continue shopping</span>
                  <ArrowRightIcon />
                </button>
                <button
                  type="button"
                  className="sf-order-success-secondary"
                  onClick={() => {
                    setPage("orders");
                    void refreshOrders();
                  }}
                >
                  <SummaryDocIcon />
                  <span>View my orders</span>
                  <ArrowRightIcon />
                </button>
              </div>
              <div className="sf-order-success-next">
                <span className="sf-order-success-next-icon" aria-hidden="true">
                  <PackageIcon />
                </span>
                <div>
                  <strong>What happens next?</strong>
                  <p>We&apos;re packing your order with care. You&apos;ll receive an email with tracking details once it&apos;s on the way.</p>
                </div>
              </div>
            </div>

            <div className="sf-order-success-art" aria-hidden="true">
              <div className="sf-order-success-art-frame">
                <img
                  src={orderPlacedImg}
                  alt=""
                  className="sf-order-success-art-img"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────── ORDERS ────── */}
      {page === "orders" && (
        <div className="sf-content sf-my-orders">
          {ordersLoading ? (
            <div className="sf-my-orders-panel">
              <div className="sf-orders-skeleton">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="sf-order-card sf-order-card--skeleton" />
                ))}
              </div>
            </div>
          ) : ordersError ? (
            <div className="sf-my-orders-panel">
              <StoreEmptyState
                variant="orders"
                title="Couldn't load orders"
                description={ordersError}
                action={
                  <button type="button" className="sf-btn-secondary" onClick={() => void refreshOrders()}>
                    Try again
                  </button>
                }
              />
            </div>
          ) : orders.length === 0 ? (
            <OrdersEmptyState onBrowse={() => setPage("products")} />
          ) : (
            <OrdersListView
              orders={orders}
              products={products}
              priceLabel={fmtCardPrice}
              currencyMode={storeCurrency}
              onOpen={(orderNumber) => {
                setSelectedOrderNumber(orderNumber);
                setPage("order-detail");
              }}
            />
          )}
        </div>
      )}

      {page === "order-detail" && selectedOrderNumber ? (
        selectedOrder ? (
          <OrderDetailView
            order={selectedOrder}
            products={products}
            shopName={shop.name}
            priceLabel={fmt}
            onBack={() => setPage("orders")}
          />
        ) : (
          <StorePageShell
            className="sf-orders-page"
            backLabel="← Back to orders"
            onBack={() => setPage("orders")}
            title="Order not found"
          >
            <StoreEmptyState
              variant="orders"
              title="Order not found"
              description="This order could not be loaded."
              action={
                <button type="button" className="sf-btn-secondary" onClick={() => setPage("orders")}>
                  Back to orders
                </button>
              }
            />
          </StorePageShell>
        )
      ) : null}

      {/* ────── SUPPORT ────── */}
      {page === "support" && (
        <StorePageShell
          className="sf-orders-page"
          backLabel="← Back to store"
          onBack={() => setPage("home")}
          title="Support"
        >
          {ticketsError ? (
            <div className="card" style={{ padding: 12, color: "var(--danger)", marginBottom: 14 }}>
              {ticketsError}
            </div>
          ) : null}

          {showTicketForm ? (
            <div className="sf-order-card" style={{ padding: 18, marginBottom: 18 }}>
              <h2 style={{ fontSize: 16, marginBottom: 12 }}>Raise a ticket</h2>
              <div className="sf-checkout-form">
                <label className="sf-checkout-field">
                  <span className="sf-checkout-label">Subject</span>
                  <input
                    className="sf-checkout-inp"
                    placeholder="e.g. My order hasn't arrived"
                    value={ticketSubject}
                    onChange={(e) => setTicketSubject(e.target.value)}
                  />
                </label>
                <label className="sf-checkout-field">
                  <span className="sf-checkout-label">Category</span>
                  <select
                    className="sf-checkout-inp sf-checkout-select"
                    value={ticketType}
                    onChange={(e) => setTicketType(e.target.value)}
                  >
                    {Object.entries(SUPPORT_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="sf-checkout-field">
                  <span className="sf-checkout-label">Details</span>
                  <textarea
                    className="sf-checkout-inp"
                    rows={4}
                    placeholder="Order number, what went wrong, anything that helps us fix it."
                    value={ticketDetails}
                    onChange={(e) => setTicketDetails(e.target.value)}
                  />
                </label>
                <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                  <button
                    type="button"
                    className="sf-btn-secondary"
                    onClick={() => setShowTicketForm(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="sf-bag-checkout-btn"
                    style={{ width: "auto", padding: "0 22px" }}
                    disabled={ticketBusy || !ticketSubject.trim()}
                    onClick={() => void raiseTicket()}
                  >
                    {ticketBusy ? "Raising…" : "Raise ticket"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="row" style={{ justifyContent: "flex-end", marginBottom: 14 }}>
              <button
                type="button"
                className="sf-btn-secondary"
                onClick={() => setShowTicketForm(true)}
              >
                Raise a ticket
              </button>
            </div>
          )}

          {ticketsLoading ? (
            <div className="sf-orders-skeleton">
              {[1, 2].map((n) => (
                <div key={n} className="sf-order-card sf-order-card--skeleton" />
              ))}
            </div>
          ) : tickets.length === 0 && !showTicketForm ? (
            <StoreEmptyState
              variant="orders"
              title="No support tickets"
              description="Something wrong with a gift or delivery? Raise a ticket and our team will help."
              action={
                <button
                  type="button"
                  className="sf-btn-secondary"
                  onClick={() => setShowTicketForm(true)}
                >
                  Raise a ticket
                </button>
              }
            />
          ) : (
            <div className="sf-orders-list">
              {tickets.map((t) => {
                const isOpen = openTicketId === t._id;
                const visibleMessages = t.messages ?? [];
                return (
                  <div key={t._id} className="sf-order-card" style={{ padding: 16 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenTicketId(isOpen ? null : t._id);
                        setTicketReply("");
                      }}
                      style={{
                        display: "flex",
                        width: "100%",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                        padding: 0,
                      }}
                    >
                      <span>
                        <span style={{ display: "block", fontWeight: "var(--font-weight-semibold)" }}>{t.subject}</span>
                        <span className="mut3" style={{ fontSize: 12 }}>
                          {SUPPORT_TYPE_LABELS[t.type] ?? t.type} ·{" "}
                          {formatOrderDate(t.createdAt)} · {visibleMessages.length}{" "}
                          {visibleMessages.length === 1 ? "reply" : "replies"}
                        </span>
                      </span>
                      <span
                        className="sf-order-status-pill"
                        style={{
                          fontSize: 12,
                          fontWeight: "var(--font-weight-semibold)",
                          whiteSpace: "nowrap",
                          padding: "4px 10px",
                          borderRadius: 999,
                          border: "1px solid var(--line, #e5e5e5)",
                        }}
                      >
                        {formatOrderStatus(t.status)}
                      </span>
                    </button>

                    {isOpen ? (
                      <div style={{ marginTop: 12, borderTop: "1px solid var(--line, #eee)", paddingTop: 12 }}>
                        {t.description ? (
                          <p className="mut3" style={{ fontSize: 13, whiteSpace: "pre-wrap", marginBottom: 10 }}>
                            {t.description}
                          </p>
                        ) : null}
                        {visibleMessages.length === 0 ? (
                          <p className="mut3" style={{ fontSize: 13 }}>
                            No replies yet — our team has been notified.
                          </p>
                        ) : (
                          visibleMessages.map((m, i) => (
                            <div
                              key={m._id ?? i}
                              style={{
                                border: "1px solid var(--line, #eee)",
                                borderRadius: 8,
                                padding: "8px 10px",
                                marginBottom: 6,
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                                <strong>
                                  {m.fromPlatform === false
                                    ? m.authorName || "You"
                                    : m.authorName || "Support team"}
                                </strong>
                                <span className="mut3">{formatOrderDate(m.at)}</span>
                              </div>
                              <div style={{ fontSize: 13, whiteSpace: "pre-wrap", marginTop: 3 }}>{m.body}</div>
                            </div>
                          ))
                        )}

                        {t.status === "resolved" && onConfirmTicket ? (
                          <div
                            style={{
                              border: "1px solid var(--line, #eee)",
                              borderRadius: 8,
                              padding: "10px 12px",
                              marginTop: 10,
                            }}
                          >
                            <div style={{ fontWeight: "var(--font-weight-semibold)", fontSize: 13 }}>
                              Did we solve your issue?
                            </div>
                            <p className="mut3" style={{ fontSize: 12, margin: "4px 0 8px" }}>
                              Confirming closes this ticket — replying below reopens it instead.
                            </p>
                            <button
                              type="button"
                              className="sf-btn-secondary"
                              disabled={ticketBusy}
                              onClick={() => void confirmTicketResolved(t._id)}
                            >
                              {ticketBusy ? "Closing…" : "Yes, it's resolved"}
                            </button>
                          </div>
                        ) : null}

                        {t.status !== "closed" && onReplyTicket ? (
                          <div style={{ marginTop: 10 }}>
                            <textarea
                              className="sf-checkout-inp"
                              rows={3}
                              placeholder="Write a reply…"
                              value={ticketReply}
                              onChange={(e) => setTicketReply(e.target.value)}
                            />
                            <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
                              <button
                                type="button"
                                className="sf-btn-secondary"
                                disabled={ticketBusy || !ticketReply.trim()}
                                onClick={() => void sendTicketReply()}
                              >
                                {ticketBusy ? "Sending…" : "Send reply"}
                              </button>
                            </div>
                          </div>
                        ) : t.status === "closed" ? (
                          <p className="mut3" style={{ fontSize: 12, marginTop: 8 }}>
                            This ticket is closed — raise a new one if you need more help.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </StorePageShell>
      )}

      {/* ═══ FOOTER ═══ */}
      {page !== "orders" && page !== "order-detail" && page !== "support" ? (
      <div className="sf-footer">
        <div className="sf-footer-inner">
          <span className="sf-footer-powered">Powered by</span>
          <ShelfMerchLogo height={20} className="sf-footer-logo" />
          {mode === "preview" ? (
            <span className="sf-footer-note"> · Recipients redeem from a private invite link.</span>
          ) : null}
        </div>
      </div>
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════ */

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "One Size"];

function productCategoryLabel(p: StoreProduct): string {
  return (p.category || "").trim() || "Other";
}

/**
 * Shop PLP subcategory: admin-assigned catalog `subcategory` only.
 * Products without one are bucketed as "Other" (do not invent from legacy `group`).
 */
function productSubcategoryLabel(p: StoreProduct): string {
  const sub = String(p.subcategory || "").trim();
  return sub || "Other";
}

function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a);
    const ib = SIZE_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function ChevronDownIcon({ open }: { open?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform .18s ease" }}
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function GridViewIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ListViewIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

function HeadsetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 18v-6a9 9 0 0118 0v6" />
      <path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z" />
    </svg>
  );
}

function RibbonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="6" />
      <path d="M8.2 13.4L7 22l5-3 5 3-1.2-8.6" />
    </svg>
  );
}

type PlpSort = "featured" | "price-asc" | "price-desc" | "name";

function ProductsPageWithFilters({
  products,
  searchQuery,
  categoryNavigate,
  onOpen,
  onAddToBag,
  priceLabel,
  shopBrand,
  currencyMode,
}: {
  products: StoreProduct[];
  searchQuery: string;
  categoryNavigate?: { category: string | null; at: number } | null;
  onOpen: (id: string) => void;
  onAddToBag: (p: StoreProduct) => void;
  priceLabel: (inr: number) => string;
  shopBrand: string;
  currencyMode: ShopCurrencyMode;
}) {
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [priceMin, setPriceMin] = useState(0);
  const [priceMax, setPriceMax] = useState(0);
  const [priceInitialized, setPriceInitialized] = useState(false);
  const [sortBy, setSortBy] = useState<PlpSort>("featured");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  const [openFilters, setOpenFilters] = useState({ size: false, color: false, range: true });

  useEffect(() => {
    if (!categoryNavigate) return;
    setFilterCategory(categoryNavigate.category);
    setSelectedGroups([]);
  }, [categoryNavigate?.at]);

  const priceExtent = useMemo(() => {
    if (!products.length) return { min: 0, max: 0 };
    const prices = products.map((p) => p.basePriceInr);
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }, [products]);

  useEffect(() => {
    if (!priceInitialized && products.length) {
      setPriceMin(priceExtent.min);
      setPriceMax(priceExtent.max);
      setPriceInitialized(true);
    }
  }, [products.length, priceExtent.min, priceExtent.max, priceInitialized]);

  const categoryTree = useMemo(() => {
    const byCat = new Map<string, Map<string, number>>();
    for (const p of products) {
      const cat = productCategoryLabel(p);
      const sub = productSubcategoryLabel(p);
      if (!byCat.has(cat)) byCat.set(cat, new Map());
      const subs = byCat.get(cat)!;
      subs.set(sub, (subs.get(sub) || 0) + 1);
    }

    return Array.from(byCat.entries())
      .map(([category, subs]) => {
        const defaults = [...(CATALOG_SUBCATEGORIES[category] ?? [])];
        const present = Array.from(subs.entries()).map(([label, count]) => ({ label, count }));
        const presentNames = new Set(present.map((g) => g.label));
        const ordered: Array<{ label: string; count: number }> = [];
        for (const label of defaults) {
          if (presentNames.has(label)) {
            ordered.push({ label, count: subs.get(label) || 0 });
            presentNames.delete(label);
          }
        }
        for (const g of present.sort((a, b) => a.label.localeCompare(b.label))) {
          if (presentNames.has(g.label)) ordered.push(g);
        }
        const count = present.reduce((n, g) => n + g.count, 0);
        return { category, count, groups: ordered };
      })
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [products]);

  function groupKey(category: string, group: string) {
    return `${category}::${group}`;
  }

  const scopedProducts = useMemo(() => {
    if (selectedGroups.length) {
      const keys = new Set(selectedGroups);
      return products.filter((p) =>
        keys.has(groupKey(productCategoryLabel(p), productSubcategoryLabel(p))),
      );
    }
    if (filterCategory) {
      return products.filter((p) => productCategoryLabel(p) === filterCategory);
    }
    return products;
  }, [products, filterCategory, selectedGroups]);

  const sizeOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of scopedProducts) {
      for (const size of distinct(p.variants?.map((v) => v.size) ?? [])) {
        counts.set(size, (counts.get(size) || 0) + 1);
      }
    }
    return sortSizes(Array.from(counts.keys())).map((size) => ({
      size,
      count: counts.get(size) || 0,
    }));
  }, [scopedProducts]);

  const colorOptions = useMemo(() => {
    const byName = new Map<string, { name: string; hex: string; count: number }>();
    for (const p of scopedProducts) {
      for (const c of productColorOptions(p)) {
        const prev = byName.get(c.name);
        if (prev) prev.count += 1;
        else byName.set(c.name, { name: c.name, hex: c.hex, count: 1 });
      }
    }
    return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [scopedProducts]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    let list = scopedProducts.filter((p) => {
      if (q) {
        const hay = `${p.name} ${p.brand || ""} ${p.category || ""} ${p.subcategory || ""} ${p.group || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (selectedSizes.length) {
        const sizes = distinct(p.variants?.map((v) => v.size) ?? []);
        if (!selectedSizes.some((s) => sizes.includes(s))) return false;
      }
      if (selectedColors.length) {
        const colors = productColorOptions(p).map((c) => c.name);
        if (!selectedColors.some((c) => colors.includes(c))) return false;
      }
      if (
        priceInitialized &&
        priceMin >= 0 &&
        priceMax > priceMin &&
        (p.basePriceInr < priceMin || p.basePriceInr > priceMax)
      ) {
        return false;
      }
      return true;
    });

    if (sortBy === "price-asc") list = [...list].sort((a, b) => a.basePriceInr - b.basePriceInr);
    else if (sortBy === "price-desc") list = [...list].sort((a, b) => b.basePriceInr - a.basePriceInr);
    else if (sortBy === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));

    return list;
  }, [
    scopedProducts,
    searchQuery,
    selectedSizes,
    selectedColors,
    priceMin,
    priceMax,
    priceInitialized,
    sortBy,
  ]);

  const rangeLabel = currencyMode === "inr" ? "Credits range" : "Points range";
  const unitWord = currencyMode === "inr" ? "credits" : "points";
  const hasActiveFilters =
    Boolean(filterCategory) ||
    selectedGroups.length > 0 ||
    selectedSizes.length > 0 ||
    selectedColors.length > 0 ||
    (priceInitialized && (priceMin > priceExtent.min || priceMax < priceExtent.max));

  function clearFilters() {
    setFilterCategory(null);
    setSelectedGroups([]);
    setSelectedSizes([]);
    setSelectedColors([]);
    setPriceMin(priceExtent.min);
    setPriceMax(priceExtent.max);
    setSortBy("featured");
  }

  function selectCategory(category: string) {
    setFilterCategory(category);
    setSelectedGroups([]);
    setOpenCategories((prev) => ({ ...prev, [category]: true }));
  }

  function toggleGroup(category: string, group: string) {
    const key = groupKey(category, group);
    setFilterCategory(category);
    setOpenCategories((prev) => ({ ...prev, [category]: true }));
    setSelectedGroups((prev) => {
      if (prev.includes(key)) {
        const next = prev.filter((k) => k !== key);
        return next;
      }
      return [...prev, key];
    });
  }

  function toggleSize(size: string) {
    setSelectedSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size],
    );
  }

  function toggleColor(color: string) {
    setSelectedColors((prev) =>
      prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color],
    );
  }

  return (
    <div className="sf-plp-layout">
      <section className="sf-plp-hero">
        <div className="sf-plp-hero-copy">
          <div>
            <div className="sf-catalog-eyebrow">The collection</div>
            <h1 className="sf-plp-hero-title">{filterCategory || "All products"}</h1>
            <p className="sf-plp-hero-desc">
              Browse the full shop. Filter by category, size, color, and{" "}
              {currencyMode === "inr" ? "credits" : "points"}.
            </p>
          </div>
        </div>
      </section>

      <div className="sf-plp-body">
        <aside className={`sf-plp-sidebar${mobileFiltersOpen ? " is-open" : ""}`} aria-label="Product filters">
          <button
            type="button"
            className="sf-mobile-filter-toggle"
            aria-expanded={mobileFiltersOpen}
            aria-controls="sf-product-filters"
            onClick={() => setMobileFiltersOpen((open) => !open)}
          >
            <span>Filter products{hasActiveFilters ? " · Filters applied" : ""}</span>
            <span aria-hidden="true">{mobileFiltersOpen ? "−" : "+"}</span>
          </button>
          <div id="sf-product-filters" className="sf-plp-sidebar-card">
            <div className="sf-plp-filter-block">
              <div className="sf-plp-filter-head-row">
                <div className="sf-plp-filter-title">Product types</div>
                {hasActiveFilters ? (
                  <button type="button" className="sf-plp-clear" onClick={clearFilters}>
                    Clear filters
                  </button>
                ) : null}
              </div>

              <button
                type="button"
                className={`sf-plp-cat-item${!filterCategory && !selectedGroups.length ? " is-active" : ""}`}
                onClick={clearFilters}
              >
                <span>All Products</span>
                <span className="sf-plp-cat-count">{products.length}</span>
              </button>

              <div className="sf-plp-cat-tree">
                {categoryTree.map((node) => {
                  const open =
                    openCategories[node.category] ??
                    (filterCategory === node.category ||
                      selectedGroups.some((k) => k.startsWith(`${node.category}::`)));
                  const catActive =
                    filterCategory === node.category &&
                    !selectedGroups.some((k) => k.startsWith(`${node.category}::`));
                  return (
                    <div key={node.category} className="sf-plp-cat-node">
                      <div className="sf-plp-cat-node-row">
                        <button
                          type="button"
                          className={`sf-plp-cat-item sf-plp-cat-item--parent${catActive ? " is-active" : ""}`}
                          onClick={() => selectCategory(node.category)}
                        >
                          <span>{node.category}</span>
                          <span className="sf-plp-cat-count">{node.count}</span>
                        </button>
                        <button
                          type="button"
                          className="sf-plp-cat-chevron"
                          aria-label={`${open ? "Collapse" : "Expand"} ${node.category}`}
                          aria-expanded={open}
                          onClick={() =>
                            setOpenCategories((prev) => ({
                              ...prev,
                              [node.category]: !open,
                            }))
                          }
                        >
                          <ChevronDownIcon open={open} />
                        </button>
                      </div>
                      {open ? (
                        <div className="sf-plp-cat-children">
                          {node.groups.map((g) => {
                            const key = groupKey(node.category, g.label);
                            const checked = selectedGroups.includes(key);
                            return (
                              <label
                                key={g.label}
                                className={`sf-plp-cat-check${checked ? " is-active" : ""}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleGroup(node.category, g.label)}
                                />
                                <span className="sf-plp-check-box" aria-hidden="true" />
                                <span className="sf-plp-cat-check-label">{g.label}</span>
                                <span className="sf-plp-cat-count">{g.count}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            {sizeOptions.length > 0 ? (
              <div className="sf-plp-filter-block">
                <button
                  type="button"
                  className="sf-plp-filter-toggle"
                  aria-expanded={openFilters.size}
                  onClick={() => setOpenFilters((f) => ({ ...f, size: !f.size }))}
                >
                  <span>Filter by</span>
                  <span className="sf-plp-filter-toggle-right">
                    Size <ChevronDownIcon open={openFilters.size} />
                  </span>
                </button>
                {openFilters.size ? (
                  <div className="sf-plp-check-list">
                    {sizeOptions.map((opt) => (
                      <label key={opt.size} className="sf-plp-check">
                        <input
                          type="checkbox"
                          checked={selectedSizes.includes(opt.size)}
                          onChange={() => toggleSize(opt.size)}
                        />
                        <span className="sf-plp-check-box" aria-hidden="true" />
                        <span className="sf-plp-check-label">{opt.size}</span>
                        <span className="sf-plp-check-count">{opt.count}</span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {colorOptions.length > 0 ? (
              <div className="sf-plp-filter-block">
                <button
                  type="button"
                  className="sf-plp-filter-toggle"
                  aria-expanded={openFilters.color}
                  onClick={() => setOpenFilters((f) => ({ ...f, color: !f.color }))}
                >
                  <span>Filter by</span>
                  <span className="sf-plp-filter-toggle-right">
                    Color <ChevronDownIcon open={openFilters.color} />
                  </span>
                </button>
                {openFilters.color ? (
                  <div className="sf-plp-color-list">
                    {colorOptions.map((opt) => {
                      const on = selectedColors.includes(opt.name);
                      return (
                        <button
                          key={opt.name}
                          type="button"
                          className={`sf-plp-color${on ? " is-active" : ""}`}
                          onClick={() => toggleColor(opt.name)}
                          title={`${opt.name} (${opt.count})`}
                          aria-pressed={on}
                        >
                          <span
                            className="sf-plp-color-swatch"
                            style={{ background: opt.hex }}
                            aria-hidden="true"
                          />
                          <span className="sf-plp-color-name">{opt.name}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}

            {products.length > 0 ? (
              <div className="sf-plp-filter-block">
                <button
                  type="button"
                  className="sf-plp-filter-toggle"
                  aria-expanded={openFilters.range}
                  onClick={() => setOpenFilters((f) => ({ ...f, range: !f.range }))}
                >
                  <span>Filter by</span>
                  <span className="sf-plp-filter-toggle-right">
                    {rangeLabel} <ChevronDownIcon open={openFilters.range} />
                  </span>
                </button>
                {openFilters.range ? (
                  <div className="sf-plp-range sf-plp-range--inputs">
                    <label className="sf-plp-range-field">
                      <span className="sf-plp-range-field-label">Min.</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        value={Number.isFinite(priceMin) ? priceMin : 0}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") {
                            setPriceMin(0);
                            return;
                          }
                          const next = Number(raw);
                          if (!Number.isFinite(next)) return;
                          setPriceMin(Math.max(0, Math.floor(next)));
                        }}
                        onBlur={() => {
                          let next = Math.max(0, Math.floor(Number(priceMin) || 0));
                          if (next >= priceMax) next = Math.max(0, priceMax - 1);
                          setPriceMin(next);
                        }}
                        aria-label={`Minimum ${unitWord}`}
                      />
                    </label>
                    <label className="sf-plp-range-field">
                      <span className="sf-plp-range-field-label">Max.</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        value={Number.isFinite(priceMax) ? priceMax : 0}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") {
                            setPriceMax(0);
                            return;
                          }
                          const next = Number(raw);
                          if (!Number.isFinite(next)) return;
                          setPriceMax(Math.max(0, Math.floor(next)));
                        }}
                        onBlur={() => {
                          let next = Math.max(0, Math.floor(Number(priceMax) || 0));
                          if (next <= priceMin) next = priceMin + 1;
                          setPriceMax(next);
                        }}
                        aria-label={`Maximum ${unitWord}`}
                      />
                    </label>
                    {priceMin < 0 || priceMax < 0 || priceMin === priceMax ? (
                      <p className="sf-plp-range-hint" role="status">
                        Enter non-negative {unitWord}; min and max must differ.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>

        <div className="sf-plp-main">
          <div className="sf-plp-toolbar">
            <div className="sf-plp-count">
              {filtered.length} {filtered.length === 1 ? "Product" : "Products"}
            </div>
            <div className="sf-plp-toolbar-right">
              <label className="sf-plp-sort">
                <span>Sort by:</span>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as PlpSort)}>
                  <option value="featured">Featured</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                  <option value="name">Name</option>
                </select>
              </label>
              <div className="sf-plp-view-toggle" role="group" aria-label="View mode">
                <button
                  type="button"
                  className={viewMode === "grid" ? "is-active" : ""}
                  aria-label="Grid view"
                  aria-pressed={viewMode === "grid"}
                  onClick={() => setViewMode("grid")}
                >
                  <GridViewIcon />
                </button>
                <button
                  type="button"
                  className={viewMode === "list" ? "is-active" : ""}
                  aria-label="List view"
                  aria-pressed={viewMode === "list"}
                  onClick={() => setViewMode("list")}
                >
                  <ListViewIcon />
                </button>
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <StoreEmptyState
              variant="search"
              title="No products found"
              description="Try clearing filters or adjusting your search."
            />
          ) : (
            <div className={`sf-plp-grid${viewMode === "list" ? " sf-plp-grid--list" : ""}`}>
              {filtered.map((p) => (
                <StadiumProductCard
                  key={p._id}
                  product={p}
                  brandLabel={(p.brand || shopBrand || "Rewards").toUpperCase()}
                  price={priceLabel(p.basePriceInr)}
                  listMode={viewMode === "list"}
                  onOpen={() => onOpen(p._id)}
                  onAddToBag={() => onAddToBag(p)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <section className="sf-plp-trust" aria-label="Store promises">
        <div className="sf-plp-trust-item">
          <span className="sf-plp-trust-icon"><ShieldCheckIcon /></span>
          <div>
            <div className="sf-plp-trust-title">Secure & Reliable</div>
            <div className="sf-plp-trust-desc">Safe checkout, always.</div>
          </div>
        </div>
        <div className="sf-plp-trust-item">
          <span className="sf-plp-trust-icon"><GiftIcon /></span>
          <div>
            <div className="sf-plp-trust-title">Hassle-free Gifting</div>
            <div className="sf-plp-trust-desc">Send joy in just a few clicks.</div>
          </div>
        </div>
        <div className="sf-plp-trust-item">
          <span className="sf-plp-trust-icon"><HeadsetIcon /></span>
          <div>
            <div className="sf-plp-trust-title">Need Help?</div>
            <div className="sf-plp-trust-desc">We&apos;re here for you.</div>
          </div>
        </div>
        <div className="sf-plp-trust-item">
          <span className="sf-plp-trust-icon"><RibbonIcon /></span>
          <div>
            <div className="sf-plp-trust-title">100% Satisfaction</div>
            <div className="sf-plp-trust-desc">Quality you can trust.</div>
          </div>
        </div>
      </section>
    </div>
  );
}

function StadiumProductGrid({
  products,
  shopBrand,
  onOpen,
  priceLabel,
  onAddToBag,
  showSwatches = false,
  showWishlist = false,
  showBadges = false,
  addLabel = "Add to Bag",
  gridClassName,
}: {
  products: StoreProduct[];
  shopBrand: string;
  onOpen: (id: string) => void;
  priceLabel: (inr: number) => string;
  onAddToBag?: (p: StoreProduct) => void;
  showSwatches?: boolean;
  showWishlist?: boolean;
  showBadges?: boolean;
  addLabel?: string;
  gridClassName?: string;
}) {
  if (products.length === 0) {
    return (
      <StoreEmptyState
        variant="search"
        title="No products found"
        description="Try adjusting your search or browse all categories."
      />
    );
  }
  return (
    <div className={`sf-product-grid sf-product-grid--stadium${gridClassName ? ` ${gridClassName}` : ""}`}>
      {products.map((p, index) => (
        <StadiumProductCard
          key={p._id}
          product={p}
          brandLabel={(p.brand || shopBrand || "Rewards").toUpperCase()}
          price={priceLabel(p.basePriceInr)}
          onOpen={() => onOpen(p._id)}
          onAddToBag={onAddToBag ? () => onAddToBag(p) : undefined}
          showSwatches={showSwatches}
          showWishlist={showWishlist}
          badge={showBadges ? homeBadgeForIndex(index) : undefined}
          addLabel={addLabel}
          hideBagIcon={addLabel.toLowerCase().includes("cart")}
        />
      ))}
    </div>
  );
}

function HeartOutlineIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path
        d="M20.8 5.6a4.6 4.6 0 0 0-6.5 0L12 7.9l-2.3-2.3a4.6 4.6 0 1 0-6.5 6.5l2.3 2.3L12 21l6.5-6.6 2.3-2.3a4.6 4.6 0 0 0 0-6.5z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StadiumProductCard({
  product,
  brandLabel,
  price,
  onOpen,
  onAddToBag,
  listMode = false,
  showSwatches = false,
  showWishlist = false,
  badge,
  addLabel = "Add to Bag",
  hideBagIcon = false,
}: {
  product: StoreProduct;
  brandLabel: string;
  price: string;
  onOpen: () => void;
  onAddToBag?: () => void;
  listMode?: boolean;
  showSwatches?: boolean;
  showWishlist?: boolean;
  badge?: string;
  addLabel?: string;
  hideBagIcon?: boolean;
}) {
  const colors = showSwatches ? productColorOptions(product) : [];
  const visibleColors = colors.slice(0, 4);
  const extraColors = colors.length - visibleColors.length;
  const badgeTone =
    badge === "Best seller"
      ? "bestseller"
      : badge === "Popular"
        ? "popular"
        : badge === "Trending"
          ? "trending"
          : badge === "Eco-friendly"
            ? "eco"
            : "new";

  return (
    <article className={`sf-pcard sf-pcard--stadium${listMode ? " sf-pcard--list" : ""}`}>
      <div className="sf-pcard-img sf-pcard-img--stadium">
        <button type="button" className="sf-pcard-media" onClick={onOpen} aria-label={product.name}>
          <ArtworkMockup product={product} hoverSwapViews />
        </button>
        {badge ? <span className={`sf-pcard-badge sf-pcard-badge--${badgeTone}`}>{badge}</span> : null}
        {showWishlist ? (
          <button
            type="button"
            className="sf-wishlist sf-wishlist--visible"
            aria-label="Save for later"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <HeartOutlineIcon />
          </button>
        ) : null}
      </div>
      <div className="sf-pcard-meta sf-pcard-meta--stadium">
        <button type="button" className="sf-pcard-text" onClick={onOpen}>
          <div className="sf-pcard-brand">{brandLabel}</div>
          <div className="sf-pcard-name">{product.name}</div>
          {showSwatches && visibleColors.length > 0 ? (
            <div className="sf-pcard-swatches">
              {visibleColors.map((c) => (
                <span
                  key={c.name}
                  className="sf-pcard-sw"
                  style={{ background: c.hex }}
                  title={c.name}
                  aria-hidden="true"
                />
              ))}
              {extraColors > 0 ? <span className="sf-pcard-sw-more">+{extraColors}</span> : null}
            </div>
          ) : null}
          <div className="sf-pcard-price-row">
            <div className="sf-pcard-price"><span className="sf-pcard-price-label">From</span> {price}</div>
            <span className="sf-pcard-min">Min 1</span>
          </div>
        </button>
        {onAddToBag ? (
          <button
            type="button"
            className="sf-pcard-add"
            onClick={(e) => {
              e.stopPropagation();
              onAddToBag();
            }}
          >
            {hideBagIcon ? null : <ShoppingBagIcon />}
            {addLabel}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function SizeGuideModal({
  open,
  sizeGuide,
  onClose,
}: {
  open: boolean;
  sizeGuide: string;
  onClose: () => void;
}) {

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <button type="button" className="sf-size-guide-scrim" aria-label="Close size guide" onClick={onClose} />
      <div
        className="sf-size-guide-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sf-size-guide-title"
      >
        <div className="sf-size-guide-panel">
          <div className="sf-size-guide-head">
            <h2 id="sf-size-guide-title" className="sf-size-guide-title">
              Size Guide
            </h2>
            <button type="button" className="sf-size-guide-close" aria-label="Close" onClick={onClose}>
              <CloseIcon />
            </button>
          </div>

          {sizeGuide ? (
            <SizeGuideTable sizeGuide={sizeGuide} className="sf-size-guide-table" />
          ) : null}
        </div>
      </div>
    </>
  );
}

function PdpSizeSelect({
  value,
  sizes,
  onChange,
}: {
  value?: string;
  sizes: string[];
  onChange: (size: string | undefined) => void;
}) {
  return (
    <div className="sf-pdp-size-circles" role="listbox" aria-label="Size">
      {sizes.map((s) => {
        const selected = value === s;
        return (
          <button
            key={s}
            type="button"
            role="option"
            aria-selected={selected}
            aria-label={s}
            className={`sf-pdp-size-circle${selected ? " sf-pdp-size-circle--on" : ""}`}
            onClick={() => onChange(selected ? undefined : s)}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}

function OrdersEmptyState({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="sf-orders-empty-panel">
      <img
        className="sf-orders-empty-icon"
        src="/images/orders-empty-box.png"
        alt=""
        aria-hidden="true"
      />
      <h2 className="sf-orders-empty-title">No orders yet</h2>
      <p className="sf-orders-empty-copy">
        You haven&apos;t redeemed any products from the store yet. Your redeemed products will appear
        here.
      </p>
      <button type="button" className="sf-orders-empty-cta" onClick={onBrowse}>
        Browse products
        <ArrowRightIcon />
      </button>
    </div>
  );
}

type OrdersFilter = "all" | "placed" | "shipped" | "delivered" | "cancelled";

function OrdersListView({
  orders,
  products,
  priceLabel,
  currencyMode,
  onOpen,
}: {
  orders: StoreOrderSummary[];
  products: StoreProduct[];
  priceLabel: (inr: number) => string;
  currencyMode: ShopCurrencyMode;
  onOpen: (orderNumber: string) => void;
}) {
  const [filter, setFilter] = useState<OrdersFilter>("all");

  const filteredOrders = useMemo(() => {
    if (filter === "all") return orders;
    return orders.filter((o) => {
      const status = o.status.toLowerCase();
      if (filter === "delivered") return status === "delivered";
      if (filter === "cancelled") return status === "cancelled";
      if (filter === "shipped") {
        return ["shipped", "packed", "in_production", "qc_pending"].includes(status);
      }
      return !["delivered", "cancelled", "shipped", "packed", "in_production", "qc_pending"].includes(status);
    });
  }, [orders, filter]);

  return (
    <div className="sf-my-orders-panel">
      <div className="sf-my-orders-head">
        <div>
          <h1 className="sf-my-orders-title">My orders</h1>
          <p className="sf-my-orders-sub">Track and view your redeemed products.</p>
        </div>
        <label className="sf-my-orders-filter">
          <span>Filter:</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value as OrdersFilter)}>
            <option value="all">All Orders</option>
            <option value="placed">Order placed</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
      </div>

      <div className="sf-my-orders-list">
        {filteredOrders.map((o) => (
          <OrderRowCard
            key={o.orderNumber}
            order={o}
            products={products}
            priceLabel={priceLabel}
            currencyMode={currencyMode}
            onOpen={() => onOpen(o.orderNumber)}
          />
        ))}
      </div>
    </div>
  );
}

function OrderRowCard({
  order,
  products,
  priceLabel,
  currencyMode,
  onOpen,
}: {
  order: StoreOrderSummary;
  products: StoreProduct[];
  priceLabel: (inr: number) => string;
  currencyMode: ShopCurrencyMode;
  onOpen: () => void;
}) {
  const items = order.items ?? [];
  const primary = items[0];
  const status = orderStatusDisplay(order);
  const qty = items.reduce((n, item) => n + (item.qty || 1), 0) || order.itemCount || 1;
  const totalInr =
    order.amountBreakdown?.subtotal ??
    order.total ??
    orderItemLinePrice(primary) ??
    0;
  const secondaryPts =
    currencyMode === "inr"
      ? `${inrToPoints(totalInr).toLocaleString("en-IN")} Pts`
      : null;

  return (
    <button type="button" className="sf-my-order-card" onClick={onOpen}>
      <div className="sf-my-order-thumb">
        {primary ? (
          <OrderItemThumb item={primary} products={products} layout="row" />
        ) : (
          <span className="sf-my-order-thumb-fallback" aria-hidden="true">
            <PackageIcon />
          </span>
        )}
      </div>

      <div className="sf-my-order-info">
        <div className="sf-my-order-name">{primary?.name || `Order #${order.orderNumber}`}</div>
        <div className="sf-my-order-meta">Qty: {qty}</div>
        <div className="sf-my-order-id">Order ID: #{order.orderNumber}</div>
      </div>

      <div className="sf-my-order-date">
        <div className="sf-my-order-date-label">Ordered on</div>
        <div className="sf-my-order-date-value">{formatOrderDate(order.createdAt) || "—"}</div>
        <div className="sf-my-order-date-time">{formatOrderTime(order.createdAt)}</div>
      </div>

      <div className="sf-my-order-price">
        <div className="sf-my-order-price-main">{priceLabel(totalInr)}</div>
        {secondaryPts ? <div className="sf-my-order-price-sub">({secondaryPts})</div> : null}
      </div>

      <div className={`sf-my-order-status sf-my-order-status--${status.tone}`}>
        <div className="sf-my-order-status-pill">
          <span className="sf-my-order-status-dot" aria-hidden="true" />
          <span>{status.title}</span>
        </div>
        <div className="sf-my-order-status-msg">{status.message}</div>
      </div>

      <span className="sf-my-order-arrow" aria-hidden="true">
        <ArrowRightIcon />
      </span>
    </button>
  );
}

function OrderDetailView({
  order,
  products,
  shopName,
  priceLabel,
  onBack,
}: {
  order: StoreOrderSummary;
  products: StoreProduct[];
  shopName: string;
  priceLabel: (inr: number) => string;
  onBack: () => void;
}) {
  const items = order.items ?? [];
  const addr = order.shippingAddress;
  const breakdown = order.amountBreakdown;
  const timeline = (order.statusHistory ?? []).filter((h) => h.status && h.at);
  const status = orderStatusDisplay(order);
  const totalInr = breakdown?.subtotal ?? order.total;

  return (
    <div className="sf-order-detail-page">
      <header className="sf-order-detail-hero">
        <button type="button" className="sf-order-detail-back" onClick={onBack}>
          <ChevronLeftIcon />
          Back to orders
        </button>

        <div className="sf-order-detail-hero-row">
          <h1 className="sf-order-detail-hero-title">Order details</h1>
          <div className={`sf-order-detail-status sf-order-detail-status--${status.tone}`}>
            <div className="sf-order-detail-status-pill">
              <span className="sf-order-detail-status-dot" aria-hidden="true" />
              <span>{formatOrderStatus(order.status)}</span>
            </div>
          </div>
        </div>

        <div className="sf-order-detail-hero-meta">
          <span className="sf-order-detail-hero-meta-id">#{order.orderNumber}</span>
          <span className="sf-order-detail-hero-meta-sep" aria-hidden="true">·</span>
          <span>
            Placed {formatOrderDate(order.createdAt)}
            {formatOrderTime(order.createdAt) ? ` at ${formatOrderTime(order.createdAt)}` : ""}
          </span>
          <span className="sf-order-detail-hero-meta-sep" aria-hidden="true">·</span>
          <span>
            {items.length === 1 ? "1 item" : `${items.length} items`}
          </span>
        </div>
        {status.message ? (
          <p className="sf-order-detail-hero-status-msg">{status.message}</p>
        ) : null}
      </header>

      <div className="sf-order-detail-layout">
        <div className="sf-order-detail-main">
          <section className="sf-order-detail-card sf-order-detail-card--items">
            <div className="sf-order-detail-card-head">
              <h2 className="sf-order-detail-card-title">Items in this order</h2>
              <span className="sf-order-detail-seller-badge">Sold by {shopName}</span>
            </div>

            <div className="sf-order-detail-products">
              {items.length > 0 ? (
                items.map((item, idx) => (
                  <OrderItemLine
                    key={orderItemKey(item, idx)}
                    item={item}
                    products={products}
                    priceLabel={priceLabel}
                    layout="detail"
                  />
                ))
              ) : (
                <p className="sf-order-detail-empty-items">No item details available.</p>
              )}
            </div>
          </section>

          <section className="sf-order-detail-card sf-order-detail-card--timeline">
            <h2 className="sf-order-detail-card-title">Tracking</h2>
            {timeline.length > 0 ? (
              <div className="sf-order-detail-timeline">
                {timeline.map((step, i) => (
                  <div key={`${step.status}-${step.at}`} className="sf-order-detail-step">
                    <div className={`sf-order-detail-step-dot${i === timeline.length - 1 ? " sf-order-detail-step-dot--on" : ""}`} />
                    <div className="sf-order-detail-step-copy">
                      <div className="sf-order-detail-step-title">{formatOrderStatus(step.status)}</div>
                      <div className="sf-order-detail-step-date">
                        {formatOrderDate(step.at)}
                        {formatOrderTime(step.at) ? ` · ${formatOrderTime(step.at)}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="sf-order-detail-timeline">
                <div className="sf-order-detail-step">
                  <div className="sf-order-detail-step-dot sf-order-detail-step-dot--on" />
                  <div className="sf-order-detail-step-copy">
                    <div className="sf-order-detail-step-title">{formatOrderStatus(order.status)}</div>
                    <div className="sf-order-detail-step-date">
                      {formatOrderDate(order.createdAt)}
                      {formatOrderTime(order.createdAt) ? ` · ${formatOrderTime(order.createdAt)}` : ""}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="sf-order-detail-side">
          {addr ? (
            <section className="sf-order-detail-card sf-order-detail-card--delivery">
              <h2 className="sf-order-detail-card-title">Delivery details</h2>
              <div className="sf-order-detail-delivery">
                {(addr.name || addr.phone) ? (
                  <div className="sf-order-detail-delivery-contact">
                    {addr.name ? <strong>{addr.name}</strong> : null}
                    {addr.phone ? <span>{addr.phone}</span> : null}
                  </div>
                ) : null}
                <div className="sf-order-detail-delivery-address">
                  <MapPinFieldIcon />
                  <p>
                    {[addr.line1, addr.line2, addr.city, addr.state, addr.pincode, addr.country]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          <section className="sf-order-detail-card sf-order-detail-card--price">
            <h2 className="sf-order-detail-card-title">Price details</h2>
            <div className="sf-order-detail-prices">
              <div className="sf-order-detail-price-row">
                <span>
                  Subtotal
                  <span className="sf-order-detail-price-sub">Incl. GST</span>
                </span>
                <span className="sf-order-detail-price-value">
                  {totalInr != null ? priceLabel(totalInr) : "—"}
                </span>
              </div>
              <div className="sf-order-detail-total-panel">
                <span className="sf-order-detail-total-label">Order total</span>
                <span className="sf-order-detail-total-value">
                  {totalInr != null ? priceLabel(totalInr) : "—"}
                </span>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ProductDetail({ product, mode, priceLabel, onBack, onAdd }: {
  product: StoreProduct;
  mode: Mode;
  priceLabel: (n: number) => string;
  onBack: () => void;
  onAdd: (variant: { size?: string; color?: string }, qty: number) => void;
}) {
  const isShopper = mode === "redeem" || mode === "store";
  const variants = product.variants || [];
  const colorOptions = useMemo(() => productColorOptions(product), [product]);
  const [selColor, setSelColor] = useState(() => primaryColorIndex(colorOptions));
  const [hasUserPickedColor, setHasUserPickedColor] = useState(false);
  const [qty, setQty] = useState(1);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [mockupView, setMockupView] = useState<ProductViewKey>("front");
  const selectedColor = colorOptions[selColor];
  const sizes = useMemo(() => {
    const colorName = selectedColor?.name;
    const colorHex = selectedColor?.hex;
    if (!colorOptions.length) {
      return distinct(variants.map((v) => v.size));
    }
    return distinct(
      variants
        .filter((v) => {
          if (!colorName) return true;
          const vName = String(v.color || "").trim();
          if (vName && vName === String(colorName).trim()) return true;
          if (colorHex) {
            const vResolvedHex = resolveColorHex(vName || undefined, v.colorHex);
            if (vResolvedHex && vResolvedHex.toLowerCase() === colorHex.toLowerCase()) return true;
          }
          return false;
        })
        .map((v) => v.size),
    );
  }, [variants, selectedColor?.name, selectedColor?.hex, colorOptions.length]);

  const [size, setSize] = useState<string | undefined>(() => (sizes.length === 1 ? sizes[0] : undefined));
  const previewTintHex = getMockupTintHex(selectedColor?.hex, hasUserPickedColor);
  const sizeRequired = sizes.length > 1;
  const hasVariants = colorOptions.length > 0 || sizes.length > 0;
  const canAdd = !sizeRequired || !!size;
  const productViews = productViewKeys(product);
  const hasMultipleViews = productViews.length > 1;

  useEffect(() => {
    setSelColor(primaryColorIndex(colorOptions));
    setHasUserPickedColor(false);
    // Size depends on the selected color; the next effect will sync it after `selColor` updates.
    setSize(undefined);
    setQty(1);
    setSizeGuideOpen(false);
    setMockupView("front");
  }, [product._id, colorOptions]);

  useEffect(() => {
    // Keep size in sync with the selected color. If current size isn't available for this color,
    // clear it (or auto-pick if there's only one available size).
    setSize((cur) => {
      if (sizes.length === 1) return sizes[0];
      if (cur && sizes.includes(cur)) return cur;
      return undefined;
    });
  }, [selColor, sizes]);

  useEffect(() => {
    if (!productViews.includes(mockupView)) setMockupView("front");
  }, [productViews, mockupView]);

  const openSizeGuide = () => setSizeGuideOpen(true);

  return (
    <>
      <button type="button" className="sf-pdp-back" onClick={onBack}>
        ← BACK TO ALL PRODUCTS
      </button>

      <div className="sf-pdp-layout">
        <div className="sf-pdp-gallery">
          {hasMultipleViews ? (
            <div className="sf-pdp-thumbs" role="tablist" aria-label="Product views">
              {productViews.map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={mockupView === v}
                  aria-label={viewAriaLabel(v)}
                  className={`sf-pdp-thumb-btn${mockupView === v ? " sf-pdp-thumb-btn--on" : ""}`}
                  onClick={() => setMockupView(v)}
                >
                  <ArtworkMockup
                    product={product}
                    tintHex={previewTintHex}
                    view={v}
                    className="sf-pdp-thumb-mini"
                  />
                </button>
              ))}
            </div>
          ) : null}
          <div className="sf-pdp-media">
            <ArtworkMockup
              product={product}
              tintHex={previewTintHex}
              view={hasMultipleViews ? mockupView : undefined}
              onViewChange={hasMultipleViews ? setMockupView : undefined}
              className="sf-pdp-main-image"
            />
            <button type="button" className="sf-pdp-zoom" aria-label="Zoom image">
              <ZoomIcon />
            </button>
          </div>
        </div>

        <div className="sf-pdp-buy">
          {product.brand ? (
            <div className="sf-pdp-brand">{product.brand.toUpperCase()}</div>
          ) : null}
          <h1 className="sf-pdp-title">{product.name}</h1>
          <p className="sf-pdp-price">{priceLabel(product.basePriceInr)}</p>

          {colorOptions.length > 0 ? (
            <div className="sf-pdp-field">
              <div className="sf-pdp-color-label">
                Color: <strong>{selectedColor?.name || "—"}</strong>
              </div>
              <ColorSwatches
                colors={colorOptions}
                selected={selColor}
                onSelect={(index) => {
                  setHasUserPickedColor(true);
                  setSelColor(index);
                }}
                className="sf-pdp-color-swatches"
              />
            </div>
          ) : null}

          {sizes.length > 0 ? (
            <div className="sf-pdp-field">
              <div className="sf-pdp-field-head">
                <span className="sf-pdp-size-label">Size</span>
                {product.sizeGuide ? (
                  <button type="button" className="sf-pdp-size-guide" onClick={openSizeGuide}>
                    Size Guide
                  </button>
                ) : null}
              </div>
              <PdpSizeSelect value={size} sizes={sizes} onChange={setSize} />
            </div>
          ) : null}

          {!hasVariants ? (
            <p className="muted" style={{ fontSize: 14, margin: "0 0 4px" }}>
              No variants for this product
            </p>
          ) : null}

          {isShopper ? (
            <div className="sf-pdp-purchase">
              <div className="sf-pdp-purchase-qty">
                <span className="sf-pdp-qty-label">Quantity</span>
                <div className="sf-pdp-qty">
                  <button
                    type="button"
                    className="sf-pdp-qty-btn"
                    aria-label="Decrease quantity"
                    onClick={() => setQty((n) => Math.max(1, n - 1))}
                  >
                    <MinusIcon />
                  </button>
                  <span className="sf-pdp-qty-val">{qty}</span>
                  <button
                    type="button"
                    className="sf-pdp-qty-btn"
                    aria-label="Increase quantity"
                    onClick={() => setQty((n) => n + 1)}
                  >
                    <PlusIcon />
                  </button>
                </div>
              </div>
              <button
                type="button"
                className="sf-pdp-add-btn"
                disabled={!canAdd}
                title={!canAdd ? "Select a size" : undefined}
                onClick={() =>
                  onAdd(
                    {
                      ...(size ? { size } : {}),
                      ...(selectedColor?.name ? { color: selectedColor.name } : {}),
                    },
                    qty,
                  )
                }
              >
                Add to bag
              </button>
            </div>
          ) : (
            <p className="sf-pdp-preview-note">Sign in to add this item to your bag.</p>
          )}

          <ProductInfoTabs
            product={{
              id: product._id,
              nm: product.name,
              description: product.description,
              keyFeatures: product.keyFeatures,
              sizeGuide: product.sizeGuide,
            }}
            variant="shop"
            onOpenSizeGuide={product.sizeGuide ? openSizeGuide : undefined}
          />

          {product.sizeGuide ? (
            <SizeGuideModal
              open={sizeGuideOpen}
              sizeGuide={product.sizeGuide}
              onClose={() => setSizeGuideOpen(false)}
            />
          ) : null}

          <div className="sf-pdp-footnotes">
            {/* <div className="sf-pdp-footnote">
              <TruckIcon />
              <span>One print location, basic decoration, and shipping included.</span>
            </div> */}
            <div className="sf-pdp-footnote sf-pdp-footnote--green">
              <LeafIcon />
              <span>Sustainable printing</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
