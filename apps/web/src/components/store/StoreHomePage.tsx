import { useMemo, type ReactNode, type RefObject } from "react";
import emptyBagImg from "../../../assets/empty-bag.svg";

type HomeStoreProduct = { category?: string };

/** Two complete rows in the desktop catalog grid. */
export const HOME_RAIL_COUNT = 6;
/** @deprecated use HOME_RAIL_COUNT */
export const HOME_FEATURED_COUNT = HOME_RAIL_COUNT;

function HomeSectionHead({
  title,
  subtitle,
  onViewAll,
}: {
  title: string;
  subtitle: string;
  onViewAll: () => void;
}) {
  return (
    <div className="sf-home-section-head">
      <div className="sf-home-section-copy">
        <h2 className="sf-home-section-title">{title}</h2>
        <p className="sf-home-section-subtitle">{subtitle}</p>
      </div>
      <button type="button" className="sf-home-view-all" onClick={onViewAll}>
        View all <span aria-hidden="true">↗</span>
      </button>
    </div>
  );
}

export function StoreHomePage({
  products,
  recommendedGrid,
  newArrivalsGrid,
  contentRef,
  bannerUrl,
  bannerAlt,
  onViewAllProducts,
  onBrowseCategory,
}: {
  products: HomeStoreProduct[];
  recommendedGrid: ReactNode;
  newArrivalsGrid: ReactNode;
  contentRef?: RefObject<HTMLDivElement | null>;
  bannerUrl?: string;
  bannerAlt?: string;
  onViewAllProducts: () => void;
  onBrowseCategory: (category: string | null) => void;
}) {
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) {
      const category = product.category?.trim() || "Other";
      counts.set(category, (counts.get(category) || 0) + 1);
    }
    return Array.from(counts, ([label, count]) => ({ label, count })).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [products]);

  return (
    <div className="sf-home sf-content sf-home-content" ref={contentRef}>
      {products.length > 0 ? (
        <div className="sf-home-catalog-layout">
          <aside className="sf-home-sidebar" aria-label="Shop by category">
            <div className="sf-catalog-eyebrow">Product types</div>
            <nav className="sf-home-category-nav" aria-label="Product categories">
              <button
                type="button"
                className="sf-home-category-link is-active"
                onClick={onViewAllProducts}
              >
                <span>All products</span>
                <span>{products.length}</span>
              </button>
              {categories.map((category) => (
                <button
                  key={category.label}
                  type="button"
                  className="sf-home-category-link"
                  onClick={() => onBrowseCategory(category.label)}
                >
                  <span>{category.label}</span>
                  <span>{category.count}</span>
                </button>
              ))}
            </nav>
          </aside>

          <main className="sf-home-catalog-main">
            <header className="sf-home-heading">
              <div>
                <div className="sf-catalog-eyebrow">The collection</div>
                <h1>Find your next favorite</h1>
              </div>
              <span className="sf-catalog-result-count">{products.length} products</span>
            </header>

            {bannerUrl ? (
              <section className="sf-home-hero" aria-label="Store banner">
                <div className="sf-home-hero-frame">
                  <img
                    src={bannerUrl}
                    alt={bannerAlt || "Store banner"}
                    className="sf-home-hero-img"
                    loading="eager"
                    decoding="async"
                  />
                </div>
              </section>
            ) : null}

            {recommendedGrid ? (
              <section className="sf-home-rail" aria-label="Recommended for you">
                <HomeSectionHead
                  title="Recommended for you"
                  subtitle="Handpicked based on what your team loves"
                  onViewAll={onViewAllProducts}
                />
                {recommendedGrid}
              </section>
            ) : null}

            {newArrivalsGrid ? (
              <section className="sf-home-rail" aria-label="New arrivals">
                <HomeSectionHead
                  title="New arrivals"
                  subtitle="Be the first to explore our latest additions"
                  onViewAll={onViewAllProducts}
                />
                {newArrivalsGrid}
              </section>
            ) : null}
          </main>
        </div>
      ) : (
        <div className="sf-no-products">
          <img
            src={emptyBagImg}
            alt=""
            className="sf-no-products-icon"
            width={119}
            height={104}
            aria-hidden="true"
          />
          <p className="sf-no-products-title">No products yet</p>
        </div>
      )}
    </div>
  );
}
