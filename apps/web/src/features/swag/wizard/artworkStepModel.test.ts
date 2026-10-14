import { describe, expect, it } from "vitest";
import type { UiProduct } from "@/services/mappers";
import { INITIAL_SWAG_DRAFT, swagDraftReducer, type ArtFile } from "../swagDraft";
import {
  areaKeysForProduct,
  areasForMockupView,
  defaultSeedKeysForProducts,
  editorViewForArea,
  frontAreaKeysForProduct,
  mergeProductAreaArts,
  preferredDefaultAreaKey,
  productArtworkCommitPlan,
  productHasArtwork,
  sliceProductAreaArts,
} from "./artworkStepModel";

function area(
  key: string,
  label: string,
): NonNullable<UiProduct["printAreas"]>[number] {
  return {
    key,
    label,
    widthIn: 2,
    heightIn: 2,
    box: { xPct: 40, yPct: 30, widthPct: 20, heightPct: 20 },
  };
}

function product(partial: Partial<UiProduct> & { id: string; nm: string }): UiProduct {
  return {
    id: partial.id,
    nm: partial.nm,
    g: partial.g || "tee",
    brand: partial.brand || "Test",
    sw: 1,
    price: "0",
    printAreas: partial.printAreas,
    ...partial,
  } as UiProduct;
}

const ART_A: ArtFile = { name: "a.png", preview: "data:a" };
const ART_B: ArtFile = { name: "b.png", preview: "data:b" };
const ART_C: ArtFile = { name: "c.png", preview: "data:c" };

describe("preferredDefaultAreaKey", () => {
  it("prefers Front Left when multiple chest placeholders exist", () => {
    const p = product({
      id: "polo",
      nm: "Polo",
      printAreas: [area("left", "Left"), area("right", "Right"), area("back", "Back")],
    });
    expect(preferredDefaultAreaKey(p)).toBe("left");
  });

  it("falls back to the first front area when Right is missing", () => {
    const p = product({
      id: "tee",
      nm: "Tee",
      printAreas: [area("chest", "Chest"), area("back", "Back")],
    });
    expect(preferredDefaultAreaKey(p)).toBe("chest");
  });

  it("falls back to catalog primary when no labeled areas exist", () => {
    const p = product({
      id: "bag",
      nm: "Bag",
      printAreas: [area("panel", "Panel")],
    });
    expect(preferredDefaultAreaKey(p)).toBe("panel");
  });
});

describe("product artwork isolation", () => {
  const polo = product({
    id: "polo",
    nm: "Polo",
    printAreas: [area("right", "Right"), area("left", "Left")],
  });
  const tee = product({
    id: "tee",
    nm: "Tee",
    printAreas: [area("front", "Front")],
  });

  it("productHasArtwork is false until a placeholder has art", () => {
    expect(productHasArtwork(polo, 0, {})).toBe(false);
    expect(
      productHasArtwork(polo, 0, { "polo::right": ART_A }),
    ).toBe(true);
  });

  it("sliceProductAreaArts only returns keys for that product", () => {
    const global = {
      "polo::right": ART_A,
      "polo::left": ART_B,
      "tee::front": ART_C,
    };
    expect(sliceProductAreaArts(global, polo, 0)).toEqual({
      "polo::right": ART_A,
      "polo::left": ART_B,
    });
    expect(sliceProductAreaArts(global, tee, 1)).toEqual({
      "tee::front": ART_C,
    });
  });

  it("mergeProductAreaArts does not rewrite other products", () => {
    const global = {
      "polo::right": ART_A,
      "polo::left": ART_B,
      "tee::front": ART_C,
    };
    const merged = mergeProductAreaArts(global, polo, 0, {
      "polo::right": ART_B,
      // left removed
    });
    expect(merged).toEqual({
      "polo::right": ART_B,
      "tee::front": ART_C,
    });
    expect(merged["tee::front"]).toBe(ART_C);
  });

  it("commit plan sets/clears only the edited product placeholders", () => {
    const previous = {
      "polo::right": ART_A,
      "polo::left": ART_B,
    };
    const draft = {
      "polo::right": ART_C,
      // left removed; can add a different logo only on right
    };
    const plan = productArtworkCommitPlan(polo, 0, previous, draft, {
      "polo::right": { xPct: 50, yPct: 40, wPct: 20, rot: 0 },
    });
    expect(plan.setArts).toEqual([{ key: "polo::right", art: ART_C }]);
    expect(plan.clearKeys).toEqual(["polo::left"]);
    expect(plan.setPlacements).toHaveLength(1);
  });

  it("area keys cover every placeholder once", () => {
    expect(areaKeysForProduct(polo, 0)).toEqual(["polo::right", "polo::left"]);
  });
});

describe("swagDraft clearAreaArt keeps staged library art", () => {
  it("removing the last placeholder art does not clear library art", () => {
    let state = {
      ...INITIAL_SWAG_DRAFT,
      art: ART_A,
      areaArts: { "polo::right": ART_A },
    };
    state = swagDraftReducer(state, { type: "clearAreaArt", key: "polo::right" });
    expect(state.areaArts).toEqual({});
    expect(state.art).toEqual(ART_A);
  });

  it("setArt alone does not stamp product placeholders", () => {
    const state = swagDraftReducer(INITIAL_SWAG_DRAFT, { type: "setArt", art: ART_A });
    expect(state.art).toEqual(ART_A);
    expect(state.areaArts).toEqual({});
  });

  it("clearArt wipes library and all product logos", () => {
    let state = {
      ...INITIAL_SWAG_DRAFT,
      art: ART_A,
      areaArts: { "polo::right": ART_A, "tee::front": ART_B },
      placements: { "polo::right": { xPct: 1, yPct: 1, wPct: 1, rot: 0 } },
    };
    state = swagDraftReducer(state, { type: "clearArt" });
    expect(state.art).toBeNull();
    expect(state.areaArts).toEqual({});
    expect(state.placements).toEqual({});
  });

  it("setAreaArt on product A does not remove product B art", () => {
    let state = {
      ...INITIAL_SWAG_DRAFT,
      art: ART_A,
      areaArts: { "tee::front": ART_C },
    };
    state = swagDraftReducer(state, { type: "setAreaArt", key: "polo::right", art: ART_B });
    expect(state.areaArts["tee::front"]).toEqual(ART_C);
    expect(state.areaArts["polo::right"]).toEqual(ART_B);
  });
});

describe("edge cases", () => {
  it("product with a single placeholder only ever has one area key", () => {
    const mug = product({
      id: "mug",
      nm: "Mug",
      printAreas: [area("wrap", "Wrap")],
    });
    expect(areaKeysForProduct(mug, 0)).toHaveLength(1);
    expect(preferredDefaultAreaKey(mug)).toBe("wrap");
  });

  it("empty draft commit clears all previous arts on that product", () => {
    const polo = product({
      id: "polo",
      nm: "Polo",
      printAreas: [area("right", "Right"), area("left", "Left")],
    });
    const plan = productArtworkCommitPlan(
      polo,
      0,
      { "polo::right": ART_A, "polo::left": ART_B },
      {},
      {},
    );
    expect(plan.setArts).toEqual([]);
    expect(plan.clearKeys.sort()).toEqual(["polo::left", "polo::right"]);
  });

  it("different logos can be planned for different placeholders on one product", () => {
    const polo = product({
      id: "polo",
      nm: "Polo",
      printAreas: [area("right", "Right"), area("left", "Left")],
    });
    const plan = productArtworkCommitPlan(
      polo,
      0,
      {},
      { "polo::right": ART_A, "polo::left": ART_B },
      {},
    );
    expect(plan.setArts).toEqual([
      { key: "polo::right", art: ART_A },
      { key: "polo::left", art: ART_B },
    ]);
    expect(plan.clearKeys).toEqual([]);
  });

  it("frontAreaKeysForProduct excludes back-only areas", () => {
    const bag = product({
      id: "bag",
      nm: "Bag",
      printAreas: [area("front", "Front"), area("back", "Back")],
    });
    expect(frontAreaKeysForProduct(bag)).toEqual(["front"]);
  });

  it("keeps plain left/right chest placeholders on the front view", () => {
    const polo = product({
      id: "polo",
      nm: "Polo",
      printAreas: [area("left", "Left"), area("right", "Right")],
    });
    expect(frontAreaKeysForProduct(polo)).toEqual(["left", "right"]);
    expect(areasForMockupView(polo, "right")).toEqual([]);
  });

  it("excludes dedicated side placeholders from the front product card", () => {
    const side = { ...area("right", "Right sleeve"), mockupImageUrl: "/right-mask.png" };
    const polo = product({
      id: "polo",
      nm: "Polo",
      maskRightImageUrl: "/right-mask.png",
      printAreas: [area("front", "Front chest"), side],
    });
    expect(frontAreaKeysForProduct(polo)).toEqual(["front"]);
    expect(areasForMockupView(polo, "right")).toEqual([side]);
  });

  it("defaultSeedKeysForProducts seeds one Left/front key per product", () => {
    const polo = product({
      id: "polo",
      nm: "Polo",
      printAreas: [area("left", "Left"), area("right", "Right")],
    });
    const tee = product({
      id: "tee",
      nm: "Tee",
      printAreas: [area("chest", "Chest")],
    });
    expect(defaultSeedKeysForProducts([polo, tee])).toEqual(["polo::left", "tee::chest"]);
  });
});
