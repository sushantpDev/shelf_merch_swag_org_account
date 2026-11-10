import { ARTWORK_ACCEPT, ARTWORK_REQUIREMENTS } from "@/lib/artworkValidation";
import { inr } from "@/components/platform/platform-ui";
import { KitRedeemAddressForm } from "@/components/kit-redeem/KitRedeemAddressForm";
import { LoadingState } from "@/components/LoadingState";
import { FullscreenOverlay } from "@/components/tenant/FullscreenOverlay";
import { WizardChrome } from "@/features/swag/wizard/WizardChrome";
import {
  SAMPLE_BRANDING_PER_KIT,
  SAMPLE_SHIP_PER_KIT,
} from "@/features/send/money";
import { PaymentPanel } from "@/features/send/PaymentPanel";
import { KitPackagingStep } from "./KitPackagingStep";
import type { RequestSampleVm, SampleProductItem } from "../controllers/useRequestSampleController";
import "./request-sample.css";

function packagingLabel(pkg: RequestSampleVm["packaging"], curated: boolean) {
  if (pkg === "wrap") return "With wrapping";
  if (pkg === "box") return "With packaging";
  return curated ? "Without wrapping" : "Without packaging";
}

function packagingSectionTitle(pkg: RequestSampleVm["packaging"], curated: boolean) {
  if (curated || pkg === "wrap") return "Wrapping";
  return "Packaging";
}

function costPackagingLabel(pkg: RequestSampleVm["packaging"]) {
  if (pkg === "wrap") return "Wrapping";
  return "Packaging";
}

function CostRows({
  vm,
  showTotal = true,
}: {
  vm: RequestSampleVm;
  showTotal?: boolean;
}) {
  const t = vm.totals;
  return (
    <>
      <CostRow label="Kit" value={inr(t.unitPrice)} />
      <CostRow label={costPackagingLabel(vm.packaging)} value={inr(t.pkgCost)} />
      {/* <CostRow label="Branding" value={inr(SAMPLE_BRANDING_PER_KIT)} /> */}
      <CostRow label="Shipping" value={inr(t.ship || SAMPLE_SHIP_PER_KIT)} />
      <CostRow label={`Tax (${Math.round((t.kitGstRate ?? 0.18) * 100)}%)`} value={inr(t.tax)} />
      {showTotal ? (
        <div className="sample-cost__total">
          <b>Total</b>
          <b className="num" style={{ fontSize: 18, fontFamily: "var(--font-family-primary)" }}>
            {inr(t.total)}
          </b>
        </div>
      ) : null}
    </>
  );
}

function CostRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", padding: "7px 0" }}>
      <span className="muted" style={{ fontSize: "var(--workspace-font-caption, 13px)", ...(bold ? { color: "var(--ink)", fontWeight: "var(--font-weight-bold)" } : {}) }}>
        {label}
      </span>
      <span className="num" style={{ fontWeight: bold ? "var(--font-weight-bold)" : "var(--font-weight-semibold)", fontSize: bold ? 15 : 13 }}>
        {value}
      </span>
    </div>
  );
}

function formatAddress(address: RequestSampleVm["address"]) {
  return [
    address.name,
    address.phone,
    address.line1,
    address.line2,
    [address.city, address.state, address.pincode].filter(Boolean).join(", "),
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean);
}

function ProductCard({
  item,
  vm,
}: {
  item: SampleProductItem;
  vm: RequestSampleVm;
}) {
  const sel = item.productId ? vm.productVariants[item.productId] || {} : {};
  const showVariants =
    !vm.isCuratedKit &&
    ((item.requiresColor && item.colors.length > 0) || (item.requiresSize && item.sizes.length > 0));

  return (
    <div className="sample-product">
      <div className="sample-product__img">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} />
        ) : (
          <span className="muted" style={{ fontSize: "var(--workspace-font-caption, 12px)" }}>
            No image
          </span>
        )}
      </div>
      <div className="sample-product__name">{item.name}</div>
      {showVariants && item.productId ? (
        <div className="sample-product__variants">
          {item.requiresColor && item.colors.length > 0 ? (
            <>
              <div className="lbl">VARIANTS</div>
              <div className="sample-pills">
                {item.colors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={sel.color === color ? "btn btn-dark btn-sm" : "btn btn-ghost btn-sm"}
                    onClick={() => vm.onProductVariant(item.productId!, { color })}
                  >
                    {color}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          {item.requiresSize && item.sizes.length > 0 ? (
            <div style={{ marginTop: item.colors.length ? 10 : 0 }}>
              <div className="lbl">Size</div>
              <div className="sample-pills">
                {item.sizes.map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={sel.size === size ? "btn btn-dark btn-sm" : "btn btn-ghost btn-sm"}
                    onClick={() => vm.onProductVariant(item.productId!, { size })}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function RequestSampleView(vm: RequestSampleVm) {
  if (vm.isLoading) {
    return (
      <FullscreenOverlay>
        <LoadingState message="Loading kit…" fullScreen={false} />
      </FullscreenOverlay>
    );
  }
  if (vm.notFound || !vm.kit) {
    return (
      <div className="card" style={{ padding: 16 }}>
        Kit not found.{" "}
        <button type="button" className="lnk" onClick={vm.onBackToKits}>
          Back to kits
        </button>
      </div>
    );
  }
  if (vm.isSubmitting) {
    return (
      <FullscreenOverlay>
        <LoadingState message="Requesting sample…" fullScreen={false} />
      </FullscreenOverlay>
    );
  }

  if (vm.success) {
    const s = vm.success;
    return (
      <FullscreenOverlay>
      <main className="sample-flow" style={{ padding: "28px 34px 48px" }}>
        <section className="card sample-success">
          <h1>Sample requested successfully</h1>
          <p className="sample-flow__lead">
            Your sample has been ordered and will be delivered to the address provided.
          </p>
          {s.orderNumber ? (
            <p className="muted" style={{ marginTop: -8 }}>
              Order {s.orderNumber}
            </p>
          ) : null}

          <div className="sample-review" style={{ marginTop: 20 }}>
            <div className="card sample-review__block">
              <h3>Kit</h3>
              <div style={{ fontWeight: "var(--font-weight-bold)" }}>{s.kitName}</div>
            </div>
            <div className="card sample-review__block">
              <h3>Included products</h3>
              <div className="sample-products">
                {s.products.map((p, i) => (
                  <div key={`${p.name}-${i}`} className="sample-product">
                    <div className="sample-product__img">
                      {p.imageUrl ? <img src={p.imageUrl} alt={p.name} /> : null}
                    </div>
                    <div className="sample-product__name">
                      {p.name}
                      {p.variantLabel ? (
                        <div className="muted" style={{ fontWeight: "var(--font-weight-medium)", fontSize: "var(--workspace-font-caption, 12px)", marginTop: 4 }}>
                          {p.variantLabel}
                        </div>
                      ) : null}
                      <div className="muted" style={{ fontWeight: "var(--font-weight-medium)", fontSize: "var(--workspace-font-caption, 12px)", marginTop: 2 }}>
                        Qty {p.qty}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card sample-review__block">
              <h3>{packagingSectionTitle(s.packaging, s.isCuratedKit)}</h3>
              {packagingLabel(s.packaging, s.isCuratedKit)}
            </div>
            <div className="card sample-review__block">
              <h3>Branding</h3>
              {s.branding ? "With branding" : "Without branding"}
              {s.branding && s.logoPreview ? (
                <div className="sample-logo__preview" style={{ marginTop: 12 }}>
                  <img src={s.logoPreview} alt="Uploaded logo" />
                </div>
              ) : null}
            </div>
            <div className="card sample-review__block">
              <h3>Delivery address</h3>
              {formatAddress(s.address).map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
            <div className="card sample-review__block">
              <h3>Total</h3>
              <b className="num" style={{ fontSize: 22, fontFamily: "var(--font-family-primary)" }}>
                {inr(s.total)}
              </b>
            </div>
          </div>

          <div className="sample-success__actions">
            <button type="button" className="btn btn-brand" onClick={vm.onViewOrder}>
              View Order / Track Sample
            </button>
            <button type="button" className="btn btn-ghost" onClick={vm.onBackToKits}>
              Back to Kits
            </button>
          </div>
        </section>
      </main>
      </FullscreenOverlay>
    );
  }

  const footer = (
    <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
      {vm.step === 0 ? (
        <button type="button" className="lnk" style={{ background: "none", border: "none", cursor: "pointer" }} onClick={vm.onExit}>
          Cancel
        </button>
      ) : (
        <button type="button" className="lnk" style={{ background: "none", border: "none", cursor: "pointer" }} onClick={vm.onBack}>
          Back
        </button>
      )}
      {vm.step === 3 ? (
        <button type="button" className="btn btn-brand" onClick={vm.onRequestSample}>
          Request Sample
        </button>
      ) : vm.step === 2 ? (
        <button type="button" className="btn btn-brand" onClick={vm.onNext}>
          Continue to Review
        </button>
      ) : (
        <button type="button" className="btn btn-dark" onClick={vm.onNext}>
          Next
        </button>
      )}
    </div>
  );

  const steps = vm.isCuratedKit
    ? ["Items", "Wrapping & Branding", "Address", "Review"]
    : ["Items", "Packaging & Branding", "Address", "Review"];

  return (
    <WizardChrome
      title="Request a Sample"
      steps={steps}
      activeIndex={vm.step}
      onExit={vm.onExit}
      exitLabel="Cancel"
      footer={footer}
    >
      <div className="sample-flow">
        {vm.step === 0 ? <ItemsStep vm={vm} /> : null}
        {vm.step === 1 ? <PackagingBrandingStep vm={vm} /> : null}
        {vm.step === 2 ? (
          <KitRedeemAddressForm
            address={vm.address}
            onChange={vm.onAddress}
            heading="Delivery Address"
            supportingText="Enter the address where you'd like to receive your sample."
            showFieldErrors={vm.showAddressErrors}
          />
        ) : null}
        {vm.step === 3 ? <ReviewStep vm={vm} /> : null}
      </div>
    </WizardChrome>
  );
}

function ItemsStep({ vm }: { vm: RequestSampleVm }) {
  return (
    <>
      <h1>Included products ({vm.items.length})</h1>
      <p className="sample-flow__lead">
        These items are fixed for {vm.kitName}. Select a variant where the product has options.
      </p>
      <div className="sample-products">
        {vm.items.map((item) => (
          <ProductCard key={item.key} item={item} vm={vm} />
        ))}
      </div>
      {vm.isCuratedKit && vm.curatedVariants.length > 0 ? (
        <div className="sample-section" style={{ marginTop: 28 }}>
          <h2>VARIANTS</h2>
          <p className="muted" style={{ margin: "0 0 14px", fontSize: "var(--workspace-font-caption, 13.5px)" }}>
            Choose the look you want for this sample.
          </p>
          <div className="sample-variants-grid">
            {vm.curatedVariants.map((variant) => {
              const selected = vm.curatedVariantImage === variant.imageUrl;
              return (
                <button
                  key={`${variant.imageUrl}-${variant.label}`}
                  type="button"
                  className="card"
                  onClick={() => vm.onCuratedVariant(variant.imageUrl)}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: selected ? "2px solid var(--brand)" : "1px solid var(--line)",
                    background: selected ? "var(--surface-2)" : undefined,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      aspectRatio: "1",
                      borderRadius: 8,
                      overflow: "hidden",
                      background: "var(--gray-100)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 8,
                    }}
                  >
                    <img
                      src={variant.imageUrl}
                      alt={variant.label}
                      style={{ maxWidth: "90%", maxHeight: "90%", objectFit: "contain" }}
                    />
                  </div>
                  <div style={{ fontSize: "var(--workspace-font-caption, 12px)", fontWeight: "var(--font-weight-bold)" }}>{variant.label}</div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </>
  );
}

function PackagingBrandingStep({ vm }: { vm: RequestSampleVm }) {
  return (
    <div className="sample-flow__grid">
      <div>
        <div className="sample-section">
          <h2>{vm.isCuratedKit ? "Wrapping" : "Packaging & Wrapping"}</h2>
          {vm.isCuratedKit ? (
            <KitPackagingStep
              kitName={vm.kitName}
              packaging={vm.packaging}
              onPackaging={vm.onPackaging}
              wrapPrice={vm.wrapPrice}
              noneTitle="Without wrapping"
              wrapTitle="With wrapping"
              noneDesc="Items ship in standard protective mailers."
              wrapDesc="Sample ships in branded gift wrapping."
              options="wrap"
              embedded
            />
          ) : (
            <KitPackagingStep
              kitName={vm.kitName}
              packaging={vm.packaging}
              onPackaging={vm.onPackaging}
              boxPrice={vm.packagingPrice}
              wrapPrice={vm.wrapPrice}
              noneTitle="Without packaging"
              boxTitle="With packaging"
              wrapTitle="With wrapping"
              noneDesc="Items ship in standard protective mailers."
              boxDesc="Sample ships in a branded kit box."
              wrapDesc="Sample ships in branded gift wrapping."
              options="box-and-wrap"
              embedded
            />
          )}
        </div>

        <div className="sample-section">
          <h2>Branding</h2>
          <div className="sample-choice">
            <button
              type="button"
              className={`sample-choice__btn${vm.brandingEnabled ? "" : " on"}`}
              onClick={() => vm.onBranding(false)}
            >
              <span className="rd" />
              <span>
                <b>Without branding</b>
                <div className="muted" style={{ fontSize: "var(--workspace-font-caption, 13px)", marginTop: 2 }}>
                  No logo applied 
                </div>
              </span>
            </button>
            <button
              type="button"
              className={`sample-choice__btn${vm.brandingEnabled ? " on" : ""}`}
              onClick={() => vm.onBranding(true)}
            >
              <span className="rd" />
              <span>
                <b>With branding</b>
                <div className="muted" style={{ fontSize: "var(--workspace-font-caption, 13px)", marginTop: 2 }}>
                  Logo in product placeholders
                </div>
              </span>
            </button>
          </div>

          {vm.brandingEnabled ? (
            <>
              <h3 style={{ fontSize: "var(--workspace-font-heading, 15px)", margin: "18px 0 10px" }}>Upload your logo</h3>
              <div className="card sample-logo">
                <div>
                  <div className="sample-logo__preview">
                    {vm.logoPreview ? (
                      <img src={vm.logoPreview} alt="Logo preview" />
                    ) : (
                      <span className="muted" style={{ fontSize: "var(--workspace-font-caption, 12px)", textAlign: "center", padding: 8 }}>
                        Logo preview
                      </span>
                    )}
                  </div>
                  <div className="row" style={{ gap: 8, marginTop: 10 }}>
                    <label
                      className="btn btn-ghost btn-sm"
                      style={{
                        cursor: vm.isUploadingLogo ? "wait" : "pointer",
                        opacity: vm.isUploadingLogo ? 0.7 : 1,
                      }}
                    >
                      {vm.isUploadingLogo ? "Uploading…" : vm.logoPreview ? "Replace logo" : "Upload logo"}
                      <input
                        type="file"
                        accept={ARTWORK_ACCEPT}
                        title={ARTWORK_REQUIREMENTS}
                        hidden
                        disabled={vm.isUploadingLogo}
                        onChange={(e) => {
                          vm.onLogoFile(e.target.files?.[0] || null);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {vm.logoPreview ? (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={vm.onClearLogo}>
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="muted" style={{ margin: 0, fontSize: "var(--workspace-font-caption, 13.5px)", lineHeight: 1.55, flex: 1, minWidth: 200 }}>
                  {ARTWORK_REQUIREMENTS}{" "}
                  Your logo will be applied to the designated branding placeholders on the products, as shown
                  in the product images.
                </p>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <aside className="card sample-cost">
        <h3>Cost summary</h3>
        <CostRows vm={vm} />
      </aside>
    </div>
  );
}

function ReviewStep({ vm }: { vm: RequestSampleVm }) {
  const curatedVariantLabel = vm.curatedVariants.find((v) => v.imageUrl === vm.curatedVariantImage)?.label;

  return (
    <>
      <h1>Review Sample Order</h1>
      <p className="sample-flow__lead">Confirm what you will receive, the delivery address, and the total.</p>
      <div className="sample-flow__grid">
        <div className="sample-review">
          <div className="card sample-review__block">
            <h3>Kit</h3>
            <div style={{ fontWeight: "var(--font-weight-bold)", fontSize: 16 }}>{vm.kitName}</div>
          </div>

          <div className="card sample-review__block">
            <h3>Included products</h3>
            <div className="sample-products">
              {vm.items.map((item) => {
                const sel = item.productId ? vm.productVariants[item.productId] : undefined;
                const variant = vm.isCuratedKit
                  ? curatedVariantLabel
                  : [sel?.color, sel?.size].filter(Boolean).join(" · ");
                return (
                  <div key={item.key} className="sample-product">
                    <div className="sample-product__img">
                      {item.imageUrl ? <img src={item.imageUrl} alt={item.name} /> : null}
                    </div>
                    <div className="sample-product__name">
                      {item.name}
                      {variant ? (
                        <div className="muted" style={{ fontWeight: "var(--font-weight-medium)", fontSize: "var(--workspace-font-caption, 12px)", marginTop: 4 }}>
                          {variant}
                        </div>
                      ) : null}
                      <div className="muted" style={{ fontWeight: "var(--font-weight-medium)", fontSize: "var(--workspace-font-caption, 12px)", marginTop: 2 }}>
                        Qty {item.qty}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card sample-review__block">
            <h3>{packagingSectionTitle(vm.packaging, vm.isCuratedKit)}</h3>
            {packagingLabel(vm.packaging, vm.isCuratedKit)}
          </div>

          <div className="card sample-review__block">
            <h3>Branding</h3>
            {vm.brandingEnabled ? "With branding" : "Without branding"}
            {vm.brandingEnabled && vm.logoPreview ? (
              <div className="sample-logo__preview" style={{ marginTop: 12 }}>
                <img src={vm.logoPreview} alt="Uploaded logo" />
              </div>
            ) : null}
            {vm.brandingEnabled ? (
              <p className="muted" style={{ margin: "12px 0 0", fontSize: "var(--workspace-font-caption, 13px)", lineHeight: 1.5 }}>
                Your logo will appear in the branding placeholders on applicable products.
              </p>
            ) : null}
          </div>

          <div className="card sample-review__block">
            <h3>Delivery address</h3>
            {formatAddress(vm.address).map((line) => (
              <div key={line}>{line}</div>
            ))}
            <button type="button" className="lnk" style={{ marginTop: 12 }} onClick={vm.onEditAddress}>
              Edit Address
            </button>
          </div>
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <PaymentPanel
            wallet={vm.wallet}
            wallets={vm.wallets}
            selected={vm.pay}
            onSelect={vm.onPay}
            selectedWalletId={vm.selectedWalletId}
            onWalletSelect={vm.onWalletSelect}
            walletAvailable={vm.walletAvailable}
            walletPayEnabled={vm.walletPayEnabled}
            walletDisabledHint={vm.walletDisabledHint}
            walletDisabledBadge={vm.walletDisabledBadge}
          />
          <div className="card sample-cost">
            <h3>Cost breakup</h3>
            <CostRows vm={vm} />
          </div>
        </aside>
      </div>
    </>
  );
}
