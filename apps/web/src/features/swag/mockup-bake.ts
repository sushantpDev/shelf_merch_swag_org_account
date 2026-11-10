import { mediaUrlForCanvas, resolveMediaUrl } from "@/lib/mediaUrl";
import type { UiProduct } from "@/services/mappers";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DEFAULT_DPI,
  DEFAULT_PHYSICAL,
  designPlacementOnMockup,
  normalizePlaceholder,
  physicalFrameForView,
  placeholderToStagePixels,
  placementPrintFractions,
  printExportSize,
  resolvePhysical,
  stagePixelsToArtworkPlacement,
  type ArtworkPlacement,
  type CanvasOpts,
} from "@/lib/printCoords";

function paintArtworkInPrintPlate(
  ctx: CanvasRenderingContext2D,
  args: {
    art: CanvasImageSource;
    originX: number;
    originY: number;
    printRect: { x: number; y: number; w: number; h: number; rotationDeg: number };
    rel: { cx: number; cy: number; w: number; rot: number };
    aspect: number;
  },
) {
  const { art, originX, originY, printRect, rel, aspect } = args;
  const w0 = printRect.w * rel.w;
  const h0 = w0 * aspect;
  ctx.save();
  ctx.translate(originX + printRect.x, originY + printRect.y);
  const plateRot = ((printRect.rotationDeg || 0) * Math.PI) / 180;
  if (plateRot) ctx.rotate(plateRot);
  ctx.beginPath();
  ctx.rect(0, 0, printRect.w, printRect.h);
  ctx.clip();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.96;
  ctx.translate(rel.cx * printRect.w, rel.cy * printRect.h);
  ctx.rotate(((rel.rot || 0) * Math.PI) / 180);
  ctx.drawImage(art, -w0 / 2, -h0 / 2, w0, h0);
  ctx.restore();
}

/** Per-product artwork placement — print-area % preferred; canvas % mirrored. */
export type Placement = ArtworkPlacement;

export type MockupUploadItem = {
  catalogProductId: string;
  dataUrl: string;
  /** Optional baked back-view mockup (saved as mockupBackUrl). */
  backDataUrl?: string;
  placement: Placement;
  /** Per print-area placements (Area 1, Area 2, …). */
  placements?: Array<{ key: string; artworkDataUrl?: string } & Placement>;
  designOnlyDataUrl?: string;
  printSpec?: {
    widthIn: number;
    heightIn: number;
    dpi: number;
    widthPx: number;
    heightPx: number;
  };
};

/** Legacy fallback when a product has no inch or % print area yet. */
export const DEFAULT_BOX = { xPct: 33, yPct: 30, widthPct: 34, heightPct: 38 };

export function productPhysical(p: UiProduct | undefined) {
  return resolvePhysical(p?.physicalDimensions ?? DEFAULT_PHYSICAL);
}

export function productDpi(p: UiProduct | undefined, areaDpi?: number) {
  return Math.max(1, Number(areaDpi) || Number(p?.dpi) || DEFAULT_DPI);
}

/** Resolve placeholder inches + stage pixels for a print area (or primary). */
export function resolvePrintAreaStage(
  p: UiProduct,
  canvasOpts: CanvasOpts = {},
  areaKey?: string | null,
) {
  const area = pickPrintArea(p, areaKey);
  // Catalog editing stores inches against the area's key, even when a Left/Right
  // chest area is displayed on the front mockup. Keep that same physical frame.
  const phys = physicalFrameForView(productPhysical(p), area?.key);
  const raw = area
    ? (area as unknown as Record<string, unknown>)
    : { box: DEFAULT_BOX, widthIn: 0, heightIn: 0 };
  const ph = normalizePlaceholder(raw, phys);
  const stage = placeholderToStagePixels(ph, phys, canvasOpts);
  return { area, phys, ph, stage, dpi: productDpi(p, area?.dpi) };
}

export function placementKey(prod: UiProduct, idx: number): string {
  return prod?.id || `idx${idx}`;
}

/** Catalog `key` or slug(label) — not unique when two Front areas share `key: "front"`. */
export function printAreaBaseKey(
  area: { key?: string; label?: string } | null | undefined,
  index = 0,
): string {
  if (area?.key && String(area.key).trim()) return String(area.key).trim();
  if (area?.label && String(area.label).trim()) {
    return (
      String(area.label)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || `area_${index + 1}`
    );
  }
  return `area_${index + 1}`;
}

/**
 * Stable identity for a print area. When several areas share the same catalog
 * `key` (Edit Catalog used to assign `front` to every front placeholder), later
 * ones are disambiguated as `front__1`, `front__2`, … so Design Swag can show
 * all of them. The first occurrence keeps the original key for existing drafts.
 */
export function printAreaStableKey(
  area: { key?: string; label?: string } | null | undefined,
  index = 0,
  siblings?: Array<{ key?: string; label?: string } | null | undefined> | null,
): string {
  const base = printAreaBaseKey(area, index);
  if (!siblings?.length) return base;
  const dupes = siblings
    .map((a, i) => ({ i, base: printAreaBaseKey(a, i) }))
    .filter((row) => row.base === base);
  if (dupes.length <= 1) return base;
  const first = dupes[0]?.i ?? 0;
  return index === first ? base : `${base}__${index}`;
}

/** Stable key using the product's full print-area list for uniqueness. */
export function printAreaKey(
  p: UiProduct | undefined,
  area: { key?: string; label?: string } | null | undefined,
  index = 0,
): string {
  return printAreaStableKey(area, index, listPrintAreas(p));
}

/** Usable print areas from catalog (inches or legacy box %). */
export function listPrintAreas(p: UiProduct | undefined) {
  const areas = p?.printAreas;
  if (!Array.isArray(areas) || !areas.length) return [];
  return areas.filter((a) => (a?.widthIn ?? 0) > 0 || (a?.box?.widthPct ?? 0) > 0);
}

export type ProductViewKey = "front" | "back" | "left" | "right";

function sameMediaPath(a: string, b: string): boolean {
  if (!a || !b) return false;
  return normMediaPath(a) === normMediaPath(b);
}

/** True when the asset is the catalog marketing photo, not a dedicated garment mask. */
export function isPhotoProductImage(p: UiProduct | undefined, url: string | undefined): boolean {
  if (!p || !url) return false;
  const photo = resolveMediaUrl(p.photoUrl) || resolveMediaUrl(p.imageUrls?.[0]);
  return photo ? sameMediaPath(url, photo) : false;
}

/** Which garment view a print area belongs to (from mockup URL and/or key/label). */
export function printAreaViewKey(
  p: UiProduct | undefined,
  area: { key?: string; label?: string; mockupImageUrl?: string } | null | undefined,
): ProductViewKey {
  const mockup = resolveMediaUrl(area?.mockupImageUrl);
  const views: Array<{ key: ProductViewKey; urls: string[] }> = [
    {
      key: "back",
      urls: [resolveMediaUrl(p?.maskBackImageUrl), resolveMediaUrl(p?.baseBackImageUrl)].filter(
        Boolean,
      ) as string[],
    },
    {
      key: "left",
      urls: [resolveMediaUrl(p?.maskLeftImageUrl), resolveMediaUrl(p?.baseLeftImageUrl)].filter(
        Boolean,
      ) as string[],
    },
    {
      key: "right",
      urls: [resolveMediaUrl(p?.maskRightImageUrl), resolveMediaUrl(p?.baseRightImageUrl)].filter(
        Boolean,
      ) as string[],
    },
    {
      key: "front",
      urls: [
        resolveMediaUrl(p?.maskImageUrl),
        resolveMediaUrl(p?.baseImageUrl),
        // Print areas authored on the Shopify primary when no mask was uploaded.
        resolveMediaUrl(p?.photoUrl),
        ...(p?.imageUrls || []).map((u) => resolveMediaUrl(u)).filter(Boolean),
      ].filter(Boolean) as string[],
    },
  ];
  if (mockup) {
    for (const view of views) {
      if (view.urls.some((url) => sameMediaPath(mockup, url))) {
        return view.key;
      }
    }
  }
  const token = `${area?.key || ""} ${area?.label || ""}`.toLowerCase();
  if (/\bback\b/.test(token)) return "back";
  if (/\bleft\b/.test(token)) return "left";
  if (/\bright\b/.test(token)) return "right";
  return "front";
}

/** True only when a print area is explicitly tied to a dedicated side mockup asset. */
export function printAreaUsesDedicatedSideView(
  p: UiProduct | undefined,
  area: { key?: string; label?: string; mockupImageUrl?: string } | null | undefined,
): boolean {
  const mockup = resolveMediaUrl(area?.mockupImageUrl);
  if (!mockup) return false;
  const sideUrls = [
    resolveMediaUrl(p?.maskLeftImageUrl),
    resolveMediaUrl(p?.baseLeftImageUrl),
    resolveMediaUrl(p?.maskRightImageUrl),
    resolveMediaUrl(p?.baseRightImageUrl),
  ].filter(Boolean) as string[];
  return sideUrls.some((url) => sameMediaPath(mockup, url));
}

/** Views available for a product (always front; others when mask/stage/areas exist). */
export function listProductViews(p: UiProduct | undefined): ProductViewKey[] {
  const views: ProductViewKey[] = ["front"];
  const extras: Array<{ key: ProductViewKey; hasAssets: boolean }> = [
    {
      key: "back",
      hasAssets: Boolean(
        resolveMediaUrl(p?.maskBackImageUrl) || resolveMediaUrl(p?.baseBackImageUrl),
      ),
    },
    {
      key: "left",
      hasAssets: Boolean(
        resolveMediaUrl(p?.maskLeftImageUrl) || resolveMediaUrl(p?.baseLeftImageUrl),
      ),
    },
    {
      key: "right",
      hasAssets: Boolean(
        resolveMediaUrl(p?.maskRightImageUrl) || resolveMediaUrl(p?.baseRightImageUrl),
      ),
    },
  ];
  for (const extra of extras) {
    const hasArea = listPrintAreas(p).some(
      (a) => printAreaViewKey(p, a) === extra.key && printAreaUsesDedicatedSideView(p, a),
    );
    if (extra.hasAssets || hasArea) views.push(extra.key);
  }
  return views;
}

/** Print areas that belong to a garment view. */
export function listPrintAreasForView(p: UiProduct | undefined, view: ProductViewKey) {
  return listPrintAreas(p).filter((a) => printAreaViewKey(p, a) === view);
}

/** Production mask / stage image for a garment view. */
export function designImgUrlForView(p: UiProduct | undefined, view: ProductViewKey = "front"): string {
  if (!p) return "";
  if (view === "back") {
    return resolveMediaUrl(p.maskBackImageUrl) || resolveMediaUrl(p.baseBackImageUrl) || "";
  }
  if (view === "left") {
    return resolveMediaUrl(p.maskLeftImageUrl) || resolveMediaUrl(p.baseLeftImageUrl) || "";
  }
  if (view === "right") {
    return resolveMediaUrl(p.maskRightImageUrl) || resolveMediaUrl(p.baseRightImageUrl) || "";
  }
  // Front: prefer uploaded mask/stage; if admin skipped the mask, use Shopify primary.
  return (
    resolveMediaUrl(p.maskImageUrl) ||
    resolveMediaUrl(p.baseImageUrl) ||
    resolveMediaUrl(p.photoUrl) ||
    resolveMediaUrl(p.imageUrls?.[0]) ||
    ""
  );
}

/** Draft / upload key for artwork on one print area of one product. */
export function areaPlacementKey(prod: UiProduct, idx: number, areaKey: string): string {
  return `${placementKey(prod, idx)}::${areaKey}`;
}

export function primaryAreaKey(p: UiProduct): string {
  const areas = listPrintAreas(p);
  if (!areas.length) return "area_1";
  const primary = pickPrintArea(p);
  const index = Math.max(
    0,
    primary ? areas.findIndex((a) => a === primary) : 0,
  );
  return printAreaStableKey(primary || areas[0], index >= 0 ? index : 0, areas);
}

export function resolveMediaSrc(url: string | undefined): string {
  if (!url) return "";
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  return url.startsWith("/") ? url : `/${url}`;
}

function normMediaPath(url: string | undefined): string {
  if (!url) return "";
  const path = String(url).replace(/^https?:\/\/[^/]+/i, "");
  return path.startsWith("/") ? path : `/${path}`;
}

/** Production mask used behind artwork in design previews and baked mockups.
 * Front falls back to the Shopify primary when no mask was uploaded. */
export function designImgUrl(p: UiProduct, areaKey?: string | null): string {
  if (areaKey) {
    const area = pickPrintArea(p, areaKey);
    const view = printAreaViewKey(p, area);
    const fromView = designImgUrlForView(p, view);
    if (fromView) return fromView;
    const mockup = resolveMediaUrl(area?.mockupImageUrl);
    if (mockup) return mockup;
  }
  return designImgUrlForView(p, "front") || p?.maskImageUrl || p?.baseImageUrl || "";
}

/** Same-origin path compare — ignores scheme/host so catalog vs collection refs match. */

/**
 * Production garment image for live colour tinting. Prefers a dedicated mask /
 * stage / print-area mockup; falls back to the Shopify primary when no mask was uploaded.
 */
export function resolveGarmentMaskUrl(p: UiProduct | undefined, areaKey?: string | null): string {
  if (!p) return "";
  const photo = resolveMediaUrl(p.photoUrl) || resolveMediaUrl(p.imageUrls?.[0]);
  if (areaKey) {
    const fromArea = resolveMediaUrl(designImgUrl(p, areaKey));
    if (fromArea && !sameMediaPath(fromArea, photo)) return fromArea;
  }
  const mask = resolveMediaUrl(p.maskImageUrl);
  if (mask) return mask;
  const base = resolveMediaUrl(p.baseImageUrl);
  if (base && !sameMediaPath(base, photo)) return base;
  const printArea = resolveMediaUrl(pickPrintArea(p)?.mockupImageUrl);
  if (printArea && !sameMediaPath(printArea, photo)) return printArea;
  const design = resolveMediaUrl(designImgUrl(p));
  if (design && !sameMediaPath(design, photo)) return design;
  const img = resolveMediaUrl(p.imgUrl);
  if (img && !sameMediaPath(img, photo)) return img;
  return photo || "";
}

/**
 * Pick a print area. When `areaKey` is set, prefer that key/label; otherwise
 * match mask/base mockup, else first usable area.
 */
export function pickPrintArea(p: UiProduct, areaKey?: string | null) {
  const areas = listPrintAreas(p);
  const all = areas.length ? areas : p?.printAreas || [];
  if (!all.length) return null;
  if (areaKey) {
    const hit = all.find((a, i) => printAreaStableKey(a, i, all) === areaKey);
    if (hit) return hit;
  }
  const maskUrl = p.maskImageUrl;
  if (maskUrl) {
    const maskNorm = normMediaPath(maskUrl);
    const maskArea = all.find((a) => normMediaPath(a.mockupImageUrl) === maskNorm);
    if (maskArea) return maskArea;
  }
  const backMaskUrl = p.maskBackImageUrl;
  if (backMaskUrl) {
    const backNorm = normMediaPath(backMaskUrl);
    const backArea = all.find((a) => normMediaPath(a.mockupImageUrl) === backNorm);
    if (backArea) return backArea;
  }
  if (p.baseImageUrl) {
    const baseNorm = normMediaPath(p.baseImageUrl);
    const match = all.find((a) => normMediaPath(a.mockupImageUrl) === baseNorm);
    if (match) return match;
  }
  if (p.baseBackImageUrl) {
    const baseNorm = normMediaPath(p.baseBackImageUrl);
    const match = all.find((a) => normMediaPath(a.mockupImageUrl) === baseNorm);
    if (match) return match;
  }
  for (const url of [
    p.maskLeftImageUrl,
    p.baseLeftImageUrl,
    p.maskRightImageUrl,
    p.baseRightImageUrl,
  ]) {
    if (!url) continue;
    const norm = normMediaPath(url);
    const match = all.find((a) => normMediaPath(a.mockupImageUrl) === norm);
    if (match) return match;
  }
  return (
    all.find((a) => (a?.widthIn ?? 0) > 0 || (a?.box?.widthPct ?? 0) > 0) || all[0]
  );
}

export function productHasPrintArea(p: UiProduct): boolean {
  const a = pickPrintArea(p);
  return Boolean(a && ((a.widthIn ?? 0) > 0 || (a.box?.widthPct ?? 0) > 0));
}

/** Default artwork placement — centered in the inch print area. */
export function defaultPlacement(ep: UiProduct, artAspect = 1, areaKey?: string | null): Placement {
  const { stage } = resolvePrintAreaStage(ep, {}, areaKey);
  const fitW = Math.min(stage.w * 0.92, (stage.h * 0.92) / Math.max(artAspect, 0.01));
  return stagePixelsToArtworkPlacement(
    stage.x + stage.w / 2,
    stage.y + stage.h / 2,
    fitW,
    0,
    stage,
  );
}

/** Load an image for canvas compositing (CORS-safe via media proxy when needed). */
export function loadImageEl(src: string, forCanvas = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error("no src"));
      return;
    }
    const resolved = forCanvas
      ? mediaUrlForCanvas(src) || resolveMediaSrc(src)
      : resolveMediaSrc(src);
    const im = new Image();
    if (forCanvas) im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = resolved;
  });
}

/* ---- POD realism: warp + fabric texture + sheen baked into the artwork ---- */
let fabricTex: HTMLCanvasElement | null = null;
function getFabricTexture(): HTMLCanvasElement {
  if (fabricTex) return fabricTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  const img = x.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 128 + (Math.random() * 44 - 22);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
    img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  x.globalAlpha = 0.05;
  x.strokeStyle = "#000";
  for (let i = 0; i < 128; i += 3) {
    x.beginPath();
    x.moveTo(0, i + 0.5);
    x.lineTo(128, i + 0.5);
    x.stroke();
  }
  x.globalAlpha = 1;
  fabricTex = c;
  return c;
}

function warpAmountFor(g: string | undefined): number {
  if (g === "mug" || g === "bottle" || g === "flask") return 1;
  if (g === "cap" || g === "beanie") return 0.5;
  return 0.3;
}

function cylMapX(u: number, k: number): number {
  const maxAng = k * 0.85;
  if (maxAng < 1e-3) return u;
  return 0.5 + (Math.sin((u - 0.5) * 2 * maxAng) / Math.sin(maxAng)) * 0.5;
}

/** Bake warp + fabric texture + sheen into the artwork (placement-independent). */
export function buildRealisticArtwork(
  artImg: HTMLImageElement,
  group: string | undefined,
): HTMLCanvasElement | HTMLImageElement {
  try {
    const maxDim = 1100;
    const nw = artImg.naturalWidth || artImg.width || 0;
    const nh = artImg.naturalHeight || artImg.height || 0;
    if (nw < 2 || nh < 2) return artImg;
    const s = Math.min(1, maxDim / Math.max(nw, nh));
    const w = Math.max(1, Math.round(nw * s));
    const h = Math.max(1, Math.round(nh * s));
    const base = document.createElement("canvas");
    base.width = w;
    base.height = h;
    const b = base.getContext("2d")!;

    const k = warpAmountFor(group);
    const amp = h * 0.045 * k;
    if (k > 0.05) {
      const strips = 80;
      for (let i = 0; i < strips; i++) {
        const u0 = i / strips;
        const u1 = (i + 1) / strips;
        const um = (i + 0.5) / strips;
        const dx0 = cylMapX(u0, k) * w;
        const dx1 = cylMapX(u1, k) * w;
        const bow = Math.sin(Math.PI * um);
        const dy = amp * bow * 0.5;
        const dh = h - amp * bow;
        b.drawImage(artImg, u0 * nw, 0, (u1 - u0) * nw, nh, dx0 - 0.5, dy, dx1 - dx0 + 1, dh);
      }
    } else {
      b.drawImage(artImg, 0, 0, w, h);
    }

    const tex = getFabricTexture();
    const tc = document.createElement("canvas");
    tc.width = w;
    tc.height = h;
    const tx = tc.getContext("2d")!;
    const pat = tx.createPattern(tex, "repeat")!;
    tx.fillStyle = pat;
    tx.fillRect(0, 0, w, h);
    tx.globalCompositeOperation = "destination-in";
    tx.drawImage(base, 0, 0);
    b.save();
    b.globalCompositeOperation = "overlay";
    b.globalAlpha = 0.18;
    b.drawImage(tc, 0, 0);
    b.restore();

    const lc = document.createElement("canvas");
    lc.width = w;
    lc.height = h;
    const lx = lc.getContext("2d")!;
    const grad = lx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "rgba(255,255,255,0.40)");
    grad.addColorStop(0.5, "rgba(255,255,255,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.26)");
    lx.fillStyle = grad;
    lx.fillRect(0, 0, w, h);
    lx.globalCompositeOperation = "destination-in";
    lx.drawImage(base, 0, 0);
    b.save();
    b.globalCompositeOperation = "overlay";
    b.globalAlpha = 0.5;
    b.drawImage(lc, 0, 0);
    b.restore();

    return base;
  } catch {
    return artImg;
  }
}

/** Resolve Konva placement for bake/upload — primary area, with legacy product-key fallback. */
export function resolvePlacementForBake(
  product: UiProduct,
  placements: Record<string, Placement>,
  idx: number,
  areaKey?: string | null,
): Placement {
  const key = areaKey || primaryAreaKey(product);
  const areaDraftKey = areaPlacementKey(product, idx, key);
  const productDraftKey = placementKey(product, idx);
  return (
    placements[areaDraftKey] ??
    (key === primaryAreaKey(product) ? placements[productDraftKey] : undefined) ??
    defaultPlacement(product, 1, key)
  );
}

/** All area placements set for a product in the wizard draft. */
export function collectAreaPlacements(
  product: UiProduct,
  placements: Record<string, Placement>,
  idx: number,
  areaArts?: Record<string, { preview?: string }>,
): Array<{ key: string; artworkDataUrl?: string } & Placement> {
  const areas = listPrintAreas(product);
  if (!areas.length) return [];
  const primary = primaryAreaKey(product);
  const productKey = placementKey(product, idx);
  const legacy = placements[productKey];
  const out: Array<{ key: string; artworkDataUrl?: string } & Placement> = [];
  areas.forEach((area, i) => {
    if (!area) return;
    const key = printAreaStableKey(area, i, areas);
    const draftKey = areaPlacementKey(product, idx, key);
    const artPreview = areaArts?.[draftKey]?.preview || "";
    const hasArt = Boolean(artPreview);
    const pl =
      placements[draftKey] ??
      (key === primary ? legacy : undefined);
    if (!pl && !hasArt) return;
    out.push({
      key,
      ...(pl ?? defaultPlacement(product, 1, key)),
      ...(artPreview ? { artworkDataUrl: artPreview } : {}),
    });
  });
  if (!out.length && legacy) {
    out.push({ key: primary, ...legacy });
  }
  return out;
}

/**
 * Layers for live colour-tint / storefront composite from saved product refs.
 * Per-area `artworkUrl` is the source of truth (the placeholder chosen in the
 * artwork step). Collection art is a single-area fallback only when nothing
 * was assigned — it must not also land on the primary placeholder.
 */
export function resolveProductArtworkLayers(
  product: UiProduct,
  fallbackArtworkUrl?: string | null,
): Array<{ artUrl: string; placement: Placement; areaKey: string }> {
  if (!listPrintAreas(product).length) return [];
  const primary = primaryAreaKey(product);
  const fallback = fallbackArtworkUrl ? resolveMediaUrl(fallbackArtworkUrl) || fallbackArtworkUrl : "";
  const map = product.areaPlacements;
  const out: Array<{ artUrl: string; placement: Placement; areaKey: string }> = [];
  const entries = map ? Object.entries(map) : [];
  const hasOwnArt = entries.some(([, pl]) => Boolean(pl?.artworkUrl));

  for (const [areaKey, pl] of entries) {
    const own = pl.artworkUrl ? resolveMediaUrl(pl.artworkUrl) || pl.artworkUrl : "";
    const artUrl = own || (!hasOwnArt && areaKey === primary ? fallback : "");
    if (!artUrl) continue;
    const { artworkUrl: _a, ...placement } = pl;
    out.push({ areaKey, artUrl, placement });
  }

  if (!out.length && fallback && !hasOwnArt) {
    out.push({
      areaKey: primary,
      artUrl: fallback,
      placement: product.placement ?? defaultPlacement(product, 1, primary),
    });
  }
  return out;
}

/**
 * Collection-card / design preview props.
 * When the artwork step saved art on specific placeholders, preview only those.
 * A shared collection image must not be replayed from a bake that stamped it
 * onto every print area.
 */
export function savedDesignPreview(
  product: UiProduct,
  collectionArtworkUrl?: string | null,
): { artworkUrl?: string; preferBakedMockup: boolean } {
  const areaCount = listPrintAreas(product).length;
  const hasAreaArtwork = Object.values(product.areaPlacements || {}).some((pl) =>
    Boolean(pl?.artworkUrl),
  );
  if (!areaCount) return { artworkUrl: undefined, preferBakedMockup: true };
  if (hasAreaArtwork) return { artworkUrl: undefined, preferBakedMockup: false };
  const shared = collectionArtworkUrl?.trim() ? collectionArtworkUrl : undefined;
  // Multi-area products: composite the shared logo onto the primary area only.
  // The baked PNG may already have it on every placeholder.
  if (areaCount > 1) return { artworkUrl: shared, preferBakedMockup: false };
  return { artworkUrl: shared, preferBakedMockup: true };
}

/** Bake white default mockups for a picked product list (wizard generate flow). */
export async function bakeMockupsForProducts(
  pickedIndices: number[],
  catalog: UiProduct[],
  artUrl: string,
  placements: Record<string, Placement>,
  options?: { resolveAreaKey?: (product: UiProduct) => string },
): Promise<MockupUploadItem[]> {
  const baked = await Promise.all(
    pickedIndices.map(async (catalogIndex, idx) => {
      const product = catalog[catalogIndex];
      if (!product?.id) return null;
      const areaKey = options?.resolveAreaKey?.(product) ?? primaryAreaKey(product);
      // When a custom area resolver is used (create-a-kit polos → "left"), also
      // accept the product-level placement the kit branding step stores.
      const placement = options?.resolveAreaKey
        ? placements[areaPlacementKey(product, idx, areaKey)] ??
          placements[placementKey(product, idx)] ??
          defaultPlacement(product, 1, areaKey)
        : resolvePlacementForBake(product, placements, idx, areaKey);
      const areaPlacements = collectAreaPlacements(product, placements, idx);
      const [dataUrl, design] = await Promise.all([
        bakeMockup(product, artUrl, placement, 1000, false, areaKey),
        exportDesignOnly(product, artUrl, placement, areaKey),
      ]);
      if (!dataUrl) return null;
      const item: MockupUploadItem = {
        catalogProductId: product.id,
        dataUrl,
        placement,
        ...(areaPlacements.length ? { placements: areaPlacements } : {}),
        ...(design.dataUrl
          ? {
              designOnlyDataUrl: design.dataUrl,
              printSpec: {
                widthIn: design.widthIn,
                heightIn: design.heightIn,
                dpi: design.dpi,
                widthPx: design.widthPx,
                heightPx: design.heightPx,
              },
            }
          : {}),
      };
      return item;
    }),
  );
  return baked.filter((m): m is MockupUploadItem => m != null);
}

/** Flatten mask + one or more area artworks into one PNG data URL (preview quality). */
export async function bakeMockupLayers(
  ep: UiProduct,
  layers: Array<{ artUrl: string; placement: Placement | null; areaKey: string }>,
  size = 1000,
  requireProductBase = false,
  view?: ProductViewKey,
): Promise<string> {
  const usable = layers.filter((l) => l.artUrl);
  if (!usable.length) return "";
  try {
    const viewUsable = view
      ? usable.filter((l) => {
          const area = pickPrintArea(ep, l.areaKey);
          return printAreaViewKey(ep, area) === view;
        })
      : usable;
    const frontUsable = usable.filter((l) => {
      const area = pickPrintArea(ep, l.areaKey);
      return printAreaViewKey(ep, area) === "front";
    });
    const layersToBake = view
      ? viewUsable
      : frontUsable.length
        ? frontUsable
        : usable;
    if (!layersToBake.length) return "";
    const bakeView =
      view ||
      printAreaViewKey(ep, pickPrintArea(ep, layersToBake[0]?.areaKey));
    const maskUrl =
      designImgUrlForView(ep, bakeView) || designImgUrl(ep, layersToBake[0]?.areaKey);
    const maskImg = maskUrl ? await loadImageEl(maskUrl, true).catch(() => null) : null;
    // Never save artwork-only "mockups" when a product base was expected but failed
    // to load (common for Shopify CDN photos before the media proxy allowlist).
    if ((requireProductBase || maskUrl) && !maskImg) return "";
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    let mdx = 0;
    let mdy = 0;
    let mw = size;
    let mh = size;
    if (maskImg) {
      const s = Math.min(size / maskImg.naturalWidth, size / maskImg.naturalHeight);
      mw = maskImg.naturalWidth * s;
      mh = maskImg.naturalHeight * s;
      mdx = (size - mw) / 2;
      mdy = (size - mh) / 2;
      ctx.drawImage(maskImg, mdx, mdy, mw, mh);
    }

    for (const layer of layersToBake) {
      const artImg = await loadImageEl(layer.artUrl, true).catch(() => null);
      if (!artImg) continue;
      const aspect = (artImg.naturalHeight || 1) / (artImg.naturalWidth || 1);
      const key = layer.areaKey || primaryAreaKey(ep);
      const pl = layer.placement ?? defaultPlacement(ep, aspect, key);
      const { ph, stage, phys } = resolvePrintAreaStage(ep, {}, key);
      const realArt = buildRealisticArtwork(artImg, ep?.g);
      const rel = placementPrintFractions(pl, stage, CANVAS_WIDTH, CANVAS_HEIGHT);
      const printRect = designPlacementOnMockup({
        mockupWidthPx: mw,
        mockupHeightPx: mh,
        placeholder: ph,
        physicalDimensions: phys,
        viewKey: ph.key,
      });
      paintArtworkInPrintPlate(ctx, {
        art: realArt,
        originX: mdx,
        originY: mdy,
        printRect,
        rel,
        aspect,
      });
    }
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

/**
 * Build bake layers for print areas that actually have artwork.
 * The library image is used only when this product has no per-area assignment,
 * and then only on the primary placeholder — same rule as the artwork step.
 */
export function collectBakeLayers(
  product: UiProduct,
  placements: Record<string, Placement>,
  areaArts: Record<string, { preview: string }>,
  idx: number,
  fallbackArtUrl?: string | null,
): Array<{ artUrl: string; placement: Placement; areaKey: string }> {
  const areas = listPrintAreas(product);
  // No catalog placeholder → never invent one or apply logo.
  if (!areas.length) return [];
  const primary = primaryAreaKey(product);
  const assigned = new Set<string>();
  areas.forEach((area, i) => {
    if (!area) return;
    const areaKey = printAreaStableKey(area, i, areas);
    const draftKey = areaPlacementKey(product, idx, areaKey);
    if (areaArts[draftKey]?.preview) assigned.add(areaKey);
  });
  const out: Array<{ artUrl: string; placement: Placement; areaKey: string }> = [];
  areas.forEach((area, i) => {
    if (!area) return;
    const areaKey = printAreaStableKey(area, i, areas);
    const draftKey = areaPlacementKey(product, idx, areaKey);
    const specific = areaArts[draftKey]?.preview || "";
    const artUrl =
      specific || (!assigned.size && areaKey === primary ? fallbackArtUrl || "" : "");
    if (!artUrl) return;
    out.push({
      areaKey,
      artUrl,
      placement: resolvePlacementForBake(product, placements, idx, areaKey),
    });
  });
  return out;
}

/** Flatten mask + placed artwork into one PNG data URL (preview quality). */
export async function bakeMockup(
  ep: UiProduct,
  artUrl: string,
  placement: Placement | null,
  size = 1000,
  requireProductBase = false,
  areaKey?: string | null,
): Promise<string> {
  return bakeMockupLayers(
    ep,
    [{ artUrl, placement, areaKey: areaKey || primaryAreaKey(ep) }],
    size,
    requireProductBase,
  );
}

/**
 * Design-only production PNG: transparent canvas sized to inches × DPI.
 * Draws artwork clipped to the print placeholder — no garment/mockup.
 */
export async function exportDesignOnly(
  ep: UiProduct,
  artUrl: string,
  placement: Placement | null,
  areaKey?: string | null,
): Promise<{
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  widthIn: number;
  heightIn: number;
  dpi: number;
}> {
  const empty = { dataUrl: "", widthPx: 0, heightPx: 0, widthIn: 0, heightIn: 0, dpi: DEFAULT_DPI };
  if (!artUrl) return empty;
  try {
    const artImg = await loadImageEl(artUrl, true);
    const key = areaKey || primaryAreaKey(ep);
    const { ph, stage, dpi } = resolvePrintAreaStage(ep, {}, key);
    const { widthPx, heightPx } = printExportSize(ph.widthIn, ph.heightIn, dpi);
    const aspect = (artImg.naturalHeight || 1) / (artImg.naturalWidth || 1);
    const pl = placement ?? defaultPlacement(ep, aspect, key);
    const rel = placementPrintFractions(pl, stage, CANVAS_WIDTH, CANVAS_HEIGHT);

    const canvas = document.createElement("canvas");
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, widthPx, heightPx);

    const artW = rel.w * widthPx;
    const artH = artW * aspect;
    const artCx = rel.cx * widthPx;
    const artCy = rel.cy * heightPx;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, widthPx, heightPx);
    ctx.clip();
    ctx.translate(artCx, artCy);
    ctx.rotate(((rel.rot || 0) * Math.PI) / 180);
    ctx.drawImage(artImg, -artW / 2, -artH / 2, artW, artH);
    ctx.restore();

    return {
      dataUrl: canvas.toDataURL("image/png"),
      widthPx,
      heightPx,
      widthIn: ph.widthIn,
      heightIn: ph.heightIn,
      dpi,
    };
  } catch {
    return empty;
  }
}

/**
 * Live realistic mockup recoloured to a garment colour. Recolours the
 * transparent production mask to `tintHex` and bakes one or more print-area
 * artworks on top — same path as bakeMockupLayers, but tinted per swatch.
 */
const tintedBakeCache = new Map<string, Promise<string>>();
const TINTED_BAKE_CACHE_MAX = 16;

function tintedBakeCacheKey(
  ep: UiProduct,
  layers: Array<{ artUrl: string; placement: Placement | null; areaKey: string }>,
  tintHex: string,
  size: number,
  maskUrlOverride?: string,
) {
  const layerKey = layers
    .map((l) => {
      const p = l.placement;
      const pl = p
        ? `${p.xPct},${p.yPct},${p.wPct},${p.rot},${p.printCxPct ?? ""},${p.printCyPct ?? ""},${p.printWPct ?? ""}`
        : "";
      return `${l.areaKey}:${l.artUrl}:${pl}`;
    })
    .join("|");
  return `${ep.id || ep.nm}|${size}|${tintHex}|${maskUrlOverride || ""}|${layerKey}`;
}

export async function bakeTintedMockupLayers(
  ep: UiProduct,
  layers: Array<{ artUrl: string; placement: Placement | null; areaKey: string }>,
  tintHex: string,
  size = 1000,
  /** Explicit view mask (back/side). When omitted, derived from the first layer area or front. */
  maskUrlOverride?: string,
): Promise<string> {
  const key = tintedBakeCacheKey(ep, layers, tintHex, size, maskUrlOverride);
  const cached = tintedBakeCache.get(key);
  if (cached) return cached;
  const pending = bakeTintedMockupLayersUncached(ep, layers, tintHex, size, maskUrlOverride).then((url) => {
    if (!url) tintedBakeCache.delete(key);
    return url;
  });
  tintedBakeCache.set(key, pending);
  if (tintedBakeCache.size > TINTED_BAKE_CACHE_MAX) {
    const oldest = tintedBakeCache.keys().next().value;
    if (oldest && oldest !== key) tintedBakeCache.delete(oldest);
  }
  return pending;
}

async function bakeTintedMockupLayersUncached(
  ep: UiProduct,
  layers: Array<{ artUrl: string; placement: Placement | null; areaKey: string }>,
  tintHex: string,
  size = 1000,
  maskUrlOverride?: string,
): Promise<string> {
  const fromLayer = layers[0]?.areaKey ? designImgUrl(ep, layers[0].areaKey) : "";
  const maskUrl = resolveMediaUrl(maskUrlOverride) || fromLayer || designImgUrl(ep);
  if (!maskUrl || !tintHex) return "";
  const usable = layers.filter((l) => l.artUrl);
  try {
    const maskImg = await loadImageEl(maskUrl, true);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    const s = Math.min(size / maskImg.naturalWidth, size / maskImg.naturalHeight);
    const w = maskImg.naturalWidth * s;
    const h = maskImg.naturalHeight * s;
    const dx = (size - w) / 2;
    const dy = (size - h) / 2;
    ctx.drawImage(maskImg, dx, dy, w, h);

    let opaqueCorners = 0;
    try {
      const alphaAt = (x: number, y: number) =>
        ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data[3];
      const corners: Array<[number, number]> = [
        [dx + 2, dy + 2],
        [dx + w - 3, dy + 2],
        [dx + 2, dy + h - 3],
        [dx + w - 3, dy + h - 3],
      ];
      for (const [x, y] of corners) if (alphaAt(x, y) > 200) opaqueCorners += 1;
    } catch {
      return "";
    }
    if (opaqueCorners >= 3) return "";

    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = tintHex;
    ctx.fillRect(dx, dy, w, h);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(maskImg, dx, dy, w, h);
    ctx.restore();

    for (const layer of usable) {
      const artImg = await loadImageEl(layer.artUrl, true).catch(() => null);
      if (!artImg) continue;
      const aspect = (artImg.naturalHeight || 1) / (artImg.naturalWidth || 1);
      const key = layer.areaKey || primaryAreaKey(ep);
      const pl = layer.placement ?? defaultPlacement(ep, aspect, key);
      const realArt = buildRealisticArtwork(artImg, ep?.g);
      const { ph, stage, phys } = resolvePrintAreaStage(ep, {}, key);
      const rel = placementPrintFractions(pl, stage, CANVAS_WIDTH, CANVAS_HEIGHT);
      const printRect = designPlacementOnMockup({
        mockupWidthPx: w,
        mockupHeightPx: h,
        placeholder: ph,
        physicalDimensions: phys,
        viewKey: ph.key,
      });
      paintArtworkInPrintPlate(ctx, {
        art: realArt,
        originX: dx,
        originY: dy,
        printRect,
        rel,
        aspect,
      });
    }
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

/**
 * Live realistic mockup recoloured to a garment colour. Recolours the
 * transparent production mask to `tintHex` (multiply keeps the fabric's
 * folds/shadows, then clip back to the mask alpha so the background stays
 * clear) and bakes the warped/blended artwork on top — the same realistic
 * path as bakeMockup, but tinted per colour swatch. Returns "" when there is
 * no usable garment mask to recolour.
 */
export async function bakeTintedMockup(
  ep: UiProduct,
  artUrl: string,
  placement: Placement | null,
  tintHex: string,
  size = 1000,
  areaKey?: string | null,
): Promise<string> {
  return bakeTintedMockupLayers(
    ep,
    [{ artUrl, placement, areaKey: areaKey || primaryAreaKey(ep) }],
    tintHex,
    size,
  );
}

/** Resolved photo/mockup thumbnail for a product or baked design. */
export function productThumbUrl(p: UiProduct, branded = false): string {
  if (branded && p.mockupUrl) return resolveMediaUrl(p.mockupUrl) || "";
  return resolveMediaUrl(p.imgUrl) || resolveMediaUrl(p.mockupUrl) || "";
}
