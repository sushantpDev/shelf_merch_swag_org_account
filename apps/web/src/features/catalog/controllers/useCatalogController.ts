import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useCatalog, useCatalogCategoryTree } from "../model";
import {
  ALL_PRODUCTS,
  FALLBACK_CATALOG_NODES,
  catalogCategorySlug,
  resolveCatalogBrowseTarget,
  productMatchesCollection,
  type CatalogCategoryChild,
  type CatalogCategoryNode,
} from "../types";
import type { UiProduct } from "../model";

function mapPublicChildren(
  children: { name: string; slug: string; children?: unknown[] }[] | undefined,
): CatalogCategoryChild[] {
  return (children ?? []).map((child) => ({
    name: child.name,
    slug: child.slug,
    children: mapPublicChildren(
      child.children as { name: string; slug: string; children?: unknown[] }[] | undefined,
    ),
  }));
}

export type CatalogVm = {
  /** Parent Category (product.category), or All Products on the landing. */
  parent: string;
  /** Category under the parent (product.subcategory) from the URL, if any. */
  category: string | null;
  /** Sub-Category (product.childCategory) from the URL, if any. */
  subcategory: string | null;
  isCategorySelected: boolean;
  /** Parent Category names including All Products. */
  categories: readonly string[];
  categoryNodes: readonly CatalogCategoryNode[];
  /** Parent → Category names (depth 1). */
  subcategoriesByCategory: Record<string, readonly string[]>;
  /** Parent → Category nodes with nested Sub-Categories. */
  categoriesByParent: Record<string, readonly CatalogCategoryChild[]>;
  items: UiProduct[];
  /** Product pool for style-carousel tile photos (landing only). */
  stylePreviewProducts: UiProduct[];
  stylePreviewLoading?: boolean;
  stylePreviewError?: string | null;
  count: number;
  isSkeleton: boolean;
  errorMessage: string | null;
  onCategory: (category: string) => void;
};

/** Controller for the catalog grid: category tabs + per-parent product query. */
export function useCatalogController(): CatalogVm {
  const { data: workspace } = useWorkspace();
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const categoryTree = useCatalogCategoryTree();
  const categoryNodes = useMemo(() => {
    const remote = categoryTree.data;
    if (remote && remote.length) {
      return remote.map((node) => ({
        name: node.name,
        slug: node.slug,
        productScope: node.productScope,
        children: mapPublicChildren(node.children),
      }));
    }
    return FALLBACK_CATALOG_NODES;
  }, [categoryTree.data]);
  const rawCategory = params.category ?? searchParams.get("category");
  const isCategorySelected = Boolean(rawCategory && rawCategory.trim() !== "");
  const browse = useMemo(
    () => resolveCatalogBrowseTarget(rawCategory, categoryNodes),
    [rawCategory, categoryNodes],
  );
  const parent = browse.parent;
  const category = browse.category;
  const subcategory = browse.subcategory;
  /** Always fetch by Parent Category; Category / Sub-Category filter client-side. */
  const queryCategory = browse.query;

  const workspaceCatalog = useMemo(
    () =>
      workspace
        ? { items: workspace.catalogProducts, total: workspace.catalogTotal }
        : undefined,
    [workspace],
  );

  const { data, isLoading, isError, error, isFetching } = useCatalog(
    queryCategory,
    isCategorySelected ? workspaceCatalog : undefined,
    isCategorySelected,
  );
  /** Landing carousel: load products so tiles can show Category / Sub-Category photos. */
  const stylePreview = useCatalog(ALL_PRODUCTS, workspaceCatalog, !isCategorySelected);
  const productScope = categoryNodes.find((node) => node.name === parent)?.productScope;
  const items = useMemo(() => productScope
    ? (data?.items ?? []).filter((product) => productMatchesCollection(product, productScope))
    : data?.items ?? [], [data?.items, productScope]);
  const stylePreviewProducts = !isCategorySelected
    ? (stylePreview.data?.items ?? workspaceCatalog?.items ?? [])
    : [];
  const categories = useMemo(
    () => [ALL_PRODUCTS, ...categoryNodes.map((node) => node.name)],
    [categoryNodes],
  );
  const categoriesByParent = useMemo(
    () => Object.fromEntries(categoryNodes.map((node) => [node.name, node.children])),
    [categoryNodes],
  );
  const subcategoriesByCategory = useMemo(
    () =>
      Object.fromEntries(
        categoryNodes.map((node) => [node.name, node.children.map((child) => child.name)]),
      ),
    [categoryNodes],
  );

  return {
    parent,
    category,
    subcategory,
    isCategorySelected,
    categories,
    categoryNodes,
    subcategoriesByCategory,
    categoriesByParent,
    items,
    stylePreviewProducts,
    stylePreviewLoading: stylePreview.isLoading && stylePreviewProducts.length === 0,
    stylePreviewError: stylePreview.isError ? "Could not load catalog products. Please try again." : null,
    count: productScope ? items.length : data?.total ?? items.length,
    isSkeleton: (isLoading || isFetching) && items.length === 0,
    errorMessage: isError
      ? error instanceof Error
        ? error.message
        : "Could not load catalog products"
      : null,
    onCategory: (next) => {
      const currentPath = window.location.pathname;
      const basePath = currentPath.startsWith("/apps/catalog") ? "/apps/catalog" : "/app/catalog";

      if (next === ALL_PRODUCTS) {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("category");
        navigate(
          `${basePath}/category/all-products${nextParams.toString() ? `?${nextParams.toString()}` : ""}`,
          { replace: false },
        );
        return;
      }

      navigate(`${basePath}/category/${catalogCategorySlug(next)}`);
    },
  };
}
