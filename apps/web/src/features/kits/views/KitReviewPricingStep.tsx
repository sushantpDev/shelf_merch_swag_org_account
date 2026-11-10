import { useMemo } from "react";
import type { UiProduct } from "@/services/mappers";
import { customisedKitSendTotals, netPriceExGst } from "@/features/send/money";
import {
  areaPlacementKey,
  defaultPlacement,
  placementKey,
  type Placement,
} from "@/features/swag/mockup-bake";
import { kitPreferredPrintAreaKey } from "../kitPrintArea";
import { KitReviewProductThumb } from "./KitReviewProductThumb";

function formatInr(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function SummaryRow({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div
      className="row"
      style={{
        justifyContent: "space-between",
        alignItems: "baseline",
        marginTop: emphasis ? 12 : 8,
        fontSize: emphasis ? 16 : 14,
      }}
    >
      <span style={{ fontWeight: emphasis ? "var(--font-weight-bold)" : "var(--font-weight-semibold)", color: emphasis ? "var(--ink)" : "var(--ink-2)" }}>
        {label}
      </span>
      <b className="num" style={{ fontWeight: emphasis ? "var(--font-weight-bold)" : "var(--font-weight-bold)", fontSize: emphasis ? 18 : 14 }}>
        {value}
      </b>
    </div>
  );
}

/** Create-kit final step — review selected products and dynamic kit cost. */
export function KitReviewPricingStep({
  kitName,
  products,
  artworkUrl,
  placements = {},
}: {
  kitName: string;
  products: UiProduct[];
  artworkUrl?: string;
  placements?: Record<string, Placement>;
}) {
  // Packaging is chosen at send time — review shows products + kit GST only.
  const pricing = useMemo(
    () => customisedKitSendTotals(1, "none", products),
    [products],
  );

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <header style={{ marginBottom: 24 }}>
        <div className="row" style={{ gap: 10, alignItems: "center", marginBottom: 6 }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>Review &amp; Pricing</h1>
          <span className="tag tag-ready">Step 4 of 4</span>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          Confirm the items in &ldquo;{kitName}&rdquo; and the kit cost before publishing.
          Packaging and shipping are chosen when you send.
        </p>
      </header>

      <div className="card" style={{ padding: 22, marginBottom: 16 }}>
        <h3 style={{ fontSize: "var(--workspace-font-heading, 15px)", fontWeight: "var(--font-weight-bold)", margin: "0 0 14px" }}>Selected Products</h3>
        {products.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No products selected.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            {products.map((p, idx) => {
              const netPrice = netPriceExGst(Number(p.basePriceInr) || 0, p.category);
              const areaKey = kitPreferredPrintAreaKey(p);
              const draftPlacement =
                placements[areaPlacementKey(p, idx, areaKey)] ??
                placements[placementKey(p, idx)];
              const placement = draftPlacement ?? defaultPlacement(p, 1, areaKey);
              return (
                <li
                  key={p.id || p.nm}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    paddingBottom: 12,
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      width: 64,
                      height: 64,
                      borderRadius: 8,
                      overflow: "hidden",
                      background: "#fff",
                      flexShrink: 0,
                    }}
                  >
                    <KitReviewProductThumb
                      product={p}
                      artworkUrl={artworkUrl}
                      printAreaKey={areaKey}
                      placement={placement}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: "var(--font-weight-bold)", fontSize: "var(--workspace-font-body, 14px)", color: "var(--ink)" }}>{p.nm}</div>
                    {p.brand ? (
                      <div className="muted" style={{ fontSize: "var(--workspace-font-caption, 12px)" }}>{p.brand}</div>
                    ) : null}
                  </div>
                  <b className="num" style={{ fontSize: "var(--workspace-font-body, 14px)", fontWeight: "var(--font-weight-bold)" }}>
                    {formatInr(netPrice)}
                  </b>
                </li>
              );
            })}
          </ul>
        )}

        <div style={{ marginTop: 16, paddingTop: 4, borderTop: "1px solid var(--line)" }}>
          <SummaryRow label="Subtotal" value={formatInr(pricing.itemsSubtotal)} />
          <SummaryRow
            label={`GST (${Math.round(pricing.kitGstRate * 100)}%)`}
            value={formatInr(pricing.tax)}
          />
          <div className="divider" style={{ margin: "12px 0" }} />
          <SummaryRow label="Total" value={`${formatInr(pricing.costPerKit)} / kit`} emphasis />
        </div>
        <p className="muted" style={{ margin: "8px 0 0", fontSize: "var(--workspace-font-caption, 12px)" }}>
          Product prices exclude GST by category. Packaging is added at send time.
        </p>
      </div>
    </div>
  );
}
