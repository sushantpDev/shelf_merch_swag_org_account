import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchCatalogProduct,
  fetchPublicCatalogCategories,
  refreshCatalogKitsPublic,
  refreshCatalogProducts,
  type CatalogProductsResult,
} from "@/services/api-bridge";
import type { WorkspaceSnapshot } from "@/services/workspace-api";
import { ALL_PRODUCTS } from "./types";
import { buildCatalogPresentationTree, needsCatalogPresentationTree } from "./catalogPresentationTree";

// Ui types re-exported here so views/controllers never import services/ directly.
export type { UiProduct } from "@/services/mappers";
export type { CatalogProductsResult } from "@/services/api-bridge";
export type { PublicCatalogCategory } from "@/services/api-bridge";

export const CATALOG_QUERY_KEY = "catalog";
export const CATALOG_KITS_QUERY_KEY = [CATALOG_QUERY_KEY, "kits"] as const;
export const CATALOG_CATEGORIES_QUERY_KEY = [CATALOG_QUERY_KEY, "categories"] as const;

/** Active category tree. Empty until the API responds; callers keep the fallback list. */
export function useCatalogCategoryTree(includeProductGroups = true) {
  const tree = useQuery({
    queryKey: CATALOG_CATEGORIES_QUERY_KEY,
    queryFn: fetchPublicCatalogCategories,
    staleTime: 60_000,
  });
  // Reuses the same All Products query/cache as landing and category pages.
  const products = useCatalog(ALL_PRODUCTS, undefined, includeProductGroups && needsCatalogPresentationTree(tree.data ?? []));
  const data = useMemo(() => tree.data
    ? buildCatalogPresentationTree(tree.data, products.data?.items ?? [])
    : undefined, [tree.data, products.data?.items]);
  return { ...tree, data };
}

/**
 * Catalog products for a category. Mirrors the legacy server-side filtering
 * (`refreshCatalogProducts`), cached per category. The "All Products" tab is
 * seeded from the workspace snapshot to avoid a load flash on first paint.
 */
export function useCatalog(
  category: string,
  seed?: CatalogProductsResult,
  enabled: boolean = true,
) {
  return useQuery({
    queryKey: [CATALOG_QUERY_KEY, category],
    queryFn: () => refreshCatalogProducts(category === ALL_PRODUCTS ? undefined : category),
    initialData: enabled && category === ALL_PRODUCTS && seed && seed.items.length >= seed.total
      ? seed
      : undefined,
    staleTime: 30_000,
    enabled,
  });
}

/** Platform-curated kits for the catalog Kits category (public browse). */
export function useCatalogKits(enabled: boolean = true) {
  return useQuery({
    queryKey: CATALOG_KITS_QUERY_KEY,
    queryFn: refreshCatalogKitsPublic,
    staleTime: 60_000,
    enabled,
  });
}

export function useCatalogProduct(id: string, workspace?: WorkspaceSnapshot) {
  const fromWorkspace = workspace?.catalogProducts.find((p) => p.id === id);

  return useQuery({
    queryKey: [CATALOG_QUERY_KEY, "product", id],
    queryFn: () => fetchCatalogProduct(id),
    initialData: fromWorkspace,
    enabled: Boolean(id),
    staleTime: 30_000,
    refetchOnMount: "always",
  });
}
