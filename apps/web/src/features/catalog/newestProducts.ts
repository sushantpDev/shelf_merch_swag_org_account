import type { UiProduct } from "./model";

/** Missing dates stay in their catalog order after products with known dates. */
export function newestProducts(products: readonly UiProduct[]): UiProduct[] {
  const timestamp = (product: UiProduct) => Date.parse(product.createdAt ?? "") || 0;
  return [...products].sort((a, b) => timestamp(b) - timestamp(a));
}
