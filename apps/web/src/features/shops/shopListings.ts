import { mergeCatalogProductDetails, type UiCollection, type UiProduct, type UiShop } from "@/services/mappers";
import { catalogCategoryLabel } from "./types";

export type ShopListing = {
  key: string;
  collectionId: string;
  collectionName: string;
  catalogProductId: string;
  product: UiProduct;
  category: string;
};

export function listingKey(collectionId: string, catalogProductId: string): string {
  return `${collectionId}:${catalogProductId}`;
}

export function parseListingKey(key: string): { collectionId: string; catalogProductId: string } | null {
  const parts = String(key).split(":");
  if (parts.length === 2 && parts.every((p) => /^[a-f\d]{24}$/i.test(p))) {
    return { collectionId: parts[0], catalogProductId: parts[1] };
  }
  return null;
}

/** All branded listings from collections published to this shop. */
export function publishedShopListings(
  collections: UiCollection[],
  catalogProducts: UiProduct[],
): ShopListing[] {
  const out: ShopListing[] = [];
  for (const col of collections) {
    if (col.status === "archived") continue;
    col.products.forEach((product, index) => {
      const catalogProductId = product.id;
      if (!catalogProductId) return;
      const enriched = mergeCatalogProductDetails(product, catalogProducts);
      out.push({
        key: listingKey(col.id, catalogProductId),
        collectionId: col.id,
        collectionName: col.name,
        catalogProductId,
        product: enriched,
        category: catalogCategoryLabel(enriched),
      });
    });
  }
  return out.sort((a, b) => {
    const byName = a.product.nm.localeCompare(b.product.nm);
    if (byName !== 0) return byName;
    return a.collectionName.localeCompare(b.collectionName);
  });
}

export function activeListingKeysForShop(shop: UiShop, listingKeys: Set<string>): string[] {
  const fromListings = (shop.activeListingKeys || []).filter((k) => listingKeys.has(k));
  if (fromListings.length) return fromListings;

  // Legacy fallback: bootstrap from selectedCatalogProductIds to published collections
  const legacy = new Set((shop.selectedCatalogProductIds || []).map(String));
  return [...listingKeys].filter((k) => {
    const parsed = parseListingKey(k);
    return parsed && legacy.has(parsed.catalogProductId);
  });
}

export function isListingActive(shop: UiShop, key: string): boolean {
  if ((shop.activeListingKeys || []).length) {
    return (shop.activeListingKeys || []).includes(key);
  }
  const parsed = parseListingKey(key);
  if (!parsed) return false;
  return (shop.selectedCatalogProductIds || []).map(String).includes(parsed.catalogProductId);
}

export function collectionPublishedAt(col: UiCollection, shopId: string): string | null {
  const entry = (col.shopPublish || []).find((p) => p.shopId === shopId);
  return entry?.publishedAt ?? null;
}

export function collectionCoverProduct(col: UiCollection): UiProduct | null {
  return col.products[0] ?? null;
}
