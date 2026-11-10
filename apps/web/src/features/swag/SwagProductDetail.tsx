import { useEffect, useState } from "react";
import { Store } from "lucide-react";
import { ProductInfoTabs } from "@/features/catalog/views/ProductInfoTabs";
import type { UiCollection, UiProduct } from "@/services/mappers";
import {
  collectionProductColorNames,
  defaultWhiteColorIndex,
  getMockupTintHex,
  productColorHex,
} from "./colors";
import { DesignedProductThumb } from "./DesignedProductThumb";
import { listProductViews, savedDesignPreview, type ProductViewKey } from "./mockup-bake";
import { MockupViewGallery } from "./MockupViewGallery";
import { CatalogPrice } from "@/features/catalog/views/CatalogPrice";

export type SwagDesignTarget = { collection: UiCollection; product: UiProduct; pIdx: number };

/** Full-page swag product detail (designed mockup + catalog info + add to shop). */
export function SwagProductDetail({
  target,
  onAddToShop,
}: {
  target: SwagDesignTarget;
  onAddToShop: () => void;
}) {
  const { collection, product } = target;
  const title = product.brand ? `${product.brand} ${product.nm}` : product.nm;
  const names = collectionProductColorNames(collection, product);
  const [sel, setSel] = useState(() => defaultWhiteColorIndex(names));
  // Only tint once the user actually picks a swatch, so the baked white Konva
  // mockup is shown on first paint (matches the storefront product page).
  const [hasUserPickedColor, setHasUserPickedColor] = useState(false);
  const productViews = listProductViews(product);
  const hasMultipleViews = productViews.length > 1;
  const [mockupView, setMockupView] = useState<ProductViewKey>("front");

  // Reset the selection back to the default (White) whenever the product changes.
  useEffect(() => {
    setSel(defaultWhiteColorIndex(names));
    setHasUserPickedColor(false);
    setMockupView("front");
  }, [product.id, collection.id]);

  useEffect(() => {
    if (!productViews.includes(mockupView)) setMockupView("front");
  }, [productViews, mockupView]);

  const selectedName = names[sel];
  const tintHex = getMockupTintHex(
    selectedName ? productColorHex(product, selectedName) : undefined,
    hasUserPickedColor,
  );
  const activeView: ProductViewKey = productViews.includes(mockupView) ? mockupView : "front";
  const preview = savedDesignPreview(product, collection.artworkUrl);

  return (
    <div className="swag-detail-page">
      <div className="swag-detail-modal__top">
        <div className="swag-detail-modal__titles">
          <div className="eyebrow">{collection.name}</div>
          <h1 style={{ fontSize: 22, margin: "4px 0 6px" }}>{title}</h1>
        </div>
        <button type="button" className="btn btn-dark swag-detail-modal__cta" onClick={onAddToShop}>
          <Store size={16} /> Add to shop
        </button>
      </div>

      <div className="swag-detail-modal__grid swag-detail-page__grid">
        <MockupViewGallery
          views={productViews}
          activeView={activeView}
          onChange={setMockupView}
          style={{ minHeight: 420 }}
          mediaStyle={{
            background: "var(--gray-100)",
            borderRadius: "var(--r-sm)",
            aspectRatio: "1 / 1",
            overflow: "hidden",
            minHeight: 0,
            padding: 16,
          }}
          renderThumb={(view) => (
            <DesignedProductThumb
              product={product}
              artworkUrl={preview.artworkUrl}
              preferBakedMockup={preview.preferBakedMockup}
              tintHex={tintHex}
              view={view}
            />
          )}
        >
          <DesignedProductThumb
            product={product}
            artworkUrl={preview.artworkUrl}
            preferBakedMockup={preview.preferBakedMockup}
            tintHex={tintHex}
            view={hasMultipleViews ? activeView : undefined}
            onViewChange={hasMultipleViews ? setMockupView : undefined}
          />
        </MockupViewGallery>

        <div className="swag-detail-modal__side">
          {names.length > 0 && (
            <div className="swag-detail-modal__colors">
              <div className="lbl" style={{ marginBottom: 6 }}>
                Colour variants
              </div>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {names.map((c, i) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    aria-label={c}
                    aria-pressed={sel === i}
                    onClick={() => {
                      setHasUserPickedColor(true);
                      setSel(i);
                    }}
                    className="sw"
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: productColorHex(product, c),
                      outline: sel === i ? "2px solid var(--brand)" : "1px solid var(--line)",
                      outlineOffset: 1,
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          <CatalogPrice
            price={product.price}
            basePriceInr={product.basePriceInr}
            size="detail"
          />

          <ProductInfoTabs product={product} />
        </div>
      </div>
    </div>
  );
}
