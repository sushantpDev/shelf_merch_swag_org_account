import { Link, useLocation } from "react-router";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";
import { useCatalogProductHead } from "@/seo/useCatalogProductHead";
import { LoadingState } from "@/components/LoadingState";
import type { CatalogProductVm } from "../controllers/useCatalogProductController";
import { ProductDetail } from "./ProductDetail";
import { ProductCard } from "./ProductCard";
import "./catalog-product-detail.css";

/** Catalog product detail page: loading/error/not-found states + product detail. */
export function CatalogProductView(vm: CatalogProductVm) {
  const location = useLocation();
  const { pathname } = location;
  const catalogHome = pathname.startsWith("/apps/catalog") ? "/apps/catalog" : "/app/catalog";
  const catalogProduct = /^\/(?:apps|app)\/catalog\/(?!category(?:\/|$))[^/]+/.test(pathname);
  const headMode = pathname.startsWith("/apps/catalog/") && catalogProduct
    ? "public"
    : catalogProduct
      ? "title"
      : "off";
  useCatalogProductHead(
    vm.product?.id && vm.product.nm
      ? {
          id: vm.product.id,
          name: vm.product.nm,
          description: vm.product.description,
          brand: vm.product.brand,
          category: vm.product.category,
          image: vm.product.photoUrl || vm.product.imageUrls?.[0] || "",
        }
      : null,
    headMode,
  );
  const backTarget =
    typeof location.state === "object" &&
    location.state &&
    "fromCatalog" in location.state &&
    typeof location.state.fromCatalog === "string"
      ? location.state.fromCatalog
      : `${catalogHome}/browse`;

  if (vm.isLoading) {
    return <LoadingState message="Loading product…" fullScreen={false} />;
  }

  if (vm.errorMessage) {
    return (
      <div className="card" style={{ padding: 16, color: "var(--danger)" }}>
        {vm.errorMessage}
      </div>
    );
  }

  if (!vm.product) {
    return (
      <div className="card empty" style={{ padding: 48 }}>
        <h3>Product not found</h3>
        <p>This product may have been removed from the catalog.</p>
        <Link to={`${catalogHome}/browse`} className="btn btn-soft" style={{ marginTop: 14 }}>
          Back to catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="catalog-pdp-page">
      <Link to={backTarget} className="catalog-pdp-back-link">
        <ArrowLeft size={15} /> Back to catalog
      </Link>

      <div className="catalog-pdp-card">
        <ProductDetail product={vm.product} index={vm.index} />
      </div>

      <ProductRecommendations
        items={vm.suggestions}
        catalogHome={catalogHome}
        backTarget={backTarget}
      />
    </div>
  );
}

function ProductRecommendations({
  items,
  catalogHome,
  backTarget,
}: {
  items: CatalogProductVm["suggestions"];
  catalogHome: string;
  backTarget: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  if (!items.length) return null;

  const scroll = (dir: "left" | "right") => {
    const el = trackRef.current;
    if (!el) return;
    const amount = Math.max(280, el.clientWidth * 0.75);
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <section className="catalog-pdp-recs" aria-labelledby="catalog-pdp-recs-title">
      <div className="catalog-pdp-recs__inner">
        <div className="catalog-pdp-recs__head">
          <h2 id="catalog-pdp-recs-title">SIMILAR ITEMS</h2>
          <div className="catalog-pdp-recs__nav">
            <button type="button" aria-label="Scroll left" onClick={() => scroll("left")}>
              <ChevronLeft size={18} />
            </button>
            <button type="button" aria-label="Scroll right" onClick={() => scroll("right")}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="catalog-pdp-recs__track" ref={trackRef}>
          {items.map((item) => (
            <ProductCard
              key={item.id}
              product={item}
              to={`${catalogHome}/${item.id}`}
              state={{ fromCatalog: backTarget }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
