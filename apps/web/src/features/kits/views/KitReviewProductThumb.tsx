import { useMemo, useState, type CSSProperties } from "react";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { ProductThumb } from "@/features/shops/ProductThumb";
import {
  defaultPlacement,
  designImgUrl,
  listPrintAreas,
  type Placement,
} from "@/features/swag/mockup-bake";
import type { UiProduct } from "@/services/mappers";

function placementStyle(pl: Placement, artAspect: number): CSSProperties {
  return {
    position: "absolute",
    left: `${pl.xPct}%`,
    top: `${pl.yPct}%`,
    width: `${pl.wPct}%`,
    height: "auto",
    maxWidth: "none",
    maxHeight: "none",
    aspectRatio: `${1 / Math.max(artAspect, 0.01)}`,
    transform: `translate(-50%, -50%) rotate(${pl.rot || 0}deg)`,
    transformOrigin: "center center",
    objectFit: "contain",
    pointerEvents: "none",
    zIndex: 2,
  };
}

function KitArtworkOverlay({
  src,
  placement,
  product,
}: {
  src: string;
  placement: Placement;
  product: UiProduct;
}) {
  const [artAspect, setArtAspect] = useState(1);
  const resolved = useMemo(
    () => placement ?? defaultPlacement(product, artAspect),
    [placement, product, artAspect],
  );

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      style={placementStyle(resolved, artAspect)}
      onLoad={(e) => {
        const img = e.currentTarget;
        const aspect = (img.naturalHeight || 1) / (img.naturalWidth || 1);
        if (aspect > 0) setArtAspect(aspect);
      }}
    />
  );
}

/**
 * Create-kit review thumbnail — production mask + uploaded logo at the placement
 * from branding. Uses the raw mask (no colour tint) so previews match the
 * branding step without Konva/DPI warnings at small sizes.
 */
export function KitReviewProductThumb({
  product,
  artworkUrl,
  printAreaKey,
  placement,
}: {
  product: UiProduct;
  artworkUrl?: string;
  printAreaKey: string;
  placement?: Placement;
}) {
  if (!listPrintAreas(product).length) {
    return <ProductThumb product={{ ...product, mockupUrl: undefined }} />;
  }

  const mask = resolveMediaUrl(designImgUrl(product, printAreaKey));
  const art = artworkUrl ? resolveMediaUrl(artworkUrl) || artworkUrl : "";

  if (!art || !mask) {
    return <ProductThumb product={product} branded />;
  }

  const resolvedPlacement = placement ?? defaultPlacement(product, 1, printAreaKey);

  return (
    <div
      className="img img-mockup"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#fff",
      }}
    >
      <img
        src={mask}
        alt={product.nm}
        loading="lazy"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block",
        }}
      />
      <KitArtworkOverlay src={art} placement={resolvedPlacement} product={product} />
    </div>
  );
}
