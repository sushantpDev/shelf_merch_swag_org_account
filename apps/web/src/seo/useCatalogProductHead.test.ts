import { describe, expect, it } from "vitest";
import { catalogProductMeta } from "../../../api/src/modules/seo/catalogProductDocument.js";

const base = {
  id: "507f1f77bcf86cd799439011",
  name: "Summit Tee",
  description: "A public cotton tee",
  brand: "ShelfMerch",
  category: "Apparel",
  image: "/images/landing/hero.png",
};

describe("catalog product head", () => {
  it("omits Product markup when there is no public offer or review", () => {
    const meta = catalogProductMeta(base, "https://shelfmerch.io");
    expect(meta.title).toBe("Summit Tee | ShelfMerch");
    expect(meta.description).toBe("A public cotton tee");
    expect(meta.canonical).toBe("https://shelfmerch.io/apps/catalog/507f1f77bcf86cd799439011");
    expect(meta.image).toBe("https://shelfmerch.io/images/landing/hero.png");
    expect(meta.jsonLd).toBeNull();
    expect(JSON.stringify(meta)).not.toContain("offers");
    expect(JSON.stringify(meta)).not.toContain("aggregateRating");
  });

  it("includes Product markup only from a supplied public offer", () => {
    const meta = catalogProductMeta(
      { ...base, offer: { price: 599, priceCurrency: "INR", availability: "https://schema.org/InStock" } },
      "https://shelfmerch.io",
    );
    expect(meta.jsonLd?.["@type"]).toBe("Product");
    expect(meta.jsonLd?.offers).toEqual({
      "@type": "Offer",
      priceCurrency: "INR",
      price: 599,
      availability: "https://schema.org/InStock",
    });
    expect(meta.jsonLd?.aggregateRating).toBeUndefined();
    expect(meta.jsonLd?.review).toBeUndefined();
  });

  it("ignores an offer that does not include a real price and currency", () => {
    const meta = catalogProductMeta(
      { ...base, offer: { priceCurrency: "INR" } },
      "https://shelfmerch.io",
    );
    expect(meta.jsonLd).toBeNull();
    expect(meta.canonical).toContain("/apps/catalog/507f1f77bcf86cd799439011");
  });
});
