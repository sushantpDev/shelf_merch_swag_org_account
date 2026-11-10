import { useMemo, useState } from "react";
import type { UiProduct } from "@/services/mappers";
import { ProductThumb } from "@/features/shops/ProductThumb";
import { useCatalogCategoryTree } from "@/features/catalog/model";
import {
  ALL_PRODUCTS,
  FALLBACK_CATALOG_NODES,
  productMatchesLevel,
  resolveCatalogBrowseTarget,
  type CatalogCategoryChild,
  type CatalogCategoryNode,
} from "@/features/catalog/types";
import { productColorHex, productColorNames } from "../colors";

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

/** Same tab set as CatalogView style carousel: Accessories expands to Categories. */
function buildStyleCategoryTabs(nodes: readonly CatalogCategoryNode[]): string[] {
  const tabs: string[] = [ALL_PRODUCTS];

  for (const node of nodes) {
    if (node.name === "Accessories") {
      for (const child of node.children) {
        if (child.name === "Others") continue;
        tabs.push(child.name);
      }
      continue;
    }
    tabs.push(node.name);
  }

  return tabs;
}

function matchesCatalogCategoryTab(
  tab: string,
  product: UiProduct,
  nodes: readonly CatalogCategoryNode[],
): boolean {
  if (tab === ALL_PRODUCTS) return true;

  const { parent, category, subcategory } = resolveCatalogBrowseTarget(tab, nodes);
  if (subcategory) return productMatchesLevel(product, "subcategory", subcategory);
  if (category) return productMatchesLevel(product, "category", category);
  if (parent !== ALL_PRODUCTS) return productMatchesLevel(product, "parent", parent);
  return true;
}

export function CatalogStep({
  catalog,
  picked,
  onToggle,
  title = "Add products to your collection",
  subtitle,
}: {
  catalog: UiProduct[];
  picked: number[];
  onToggle: (index: number) => void;
  title?: string;
  subtitle?: string;
}) {
  const categoryTree = useCatalogCategoryTree();
  const categoryNodes = useMemo(() => {
    const remote = categoryTree.data;
    if (remote && remote.length) {
      return remote.map((node) => ({
        name: node.name,
        slug: node.slug,
        children: mapPublicChildren(node.children),
      }));
    }
    return FALLBACK_CATALOG_NODES;
  }, [categoryTree.data]);

  const cats = useMemo(() => buildStyleCategoryTabs(categoryNodes), [categoryNodes]);
  const [cat, setCat] = useState(ALL_PRODUCTS);
  const activeCat = cats.includes(cat) ? cat : ALL_PRODUCTS;

  const entries = catalog
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => matchesCatalogCategoryTab(activeCat, p, categoryNodes));

  return (
    <>
      <h1
        style={{
          fontSize: 24,
          marginBottom: 6,
          fontFamily: "var(--font-family-primary)",
          letterSpacing: "-.02em",
        }}
      >
        {title}
      </h1>
      <p className="muted" style={{ marginBottom: 20, fontSize: 14 }}>
        {subtitle ??
          `${catalog.length} products total · Pick the items you want to brand and add to your collection.`}
      </p>

      <div
        className="tabs"
        style={{ marginBottom: 22 }}
        role="tablist"
        aria-label="Product categories"
      >
        {cats.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={activeCat === c}
            className={activeCat === c ? "on" : ""}
            onClick={() => setCat(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {catalog.length === 0 ? (
        <div className="card empty" style={{ padding: 48 }}>
          <h3>No catalog products yet</h3>
          <p className="muted" style={{ marginTop: 6 }}>
            Publish products in the catalog first, then return here to pick items for your collection.
          </p>
        </div>
      ) : entries.length === 0 ? (
        <div className="card empty" style={{ padding: 48 }}>
          <h3>No products in this category</h3>
          <p className="muted" style={{ marginTop: 6 }}>
            Try selecting a different tab.
          </p>
        </div>
      ) : (
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))",
            gap: 20,
            paddingBottom: 20,
          }}
        >
          {entries.map(({ p, i }) => {
            const on = picked.includes(i);
            const swatches = productColorNames(p).slice(0, 6);
            const sizes = [
              ...new Set(
                (p.variants ?? [])
                  .map((variant) => variant.size?.trim())
                  .filter((size): size is string => Boolean(size)),
              ),
            ];
            return (
              <button
                key={p.id ?? `${p.nm}-${i}`}
                type="button"
                className="pcard"
                style={{
                  textAlign: "left",
                  ...(on
                    ? { borderColor: "var(--brand)", boxShadow: "0 0 0 2px var(--brand-50)" }
                    : {}),
                }}
                aria-pressed={on}
                onClick={() => onToggle(i)}
              >
                <div style={{ position: "relative" }}>
                  <ProductThumb product={p} />
                  <div
                    className="sw-pick-badge"
                    style={{
                      background: on ? "var(--brand)" : "#fff",
                      color: on ? "#fff" : "var(--brand)",
                    }}
                  >
                    {on ? "✓" : "+"}
                  </div>
                </div>
                <div className="meta">
                  {p.brand && <div className="brand">{p.brand}</div>}
                  <div className="nm" style={{ fontWeight: "var(--font-weight-semibold)", fontSize: "var(--workspace-font-body, 14px)", marginTop: 4 }}>
                    {p.nm}
                  </div>
                  <div className="pr" style={{ fontWeight: "var(--font-weight-bold)", marginTop: 8 }}>
                    {p.price}
                  </div>
                  {swatches.length > 0 && (
                    <div className="swatches" style={{ marginTop: 10, gap: 6 }}>
                      {swatches.map((c) => (
                        <span
                          key={c}
                          className="sw"
                          style={{ background: productColorHex(p, c) }}
                          title={c}
                        />
                      ))}
                    </div>
                  )}
                  {sizes.length > 0 && (
                    <div
                      style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 10, fontSize: 11 }}
                    >
                      <span className="muted">Sizes:</span>
                      {sizes.map((size) => (
                        <span
                          key={size}
                          style={{ padding: "2px 6px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--surface-2)", fontWeight: 600 }}
                        >
                          {size}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
