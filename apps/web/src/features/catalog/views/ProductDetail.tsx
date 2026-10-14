import { useEffect, useMemo, useState } from "react";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import type { UiProduct } from "@/services/mappers";
import { productSwatches } from "../types";
import { CatalogPrice } from "./CatalogPrice";
import { ProductInfoTabs } from "./ProductInfoTabs";

type GalleryItem = { key: string; label: string; url: string };

function defaultColorIndex(swatches: { name: string }[]): number {
  const whiteIdx = swatches.findIndex((c) => c.name.toLowerCase().trim() === "white");
  return whiteIdx >= 0 ? whiteIdx : 0;
}

function distinctSizes(
  variants: UiProduct["variants"],
  colorName?: string,
): string[] {
  if (!variants?.length) return [];
  const seen = new Set<string>();
  const sizes: string[] = [];
  for (const v of variants) {
    const size = v.size?.trim();
    if (!size) continue;
    if (colorName) {
      const vColor = (v.color || "").trim().toLowerCase();
      if (vColor && vColor !== colorName.toLowerCase()) continue;
    }
    if (seen.has(size)) continue;
    seen.add(size);
    sizes.push(size);
  }
  return sizes;
}

/** Dedupe by path so Shopify primary + gallery rows with ?v= params collapse once. */
function galleryUrlKey(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const { origin, pathname } = new URL(url);
      return `${origin}${pathname}`;
    } catch {
      return url;
    }
  }
  return url;
}

/** Stage + marketing photos only — never production mask PNGs. */
function catalogGalleryItems(product: UiProduct): GalleryItem[] {
  const items: GalleryItem[] = [];
  const seen = new Set<string>();
  const add = (key: string, label: string, raw?: string) => {
    const url = resolveMediaUrl(raw);
    if (!url) return;
    const norm = galleryUrlKey(url);
    if (seen.has(norm)) return;
    seen.add(norm);
    items.push({ key, label, url });
  };

  add("front", "Front", product.baseImageUrl || product.mockupUrl);
  add("back", "Back", product.baseBackImageUrl || product.mockupBackUrl);
  add("left", "Left", product.baseLeftImageUrl);
  add("right", "Right", product.baseRightImageUrl);

  const marketing = [product.photoUrl, ...(product.imageUrls ?? [])].filter(Boolean);
  let photoIndex = 0;
  for (const raw of marketing) {
    const url = resolveMediaUrl(raw);
    if (!url) continue;
    const norm = galleryUrlKey(url);
    if (seen.has(norm)) continue;
    seen.add(norm);
    items.push({
      key: `photo-${photoIndex}`,
      label: marketing.length > 1 ? `Photo ${photoIndex + 1}` : "Photo",
      url,
    });
    photoIndex += 1;
  }

  if (!items.length) {
    add("fallback", "Photo", product.mockupUrl || product.photoUrl);
  }
  return items;
}

/** Read-only catalog product detail (description / key features / size guide). */
export function ProductDetail({ product }: { product: UiProduct; index: number }) {
  const gallery = useMemo(() => catalogGalleryItems(product), [product]);
  const swatches = useMemo(() => productSwatches(product), [product]);
  const [activeKey, setActiveKey] = useState(gallery[0]?.key || "");
  const [selColor, setSelColor] = useState(() => defaultColorIndex(swatches));
  const [selSize, setSelSize] = useState<string | undefined>();
  const [openAccordion, setOpenAccordion] = useState<"info" | "features" | "size" | "printing" | null>(
    null,
  );

  useEffect(() => {
    setActiveKey(gallery[0]?.key || "");
  }, [product.id, gallery]);

  useEffect(() => {
    if (!gallery.some((item) => item.key === activeKey)) {
      setActiveKey(gallery[0]?.key || "");
    }
  }, [activeKey, gallery]);

  useEffect(() => {
    setSelColor(defaultColorIndex(swatches));
    setSelSize(undefined);
  }, [product.id, swatches]);

  const active = gallery.find((item) => item.key === activeKey) || gallery[0];
  const showThumbs = gallery.length > 1;
  const productTitle = product.nm?.trim() || product.brand?.trim() || "Shelf Merch Product";
  const selectedColor = swatches[selColor];
  const sizes = useMemo(
    () => distinctSizes(product.variants, selectedColor?.name),
    [product.variants, selectedColor?.name],
  );
  const allSizes = useMemo(() => distinctSizes(product.variants), [product.variants]);
  const displaySizes = sizes.length ? sizes : allSizes;

  useEffect(() => {
    setSelSize((cur) => {
      if (displaySizes.length === 1) return displaySizes[0];
      if (cur && displaySizes.includes(cur)) return cur;
      return undefined;
    });
  }, [displaySizes]);

  return (
    <div className="catalog-pdp">
      <div className="catalog-pdp-layout">
        <div className="sf-pdp-gallery">
          {showThumbs ? (
            <div className="sf-pdp-thumbs" role="tablist" aria-label="Product views">
              {gallery.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={active?.key === item.key}
                  aria-label={item.label}
                  className={`sf-pdp-thumb-btn${active?.key === item.key ? " sf-pdp-thumb-btn--on" : ""}`}
                  onClick={() => setActiveKey(item.key)}
                >
                  <div className="sf-pdp-thumb-mini">
                    <img
                      src={item.url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    />
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          <div
            className="img catalog-pdp-main-media"
            style={{
              background: "#f4f6f4",
              borderRadius: "var(--r-sm)",
              aspectRatio: "1 / 1",
              display: "grid",
              placeItems: "center",
              overflow: "hidden",
            }}
          >
            {active?.url ? (
              <img
                src={active.url}
                alt={`${product.nm} — ${active.label}`}
                loading="eager"
                decoding="async"
                referrerPolicy="no-referrer"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              <span className="mut3">No image</span>
            )}
          </div>
        </div>

        <div className="catalog-pdp-info">
          <div className="catalog-pdp-summary">
            <h1 className="catalog-pdp-brand">{productTitle}</h1>
            <CatalogPrice
              price={product.price}
              basePriceInr={product.basePriceInr}
              size="detail"
            />
          </div>

          {swatches.length > 0 ? (
            <div className="catalog-pdp-colors">
              <div className="catalog-pdp-colour-label">
                Colour: <strong>{selectedColor?.name || "—"}</strong>
              </div>
              <div className="catalog-pdp-color-swatches" role="list" aria-label="Colour variants">
                {swatches.map((swatch, i) => (
                  <button
                    key={swatch.name}
                    type="button"
                    role="listitem"
                    title={swatch.name}
                    aria-label={swatch.name}
                    aria-pressed={selColor === i}
                    className={`catalog-pdp-color-swatch${selColor === i ? " catalog-pdp-color-swatch--on" : ""}`}
                    style={{ background: swatch.hex }}
                    onClick={() => setSelColor(i)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {displaySizes.length > 0 ? (
            <div className="catalog-pdp-sizes">
              <div className="catalog-pdp-size-head">
                <span>Size{selSize ? `: ${selSize}` : ""}</span>
                {product.sizeGuide?.trim() ? (
                  <button type="button" onClick={() => setOpenAccordion("size")}>
                    Size Guide
                  </button>
                ) : null}
              </div>
              <div className="catalog-pdp-size-options">
                {displaySizes.map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={`catalog-pdp-size-btn${selSize === size ? " catalog-pdp-size-btn--on" : ""}`}
                    aria-pressed={selSize === size}
                    onClick={() => setSelSize(size)}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {swatches.length === 0 && displaySizes.length === 0 ? (
            <p className="muted" style={{ fontSize: 14, margin: 0 }}>
              No variants for this product
            </p>
          ) : null}

          <p className="catalog-pdp-ready">Mockups can be requested from your bag.</p>

          <ProductInfoTabs
            product={product}
            variant="catalog"
            openSection={openAccordion}
            onOpenSectionChange={setOpenAccordion}
          />

          {/* <p className="catalog-pdp-print-note">
            <span aria-hidden="true">▣</span> One print location and basic decoration included. Learn more →
          </p> */}
        </div>
      </div>
    </div>
  );
}
