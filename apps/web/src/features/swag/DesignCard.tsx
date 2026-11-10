import { type KeyboardEvent, type MouseEvent } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { UiCollection, UiProduct } from "@/services/mappers";
import { collectionProductColorNames, productColorHex } from "./colors";
import { DesignedProductThumb } from "./DesignedProductThumb";

function PriceLine({ price }: { price: string }) {
  const match = price.match(/^as low as\s+(.+)$/i);
  if (match) {
    return (
      <div className="swag-design-card-price">
        <span className="mut3">As low as </span>
        <strong>{match[1]}</strong>
      </div>
    );
  }
  return (
    <div className="swag-design-card-price">
      <strong>{price}</strong>
    </div>
  );
}

function stop(e: MouseEvent | KeyboardEvent) {
  e.stopPropagation();
}

function CardToolbar({
  onEditDesign,
  onViewProduct,
  onAddToShop,
  canEdit = true,
  canAddToShop = true,
}: {
  onEditDesign?: () => void;
  onViewProduct?: () => void;
  onAddToShop?: () => void;
  canEdit?: boolean;
  canAddToShop?: boolean;
}) {
  const showMenu = canEdit || canAddToShop;
  if (!showMenu) return null;

  return (
    <div className="swag-card-actions" onClick={stop} onKeyDown={stop}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="swag-card-menu"
            aria-label="Product actions"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom" className="shop-card-menu">
          {canEdit ? (
            <DropdownMenuItem onSelect={() => onEditDesign?.()}>
              <span>Edit design</span>
              <span className="tag tag-beta">Beta</span>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => onViewProduct?.()}>View product</DropdownMenuItem>
          {canAddToShop ? (
            <DropdownMenuItem onSelect={() => onAddToShop?.()}>Add to shop</DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** A single branded design within a collection. */
export function DesignCard({
  collection,
  product,
  onOpen,
  productView = false,
  showToolbar = false,
  canEdit = true,
  canAddToShop = true,
  onEditDesign,
  onViewProduct,
  onAddToShop,
}: {
  collection: UiCollection;
  product: UiProduct;
  onOpen: () => void;
  productView?: boolean;
  showToolbar?: boolean;
  canEdit?: boolean;
  canAddToShop?: boolean;
  onEditDesign?: () => void;
  onViewProduct?: () => void;
  onAddToShop?: () => void;
}) {
  const names = collectionProductColorNames(collection, product);
  const swatches = names.slice(0, 4);
  const more = names.length - swatches.length;

  const meta = (
    <>
      {(swatches.length > 0 || more > 0) && (
        <div className="swatches">
          {swatches.map((c) => (
            <span
              key={c}
              className="sw"
              style={{ background: productColorHex(product, c) }}
              title={c}
            />
          ))}
          {more > 0 && (
            <span className="mut3" style={{ fontSize: "var(--workspace-font-caption, 10px)", alignSelf: "center" }}>
              +{more}
            </span>
          )}
        </div>
      )}
      {product.brand && <div className="brand">{product.brand}</div>}
      <div className="nm">{product.nm}</div>
      {productView && product.price ? <PriceLine price={product.price} /> : null}
    </>
  );

  if (!productView) {
    if (showToolbar) {
      return (
        <article className="pcard swag-design-card">
          <div
            className="swag-design-card-hit"
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen();
              }
            }}
            aria-label={`View ${product.nm} design`}
          >
            <DesignedProductThumb product={product} artworkUrl={collection.artworkUrl} />
            <CardToolbar
              onEditDesign={onEditDesign}
              onViewProduct={onViewProduct}
              onAddToShop={onAddToShop}
              canEdit={canEdit}
              canAddToShop={canAddToShop}
            />
          </div>
          <div
            className="meta swag-design-card-meta-hit"
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen();
              }
            }}
          >
            {meta}
          </div>
        </article>
      );
    }

    return (
      <button
        type="button"
        className="pcard swag-design-card"
        style={{ textAlign: "left" }}
        onClick={onOpen}
        aria-label={`View ${product.nm} design`}
      >
        <DesignedProductThumb product={product} artworkUrl={collection.artworkUrl} />
        <div className="meta">{meta}</div>
      </button>
    );
  }

  return (
    <article className="pcard swag-design-card swag-design-card--product-view">
      <div
        className="swag-design-card-hit"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        aria-label={`View ${product.nm} design`}
      >
        <DesignedProductThumb product={product} artworkUrl={collection.artworkUrl} />
        <CardToolbar
          onEditDesign={onEditDesign}
          onViewProduct={onViewProduct}
          onAddToShop={onAddToShop}
          canEdit={canEdit}
          canAddToShop={canAddToShop}
        />
      </div>
      <div
        className="meta swag-design-card-meta-hit"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
      >
        {meta}
      </div>
    </article>
  );
}
