import { type ReactNode } from "react";
import {
  DataTable,
  PlatformError,
  PlatformLoading,
  PlatformPageHeader,
  StatusTag,
} from "../../../platform-ui";
import type { ProductionVm } from "../controllers/useProductionController";
import { TaskManageModal } from "./TaskManageModal";

/** Task board and orders in production. */
export function ProductionView({
  board,
  tasks,
  canWrite,
  managing,
  onManage,
  onCloseManage,
  onProductionChanged,
}: ProductionVm) {
  const data = board.data;

  const taskColumns: {
    key: string;
    label: string;
    render?: (row: Record<string, unknown>) => ReactNode;
  }[] = [
    { key: "_id", label: "Task", render: (r) => String(r._id).slice(-6) },
    { key: "orderId", label: "Order", render: (r) => String(r.orderId ?? "").slice(-6) },
    { key: "assignedTo", label: "Assignee", render: (r) => String(r.assignedTo || "N/A") },
    { key: "status", label: "Status", render: (r) => <StatusTag status={String(r.status)} /> },
    { key: "qcResult", label: "QC", render: (r) => String(r.qcResult || "N/A") },
  ];

  if (canWrite) {
    taskColumns.push({
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
      <PlatformPageHeader title="Production" subtitle="Task board and orders in production." />
      {board.loading && <PlatformLoading />}
      {board.error && <PlatformError message={board.error} />}
      {data && (
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="card" style={{ padding: 16 }}>
            <div className="h1" style={{ fontSize: 16, marginBottom: 12 }}>
              Tasks by status
            </div>
            {Object.entries(data.taskBuckets).map(([status, bucket]) => (
              <div
                key={status}
                className="row"
                style={{ justifyContent: "space-between", marginBottom: 8 }}
              >
                <StatusTag status={status} />
                <span className="num">{bucket.count}</span>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div className="h1" style={{ fontSize: 16, marginBottom: 12 }}>
              Orders in production
            </div>
            {Object.entries(data.orderBuckets).map(([status, bucket]) =>
              bucket.count > 0 ? (
                <div
                  key={status}
                  className="row"
                  style={{ justifyContent: "space-between", marginBottom: 8 }}
                >
                  <StatusTag status={status} />
                  <span className="num">{bucket.count}</span>
                </div>
              ) : null,
            )}
          </div>
        </div>
      )}

      <h3 style={{ margin: "24px 0 12px" }}>Production tasks</h3>
      {tasks.error && <PlatformError message={tasks.error} />}
      {tasks.data && (
        <DataTable empty="No production tasks." rows={tasks.data.items} columns={taskColumns} />
      )}
      {managing && (
        <TaskManageModal row={managing} onClose={onCloseManage} onChanged={onProductionChanged} />
      )}
    </>
  );
}
