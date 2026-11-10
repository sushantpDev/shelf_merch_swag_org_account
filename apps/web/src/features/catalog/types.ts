import { productVariantSwatches } from "@/lib/variantColors";
import type { UiProduct } from "@/services/mappers";

/** Parent Category tabs, matching the legacy catalog filter rail. */
export const CATALOG_CATEGORIES = [
  "All Products",
  "Apparel",
  "Accessories",
  "Food & Beverage",
  "Kits",
] as const;

export const ALL_PRODUCTS = "All Products";
export const KITS_CATEGORY = "Kits";
export const PREDESIGNED_KITS_SUBCATEGORY = "Pre-designed kits";
export const CUSTOMISED_KITS_SUBCATEGORY = "Customised kits";

/**
 * Nested fallback taxonomy: Parent Category → Category → Sub-Category.
 * String children are Categories with no Sub-Categories.
 */
export const CATALOG_TAXONOMY: Record<
  string,
  readonly (string | { name: string; children: readonly string[] })[]
> = {
  Apparel: [
    {
      name: "Apparel",
      children: ["T-Shirts", "Polo Shirts", "Hoodies & Sweatshirts", "Jackets", "Caps", "Others"],
    },
  ],
  Accessories: [
    {
      name: "Stationery",
      children: [
        "Diaries",
        "Pens & Pencils",
        "Card Holders",
        "ID Cards",
        "Notepads",
        "Desk Organisers",
      ],
    },
    { name: "Drinkware", children: ["Mugs", "Tumblers", "Bottles"] },
    { name: "Bags", children: ["Totes", "Laptop Bags", "Backpacks"] },
    "Travel Accessories",
    "Electronics & Gadgets",
    "Others",
  ],
  "Food & Beverage": ["Coffee", "Snacks", "Chocolates"],
  Kits: [PREDESIGNED_KITS_SUBCATEGORY, CUSTOMISED_KITS_SUBCATEGORY],
  // Legacy parent names still used by storefront PLP defaults.
  Bags: ["Backpacks", "Tote Bags", "Laptop Bags", "Duffel Bags", "Messenger Bags", "Others"],
  Drinkware: ["Bottles", "Mugs", "Tumblers", "Flasks", "Sippers", "Others"],
  "Office Supplies": ["Notebooks", "Diaries", "Pens", "Desk Accessories", "Calendars", "Card Holders", "Others"],
  Technology: ["Power Banks", "Wireless Chargers", "Speakers", "Headphones", "USB Drives", "Others"],
};

function taxonomyCategoryNames(
  entries: readonly (string | { name: string; children: readonly string[] })[] | undefined,
): string[] {
  if (!entries) return [];
  return entries.map((entry) => (typeof entry === "string" ? entry : entry.name));
}

/** Flat Parent → Category names (StoreShell / legacy). Derived from CATALOG_TAXONOMY. */
export const CATALOG_SUBCATEGORIES: Record<string, readonly string[]> = Object.fromEntries(
  Object.entries(CATALOG_TAXONOMY).map(([parent, entries]) => [parent, taxonomyCategoryNames(entries)]),
);

/** Legacy Category URL slugs that resolve to a Parent + Category filter. */
const LEGACY_SUBCATEGORY_SLUGS: Record<string, { parent: string; subcategory: string }> = {
  keys: { parent: "Accessories", subcategory: "Key Chains" },
  "key-chains": { parent: "Accessories", subcategory: "Key Chains" },
  "key chains": { parent: "Accessories", subcategory: "Key Chains" },
  cardholders: { parent: "Accessories", subcategory: "Card Holders" },
  "card-holders": { parent: "Accessories", subcategory: "Card Holders" },
  "card holders": { parent: "Accessories", subcategory: "Card Holders" },
  bags: { parent: "Accessories", subcategory: "Bags" },
  "bags & travel": { parent: "Accessories", subcategory: "Bags" },
  "bags-travel": { parent: "Accessories", subcategory: "Bags" },
  drinkware: { parent: "Accessories", subcategory: "Drinkware" },
  technology: { parent: "Accessories", subcategory: "Electronics & Gadgets" },
  office: { parent: "Accessories", subcategory: "Stationery" },
  "office supplies": { parent: "Accessories", subcategory: "Stationery" },
  "office-supplies": { parent: "Accessories", subcategory: "Stationery" },
};

const CATEGORY_ALIASES: Record<string, (typeof CATALOG_CATEGORIES)[number]> = {
  apparel: "Apparel",
  accessories: "Accessories",
  bags: "Accessories",
  "bags & travel": "Accessories",
  "bags-travel": "Accessories",
  drinkware: "Accessories",
  technology: "Accessories",
  office: "Accessories",
  "office supplies": "Accessories",
  "office-supplies": "Accessories",
  "food & beverage": "Food & Beverage",
  "food-beverage": "Food & Beverage",
  "food-and-beverage": "Food & Beverage",
  all: "All Products",
  kits: "Kits",
  keys: "Accessories",
  "key-chains": "Accessories",
  "key chains": "Accessories",
  cardholders: "Accessories",
  "card-holders": "Accessories",
  "card holders": "Accessories",
};

/** Stable URL slug for a catalog category page. */
export function catalogCategorySlug(category: string): string {
  return String(category || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type CatalogCategoryChild = {
  name: string;
  slug: string;
  children?: CatalogCategoryChild[];
};

export type CatalogCategoryNode = {
  name: string;
  slug: string;
  children: CatalogCategoryChild[];
  /** Client-only product scope for a flat public category; never persisted. */
  productScope?: string;
};

/** Existing production collection names use the same editorial designs. */
export function catalogCollectionName(name: string): string {
  const aliases: Record<string, string> = {
    office: "Stationery",
    "office supplies": "Stationery",
    technology: "Electronics & Gadgets",
  };
  return aliases[name.trim().toLowerCase()] ?? name;
}

export function productMatchesCollection(product: UiProduct, name: string): boolean {
  return productMatchesLevel(product, "category", name) ||
    productMatchesLevel(product, "category", catalogCollectionName(name));
}

function buildFallbackChildren(
  entries: readonly (string | { name: string; children: readonly string[] })[],
): CatalogCategoryChild[] {
  return entries.map((entry) => {
    if (typeof entry === "string") {
      return { name: entry, slug: catalogCategorySlug(entry), children: [] };
    }
    return {
      name: entry.name,
      slug: catalogCategorySlug(entry.name),
      children: entry.children.map((leaf) => ({
        name: leaf,
        slug: catalogCategorySlug(leaf),
        children: [],
      })),
    };
  });
}

/** Used when the category API has not been seeded yet. Live browse prefers the API tree. */
export const FALLBACK_CATALOG_NODES: CatalogCategoryNode[] = CATALOG_CATEGORIES.filter(
  (category) => category !== ALL_PRODUCTS,
).map((name) => ({
  name,
  slug: catalogCategorySlug(name),
  children: buildFallbackChildren(CATALOG_TAXONOMY[name] ?? []),
}));

function matchesNameOrSlug(
  entry: { name: string; slug?: string },
  key: string,
  slug: string,
): boolean {
  return (
    entry.name.toLowerCase() === key ||
    entry.slug === slug ||
    catalogCategorySlug(entry.name) === slug
  );
}

/** Map a landing/query category string onto a Parent Category tab. */
export function resolveCatalogCategory(
  raw: string | null | undefined,
  nodes: readonly { name: string; slug: string }[] = FALLBACK_CATALOG_NODES,
): string {
  const key = String(raw || "").trim().toLowerCase();
  if (!key) return ALL_PRODUCTS;
  const slug = catalogCategorySlug(key);
  const list = nodes.length ? nodes : FALLBACK_CATALOG_NODES;
  const exact = list.find((category) => matchesNameOrSlug(category, key, slug));
  if (exact) return exact.name;
  return CATEGORY_ALIASES[key] ?? CATEGORY_ALIASES[slug] ?? ALL_PRODUCTS;
}

/** If the URL slug was a nested Category, return that filter label. */
export function resolveCatalogSubcategory(
  raw: string | null | undefined,
  parentCategory: string,
  options?: readonly string[],
): string | null {
  const key = String(raw || "").trim().toLowerCase();
  if (!key || !parentCategory || parentCategory === ALL_PRODUCTS) return null;

  const slug = catalogCategorySlug(key);
  const legacy = LEGACY_SUBCATEGORY_SLUGS[key] ?? LEGACY_SUBCATEGORY_SLUGS[slug];
  if (legacy && legacy.parent === parentCategory) return legacy.subcategory;

  const list = options ?? CATALOG_SUBCATEGORIES[parentCategory] ?? [];
  const exact = list.find((item) => item.toLowerCase() === key);
  if (exact) return exact;
  return list.find((item) => catalogCategorySlug(item) === slug) ?? null;
}

export type CatalogBrowseTarget = {
  /** Parent Category (product.category). */
  parent: string;
  /** Category under the parent (product.subcategory), if resolved from the URL. */
  category: string | null;
  /** Sub-Category under the category (product.childCategory), if resolved from the URL. */
  subcategory: string | null;
  /**
   * Product fetch key. Always the Parent Category so the page can filter
   * Category / Sub-Category client-side.
   */
  query: string;
};

/**
 * Browse target from a URL slug: match Sub-Category, then Category, then Parent.
 * Fetch query is always the Parent Category (or All Products).
 */
export function resolveCatalogBrowseTarget(
  raw: string | null | undefined,
  nodes: readonly CatalogCategoryNode[] = FALLBACK_CATALOG_NODES,
): CatalogBrowseTarget {
  const key = String(raw || "").trim().toLowerCase();
  const slug = catalogCategorySlug(key);
  const list = nodes.length ? nodes : FALLBACK_CATALOG_NODES;
  const queryFor = (parent: string) => list.find((node) => node.name === parent)?.productScope ? ALL_PRODUCTS : parent;

  if (!key) {
    return {
      parent: ALL_PRODUCTS,
      category: null,
      subcategory: null,
      query: ALL_PRODUCTS,
    };
  }

  // Depth 2: Sub-Category anywhere in the tree.
  for (const parent of list) {
    for (const category of parent.children) {
      for (const leaf of category.children ?? []) {
        if (matchesNameOrSlug(leaf, key, slug)) {
          return {
            parent: parent.name,
            category: category.name,
            subcategory: leaf.name,
            query: queryFor(parent.name),
          };
        }
      }
    }
  }

  // Depth 1: Category under a Parent.
  for (const parent of list) {
    const child = parent.children.find((entry) => matchesNameOrSlug(entry, key, slug));
    if (child) {
      return {
        parent: parent.name,
        category: child.name,
        subcategory: null,
        query: queryFor(parent.name),
      };
    }
  }

  // Real roots take priority over old Accessories aliases. Presentation aliases
  // also keep older Stationery/Electronics links working with Office/Technology.
  const root = list.find((node) => matchesNameOrSlug(node, key, slug)) ??
    list.find((node) => catalogCategorySlug(catalogCollectionName(node.name)) === slug);
  if (root) {
    return { parent: root.name, category: null, subcategory: null, query: queryFor(root.name) };
  }

  // Legacy aliases (bags → Accessories / Bags).
  const legacy = LEGACY_SUBCATEGORY_SLUGS[key] ?? LEGACY_SUBCATEGORY_SLUGS[slug];
  if (legacy) {
    return {
      parent: legacy.parent,
      category: legacy.subcategory,
      subcategory: null,
      query: legacy.parent,
    };
  }

  const parent = resolveCatalogCategory(raw, list);
  if (parent === ALL_PRODUCTS) {
    return {
      parent: ALL_PRODUCTS,
      category: null,
      subcategory: null,
      query: ALL_PRODUCTS,
    };
  }

  const options =
    list.find((node) => node.name === parent)?.children.map((child) => child.name) ??
    CATALOG_SUBCATEGORIES[parent] ??
    [];
  const category = resolveCatalogSubcategory(raw, parent, options);
  return {
    parent,
    category,
    subcategory: null,
    query: parent,
  };
}

/**
 * Landing style tiles from the wizard taxonomy:
 * Apparel stays a Parent Category; every other root expands to its Categories.
 */
export function buildStyleTaxonomyTiles(
  nodes: readonly CatalogCategoryNode[],
): { label: string; browseKey: string; parentCategory: string }[] {
  const list = nodes.length ? nodes : FALLBACK_CATALOG_NODES;
  const tiles: { label: string; browseKey: string; parentCategory: string }[] = [];

  for (const node of list) {
    if (node.name === "Apparel") {
      tiles.push({ label: "Apparel", browseKey: "Apparel", parentCategory: "Apparel" });
      continue;
    }
    for (const child of node.children) {
      if (child.name === "Others") continue;
      tiles.push({
        label: child.name,
        browseKey: child.name,
        parentCategory: node.name,
      });
    }
  }

  return tiles;
}

/** Match a product to a Category (product.subcategory) or legacy category string. */
export function productMatchesSubcategory(product: UiProduct, subcategory: string): boolean {
  return productMatchesLevel(product, "category", subcategory);
}

/**
 * Match a product against a taxonomy level.
 * Primary path fields still apply; `categoryLabels` covers extra placements.
 * - parent → product.category
 * - category → product.subcategory (or legacy category / childCategory)
 * - subcategory → product.childCategory (or legacy subcategory)
 */
export function productMatchesLevel(
  product: UiProduct,
  level: "parent" | "category" | "subcategory",
  name: string,
): boolean {
  const target = String(name || "").trim().toLowerCase();
  if (!target) return true;

  const labels = (product.categoryLabels ?? [])
    .map((label) => String(label || "").trim().toLowerCase())
    .filter(Boolean);
  if (labels.includes(target)) return true;

  const parent = String(product.category || "").trim().toLowerCase();
  const category = String(product.subcategory || "").trim().toLowerCase();
  const subcategory = String(product.childCategory || "").trim().toLowerCase();

  if (level === "parent") return parent === target;
  if (level === "category") {
    return category === target || parent === target || subcategory === target;
  }
  return subcategory === target || category === target;
}

/** Best display photo for a catalog product. */
export function productPhotoUrl(product: UiProduct): string | undefined {
  return product.photoUrl || product.imageUrls?.[0] || product.imgUrl || undefined;
}

/**
 * Style-carousel tile image: prefer a product in the Category / Sub-Category,
 * otherwise fall back to a product in the Parent Category.
 */
export function pickStyleTileImage(
  products: readonly UiProduct[],
  browseKey: string,
  fallback: string,
  nodes: readonly CatalogCategoryNode[] = FALLBACK_CATALOG_NODES,
): string {
  const { parent, category, subcategory } = resolveCatalogBrowseTarget(browseKey, nodes);
  const withPhoto = (product: UiProduct) => Boolean(productPhotoUrl(product));

  if (subcategory) {
    const byLeaf = products.find(
      (product) => productMatchesLevel(product, "subcategory", subcategory) && withPhoto(product),
    );
    const leafUrl = byLeaf ? productPhotoUrl(byLeaf) : undefined;
    if (leafUrl) return leafUrl;
  }

  if (category) {
    const byCat = products.find(
      (product) => productMatchesLevel(product, "category", category) && withPhoto(product),
    );
    const catUrl = byCat ? productPhotoUrl(byCat) : undefined;
    if (catUrl) return catUrl;
  }

  const byParent = products.find((product) => {
    if (productMatchesLevel(product, "parent", parent) && withPhoto(product)) return true;
    return false;
  });
  return (byParent && productPhotoUrl(byParent)) || fallback;
}

/** Parse a "Label: value" newline block into rows (key features / size guide). */
export function detailRows(value: string | undefined): [string, string][] {
  return String(value || "")
    .split("\n")
    .map((line): [string, string] => {
      const split = line.indexOf(":");
      return split > 0
        ? [line.slice(0, split).trim(), line.slice(split + 1).trim()]
        : [line.trim(), ""];
    })
    .filter(([label, val]) => label || val);
}

/** Catalog product display id (last 8 of the id, or a padded index fallback). */
export function productUniqueId(p: UiProduct, index: number): string {
  return p.id ? String(p.id).slice(-8).toUpperCase() : String(index + 1).padStart(8, "0");
}

/** Resolve display swatches: color name → hex (falls back to the name itself). */
export function productSwatches(p: UiProduct): { name: string; hex: string }[] {
  return productVariantSwatches(p);
}
