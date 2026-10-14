import { PlatformError, PlatformPageHeader } from "../../../platform-ui";
import type { ShopifyImportVm } from "../controllers/useShopifyImportController";
import { ImportGroup } from "./ImportGroup";

/** Shopify catalog or kit import form and results. */
export function ShopifyImportView({
  kits,
  domain,
  token,
  busy,
  error,
  summary,
  onBack,
  onDomain,
  onToken,
  onRun,
  onViewResults,
}: ShopifyImportVm) {
  return (
    <>
      <PlatformPageHeader
        title={kits ? "Import kits from Shopify" : "Import from Shopify"}
        subtitle={
          kits
            ? "Pull only kit bundles from a Shopify store into the Kits collection. Catalog products are imported from the Catalog page."
            : "Pull only active Shopify catalog products as drafts for review. Kit bundles are imported separately from the Kits page."
        }
        actions={
          <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
            {kits ? "Back to kits" : "Back to catalog"}
          </button>
        }
      />

      {error && <PlatformError message={error} />}

      <div className="card" style={{ padding: 22, maxWidth: 620 }}>
        <div className="field">
          <label className="lbl">Store domain</label>
          <input
            className="inp"
            placeholder="xyz.myshopify.com"
            value={domain}
            onChange={(e) => onDomain(e.target.value)}
            disabled={busy}
          />
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Must be the Admin host, like <code>your-store.myshopify.com</code>, not a custom storefront domain.
          </p>
        </div>
        <div className="field">
          <label className="lbl">Admin API access token</label>
          <input
            className="inp"
            type="password"
            placeholder="shpat_…"
            value={token}
            onChange={(e) => onToken(e.target.value)}
            disabled={busy}
          />
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Paste the Admin API access token (<code>shpat_…</code>), never the client secret (<code>shpss_…</code>)
            or client ID. The custom app needs <code>read_products</code> (and <code>read_inventory</code> for HSN).
            Used once for this import and never stored.{" "}
            {kits
              ? "Only kit bundles are imported, as curated active kits."
              : "Only active Shopify products are pulled, and they land as drafts. HSN is copied from Shopify inventory items when set; still set cost and GST before publishing."}
          </p>
        </div>
        <button type="button" className="btn btn-brand" disabled={busy || !domain || !token} onClick={onRun}>
          {busy ? "Importing…" : "Run import"}
        </button>
      </div>

      {summary && (
        <div className="card" style={{ padding: 22, maxWidth: 720, marginTop: 18 }}>
          <div className="row" style={{ gap: 24, marginBottom: 14 }}>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                Imported
              </div>
              <div className="h1" style={{ fontSize: 22 }}>
                {summary.imported}
              </div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                Updated
              </div>
              <div className="h1" style={{ fontSize: 22 }}>
                {summary.updated}
              </div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                Skipped
              </div>
              <div className="h1" style={{ fontSize: 22 }}>
                {summary.skipped}
              </div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                Failed
              </div>
              <div className="h1" style={{ fontSize: 22 }}>
                {summary.failed}
              </div>
            </div>
          </div>

          <div className="row" style={{ gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            {kits ? (
              <ImportGroup
                label="Kit bundles"
                hint="→ Kits"
                b={summary.kits}
                items={summary.items.filter((i) => i.kind === "kit" && i.status !== "failed")}
              />
            ) : (
              <ImportGroup
                label="Catalog products"
                hint="→ Catalog"
                b={summary.products}
                items={summary.items.filter((i) => i.kind !== "kit" && i.status !== "failed")}
              />
            )}
          </div>

          {kits && summary.kits && summary.kits.imported + summary.kits.updated > 0 && (
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
              Bundles were imported as <b>curated, ready-to-use kits</b>. No component products to add.
            </p>
          )}

          {summary.failed > 0 && (
            <ul style={{ color: "var(--danger)", fontSize: 13, paddingLeft: 18 }}>
              {summary.items
                .filter((i) => i.status === "failed")
                .map((i, n) => (
                  <li key={n}>
                    {i.title}: {i.reason}
                  </li>
                ))}
            </ul>
          )}
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-soft btn-sm" onClick={onViewResults}>
              {kits ? "View kits" : "View catalog"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
