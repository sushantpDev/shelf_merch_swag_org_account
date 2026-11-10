import { type ReactNode } from "react";
import { Link } from "react-router";
import {
  DataTable,
  inr,
  PlatformError,
  PlatformLoading,
  PlatformPageHeader,
  StatusTag,
} from "../../../platform-ui";
import type { OrdersVm } from "../controllers/useOrdersController";

const columns: {
  key: string;
  label: string;
  render?: (row: Record<string, unknown>) => ReactNode;
}[] = [
  {
    key: "orderNumber",
    label: "Order #",
    render: (r) => (
      <Link
        to={`/platform/orders/${String(r._id)}`}
        style={{ color: "var(--brand)", fontWeight: "var(--font-weight-semibold)", textDecoration: "none" }}
      >
        {String(r.orderNumber ?? "N/A")}
      </Link>
    ),
  },
  { key: "tenantName", label: "Tenant" },
  { key: "status", label: "Status", render: (r) => <StatusTag status={String(r.status)} /> },
  {
    key: "total",
    label: "Total",
    render: (r) => {
      const b = r.amountBreakdown as { total?: number } | undefined;
      return inr(Number(b?.total ?? 0));
    },
  },
  {
    key: "createdAt",
    label: "Created",
    render: (r) => new Date(String(r.createdAt)).toLocaleDateString("en-IN"),
  },
  {
    key: "open",
    label: "",
    render: (r) => (
      <Link to={`/platform/orders/${String(r._id)}`} className="btn btn-ghost btn-sm">
        Open
      </Link>
    ),
  },
];

/** Cross-tenant orders table. */
export function OrdersView({ data, error, loading }: OrdersVm) {
  return (
    <>
      <PlatformPageHeader title="Orders" subtitle="Cross-tenant order pipeline." />
      {loading && <PlatformLoading />}
      {error && <PlatformError message={error} />}
      {data && <DataTable empty="No orders yet." rows={data.items} columns={columns} />}
    </>
  );
}
