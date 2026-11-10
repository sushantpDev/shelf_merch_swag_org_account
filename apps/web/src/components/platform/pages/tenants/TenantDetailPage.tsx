import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { getStoredUser } from "@/services/auth-store";
import { canAccessArea } from "@/services/platform-access";
import {
  DataTable,
  inr,
  PlatformError,
  PlatformLoading,
  PlatformPageHeader,
  StatusTag,
} from "../../platform-ui";
import {
  fetchAuditLogs,
  fetchPlatformOrders,
  fetchTenantOverview,
  fetchTenantUsers,
  formatRelativeTime,
  formatTenantStatus,
  setPrimaryAdmin,
  updatePlatformTenant,
  type TenantRow,
} from "./model";
import { TenantStatusModal } from "./views/TenantStatusModal";

function BackToTenantsLink() {
  return (
    <Link
      to="/platform/tenants"
      className="platform-tenant-back"
      aria-label="Back to tenants"
      title="Back to tenants"
    >
      ←
    </Link>
  );
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "orders", label: "Orders" },
  { id: "wallet", label: "Wallet" },
  { id: "settings", label: "Settings" },
  { id: "audit", label: "Audit Log" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function isTabId(v: string | null): v is TabId {
  return TABS.some((t) => t.id === v);
}

type OverviewData = Awaited<ReturnType<typeof fetchTenantOverview>>;
type TenantUsers = Awaited<ReturnType<typeof fetchTenantUsers>>;

/** Lean Phase 1 tenant detail page. */
export function TenantDetailPage() {
  const { tenantId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: TabId = isTabId(searchParams.get("tab")) ? (searchParams.get("tab") as TabId) : "overview";
  const canWrite = canAccessArea(getStoredUser()?.role, "tenants", "write");

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [managing, setManaging] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchTenantOverview(tenantId)
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load tenant");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, reloadKey]);

  const tenant = overview?.tenant as TenantRow | undefined;
  const rowForModal = useMemo(() => {
    if (!tenant || !overview) return null;
    return {
      ...tenant,
      _id: String(tenant._id ?? tenantId),
      walletBalanceInr: overview.walletBalanceInr,
      openOrders: overview.openOrders,
      userCount: overview.userCount,
      lastActiveAt: overview.lastActiveAt,
      primaryAdmin: overview.primaryAdmin,
    } as TenantRow;
  }, [tenant, overview, tenantId]);

  function setTab(next: TabId) {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === "overview") p.delete("tab");
      else p.set("tab", next);
      return p;
    });
  }

  if (loading) return <PlatformLoading message="Loading tenant…" />;
  if (error || !overview || !tenant) {
    return (
      <div>
        <BackToTenantsLink />
        <PlatformError message={error || "Tenant not found"} />
        <button type="button" className="btn btn-soft btn-sm" onClick={() => setReloadKey((k) => k + 1)}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <BackToTenantsLink />
      <PlatformPageHeader
        title={tenant.name}
        subtitle={`@${tenant.slug}`}
        actions={
          canWrite ? (
            <button type="button" className="btn btn-soft btn-sm" onClick={() => setManaging(true)}>
              Manage status
            </button>
          ) : null
        }
      />

      <div className="row" style={{ gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? "btn btn-dark btn-sm" : "btn btn-ghost btn-sm"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab overview={overview} tenant={tenant} />}
      {tab === "users" && (
        <UsersTab
          tenantId={tenantId}
          primaryAdminId={overview.primaryAdmin?.id}
          canWrite={canWrite}
          onChanged={() => setReloadKey((k) => k + 1)}
        />
      )}
      {tab === "orders" && <OrdersTab tenantId={tenantId} />}
      {tab === "wallet" && <WalletTab overview={overview} />}
      {tab === "settings" && (
        <SettingsTab
          tenant={tenant}
          canWrite={canWrite}
          primaryAdmin={overview.primaryAdmin}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      )}
      {tab === "audit" && <AuditTab tenantId={tenantId} />}

      {managing && rowForModal && (
        <TenantStatusModal
          row={rowForModal}
          onClose={() => setManaging(false)}
          onChanged={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

function OverviewTab({ overview, tenant }: { overview: OverviewData; tenant: TenantRow }) {
  const fields: Array<{ label: string; value: ReactNode }> = [
    { label: "Status", value: <StatusTag status={tenant.status} /> },
    {
      label: "Primary administrator",
      value: overview.primaryAdmin
        ? `${overview.primaryAdmin.name} (${overview.primaryAdmin.email})`
        : "Not assigned",
    },
    { label: "Users", value: overview.userCount },
    { label: "Budget balance", value: inr(overview.walletBudgetBalanceInr ?? overview.walletBalanceInr) },
    { label: "Allocated", value: inr(overview.walletAllocatedInr ?? 0) },
    { label: "Available", value: inr(overview.walletAvailableInr ?? 0) },
    {
      label: "Open orders",
      value: (
        <Link to={`/platform/orders?tenantId=${String(tenant._id)}`}>{overview.openOrders}</Link>
      ),
    },
    {
      label: "Created",
      value: tenant.createdAt ? new Date(tenant.createdAt).toLocaleString() : "N/A",
    },
    {
      label: "Updated",
      value: tenant.updatedAt ? new Date(tenant.updatedAt).toLocaleString() : "N/A",
    },
    { label: "Last activity", value: formatRelativeTime(overview.lastActiveAt) },
    { label: "Currency", value: tenant.currency || "INR" },
    { label: "GSTIN", value: tenant.gstin || "N/A" },
  ];

  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="row" style={{ gap: 16, alignItems: "center", marginBottom: 18 }}>
        {tenant.logoUrl ? (
          <img
            src={tenant.logoUrl}
            alt=""
            width={56}
            height={56}
            style={{ borderRadius: 8, objectFit: "cover" }}
          />
        ) : null}
        <div>
          <div style={{ fontWeight: "var(--font-weight-semibold)", fontSize: 18 }}>{tenant.name}</div>
          <div className="muted">@{tenant.slug}</div>
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        {fields.map((f) => (
          <div key={f.label}>
            <div className="lbl">{f.label}</div>
            <div style={{ marginTop: 4 }}>{f.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UsersTab({
  tenantId,
  primaryAdminId,
  canWrite,
  onChanged,
}: {
  tenantId: string;
  primaryAdminId?: string;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [users, setUsers] = useState<TenantUsers | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    fetchTenantUsers(tenantId)
      .then(setUsers)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load users"));
  }, [tenantId]);

  async function makePrimary(userId: string) {
    setBusyId(userId);
    setError("");
    try {
      await setPrimaryAdmin(tenantId, userId, "Assigned from tenant detail");
      onChanged();
      setUsers(await fetchTenantUsers(tenantId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign primary admin");
    } finally {
      setBusyId("");
    }
  }

  if (error && !users) return <PlatformError message={error} />;
  if (!users) return <PlatformLoading message="Loading users…" />;

  return (
    <>
      {error && <PlatformError message={error} />}
      <DataTable
        empty="No users in this tenant."
        rows={users.map((u) => ({ ...u, _id: u.id })) as unknown as Record<string, unknown>[]}
        columns={[
          { key: "name", label: "Name" },
          { key: "email", label: "Email" },
          { key: "role", label: "Role", render: (r) => String(r.role ?? "N/A") },
          { key: "status", label: "Status", render: (r) => <StatusTag status={String(r.status)} /> },
          {
            key: "lastLoginAt",
            label: "Last active",
            render: (r) => formatRelativeTime(r.lastLoginAt as string | null),
          },
          {
            key: "primary",
            label: "",
            render: (r) => {
              const id = String(r.id);
              if (id === primaryAdminId) {
                return (
                  <span className="muted" style={{ fontSize: 12 }}>
                    Primary admin
                  </span>
                );
              }
              if (!canWrite || r.status !== "active") return null;
              return (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busyId === id}
                  onClick={() => makePrimary(id)}
                >
                  Make primary
                </button>
              );
            },
          },
        ]}
      />
    </>
  );
}

function OrdersTab({ tenantId }: { tenantId: string }) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchPlatformOrders({ tenantId, limit: 50 })
      .then((res) => setRows((res.items as Record<string, unknown>[]) ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load orders"));
  }, [tenantId]);

  if (error) return <PlatformError message={error} />;
  if (!rows) return <PlatformLoading message="Loading orders…" />;

  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <Link to={`/platform/orders?tenantId=${tenantId}`} className="btn btn-ghost btn-sm">
          Open in Orders →
        </Link>
      </div>
      <DataTable
        empty="No orders for this tenant."
        rows={rows}
        columns={[
          {
            key: "orderNumber",
            label: "Order",
            render: (r) => (
              <Link to={`/platform/orders/${String(r._id)}`}>{String(r.orderNumber ?? r._id)}</Link>
            ),
          },
          {
            key: "status",
            label: "Status",
            render: (r) => <StatusTag status={String(r.status)} />,
          },
          {
            key: "amount",
            label: "Total",
            render: (r) => {
              const total = (r.amountBreakdown as { total?: number } | undefined)?.total ?? 0;
              return (
                <span style={{ display: "block", textAlign: "right" }}>{inr(Number(total))}</span>
              );
            },
          },
        ]}
      />
    </>
  );
}

function WalletTab({ overview }: { overview: OverviewData }) {
  const rows = (overview.wallets ?? []).map((w) => {
    const row = w as {
      _id?: string;
      name?: string;
      status?: string;
      totalAmount?: number;
      balance?: number;
      allocatedAmount?: number;
      approvedBudgetInr?: number;
      allocatedBudgetInr?: number;
      remainingBalanceInr?: number;
    };
    const approved = Math.round(
      Number(row.approvedBudgetInr ?? row.totalAmount ?? row.balance ?? 0) || 0,
    );
    const allocated = Math.round(Number(row.allocatedBudgetInr ?? 0) || 0);
    const remaining = Math.round(
      Number(
        row.remainingBalanceInr ??
          Math.max(0, Number(row.balance ?? 0) - Number(row.allocatedAmount ?? 0)),
      ) || 0,
    );
    return {
      _id: String(row._id ?? row.name ?? ""),
      name: row.name,
      status: row.status,
      approvedBudget: approved,
      allocatedBudget: allocated,
      remainingBalance: remaining,
    };
  });

  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="lbl">Budget balance</div>
      <div style={{ fontSize: 22, fontWeight: "var(--font-weight-semibold)", marginBottom: 8 }}>
        {inr(overview.walletBudgetBalanceInr ?? overview.walletBalanceInr)}
      </div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
        Allocated {inr(overview.walletAllocatedInr ?? 0)} · Available{" "}
        {inr(overview.walletAvailableInr ?? 0)}
      </div>
      <DataTable
        empty="No wallets."
        className="platform-tenant-wallet-table"
        rows={rows as unknown as Record<string, unknown>[]}
        columns={[
          { key: "name", label: "Wallet" },
          {
            key: "approvedBudget",
            label: "Approved Budget",
            align: "center",
            render: (r) => (
              <span className="platform-tenant-num">{inr(Number(r.approvedBudget ?? 0))}</span>
            ),
          },
          {
            key: "allocatedBudget",
            label: "Allocated Budget",
            align: "center",
            render: (r) => (
              <span className="platform-tenant-num">{inr(Number(r.allocatedBudget ?? 0))}</span>
            ),
          },
          {
            key: "remainingBalance",
            label: "Remaining Balance",
            align: "center",
            render: (r) => (
              <span className="platform-tenant-num platform-tenant-num--avail">
                {inr(Number(r.remainingBalance ?? 0))}
              </span>
            ),
          },
          {
            key: "status",
            label: "Status",
            align: "center",
            render: (r) => (r.status ? <StatusTag status={String(r.status)} /> : "N/A"),
          },
        ]}
      />
    </div>
  );
}

function SettingsTab({
  tenant,
  canWrite,
  primaryAdmin,
  onSaved,
}: {
  tenant: TenantRow;
  canWrite: boolean;
  primaryAdmin: OverviewData["primaryAdmin"];
  onSaved: () => void;
}) {
  const [name, setName] = useState(tenant.name);
  const [slug, setSlug] = useState(tenant.slug);
  const [logoUrl, setLogoUrl] = useState(tenant.logoUrl ?? "");
  const [currency, setCurrency] = useState(tenant.currency ?? "INR");
  const [gstin, setGstin] = useState(tenant.gstin ?? "");
  const [line1, setLine1] = useState(tenant.billingAddress?.line1 ?? "");
  const [city, setCity] = useState(tenant.billingAddress?.city ?? "");
  const [state, setStateVal] = useState(tenant.billingAddress?.state ?? "");
  const [pincode, setPincode] = useState(tenant.billingAddress?.pincode ?? "");
  const [primaryUserId, setPrimaryUserId] = useState(primaryAdmin?.id ?? "");
  const [users, setUsers] = useState<TenantUsers>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [confirmSlug, setConfirmSlug] = useState(false);

  useEffect(() => {
    fetchTenantUsers(String(tenant._id)).then(setUsers).catch(() => setUsers([]));
  }, [tenant._id]);

  async function onSave() {
    if (!canWrite) return;
    setBusy(true);
    setErr("");
    setNote("");
    try {
      const slugChanged = slug.trim().toLowerCase() !== tenant.slug;
      if (slugChanged && !confirmSlug) {
        setErr("Confirm that you understand changing the slug may affect tenant URLs.");
        setBusy(false);
        return;
      }
      await updatePlatformTenant(String(tenant._id), {
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        logoUrl,
        currency,
        gstin,
        billingAddress: { line1, city, state, pincode },
        ...(slugChanged ? { confirmSlugChange: true } : {}),
      });
      if (primaryUserId && primaryUserId !== primaryAdmin?.id) {
        await setPrimaryAdmin(String(tenant._id), primaryUserId, "Updated from settings");
      }
      setNote("Settings saved.");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: 20, maxWidth: 560 }}>
      {err && <PlatformError message={err} />}
      {note && (
        <div className="card" style={{ padding: 10, marginBottom: 12, color: "var(--brand)", fontSize: 13 }}>
          {note}
        </div>
      )}
      <div className="field">
        <label className="lbl">Company name</label>
        <input className="inp" value={name} disabled={!canWrite || busy} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label className="lbl">Slug</label>
        <input className="inp" value={slug} disabled={!canWrite || busy} onChange={(e) => setSlug(e.target.value)} />
        {slug.trim().toLowerCase() !== tenant.slug && (
          <label className="row" style={{ gap: 8, marginTop: 8, fontSize: 13 }}>
            <input type="checkbox" checked={confirmSlug} onChange={(e) => setConfirmSlug(e.target.checked)} />
            I understand changing the slug may affect tenant URLs
          </label>
        )}
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label className="lbl">Logo URL</label>
        <input className="inp" value={logoUrl} disabled={!canWrite || busy} onChange={(e) => setLogoUrl(e.target.value)} />
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label className="lbl">Currency</label>
        <input className="inp" value={currency} disabled={!canWrite || busy} onChange={(e) => setCurrency(e.target.value)} />
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label className="lbl">GSTIN</label>
        <input className="inp" value={gstin} disabled={!canWrite || busy} onChange={(e) => setGstin(e.target.value)} />
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label className="lbl">Billing address</label>
        <input className="inp" placeholder="Line 1" value={line1} disabled={!canWrite || busy} onChange={(e) => setLine1(e.target.value)} />
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <input className="inp" placeholder="City" value={city} disabled={!canWrite || busy} onChange={(e) => setCity(e.target.value)} />
          <input className="inp" placeholder="State" value={state} disabled={!canWrite || busy} onChange={(e) => setStateVal(e.target.value)} />
          <input className="inp" placeholder="PIN" value={pincode} disabled={!canWrite || busy} onChange={(e) => setPincode(e.target.value)} />
        </div>
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label className="lbl">Primary administrator</label>
        <select
          className="inp"
          value={primaryUserId}
          disabled={!canWrite || busy}
          onChange={(e) => setPrimaryUserId(e.target.value)}
        >
          <option value="">Not assigned</option>
          {users
            .filter((u) => u.status === "active")
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
        </select>
      </div>
      {canWrite && (
        <button type="button" className="btn btn-dark btn-sm" style={{ marginTop: 16 }} disabled={busy} onClick={onSave}>
          {busy ? "Saving…" : "Save settings"}
        </button>
      )}
    </div>
  );
}

function AuditTab({ tenantId }: { tenantId: string }) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAuditLogs(50, { tenantId })
      .then((res) => {
        const items =
          (res as { items?: Record<string, unknown>[] }).items ?? (Array.isArray(res) ? res : []);
        setRows(items as Record<string, unknown>[]);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load audit logs"));
  }, [tenantId]);

  if (error) return <PlatformError message={error} />;
  if (!rows) return <PlatformLoading message="Loading audit log…" />;

  return (
    <DataTable
      empty="No audit events for this tenant."
      rows={rows}
      columns={[
        {
          key: "createdAt",
          label: "When",
          render: (r) => (r.createdAt ? new Date(String(r.createdAt)).toLocaleString() : "N/A"),
        },
        { key: "action", label: "Action" },
        { key: "actorRole", label: "Actor role" },
        {
          key: "detail",
          label: "Change",
          render: (r) => {
            const before = r.before as { status?: string } | null;
            const after = r.after as { status?: string; reason?: string } | null;
            if (before?.status || after?.status) {
              return `${formatTenantStatus(String(before?.status ?? "N/A"))} → ${formatTenantStatus(String(after?.status ?? "N/A"))}${after?.reason ? ` (${after.reason})` : ""}`;
            }
            return "N/A";
          },
        },
      ]}
    />
  );
}
