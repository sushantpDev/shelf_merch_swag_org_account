import { Truck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { inr } from "@/components/platform/platform-ui";
import type { UiOrder } from "../model";

type Props = {
  order: UiOrder | null;
  onOpenChange: (open: boolean) => void;
  onViewInvoice: () => void;
  onDownloadInvoice: () => void;
  onTrackShipment: () => void;
  invoiceBusy?: { orderId: string; mode: "view" | "download" } | null;
};

/** Read-only order detail (shipment status + items + invoice/tracking actions). */
export function OrderDetailDialogView({
  order,
  onOpenChange,
  onViewInvoice,
  onDownloadInvoice,
  onTrackShipment,
  invoiceBusy = null,
}: Props) {
  return (
    <Dialog open={order !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm-modal">
        {order && (
          <div className="modal-pad">
            <DialogHeader>
              <div className="eyebrow">
                {order.date} · {inr(order.amount)}
                {order.orderNumber ? ` · ${order.orderNumber}` : ""}
              </div>
              <DialogTitle style={{ fontSize: 18 }}>{order.name}</DialogTitle>
              <DialogDescription className="sr-only">
                Shipment status and items for order {order.name}
              </DialogDescription>
            </DialogHeader>

            <div style={{ marginTop: 14 }}>
              <ShipmentHead order={order} />

              <div className="lbl" style={{ marginBottom: 8 }}>
                Items in shipment
              </div>
              {order.items.map(([name, qty], i) => (
                <div
                  key={`${name}-${i}`}
                  className="row"
                  style={{
                    justifyContent: "space-between",
                    border: "1px solid var(--line)",
                    borderRadius: "var(--r-sm)",
                    padding: "11px 14px",
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontWeight: "var(--font-weight-semibold)" }}>{name}</span>
                  <span className="muted">Qty {qty}</span>
                </div>
              ))}
            </div>

            <div className="row" style={{ marginTop: 18, gap: 10 }}>
              <button
                type="button"
                className="btn btn-ghost btn-block"
                disabled={Boolean(invoiceBusy)}
                onClick={onViewInvoice}
              >
                {invoiceBusy?.mode === "view" ? "Preparing invoice…" : "View invoice"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-block"
                disabled={Boolean(invoiceBusy)}
                onClick={onDownloadInvoice}
              >
                {invoiceBusy?.mode === "download" ? "Preparing invoice…" : "Download invoice"}
              </button>
              {order.track && (
                <button type="button" className="btn btn-dark btn-block" onClick={onTrackShipment}>
                  Track shipment
                </button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ShipmentHead({ order }: { order: UiOrder }) {
  if (order.status === "Delivered") {
    return (
      <div
        style={{
          background: "var(--brand-50)",
          borderRadius: "var(--r-sm)",
          padding: 16,
          textAlign: "center",
          marginBottom: 14,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-family-primary)",
            fontWeight: "var(--font-weight-bold)",
            fontSize: 22,
            color: "var(--brand-d)",
          }}
        >
          DELIVERED
        </div>
        {order.delivered && (
          <div className="muted" style={{ marginTop: 2 }}>
            On {order.delivered}
          </div>
        )}
        {order.track && <div style={{ marginTop: 6 }}>Tracking ID: {order.track}</div>}
      </div>
    );
  }
  if (order.status === "Shipped") {
    return (
      <div
        style={{
          background: "var(--info-50)",
          borderRadius: "var(--r-sm)",
          padding: 16,
          textAlign: "center",
          marginBottom: 14,
        }}
      >
        <div
          style={{ fontFamily: "var(--font-family-primary)", fontWeight: "var(--font-weight-bold)", fontSize: 22, color: "var(--info)" }}
        >
          SHIPPED
        </div>
        {order.track && <div style={{ marginTop: 6 }}>Tracking ID: {order.track}</div>}
      </div>
    );
  }
  return (
    <div className="banner" style={{ marginBottom: 14 }}>
      <Truck size={18} aria-hidden="true" />
      <div>Your order is being prepared. Tracking will appear here once it ships.</div>
    </div>
  );
}
