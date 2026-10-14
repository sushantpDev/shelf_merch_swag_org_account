import { type ReactNode } from "react";
import { DataTable, PlatformError, PlatformLoading, PlatformPageHeader, StatusTag } from "../../../platform-ui";
import type { InventoryVm } from "../controllers/useInventoryController";
import type { InventoryRow } from "../model";
import { InventoryManageModal } from "./InventoryManageModal";

/** Stock levels and low-stock alerts. */
export function InventoryView({
  data,
  error,
  loading,
  canWrite,
  managing,
  onManage,
  onCloseManage,
  onInventoryChanged,
}: InventoryVm) {
  const columns: {
    key: string;
    label: string;
    render?: (row: Record<string, unknown>) => ReactNode;
  }[] = [
    { key: "name", label: "Product" },
    { key: "sku", label: "SKU" },
    {
      key: "available",
      label: "Available",
      render: (r) => (r.mode === "made_to_order" ? "N/A" : String(r.available)),
    },
    {
      key: "reserved",
      label: "Reserved",
      render: (r) => (r.mode === "made_to_order" ? "N/A" : String(r.reserved)),
    },
    { key: "lowStockThreshold", label: "Threshold" },
    {
      key: "stockStatus",
      label: "Status",
      render: (r) => <StatusTag status={String(r.stockStatus)} />,
    },
  ];

  if (canWrite) {
    columns.push({
      key: "manage",
      label: "",
      render: (r) => (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => onManage(r as unknown as InventoryRow)}
        >
          Manage
        </button>
      ),
    });
  }

  return (
    <>
      <PlatformPageHeader
        title="Inventory"
        subtitle="Stock levels and low-stock alerts. Made-to-order products aren't stocked, so they don't show an availability count."
      />
      {loading && <PlatformLoading />}
      {error && <PlatformError message={error} />}
      {data && (
        <DataTable
          empty="No inventory rows."
          rows={data.items as unknown as Record<string, unknown>[]}
          columns={columns}
        />
      )}
      {managing && (
        <InventoryManageModal
          row={managing}
          onClose={onCloseManage}
          onChanged={onInventoryChanged}
        />
      )}
    </>
  );
}
