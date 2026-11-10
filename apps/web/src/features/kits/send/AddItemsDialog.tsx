import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ProductThumb } from "@/features/shops/ProductThumb";
import type { UiProduct } from "@/services/mappers";

/** Modal for adding/removing catalog products on a kit send (legacy siAddOpen). */
export function AddItemsDialog({
  open,
  catalog,
  picked,
  onToggle,
  onClose,
}: {
  open: boolean;
  catalog: UiProduct[];
  picked: number[];
  onToggle: (index: number) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm-modal" style={{ maxWidth: 900 }}>
        <div className="modal-pad">
          <DialogTitle style={{ fontSize: 18 }}>Add products</DialogTitle>
          <p className="muted" style={{ fontSize: "var(--workspace-font-caption, 13px)", marginTop: 4 }}>
            Tap products to add or remove them from this send.
          </p>
          <div
            className="grid"
            style={{
              gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))",
              maxHeight: "58vh",
              overflow: "auto",
              padding: 2,
              marginTop: 14,
            }}
          >
            {catalog.map((p, i) => {
              const on = picked.includes(i);
              return (
                <button
                  key={p.id ?? `${p.nm}-${i}`}
                  type="button"
                  className="pcard"
                  aria-pressed={on}
                  onClick={() => onToggle(i)}
                  style={{
                    textAlign: "left",
                    ...(on
                      ? { borderColor: "var(--brand)", boxShadow: "0 0 0 2px var(--brand-50)" }
                      : {}),
                  }}
                >
                  <div style={{ position: "relative" }}>
                    <ProductThumb product={p} />
                    <div
                      className="sw-pick-badge"
                      style={{
                        background: on ? "var(--brand)" : "#fff",
                        color: on ? "#fff" : "var(--brand)",
                      }}
                    >
                      {on ? "✓" : "+"}
                    </div>
                  </div>
                  <div className="meta">
                    {p.brand && <div className="brand">{p.brand}</div>}
                    <div className="nm">{p.nm}</div>
                    <div className="pr">{p.price}</div>
                  </div>
                </button>
              );
            })}
          </div>
          <div
            className="row"
            style={{ marginTop: 20, justifyContent: "space-between", alignItems: "center" }}
          >
            <span
              className="tag tag-soft"
              style={{ background: "var(--brand-50)", color: "var(--brand-d)" }}
            >
              {picked.length} item{picked.length === 1 ? "" : "s"} selected
            </span>
            <button type="button" className="btn btn-dark" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
