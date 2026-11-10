import type { ShopifyImportBreakdown } from "../model";

/** One side of the sorted import result: catalog products or kit bundles. */
export function ImportGroup({
  label,
  hint,
  b,
  items,
}: {
  label: string;
  hint: string;
  b?: ShopifyImportBreakdown;
  items: { title: string; status: string }[];
}) {
  const total = (b?.imported ?? 0) + (b?.updated ?? 0) + (b?.skipped ?? 0);
  return (
    <div
      className="card"
      style={{ flex: "1 1 280px", minWidth: 260, padding: 14, background: "var(--surface-2)" }}
    >
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}
      >
        <div style={{ fontWeight: "var(--font-weight-bold)", fontSize: 13.5 }}>
          {label}{" "}
          <span className="muted" style={{ fontWeight: "var(--font-weight-medium)" }}>
            ({total})
          </span>
        </div>
        <div className="muted" style={{ fontSize: 11 }}>
          {hint}
        </div>
      </div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
        {b?.imported ?? 0} new · {b?.updated ?? 0} updated · {b?.skipped ?? 0} unchanged
      </div>
      {items.length > 0 && (
        <ul style={{ fontSize: 12.5, paddingLeft: 16, margin: 0, maxHeight: 160, overflow: "auto" }}>
          {items.slice(0, 30).map((i, n) => (
            <li key={n}>
              {i.title} <span className="muted">· {i.status}</span>
            </li>
          ))}
          {items.length > 30 && <li className="muted">+{items.length - 30} more</li>}
        </ul>
      )}
    </div>
  );
}
