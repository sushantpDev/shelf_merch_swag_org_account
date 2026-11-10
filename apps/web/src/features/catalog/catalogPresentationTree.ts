import type { PublicCatalogCategory } from "@/services/api-bridge";
import type { UiProduct } from "./model";
import { catalogCategorySlug, catalogCollectionName, productMatchesCollection } from "./types";

const COLLECTIONS = new Set(["Apparel", "Bags", "Drinkware", "Office", "Office Supplies", "Technology", "Stationery", "Electronics & Gadgets"]);

export function needsCatalogPresentationTree(nodes: readonly PublicCatalogCategory[]) {
  return nodes.some((node) => !node.children.length && COLLECTIONS.has(node.name));
}

/**
 * Keep the API's real collection names/IDs/order. For flat collections only,
 * derive read-only navigation groups from actual product labels, rather than
 * requiring a DB hierarchy change or hiding the existing editorial designs.
 */
export function buildCatalogPresentationTree(
  nodes: readonly PublicCatalogCategory[], products: readonly UiProduct[],
): PublicCatalogCategory[] {
  return nodes.map((node) => {
    if (node.children.length || !COLLECTIONS.has(node.name)) return node;
    const collection = catalogCollectionName(node.name);
    const children: PublicCatalogCategory[] = [];
    const afterCollection = (labels: string[]) => {
      const start = labels.findIndex((label) => catalogCollectionName(label) === collection);
      return start < 0 ? [] : labels.slice(start + 1)
        .filter((label) => label && catalogCollectionName(label) !== collection && label !== "Others");
    };
    for (const product of products.filter((row) => productMatchesCollection(row, node.name))) {
      const primary = afterCollection([product.category ?? "", product.subcategory ?? "", product.childCategory ?? ""]);
      const extra = afterCollection(product.categoryLabels ?? []);
      // A concrete childCategory is authoritative. Extended labels supply the
      // navigation path for products whose primary child field is empty.
      const path = primary.length ? primary : extra;
      let siblings = children;
      let parentId = node._id;
      for (const label of [...new Set(path)]) {
        let child = siblings.find((entry) => entry.name === label);
        if (!child) {
          child = { _id: `browse:${parentId}/${catalogCategorySlug(label)}`, name: label,
            slug: catalogCategorySlug(label), sortOrder: siblings.length, children: [] };
          siblings.push(child);
        }
        siblings = child.children;
        parentId = child._id;
      }
    }
    // Existing Apparel rendering collapses Apparel -> Apparel -> product types.
    const types = node.name === "Apparel" && children.length ? [{
      ...node, _id: `browse:${node._id}/apparel`, children,
    }] : children;
    return { ...node, children: types, productScope: node.name };
  });
}
