import { useMemo } from "react";
import { ArrowUpRight } from "lucide-react";
import { Link, useLocation } from "react-router";
import type { UiProduct } from "../model";
import { productMatchesLevel, productPhotoUrl } from "../types";
import { catalogHomePath } from "./CatalogBrowseView";
import { ProductCard } from "./ProductCard";
import "./featured-catalog-products.css";

/** Show a cross-section of the live catalog, without repeating products. */
export function selectFeaturedProducts(products: readonly UiProduct[]) {
  const excludedIds = new Set([
    "6a82b7e5a03ad62bdb7f3c23", // Pen packaging
    "6ac49be66f87655fa994cfb0", // Vacuum cleaner
    "6abb6a21d602f72fd2df9100", // Neck and shoulder massager
  ]);
  const available = products.filter((product) => product.id &&
    !excludedIds.has(product.id) && (product.mockupUrl || productPhotoUrl(product)));
  const selected: UiProduct[] = [];
  const ids = new Set<string>();
  const add = (product: UiProduct | undefined) => {
    if (product?.id && !ids.has(product.id) && selected.length < 5) {
      selected.push(product); ids.add(product.id);
    }
  };
  for (const category of ["Apparel", "Drinkware", "Stationery"]) {
    // Prefer the live Glimmer Diary for the stationery slot.
    const preferred = category === "Stationery"
      ? available.find((product) => product.id === "6a69a2b128d51c137c8e964b" && productMatchesLevel(product, "category", category))
      : undefined;
    add(preferred ?? available.find((product) => !ids.has(product.id!) && productMatchesLevel(product, "category", category)));
  }
  // Compact names and upright product photos keep the featured row balanced.
  for (const id of ["6a8c3ff29d19e345e7c3f5a2", "6a69a2a228d51c137c8e962b"]) {
    add(available.find((product) => product.id === id));
  }
  for (const category of ["Electronics & Gadgets", "Bags"]) {
    add(available.find((product) => !ids.has(product.id!) && productMatchesLevel(product, "category", category)));
  }
  available.forEach(add);
  return selected;
}

export function FeaturedCatalogProducts({ products, loading = false, error = null }: {
  products: readonly UiProduct[];
  loading?: boolean;
  error?: string | null;
}) {
  const { pathname, search } = useLocation();
  const home = catalogHomePath(pathname);
  const featured = useMemo(() => selectFeaturedProducts(products), [products]);
  return (
    <section className="sm-featured-products" aria-labelledby="sm-featured-products-title">
      <div className="sm-ref-container">
        <h2 id="sm-featured-products-title">Discover our products,{" "}<em className="sm-catalog-heading-accent">made for your brand.</em></h2>
        <p className="sm-featured-products__intro">Explore apparel, drinkware, bags and everyday essentials for home, work and travel. Find the right products for your team, clients and events, then make them your own.</p>
        {featured.length ? (
          <div className="sm-featured-products__grid">
            {featured.map((product) => <div className="sm-featured-products__item" key={product.id}>
              <ProductCard product={product} to={`${home}/${product.id}`} state={{ fromCatalog: pathname + search }} />
            </div>)}
          </div>
        ) : loading ? (
          <div className="sm-featured-products__grid" aria-busy="true" aria-label="Loading catalog products">
            {Array.from({ length: 5 }, (_, index) => <div className="sm-skeleton-card" key={index}><div className="sm-skeleton-img" /><div className="sm-skeleton-line" /></div>)}
          </div>
        ) : <p role={error ? "alert" : "status"}>{error || "No products available yet."}</p>}
        <div className="sm-featured-products__footer">
          <Link to={`${home}/category/all-products`}>Browse all products<ArrowUpRight size={15} aria-hidden="true" /></Link>
        </div>
      </div>
    </section>
  );
}
