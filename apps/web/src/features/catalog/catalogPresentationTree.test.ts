import { describe, expect, it } from "vitest";
import type { PublicCatalogCategory } from "@/services/api-bridge";
import { buildCatalogPresentationTree } from "./catalogPresentationTree";
import { resolveCatalogBrowseTarget } from "./types";

import { flatCategories, flatProducts } from "./catalogPresentationTree.fixtures";

describe("flat public category presentation", () => {
  it("preserves real root names/IDs/order and derives only groups found on products", () => {
    const before = JSON.stringify(flatCategories);
    const tree = buildCatalogPresentationTree(flatCategories, flatProducts);
    expect(tree.map(({ _id, name, sortOrder }) => ({ _id, name, sortOrder }))).toEqual(flatCategories.map(({ _id, name, sortOrder }) => ({ _id, name, sortOrder })));
    expect(tree[3].children.map((row) => row.name)).toEqual(["Diaries"]);
    expect(tree[4].children[0].children[0].name).toBe("Wireless Chargers");
    expect(tree.flatMap((row) => row.children).some((row) => row.name === "Kitchenware")).toBe(false);
    expect(JSON.stringify(flatCategories)).toBe(before);
  });

  it("resolves actual roots before aliases, keeping old links and subtype links scoped", () => {
    const tree = buildCatalogPresentationTree(flatCategories, flatProducts);
    for (const [slug, parent] of [["bags", "Bags"], ["drinkware", "Drinkware"], ["office", "Office"], ["technology", "Technology"], ["stationery", "Office"], ["electronics-and-gadgets", "Technology"]]) {
      expect(resolveCatalogBrowseTarget(slug, tree)).toEqual({ parent, category: null, subcategory: null, query: "All Products" });
    }
    expect(resolveCatalogBrowseTarget("diaries", tree)).toEqual({ parent: "Office", category: "Diaries", subcategory: null, query: "All Products" });
    expect(resolveCatalogBrowseTarget("wireless-chargers", tree)).toEqual({ parent: "Technology", category: "Gadgets", subcategory: "Wireless Chargers", query: "All Products" });
  });

  it("leaves authored nested taxonomy intact and gives empty flat collections no invented types", () => {
    const authored = { ...flatCategories[0], children: [{ ...flatCategories[1], name: "Authored type" }] };
    expect(buildCatalogPresentationTree([authored], flatProducts)[0]).toBe(authored);
    expect(buildCatalogPresentationTree(flatCategories, [])[3].children).toEqual([]);
  });
});
