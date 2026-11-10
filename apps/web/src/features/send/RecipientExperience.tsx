import { useMemo } from "react";
import type { ReactNode } from "react";
import { Check, PackageCheck, Truck } from "lucide-react";
import { ShopBanner } from "@/features/shops/banner";
import { unitLabelLower, type ShopCurrencyMode } from "@/lib/storeCurrency";
import type { SendMode, ScheduleDraft, WhenMode } from "./types";

const LOGO_DECO = (
  <svg viewBox="0 0 48 48" fill="var(--brand)" width={28} height={28} aria-hidden="true">
    <path
      d="M24 6c2 5 7 8 13 8-3 5-3 11 0 16-6 0-11 3-13 8-2-5-7-8-13-8 3-5 3-11 0-16 6 0 11-3 13-8Z"
      opacity=".9"
    />
    <circle cx="24" cy="24" r="6" fill="var(--brand-d)" />
  </svg>
);

const TZ_OPTIONS = [
  "Asia/Kolkata (IST)",
  "Asia/Dubai (GST)",
  "Europe/London (BST)",
  "America/New_York (EDT)",
  "Asia/Singapore (SGT)",
];

const RAINBOW = "linear-gradient(90deg, var(--brand-l) 0%, var(--brand) 50%, var(--brand-d) 100%)";

function LogoBanner() {
  return (
    <div
      className="shopbanner dotted"
      style={{ height: 96, borderRadius: 0, display: "grid", placeItems: "center" }}
    >
      <div
        style={{
          width: 46,
          height: 46,
          background: "#fff",
          borderRadius: 10,
          display: "grid",
          placeItems: "center",
        }}
      >
        {LOGO_DECO}
      </div>
    </div>
  );
}

type PreviewShopBrand = {
  name: string;
  logoUrl?: string;
  bannerConfig?: Record<string, unknown>;
};

function PreviewBrandBanner({ shopBrand }: { shopBrand?: PreviewShopBrand }) {
  if (!shopBrand) return <LogoBanner />;
  return (
    <div style={{ overflow: "hidden" }}>
      <ShopBanner source={shopBrand} height={96} radius={0} logoSize={40} layout="center" />
    </div>
  );
}

/**
 * Shared recipient-experience step: from/message editor, schedule picker, and
 * live landing-page / email previews. `kind` adapts copy for kit (items) sends;
 * points sends will pass `kind: "points"` when migrated.
 */
export function RecipientExperience({
  kind = "items",
  shopName = "Rubix",
  shopBrand,
  pointsScope = "shop",
  currencyMode = "points" as ShopCurrencyMode,
  mode = "redeem",
  itemCount = 3,
  pointsAmount = 0,
  from,
  message,
  onFrom,
  onMessage,
  when,
  onWhen,
  schedule,
  onSchedule,
  preview,
  onPreview,
  fromPlaceholder,
  messagePlaceholder,
  extraLeft,
}: {
  kind?: "items" | "points";
  shopName?: string;
  shopBrand?: PreviewShopBrand;
  pointsScope?: "stadium" | "shop";
  currencyMode?: ShopCurrencyMode;
  mode?: SendMode;
  itemCount?: number;
  pointsAmount?: number;
  from: string;
  message: string;
  onFrom: (v: string) => void;
  onMessage: (v: string) => void;
  when: WhenMode;
  onWhen: (v: WhenMode) => void;
  schedule: ScheduleDraft;
  onSchedule: (key: keyof ScheduleDraft, value: string) => void;
  preview: "landing" | "email";
  onPreview: (tab: "landing" | "email") => void;
  fromPlaceholder?: string;
  messagePlaceholder?: string;
  extraLeft?: ReactNode;
}) {
  const isPoints = kind === "points";
  const usesCredits = currencyMode === "inr";
  const unitLower = unitLabelLower(currencyMode);
  const amountLabel =
    isPoints && pointsAmount > 0
      ? usesCredits
        ? `₹${pointsAmount.toLocaleString("en-IN")} Credits`
        : `${pointsAmount.toLocaleString("en-IN")} Pts`
      : "";
  const previewFrom = from.trim() || fromPlaceholder || "";
  const previewMessage = message.trim() || messagePlaceholder || "";
  const hasPreviewFrom = Boolean(previewFrom);
  const hasPreviewMessage = Boolean(previewMessage);
  // surprise / single-location item sends ship directly; points always redeem
  const shipMode = !isPoints && mode !== "redeem";
  const showPreview = shipMode || isPoints;
  const useAnywhere = isPoints && pointsScope === "stadium";

  const { track, eta } = useMemo(() => {
    const t = "SM" + (740000000 + Math.floor(Math.random() * 9999999));
    const e = new Date(Date.now() + 5 * 86_400_000).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
    });
    return { track: t, eta: e };
  }, []);

  const headline = isPoints
    ? useAnywhere
      ? `You've been gifted ${amountLabel} from ${shopName}!`
      : `You've been gifted ${amountLabel} to ${shopName}!`
    : shipMode
      ? hasPreviewFrom
        ? `Your gift from ${previewFrom} is on its way!`
        : "Your gift is on its way!"
      : `${previewFrom || "Your team"} sent you a gift!`;
  const cta = isPoints
    ? useAnywhere
      ? `Use your ${unitLower}`
      : `Redeem your ${unitLower}`
    : shipMode
      ? "Track your shipment"
      : "Choose your gift";
  const pointsScopeCaption = isPoints
    ? useAnywhere
      ? `These ${unitLower} can be used in this shop or any connected ${unitLower} store.`
      : `These ${unitLower} can only be redeemed in this shop.`
    : "";
  const tab1 = shipMode ? "Tracking page" : "Landing page";
  const tab2 = shipMode ? "Shipping email" : "Invitation email";
  const cap1 = shipMode
    ? "Mobile tracking page recipients open to follow their parcel."
    : "Mobile-first redeem page recipients open from any device.";
  const cap2 = shipMode
    ? "The shipping confirmation that lands in their inbox."
    : "The branded email that lands in their inbox.";
  const msgCaption = shipMode
    ? "included in the shipping email & on the printed card"
    : "shown on landing page & email";

  const shipBlock = (
    <>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, margin: "10px 0" }}>
        <span className="tag tag-live">
          <span className="dot" />
          Shipped
        </span>
        <span className="tag tag-draft">ETA {eta}</span>
      </div>
      <div className="mut3" style={{ fontSize: 10, fontWeight: "var(--font-weight-bold)" }}>
        TRACKING {track} · {itemCount} item{itemCount > 1 ? "s" : ""}
      </div>
    </>
  );

  const standardLanding = (
    <div className="phone">
      <div className="bar">
        <i />
      </div>
      <PreviewBrandBanner shopBrand={shopBrand} />
      <div style={{ padding: 18, textAlign: "center" }}>
        <div
          className="mut3"
          style={{
            fontSize: 9,
            letterSpacing: ".08em",
            textTransform: "uppercase",
            fontWeight: "var(--font-weight-bold)",
          }}
        >
          {shipMode
            ? hasPreviewFrom
              ? `A gift from ${previewFrom}`
              : "A gift is on its way"
            : `${previewFrom || "Your team"} created a gift for you`}
        </div>
        <h3 style={{ fontSize: 16, margin: "8px 0", lineHeight: 1.25 }}>{headline}</h3>
        {shipMode ? (
          shipBlock
        ) : hasPreviewMessage ? (
          <p className="muted" style={{ fontSize: 11.5 }}>
            {previewMessage}
          </p>
        ) : null}
        {shipMode && hasPreviewMessage && (
          <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
            {previewMessage}
          </p>
        )}
        {!shipMode && (
          <div style={{ height: 3, borderRadius: 3, margin: "12px 0", background: RAINBOW }} />
        )}
        {pointsScopeCaption && (
          <p className="muted" style={{ fontSize: 10.5, marginBottom: 10 }}>
            {pointsScopeCaption}
          </p>
        )}
        <div
          className="btn btn-brand btn-block btn-sm"
          style={{ marginTop: shipMode ? 12 : 0, pointerEvents: "none" }}
        >
          {cta}
        </div>
        <div className="mut3" style={{ fontSize: 9, marginTop: 8 }}>
          Powered by Shelf Merch
        </div>
      </div>
    </div>
  );

  const standardEmail = (
    <div className="email-frame">
      <div className="topline">
        <i />
        <i />
        <i />
        <span className="mut3" style={{ fontSize: 10, marginLeft: 6 }}>
          inbox · {shopName} {shipMode ? "shipping" : "gift"}
        </span>
      </div>
      <PreviewBrandBanner shopBrand={shopBrand} />
      <div style={{ padding: 20, textAlign: "center" }}>
        <div
          className="mut3"
          style={{
            fontSize: 9,
            letterSpacing: ".08em",
            textTransform: "uppercase",
            fontWeight: "var(--font-weight-bold)",
          }}
        >
          {shipMode
            ? hasPreviewFrom
              ? `${previewFrom} · shipping update`
              : "Shipping update"
            : `${previewFrom || "Your team"} sent you something`}
        </div>
        <h3 style={{ fontSize: 17, margin: "8px 0" }}>{headline}</h3>
        {shipMode && shipBlock}
        {(hasPreviewMessage || hasPreviewFrom || pointsScopeCaption) && (
          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: "var(--r-sm)",
              padding: 14,
              marginTop: 6,
            }}
          >
            {hasPreviewMessage && (
              <p className="muted" style={{ fontSize: 12 }}>
                {previewMessage}
              </p>
            )}
            {pointsScopeCaption && (
              <p className="muted" style={{ fontSize: 10.5, marginTop: 8 }}>
                {pointsScopeCaption}
              </p>
            )}
            {hasPreviewFrom && (
              <>
                <div
                  style={{ height: 3, borderRadius: 3, margin: "12px 0", background: RAINBOW }}
                />
                <div
                  className="mut3"
                  style={{ fontSize: 10, fontWeight: "var(--font-weight-bold)" }}
                >
                  FROM {previewFrom.toUpperCase()}
                </div>
              </>
            )}
          </div>
        )}
        <div
          className="btn btn-dark btn-block btn-sm"
          style={{ marginTop: 12, pointerEvents: "none" }}
        >
          {cta}
        </div>
      </div>
    </div>
  );

  const shopInitials =
    shopName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "SM";

  const shipmentBrand = (
    <div className="shipment-preview__brand">
      <span className="shipment-preview__brand-mark" aria-hidden="true">
        {shopBrand?.logoUrl ? <img src={shopBrand.logoUrl} alt="" /> : shopInitials}
      </span>
      <span>
        <strong>{shopName}</strong>
        <small>Shelf Merch gifting</small>
      </span>
    </div>
  );

  const shipmentDetails = (
    <div className="shipment-preview__details">
      <div className="shipment-preview__detail-row">
        <span>Estimated delivery</span>
        <strong>{eta}</strong>
      </div>
      <div className="shipment-preview__progress" aria-label="Shipment is in transit">
        <span className="done">
          <Check size={11} strokeWidth={2.5} />
        </span>
        <i />
        <span className="current">
          <Truck size={11} strokeWidth={2.2} />
        </span>
        <i />
        <span />
      </div>
      <div className="shipment-preview__progress-labels" aria-hidden="true">
        <span>Confirmed</span>
        <span>In transit</span>
        <span>Delivered</span>
      </div>
      <div className="shipment-preview__tracking">
        <span>Tracking number</span>
        <strong>{track}</strong>
      </div>
    </div>
  );

  const shipmentNote = hasPreviewMessage ? (
    <blockquote className="shipment-preview__note">
      <p>{previewMessage}</p>
      {hasPreviewFrom && <cite>{previewFrom}</cite>}
    </blockquote>
  ) : null;

  const shipmentLanding = (
    <div className="phone shipment-phone">
      <div className="bar">
        <i />
      </div>
      <div className="shipment-phone__header">
        {shipmentBrand}
        <span>Order update</span>
      </div>
      <div className="shipment-preview__body">
        <div className="shipment-preview__icon" aria-hidden="true">
          <PackageCheck size={19} strokeWidth={2} />
        </div>
        <div className="shipment-preview__eyebrow">Shipped</div>
        <h3>Your gift is on its way!</h3>
        <p>It has left our warehouse and is heading to you.</p>
        {shipmentDetails}
        {shipmentNote}
        <div className="btn btn-dark btn-block btn-sm shipment-preview__cta">Track shipment</div>
        <div className="shipment-preview__items">
          {itemCount} item{itemCount === 1 ? "" : "s"} in this shipment
        </div>
      </div>
    </div>
  );

  const shipmentEmail = (
    <div className="email-frame shipment-email">
      <div className="shipment-email__header">
        {shipmentBrand}
        <span>Shipping update</span>
      </div>
      <div className="shipment-email__body">
        <div className="shipment-preview__eyebrow">Your order has shipped</div>
        <h3>Your gift is on its way!</h3>
        <p className="shipment-email__intro">
          Good news, your package is moving. It is expected to arrive by <strong>{eta}</strong>.
        </p>
        {shipmentDetails}
        <div className="btn btn-dark btn-block btn-sm shipment-preview__cta">Track shipment</div>
        {shipmentNote}
      </div>
      <div className="shipment-email__footer">Sent securely through Shelf Merch</div>
    </div>
  );

  const landing = shipMode ? shipmentLanding : standardLanding;
  const email = shipMode ? shipmentEmail : standardEmail;

  return (
    <div className="recipient-exp">
      <div className="recipient-exp__header">
        <h1>Recipient experience</h1>
        <p className="muted">
          {shipMode
            ? "These gifts ship directly to recipients. Preview the tracking page and shipping email they receive."
            : isPoints
              ? "Add a personal message and preview what recipients receive."
              : "Add an optional message and choose when recipients receive their gift."}
        </p>
      </div>
      <div className={`recipient-exp__grid${showPreview ? "" : " recipient-exp__grid--single"}`}>
        <div className="recipient-exp__left">
          <div className="card recipient-exp__message-card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 15, marginBottom: 10 }}>Your message</h3>
            <div className="field">
              <label className="lbl">From</label>
              <input
                className="inp"
                value={from}
                placeholder={fromPlaceholder}
                onChange={(e) => onFrom(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="lbl">
                Message{" "}
                <span
                  className="mut3"
                  style={{
                    fontWeight: "var(--font-weight-regular)",
                    textTransform: "none",
                    letterSpacing: 0,
                  }}
                >
                  {msgCaption}
                </span>
              </label>
              <textarea
                className="inp"
                rows={4}
                value={message}
                placeholder={messagePlaceholder}
                onChange={(e) => onMessage(e.target.value)}
              />
            </div>
          </div>

          <div className="card recipient-exp__schedule-card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 15, marginBottom: 10 }}>When should we send?</h3>
            <button
              type="button"
              className={`optcard ${when === "now" ? "on" : ""}`}
              onClick={() => onWhen("now")}
            >
              <div className="rd" />
              <div>
                <h4>{shipMode ? "Ship immediately after payment" : "Immediately after payment"}</h4>
              </div>
            </button>
            <button
              type="button"
              className={`optcard ${when === "sched" ? "on" : ""}`}
              style={{ marginTop: 10 }}
              onClick={() => onWhen("sched")}
            >
              <div className="rd" />
              <div>
                <h4>Schedule for later</h4>
                <p>Pick a date, time &amp; time zone</p>
              </div>
            </button>
            {when === "sched" && (
              <div className="sched-grid">
                <div>
                  <label className="lbl">Date</label>
                  <input
                    type="date"
                    className="inp"
                    value={schedule.date}
                    onChange={(e) => onSchedule("date", e.target.value)}
                  />
                </div>
                <div>
                  <label className="lbl">Time</label>
                  <input
                    type="time"
                    className="inp"
                    value={schedule.time}
                    onChange={(e) => onSchedule("time", e.target.value)}
                  />
                </div>
                <div>
                  <label className="lbl">Time zone</label>
                  <select
                    className="inp"
                    value={schedule.tz}
                    onChange={(e) => onSchedule("tz", e.target.value)}
                  >
                    {TZ_OPTIONS.map((z) => (
                      <option key={z}>{z}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {!shipMode && (
              <button
                type="button"
                className={`optcard ${when === "self" ? "on" : ""}`}
                style={{ marginTop: 10 }}
                onClick={() => onWhen("self")}
              >
                <div className="rd" />
                <div>
                  <h4>I'll share the invite link myself</h4>
                </div>
              </button>
            )}
          </div>
          {extraLeft}
        </div>

        {showPreview && (
          <div className="recipient-exp__preview card">
            <div className="row" style={{ justifyContent: "center", marginBottom: 16 }}>
              <div className="prevtabs">
                <button
                  type="button"
                  className={preview === "landing" ? "on" : ""}
                  onClick={() => onPreview("landing")}
                >
                  {tab1}
                </button>
                <button
                  type="button"
                  className={preview === "email" ? "on" : ""}
                  onClick={() => onPreview("email")}
                >
                  {tab2}
                </button>
              </div>
            </div>
            {preview === "landing" ? (
              <div style={{ maxWidth: 300, margin: "0 auto" }}>{landing}</div>
            ) : (
              <div style={{ maxWidth: 440, margin: "0 auto" }}>{email}</div>
            )}
            <p className="mut3" style={{ textAlign: "center", fontSize: 11.5, marginTop: 14 }}>
              {preview === "landing" ? cap1 : cap2}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
