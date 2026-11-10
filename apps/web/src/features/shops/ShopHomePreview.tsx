import { useMemo, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "@/hooks/useWorkspace";
import { refreshCatalogProducts } from "@/services/api-bridge";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { formatStoreCardPrice, type ShopCurrencyMode } from "@/lib/storeCurrency";
import { ShelfMerchLogo } from "@/components/brand/ShelfMerchLogo";
import type { UiProduct } from "@/services/mappers";

export type FeaturedPreviewProduct = {
  id: string;
  name: string;
  brand?: string;
  basePriceInr: number;
  imageUrl: string;
  category?: string;
};

export function toFeaturedPreviewProduct(
  p: UiProduct | FeaturedPreviewProduct,
): FeaturedPreviewProduct {
  if ("nm" in p) {
    const imageUrl =
      resolveMediaUrl(p.mockupUrl) ||
      resolveMediaUrl(p.photoUrl) ||
      resolveMediaUrl(p.imgUrl) ||
      resolveMediaUrl(p.imageUrls?.[0]) ||
      resolveMediaUrl(p.baseImageUrl) ||
      "";
    return {
      id: p.id || p.g || String(Math.random()),
      name: p.nm,
      brand: p.brand || "",
      basePriceInr: p.basePriceInr ?? 0,
      imageUrl,
      category: p.category || "",
    };
  }
  return p;
}

/**
 * Non-interactive storefront home preview for the create-shop builder.
 * Renders topbar → banner (children) → Featured Products → footer.
 */
export function ShopHomePreview({
  shopName,
  logoUrl,
  currency,
  banner,
  products: productsProp,
  isLoading: isLoadingProp,
}: {
  shopName: string;
  logoUrl?: string;
  currency: string;
  banner: ReactNode;
  products?: Array<UiProduct | FeaturedPreviewProduct>;
  isLoading?: boolean;
}) {
  const { data: workspace } = useWorkspace();
  const workspaceCatalog = workspace?.catalogProducts ?? [];
  const { data: catalogResult, isLoading: catalogLoading } = useQuery({
    queryKey: ["catalog", "all"],
    queryFn: () => refreshCatalogProducts(),
    staleTime: 30_000,
    enabled: productsProp === undefined && (!workspaceCatalog || workspaceCatalog.length === 0),
    placeholderData: workspace
      ? { items: workspaceCatalog, total: workspace.catalogTotal ?? workspaceCatalog.length }
      : undefined,
  });

  const rawProducts = productsProp ?? (catalogResult?.items ?? workspaceCatalog).slice(0, 5);
  const isLoading = isLoadingProp ?? (catalogLoading && rawProducts.length === 0);

  const previewItems = useMemo(
    () => rawProducts.map(toFeaturedPreviewProduct),
    [rawProducts],
  );

  const mode: ShopCurrencyMode = currency === "INR" ? "inr" : "points";
  const name = shopName.trim() || "Your shop name";
  const priceLabel = (inr: number) => formatStoreCardPrice(inr, mode);

  return (
    <div className="shop-builder-home-preview">
      <div className="shop-builder-preview-topbar" aria-hidden="true">
        <div className="shop-builder-preview-topbar-inner">
          <div className="shop-builder-preview-brand">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="shop-builder-preview-logo" />
            ) : null}
            <span className="shop-builder-preview-shop-name">{name}</span>
          </div>
          <span className="shop-builder-preview-vrule" />
          <div className="shop-builder-preview-powered">
            <span>Powered by</span>
            <ShelfMerchLogo height={18} />
          </div>
          <div className="shop-builder-preview-search">Search all products</div>
          <div className="shop-builder-preview-account">
            <span className="shop-builder-preview-avatar">PR</span>
            <span className="shop-builder-preview-account-copy">
              <span className="shop-builder-preview-account-name">Preview</span>
              <span className="shop-builder-preview-account-sub">{name.toLowerCase()}</span>
            </span>
          </div>
        </div>
      </div>

      {banner}

      <div className="sf-content shop-builder-preview-catalog">
        <div className="sf-section-header sf-section-header--stadium">
          <h2 className="sf-section-title sf-section-title--stadium">Featured Products</h2>
          <span className="sf-view-all">
            View all <ArrowRight size={14} />
          </span>
        </div>
        <div className="sf-product-grid sf-product-grid--stadium">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="sf-pcard sf-pcard--stadium" aria-hidden="true">
                <div className="sf-pcard-media">
                  <div
                    className="sf-pcard-img sf-pcard-img--stadium sm-skeleton-img"
                    style={{ minHeight: 180 }}
                  />
                </div>
                <div className="sf-pcard-meta sf-pcard-meta--stadium" style={{ padding: "8px 0" }}>
                  <div className="sm-skeleton-line" style={{ margin: "4px 0", width: "40%" }} />
                  <div className="sm-skeleton-line" style={{ margin: "4px 0", width: "80%" }} />
                  <div className="sm-skeleton-line short" style={{ margin: "4px 0" }} />
                </div>
              </div>
            ))
          ) : previewItems.length > 0 ? (
            previewItems.map((p) => (
              <PreviewProductCard key={p.id} product={p} shopName={name} price={priceLabel(p.basePriceInr)} />
            ))
          ) : (
            <p className="muted" style={{ padding: "16px 0", gridColumn: "1 / -1" }}>
              No featured products available.
            </p>
          )}
        </div>
      </div>

      <div className="sf-footer">
        <div className="sf-footer-inner">
          <span className="sf-footer-powered">Powered by</span>
          <ShelfMerchLogo height={20} className="sf-footer-logo" />
          <span className="sf-footer-note"> · Recipients redeem from a private invite link.</span>
        </div>
      </div>
    </div>
  );
}

function PreviewProductCard({
  product,
  shopName,
  price,
}: {
  product: FeaturedPreviewProduct;
  shopName: string;
  price: string;
}) {
  return (
    <article className="sf-pcard sf-pcard--stadium">
      <div className="sf-pcard-media">
        <div className="sf-pcard-img sf-pcard-img--stadium">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} loading="lazy" decoding="async" />
          ) : (
            <div
              className="sm-skeleton-img"
              aria-hidden="true"
              style={{ width: "100%", height: "100%" }}
            />
          )}
        </div>
      </div>
      <div className="sf-pcard-meta sf-pcard-meta--stadium">
        <div className="sf-pcard-text">
          <div className="sf-pcard-brand">{(product.brand || shopName).toUpperCase()}</div>
          <div className="sf-pcard-name">{product.name}</div>
          <div className="sf-pcard-price">{price}</div>
        </div>
      </div>
    </article>
  );
}
