import { BarChart3 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LoadingState } from "@/components/LoadingState";
import {
  formatStorePrice,
  inrToCredits,
  inrToPoints,
} from "@/lib/storeCurrency";
import { useShopReport, type ShopReport, type UiShop } from "../model";

/* ── formatting ─────────────────────────────────────────────────────────── */

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toLocaleString("en-IN");
}

function inrLabel(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

function weekLabel(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/* ── chart pieces ───────────────────────────────────────────────────────── */

type WeekPoint = { weekStart: string; orders: number; valueInr: number };

function OrdersTooltip({
  active,
  payload,
  valueLabel,
}: {
  active?: boolean;
  payload?: Array<{ payload: WeekPoint }>;
  valueLabel: (inr: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div
      className="card"
      style={{ padding: "8px 12px", fontSize: 12, boxShadow: "0 4px 14px rgba(0,0,0,.08)" }}
    >
      <div style={{ fontWeight: 700, marginBottom: 2 }}>Week of {weekLabel(p.weekStart)}</div>
      <div className="muted">
        {p.orders.toLocaleString("en-IN")} {p.orders === 1 ? "order" : "orders"}
      </div>
      <div className="muted">{valueLabel(p.valueInr)}</div>
    </div>
  );
}

/** Horizontal magnitude bar: thin fill on a light track, value labels in ink. */
function HBar({
  label,
  right,
  pctWidth,
}: {
  label: string;
  right: string;
  pctWidth: number;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        className="row"
        style={{ justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}
      >
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span className="muted">{right}</span>
      </div>
      <div
        style={{ height: 12, background: "var(--line-2)", borderRadius: 4, overflow: "hidden" }}
        aria-hidden="true"
      >
        <div
          style={{
            width: `${Math.max(pctWidth, 0)}%`,
            height: "100%",
            background: "var(--brand)",
            borderRadius: pctWidth >= 100 ? 4 : "4px 0 0 4px",
          }}
        />
      </div>
    </div>
  );
}

/* ── the tab ────────────────────────────────────────────────────────────── */

export function ReportsTab({ shop }: { shop: UiShop }) {
  const { data, isLoading, isError, error } = useShopReport(shop.id);

  if (isLoading && !data) {
    return <LoadingState message="Crunching shop numbers…" fullScreen={false} />;
  }
  if (isError || !data) {
    return (
      <div className="card" style={{ padding: 16, color: "var(--danger)" }}>
        {error instanceof Error ? error.message : "Could not load the shop report"}
      </div>
    );
  }

  const { totals, funnel, weekly, topProducts } = data as ShopReport;
  const usesPoints = shop.currencyMode === "points";
  const valueLabel = (inr: number) =>
    usesPoints
      ? `${inrToPoints(inr).toLocaleString("en-IN")} pts`
      : formatStorePrice(inr, "inr");
  const valueCompact = (inr: number) =>
    usesPoints
      ? `${compact(inrToPoints(inr))} pts`
      : `₹${compact(inrToCredits(inr))}`;

  const hasActivity = totals.recipients > 0 || totals.ordersCount > 0;
  if (!hasActivity) {
    return (
      <div className="card empty" style={{ padding: 48 }}>
        <div className="ic" aria-hidden="true">
          <BarChart3 size={34} color="var(--ink-3)" />
        </div>
        <h3>No activity yet</h3>
        <p>
          {usesPoints ? "Send points" : "Send credits"} from this shop and redemption analytics will
          build up here.
        </p>
      </div>
    );
  }

  const stats: Array<{ k: string; v: string; sub?: string }> = [
    {
      k: usesPoints ? "Points issued" : "Credits issued",
      v: valueCompact(totals.pointsIssuedInr),
      sub: usesPoints ? inrLabel(totals.pointsIssuedInr) : undefined,
    },
    {
      k: usesPoints ? "Points redeemed" : "Credits redeemed",
      v: valueCompact(totals.pointsRedeemedInr),
      sub: usesPoints ? inrLabel(totals.pointsRedeemedInr) : undefined,
    },
    { k: "Redemption rate", v: `${totals.redemptionRate}%` },
    { k: "Recipients", v: compact(totals.recipients) },
    { k: "Orders", v: compact(totals.ordersCount) },
    {
      k: "Order value",
      v: `₹${compact(totals.orderValueInr)}`,
      sub: totals.ordersCount > 0 ? `${inrLabel(totals.avgOrderValueInr)} avg` : undefined,
    },
  ];

  const funnelMax = Math.max(...funnel.map((f) => f.count), 1);
  const productMax = Math.max(...topProducts.map((p) => p.qty), 1);
  const weeklyHasOrders = weekly.some((w) => w.orders > 0);

  return (
    <>
      {/* KPI row */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          marginBottom: 18,
        }}
      >
        {stats.map(({ k, v, sub }) => (
          <div key={k} className="card stat">
            <div className="k">{k}</div>
            <div className="v num">{v}</div>
            {sub ? (
              <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                {sub}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div
        className="grid"
        style={{ gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)", marginBottom: 18 }}
      >
        {/* Orders over time */}
        <div className="card" style={{ padding: 22 }}>
          <h3 style={{ fontSize: 16, marginBottom: 2 }}>Orders per week</h3>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
            Redemption orders placed in this shop for the last 12 weeks
          </p>
          {weeklyHasOrders ? (
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekly} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--line-2)" strokeWidth={1} />
                  <XAxis
                    dataKey="weekStart"
                    tickFormatter={weekLabel}
                    tick={{ fontSize: 11, fill: "var(--ink-3)" }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--line-strong)" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "var(--ink-3)" }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--line-2)", opacity: 0.5 }}
                    content={<OrdersTooltip valueLabel={valueLabel} />}
                  />
                  <Bar
                    dataKey="orders"
                    fill="var(--brand)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={24}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="muted" style={{ fontSize: 13, padding: "40px 0", textAlign: "center" }}>
              No orders in the last 12 weeks.
            </p>
          )}
        </div>

        {/* Redemption funnel */}
        <div className="card" style={{ padding: 22 }}>
          <h3 style={{ fontSize: 16, marginBottom: 2 }}>Redemption funnel</h3>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
            How far recipients get after being invited
          </p>
          {funnel.map((f) => (
            <HBar
              key={f.stage}
              label={f.label}
              right={`${f.count.toLocaleString("en-IN")} · ${f.pct}%`}
              pctWidth={(f.count / funnelMax) * 100}
            />
          ))}
        </div>
      </div>

      {/* Top products */}
      {topProducts.length > 0 ? (
        <div className="card" style={{ padding: 22 }}>
          <h3 style={{ fontSize: 16, marginBottom: 2 }}>Top products</h3>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
            Most-redeemed items across this shop&apos;s campaigns
          </p>
          {topProducts.map((p) => (
            <HBar
              key={p.name}
              label={p.name}
              right={`${p.qty.toLocaleString("en-IN")} redeemed · ${valueLabel(p.valueInr)}`}
              pctWidth={(p.qty / productMax) * 100}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}
