import { type ReactNode } from "react";
import {
  DataTable,
  PlatformError,
  PlatformLoading,
  PlatformPageHeader,
  StatusTag,
} from "../../../platform-ui";
import type { ShipmentsVm } from "../controllers/useShipmentsController";
import { ShipmentCreateModal } from "./ShipmentCreateModal";
import { ShipmentManageModal } from "./ShipmentManageModal";

/** AWB tracking and delivery exceptions. */
export function ShipmentsView({
  data,
  error,
  loading,
  canWrite,
  managing,
  creating,
  onManage,
  onCloseManage,
  onOpenCreate,
  onCloseCreate,
  onReload,
  onCreateDone,
}: ShipmentsVm) {
  const columns: {
    key: string;
    label: string;
    render?: (row: Record<string, unknown>) => ReactNode;
  }[] = [
    { key: "awb", label: "AWB", render: (r) => String(r.awb ?? r.trackingNumber ?? "N/A") },
    { key: "courier", label: "Courier" },
    { key: "orderNumber", label: "Order", render: (r) => String(r.orderNumber ?? "N/A") },
    { key: "status", label: "Status", render: (r) => <StatusTag status={String(r.status)} /> },
    {
      key: "createdAt",
      label: "Created",
      render: (r) => new Date(String(r.createdAt)).toLocaleDateString("en-IN"),
    },
  ];

  if (canWrite) {
    columns.push({
      key: "manage",
      label: "",
      render: (r) => (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onManage(r)}>
          Manage
        </button>
      ),
    });
  }

  return (
    <>
      <PlatformPageHeader
        title="Shipments"
        subtitle="AWB tracking and delivery exceptions."
        actions={
          canWrite ? (
            <button type="button" className="btn btn-brand btn-sm" onClick={onOpenCreate}>
              + New shipment
            </button>
          ) : null
        }
      />
      {loading && <PlatformLoading />}
      {error && <PlatformError message={error} />}
      {data && <DataTable empty="No shipments yet." rows={data.items} columns={columns} />}
      {managing && (
        <ShipmentManageModal row={managing} onClose={onCloseManage} onChanged={onReload} />
      )}
      {creating && <ShipmentCreateModal onClose={onCloseCreate} onDone={onCreateDone} />}
    </>
  );
}
