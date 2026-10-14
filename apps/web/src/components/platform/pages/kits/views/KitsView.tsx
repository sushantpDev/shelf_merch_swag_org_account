import { Link } from "react-router";
import {
  DataTable,
  inr,
  PlatformError,
  PlatformLoading,
  PlatformPageHeader,
  StatusTag,
} from "../../../platform-ui";
import type { KitsVm } from "../controllers/useKitsController";

/** Platform-curated gift bundles. */
export function KitsView({
  data,
  error,
  loading,
  canWrite,
  movingId,
  moveError,
  onAddToCatalog,
}: KitsVm) {
  return (
    <>
      <PlatformPageHeader
        title="Kits"
        subtitle="Platform-curated gift bundles."
        actions={
          canWrite ? (
            <div className="row" style={{ gap: 8 }}>
              <Link to="/platform/kits/import" className="btn btn-soft btn-sm">
                Import from Shopify
              </Link>
              <Link to="/platform/kits/new" className="btn btn-brand btn-sm">
                + Create a kit
              </Link>
            </div>
          ) : null
        }
      />
      {loading && <PlatformLoading />}
      {error && <PlatformError message={error} />}
      {moveError && <PlatformError message={moveError} />}
      {data && (
        <DataTable
          empty="No kits yet."
          rows={data as unknown as Record<string, unknown>[]}
          columns={[
            {
              key: "name",
              label: "Kit",
              render: (r) => (
                <Link to={`/platform/kits/${String(r._id)}`} className="lnk">
                  {String(r.name)}
                </Link>
              ),
            },
            {
              key: "status",
              label: "Status",
              render: (r) => <StatusTag status={String(r.status)} />,
            },
            {
              key: "approxValueInr",
              label: "Approx value",
              render: (r) => inr(Number(r.approxValueInr)),
            },
            {
              key: "items",
              label: "Items",
              render: (r) => String(Array.isArray(r.items) ? r.items.length : 0),
            },
            {
              key: "images",
              label: "Images",
              render: (r) => {
                const hero = Boolean(String(r.heroImage || "").trim());
                const gallery = Array.isArray(r.galleryImages) ? r.galleryImages.length : 0;
                const items = Array.isArray(r.itemImages) ? r.itemImages.length : 0;
                const variants = Array.isArray(r.variantImages) ? r.variantImages.length : 0;
                return (
                  <span className="muted" style={{ fontSize: 12 }}>
                    {hero ? "Hero" : "N/A"}
                    {gallery ? ` · ${gallery} gallery` : ""}
                    {items ? ` · ${items} product${items === 1 ? "" : "s"}` : ""}
                    {variants ? ` · ${variants} variant${variants === 1 ? "" : "s"}` : ""}
                  </span>
                );
              },
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
                          onClick={() => onAddToCatalog(id)}
                        >
                          {busy ? "Moving…" : "Add to Catalog"}
                        </button>
                      );
                    },
                  },
                ]
              : []),
          ]}
        />
      )}
    </>
  );
}
