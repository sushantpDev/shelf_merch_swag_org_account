import { inr, MetricGrid, PlatformError, PlatformLoading, PlatformPageHeader } from "../../../platform-ui";
import type { DashboardVm } from "../controllers/useDashboardController";

type CriticalAlert = { kind: string; count?: number; amountInr?: number };

/** Morning glance across tenants, orders, inventory, and finance. */
export function DashboardView({ data, error, loading }: DashboardVm) {
  const alerts = (data?.sections as { criticalAlerts?: CriticalAlert[] } | undefined)?.criticalAlerts;

  return (
    <>
      <PlatformPageHeader
        title="Dashboard"
        subtitle="Morning glance across tenants, orders, inventory, and finance."
      />
      {loading && <PlatformLoading />}
      {error && <PlatformError message={error} />}
      {data && (
        <>
          <MetricGrid
            items={[
              ["Active tenants", data.cards.activeTenants],
              ["Total GMV", inr(data.cards.totalGmvInr)],
              ["Orders in progress", data.cards.ordersInProgress],
              ["Delayed orders", data.cards.delayedOrders],
              ["Open tickets", data.cards.openSupportTickets],
              ["Low stock items", data.cards.lowStockItems],
              ["Outstanding", inr(data.cards.outstandingPaymentsInr)],
            ]}
          />
          {Array.isArray(alerts) && alerts.length > 0 ? (
            <div className="card" style={{ marginTop: 24, padding: 16 }}>
              <div className="h1" style={{ fontSize: 16, marginBottom: 12 }}>
                Critical alerts
              </div>
              <ul style={{ paddingLeft: 18, color: "var(--ink-2)" }}>
                {alerts.map((a) => (
                  <li key={a.kind} style={{ marginBottom: 6 }}>
                    {a.kind.replace(/_/g, " ")}
                    {a.count != null ? ` (${a.count})` : ""}
                    {a.amountInr != null ? `: ${inr(a.amountInr)}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
