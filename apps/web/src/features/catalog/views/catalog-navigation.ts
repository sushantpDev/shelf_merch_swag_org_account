import type { UiProduct } from "../model";
import { ALL_PRODUCTS, KITS_CATEGORY, pickStyleTileImage, type CatalogCategoryChild, type CatalogCategoryNode } from "../types";
import allProductsImg from "../../../../assets/catalog/all-products-lifestyle.png";
import apparelImg from "../../../../assets/catalog/apparel-shelfmerch.png";
import accessoriesImg from "../../../../assets/catalog/key-chains.webp";
import technologyImg from "../../../../assets/catalog/technology-shelfmerch.png";
import kitsImg from "../../../../assets/catalog-style-spotlight/kits.png";
import drinkwareImg from "../../../../assets/catalog-style-spotlight/drinkware.png";
import bagsImg from "../../../../assets/catalog-style-spotlight/tote.png";
import backpackLifestyleImg from "../../../../assets/catalog/backpack-lifestyle.png";
import electronicsSpeakerImg from "../../../../assets/catalog/electronics-speaker.png";
import apparelCloseupImg from "../../../../assets/catalog/apparel-sweatshirt-closeup.png";
import drinkwareLifestyleImg from "../../../../assets/catalog/drinkware-tumbler-lifestyle.png";
import travelCloseupImg from "../../../../assets/catalog/travel-accessories-closeup.png";
import officeImg from "../../../../assets/catalog-style-spotlight/notebook.png";
import foodImg from "../../../../assets/catalog-overview/sustainability-new.png";
import homeImg from "../../../../assets/catalog-overview/corporate-gifts.png";
import homeAppliancesImg from "../../../../assets/catalog/home-appliances-editorial/hero.png";

const TILE_IMAGES: Partial<Record<string, string>> = {
  Kits: kitsImg,
  Apparel: apparelCloseupImg,
  Drinkware: drinkwareLifestyleImg,
  Bags: backpackLifestyleImg,
  "Electronics & Gadgets": electronicsSpeakerImg,
  Technology: electronicsSpeakerImg,
  Office: officeImg,
  "Office Supplies": officeImg,
  "Travel Accessories": travelCloseupImg,
};

const TILE_FALLBACKS: Record<string, string> = {
  Apparel: apparelImg,
  Accessories: accessoriesImg,
  Stationery: officeImg,
  Bags: bagsImg,
  Drinkware: drinkwareImg,
  "Travel Accessories": bagsImg,
  "Electronics & Gadgets": technologyImg,
  "Office Supplies": officeImg,
  Technology: technologyImg,
  Kitchenware: foodImg,
  "Home Appliances": homeAppliancesImg,
  "Home & Living": homeImg,
  "Food & Beverage": foodImg,
  Kits: kitsImg,
};

/**
 * The API tree starts with three departments (Apparel, Accessories, Home & Living).
 * Shoppers need the categories inside those departments — Stationery, Drinkware, Bags —
 * as the list they scan. A department that only wraps a same-named child (Apparel → Apparel)
 * stays one row, and its product types become the items under the chevron.
 */
export function browseCatalogEntries(nodes: readonly CatalogCategoryNode[]): CatalogCategoryChild[] {
  const entries: CatalogCategoryChild[] = [];

  for (const node of nodes) {
    if (node.name.trim().toLowerCase() === "decor") continue;
    if (node.name === KITS_CATEGORY) {
      entries.push({ name: node.name, slug: node.slug, children: node.children });
      continue;
    }
    const children = node.children.filter(
      (child) => child.name !== "Others" && child.name.trim().toLowerCase() !== "decor",
    );
    if (children.length === 0) {
      entries.push({ name: node.name, slug: node.slug, children: [] });
      continue;
    }

    const [only] = children;
    if (children.length === 1 && only.name.toLowerCase() === node.name.toLowerCase()) {
      entries.push({
        name: node.name,
        slug: node.slug,
        children: (only.children ?? []).filter((child) => child.name !== "Others"),
      });
      continue;
    }

    // Product-derived groups belong inside a real production collection.
    // Keep Bags/Office/Technology as the overview tiles, not their product types.
    if (node.productScope) {
      entries.push({ name: node.name, slug: node.slug, children });
    } else {
      entries.push(...children);
    }
  }

  if (!entries.some((entry) => entry.name === KITS_CATEGORY)) {
    entries.push({ name: KITS_CATEGORY, slug: "kits", children: [] });
  }
  return entries;
}

/** Shared category artwork and ordering for the overview and landing carousel. */
export function buildCatalogOverviewTiles(nodes: readonly CatalogCategoryNode[], products: readonly UiProduct[]) {
  return [
    { name: ALL_PRODUCTS, image: allProductsImg },
    ...browseCatalogEntries(nodes).map((entry) => ({
      name: entry.name,
      image: TILE_IMAGES[entry.name] ?? pickStyleTileImage(products, entry.name, TILE_FALLBACKS[entry.name] ?? apparelImg, nodes),
    })),
  ];
}
