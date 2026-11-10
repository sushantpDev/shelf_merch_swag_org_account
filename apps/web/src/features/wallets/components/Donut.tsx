import type { CSSProperties } from "react";

type Segment = { color: string; allocated: number };

/**
 * Conic-gradient budget donut. Mirrors the legacy `.donut` markup; segments are
 * sized by each department's share of the allocated total.
 */
export function Donut({
  segments,
  centerValue,
  centerLabel,
  size = 130,
  centerFontSize = 22,
  centerLabelFontSize = 10,
}: {
  segments: Segment[];
  centerValue: number | string;
  centerLabel: string;
  size?: number;
  centerFontSize?: number;
  centerLabelFontSize?: number;
}) {
  const allocTot = segments.reduce((s, d) => s + (d.allocated || 0), 0) || 1;
  let acc = 0;
  const stops =
    segments
      .map((d) => {
        const pct = (d.allocated / allocTot) * 100;
        const seg = `${d.color} ${acc}% ${acc + pct}%`;
        acc += pct;
        return seg;
      })
      .join(",") || "var(--surface-2) 0% 100%";

  const style: CSSProperties = {
    width: size,
    height: size,
    flex: "none",
    background: `conic-gradient(${stops})`,
  };

  return (
    <div className="donut" style={style}>
      <div className="donut-center">
        <div
          className="num"
          style={{ fontFamily: "var(--font-family-primary)", fontWeight: "var(--font-weight-bold)", fontSize: centerFontSize }}
        >
          {centerValue}
        </div>
        <div className="mut3" style={{ fontSize: centerLabelFontSize }}>
          {centerLabel}
        </div>
      </div>
    </div>
  );
}
