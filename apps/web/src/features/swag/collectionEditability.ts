import type { UiCollection } from "@/services/mappers";

/** True when the collection is linked to at least one shop (published listings). */
export function collectionLinkedToShop(collection: Pick<UiCollection, "shopId" | "shopIds">): boolean {
  if (collection.shopIds?.length) return true;
  return Boolean(collection.shopId);
}

/**
 * Wizard may edit draft collections and ready collections that were never published.
 * Artwork save promotes status to ready before Publish, so ready+unlinked must stay editable.
 */
export function collectionEditableInWizard(
  collection: Pick<UiCollection, "status" | "shopId" | "shopIds">,
): boolean {
  if (collection.status === "archived") return false;
  if (collectionLinkedToShop(collection)) return false;
  return collection.status === "draft" || collection.status === "ready";
}
