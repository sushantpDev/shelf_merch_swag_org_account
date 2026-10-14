import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link, useLocation } from "react-router";
import type { CatalogVm } from "../controllers/useCatalogController";
import {
  ALL_PRODUCTS,
  CUSTOMISED_KITS_SUBCATEGORY,
  KITS_CATEGORY,
  PREDESIGNED_KITS_SUBCATEGORY,
  productMatchesLevel,
  productMatchesSubcategory,
  type CatalogCategoryChild,
} from "../types";
import { ProductCard } from "./ProductCard";
import { CatalogKitsGrid } from "./CatalogKitsGrid";
import { useCatalogKitsController } from "../controllers/useCatalogKitsController";
import "./catalog-view.css";
import accessoriesImg from "../../../../assets/catalog/category-heroes/accessories-bystadium.png";
import apparelImg from "../../../../assets/catalog/category-heroes/apparel-bystadium.png";
import bagsImg from "../../../../assets/catalog/category-heroes/bags-bystadium.png";
import drinkwareImg from "../../../../assets/catalog/category-heroes/drinkware-bystadium.png";
import officeImg from "../../../../assets/catalog/category-heroes/office-supplies-bystadium.png";
import technologyImg from "../../../../assets/catalog/category-heroes/technology-bystadium.png";
import kitsImg from "../../../../assets/catalog-style-spotlight/kits.png";

const CATEGORY_COPY: Record<string, string> = {
  Apparel:
    "Custom branded apparel built for teams at scale. From everyday essentials to premium statement pieces, our apparel collection helps you turn clothing into culture.",
  Accessories:
    "Smart branded add-ons, including key chains, that are easy to gift, carry, and use across every audience.",
  Bags:
    "Branded bags designed for impact and logistics simplicity. From trade show totes to executive backpacks, every carry is built for real-world use.",
  Drinkware:
    "Reusable bottles, tumblers, and mugs built for everyday rituals, repeat impressions, and branded moments that travel with your team.",
  Technology:
    "Useful tech accessories that make branded gifting feel modern, practical, and ready for hybrid workdays, launches, and events.",
  "Office Supplies":
    "Desk essentials, stationery, and workday tools made for onboarding, meetings, campaigns, and every polished brand touchpoint.",
  Kits:
    "Ready-made gift bundles and custom kits built from our catalog. Choose a pre-designed template or send a kit you've already created for your team.",
};

const CATEGORY_IMAGES: Record<string, string> = {
  Apparel: apparelImg,
  Accessories: accessoriesImg,
  Bags: bagsImg,
  Drinkware: drinkwareImg,
  Technology: technologyImg,
  "Office Supplies": officeImg,
  Kits: kitsImg,
};

function CategoryPageSkeleton() {
  return (
    <div className="sm-cat-grid" aria-busy="true" aria-label="Loading category products">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="sm-skeleton-card">
          <div className="sm-skeleton-img" />
          <div className="sm-skeleton-line" />
          <div className="sm-skeleton-line short" />
        </div>
      ))}
    </div>
  );
}

/**
 * Sidebar shows Sub-Categories (leaves) when:
 * - URL lands on a Category that has children (Drinkware → Mugs, Tumblers, …), or
 * - Parent has a single Category that shares its name (Apparel → Apparel → T-Shirts, …).
 */
function resolveBrowseLevels(
  nodes: readonly CatalogCategoryChild[],
  parentName: string,
  focusCategory: string | null,
) {
  if (focusCategory) {
    const focusNode = nodes.find((node) => node.name === focusCategory);
    if (focusNode && (focusNode.children?.length ?? 0) > 0) {
      return {
        collapsed: true as const,
        categories: focusNode.children ?? [],
        categoryNodes: nodes,
        focusCategory,
      };
    }
  }

  const collapsed =
    nodes.length === 1 &&
    nodes[0]?.name === parentName &&
    (nodes[0].children?.length ?? 0) > 0;

  if (collapsed) {
    return {
      collapsed: true as const,
      categories: nodes[0].children ?? [],
      categoryNodes: nodes,
      focusCategory: null as string | null,
    };
  }
  return {
    collapsed: false as const,
    categories: nodes,
    categoryNodes: nodes,
    focusCategory: null as string | null,
  };
}

export function CatalogCategoryView(vm: CatalogVm) {
  const { pathname } = useLocation();
  const isPublicApps = pathname.startsWith("/apps/catalog");
  const catalogHome = isPublicApps ? "/apps/catalog" : "/app/catalog";
  const parentName = vm.parent;
  const isKitsCategory = parentName === KITS_CATEGORY;

  const parentCategories = vm.categoriesByParent[parentName] ?? [];
  const levels = useMemo(
    () => resolveBrowseLevels(parentCategories, parentName, vm.category),
    [parentCategories, parentName, vm.category],
  );

  /** Hero cycles Categories (depth 1), never Parent roots. */
  const categorySlides = useMemo(() => {
    if (parentCategories.length > 0) {
      return parentCategories.map((node) => node.name);
    }
    // Parent with no Category children (flat / Kits-style) — fall back to the parent itself.
    return parentName && parentName !== ALL_PRODUCTS ? [parentName] : [];
  }, [parentCategories, parentName]);

  const displayName =
    levels.focusCategory ??
    vm.category ??
    (parentCategories.length === 1 ? parentCategories[0].name : null) ??
    categorySlides[0] ??
    parentName;

  const currentIndex = Math.max(0, categorySlides.indexOf(displayName));
  const prevCategory =
    categorySlides[(currentIndex - 1 + categorySlides.length) % categorySlides.length] ?? displayName;
  const nextCategory =
    categorySlides[(currentIndex + 1) % categorySlides.length] ?? displayName;
  const heroImage = CATEGORY_IMAGES[displayName] ?? CATEGORY_IMAGES[parentName] ?? apparelImg;
  const heroCopy =
    CATEGORY_COPY[displayName] ??
    CATEGORY_COPY[parentName] ??
    "Browse curated products in this category and open any item to see full details.";

  /**
   * URL may land on a Category (Drinkware / Stationery) or Sub-Category (Mugs / T-Shirts).
   * When the sidebar lists leaves, the selected sidebar item is the Sub-Category.
   */
  const urlCategory = levels.collapsed
    ? vm.subcategory ??
      (levels.focusCategory
        ? null
        : vm.category !== parentName
          ? vm.category
          : null)
    : vm.category;
  const urlSubcategory = levels.collapsed ? null : vm.subcategory;

  const [selectedCategory, setSelectedCategory] = useState<string | null>(() => urlCategory);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(() => urlSubcategory);

  useEffect(() => {
    setSelectedCategory(urlCategory);
    setSelectedSubcategory(urlSubcategory);
  }, [urlCategory, urlSubcategory, parentName]);

  const kitsVm = useCatalogKitsController(isKitsCategory ? selectedCategory : null);

  function selectCategory(next: string | null) {
    setSelectedCategory(next);
    setSelectedSubcategory(null);
  }

  function selectSubcategory(next: string | null) {
    setSelectedSubcategory(next);
  }

  /** When browsing a Parent, selecting a Category with leaves drills the sidebar into those leaves. */
  const drilledCategoryNode = useMemo(() => {
    if (levels.collapsed || !selectedCategory) return null;
    const node = levels.categoryNodes.find((entry) => entry.name === selectedCategory);
    return node && (node.children?.length ?? 0) > 0 ? node : null;
  }, [levels.collapsed, levels.categoryNodes, selectedCategory]);

  const showingLeaves = levels.collapsed || Boolean(drilledCategoryNode);
  const leafScopeName = levels.focusCategory ?? drilledCategoryNode?.name ?? parentName;

  const sidebarCategories = useMemo(() => {
    if (isKitsCategory) {
      const defined = levels.categories.map((node) => node.name);
      return defined.filter((sub) => {
        if (sub === PREDESIGNED_KITS_SUBCATEGORY) {
          return (
            kitsVm.allKits.some((kit) => kit.kind === "pre-designed") ||
            vm.items.some((item) => productMatchesSubcategory(item, sub))
          );
        }
        if (sub === CUSTOMISED_KITS_SUBCATEGORY) {
          return (
            kitsVm.allKits.some((kit) => kit.kind === "customised") ||
            vm.items.some((item) => productMatchesSubcategory(item, sub))
          );
        }
        return false;
      });
    }

    const scopeCategory = levels.focusCategory ?? drilledCategoryNode?.name ?? null;

    if (showingLeaves) {
      const defined = levels.collapsed
        ? levels.categories.map((node) => node.name)
        : (drilledCategoryNode?.children ?? []).map((leaf) => leaf.name);
      const pool = scopeCategory
        ? vm.items.filter((item) => productMatchesLevel(item, "category", scopeCategory))
        : vm.items;
      const fromProducts = pool
        .map((item) => String(item.childCategory || item.subcategory || "").trim())
        .filter(Boolean);
      const merged = Array.from(new Set([...defined, ...fromProducts]));
      const withProducts = merged.filter((name) =>
        pool.some(
          (item) =>
            productMatchesLevel(item, "subcategory", name) ||
            productMatchesLevel(item, "category", name),
        ),
      );
      const withoutOthers = withProducts.filter((name) => name !== "Others");
      if (withProducts.includes("Others")) withoutOthers.push("Others");
      return withoutOthers;
    }

    const defined = levels.categories.map((node) => node.name);
    const fromProducts = vm.items
      .map((item) => String(item.subcategory || "").trim())
      .filter(Boolean);
    const merged = Array.from(new Set([...defined, ...fromProducts]));
    const withProducts = merged.filter((name) =>
      vm.items.some((item) => productMatchesLevel(item, "category", name)),
    );
    const withoutOthers = withProducts.filter((name) => name !== "Others");
    if (withProducts.includes("Others")) withoutOthers.push("Others");
    return withoutOthers;
  }, [
    levels,
    vm.items,
    isKitsCategory,
    kitsVm.allKits,
    showingLeaves,
    drilledCategoryNode,
  ]);

  const filteredItems = useMemo(() => {
    let items = vm.items;
    const scopeCategory = levels.focusCategory ?? drilledCategoryNode?.name ?? null;

    if (levels.collapsed) {
      if (scopeCategory) {
        items = items.filter((item) => productMatchesLevel(item, "category", scopeCategory));
      }
      if (selectedCategory) {
        items = items.filter(
          (item) =>
            productMatchesLevel(item, "subcategory", selectedCategory) ||
            productMatchesLevel(item, "category", selectedCategory),
        );
      }
      return items;
    }

    if (selectedCategory) {
      items = items.filter((item) => productMatchesLevel(item, "category", selectedCategory));
    }
    if (selectedSubcategory) {
      items = items.filter((item) => productMatchesLevel(item, "subcategory", selectedSubcategory));
    }
    return items;
  }, [
    vm.items,
    levels.collapsed,
    levels.focusCategory,
    drilledCategoryNode,
    selectedCategory,
    selectedSubcategory,
  ]);

  const hasKitProducts = filteredItems.length > 0;
  const kitsStillLoading = kitsVm.isLoading && kitsVm.allKits.length === 0;
  const showCombinedKitsEmpty =
    isKitsCategory &&
    !kitsStillLoading &&
    !vm.isSkeleton &&
    kitsVm.kits.length === 0 &&
    !hasKitProducts &&
    !kitsVm.errorMessage &&
    !vm.errorMessage;

  const tagsLabel = showingLeaves ? "Sub-categories" : "Categories";
  const crumbCategory = levels.focusCategory
    ?? (drilledCategoryNode ? drilledCategoryNode.name : selectedCategory);
  const crumbSubcategory = levels.focusCategory
    ? selectedCategory
    : levels.collapsed
      ? null
      : selectedSubcategory;
  const filterLabel =
    (levels.collapsed ? selectedCategory : selectedSubcategory) ||
    levels.focusCategory ||
    drilledCategoryNode?.name ||
    selectedCategory ||
    null;
  const allTagsLabel = showingLeaves ? `All ${leafScopeName}` : `All ${parentName}`;
  const activeTag = showingLeaves
    ? levels.collapsed
      ? selectedCategory
      : selectedSubcategory
    : selectedCategory;

  function selectTag(next: string | null) {
    if (levels.collapsed) {
      selectCategory(next);
      return;
    }
    if (drilledCategoryNode) {
      if (next === null) {
        // "All {Category}" — stay drilled into this Category, clear leaf filter.
        selectSubcategory(null);
        return;
      }
      selectSubcategory(next);
      return;
    }
    selectCategory(next);
  }

  const tagFilters =
    sidebarCategories.length > 0 ? (
      <nav className="sm-cat-page__tags" aria-label={tagsLabel}>
        {!levels.focusCategory && drilledCategoryNode ? (
          <button type="button" className="sm-cat-page__tag" onClick={() => selectCategory(null)}>
            All {parentName}
          </button>
        ) : null}
        <button
          type="button"
          className={`sm-cat-page__tag${!activeTag ? " sm-cat-page__tag--active" : ""}`}
          onClick={() => selectTag(null)}
        >
          {allTagsLabel}
        </button>
        {sidebarCategories.map((name) => (
          <button
            key={name}
            type="button"
            className={`sm-cat-page__tag${activeTag === name ? " sm-cat-page__tag--active" : ""}`}
            onClick={() => selectTag(name)}
          >
            {name}
          </button>
        ))}
      </nav>
    ) : null;

  return (
    <div className="sm-cat-page sm-cat-page--public">
      <div className="sm-cat-page__container">
        <div className="sm-cat-page__topbar">
          <nav className="sm-cat-page__crumbs" aria-label="Breadcrumb">
            <Link to={catalogHome}>Catalog</Link>
            <ChevronRight size={14} aria-hidden="true" />
            <span>{parentName}</span>
            {crumbCategory ? (
              <>
                <ChevronRight size={14} aria-hidden="true" />
                <span>{crumbCategory}</span>
              </>
            ) : null}
            {crumbSubcategory ? (
              <>
                <ChevronRight size={14} aria-hidden="true" />
                <span>{crumbSubcategory}</span>
              </>
            ) : null}
          </nav>
          {!isPublicApps ? (
            <div className="sm-cat-page__topbar-actions">
              <Link to="/app/swag/new" className="btn btn-ghost sm-cat-page__topbar-btn">
                Design Swag
              </Link>
              <Link to="/app/kits/new" className="btn btn-dark sm-cat-page__topbar-btn">
                Create kit
              </Link>
            </div>
          ) : null}
        </div>

        <header className="sm-cat-page__hero">
          <div className="sm-cat-page__hero-copy">
            <p className="sm-cat-page__eyebrow">The best in</p>
            <h1 className="sm-cat-page__title">{displayName}</h1>
            <p className="sm-cat-page__copy">{heroCopy}</p>
            <div className="sm-cat-page__hero-nav">
              {categorySlides.length > 1 ? (
                <>
                  <button
                    type="button"
                    className="sm-cat-page__hero-arrow"
                    aria-label={`Previous category, ${prevCategory}`}
                    onClick={() => vm.onCategory(prevCategory)}
                  >
                    <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="sm-cat-page__hero-arrow"
                    aria-label={`Next category, ${nextCategory}`}
                    onClick={() => vm.onCategory(nextCategory)}
                  >
                    <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                </>
              ) : null}
            </div>
          </div>
          <div className="sm-cat-page__hero-visual">
            <img src={heroImage} alt="" />
          </div>
        </header>

        <div className="sm-cat-page__body">
          <div className="sm-cat-page__main">
            {tagFilters}
            {isKitsCategory ? (
              <>
                <CatalogKitsGrid
                  {...kitsVm}
                  suppressEmptyState={hasKitProducts || vm.isSkeleton || showCombinedKitsEmpty}
                />
                {vm.isSkeleton ? (
                  <CategoryPageSkeleton />
                ) : vm.errorMessage ? (
                  <div className="card sm-cat-error">{vm.errorMessage}</div>
                ) : hasKitProducts ? (
                  <section className="sm-cat-page__results">
                    <div className="sm-cat-page__results-head">
                      <p className="sm-cat-page__results-count">
                        Showing {filteredItems.length}{" "}
                        {filteredItems.length === 1 ? "product" : "products"}
                        {filterLabel ? ` in ${filterLabel}` : ""}
                      </p>
                      <Link to={catalogHome} className="sm-cat-page__back">
                        Back to all categories
                      </Link>
                    </div>

                    <div className="sm-cat-grid">
                      {filteredItems.map((p, index) => (
                        <ProductCard
                          key={p.id ?? `${p.nm}-${index}`}
                          product={p}
                          to={p.id ? `${catalogHome}/${p.id}` : undefined}
                          state={{ fromCatalog: pathname }}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}
                {showCombinedKitsEmpty ? (
                  <div className="card empty sm-cat-empty">
                    <h3>No kits in this category</h3>
                    <p className="muted">Try another category or check back later for new kits.</p>
                  </div>
                ) : null}
              </>
            ) : vm.isSkeleton ? (
              <CategoryPageSkeleton />
            ) : vm.errorMessage ? (
              <div className="card sm-cat-error">{vm.errorMessage}</div>
            ) : filteredItems.length === 0 ? (
              <div className="card empty sm-cat-empty">
                <h3>No products in this {filterLabel ? "selection" : "category"}</h3>
                <p className="muted">
                  {filterLabel
                    ? "Try another category or view all products in this parent category."
                    : "Try switching to another parent category."}
                </p>
              </div>
            ) : (
              <section className="sm-cat-page__results">
                <div className="sm-cat-page__results-head">
                  <p className="sm-cat-page__results-count">
                    Showing {filteredItems.length}{" "}
                    {filteredItems.length === 1 ? "product" : "products"}
                    {filterLabel ? ` in ${filterLabel}` : ""}
                  </p>
                  <Link to={catalogHome} className="sm-cat-page__back">
                    Back to all categories
                  </Link>
                </div>

                <div className="sm-cat-grid">
                  {filteredItems.map((p, index) => (
                    <ProductCard
                      key={p.id ?? `${p.nm}-${index}`}
                      product={p}
                      to={p.id ? `${catalogHome}/${p.id}` : undefined}
                      state={{ fromCatalog: pathname }}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
