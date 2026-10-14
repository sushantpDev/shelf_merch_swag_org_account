import { isPlaceholderColorHex, resolveColorHex } from "@/lib/colorMap";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { TintedGarment } from "@/components/store/TintedGarment";
import { PrintAreaEditor } from "../../../PrintAreaEditor";
import { PlatformError, PlatformPageHeader } from "../../../platform-ui";
import type { ProductWizardVm } from "../controllers/useProductWizardController";
import { MarketingImageGallery, MasterImageUpload } from "./product-wizard-upload";

/** Platform product create/edit wizard. */
export function ProductWizardView({
  mode,
  steps,
  step,
  busy,
  error,
  problems,
  id,
  details,
  variant,
  product,
  printAreas,
  physicalDimensions,
  dpi,
  previewColor,
  imageView,
  categoryOptions,
  categoriesLoading,
  colorSwatches,
  activeSwatch,
  firstHex,
  marketingImageUrls,
  marketingIndex,
  imageViews,
  activeStageUrl,
  activeMaskUrl,
  activeMaskIsShopifyFallback,
  activeMaskCanTint,
  frontMaskIsShopifyFallback,
  baseStageImageUrl,
  productionMaskImageUrl,
  baseBackStageImageUrl,
  productionMaskBackImageUrl,
  baseLeftStageImageUrl,
  productionMaskLeftImageUrl,
  baseRightStageImageUrl,
  productionMaskRightImageUrl,
  printAreaImages,
  printAreaImageViews,
  untintedMaskImageUrls,
  onBack,
  onStep,
  onSet,
  onToggleCategory,
  onVariant,
  onPrintAreas,
  onPhysicalDimensions,
  onDpi,
  onPreviewColor,
  onImageView,
  onSaveDetails,
  onAddVariant,
  onToggleVariantEnabled,
  onSetMarketingIndex,
  onUploadActiveMask,
  onUploadActiveBase,
  onSaveAreas,
  onContinueFromVariants,
  onGoToStep,
  onPublish,
  onSaveDraft,
}: ProductWizardVm) {
  const activeViewLabel = imageViews.find((v) => v.key === imageView)?.label || imageView;
  return (
    <>
      <PlatformPageHeader
        title={mode === "edit" ? "Edit product" : "New product"}
        subtitle="Define a base catalog product, its variants, images, and design placeholders."
        actions={
          <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
            Back to catalog
          </button>
        }
      />

      <div className="row" style={{ gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {steps.map((label, i) => (
          <button
            type="button"
            key={label}
            className="chip"
            style={
              i === step ? { borderColor: "var(--brand)", color: "var(--brand-d)", fontWeight: 700 } : undefined
            }
            disabled={!id && i > 0}
            onClick={() => onStep(i)}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {error && <PlatformError message={error} />}

      <div className="card" style={{ padding: 22, maxWidth: 880 }}>
        {step === 0 && (
          <>
            <div className="row" style={{ gap: 14 }}>
              <div className="field" style={{ flex: 1 }}>
                <label className="lbl">Product name</label>
                <input className="inp" value={details.name} onChange={(e) => onSet("name", e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label className="lbl">Categories</label>
              <p className="muted" style={{ margin: "0 0 8px", fontSize: 12 }}>
                Select one or more categories where this product should appear.
              </p>
              <div
                style={{
                  maxHeight: 220,
                  overflow: "auto",
                  border: "1px solid var(--line, #e6e6e6)",
                  borderRadius: 8,
                  padding: "8px 10px",
                }}
              >
                {categoriesLoading ? (
                  <span className="muted">Loading categories…</span>
                ) : categoryOptions.length === 0 ? (
                  <span className="muted">No categories available.</span>
                ) : (
                  categoryOptions.map((option) => {
                    const checked = (details.categoryIds ?? []).includes(option.id);
                    return (
                      <label
                        key={option.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "4px 0",
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggleCategory(option.id)}
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
            <div className="field">
              <label className="lbl">Description</label>
              <textarea
                className="inp"
                rows={4}
                value={details.description}
                onChange={(e) => onSet("description", e.target.value)}
              />
            </div>
            <div className="field">
              <label className="lbl">Key features</label>
              <textarea
                className="inp"
                rows={4}
                value={details.keyFeatures}
                onChange={(e) => onSet("keyFeatures", e.target.value)}
              />
            </div>
            <div className="field">
              <label className="lbl">Size guide</label>
              <textarea
                className="inp"
                rows={4}
                value={details.sizeGuide}
                onChange={(e) => onSet("sizeGuide", e.target.value)}
              />
            </div>
            <div className="row" style={{ gap: 14 }}>
              <div className="field" style={{ flex: 1 }}>
                <label className="lbl">Selling price (₹)</label>
                <input
                  className="inp"
                  type="number"
                  value={details.sellingPriceInr}
                  onChange={(e) => onSet("sellingPriceInr", Number(e.target.value))}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label className="lbl">Cost price (₹, internal)</label>
                <input
                  className="inp"
                  type="number"
                  value={details.costPriceInr}
                  onChange={(e) => onSet("costPriceInr", Number(e.target.value))}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label className="lbl">GST %</label>
                <input
                  className="inp"
                  type="number"
                  value={details.gstRate}
                  onChange={(e) => onSet("gstRate", Number(e.target.value))}
                />
              </div>
            </div>
            <div className="row" style={{ gap: 14 }}>
              <div className="field" style={{ flex: 1 }}>
                <label className="lbl">HSN code</label>
                <input className="inp" value={details.hsnCode} onChange={(e) => onSet("hsnCode", e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label className="lbl">MOQ</label>
                <input
                  className="inp"
                  type="number"
                  value={details.moq}
                  onChange={(e) => onSet("moq", Number(e.target.value))}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label className="lbl">Production days</label>
                <input
                  className="inp"
                  type="number"
                  value={details.productionDays}
                  onChange={(e) => onSet("productionDays", Number(e.target.value))}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label className="lbl">Material</label>
                <input className="inp" value={details.material} onChange={(e) => onSet("material", e.target.value)} />
              </div>
            </div>
            <button
              type="button"
              className="btn btn-brand"
              disabled={
                busy ||
                categoriesLoading ||
                !details.name ||
                !(details.categoryIds ?? []).length ||
                !details.sellingPriceInr
              }
              onClick={onSaveDetails}
            >
              {id ? "Save & continue" : "Create draft & continue"}
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <h3 style={{ marginBottom: 12 }}>Variants</h3>
            <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
              Disable a variant to hide it from tenant catalog and storefront. Enabled variants stay
              available to clients.
            </p>
            {product?.variants?.length ? (
              <table className="tbl" style={{ marginBottom: 14 }}>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Size</th>
                    <th>Color</th>
                    <th>Stock</th>
                    <th>Client</th>
                  </tr>
                </thead>
                <tbody>
                  {product.variants.map((v) => {
                    const hex = resolveColorHex(v.color, v.colorHex);
                    const enabled = v.enabled !== false;
                    return (
                      <tr key={v._id || v.sku} style={enabled ? undefined : { opacity: 0.55 }}>
                        <td>{v.sku}</td>
                        <td>{v.size || "N/A"}</td>
                        <td>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            {!isPlaceholderColorHex(hex) && (
                              <span
                                title={hex}
                                style={{
                                  width: 14,
                                  height: 14,
                                  borderRadius: 4,
                                  border: "1px solid var(--line)",
                                  background: hex,
                                }}
                              />
                            )}
                            {v.color || "N/A"}
                          </span>
                        </td>
                        <td>{v.stock ?? 0}</td>
                        <td>
                          <label
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                              cursor: v._id && !busy ? "pointer" : "not-allowed",
                              fontSize: 13,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={enabled}
                              disabled={busy || !v._id}
                              onChange={(e) => onToggleVariantEnabled(v._id, e.target.checked)}
                            />
                            {enabled ? "Enabled" : "Disabled"}
                          </label>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="muted" style={{ marginBottom: 14 }}>
                No variants yet.
              </p>
            )}
            <div className="row" style={{ gap: 10, alignItems: "flex-end" }}>
              <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                <label className="lbl">SKU</label>
                <input
                  className="inp"
                  value={variant.sku}
                  onChange={(e) => onVariant({ ...variant, sku: e.target.value })}
                />
              </div>
              <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                <label className="lbl">Size</label>
                <input
                  className="inp"
                  value={variant.size}
                  onChange={(e) => onVariant({ ...variant, size: e.target.value })}
                />
              </div>
              <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                <label className="lbl">Color</label>
                <input
                  className="inp"
                  value={variant.color}
                  onChange={(e) => onVariant({ ...variant, color: e.target.value })}
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="lbl">Hex</label>
                <input
                  type="color"
                  value={variant.colorHex || "#ffffff"}
                  onChange={(e) => onVariant({ ...variant, colorHex: e.target.value })}
                  style={{
                    width: 44,
                    height: 38,
                    padding: 2,
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    background: "#fff",
                  }}
                />
              </div>
              <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                <label className="lbl">Stock</label>
                <input
                  className="inp"
                  type="number"
                  value={variant.stock}
                  onChange={(e) => onVariant({ ...variant, stock: Number(e.target.value) })}
                />
              </div>
              <button type="button" className="btn btn-soft" disabled={busy || !variant.sku} onClick={onAddVariant}>
                Add
              </button>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 18 }}>
              <button type="button" className="btn btn-ghost" onClick={() => onGoToStep(0)}>
                Back
              </button>
              <button type="button" className="btn btn-brand" disabled={busy} onClick={onContinueFromVariants}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h3 style={{ marginBottom: 4 }}>Product images</h3>
            <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
              Marketing and production imagery are kept separate. Browse every imported Shopify photo
              below, then upload a visible product stage image and transparent production mask for
              each view you need. If you skip the front mask, the selected Shopify image is used.
            </p>

            <MarketingImageGallery
              imageUrls={marketingImageUrls}
              selectedIndex={Math.min(marketingIndex, Math.max(marketingImageUrls.length - 1, 0))}
              onSelect={onSetMarketingIndex}
            />

            <h3 style={{ marginBottom: 4 }}>Production imagery</h3>
            <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
              Front, back, left, and right stage/mask uploads used for artwork, print areas, and
              previews.
            </p>

            <div className="row" style={{ gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {imageViews.map((view) => (
                <button
                  type="button"
                  key={view.key}
                  className="chip"
                  style={
                    imageView === view.key
                      ? { borderColor: "var(--brand)", color: "var(--brand-d)", fontWeight: 700 }
                      : undefined
                  }
                  onClick={() => onImageView(view.key)}
                >
                  {view.label}
                </button>
              ))}
            </div>

            <div className="row" style={{ gap: 18, flexWrap: "wrap", marginBottom: 22, alignItems: "flex-start" }}>
              <MasterImageUpload
                label={`Product stage image (${imageView})`}
                hint={`Visible ${imageView} garment/product image used in swag previews`}
                accept="image/*"
                imageUrl={activeStageUrl}
                disabled={busy || !id}
                onFile={onUploadActiveBase}
              />
              <MasterImageUpload
                label={`Design & production mask (${imageView})`}
                hint={
                  activeMaskIsShopifyFallback
                    ? "Using selected Shopify image · upload a transparent image to override"
                    : "Transparent image · used for artwork, print areas and production · optional if a Shopify image exists"
                }
                accept="image/*"
                imageUrl={activeMaskUrl ? resolveMediaUrl(activeMaskUrl) : undefined}
                tintHex={activeMaskCanTint ? firstHex : undefined}
                disabled={busy || !id}
                onFile={onUploadActiveMask}
              />
            </div>

            {!id && (
              <p className="muted" style={{ fontSize: 12, marginTop: -8, marginBottom: 12 }}>
                Save product details on step 1 before uploading images.
              </p>
            )}

            {activeMaskUrl && activeMaskCanTint && (
              <div style={{ marginBottom: 22 }}>
                <h3 style={{ marginBottom: 2 }}>Colour preview</h3>
                <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
                  The {activeViewLabel.toLowerCase()} mask recolours to each variant colour automatically.
                  Pick a colour to inspect the runtime tint.
                </p>
                {colorSwatches.length === 0 ? (
                  <p className="muted">Add variants with colours to preview the recoloured mask.</p>
                ) : (
                  <div className="row" style={{ gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <div>
                      <div
                        style={{
                          width: 200,
                          height: 200,
                          borderRadius: 10,
                          border: "1px solid var(--line)",
                          background: "var(--surface-2)",
                          overflow: "hidden",
                        }}
                      >
                        <TintedGarment src={resolveMediaUrl(activeMaskUrl)} hex={activeSwatch?.hex} />
                      </div>
                      {activeSwatch && (
                        <div className="row" style={{ gap: 8, alignItems: "center", marginTop: 8 }}>
                          <span
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: "50%",
                              border: "1px solid var(--line)",
                              background: activeSwatch.hex,
                            }}
                          />
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{activeSwatch.name}</span>
                          <span className="muted" style={{ fontSize: 12, fontFamily: "monospace" }}>
                            {activeSwatch.hex}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="row" style={{ gap: 10, flexWrap: "wrap", flex: 1 }}>
                      {colorSwatches.map((c) => {
                        const selected = c.name === activeSwatch?.name;
                        return (
                          <button
                            type="button"
                            key={c.name}
                            onClick={() => onPreviewColor(c.name)}
                            title={`${c.name} · ${c.hex}`}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: 6,
                              padding: 6,
                              borderRadius: 8,
                              cursor: "pointer",
                              background: selected ? "var(--surface-2)" : "transparent",
                              border: selected ? "2px solid var(--brand)" : "1px solid var(--line)",
                            }}
                          >
                            <div
                              style={{
                                width: 64,
                                height: 64,
                                borderRadius: 6,
                                overflow: "hidden",
                                background: "var(--surface-2)",
                              }}
                            >
                              <TintedGarment src={resolveMediaUrl(activeMaskUrl)} hex={c.hex} />
                            </div>
                            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, maxWidth: 72 }}>
                              <span
                                style={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: "50%",
                                  border: "1px solid var(--line)",
                                  background: c.hex,
                                  flexShrink: 0,
                                }}
                              />
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {c.name}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="row" style={{ gap: 8, marginTop: 18 }}>
              <button type="button" className="btn btn-ghost" onClick={() => onGoToStep(1)}>
                Back
              </button>
              <button type="button" className="btn btn-brand" onClick={() => onGoToStep(3)}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h3 style={{ marginBottom: 12 }}>Design placeholders</h3>
            <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
              Place design areas on any uploaded mask (front, back, left, or right). Switch the mockup
              image to edit each view. Areas are saved with the selected mask. Front falls back to
              the selected Shopify image when no mask was uploaded.
            </p>
            {!printAreaImages.length && (
              <p className="muted" style={{ marginBottom: 12 }}>
                Upload a production mask or ensure a Shopify image is selected before placing
                design areas.
              </p>
            )}
            <PrintAreaEditor
              images={printAreaImages}
              maskImageUrl={
                productionMaskImageUrl ||
                productionMaskBackImageUrl ||
                productionMaskLeftImageUrl ||
                productionMaskRightImageUrl
              }
              imageViews={printAreaImageViews}
              untintedImageUrls={untintedMaskImageUrls}
              colors={colorSwatches}
              value={printAreas}
              onChange={onPrintAreas}
              physicalDimensions={physicalDimensions}
              onPhysicalDimensionsChange={onPhysicalDimensions}
              dpi={dpi}
              onDpiChange={onDpi}
            />
            <div className="row" style={{ gap: 8, marginTop: 18 }}>
              <button type="button" className="btn btn-ghost" onClick={() => onGoToStep(2)}>
                Back
              </button>
              <button type="button" className="btn btn-brand" disabled={busy} onClick={onSaveAreas}>
                Save & continue
              </button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h3 style={{ marginBottom: 12 }}>Review &amp; publish</h3>
            <p className="muted" style={{ marginBottom: 6 }}>
              {product?.name} · {product?.sku} · {product?.variants?.length ?? 0} variants ·{" "}
              {marketingImageUrls.length
                ? `${marketingImageUrls.length} marketing image${marketingImageUrls.length === 1 ? "" : "s"}`
                : "no marketing images"}{" "}
              · {baseStageImageUrl ? "front stage" : "no front stage"} ·{" "}
              {productionMaskImageUrl ? "front mask" : "no front mask"} ·{" "}
              {baseBackStageImageUrl ? "back stage" : "no back stage"} ·{" "}
              {productionMaskBackImageUrl ? "back mask" : "no back mask"} ·{" "}
              {baseLeftStageImageUrl ? "left stage" : "no left stage"} ·{" "}
              {productionMaskLeftImageUrl ? "left mask" : "no left mask"} ·{" "}
              {baseRightStageImageUrl ? "right stage" : "no right stage"} ·{" "}
              {productionMaskRightImageUrl ? "right mask" : "no right mask"} · {printAreas.length}{" "}
              print areas
            </p>
            {problems.length > 0 && (
              <ul style={{ color: "var(--danger)", margin: "10px 0", paddingLeft: 18 }}>
                {problems.map((p, index) => (
                  <li key={`${p}-${index}`}>{p}</li>
                ))}
              </ul>
            )}
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button type="button" className="btn btn-ghost" onClick={() => onGoToStep(3)}>
                Back
              </button>
              <button type="button" className="btn btn-brand" disabled={busy} onClick={onPublish}>
                Publish product
              </button>
              <button type="button" className="btn btn-soft" onClick={onSaveDraft}>
                Save as draft
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
