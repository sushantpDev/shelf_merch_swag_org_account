import { describe, it, expect } from "vitest";
import { mediaUrlForCanvas, resolveMediaUrl } from "@/lib/mediaUrl";
import {
  designPlacementOnMockup,
  imageContainRect,
  inchesToPx,
  parentToPrintLocal,
  physicalFrameForView,
  physicalFrameStageRect,
  placeholderToStagePixels,
  printLocalToParent,
  pxToInches,
  resolvePhysical,
  DEFAULT_PHYSICAL,
} from "@/lib/printCoords";
import {
  slugifyShopName,
  shopPublicLinkLabel,
  shopRedeemHref,
  shopRedeemPath,
  shopSlugFromHostname,
  shopStorefrontHref,
  shopStorefrontPath,
  usesPathStorefront,
} from "@/lib/shopRedeemUrl";
import { storeProductAsUi } from "@/features/swag/DesignedProductThumb";
import { mockupStageFit } from "@/features/swag/MockupCanvas";
import {
  areaPlacementKey,
  collectBakeLayers,
  pickPrintArea,
  printAreaStableKey,
  resolvePrintAreaStage,
  resolveProductArtworkLayers,
  savedDesignPreview,
} from "@/features/swag/mockup-bake";
import type { UiProduct } from "@/services/mappers";

describe("mediaUrl", () => {
  it("normalizes relative upload paths and leaves absolute URLs", () => {
    expect(resolveMediaUrl("/uploads/a.png")).toBe("/uploads/a.png");
    expect(resolveMediaUrl("uploads/a.png")).toBe("/uploads/a.png");
    expect(resolveMediaUrl("https://cdn.example/x.png")).toBe("https://cdn.example/x.png");
    expect(resolveMediaUrl("")).toBe("");
  });

  it("proxies cross-origin URLs for canvas pixel reads", () => {
    const proxied = mediaUrlForCanvas("https://cdn.example/mask.png");
    expect(proxied).toContain("/api/v1/media/proxy?url=");
    expect(proxied).toContain(encodeURIComponent("https://cdn.example/mask.png"));
    expect(mediaUrlForCanvas("/uploads/mask.png")).toBe("/uploads/mask.png");
  });
});

describe("printCoords", () => {
  it("resolves physical defaults and contain-fit geometry", () => {
    expect(resolvePhysical(null)).toEqual(DEFAULT_PHYSICAL);
    expect(resolvePhysical({ width: 12, height: 16 }).width).toBe(12);

    const rect = imageContainRect(1000, 500);
    expect(rect.w / rect.h).toBeCloseTo(2, 5);
    expect(rect.x).toBeGreaterThan(0);
    expect(rect.y).toBeGreaterThan(0);
  });

  it("round-trips inches through stage pixels", () => {
    const frame = physicalFrameStageRect({ width: 20, height: 24 });
    const px = inchesToPx(6, frame.pxPerInch);
    expect(pxToInches(px, frame.pxPerInch)).toBeCloseTo(6, 5);
  });

  it("maps print-area local coords around Konva's top-left rotation origin", () => {
    const origin = { x: 100, y: 200 };
    const identity = printLocalToParent(40, 10, origin.x, origin.y, 0);
    expect(identity.x).toBeCloseTo(140, 5);
    expect(identity.y).toBeCloseTo(210, 5);

    const rotated = printLocalToParent(40, 0, origin.x, origin.y, -90);
    expect(rotated.x).toBeCloseTo(100, 5);
    expect(rotated.y).toBeCloseTo(160, 5);

    const roundTrip = parentToPrintLocal(rotated.x, rotated.y, origin.x, origin.y, -90);
    expect(roundTrip.x).toBeCloseTo(40, 5);
    expect(roundTrip.y).toBeCloseTo(0, 5);
  });

  it("preserves placeholder rotation when placing a design on a mockup", () => {
    const placed = designPlacementOnMockup({
      mockupWidthPx: 1000,
      mockupHeightPx: 1200,
      placeholder: { xIn: 9.363, yIn: 14.892, widthIn: 4.753, heightIn: 5.262, rotationDeg: -18 },
      physicalDimensions: { width: 20, height: 24 },
    });
    expect(placed.rotationDeg).toBe(-18);
    expect(placed.w).toBeGreaterThan(0);
    expect(placed.h).toBeGreaterThan(0);
  });

  it("keeps front Left and Right chest areas at their catalog editor positions", () => {
    const product = {
      id: "polo",
      nm: "Polo",
      g: "polo",
      maskImageUrl: "/polo-front.png",
      physicalDimensions: { width: 20, height: 24, length: 18 },
      printAreas: [
        {
          key: "left",
          label: "Left",
          mockupImageUrl: "/polo-front.png",
          xIn: 9,
          yIn: 5,
          widthIn: 2,
          heightIn: 2.3,
        },
        {
          key: "right",
          label: "Right",
          mockupImageUrl: "/polo-front.png",
          xIn: 6,
          yIn: 5,
          widthIn: 2,
          heightIn: 2.3,
        },
      ],
    } as UiProduct;
    const opts = { imageNaturalWidth: 1000, imageNaturalHeight: 1000 };

    for (const area of product.printAreas!) {
      const catalogFrame = physicalFrameForView(product.physicalDimensions, area.key);
      const catalogStage = placeholderToStagePixels(area, catalogFrame, opts);
      const swagStage = resolvePrintAreaStage(product, opts, area.key);
      expect(swagStage.stage.x).toBeCloseTo(catalogStage.x);
      expect(swagStage.stage.y).toBeCloseTo(catalogStage.y);
      expect(swagStage.stage.w).toBeCloseTo(catalogStage.w);
      expect(swagStage.stage.h).toBeCloseTo(catalogStage.h);

      const baked = designPlacementOnMockup({
        mockupWidthPx: 1000,
        mockupHeightPx: 1000,
        placeholder: swagStage.ph,
        physicalDimensions: product.physicalDimensions,
        viewKey: area.key,
      });
      expect(baked.x).toBeCloseTo((area.xIn / catalogFrame.width) * 1000);
      expect(baked.y).toBeCloseTo((area.yIn / catalogFrame.height) * 1000);
      expect(baked.w).toBeCloseTo((area.widthIn / catalogFrame.width) * 1000);
      expect(baked.h).toBeCloseTo((area.heightIn / catalogFrame.height) * 1000);
    }
  });
});

describe("mockupStageFit", () => {
  it("centers the logical mockup stage inside a wider first-paint container", () => {
    const fit = mockupStageFit(1000, 600);

    expect(fit?.fit).toBeCloseTo(1, 5);
    expect(fit?.drawnW).toBeCloseTo(800, 5);
    expect(fit?.drawnH).toBeCloseTo(600, 5);
    expect(fit?.offsetX).toBeCloseTo(100, 5);
    expect(fit?.offsetY).toBeCloseTo(0, 5);
  });

  it("scales the mockup stage down before the image loader redraws", () => {
    const fit = mockupStageFit(400, 400);

    expect(fit?.fit).toBeCloseTo(0.5, 5);
    expect(fit?.drawnW).toBeCloseTo(400, 5);
    expect(fit?.drawnH).toBeCloseTo(300, 5);
    expect(fit?.offsetX).toBeCloseTo(0, 5);
    expect(fit?.offsetY).toBeCloseTo(50, 5);
  });

  it("does not expose the raw stage before a usable container is measured", () => {
    expect(mockupStageFit(0, 400)).toBeNull();
    expect(mockupStageFit(400, 0)).toBeNull();
  });
});

describe("shopRedeemUrl", () => {
  it("slugifies shop names and builds public paths", () => {
    expect(slugifyShopName("Salesforce HQ")).toBe("salesforce-hq");
    expect(shopRedeemPath("salesforce")).toBe("/s/salesforce");
    expect(shopStorefrontPath("abc123")).toBe("/shop/abc123");
  });

  it("treats main app hosts as non-shops and keeps customer subdomains", () => {
    const domain = "shelfmerch.io";
    expect(shopSlugFromHostname("staging.shelfmerch.io", domain)).toBeNull();
    expect(shopSlugFromHostname("shelfmerch.io", domain)).toBeNull();
    expect(shopSlugFromHostname("www.shelfmerch.io", domain)).toBeNull();
    expect(shopSlugFromHostname("localhost", domain)).toBeNull();
    expect(shopSlugFromHostname("127.0.0.1", domain)).toBeNull();
    expect(shopSlugFromHostname("acme.shelfmerch.io", domain)).toBe("acme");
    expect(shopSlugFromHostname("salesforce.shelfmerch.io", domain)).toBe("salesforce");
  });

  it("uses path storefronts on staging and local, vanity hosts in production", () => {
    const domain = "shelfmerch.io";
    expect(usesPathStorefront("staging.shelfmerch.io", domain)).toBe(true);
    expect(usesPathStorefront("localhost", domain)).toBe(true);
    expect(usesPathStorefront("127.0.0.1", domain)).toBe(true);
    expect(usesPathStorefront("preview.example.com", domain)).toBe(true);
    expect(usesPathStorefront("shelfmerch.io", domain)).toBe(false);
    expect(usesPathStorefront("www.shelfmerch.io", domain)).toBe(false);
    expect(usesPathStorefront("acme.shelfmerch.io", domain)).toBe(false);
  });

  it("builds staging path links and production vanity links", () => {
    const shop = { id: "abc123", slug: "acme" };
    const staging = {
      hostname: "staging.shelfmerch.io",
      host: "staging.shelfmerch.io",
      origin: "https://staging.shelfmerch.io",
      protocol: "https:",
    };
    const prod = {
      hostname: "shelfmerch.io",
      host: "shelfmerch.io",
      origin: "https://shelfmerch.io",
      protocol: "https:",
    };

    expect(shopStorefrontHref(shop, staging)).toBe("https://staging.shelfmerch.io/s/acme");
    expect(shopRedeemHref("acme", staging)).toBe("https://staging.shelfmerch.io/s/acme");
    expect(shopPublicLinkLabel("acme", staging)).toBe("staging.shelfmerch.io/s/acme");

    expect(shopStorefrontHref(shop, prod)).toBe("https://acme.store");
    expect(shopRedeemHref("acme", prod)).toBe("https://acme.store");
    expect(shopPublicLinkLabel("acme", prod)).toBe("acme.store");

    expect(shopStorefrontHref({ id: "abc123" }, staging)).toBe(
      "https://staging.shelfmerch.io/shop/abc123",
    );
  });
});

describe("storeProductAsUi", () => {
  it("maps storefront product rows onto mockup thumbnail fields", () => {
    const ui = storeProductAsUi({
      catalogProductId: "prod1",
      name: "Welcome Tee",
      brand: "Rubix",
      group: "tee",
      maskImageUrl: "/uploads/mask.png",
      baseImageUrl: "/uploads/base.png",
      primaryImageUrl: "/uploads/photo.png",
      mockupUrl: "/uploads/mock.png",
      placement: { xPct: 0.5, yPct: 0.4, wPct: 0.3, rot: 0 },
    });

    expect(ui.id).toBe("prod1");
    expect(ui.nm).toBe("Welcome Tee");
    expect(ui.maskImageUrl).toBe("/uploads/mask.png");
    expect(ui.photoUrl).toBe("/uploads/photo.png");
    expect(ui.areaPlacements?.area_1?.wPct).toBe(0.3);
  });
});

describe("printAreaStableKey", () => {
  const box = { xPct: 10, yPct: 10, widthPct: 12, heightPct: 14 };
  const front1 = { key: "front", label: "Front", widthIn: 2, heightIn: 2.2, box };
  const front2 = {
    key: "front",
    label: "Front",
    widthIn: 2.006,
    heightIn: 2.317,
    xIn: 8,
    yIn: 6,
    box,
  };
  const back = { key: "back", label: "Back", widthIn: 4, heightIn: 4, box };

  it("keeps a unique catalog key as-is", () => {
    expect(printAreaStableKey(front1, 0, [front1, back])).toBe("front");
    expect(printAreaStableKey(back, 1, [front1, back])).toBe("back");
  });

  it("disambiguates duplicate Front keys so every placeholder can be selected", () => {
    const areas = [front1, front2];
    expect(printAreaStableKey(front1, 0, areas)).toBe("front");
    expect(printAreaStableKey(front2, 1, areas)).toBe("front__1");
  });

  it("resolves each duplicate key to its own print area", () => {
    const product = { printAreas: [front1, front2] } as UiProduct;
    expect(pickPrintArea(product, "front")?.heightIn).toBe(2.2);
    expect(pickPrintArea(product, "front__1")?.heightIn).toBe(2.317);
  });
});

describe("saved design artwork stays on the selected print area", () => {
  const box = { xPct: 10, yPct: 10, widthPct: 12, heightPct: 14 };
  const placement = { xPct: 40, yPct: 30, wPct: 12, rot: 0 };
  const product = {
    id: "polo",
    g: "polo",
    brand: "Rubix",
    nm: "Polo",
    price: "",
    sw: 4,
    maskImageUrl: "/polo-front.png",
    printAreas: [
      { key: "left", label: "Left", mockupImageUrl: "/polo-front.png", widthIn: 2, heightIn: 2, box },
      { key: "right", label: "Right", mockupImageUrl: "/polo-front.png", widthIn: 2, heightIn: 2, box },
    ],
    areaPlacements: {
      left: placement,
      right: { ...placement, artworkUrl: "/uploads/logo-right.png" },
    },
  } as UiProduct;

  it("does not paint collection artwork onto placeholders that were not designed", () => {
    const layers = resolveProductArtworkLayers(product, "/uploads/collection-logo.png");
    expect(layers.map((l) => l.areaKey)).toEqual(["right"]);
    expect(layers[0]?.artUrl).toContain("logo-right.png");
  });

  it("bakes only the print area assigned in the artwork step", () => {
    const layers = collectBakeLayers(
      product,
      { [areaPlacementKey(product, 0, "right")]: placement },
      { [areaPlacementKey(product, 0, "right")]: { preview: "/uploads/logo-right.png" } },
      0,
      "/uploads/collection-logo.png",
    );
    expect(layers.map((l) => l.areaKey)).toEqual(["right"]);
  });

  it("still uses collection artwork on the primary area when nothing was assigned", () => {
    const blank = { ...product, areaPlacements: undefined };
    const layers = resolveProductArtworkLayers(blank, "/uploads/collection-logo.png");
    expect(layers.map((l) => l.areaKey)).toEqual(["left"]);
    expect(savedDesignPreview(blank, "/uploads/collection-logo.png").preferBakedMockup).toBe(false);
  });

  it("does not apply collection artwork when the product has no print area", () => {
    const plain = { ...product, printAreas: [], areaPlacements: undefined };
    expect(resolveProductArtworkLayers(plain, "/uploads/collection-logo.png")).toEqual([]);
  });

  it("previews a multi-area design from per-area artwork, not the shared bake", () => {
    expect(savedDesignPreview(product, "/uploads/collection-logo.png")).toEqual({
      artworkUrl: undefined,
      preferBakedMockup: false,
    });
  });
});
