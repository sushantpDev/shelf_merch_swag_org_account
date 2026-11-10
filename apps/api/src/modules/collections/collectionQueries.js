/**
 * Whether a collection is assigned to a shop.
 * shopIds is the source of truth; shopId alone only applies when shopIds is empty (legacy).
 */
export function isCollectionLinkedToShop(collection, shopId) {
  const sid = String(shopId);
  const linked = (collection?.shopIds || []).map(String);
  if (linked.length) return linked.includes(sid);
  return collection?.shopId ? String(collection.shopId) === sid : false;
}

/** Mongo filter: collections explicitly assigned to a shop. */
export function collectionsForShopFilter(shopId) {
  return {
    $or: [
      { shopIds: shopId },
      {
        $and: [
          { $or: [{ shopIds: { $size: 0 } }, { shopIds: { $exists: false } }] },
          { shopId },
        ],
      },
    ],
  };
}

/** True when the collection is linked to one or more shops (published listings). */
export function isCollectionLinkedToAnyShop(collection) {
  if ((collection?.shopIds || []).length > 0) return true;
  if (collection?.shopId) return true;
  if ((collection?.shopPublish || []).length > 0) return true;
  return false;
}

function isBlankDesignValue(value) {
  if (value == null) return true;
  if (typeof value === "string") return !value.trim();
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

/**
 * Merge incoming productRefs with existing design media by catalogProductId.
 * Omitted/empty mockupUrl, designOnlyImageUrl, placement(s), and printSpec keep
 * the previously saved values so a partial Save Design cannot wipe artwork.
 */
export function mergeProductRefsPreservingDesign(existingRefs, incomingRefs) {
  const byProduct = new Map(
    (existingRefs || []).map((ref) => [String(ref.catalogProductId), ref]),
  );
  return (incomingRefs || []).map((incoming) => {
    const prev = byProduct.get(String(incoming.catalogProductId));
    if (!prev) return incoming;
    const next = { ...incoming };
    if (isBlankDesignValue(next.mockupUrl) && prev.mockupUrl) next.mockupUrl = prev.mockupUrl;
    if (isBlankDesignValue(next.mockupBackUrl) && prev.mockupBackUrl) {
      next.mockupBackUrl = prev.mockupBackUrl;
    }
    if (isBlankDesignValue(next.designOnlyImageUrl) && prev.designOnlyImageUrl) {
      next.designOnlyImageUrl = prev.designOnlyImageUrl;
    }
    if (isBlankDesignValue(next.placement) && prev.placement) next.placement = prev.placement;
    if (isBlankDesignValue(next.placements) && prev.placements?.length) {
      next.placements = prev.placements;
    }
    if (isBlankDesignValue(next.printSpec) && prev.printSpec) next.printSpec = prev.printSpec;
    return next;
  });
}
