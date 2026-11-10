import { useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { UiProduct } from "../model";
import { ProductCard } from "./ProductCard";
import { newestProducts } from "../newestProducts";
import { ALL_PRODUCTS } from "../types";

function amount(product: UiProduct) {
  return product.basePriceInr ?? (Number(product.price.replace(/[^\d.]/g, "")) || 0);
}

function values(product: UiProduct, field: "brand" | "color" | "size" | "material") {
  if (field === "brand") return product.brand ? [product.brand] : [];
  const variants = (product.variants ?? []).map((variant) => variant[field]).filter(Boolean) as string[];
  return Array.from(new Set(field === "color" ? [...(product.colors ?? []), ...variants] : variants));
}

const FACETS = [
  { field: "brand", label: "Brands" },
  { field: "color", label: "Colors" },
  { field: "size", label: "Sizes" },
  { field: "material", label: "Materials" },
] as const;

/** Product controls are based on the current category's real product attributes. */
export function CatalogProductListing({ products, title, home, navigation, loading, error }: {
  products: UiProduct[];
  title: string;
  home: string;
  navigation: ReactNode;
  loading: boolean;
  error: string | null;
}) {
  const { pathname, search: locationSearch } = useLocation();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(() => new URLSearchParams(locationSearch).get("sort") === "newest" ? "newest" : "recommended");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const facets = useMemo(() => FACETS.map((facet) => ({
    ...facet,
    options: Array.from(new Set(products.flatMap((product) => values(product, facet.field))))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
  })), [products]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const items = products.filter((product) => {
      if (query && !`${product.nm} ${product.brand} ${product.description ?? ""}`.toLowerCase().includes(query)) return false;
      if (min !== "" && amount(product) < Number(min)) return false;
      if (max !== "" && amount(product) > Number(max)) return false;
      return FACETS.every(({ field }) => !selected[field]?.length || selected[field].some((value) => values(product, field).includes(value)));
    });
    if (sort === "price-asc") items.sort((a, b) => amount(a) - amount(b));
    if (sort === "price-desc") items.sort((a, b) => amount(b) - amount(a));
    if (sort === "name") items.sort((a, b) => a.nm.localeCompare(b.nm));
    if (sort === "newest") return newestProducts(items);
    return items;
  }, [products, search, min, max, selected, sort]);
  const hasFilters = Boolean(search || min || max || Object.values(selected).some((list) => list.length));

  function clear() {
    setSearch(""); setMin(""); setMax(""); setSelected({});
  }

  return (
    <div className={`sm-catalog-shop${title === ALL_PRODUCTS ? " sm-catalog-shop--all-products" : ""}`}>
      <aside className="sm-catalog-shop__sidebar" aria-label="Product filters">
        <label className="sm-catalog-shop__search">
          <span>Search products</span>
          <span className="sm-catalog-shop__search-field">
            <Search size={15} aria-hidden="true" />
            <input type="search" placeholder={`Search ${title}`} value={search} onChange={(event) => setSearch(event.target.value)} />
          </span>
        </label>
        {navigation}
        <details className="sm-catalog-shop__filter" open>
          <summary>Price range (INR)</summary>
          <div className="sm-catalog-shop__prices">
            <label>Min<input type="number" min="0" placeholder="0" value={min} onChange={(event) => setMin(event.target.value)} /></label>
            <label>Max<input type="number" min="0" placeholder="Any" value={max} onChange={(event) => setMax(event.target.value)} /></label>
          </div>
        </details>
        {facets.filter((facet) => facet.options.length > 0).map(({ field, label, options }) => (
          <details className="sm-catalog-shop__filter" key={field} open={field === "brand"}>
            <summary>{label}</summary>
            <div className="sm-catalog-shop__options">
              {options.map((option) => (
                <label key={option}>
                  <input type="checkbox" checked={selected[field]?.includes(option) ?? false} onChange={(event) => {
                    const checked = event.target.checked;
                    setSelected((previous) => ({ ...previous, [field]: checked
                      ? [...(previous[field] ?? []), option]
                      : (previous[field] ?? []).filter((value) => value !== option) }));
                  }} />
                  {option}
                </label>
              ))}
            </div>
          </details>
        ))}
        {hasFilters ? <button className="sm-catalog-shop__clear" type="button" onClick={clear}>Clear filters</button> : null}
      </aside>
      <section className="sm-catalog-shop__results" aria-label={`${title} products`}>
        <div className="sm-catalog-shop__toolbar">
          <div><h1>{title}</h1><p role="status">{loading ? "Loading products…" : `${filtered.length} ${filtered.length === 1 ? "product" : "products"}`}</p></div>
          <div className="sm-catalog-sort"><span>Sort by</span>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="sm-catalog-sort__trigger" aria-label="Sort by"><SelectValue /></SelectTrigger>
              <SelectContent className="sm-catalog-sort__menu" align="end" sideOffset={6}>
                <SelectItem className="sm-catalog-sort__option" value="recommended">Recommended</SelectItem>
                <SelectItem className="sm-catalog-sort__option" value="newest">Newest arrivals</SelectItem>
                <SelectItem className="sm-catalog-sort__option" value="price-asc">Price: low to high</SelectItem>
                <SelectItem className="sm-catalog-sort__option" value="price-desc">Price: high to low</SelectItem>
                <SelectItem className="sm-catalog-sort__option" value="name">Name: A–Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {error ? <div className="card sm-cat-error" role="alert">{error}</div> : loading ? (
          <div className="sm-cat-grid" aria-busy="true" aria-label="Loading products">
            {Array.from({ length: 6 }, (_, index) => <div className="sm-skeleton-card" key={index}><div className="sm-skeleton-img" /><div className="sm-skeleton-line" /></div>)}
          </div>
        ) : filtered.length ? (
          <div className="sm-cat-grid">
            {filtered.map((product, index) => <ProductCard key={product.id ?? `${product.nm}-${index}`} product={product} to={product.id ? `${home}/${product.id}` : undefined} state={{ fromCatalog: pathname + locationSearch }} />)}
          </div>
        ) : (
          <div className="card empty sm-cat-empty"><h2>No products found</h2><p>Try another product type or adjust your filters.</p>{hasFilters ? <button type="button" onClick={clear}>Clear filters</button> : null}</div>
        )}
      </section>
    </div>
  );
}
