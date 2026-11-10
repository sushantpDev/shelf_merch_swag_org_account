import { Link } from "react-router";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import type { UiProduct } from "@/services/mappers";
import { CatalogPrice } from "./CatalogPrice";
import "./product-card.css";

function thumb(p: UiProduct): string | undefined {
  return resolveMediaUrl(p.mockupUrl) || resolveMediaUrl(p.photoUrl) || resolveMediaUrl(p.imgUrl);
}

/** Shared product card for catalog listings, featured rows and related items. */
export function ProductCard({
  product,
  to,
  state,
}: {
  product: UiProduct;
  to?: string;
  state?: { fromCatalog?: string };
}) {
  const src = thumb(product);

  const content = (
    <>
      <div className="img">
        {src ? (
          <img
            src={src}
            alt={product.nm}
            loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        ) : (
          <div
            className="sm-skeleton-img"
            aria-hidden="true"
            style={{ width: "100%", height: "100%" }}
          />
        )}
      </div>
      <div className="meta">
        <div className="catalog-product-card__brand">{product.brand || "\u00a0"}</div>
        <div className="nm">{product.nm}</div>
        <div className="pcard-bottom">
          <div className="catalog-product-card__price"><span>AS LOW AS</span><CatalogPrice price={product.price} basePriceInr={product.basePriceInr} /></div>
          <div className="pcard-min">Min 1</div>
        </div>
      </div>
    </>
  );

  const href = to ?? (product.id ? `/app/catalog/${product.id}` : undefined);
  if (href) {
    return (
      <Link
        to={href}
        state={state}
        className="pcard pcard--editorial catalog-product-card"
        aria-label={`View ${product.nm}`}
        style={{ textDecoration: "none", color: "inherit" }}
      >
        {content}
      </Link>
    );
  }

  return <div className="pcard pcard--editorial catalog-product-card">{content}</div>;
}
