import { useRef } from "react";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { inr, PlatformError, PlatformPageHeader } from "../../../platform-ui";
import type { KitWizardVm } from "../controllers/useKitWizardController";

function KitRoleUploadButton({
  label,
  multiple = false,
  disabled,
  onFiles,
}: {
  label: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: FileList | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        disabled={disabled}
        style={{ display: "none" }}
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        className="btn btn-soft btn-sm"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {label}
      </button>
    </>
  );
}

function kitImageSrc(url: string) {
  return resolveMediaUrl(url) || url;
}

/** Platform kit create/edit wizard. */
export function KitWizardView({
  mode,
  steps,
  campaignTypes,
  step,
  busy,
  error,
  problems,
  id,
  details,
  kit,
  products,
  pickProductId,
  pickVariants,
  pickVariantSku,
  pickQty,
  rules,
  imported,
  heroImage,
  galleryImages,
  itemImages,
  variantImages,
  productName,
  onBack,
  onStep,
  onSet,
  onSetRule,
  onSaveDetails,
  onPickProduct,
  onPickVariantSku,
  onPickQty,
  onAddItem,
  onDropItem,
  onRemoveImage,
  onUploadImages,
  onUploadImagesForRole,
  onSelectHero,
  onToggleGalleryImage,
  onToggleItemImage,
  onSetItemLabel,
  onToggleVariantImage,
  onSetVariantLabel,
  onSaveImageRoles,
  onPublish,
  onSaveDraft,
}: KitWizardVm) {
  return (
    <>
      <PlatformPageHeader
        title={mode === "edit" ? "Edit kit" : "New kit"}
        subtitle="Curate a predefined gift kit from catalog products, with rules company admins must follow."
        actions={
          <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
            Back to kits
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
              i === step ? { borderColor: "var(--brand)", color: "var(--brand-d)", fontWeight: "var(--font-weight-bold)" } : undefined
            }
            disabled={!id && i > 0}
            onClick={() => id && onStep(i)}
          >
            {i + 1}. {imported && i === 1 ? "Bundle" : label}
          </button>
        ))}
      </div>

      {error && <PlatformError message={error} />}

      <div className="card" style={{ padding: 22, maxWidth: 860 }}>
        {step === 0 && (
          <>
            <div className="row" style={{ gap: 14 }}>
              <div className="field" style={{ flex: 2 }}>
                <label className="lbl">Kit name</label>
                <input className="inp" value={details.name} onChange={(e) => onSet("name", e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label className="lbl">Packaging</label>
                <select className="inp" value={details.packaging} onChange={(e) => onSet("packaging", e.target.value)}>
                  {(["none", "box", "premium_box"] as const).map((p) => (
                    <option key={p} value={p}>
                      {p.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label className="lbl">Approx value (₹)</label>
                <input
                  className="inp"
                  type="number"
                  value={details.approxValueInr}
                  onChange={(e) => onSet("approxValueInr", Number(e.target.value))}
                />
              </div>
            </div>
            <div className="field">
              <label className="lbl">Description</label>
              <textarea
                className="inp"
                rows={2}
                value={details.description}
                onChange={(e) => onSet("description", e.target.value)}
              />
            </div>
            <div className="field">
              <label className="lbl">Eligible campaign types</label>
              <div className="row" style={{ flexWrap: "wrap", gap: 0 }}>
                {campaignTypes.map((t) => {
                  const on = (details.eligibleCampaignTypes ?? []).includes(t);
                  return (
                    <button
                      type="button"
                      key={t}
                      className="chip"
                      style={on ? { borderColor: "var(--brand)", color: "var(--brand-d)" } : undefined}
                      onClick={() =>
                        onSet(
                          "eligibleCampaignTypes",
                          on
                            ? (details.eligibleCampaignTypes ?? []).filter((x) => x !== t)
                            : [...(details.eligibleCampaignTypes ?? []), t],
                        )
                      }
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="card" style={{ padding: 16, background: "var(--surface-2)" }}>
              <div className="eyebrow" style={{ marginBottom: 12 }}>
                Rules
              </div>
              <label className="row" style={{ gap: 9, alignItems: "center", marginBottom: 10, fontSize: 13.5 }}>
                <input
                  type="checkbox"
                  checked={!!rules.fixedComposition}
                  onChange={(e) => onSetRule("fixedComposition", e.target.checked)}
                />
                Fixed composition. Tenants must use this kit as-is
              </label>
              <label className="row" style={{ gap: 9, alignItems: "center", marginBottom: 10, fontSize: 13.5 }}>
                <input
                  type="checkbox"
                  checked={!!rules.customizationAllowed}
                  onChange={(e) => onSetRule("customizationAllowed", e.target.checked)}
                />
                Customization allowed. Tenants may add their logo/branding
              </label>
              <label
                className="row"
                style={{
                  gap: 12,
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 14,
                  fontSize: 13.5,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                }}
              >
                <span style={{ flex: 1, lineHeight: 1.4 }}>
                  <span style={{ fontWeight: "var(--font-weight-semibold)", display: "block" }}>Require logo</span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    On: tenants must upload a logo. Off: hide the logo step (for kits that do not need one).
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={rules.requireLogo === true}
                  onChange={(e) => onSetRule("requireLogo", e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: "var(--brand, #111)" }}
                />
              </label>
              <div className="row" style={{ gap: 14 }}>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="lbl">Min qty / recipient</label>
                  <input
                    className="inp"
                    type="number"
                    value={rules.minQtyPerRecipient}
                    onChange={(e) => onSetRule("minQtyPerRecipient", Number(e.target.value))}
                  />
                </div>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="lbl">Max qty / recipient</label>
                  <input
                    className="inp"
                    type="number"
                    value={rules.maxQtyPerRecipient}
                    onChange={(e) => onSetRule("maxQtyPerRecipient", Number(e.target.value))}
                  />
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-brand"
              style={{ marginTop: 18 }}
              disabled={busy || !details.name}
              onClick={onSaveDetails}
            >
              {id ? "Save & continue" : "Create draft & continue"}
            </button>
          </>
        )}

        {step === 1 && imported && (
          <>
            <h3 style={{ marginBottom: 12 }}>Curated bundle</h3>
            <div className="banner info" style={{ marginBottom: 14 }}>
              This kit was imported from {kit?.source?.provider === "shopify" ? "Shopify" : "an external source"}{" "}
              as a complete, pre-set bundle. Its contents are fixed. There are no individual products or variants to
              add here.
            </div>
            <p className="muted" style={{ marginBottom: 14 }}>
              {kit?.description || "No description provided."}
            </p>
            <div className="row" style={{ gap: 8, marginTop: 18 }}>
              <button type="button" className="btn btn-ghost" onClick={() => onStep(0)}>
                Back
              </button>
              <button type="button" className="btn btn-brand" onClick={() => onStep(2)}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === 1 && !imported && (
          <>
            <h3 style={{ marginBottom: 12 }}>Kit items</h3>
            {kit?.items?.length ? (
              <table className="tbl" style={{ marginBottom: 14 }}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Variant</th>
                    <th>Qty</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {kit.items.map((it) => (
                    <tr key={it._id}>
                      <td>{productName(it.catalogProductId)}</td>
                      <td className="muted">{it.variantSku || "N/A"}</td>
                      <td>{it.qty ?? 1}</td>
                      <td style={{ textAlign: "right" }}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDropItem(it._id)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted" style={{ marginBottom: 14 }}>
                No items yet. Add catalog products to this kit.
              </p>
            )}
            <div className="row" style={{ gap: 10, alignItems: "flex-end" }}>
              <div className="field" style={{ flex: 2, marginBottom: 0 }}>
                <label className="lbl">Product</label>
                <select className="inp" value={pickProductId} onChange={(e) => onPickProduct(e.target.value)}>
                  <option value="">Select a product…</option>
                  {products.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                <label className="lbl">Variant</label>
                <select
                  className="inp"
                  value={pickVariantSku}
                  onChange={(e) => onPickVariantSku(e.target.value)}
                  disabled={!pickVariants.length}
                >
                  <option value="">{pickVariants.length ? "Any" : "N/A"}</option>
                  {pickVariants.map((v) => (
                    <option key={v.sku} value={v.sku}>
                      {[v.size, v.color].filter(Boolean).join(" / ") || v.sku}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ width: 90, marginBottom: 0 }}>
                <label className="lbl">Qty</label>
                <input
                  className="inp"
                  type="number"
                  min={1}
                  value={pickQty}
                  onChange={(e) => onPickQty(Number(e.target.value))}
                />
              </div>
              <button type="button" className="btn btn-soft" disabled={busy || !pickProductId} onClick={onAddItem}>
                Add
              </button>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 18 }}>
              <button type="button" className="btn btn-ghost" onClick={() => onStep(0)}>
                Back
              </button>
              <button type="button" className="btn btn-brand" onClick={() => onStep(2)}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h3 style={{ marginBottom: 12 }}>Kit images</h3>
            <p className="muted" style={{ marginBottom: 20, fontSize: 13 }}>
              Upload images for the kit cover, included products, and colour variants. You can also pick
              from images already in the gallery below each section.
            </p>

            <div className="card" style={{ padding: 16, marginBottom: 20, background: "var(--surface-2)" }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>
                Image gallery
              </div>
              <div className="row" style={{ flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
                {(kit?.imageUrls ?? []).map((url) => (
                  <div
                    key={url}
                    style={{ position: "relative", width: 90, height: 90, flex: "0 0 auto" }}
                  >
                    <img
                      src={kitImageSrc(url)}
                      alt=""
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        borderRadius: 8,
                        border: "1px solid var(--line)",
                        display: "block",
                      }}
                    />
                    <button
                      type="button"
                      aria-label="Remove image from kit"
                      disabled={busy}
                      onClick={() => onRemoveImage(url)}
                      style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        width: 22,
                        height: 22,
                        borderRadius: 999,
                        border: "none",
                        background: "rgba(15, 23, 42, 0.78)",
                        color: "#fff",
                        cursor: busy ? "not-allowed" : "pointer",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 14,
                        lineHeight: 1,
                        padding: 0,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {!kit?.imageUrls?.length && <p className="muted">No images uploaded yet.</p>}
              </div>
              <KitRoleUploadButton
                label="Upload to gallery"
                multiple
                disabled={busy}
                onFiles={(files) => onUploadImages(files)}
              />
            </div>

            <h3 style={{ margin: "0 0 8px" }}>Hero Image</h3>
            <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
              Upload or select exactly one image used as the kit cover.
            </p>
            <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
              <KitRoleUploadButton
                label="Upload hero image"
                disabled={busy}
                onFiles={(files) => onUploadImagesForRole(files, "hero")}
              />
              {heroImage ? (
                <img
                  src={kitImageSrc(heroImage)}
                  alt="Current hero"
                  style={{
                    width: 56,
                    height: 56,
                    objectFit: "cover",
                    borderRadius: 6,
                    border: "1px solid var(--line)",
                  }}
                />
              ) : null}
            </div>
            {(kit?.imageUrls ?? []).length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 8 }}>
                {(kit?.imageUrls ?? []).map((url, idx) => (
                  <label
                    key={`hero-${url}`}
                    className="row"
                    style={{
                      gap: 12,
                      alignItems: "center",
                      padding: 10,
                      border: "1px solid var(--line)",
                      borderRadius: 8,
                      background: heroImage === url ? "var(--surface-2)" : "transparent",
                    }}
                  >
                    <input
                      type="radio"
                      name="heroImage"
                      checked={heroImage === url}
                      onChange={() => onSelectHero(url)}
                    />
                    <img
                      src={kitImageSrc(url)}
                      alt=""
                      style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)" }}
                    />
                    <span style={{ fontSize: 13, fontWeight: "var(--font-weight-semibold)" }}>Image {idx + 1}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                Upload a hero image above to get started.
              </p>
            )}

            <h3 style={{ margin: "24px 0 8px" }}>Gallery</h3>
            <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
              Select one or more images from the image gallery to show in the kit preview above
              included products.
            </p>
            {(kit?.imageUrls ?? []).length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 8 }}>
                {(kit?.imageUrls ?? []).map((url, idx) => (
                  <label
                    key={`gallery-${url}`}
                    className="row"
                    style={{
                      gap: 12,
                      alignItems: "center",
                      padding: 10,
                      border: "1px solid var(--line)",
                      borderRadius: 8,
                      background: galleryImages.includes(url) ? "var(--surface-2)" : "transparent",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={galleryImages.includes(url)}
                      onChange={() => onToggleGalleryImage(url)}
                    />
                    <img
                      src={kitImageSrc(url)}
                      alt=""
                      style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)" }}
                    />
                    <span style={{ fontSize: 13, fontWeight: "var(--font-weight-semibold)" }}>Image {idx + 1}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                Upload images to the image gallery first, then select them here.
              </p>
            )}

            <h3 style={{ margin: "24px 0 8px" }}>Included Products</h3>
            <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
              Upload or select images that represent included products. Optional product names override
              Item 1, Item 2…
            </p>
            <div style={{ marginBottom: 12 }}>
              <KitRoleUploadButton
                label="Upload product image(s)"
                multiple
                disabled={busy}
                onFiles={(files) => onUploadImagesForRole(files, "item")}
              />
            </div>
            {(kit?.imageUrls ?? []).length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 8 }}>
                {(kit?.imageUrls ?? []).map((url, idx) => {
                  const selected = itemImages.find((it) => it.imageUrl === url);
                  return (
                    <div
                      key={`item-${url}`}
                      className="row"
                      style={{
                        gap: 12,
                        alignItems: "center",
                        padding: 10,
                        border: "1px solid var(--line)",
                        borderRadius: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <label className="row" style={{ gap: 12, alignItems: "center", flex: 1, minWidth: 220 }}>
                        <input
                          type="checkbox"
                          checked={!!selected}
                          onChange={() => onToggleItemImage(url)}
                        />
                        <img
                          src={kitImageSrc(url)}
                          alt=""
                          style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)" }}
                        />
                        <span style={{ fontSize: 13, fontWeight: "var(--font-weight-semibold)" }}>Image {idx + 1}</span>
                      </label>
                      {selected ? (
                        <input
                          className="inp"
                          style={{ flex: 1, minWidth: 160 }}
                          placeholder="Product name (optional)"
                          value={selected.label || ""}
                          onChange={(e) => onSetItemLabel(url, e.target.value)}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                Upload product images above to mark included items.
              </p>
            )}

            <h3 style={{ margin: "24px 0 8px" }}>Variants</h3>
            <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
              Upload or select colour/appearance variants of this kit. These are not separate kits.
              Optional names are shown to senders and recipients when choosing a variant.
            </p>
            <div style={{ marginBottom: 12 }}>
              <KitRoleUploadButton
                label="Upload variant image(s)"
                multiple
                disabled={busy}
                onFiles={(files) => onUploadImagesForRole(files, "variant")}
              />
            </div>
            {(kit?.imageUrls ?? []).length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(kit?.imageUrls ?? []).map((url, idx) => {
                  const selected = variantImages.find((v) => v.imageUrl === url);
                  return (
                    <div
                      key={`variant-${url}`}
                      className="row"
                      style={{
                        gap: 12,
                        alignItems: "center",
                        padding: 10,
                        border: "1px solid var(--line)",
                        borderRadius: 8,
                        flexWrap: "wrap",
                        background: selected ? "var(--surface-2)" : "transparent",
                      }}
                    >
                      <label className="row" style={{ gap: 12, alignItems: "center", flex: 1, minWidth: 220 }}>
                        <input
                          type="checkbox"
                          checked={!!selected}
                          onChange={() => onToggleVariantImage(url)}
                        />
                        <img
                          src={kitImageSrc(url)}
                          alt=""
                          style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)" }}
                        />
                        <span style={{ fontSize: 13, fontWeight: "var(--font-weight-semibold)" }}>Image {idx + 1}</span>
                      </label>
                      {selected ? (
                        <input
                          className="inp"
                          style={{ flex: 1, minWidth: 160 }}
                          placeholder="Variant name (optional)"
                          value={selected.label || ""}
                          onChange={(e) => onSetVariantLabel(url, e.target.value)}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 13 }}>
                Upload variant images above to show colour options.
              </p>
            )}

            <div className="row" style={{ gap: 8, marginTop: 18 }}>
              <button type="button" className="btn btn-ghost" onClick={() => onStep(1)}>
                Back
              </button>
              <button type="button" className="btn btn-brand" disabled={busy} onClick={onSaveImageRoles}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h3 style={{ marginBottom: 12 }}>Review &amp; publish</h3>
            <p className="muted" style={{ marginBottom: 6 }}>
              {kit?.name} · {imported ? "curated bundle" : `${kit?.items?.length ?? 0} items`} · approx{" "}
              {inr(kit?.approxValueInr ?? 0)} · packaging {kit?.packaging}
            </p>
            {problems.length > 0 && (
              <ul style={{ color: "var(--danger)", margin: "10px 0", paddingLeft: 18 }}>
                {problems.map((p, index) => (
                  <li key={`${p}-${index}`}>{p}</li>
                ))}
              </ul>
            )}
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button type="button" className="btn btn-ghost" onClick={() => onStep(2)}>
                Back
              </button>
              <button type="button" className="btn btn-brand" disabled={busy} onClick={onPublish}>
                Publish kit
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
