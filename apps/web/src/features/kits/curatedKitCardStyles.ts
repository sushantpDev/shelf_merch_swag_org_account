import type { CSSProperties } from "react";

/** Shared action-button styles for curated kit cards (KitsView + PreDesignedKits). */
export const curatedPreviewBtnStyle: CSSProperties = {
  flex: 1,
  border: "1px solid var(--line)",
  height: 32,
  fontSize: 13,
  fontWeight: "var(--font-weight-bold)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 6,
  color: "var(--ink)",
  background: "transparent",
  cursor: "pointer",
};

export const curatedSendBtnStyle: CSSProperties = {
  flex: 1,
  height: 32,
  fontSize: 13,
  fontWeight: "var(--font-weight-bold)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 6,
};

export const curatedSampleBtnStyle: CSSProperties = {
  flex: "1 1 100%",
  border: "1px solid var(--brand, #3152ff)",
  height: 32,
  fontSize: 12,
  fontWeight: "var(--font-weight-bold)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 6,
  color: "var(--brand, #3152ff)",
  background: "transparent",
  cursor: "pointer",
};

/** Plain price label beside kit card actions (no border/background). */
export const curatedKitPriceStyle: CSSProperties = {
  flex: 1,
  fontSize: 18,
  fontWeight: "var(--font-weight-bold)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--ink)",
  whiteSpace: "nowrap",
  lineHeight: 1.2,
};
