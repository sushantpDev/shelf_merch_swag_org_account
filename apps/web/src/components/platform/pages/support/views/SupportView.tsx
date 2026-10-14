import { type ReactNode } from "react";
import {
  DataTable,
  PlatformError,
  PlatformLoading,
  PlatformPageHeader,
  StatusTag,
} from "../../../platform-ui";
import type { SupportVm } from "../controllers/useSupportController";
import { SupportManageModal } from "./SupportManageModal";

/** Cross-tenant help desk queue (Support) / assigned handoffs (departments). */
const DESK_FILTERS: Array<{ key: "all" | "mine" | "unassigned"; label: string }> = [
  { key: "all", label: "All tickets" },
  { key: "mine", label: "Assigned to me" },
  { key: "unassigned", label: "Unassigned" },
];

function canManageRow(
  row: Record<string, unknown>,
  canWrite: boolean,
  myUserId: string,
): boolean {
  if (canWrite) return true;
  if (!myUserId) return false;
  return String(row.assignedToUserId ?? "") === myUserId;
}

export function SupportView({
  data,
  error,
  loading,
  canWrite,
  myUserId,
  filter,
  onFilter,
  managing,
  onManage,
  onCloseManage,
  onReload,
}: SupportVm) {
  const columns: {
    key: string;
    label: string;
    render?: (row: Record<string, unknown>) => ReactNode;
  }[] = [
    { key: "subject", label: "Subject" },
    { key: "tenantName", label: "Tenant", render: (r) => String(r.tenantName ?? "") || "N/A" },
    { key: "type", label: "Type" },
    { key: "status", label: "Status", render: (r) => <StatusTag status={String(r.status)} /> },
  ];

  if (canWrite) {
    columns.push({
      key: "assigneeName",
      label: "Assignee",
      render: (r) => String(r.assigneeName ?? "") || "N/A",
    });
  }

  columns.push(
    {
      key: "createdAt",
      label: "Opened",
      render: (r) => new Date(String(r.createdAt)).toLocaleDateString("en-IN"),
    },
    {
      key: "manage",
      label: "",
      render: (r) =>
        canManageRow(r, canWrite, myUserId) ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onManage(r)}>
            Manage
          </button>
        ) : null,
    },
  );

  return (
    <>
      <PlatformPageHeader
        title="Support"
        subtitle={
          canWrite
            ? "Cross-tenant help desk queue."
            : "Tickets Support assigned to you."
        }
      />
      {canWrite ? (
        <div className="tabs" style={{ maxWidth: 420, marginBottom: 14 }} role="tablist">
          {DESK_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              className={filter === f.key ? "on" : ""}
              onClick={() => onFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      ) : null}
      {loading && <PlatformLoading />}
      {error && <PlatformError message={error} />}
      {data && (
        <DataTable
          empty={canWrite ? "No tickets." : "No tickets assigned to you yet."}
          rows={data.items}
          columns={columns}
        />
      )}
      {managing && (
        <SupportManageModal
          row={managing}
          canWrite={canWrite}
          onClose={onCloseManage}
          onChanged={onReload}
        />
      )}
    </>
  );
}
