import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import {
  DataTable,
  inr,
  PlatformError,
  PlatformLoading,
  PlatformPageHeader,
  StatusTag,
} from "../../../platform-ui";
import type { TenantsVm } from "../controllers/useTenantsController";
import {
  formatRelativeTime,
  formatTenantStatus,
  PAGE_SIZES,
  STATUS_FILTERS,
  type TenantRow,
} from "../model";
import { TenantStatusModal } from "./TenantStatusModal";

function TenantActionsMenu({
  row,
  canWrite,
  onManage,
}: {
  row: TenantRow;
  canWrite: boolean;
  onManage: (row: TenantRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setMenuPos(null);
      return;
    }
    const place = () => {
      const btn = btnRef.current;
      const menu = menuRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const menuHeight = menu?.offsetHeight ?? 220;
      const menuWidth = menu?.offsetWidth ?? 180;
      const gap = 4;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < menuHeight + gap && rect.top > menuHeight + gap;
      const top = openUp ? rect.top - menuHeight - gap : rect.bottom + gap;
      const left = Math.min(
        Math.max(8, rect.right - menuWidth),
        window.innerWidth - menuWidth - 8,
      );
      setMenuPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isArchived = row.status === "archived";

  const menu =
    open &&
    createPortal(
      <div
        ref={menuRef}
        role="menu"
        className="card platform-tenant-actions-menu"
        style={{
          position: "fixed",
          top: menuPos?.top ?? -9999,
          left: menuPos?.left ?? -9999,
          zIndex: 80,
          minWidth: 180,
          padding: 6,
          display: "grid",
          gap: 2,
          visibility: menuPos ? "visible" : "hidden",
        }}
      >
        <Link
          role="menuitem"
          to={`/platform/tenants/${row._id}`}
          className="btn btn-ghost btn-sm"
          style={{ justifyContent: "flex-start" }}
          onClick={() => setOpen(false)}
        >
          Open tenant
        </Link>
        {canWrite && (
          <button
            type="button"
            role="menuitem"
            className="btn btn-ghost btn-sm"
            style={{ justifyContent: "flex-start" }}
            onClick={() => {
              setOpen(false);
              onManage(row);
            }}
          >
            {isArchived ? "Restore…" : "Manage status"}
          </button>
        )}
        <Link
          role="menuitem"
          to={`/platform/tenants/${row._id}?tab=users`}
          className="btn btn-ghost btn-sm"
          style={{ justifyContent: "flex-start" }}
          onClick={() => setOpen(false)}
        >
          View users
        </Link>
        <Link
          role="menuitem"
          to={`/platform/orders?tenantId=${row._id}`}
          className="btn btn-ghost btn-sm"
          style={{ justifyContent: "flex-start" }}
          onClick={() => setOpen(false)}
        >
          View orders
        </Link>
        <Link
          role="menuitem"
          to={`/platform/tenants/${row._id}?tab=audit`}
          className="btn btn-ghost btn-sm"
          style={{ justifyContent: "flex-start" }}
          onClick={() => setOpen(false)}
        >
          View audit logs
        </Link>
      </div>,
      document.body,
    );

  return (
    <div style={{ display: "inline-block" }}>
      <button
        ref={btnRef}
        type="button"
        className="btn btn-soft btn-sm platform-tenant-actions-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Actions
      </button>
      {menu}
    </div>
  );
}

/** Phase 1 operational tenant directory. */
export function TenantsView(vm: TenantsVm) {
  const {
    data,
    error,
    loading,
    params,
    searchDraft,
    canWrite,
    managing,
    hasActiveFilters,
    onSearchDraft,
    onSearchSubmit,
    onStatusFilter,
    onSort,
    onOrder,
    onPage,
    onLimit,
    onClearFilters,
    onManage,
    onCloseManage,
    onTenantsChanged,
    onRetry,
  } = vm;

  const columns: {
    key: string;
    label: string;
    align?: "left" | "center" | "right";
    render?: (row: Record<string, unknown>) => ReactNode;
  }[] = [
    {
      key: "name",
      label: "Tenant",
      render: (r) => {
        const row = r as unknown as TenantRow;
        return (
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            {row.logoUrl ? (
              <img
                src={row.logoUrl}
                alt=""
                width={28}
                height={28}
                style={{ borderRadius: 6, objectFit: "cover", background: "var(--gray-100)" }}
              />
            ) : (
              <div
                aria-hidden
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: "var(--gray-100)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 11,
                  fontWeight: "var(--font-weight-semibold)",
                  color: "var(--muted)",
                }}
              >
                {row.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <Link
                to={`/platform/tenants/${row._id}`}
                style={{ fontWeight: "var(--font-weight-semibold)", color: "inherit", textDecoration: "none" }}
              >
                {row.name}
              </Link>
              <div className="muted" style={{ fontSize: 12 }}>
                @{row.slug}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      align: "center",
      render: (r) => <StatusTag status={String(r.status)} />,
    },
    {
      key: "primaryAdmin",
      label: "Primary Admin",
      render: (r) => {
        const admin = (r as unknown as TenantRow).primaryAdmin;
        if (!admin) return <span className="muted">Not assigned</span>;
        return (
          <div>
            <div>{admin.name || admin.email}</div>
            {admin.name ? (
              <div className="muted" style={{ fontSize: 12 }}>
                {admin.email}
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "userCount",
      label: "Users",
      align: "center",
      render: (r) => (
        <span className="platform-tenant-num">{Number(r.userCount ?? 0)}</span>
      ),
    },
    {
      key: "walletBudgetBalanceInr",
      label: "Approved Budget",
      align: "center",
      render: (r) => (
        <span className="platform-tenant-num">
          {inr(Number(r.walletBudgetBalanceInr ?? r.walletBalanceInr ?? 0))}
        </span>
      ),
    },
    {
      key: "walletAllocatedInr",
      label: "Allocated",
      align: "center",
      render: (r) => (
        <span className="platform-tenant-num">{inr(Number(r.walletAllocatedInr ?? 0))}</span>
      ),
    },
    {
      key: "walletAvailableInr",
      label: "Available",
      align: "center",
      render: (r) => (
        <span className="platform-tenant-num platform-tenant-num--avail">
          {inr(Number(r.walletAvailableInr ?? 0))}
        </span>
      ),
    },
    {
      key: "openOrders",
      label: "Open Orders",
      align: "center",
      render: (r) => {
        const count = Number(r.openOrders ?? 0);
        return (
          <Link
            to={`/platform/orders?tenantId=${String(r._id)}`}
            className="platform-tenant-num platform-tenant-num--link"
          >
            {count}
          </Link>
        );
      },
    },
    {
      key: "lastActiveAt",
      label: "Last Active",
      align: "center",
      render: (r) => (
        <span className="muted" style={{ fontSize: 13 }}>
          {formatRelativeTime((r as { lastActiveAt?: string | null }).lastActiveAt)}
        </span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      align: "center",
      render: (r) => (
        <TenantActionsMenu
          row={r as unknown as TenantRow}
          canWrite={canWrite}
          onManage={onManage}
        />
      ),
    },
  ];

  const total = data?.total ?? 0;
  const page = data?.page ?? params.page;
  const limit = data?.limit ?? params.limit;
  const totalPages = data?.totalPages ?? 1;
  const emptyMessage = hasActiveFilters ? "No tenants match your filters." : "No tenants yet.";

  return (
    <>
      <PlatformPageHeader
        title="Tenants"
        subtitle="Operational directory of workspaces on the platform."
      />

      <div
        className="card"
        style={{
          padding: 12,
          marginBottom: 14,
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSearchSubmit();
          }}
          style={{ display: "flex", gap: 8, flex: "1 1 240px" }}
        >
          <input
            className="inp"
            placeholder="Search name, slug, or admin email"
            value={searchDraft}
            onChange={(e) => onSearchDraft(e.target.value)}
            aria-label="Search tenants"
          />
          <button type="submit" className="btn btn-soft btn-sm">
            Search
          </button>
        </form>

        <select
          className="inp"
          style={{ width: "auto", minWidth: 160 }}
          value={params.status || "all"}
          onChange={(e) => onStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        <select
          className="inp"
          style={{ width: "auto" }}
          value={params.sort}
          onChange={(e) => onSort(e.target.value)}
          aria-label="Sort by"
        >
          <option value="name">Sort: Name</option>
          <option value="createdAt">Sort: Created</option>
          <option value="lastActiveAt">Sort: Last active</option>
        </select>

        <select
          className="inp"
          style={{ width: "auto" }}
          value={params.order}
          onChange={(e) => onOrder(e.target.value)}
          aria-label="Sort order"
        >
          <option value="asc">Asc</option>
          <option value="desc">Desc</option>
        </select>

        <select
          className="inp"
          style={{ width: "auto" }}
          value={String(params.limit)}
          onChange={(e) => onLimit(Number(e.target.value))}
          aria-label="Page size"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>

        {hasActiveFilters && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClearFilters}>
            Clear filters
          </button>
        )}
      </div>

      {loading && <PlatformLoading message="Loading tenants…" />}
      {error && (
        <div className="card" style={{ padding: 20 }}>
          <PlatformError message={error} />
          <button type="button" className="btn btn-soft btn-sm" style={{ marginTop: 10 }} onClick={onRetry}>
            Retry
          </button>
        </div>
      )}
      {!loading && !error && data && (
        <>
          <DataTable
            empty={emptyMessage}
            rows={data.items as unknown as Record<string, unknown>[]}
            columns={columns}
          />
          {total > 0 && (
            <div
              className="row"
              style={{
                marginTop: 12,
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <span className="muted" style={{ fontSize: 13 }}>
                {total} tenant{total === 1 ? "" : "s"}
                {params.status ? ` · ${formatTenantStatus(params.status)}` : ""}
              </span>
              <div className="row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={page <= 1}
                  onClick={() => onPage(page - 1)}
                >
                  Previous
                </button>
                <span className="muted" style={{ fontSize: 13, alignSelf: "center" }}>
                  Page {page} of {Math.max(1, totalPages)}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => onPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {managing && (
        <TenantStatusModal
          row={managing}
          onClose={onCloseManage}
          onChanged={() => {
            onTenantsChanged();
          }}
        />
      )}
    </>
  );
}
