import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Link, useLocation } from "react-router";
import type { CatalogVm } from "../controllers/useCatalogController";
import {
  ALL_PRODUCTS,
  CUSTOMISED_KITS_SUBCATEGORY,
  KITS_CATEGORY,
  PREDESIGNED_KITS_SUBCATEGORY,
  catalogCategorySlug,
  catalogCollectionName,
  productMatchesLevel,
  productMatchesSubcategory,
  productPhotoUrl,
  type CatalogCategoryChild,
} from "../types";
import { ProductCard } from "./ProductCard";
import { CatalogProductListing } from "./CatalogProductListing";
import { CatalogKitsGrid } from "./CatalogKitsGrid";
import { CatalogEditorialGrid } from "./CatalogEditorialGrid";
import { DrinkwareEditorialGrid } from "./DrinkwareEditorialGrid";
import { TravelEditorialView } from "./TravelEditorialView";
import { HomeEditorialView } from "./HomeEditorialView";
import { ElectronicsEditorialView } from "./ElectronicsEditorialView";
import { useCatalogKitsController } from "../controllers/useCatalogKitsController";
import "./catalog-view.css";
import accessoriesImg from "../../../../assets/catalog/category-heroes/accessories-bystadium.png";
import apparelImg from "../../../../assets/catalog/category-heroes/apparel-bystadium.png";
import bagsImg from "../../../../assets/catalog/category-heroes/bags-bystadium.png";
import drinkwareImg from "../../../../assets/catalog/category-heroes/drinkware-bystadium.png";
import officeImg from "../../../../assets/catalog/category-heroes/office-supplies-bystadium.png";
import technologyImg from "../../../../assets/catalog/category-heroes/technology-bystadium.png";
import kitsImg from "../../../../assets/catalog-style-spotlight/kits.png";
import apparelTShirtImg from "../../../../assets/catalog/category-tiles/apparel/t-shirts.png";
import apparelPoloImg from "../../../../assets/catalog/category-tiles/apparel/polo-shirts.png";
import apparelJacketImg from "../../../../assets/catalog/category-tiles/apparel/jackets.png";
import apparelEditorialHero from "../../../../assets/catalog/apparel-editorial/hero.png";
import apparelHoodieImg from "../../../../assets/catalog/apparel-editorial/hoodie.png";
import apparelCapsImg from "../../../../assets/catalog/apparel-editorial/caps.png";
import apparelOversizedImg from "../../../../assets/catalog/apparel-editorial/oversized.png";
import stationeryHero from "../../../../assets/catalog/stationery-editorial/hero.png";
import stationeryDiaries from "../../../../assets/catalog/stationery-editorial/diaries.png";
import stationeryPens from "../../../../assets/catalog/stationery-editorial/pens.png";
import stationeryCardHolders from "../../../../assets/catalog/stationery-editorial/card-holders.png";
import stationeryIdCards from "../../../../assets/catalog/stationery-editorial/id-cards.png";
import stationeryNotepads from "../../../../assets/catalog/stationery-editorial/notepads.png";
import stationeryOrganisers from "../../../../assets/catalog/stationery-editorial/organisers.png";
import stationeryKeychains from "../../../../assets/catalog/key-chains.webp";
import drinkwareHero from "../../../../assets/catalog/drinkware-editorial/hero.png";
import drinkwareTumblers from "../../../../assets/catalog/drinkware-editorial/tumblers.png";
import drinkwareBottles from "../../../../assets/catalog/drinkware-editorial/bottles.png";
import drinkwareMugs from "../../../../assets/catalog/drinkware-editorial/mugs.png";
import bagsEditorialHero from "../../../../assets/catalog/bags-editorial/hero.png";
import bagsTotes from "../../../../assets/catalog/bags-editorial/totes.png";
import bagsBackpacks from "../../../../assets/catalog/bags-editorial/backpacks.png";
import bagsLaptops from "../../../../assets/catalog/bags-editorial/laptop-bags.png";
import bagsDuffels from "../../../../assets/catalog/bags-editorial/duffels.png";
import bagsMessengers from "../../../../assets/catalog/bags-editorial/messengers.png";
import travelEditorialHero from "../../../../assets/catalog/travel-editorial/hero.png";
import kitchenEditorialHero from "../../../../assets/catalog/kitchen-editorial/hero.png";
import appliancesEditorialHero from "../../../../assets/catalog/home-appliances-editorial/hero.png";
import electronicsEditorialHero from "../../../../assets/catalog/electronics-editorial/hero.png";

const CATEGORY_COPY: Record<string, string> = {
  "Electronics & Gadgets":
    "Useful tech for connected teams and everyday life. Discover smart charging, sound and workspace essentials that make your brand part of the daily routine.",
  "Home Appliances":
    "Practical home appliances for easier everyday living. Discover useful essentials that bring comfort, care and a little more ease to the routines people love.",
  Kitchenware:
    "Thoughtful kitchenware for the everyday moments that matter. From the first coffee to a shared meal, find useful favourites for homes, teams and meaningful gifts.",
  "Travel Accessories":
    "Thoughtful travel accessories for teams on the move. Bring a little comfort to every commute, business trip and new destination.",
  Stationery:
    "Branded stationery for bright ideas and everyday work. From beautiful notebooks to thoughtful desk essentials, make every detail feel like your brand.",
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

const CATEGORY_TILE_IMAGES: Record<string, string> = {
  "T-Shirts": apparelTShirtImg,
  "T-Shirt": apparelTShirtImg,
  "Crew Neck": apparelTShirtImg,
  "Polo Shirts": apparelPoloImg,
  "Polo Shirt": apparelPoloImg,
  Polo: apparelPoloImg,
  Jackets: apparelJacketImg,
  Outerwear: apparelJacketImg,
  "Hoodies & Sweatshirts": apparelHoodieImg,
  Caps: apparelCapsImg,
  "Caps & Headwear": apparelCapsImg,
  Oversized: apparelOversizedImg,
  Diaries: stationeryDiaries,
  "Pens & Pencils": stationeryPens,
  "Card Holders": stationeryCardHolders,
  "ID Cards": stationeryIdCards,
  Notepads: stationeryNotepads,
  "Desk Organisers": stationeryOrganisers,
  Keychains: stationeryKeychains,
  Tumblers: drinkwareTumblers,
  Bottles: drinkwareBottles,
  "Water Bottles": drinkwareBottles,
  Mugs: drinkwareMugs,
  "Tote Bags": bagsTotes,
  Totes: bagsTotes,
  Backpacks: bagsBackpacks,
  "Laptop Bags": bagsLaptops,
  "Duffel Bags": bagsDuffels,
  "Messenger Bags": bagsMessengers,
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
  const { pathname, search } = useLocation();
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
    parentName;
  const collectionName = catalogCollectionName(displayName);

  const currentIndex = Math.max(0, categorySlides.indexOf(displayName));
  const prevCategory =
    categorySlides[(currentIndex - 1 + categorySlides.length) % categorySlides.length] ?? displayName;
  const nextCategory =
    categorySlides[(currentIndex + 1) % categorySlides.length] ?? displayName;
  const heroImage = CATEGORY_IMAGES[displayName] ?? CATEGORY_IMAGES[parentName] ?? apparelImg;
  const heroCopy =
    CATEGORY_COPY[displayName] ??
    CATEGORY_COPY[collectionName] ??
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

  const treeTypes = useMemo(
    () => levels.categories.map((node) => node.name).filter((name) => name && name !== "Others"),
    [levels.categories],
  );
  const typeNames = useMemo(
    () => Array.from(new Set([...treeTypes, ...sidebarCategories])).filter((name) =>
      name !== leafScopeName && name !== catalogCollectionName(leafScopeName)),
    [sidebarCategories, treeTypes, leafScopeName],
  );
  const viewingType = Boolean(activeTag);
  const isTravelOverview = displayName === "Travel Accessories" && !vm.subcategory && new URLSearchParams(search).get("view") !== "products";
  const isKitchenOverview = displayName === "Kitchenware" && !vm.subcategory && new URLSearchParams(search).get("view") !== "products";
  const isAppliancesOverview = displayName === "Home Appliances" && !vm.subcategory && new URLSearchParams(search).get("view") !== "products";
  const isElectronicsOverview = collectionName === "Electronics & Gadgets" && !vm.subcategory && !viewingType && new URLSearchParams(search).get("view") !== "products";
  const viewingProducts = parentName === ALL_PRODUCTS || (!isTravelOverview && !isKitchenOverview && !isAppliancesOverview && !isElectronicsOverview && (viewingType || new URLSearchParams(search).get("view") === "products"));
  /** Parent pages (Apparel, Drinkware) show a photo card per type. A chosen type opens its products. */
  const showTypeCards = !isKitsCategory && !viewingProducts && typeNames.length > 0;
  // A collection hero must not depend on having nested category records.
  const collectionLanding = !viewingProducts && !viewingType;
  const isApparelOverview = collectionName === "Apparel" && collectionLanding;
  const isStationeryOverview = collectionName === "Stationery" && collectionLanding;
  const isDrinkwareOverview = collectionName === "Drinkware" && collectionLanding;
  const isBagsOverview = collectionName === "Bags" && collectionLanding;
  const isEditorialOverview = isApparelOverview || isStationeryOverview || isDrinkwareOverview || isBagsOverview || isTravelOverview || isKitchenOverview || isAppliancesOverview || isElectronicsOverview;
  const hasEditorialHero = isEditorialOverview || isKitsCategory;
  const editorialHero = isElectronicsOverview ? electronicsEditorialHero : isAppliancesOverview ? appliancesEditorialHero : isKitchenOverview ? kitchenEditorialHero : isTravelOverview ? travelEditorialHero : isBagsOverview ? bagsEditorialHero : isDrinkwareOverview ? drinkwareHero : isStationeryOverview ? stationeryHero : apparelEditorialHero;
  const typeCardsBackName =
    levels.focusCategory && levels.focusCategory !== activeTag ? levels.focusCategory : parentName;

  function imageForType(name: string) {
    const editorialImage = CATEGORY_TILE_IMAGES[name];
    if (editorialImage) return editorialImage;

    const match = vm.items.find(
      (item) =>
        (productMatchesLevel(item, "subcategory", name) ||
          productMatchesLevel(item, "category", name)) &&
        productPhotoUrl(item),
    );
    return (
      (match && productPhotoUrl(match)) ||
      CATEGORY_IMAGES[name] ||
      CATEGORY_IMAGES[parentName] ||
      apparelImg
    );
  }

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

  const categoryNavigation = (
    <nav className="sm-catalog-shop__categories" aria-label="Product types">
      <p>{isEditorialOverview ? `Shop ${displayName.toLowerCase()}` : "Product types"}</p>
      <Link to={`${catalogHome}/category/${catalogCategorySlug(leafScopeName)}?view=products`}>{leafScopeName === ALL_PRODUCTS ? ALL_PRODUCTS : `All ${leafScopeName}`}</Link>
      {typeNames.map((name) => (
        <Link key={name} to={`${catalogHome}/category/${catalogCategorySlug(name)}`} aria-current={activeTag === name ? "page" : undefined}>{name}{isEditorialOverview ? <ChevronRight size={14} aria-hidden="true" /> : null}</Link>
      ))}
      <Link to={`${catalogHome}/browse`}>All categories</Link>
    </nav>
  );

  return (
    <div className={`sm-cat-page sm-cat-page--public${!isKitsCategory && viewingProducts ? " sm-cat-page--listing" : ""}${hasEditorialHero ? " sm-editorial-page" : ""}${isStationeryOverview ? " sm-stationery-page" : ""}${isDrinkwareOverview ? " sm-drinkware-page" : ""}${isTravelOverview ? " sm-travel-page" : ""}${isAppliancesOverview ? " sm-home-appliances-page" : ""}${isElectronicsOverview ? " sm-tech-page" : ""}`}>
      <div className="sm-cat-page__container">
        <div className="sm-cat-page__topbar">
          <nav className="sm-cat-page__crumbs" aria-label="Breadcrumb">
            {hasEditorialHero ? <><Link to="/">Home</Link><span aria-hidden="true">/</span></> : null}
            <Link to={`${catalogHome}/browse`}>Catalog</Link>
            <ChevronRight size={14} aria-hidden="true" />
            {viewingType || (crumbCategory && crumbCategory !== parentName) ? (
              <Link to={`${catalogHome}/category/${catalogCategorySlug(parentName)}`}>{parentName}</Link>
            ) : (
              <span>{parentName}</span>
            )}
            {crumbCategory && crumbCategory !== parentName ? (
              <>
                <ChevronRight size={14} aria-hidden="true" />
                {crumbSubcategory ? (
                  <Link to={`${catalogHome}/category/${catalogCategorySlug(crumbCategory)}`}>
                    {crumbCategory}
                  </Link>
                ) : (
                  <span>{crumbCategory}</span>
                )}
              </>
            ) : null}
            {crumbSubcategory ? (
              <>
                <ChevronRight size={14} aria-hidden="true" />
                <span>{crumbSubcategory}</span>
              </>
            ) : null}
          </nav>
          {!isPublicApps && !hasEditorialHero ? (
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

        {viewingProducts ? null : (
        <header className="sm-cat-page__hero">
          <div className="sm-cat-page__hero-copy">
            <p className="sm-cat-page__eyebrow">The best in</p>
            <h1 className="sm-cat-page__title">{displayName}</h1>
            <p className="sm-cat-page__copy">{heroCopy}</p>
            <div className="sm-cat-page__hero-nav">
              <Link className="btn btn-dark" to={`${pathname}?view=products`}>View all {displayName}</Link>
              {categorySlides.length > 1 && !hasEditorialHero ? (
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
            <img src={isEditorialOverview ? editorialHero : heroImage} alt="" fetchPriority={hasEditorialHero ? "high" : "auto"} />
          </div>
        </header>
        )}

        <div className="sm-cat-page__body">
          {isElectronicsOverview ? (
            <ElectronicsEditorialView home={catalogHome} types={(levels.focusCategory ? levels.categories : parentName === displayName ? parentCategories : []).map((node) => node.name)} products={filteredItems} loading={vm.isSkeleton} error={vm.errorMessage} />
          ) : isKitchenOverview || isAppliancesOverview ? (
            <HomeEditorialView home={catalogHome} products={filteredItems} loading={vm.isSkeleton} error={vm.errorMessage} collection={isAppliancesOverview ? "home-appliances" : "kitchenware"} />
          ) : isTravelOverview ? (
            <TravelEditorialView home={catalogHome} products={filteredItems} loading={vm.isSkeleton} error={vm.errorMessage} />
          ) : !isKitsCategory && !showTypeCards ? (
            <CatalogProductListing
              key={pathname + search}
              products={filteredItems}
              title={filterLabel ?? displayName}
              home={catalogHome}
              navigation={categoryNavigation}
              loading={vm.isSkeleton}
              error={vm.errorMessage}
            />
          ) : (
          <div className={showTypeCards ? "sm-catalog-shop" : undefined}>
          {showTypeCards ? <aside className="sm-catalog-shop__sidebar">{categoryNavigation}</aside> : null}
          <div className="sm-cat-page__main">
            {isDrinkwareOverview ? (
              <DrinkwareEditorialGrid names={typeNames} home={catalogHome} imageForType={imageForType} products={filteredItems} loading={vm.isSkeleton} error={vm.errorMessage} />
            ) : isEditorialOverview ? (
              <CatalogEditorialGrid names={typeNames} home={catalogHome} imageForType={imageForType} collection={isBagsOverview ? "bags" : isStationeryOverview ? "stationery" : "apparel"} />
            ) : showTypeCards ? (
              <div className="sm-cat-type-grid">
                {typeNames.map((name) => (
                  <Link
                    key={name}
                    className="sm-cat-type-card"
                    to={`${catalogHome}/category/${catalogCategorySlug(name)}`}
                  >
                    <span className="sm-cat-type-card__media">
                      <img src={imageForType(name)} alt={`${name} category`} />
                    </span>
                    <span className="sm-cat-type-card__label">
                      <span>{name}</span>
                      <ArrowUpRight size={16} strokeWidth={1.8} aria-hidden="true" />
                    </span>
                  </Link>
                ))}
              </div>
            ) : null}
            {showTypeCards || typeNames.length > 0 ? null : tagFilters}
            {showTypeCards ? null : isKitsCategory ? (
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
                      <Link to={`${catalogHome}/browse`} className="sm-cat-page__back">
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
                  <Link
                    to={
                      viewingType
                        ? `${catalogHome}/category/${catalogCategorySlug(typeCardsBackName)}`
                        : catalogHome
                    }
                    className="sm-cat-page__back"
                  >
                    {viewingType ? `Back to ${typeCardsBackName}` : "Back to all categories"}
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
          )}
        </div>
      </div>
    </div>
  );
}
