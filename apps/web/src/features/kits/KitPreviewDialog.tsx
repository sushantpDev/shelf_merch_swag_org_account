import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
// import { DesignedProductThumb } from "@/features/swag/DesignedProductThumb";
import { resolveColorHex } from "@/lib/colorMap";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import {
  normalizeVariantImages,
  variantImageUrls,
  variantLabel,
} from "@/lib/kitVariantImages";
import type { PlatformKitTemplate } from "@/services/api-bridge";
import { mapProductRef, type UiKit, type UiProduct } from "@/services/mappers";
import { inr } from "@/components/platform/platform-ui";

export type KitPreviewProduct = {
  key: string;
  name: string;
  brand?: string;
  imageUrl?: string;
  product?: UiProduct;
  variants: Array<{ size?: string; color?: string; colorHex?: string; material?: string }>;
};

export type KitPreviewData = {
  name: string;
  description: string;
  coverImage?: string;
  artworkUrl?: string;
  packaging?: string;
  /** GST-inclusive curated kit price (platformkits.approxValueInr). */
  pricePerKitInr?: number;
  products: KitPreviewProduct[];
  /** Curated kits — extra marketing shots shown above included products. */
  galleryImages?: string[];
  /** Curated kits only — visual appearance options (selection is local/UI-only). */
  variantImages?: string[];
  /** Curated kits — named variant rows for display. */
  kitVariants?: Array<{ imageUrl: string; label: string }>;
};

type ColorOption = { name: string; hex: string };
type Availability = { colors: ColorOption[]; sizes: string[] };

function uniquePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.trim();
    if (!key) continue;
    const lower = key.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(key);
  }
  return out;
}

function productAvailability(
  variants: KitPreviewProduct["variants"],
  product?: UiProduct,
): Availability {
  const sizeNames = uniquePreserveOrder(
    (variants || []).map((v) => v.size || "").filter(Boolean),
  );
  const colorNames = uniquePreserveOrder([
    ...(product?.colors || []),
    ...(variants || []).map((v) => v.color || "").filter(Boolean),
  ]);

  const colors: ColorOption[] = colorNames.map((name) => {
    const fromVariant = variants?.find(
      (v) => v.color?.toLowerCase() === name.toLowerCase() && v.colorHex,
    )?.colorHex;
    const fromMap = product?.colorHexByName
      ? Object.entries(product.colorHexByName).find(
          ([k]) => k.toLowerCase() === name.toLowerCase(),
        )?.[1]
      : undefined;
    return { name, hex: resolveColorHex(name, fromVariant || fromMap) };
  });

  return { colors, sizes: sizeNames };
}

function productImageUrl(product?: UiProduct): string | undefined {
  if (!product) return undefined;
  return (
    resolveMediaUrl(product.mockupUrl) ||
    resolveMediaUrl(product.photoUrl) ||
    resolveMediaUrl(product.baseImageUrl) ||
    resolveMediaUrl(product.imgUrl) ||
    undefined
  );
}

/** Preview-only: overlay logo on the full-color photo, not the production mask. */
function previewCompositeProduct(product: UiProduct): UiProduct {
  const photo =
    resolveMediaUrl(product.photoUrl) ||
    resolveMediaUrl(product.baseImageUrl) ||
    resolveMediaUrl(product.imageUrls?.[0]);
  if (!photo) return product;
  return {
    ...product,
    maskImageUrl: undefined,
    maskBackImageUrl: undefined,
    maskLeftImageUrl: undefined,
    maskRightImageUrl: undefined,
    imgUrl: photo,
  };
}

type CuratedImageSource = {
  originalId?: string;
  heroImage?: string;
  imageUrls?: string[];
  galleryImages?: string[];
  itemImages?: Array<{ imageUrl: string; label?: string }>;
  variantImages?: unknown;
  approxValueInr?: number;
};

function resolveKitVariantsFromSource(
  source: CuratedImageSource,
): Array<{ imageUrl: string; label: string }> {
  return normalizeVariantImages(source.variantImages).map((v, i) => ({
    imageUrl: resolveMediaUrl(v.imageUrl) || v.imageUrl,
    label: variantLabel(v, i),
  }));
}

function resolveGalleryImages(source: CuratedImageSource): string[] {
  if (!Array.isArray(source.galleryImages) || source.galleryImages.length === 0) return [];
  return source.galleryImages.map((url) => resolveMediaUrl(url) || url).filter(Boolean);
}

function galleryUrlsExcludingHero(source: CuratedImageSource): string[] {
  const hero = String(source.heroImage || source.imageUrls?.[0] || "").trim();
  const variantSet = new Set(variantImageUrls(source.variantImages));
  return uniquePreserveOrder(
    (source.imageUrls || []).filter((url) => {
      const u = String(url).trim();
      return u && u !== hero && !variantSet.has(u);
    }),
  );
}

/** Build included-product cards for curated kits — never catalog productRefs. */
function buildCuratedItemProducts(
  source: CuratedImageSource,
  fallbackCover?: string,
): KitPreviewProduct[] {
  if (Array.isArray(source.itemImages) && source.itemImages.length > 0) {
    return source.itemImages.map((item, i) => ({
      key: `item-${i}-${item.imageUrl}`,
      name: item.label?.trim() || `Item ${i + 1}`,
      imageUrl: resolveMediaUrl(item.imageUrl),
      variants: [],
    }));
  }

  const gallery = galleryUrlsExcludingHero(source);
  if (gallery.length > 0) {
    return gallery.map((url, i) => ({
      key: `gallery-${i}-${url}`,
      name: `Item ${i + 1}`,
      imageUrl: resolveMediaUrl(url),
      variants: [],
    }));
  }

  const hero =
    (source.heroImage ? resolveMediaUrl(source.heroImage) : undefined) ||
    (source.imageUrls?.[0] ? resolveMediaUrl(source.imageUrls[0]) : undefined) ||
    fallbackCover;
  if (hero) {
    return [
      {
        key: "hero-fallback",
        name: "Kit contents",
        imageUrl: hero,
        variants: [],
      },
    ];
  }

  return [];
}

/** Prefer live platform kit image roles (matches KitsView preview). Falls back to workspace clone meta. */
function resolveCuratedImageSource(
  meta: CuratedImageSource,
  platformKits?: PlatformKitTemplate[],
): CuratedImageSource {
  const platformKit = findPlatformKitForMeta(meta, platformKits);
  if (platformKit) {
    return {
      originalId: meta.originalId,
      heroImage: platformKit.heroImage,
      imageUrls: platformKit.imageUrls,
      galleryImages: platformKit.galleryImages,
      itemImages: platformKit.itemImages,
      variantImages: platformKit.variantImages,
      approxValueInr: platformKit.approxValueInr,
    };
  }
  return meta;
}

function findPlatformKitForMeta(
  meta: { originalId?: string } | null | undefined,
  platformKits?: PlatformKitTemplate[],
): PlatformKitTemplate | undefined {
  if (!meta?.originalId || !platformKits?.length) return undefined;
  return platformKits.find((k) => String(k._id) === String(meta.originalId));
}

/** Included item cards for curated kits (preview, send flow, etc.). */
export function curatedIncludedItems(
  meta: CuratedImageSource,
  platformKits?: PlatformKitTemplate[],
  fallbackCover?: string,
): Array<{ imageUrl: string; label: string }> {
  const source = resolveCuratedImageSource(meta, platformKits);
  return buildCuratedItemProducts(source, fallbackCover).map((item) => ({
    imageUrl: item.imageUrl || fallbackCover || "",
    label: item.name,
  }));
}

/** Named variant rows for curated kits — same source resolution as preview. */
export function curatedKitVariantRows(
  meta: CuratedImageSource,
  platformKits?: PlatformKitTemplate[],
): Array<{ imageUrl: string; label: string }> {
  return resolveKitVariantsFromSource(resolveCuratedImageSource(meta, platformKits));
}

/** Build a read-only preview model from a workspace kit + catalog. */
export function buildKitPreviewFromWorkspace(
  kit: UiKit,
  catalog: UiProduct[],
  fallbackCover?: string,
  platformKits?: PlatformKitTemplate[],
): KitPreviewData {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  let description = kit.description?.trim() || "";
  let coverFromMeta: string | undefined;
  let itemProducts: KitPreviewProduct[] | undefined;
  let galleryImages: string[] | undefined;
  let variantImages: string[] | undefined;
  let kitVariants: Array<{ imageUrl: string; label: string }> | undefined;
  let isCurated = false;
  let curatedMeta: CuratedImageSource | null = null;

  try {
    if (kit.designNotes) {
      const meta = JSON.parse(kit.designNotes) as {
        curated?: boolean;
        originalId?: string;
        description?: string;
        imageUrls?: string[];
        heroImage?: string;
        itemImages?: Array<{ imageUrl: string; label?: string }>;
        galleryImages?: string[];
        variantImages?: unknown;
        approxValueInr?: number;
      };
      if (meta.curated) {
        isCurated = true;
        curatedMeta = meta;
      }
      if (!description && meta.description) description = meta.description;
      if (meta.heroImage) {
        coverFromMeta = resolveMediaUrl(meta.heroImage);
      } else if (meta.imageUrls?.[0]) {
        coverFromMeta = resolveMediaUrl(meta.imageUrls[0]);
      }
      if (meta.curated && meta.variantImages) {
        kitVariants = resolveKitVariantsFromSource(meta);
        variantImages = kitVariants.map((v) => v.imageUrl);
      }
    }
  } catch {
    /* ignore */
  }

  if (isCurated) {
    const imageSource = resolveCuratedImageSource(curatedMeta!, platformKits);
    if (!coverFromMeta) {
      coverFromMeta =
        (imageSource.heroImage ? resolveMediaUrl(imageSource.heroImage) : undefined) ||
        (imageSource.imageUrls?.[0] ? resolveMediaUrl(imageSource.imageUrls[0]) : undefined);
    }
    if (!variantImages?.length && imageSource.variantImages) {
      kitVariants = resolveKitVariantsFromSource(imageSource);
      variantImages = kitVariants.map((v) => v.imageUrl);
    }
    galleryImages = resolveGalleryImages(imageSource);
    itemProducts = buildCuratedItemProducts(imageSource, fallbackCover);
  }

  const products: KitPreviewProduct[] =
    itemProducts ??
    (kit.productRefs ?? []).map((ref, i) => {
      const product = mapProductRef(
        {
          catalogProductId: ref.catalogProductId,
          name: ref.name,
          brand: ref.brand,
          group: ref.group,
          mockupUrl: ref.mockupUrl,
          placement: ref.placement,
        },
        byId,
      );
      return {
        key: `${ref.catalogProductId}-${i}`,
        name: ref.name || product.nm || "Product",
        brand: ref.brand || product.brand,
        imageUrl: resolveMediaUrl(ref.mockupUrl) || productImageUrl(product),
        product,
        variants: product.variants ?? [],
      };
    });

  const platformKitForPrice = isCurated
    ? findPlatformKitForMeta(curatedMeta, platformKits)
    : undefined;
  const pricePerKitInr = isCurated
    ? Math.max(
        0,
        Math.round(
          Number(platformKitForPrice?.approxValueInr) ||
            Number((curatedMeta as { approxValueInr?: number } | null)?.approxValueInr) ||
            Number(kit.kitPrice) ||
            0,
        ),
      )
    : undefined;

  return {
    name: kit.name,
    description: description || "No description available.",
    coverImage:
      (kit.artworkUrl ? resolveMediaUrl(kit.artworkUrl) : undefined) ||
      coverFromMeta ||
      fallbackCover,
    artworkUrl: kit.artworkUrl,
    packaging: kit.packaging === "box" ? "Premium box" : kit.packaging === "none" ? "No packaging" : kit.packaging,
    pricePerKitInr: pricePerKitInr && pricePerKitInr > 0 ? pricePerKitInr : undefined,
    products,
    galleryImages,
    variantImages,
    kitVariants,
  };
}

/** Build a read-only preview model from a curated platform template + catalog. */
export function buildKitPreviewFromPlatform(
  kit: PlatformKitTemplate,
  catalog: UiProduct[],
  fallbackCover?: string,
): KitPreviewData {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const heroImage =
    (kit.heroImage ? resolveMediaUrl(kit.heroImage) : undefined) ||
    (kit.imageUrls?.[0] ? resolveMediaUrl(kit.imageUrls[0]) : undefined) ||
    fallbackCover;

  const products = buildCuratedItemProducts(kit, fallbackCover);

  // Manually composed kits may still reference catalog products.
  if (!products.length && (kit.items ?? []).length > 0) {
    (kit.items ?? []).forEach((item, i) => {
      const product = byId.get(String(item.catalogProductId));
      products.push({
        key: `${item.catalogProductId}-${i}`,
        name: product?.nm || "Product",
        brand: product?.brand,
        imageUrl: productImageUrl(product) || heroImage,
        product,
        variants: product?.variants ?? [],
      });
    });
  }

  const kitVariants = resolveKitVariantsFromSource(kit);

  return {
    name: kit.name,
    description: kit.description?.trim() || "No description available.",
    coverImage: heroImage,
    pricePerKitInr: (() => {
      const n = Math.round(Number(kit.approxValueInr) || 0);
      return n > 0 ? n : undefined;
    })(),
    products,
    galleryImages: resolveGalleryImages(kit),
    variantImages: kitVariants.map((v) => v.imageUrl),
    kitVariants,
  };
}

const btnGhostStyle: CSSProperties = {
  border: "1px solid var(--line)",
  padding: "8px 24px",
  borderRadius: 10,
  fontWeight: "var(--font-weight-bold)",
};

const labelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: "var(--font-weight-bold)",
  color: "var(--gray-500)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

function KitPreviewProductImage({
  name,
  imageUrl,
  product,
  artworkUrl,
}: {
  name: string;
  imageUrl?: string;
  product?: UiProduct;
  artworkUrl?: string;
}) {
  const baked = resolveMediaUrl(product?.mockupUrl) || "";
  const imgStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
  };

  let inner: ReactNode;
  if (baked) {
    inner = <img src={baked} alt={name} style={imgStyle} />;
  // } else if (product && artworkUrl) {
  //   inner = (
  //     <DesignedProductThumb
  //       product={previewCompositeProduct(product)}
  //       artworkUrl={artworkUrl}
  //       frontOnly
  //       className="kit-preview-dpt"
  //       style={{ width: "100%", height: "100%" }}
  //     />
  //   );
  } else if (imageUrl) {
    inner = <img src={imageUrl} alt={name} style={imgStyle} />;
  } else {
    inner = (
      <div className="sm-skeleton-img" aria-hidden="true" style={{ width: "100%", height: "100%" }} />
    );
  }

  return (
    <div
      className="kit-preview-thumb"
      style={{
        aspectRatio: "1",
        width: "100%",
        position: "relative",
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
      }}
    >
      {inner}
    </div>
  );
}

function ProductAvailability({
  colors,
  sizes,
}: {
  colors: ColorOption[];
  sizes: string[];
}) {
  if (!colors.length && !sizes.length) return null;

  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
      {colors.length > 0 && (
        <div>
          <div style={{ ...labelStyle, marginBottom: 6 }}>Colours</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {colors.slice(0, 10).map((c) => (
              <span
                key={c.name}
                title={c.name}
                aria-label={c.name}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: c.hex,
                  border: "1.5px solid rgba(0,0,0,.18)",
                  display: "inline-block",
                  flexShrink: 0,
                  cursor: "default",
                }}
              />
            ))}
            {colors.length > 10 && (
              <span style={{ fontSize: "var(--workspace-font-caption, 11px)", color: "var(--gray-500)" }}>
                +{colors.length - 10}
              </span>
            )}
          </div>
        </div>
      )}
      {sizes.length > 0 && (
        <div>
          <div style={{ ...labelStyle, marginBottom: 4 }}>Sizes</div>
          <div style={{ fontSize: "var(--workspace-font-caption, 12px)", color: "var(--ink-2)", lineHeight: 1.35 }}>
            {sizes.join(" · ")}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Shared read-only kit preview used by Recent Activity, Customised Kits, and Curated Kits.
 * Actions (Send / Edit) stay outside this dialog — callers close and navigate themselves.
 */
export function KitPreviewDialog({
  data,
  open,
  onOpenChange,
}: {
  data: KitPreviewData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const productCount = data?.products.length ?? 0;
  const wide = productCount > 4 || (data?.variantImages?.length ?? 0) > 0;
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedVariant(null);
      return;
    }
    setSelectedVariant(data?.variantImages?.[0] ?? null);
  }, [open, data?.name, data?.variantImages]);

  const productCards = useMemo(() => {
    if (!data) return [];
    return data.products.map((p) => ({
      ...p,
      availability: productAvailability(p.variants, p.product),
    }));
  }, [data]);

  return (
    <Dialog open={open && data !== null} onOpenChange={onOpenChange}>
      <DialogContent
        className={wide ? "sm-modal kit-preview-dialog kit-preview-dialog--wide" : "sm-modal kit-preview-dialog"}
      >
        {data && (
          <>
          <header className="kit-preview-dialog__header">
            <DialogTitle>Kit preview</DialogTitle>
          </header>
          <div className="modal-pad kit-preview-dialog__body">
            {data.coverImage && (
              <div
                style={{
                  width: "100%",
                  height: 180,
                  borderRadius: 10,
                  background: "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 20,
                  overflow: "hidden",
                }}
              >
                <img
                  src={data.coverImage}
                  alt=""
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                />
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 16,
                marginBottom: 12,
              }}
            >
              <h2
                style={{ fontSize: 20, fontWeight: "var(--font-weight-bold)", color: "var(--ink)", margin: 0 }}
              >
                {data.name}
              </h2>
              {data.pricePerKitInr != null && data.pricePerKitInr > 0 ? (
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ ...labelStyle, marginBottom: 2 }}>Price per kit</div>
                  <div style={{ fontSize: 18, fontWeight: "var(--font-weight-bold)", color: "var(--ink)" }}>
                    {inr(data.pricePerKitInr)}
                  </div>
                </div>
              ) : null}
            </div>

            <p style={{ color: "var(--gray-500)", fontSize: "var(--workspace-font-body, 14px)", lineHeight: 1.5, margin: "0 0 12px" }}>
              {data.description}
            </p>
            {data.packaging ? (
              <p className="muted" style={{ fontSize: "var(--workspace-font-caption, 13px)", margin: "0 0 20px" }}>
                Packaging: <strong style={{ color: "var(--ink)" }}>{data.packaging}</strong>
              </p>
            ) : (
              <div style={{ marginBottom: 8 }} />
            )}

            <div style={{ borderBottom: "1px solid var(--line)", marginBottom: 16 }} />

            {(data.galleryImages?.length ?? 0) > 0 ? (
              <div style={{ marginBottom: 20 }}>
                <h4
                  style={{
                    fontSize: "var(--workspace-font-heading, 12px)",
                    fontWeight: "var(--font-weight-bold)",
                    textTransform: "uppercase",
                    color: "var(--gray-500)",
                    marginBottom: 12,
                  }}
                >
                  Gallery ({data.galleryImages!.length})
                </h4>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                    gap: 16,
                  }}
                >
                  {data.galleryImages!.map((url, idx) => (
                    <div
                      key={`${url}-${idx}`}
                      style={{
                        border: "1px solid var(--line)",
                        borderRadius: 8,
                        padding: 12,
                        background: "var(--gray-50)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          aspectRatio: "1",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          overflow: "hidden",
                        }}
                      >
                        <img
                          src={url}
                          alt={`Gallery ${idx + 1}`}
                          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div style={{ marginBottom: 20 }}>
              <h4
                style={{
                  fontSize: "var(--workspace-font-heading, 12px)",
                  fontWeight: "var(--font-weight-bold)",
                  textTransform: "uppercase",
                  color: "var(--gray-500)",
                  marginBottom: 12,
                }}
              >
                Included Products ({productCount})
              </h4>

              {productCards.length === 0 ? (
                <p className="muted" style={{ margin: 0, fontSize: "var(--workspace-font-caption, 13px)" }}>
                  No products in this kit.
                </p>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                    gap: 16,
                  }}
                >
                  {productCards.map((p) => (
                    <div
                      key={p.key}
                      style={{
                        border: "1px solid var(--line)",
                        borderRadius: 8,
                        padding: 12,
                        background: "var(--gray-50)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <KitPreviewProductImage
                        name={p.name}
                        imageUrl={p.imageUrl}
                        product={p.product}
                        artworkUrl={data.artworkUrl}
                      />
                      <div>
                        {p.brand ? (
                          <div style={labelStyle}>{p.brand}</div>
                        ) : null}
                        <div style={{ fontSize: "var(--workspace-font-body, 13px)", fontWeight: "var(--font-weight-bold)", color: "var(--ink)" }}>
                          {p.name}
                        </div>
                        <ProductAvailability
                          colors={p.availability.colors}
                          sizes={p.availability.sizes}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {(data.variantImages?.length ?? 0) > 0 ? (
              <div style={{ marginBottom: 20 }}>
                <h4
                  style={{
                    fontSize: "var(--workspace-font-heading, 12px)",
                    fontWeight: "var(--font-weight-bold)",
                    textTransform: "uppercase",
                    color: "var(--gray-500)",
                    marginBottom: 12,
                  }}
                >
                  Variants
                </h4>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                    gap: 12,
                  }}
                >
                  {(data.kitVariants?.length ? data.kitVariants : (data.variantImages || []).map((url, idx) => ({
                    imageUrl: url,
                    label: `Variant ${idx + 1}`,
                  }))).map((variant) => {
                    const selected = selectedVariant === variant.imageUrl;
                    return (
                      <button
                        key={`${variant.imageUrl}-${variant.label}`}
                        type="button"
                        onClick={() => setSelectedVariant(variant.imageUrl)}
                        style={{
                          border: selected ? "2px solid var(--brand)" : "1px solid var(--line)",
                          borderRadius: 8,
                          padding: 10,
                          background: selected ? "var(--surface-2)" : "var(--gray-50)",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <div
                          style={{
                            aspectRatio: "1",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            overflow: "hidden",
                            marginBottom: 8,
                          }}
                        >
                          <img
                            src={variant.imageUrl}
                            alt={variant.label}
                            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                          />
                        </div>
                        <div style={{ fontSize: "var(--workspace-font-caption, 12px)", fontWeight: "var(--font-weight-bold)", color: "var(--ink)" }}>
                          {variant.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

          </div>
            <footer className="kit-preview-dialog__footer">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => onOpenChange(false)}
                style={btnGhostStyle}
              >
                Close
              </button>
            </footer>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
