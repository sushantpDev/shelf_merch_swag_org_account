import type { UiProduct } from "@/services/mappers";
import {
  areaPlacementKey,
  listPrintAreas,
  listPrintAreasForView,
  primaryAreaKey,
  printAreaKey,
  printAreaUsesDedicatedSideView,
  printAreaViewKey,
  type Placement,
  type ProductViewKey,
} from "../mockup-bake";
import type { ArtFile } from "../swagDraft";

/** True when this product has artwork on any of its print areas. */
export function productHasArtwork(
  product: UiProduct,
  idx: number,
  areaArts: Record<string, ArtFile>,
): boolean {
  return areaKeysForProduct(product, idx).some((key) => Boolean(areaArts[key]));
}

/** Draft keys for every print area on a product (`productId::areaKey`). */
export function areaKeysForProduct(product: UiProduct, idx: number): string[] {
  const areas = listPrintAreas(product);
  if (!areas.length) return [];
  return areas.map((a, i) => areaPlacementKey(product, idx, printAreaKey(product, a, i)));
}

/**
 * Default seed placeholder: area labeled/keyed "Left" when present. On apparel
 * mockups this is the wearer's left chest, which appears on the visible right
 * side of the product card. Otherwise use the first front print area.
 */
export function preferredDefaultAreaKey(product: UiProduct): string {
  const all = listPrintAreas(product);
  const left = all.find((a) => {
    const token = `${a?.key || ""} ${a?.label || ""}`.toLowerCase();
    return /\bleft\b/.test(token);
  });
  if (left) {
    return printAreaKey(product, left, Math.max(0, all.indexOf(left)));
  }
  const frontAreas = listPrintAreasForView(product, "front");
  if (frontAreas.length) {
    const first = frontAreas[0];
    return printAreaKey(product, first, Math.max(0, all.indexOf(first)));
  }
  if (all.length) {
    return printAreaKey(product, all[0], 0);
  }
  return primaryAreaKey(product);
}

export function defaultViewForProduct(product: UiProduct): ProductViewKey {
  const fronts = listPrintAreasForView(product, "front");
  if (fronts.length) return "front";
  return "front";
}

/**
 * Print areas to show while editing a garment view.
 * Chest "Left"/"Right" labels are often classified as side views by key/label
 * heuristics — keep them on the front mockup unless they have a dedicated side mask.
 */
export function areasForMockupView(product: UiProduct, view: ProductViewKey) {
  const all = listPrintAreas(product);
  if (view === "back") {
    return all.filter((a) => printAreaViewKey(product, a) === "back");
  }
  if (view === "left" || view === "right") {
    return listPrintAreasForView(product, view).filter((a) =>
      printAreaUsesDedicatedSideView(product, a),
    );
  }
  // Front: everything that is not explicitly a back-only area.
  return all.filter((a) => {
    const areaView = printAreaViewKey(product, a);
    if (areaView === "back") return false;
    if ((areaView === "left" || areaView === "right") && printAreaUsesDedicatedSideView(product, a)) {
      return false;
    }
    return true;
  });
}

/** Area keys visible on the front product-card mockup (excludes back-only areas). */
export function frontAreaKeysForProduct(product: UiProduct): string[] {
  const all = listPrintAreas(product);
  return areasForMockupView(product, "front").map((a) =>
    printAreaKey(product, a, Math.max(0, all.indexOf(a))),
  );
}

/** Which garment view to show when selecting a print area. */
export function editorViewForArea(
  product: UiProduct,
  area: { key?: string; label?: string; mockupImageUrl?: string } | null | undefined,
): ProductViewKey {
  const v = printAreaViewKey(product, area);
  if (v === "back") return "back";
  // Side-view only when the area is tied to a side mockup asset.
  if ((v === "left" || v === "right") && area?.mockupImageUrl) return v;
  return "front";
}

/** Slice of areaArts that belongs only to this product index. */
export function sliceProductAreaArts(
  areaArts: Record<string, ArtFile>,
  product: UiProduct,
  idx: number,
): Record<string, ArtFile> {
  const keys = new Set(areaKeysForProduct(product, idx));
  const out: Record<string, ArtFile> = {};
  for (const [key, art] of Object.entries(areaArts)) {
    if (keys.has(key)) out[key] = art;
  }
  return out;
}

/** Slice of placements that belongs only to this product index. */
export function sliceProductPlacements(
  placements: Record<string, Placement>,
  product: UiProduct,
  idx: number,
): Record<string, Placement> {
  const keys = new Set(areaKeysForProduct(product, idx));
  const out: Record<string, Placement> = {};
  for (const [key, pl] of Object.entries(placements)) {
    if (keys.has(key)) out[key] = pl;
  }
  return out;
}

/**
 * Merge one product's draft area arts into the global map without touching
 * other products' keys. Removed draft keys are deleted.
 */
export function mergeProductAreaArts(
  globalArts: Record<string, ArtFile>,
  product: UiProduct,
  idx: number,
  draftArts: Record<string, ArtFile>,
): Record<string, ArtFile> {
  const productKeys = areaKeysForProduct(product, idx);
  const next = { ...globalArts };
  for (const key of productKeys) {
    if (draftArts[key]) next[key] = draftArts[key];
    else delete next[key];
  }
  return next;
}

/**
 * Diff helpers for committing a product modal save via discrete set/clear calls.
 */
export function productArtworkCommitPlan(
  product: UiProduct,
  idx: number,
  previousArts: Record<string, ArtFile>,
  draftArts: Record<string, ArtFile>,
  draftPlacements: Record<string, Placement>,
): {
  setArts: Array<{ key: string; art: ArtFile }>;
  clearKeys: string[];
  setPlacements: Array<{ key: string; placement: Placement }>;
} {
  const productKeys = areaKeysForProduct(product, idx);
  const setArts: Array<{ key: string; art: ArtFile }> = [];
  const clearKeys: string[] = [];
  const setPlacements: Array<{ key: string; placement: Placement }> = [];

  for (const key of productKeys) {
    const nextArt = draftArts[key];
    const prevArt = previousArts[key];
    if (nextArt) {
      setArts.push({ key, art: nextArt });
      if (draftPlacements[key]) {
        setPlacements.push({ key, placement: draftPlacements[key] });
      }
    } else if (prevArt) {
      clearKeys.push(key);
    }
  }

  return { setArts, clearKeys, setPlacements };
}

/**
 * One default draft key per product for bulk "Add artwork":
 * preferred Right (else first front) on each product only.
 * Products with no catalog placeholder are skipped (logo must not be applied).
 */
export function defaultSeedKeysForProducts(products: UiProduct[]): string[] {
  return products.flatMap((p, idx) => {
    if (!listPrintAreas(p).length) return [];
    return [areaPlacementKey(p, idx, preferredDefaultAreaKey(p))];
  });
}

/** Label for a print area key on a product. */
export function areaLabelForKey(product: UiProduct, areaKey: string): string {
  const all = listPrintAreas(product);
  const found = all.find((a, i) => printAreaKey(product, a, i) === areaKey);
  return found?.label || areaKey || "print area";
}
