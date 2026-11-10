import { describe, expect, it } from "vitest";
import { newestProducts } from "./newestProducts";
import type { UiProduct } from "./model";

describe("newestProducts", () => {
  it("orders real creation dates and keeps undated products stable without mutating the input", () => {
    const product = (id: string, createdAt?: string): UiProduct => ({ id, createdAt, nm: id, g: "", brand: "", price: "0", sw: 0 });
    const products = [product("missing"), product("old", "2025-01-01"), product("invalid", "bad-date"), product("new", "2026-01-01")];
    expect(newestProducts(products).map((item) => item.id)).toEqual(["new", "old", "missing", "invalid"]);
    expect(products.map((item) => item.id)).toEqual(["missing", "old", "invalid", "new"]);
  });
});
