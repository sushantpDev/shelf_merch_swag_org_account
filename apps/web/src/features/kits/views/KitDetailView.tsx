import { Link, useNavigate } from "react-router";
import { ArrowLeft, Box, CheckCircle2, Pencil, Send } from "lucide-react";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/tenant/PageHeader";
// import { DesignedProductThumb } from "@/features/swag/DesignedProductThumb";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import type { KitDetailVm } from "../controllers/useKitDetailController";

/** Kit detail page: header, artwork/status summary, included products grid. */
export function KitDetailView(vm: KitDetailVm) {
  const navigate = useNavigate();
  if (vm.isLoading) {
    return <LoadingState message="Loading kit..." fullScreen={false} />;
  }

  if (vm.errorMessage) {
    return (
      <div className="card" style={{ padding: 16, color: "var(--danger)" }}>
        {vm.errorMessage}
      </div>
    );
  }

  const { kit, products, isCuratedKit, logoUrl, hasUploadedLogo } = vm;
  if (!kit) {
    return (
      <div className="card empty" style={{ padding: 48 }}>
        <h3>Kit not found</h3>
        <p>This kit may have been removed.</p>
        <Link to="/app/kits" className="btn btn-soft" style={{ marginTop: 14 }}>
          Back to kits
        </Link>
      </div>
    );
  }

  const itemCount = products.length || kit.items;

  return (
    <>
      <Link
        to="/app/kits"
        className="lnk"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 18 }}
      >
        <ArrowLeft size={15} /> Back to kits
      </Link>

      <PageHeader
        title={kit.name}
        subtitle={`A reusable ${itemCount}-item kit. Send it to new recipients any time without rebuilding.`}
        actions={
          <div className="row" style={{ gap: 10 }}>
            {vm.canEditKit && !isCuratedKit ? (
              <Link to={`/app/kits/${kit.id}/edit`} className="btn btn-ghost">
                <Pencil size={15} /> Edit kit
              </Link>
            ) : null}
            {vm.canSendKit ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => navigate(`/app/kits/${kit.id}/sample`)}
              >
                Request a Sample
              </button>
            ) : null}
            {vm.canSendKit ? (
              <Link to={`/app/kits/${kit.id}/send`} className="btn btn-brand">
                <Send size={15} /> Send this kit
              </Link>
            ) : null}
          </div>
        }
      />

      <div style={{ maxWidth: 1120 }}>
        <div
          className="card"
          style={{
            padding: 24,
            display: "grid",
            gridTemplateColumns: "minmax(0,1fr) 180px 180px",
            gap: 18,
            alignItems: "center",
            marginBottom: 18,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
            {kit.artworkUrl ? (
              <div
                className="logo-chip"
                style={{ width: 64, height: 64, overflow: "hidden", padding: 6 }}
              >
                <img
                  src={resolveMediaUrl(kit.artworkUrl)}
                  alt=""
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                />
              </div>
            ) : (
              <div className="logo-chip" style={{ width: 64, height: 64 }} />
            )}
            <div style={{ minWidth: 0 }}>
              <div className="eyebrow" style={{ marginBottom: 5 }}>
                Kit artwork
              </div>
              <div style={{ fontWeight: "var(--font-weight-bold)", fontSize: "var(--workspace-font-heading, 17px)" }}>Branded across all items</div>
              <div className="muted" style={{ fontSize: "var(--workspace-font-caption, 13px)", marginTop: 3 }}>
                Artwork and products are saved in this reusable kit.
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 16, background: "#fff" }}>
            <div className="row" style={{ gap: 10 }}>
              <Box size={18} color="var(--brand)" />
              <div>
                <div className="mut3" style={{ fontSize: "var(--workspace-font-caption, 11px)", fontWeight: "var(--font-weight-bold)" }}>
                  Items
                </div>
                <div className="num" style={{ fontWeight: "var(--font-weight-bold)" }}>
                  {itemCount}
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 16, background: "#fff" }}>
            <div className="row" style={{ gap: 10 }}>
              <CheckCircle2 size={18} color="var(--brand)" />
              <div>
                <div className="mut3" style={{ fontSize: "var(--workspace-font-caption, 11px)", fontWeight: "var(--font-weight-bold)" }}>
                  Status
                </div>
                <div style={{ fontWeight: "var(--font-weight-bold)" }}>{kit.status === "live" ? "Live" : "Draft"}</div>
              </div>
            </div>
          </div>
        </div>

        <section className="card" style={{ padding: 24, marginBottom: 18 }}>
          <div
            className="row"
            style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}
          >
            <div>
              <div className="eyebrow">Included products</div>
              <h2 style={{ fontSize: 20, marginTop: 5 }}>Products in this kit</h2>
            </div>
            <span className="muted" style={{ fontSize: "var(--workspace-font-caption, 13px)" }}>
              {products.length} item{products.length === 1 ? "" : "s"}
            </span>
          </div>

          {products.length > 0 ? (
            <div
              className="grid"
              style={{
                gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))",
                gap: 16,
              }}
            >
              {products.map((p, i) => {
                const src = p.imageUrl || (p.img
                  ? resolveMediaUrl(p.img.mockupUrl) || resolveMediaUrl(p.img.imgUrl)
                  : undefined);
                return (
                  <div key={`${p.name}-${i}`} className="pcard" style={{ cursor: "default" }}>
                    {/* {!isCuratedKit && p.img && kit.artworkUrl ? (
                      <DesignedProductThumb
                        product={p.img}
                        artworkUrl={p.img.mockupUrl ? undefined : kit.artworkUrl}
                      />
                    ) : ( */}
                      <div className="img">
                        {src ? (
                          <img
                            src={src}
                            alt={p.name}
                            loading="lazy"
                            style={{ width: "100%", height: "100%", objectFit: "contain" }}
                          />
                        ) : (
                          <div
                            className="sm-skeleton-img"
                            aria-hidden="true"
                            style={{ width: "100%", height: "100%" }}
                          />
                        )}
                      </div>
                    {/* )} */}
                    <div className="meta">
                      {p.brand && <div className="brand">{p.brand}</div>}
                      <div className="nm">{p.name}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              No included products for this kit yet.
            </p>
          )}
        </section>

        {isCuratedKit ? (
          <section className="card" style={{ padding: 24 }}>
            <div className="eyebrow" style={{ marginBottom: 5 }}>
              Brand logo
            </div>
            <h2 style={{ fontSize: 20, marginTop: 0, marginBottom: 16 }}>Logo uploaded</h2>

            {hasUploadedLogo && logoUrl ? (
              <div
                style={{
                  width: 160,
                  height: 160,
                  borderRadius: 12,
                  border: "1px solid var(--line)",
                  background: "var(--gray-50)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 16,
                  marginBottom: 12,
                }}
              >
                <img
                  src={logoUrl}
                  alt="Uploaded logo"
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                />
              </div>
            ) : (
              <p className="muted" style={{ margin: "0 0 12px", fontSize: 14 }}>
                No logo uploaded yet. Upload a logo when sending this kit.
              </p>
            )}

            <p className="muted" style={{ margin: 0, fontSize: "var(--workspace-font-caption, 13px)", lineHeight: 1.5 }}>
              Uploaded logo will be printed in the placeholders as shown in the img.
            </p>
          </section>
        ) : null}
      </div>
    </>
  );
}
