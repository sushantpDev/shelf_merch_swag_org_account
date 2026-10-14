import { Link } from "react-router";
import { resolveColorHex } from "@/lib/colorMap";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import {
  inr,
  PlatformError,
  PlatformLoading,
  PlatformPageHeader,
  StatusTag,
} from "../../../platform-ui";
import type { OrderFulfillmentVm } from "../controllers/useOrderFulfillmentController";
import {
  Chip,
  FulfillmentAssetStrip,
  matchVariantHex,
  type OrderItem,
} from "./fulfillment-parts";
import { OrderFulfillmentActions } from "./OrderFulfillmentActions";

function mediaAssetKey(url: string) {
  const resolved = resolveMediaUrl(url);
  if (!resolved) return "";
  try {
    const parsed = new URL(
      resolved,
      typeof window === "undefined" ? "https://local.invalid" : window.location.origin,
    );
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return resolved;
  }
}

/** Platform order fulfilment page: summary, production line items, timeline, actions. */
export function OrderFulfillmentView({
  data,
  error,
  loading,
  canWrite,
  reload,
}: OrderFulfillmentVm) {
  const tenant = data?.tenant as { name?: string } | undefined;
  const campaign = data?.campaign as { name?: string; type?: string } | undefined;
  const recipient = data?.recipient as
    | { name?: string; email?: string; phone?: string }
    | undefined;
  const shipping = data?.shippingAddress as
    | {
        name?: string;
        phone?: string;
        line1?: string;
        line2?: string;
        city?: string;
        state?: string;
        pincode?: string;
      }
    | undefined;
  const breakdown = data?.amountBreakdown as
    | { total?: number; subtotal?: number; gst?: number }
    | undefined;
  const items = (data?.items as OrderItem[] | undefined) ?? [];
  const mockupUrl = String(data?.mockupUrl ?? "");
  const internalNotes =
    (data?.internalNotes as Array<{ body: string; at: string }> | undefined) ?? [];
  const statusHistory =
    (data?.statusHistory as Array<{ status: string; at: string; note?: string }> | undefined) ?? [];

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Link to="/platform/orders" className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }}>
          ← Back to orders
        </Link>
      </div>
      {loading && <PlatformLoading />}
      {error && <PlatformError message={error} />}
      {data && (
        <>
          <PlatformPageHeader
            title={String(data.orderNumber ?? "Order")}
            subtitle={
              [
                tenant?.name ? `Tenant: ${tenant.name}` : null,
                campaign?.name ? `Campaign: ${campaign.name}` : null,
                `${items.length} line item${items.length === 1 ? "" : "s"}`,
              ]
                .filter(Boolean)
                .join("  ·  ") || "Order fulfillment"
            }
            actions={<StatusTag status={String(data.status)} />}
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: canWrite ? "1fr 340px" : "1fr",
              gap: 24,
              alignItems: "start",
            }}
          >
            <div>
              <div className="card" style={{ padding: 20, marginBottom: 24 }}>
                <div className="h1" style={{ fontSize: 16, marginBottom: 16 }}>
                  Order summary
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 16,
                    fontSize: 14,
                  }}
                >
                  <div>
                    <div className="lbl">Created</div>
                    <div>{new Date(String(data.createdAt)).toLocaleString("en-IN")}</div>
                  </div>
                  <div>
                    <div className="lbl">Total</div>
                    <div>{inr(Number(breakdown?.total ?? 0))}</div>
                  </div>
                  <div>
                    <div className="lbl">Subtotal</div>
                    <div>{inr(Number(breakdown?.subtotal ?? 0))}</div>
                  </div>
                  <div>
                    <div className="lbl">GST</div>
                    <div>{inr(Number(breakdown?.gst ?? 0))}</div>
                  </div>
                </div>

                {(recipient || shipping) && (
                  <>
                    <div className="divider" style={{ margin: "18px 0" }} />
                    <div className="h1" style={{ fontSize: 14, marginBottom: 12 }}>
                      Recipient &amp; shipping
                    </div>
                    {recipient && (
                      <div style={{ fontSize: 14, marginBottom: 8 }}>
                        <strong>{recipient.name}</strong>
                        {recipient.email ? ` · ${recipient.email}` : ""}
                        {recipient.phone ? ` · ${recipient.phone}` : ""}
                      </div>
                    )}
                    {shipping && (
                      <div style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5 }}>
                        {shipping.name && <div>{shipping.name}</div>}
                        {shipping.line1 && <div>{shipping.line1}</div>}
                        {shipping.line2 && <div>{shipping.line2}</div>}
                        <div>
                          {[shipping.city, shipping.state, shipping.pincode]
                            .filter(Boolean)
                            .join(", ")}
                        </div>
                        {shipping.phone && <div>{shipping.phone}</div>}
                      </div>
                    )}
                  </>
                )}

                {mockupUrl && (
                  <>
                    <div className="divider" style={{ margin: "18px 0" }} />
                    <div className="lbl" style={{ marginBottom: 8 }}>
                      Order mockup
                    </div>
                    <img
                      src={mockupUrl}
                      alt="Order mockup"
                      style={{
                        maxWidth: 280,
                        maxHeight: 280,
                        borderRadius: 8,
                        border: "1px solid var(--line)",
                      }}
                    />
                  </>
                )}
              </div>

              <div className="h1" style={{ fontSize: 16, marginBottom: 16 }}>
                Production line items{" "}
                <span className="muted" style={{ fontWeight: 400 }}>
                  ({items.length})
                </span>
              </div>
              {items.map((item, idx) => {
                const product = item.product;
                const variant = item.variant;
                const tintHex = resolveColorHex(variant?.color, matchVariantHex(product, variant));
                const rawArtworkUrl = item.artworkUrl || product?.artworkUrl || "";
                const artworkUrl = rawArtworkUrl ? resolveMediaUrl(rawArtworkUrl) : "";
                const printAreas = product?.printAreas ?? [];
                const rawDesignedMockupUrl = item.imageUrl || product?.designedMockupUrl || "";
                const productAssetUrls = new Set(
                  [
                    product?.baseImageUrl,
                    product?.maskImageUrl,
                    product?.primaryImageUrl,
                    ...(product?.imageUrls ?? []),
                    ...printAreas.map((area) => area.mockupImageUrl),
                  ]
                    .filter(Boolean)
                    .map((url) => mediaAssetKey(String(url))),
                );
                const designedMockupUrl =
                  rawDesignedMockupUrl &&
                  !productAssetUrls.has(mediaAssetKey(rawDesignedMockupUrl))
                    ? rawDesignedMockupUrl
                    : "";
                // Prefer the production mask — print-area % coords are authored
                // against it in the product wizard (same stage as Konva bake).
                const mockup = resolveMediaUrl(
                  // Prefer frozen line image (selected curated variant / order snapshot).
                  designedMockupUrl ||
                    product?.maskImageUrl ||
                    printAreas[0]?.mockupImageUrl ||
                    product?.baseImageUrl ||
                    product?.primaryImageUrl ||
                    product?.imageUrls?.[0] ||
                    rawDesignedMockupUrl ||
                    "",
                );
                const placement = item.placement ?? null;

                const baseImg = product?.baseImageUrl ? resolveMediaUrl(product.baseImageUrl) : "";
                return (
                  <div
                    key={idx}
                    className="card"
                    style={{ padding: 0, marginBottom: 16, overflow: "hidden" }}
                  >
                    {/* Work-order header strip */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "12px 18px",
                        borderBottom: "1px solid var(--line)",
                        background: "var(--surface-2)",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 15, marginRight: 4 }}>
                        {item.name ?? product?.name ?? "Product"}
                      </div>
                      <Chip mono>{item.sku || "N/A"}</Chip>
                      {variant?.size ? <Chip>Size {variant.size}</Chip> : null}
                      {variant?.color ? (
                        <Chip>
                          <span
                            style={{
                              width: 11,
                              height: 11,
                              borderRadius: 3,
                              background: tintHex,
                              border: "1px solid rgba(0,0,0,.2)",
                            }}
                          />
                          {variant.color}
                        </Chip>
                      ) : null}
                      <Chip>Qty {item.qty ?? 1}</Chip>
                      {item.unitPriceInr != null ? (
                        <div style={{ marginLeft: "auto", fontSize: 13, color: "var(--ink-2)" }}>
                          {inr(item.unitPriceInr)} each
                        </div>
                      ) : null}
                    </div>

                    {/* Asset strip + print spec */}
                    <div style={{ padding: 18 }}>
                      <FulfillmentAssetStrip
                        artworkUrl={artworkUrl}
                        baseImg={baseImg}
                        maskUrl={product?.maskImageUrl || ""}
                        tintHex={tintHex}
                        variantColor={variant?.color}
                        mockup={mockup}
                        printAreas={printAreas}
                        placement={placement}
                        placements={item.placements}
                        product={product}
                        designedMockupUrl={designedMockupUrl}
                        referenceArtworkUrl={designedMockupUrl ? "" : artworkUrl}
                        sku={item.sku || item.name || "kit"}
                      />
                    </div>
                  </div>
                );
              })}

              {(internalNotes.length > 0 || statusHistory.length > 0) && (
                <div className="card" style={{ padding: 20, marginTop: 8 }}>
                  {statusHistory.length > 0 && (
                    <>
                      <div className="h1" style={{ fontSize: 14, marginBottom: 12 }}>
                        Status timeline
                      </div>
                      <ul
                        style={{
                          paddingLeft: 18,
                          fontSize: 13,
                          color: "var(--ink-2)",
                          margin: "0 0 16px",
                        }}
                      >
                        {statusHistory.map((h, i) => (
                          <li key={i} style={{ marginBottom: 6 }}>
                            <StatusTag status={h.status} />
                            {" · "}
                            {new Date(h.at).toLocaleString("en-IN")}
                            {h.note ? `: ${h.note}` : ""}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {internalNotes.length > 0 && (
                    <>
                      <div className="h1" style={{ fontSize: 14, marginBottom: 12 }}>
                        Internal notes
                      </div>
                      <ul
                        style={{ paddingLeft: 18, fontSize: 13, color: "var(--ink-2)", margin: 0 }}
                      >
                        {internalNotes.map((n, i) => (
                          <li key={i} style={{ marginBottom: 6 }}>
                            {n.body}
                            <span className="muted">
                              {" "}
                              · {new Date(n.at).toLocaleString("en-IN")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>

            {canWrite && data && <OrderFulfillmentActions order={data} onChanged={reload} />}
          </div>
        </>
      )}
    </>
  );
}
