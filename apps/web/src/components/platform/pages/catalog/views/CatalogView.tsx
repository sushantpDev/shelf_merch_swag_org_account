import { Link } from "react-router";
import {
  DataTable,
  inr,
  PlatformError,
  PlatformLoading,
  PlatformPageHeader,
  StatusTag,
} from "../../../platform-ui";
import type {
  CatalogSort,
  CatalogStatusFilter,
  CatalogVm,
} from "../controllers/useCatalogController";

const STATUS_FILTERS: Array<{ key: CatalogStatusFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "active", label: "Active" },
  { key: "archived", label: "Archived" },
  { key: "discontinued", label: "Discontinued" },
];

const SORT_OPTIONS: Array<{ value: CatalogSort; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "name", label: "Name" },
  { value: "price-asc", label: "Price ↑" },
  { value: "price-desc", label: "Price ↓" },
  { value: "margin", label: "Margin" },
  { value: "stock", label: "Stock" },
];

/** Platform product master with internal cost and margin. */
export function CatalogView({
  data,
  error,
  loading,
  canWrite,
  search,
  onSearch,
  statusFilter,
  onStatusFilter,
  sort,
  onSort,
  rows,
  movingId,
  moveError,
  onAddToKits,
}: CatalogVm) {
  const filteredEmpty =
    Boolean(data?.items.length) &&
    rows.length === 0 &&
    (search.trim() !== "" || statusFilter !== "all");

  return (
    <>
      <PlatformPageHeader
        title="Catalog"
        subtitle="Platform product master with internal cost and margin."
        actions={
          canWrite ? (
            <>
              <Link to="/platform/catalog/categories" className="btn btn-ghost btn-sm">
                Categories
              </Link>
              <Link to="/platform/catalog/import" className="btn btn-ghost btn-sm">
                Import from Shopify
              </Link>
              <Link to="/platform/catalog/new" className="btn btn-brand btn-sm">
                + New product
              </Link>
            </>
          ) : (
            <Link to="/platform/catalog/categories" className="btn btn-ghost btn-sm">
              Categories
            </Link>
          )
        }
      />
      {loading && <PlatformLoading />}
      {error && <PlatformError message={error} />}
      {moveError && <PlatformError message={moveError} />}
      {data && (
        <>
          <div
            className="row"
            style={{ gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}
          >
            <div className="tabs" style={{ maxWidth: 560, flex: "1 1 280px" }} role="tablist">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === f.key}
                  className={statusFilter === f.key ? "on" : ""}
                  onClick={() => onStatusFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <input
              type="search"
              className="inp"
              placeholder="Search name or SKU…"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              aria-label="Search catalog"
              style={{ flex: "1 1 180px", maxWidth: 280, height: 40 }}
            />
            <label className="row" style={{ gap: 8, alignItems: "center", margin: 0 }}>
              <span className="muted" style={{ fontSize: 12, fontWeight: "var(--font-weight-bold)" }}>
                Sort
              </span>
              <select
                className="inp"
                value={sort}
                onChange={(e) => onSort(e.target.value as CatalogSort)}
                aria-label="Sort catalog"
                style={{ width: "auto", height: 40, minWidth: 130 }}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <DataTable
            empty={filteredEmpty ? "No products match your filters." : "No products yet."}
            rows={rows as unknown as Record<string, unknown>[]}
            columns={[
              {
                key: "name",
                label: "Product",
                render: (r) => (
                  <Link to={`/platform/catalog/${String(r._id)}`} className="lnk">
                    {String(r.name)}
                  </Link>
                ),
              },
              { key: "sku", label: "SKU" },
              {
                key: "status",
                label: "Status",
                render: (r) => <StatusTag status={String(r.status)} />,
              },
              {
                key: "sellingPriceInr",
                label: "Sell",
                render: (r) => inr(Number(r.sellingPriceInr)),
              },
              {
                key: "costPriceInr",
                label: "Cost",
                render: (r) => inr(Number(r.costPriceInr)),
              },
              {
                key: "marginPct",
                label: "Margin",
                render: (r) => `${Number(r.marginPct)}%`,
              },
              {
                key: "stock",
                label: "Available",
                render: (r) => String((r.inventory as { available?: number })?.available ?? 0),
              },
              ...(canWrite
                ? [
                    {
                      key: "actions",
                      label: "Actions",
                      render: (r: Record<string, unknown>) => {
                        const id = String(r._id);
                        const busy = movingId === id;
                        return (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busy || Boolean(movingId)}
                            onClick={() => onAddToKits(id)}
                          >
                            {busy ? "Moving…" : "Add to Kits"}
                          </button>
                        );
                      },
                    },
                  ]
                : []),
            ]}
          />
        </>
      )}
    </>
  );
}
