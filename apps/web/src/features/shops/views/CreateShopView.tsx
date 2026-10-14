import { useRef } from "react";
import { ArrowLeft, Upload } from "lucide-react";
import { FullscreenOverlay } from "@/components/tenant/FullscreenOverlay";
import { ShopBuilderStep } from "../ShopBuilderStep";
import { SHOP_CURRENCIES } from "../types";
import type { CreateShopVm } from "../controllers/useCreateShopController";

/** Create-shop wizard shell: details/logo steps, then the builder step. */
export function CreateShopView(vm: CreateShopVm) {
  const { draft, dispatch } = vm;
  const fileRef = useRef<HTMLInputElement>(null);

  if (draft.step === 2) {
    return (
      <ShopBuilderStep
        draft={draft}
        dispatch={dispatch}
        onExit={vm.onExit}
        onPublish={vm.onPublish}
        publishing={vm.publishing}
      />
    );
  }

  return (
    <FullscreenOverlay className="sm-create-shop-bg">
      <div className="sm-create-shop-decor" aria-hidden>
        <span className="sm-create-shop-glow sm-create-shop-glow--tl" />
        <span className="sm-create-shop-glow sm-create-shop-glow--tr" />
        <span className="sm-create-shop-glow sm-create-shop-glow--bl" />
        <span className="sm-create-shop-glow sm-create-shop-glow--br" />
        <span className="sm-create-shop-confetti sm-create-shop-confetti--1" />
        <span className="sm-create-shop-confetti sm-create-shop-confetti--2" />
        <span className="sm-create-shop-confetti sm-create-shop-confetti--3" />
        <span className="sm-create-shop-confetti sm-create-shop-confetti--4" />
        <span className="sm-create-shop-confetti sm-create-shop-confetti--5" />
        <span className="sm-create-shop-confetti sm-create-shop-confetti--6" />
        <span className="sm-create-shop-confetti sm-create-shop-confetti--7" />
        <span className="sm-create-shop-confetti sm-create-shop-confetti--8" />
        <span className="sm-create-shop-confetti sm-create-shop-confetti--9" />
        <span className="sm-create-shop-confetti sm-create-shop-confetti--10" />
        <span className="sm-create-shop-confetti sm-create-shop-confetti--11" />
        <span className="sm-create-shop-confetti sm-create-shop-confetti--12" />
        <img
          src="/create-shop/star.png"
          alt=""
          className="sm-create-shop-decor__item sm-create-shop-decor__star-tl"
        />
        <img
          src="/create-shop/shops.png"
          alt=""
          className="sm-create-shop-decor__item sm-create-shop-decor__shops"
        />
        <img
          src="/create-shop/gift.png"
          alt=""
          className="sm-create-shop-decor__item sm-create-shop-decor__gift"
        />
        <img
          src="/create-shop/dress.png"
          alt=""
          className="sm-create-shop-decor__item sm-create-shop-decor__dress"
        />
        <img
          src="/create-shop/online-shopping.png"
          alt=""
          className="sm-create-shop-decor__item sm-create-shop-decor__bags"
        />
        <img
          src="/create-shop/star.png"
          alt=""
          className="sm-create-shop-decor__item sm-create-shop-decor__star-br"
        />
      </div>
      <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 24 }}>
        <div className="card sm-create-shop-card">
          <div className="sm-create-shop-intro">
            <h1 style={{ fontSize: 40, color: "var(--brand)", lineHeight: 1.05 }}>
              {draft.step === 0 ? (
                <>
                  Let&apos;s create
                  <br />
                  your shop
                </>
              ) : (
                <>
                  Make it
                  <br />
                  yours
                </>
              )}
            </h1>
            <p className="muted" style={{ marginTop: 20, maxWidth: "34ch", lineHeight: 1.55 }}>
              {draft.step === 0
                ? "Create a shop for gifting recipients and beyond. Total control over branding, banner and products."
                : "Upload your logo so we can brand your shop. You can skip this and add it later from settings."}
            </p>
          </div>
          <div className="sm-create-shop-form">
            {draft.step === 0 ? (
              <>
                <h3 style={{ fontSize: 19, marginBottom: 16 }}>Shop details</h3>
                <div className="field">
                  <label className="lbl" htmlFor="sh-name">
                    Shop name *
                  </label>
                  <input
                    id="sh-name"
                    className="inp"
                    value={draft.name}
                    placeholder="Enter shop name"
                    autoFocus
                    onChange={(e) => dispatch({ type: "set", patch: { name: e.target.value } })}
                  />
                </div>
                <div className="field" style={{ marginTop: 18 }}>
                  <label className="lbl">Store currency *</label>
                  <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
                    {SHOP_CURRENCIES.map((option) => {
                      const selected = draft.currency === option.key;
                      return (
                        <label
                          key={option.key}
                          style={{
                            display: "flex",
                            gap: 12,
                            alignItems: "flex-start",
                            padding: "14px 16px",
                            borderRadius: 12,
                            border: selected ? "2px solid var(--brand)" : "1px solid var(--line)",
                            background: selected ? "var(--brand-50)" : "var(--surface)",
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="radio"
                            name="shop-currency"
                            checked={selected}
                            onChange={() =>
                              dispatch({ type: "set", patch: { currency: option.key } })
                            }
                            style={{ marginTop: 3 }}
                          />
                          <span>
                            <span style={{ display: "block", fontWeight: 700, fontSize: 14 }}>
                              {option.title}
                            </span>
                            <span
                              className="muted"
                              style={{ display: "block", fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}
                            >
                              {option.desc}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                {/* <div className="field" style={{ marginTop: 18 }}>
                  <label className="lbl" htmlFor="sh-domain">
                    Company email domain
                  </label>
                  <input
                    id="sh-domain"
                    className="inp"
                    value={draft.companyEmailDomain}
                    placeholder="company.com"
                    onChange={(e) =>
                      dispatch({
                        type: "set",
                        patch: { companyEmailDomain: e.target.value.replace(/^@/, "") },
                      })
                    }
                  />
                  <p className="mut3" style={{ fontSize: 11.5, margin: "8px 0 0", lineHeight: 1.5 }}>
                    Public storefront signups must use this work email domain (e.g. name@company.com).
                    Platform allowlisted emails can still join any store. You can change this later in
                    settings.
                  </p>
                </div> */}
                <p
                  className="mut3"
                  style={{ fontSize: 11.5, margin: "6px 0 16px", lineHeight: 1.5 }}
                >
                  The selected currency is permanent and cannot be changed after the shop is created.
                  The shop name can be edited later from your dashboard.
                </p>
                <button type="button" className="btn btn-dark btn-block btn-lg" onClick={vm.onNext}>
                  Next
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="lnk sm-create-shop-back"
                  onClick={() => dispatch({ type: "set", patch: { step: 0 } })}
                >
                  <ArrowLeft size={15} /> Back
                </button>
                <h3 style={{ fontSize: 22, fontFamily: "var(--disp)", margin: "0 0 4px" }}>
                  Add your logo
                </h3>
                <p className="muted" style={{ fontSize: 13, margin: "0 0 16px" }}>
                  We&apos;ll use your logo to generate assets for your shop.
                </p>
                {draft.logoUrl ? (
                  <div className="sm-create-shop-logo-preview">
                    <div className="sm-create-shop-logo-thumb">
                      <img src={draft.logoUrl} alt="Shop logo" />
                    </div>
                    <span className="sm-create-shop-logo-name">Logo uploaded</span>
                    <button
                      type="button"
                      className="xbtn"
                      aria-label="Remove logo"
                      onClick={() => vm.onRemoveLogo()}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="sm-create-shop-dropzone"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload size={28} strokeWidth={1.75} />
                    <span className="sm-create-shop-dropzone-title">Drag and drop file</span>
                    <span className="sm-create-shop-dropzone-hint">
                      Accepted: SVG, PNG, WEBP, JPEG, JPG · Max 5 MB
                    </span>
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".svg,.png,.webp,.jpeg,.jpg,image/svg+xml,image/png,image/webp,image/jpeg"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) vm.onPickLogo(f);
                    e.target.value = "";
                  }}
                />
                <div className="sm-create-shop-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => dispatch({ type: "set", patch: { step: 2 } })}
                  >
                    Skip for now
                  </button>
                  <button
                    type="button"
                    className="btn btn-dark"
                    onClick={() => dispatch({ type: "set", patch: { step: 2 } })}
                  >
                    Create shop
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </FullscreenOverlay>
  );
}
