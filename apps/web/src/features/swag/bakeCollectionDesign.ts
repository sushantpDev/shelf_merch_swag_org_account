import {
  bakeMockupLayers,
  collectAreaPlacements,
  collectBakeLayers,
  exportDesignOnly,
  listPrintAreas,
  primaryAreaKey,
  type MockupUploadItem,
} from "./mockup-bake";
import type { SwagDraft } from "./swagDraft";
import type { UiProduct } from "./model";

export type BakeCollectionDesignInput = {
  draft: Pick<SwagDraft, "picked" | "placements" | "areaArts" | "art">;
  catalog: UiProduct[];
};

/**
 * Client-side mockup bake shared by Save Design and Publish.
 * Does not call the API — callers persist via create/update collection flows.
 */
export async function bakeCollectionDesignMockups({
  draft,
  catalog,
}: BakeCollectionDesignInput): Promise<MockupUploadItem[]> {
  const fallbackArt = draft.art?.preview || "";
  const baked = await Promise.all(
    draft.picked.map(async (i, idx) => {
      const cp = catalog[i];
      const layers = collectBakeLayers(cp, draft.placements, draft.areaArts || {}, idx, fallbackArt);
      if (!layers.length) return null;
      const areaKey = primaryAreaKey(cp);
      const primaryLayer = layers.find((l) => l.areaKey === areaKey) || layers[0];
      const areaPlacements = collectAreaPlacements(
        cp,
        draft.placements,
        idx,
        draft.areaArts || {},
      );
      const [frontDataUrl, backDataUrl, design] = await Promise.all([
        bakeMockupLayers(cp, layers, 1000, false, "front"),
        bakeMockupLayers(cp, layers, 1000, false, "back"),
        exportDesignOnly(cp, primaryLayer.artUrl, primaryLayer.placement, primaryLayer.areaKey),
      ]);
      const dataUrl = frontDataUrl || backDataUrl;
      if (!dataUrl) return null;
      return {
        dataUrl,
        backDataUrl: frontDataUrl && backDataUrl ? backDataUrl : undefined,
        design,
        placement: primaryLayer.placement,
        placements: areaPlacements,
      };
    }),
  );

  const mockups: MockupUploadItem[] = draft.picked
    .map((i, idx): MockupUploadItem | null => {
      const cp = catalog[i];
      const row = baked[idx];
      if (!cp?.id || !row?.dataUrl) return null;
      return {
        catalogProductId: cp.id,
        dataUrl: row.dataUrl,
        ...(row.backDataUrl ? { backDataUrl: row.backDataUrl } : {}),
        placement: row.placement,
        placements: row.placements?.length ? row.placements : undefined,
        ...(row.design.dataUrl
          ? {
              designOnlyDataUrl: row.design.dataUrl,
              printSpec: {
                widthIn: row.design.widthIn,
                heightIn: row.design.heightIn,
                dpi: row.design.dpi,
                widthPx: row.design.widthPx,
                heightPx: row.design.heightPx,
              },
            }
          : {}),
      };
    })
    .filter((m): m is MockupUploadItem => m !== null);

  const brandableCount = draft.picked.reduce((n, i) => {
    return n + (listPrintAreas(catalog[i]).length > 0 ? 1 : 0);
  }, 0);
  if (brandableCount > 0 && mockups.length < brandableCount) {
    throw new Error(
      mockups.length
        ? "Failed to generate designs for all products. Try again"
        : "Failed to generate designs. Try again",
    );
  }
  return mockups;
}
