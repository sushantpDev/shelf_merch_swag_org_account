import { useState, type ReactNode } from "react";
import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { DesignedProductThumb } from "./DesignedProductThumb";
import type { UiCollection, UiProduct } from "@/services/mappers";
import { savedDesignPreview } from "@/features/swag/mockup-bake";

function colorSwatches(p: UiProduct) {
  const hexes: string[] = [];
  if (p.colorHexByName) {
    for (const h of Object.values(p.colorHexByName)) {
      if (h && !hexes.includes(h)) hexes.push(h);
    }
  }
  if (!hexes.length && p.variants) {
    for (const v of p.variants) {
      if (v.colorHex && !hexes.includes(v.colorHex)) hexes.push(v.colorHex);
    }
  }
  if (!hexes.length && p.colors) {
    for (const c of p.colors) if (!hexes.includes(c)) hexes.push(c);
  }
  return hexes.slice(0, 5);
}

/** Horizontal collection card: header + all product cards in a scrollable row. */
export function CollectionInlineCard({
  collection,
  actions,
  subtitle,
  onProductClick,
}: {
  collection: UiCollection;
  actions?: ReactNode;
  subtitle?: string;
  /** Opens product detail when a product card is clicked. */
  onProductClick?: (product: UiProduct, pIdx: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const defaultSub = `${collection.code ? `${collection.code} · ` : ""}${collection.products.length} ${
    collection.products.length === 1 ? "item" : "items"
  }`;

  /* Only show the toggle when there are enough products to warrant it */
  const showToggle = collection.products.length > 3;

  return (
    <article className="swag-col-card card">
      <div className="swag-col-card-head">
        <div className="swag-col-card-info">
          <h3 className="swag-col-card-name">{collection.name}</h3>
          <span className="swag-col-card-sub muted">{subtitle ?? defaultSub}</span>
        </div>
        <div className="swag-col-card-actions">
          {showToggle ? (
            <button
              type="button"
              className="swag-col-view-toggle"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? (
                <>Show less <ChevronUp size={14} /></>
              ) : (
                <>View all <ChevronDown size={14} /></>
              )}
            </button>
          ) : null}
          {actions}
        </div>
      </div>

      <div
        className={
          expanded
            ? "swag-col-card-products swag-col-card-products--grid"
            : "swag-col-card-products"
        }
      >
        {collection.products.map((p, i) => {
          const swatches = colorSwatches(p);
          const preview = savedDesignPreview(p, collection.artworkUrl);
          const body = (
            <>
              <div className="swag-col-pcard-img">
                <DesignedProductThumb
                  product={p}
                  artworkUrl={preview.artworkUrl}
                  preferBakedMockup={preview.preferBakedMockup}
                  hoverSwapViews
                />
              </div>
              <div className="swag-col-pcard-meta">
                {swatches.length > 0 ? (
                  <div className="swag-col-pcard-colors">
                    {swatches.map((hex) => (
                      <span
                        key={hex}
                        className="swag-col-pcard-swatch"
                        style={{ background: hex }}
                      />
                    ))}
                  </div>
                ) : null}
                {p.brand ? <div className="swag-col-pcard-brand">{p.brand}</div> : null}
                <div className="swag-col-pcard-name">{p.nm}</div>
                {p.price ? <div className="swag-col-pcard-price">{p.price}</div> : null}
              </div>
            </>
          );

          if (onProductClick) {
            return (
              <button
                key={`${p.id ?? p.nm}-${i}`}
                type="button"
                className="swag-col-pcard swag-col-pcard--clickable"
                onClick={() => onProductClick(p, i)}
              >
                {body}
              </button>
            );
          }

          return (
            <div key={`${p.id ?? p.nm}-${i}`} className="swag-col-pcard">
              {body}
            </div>
          );
        })}
      </div>
    </article>
  );
}
