import type { SendFlowBlockReason } from "./fundsGate";

/** CTA shown before checkout when budget is pending or wallet balance is too low. */
export function InsufficientFundsDraftBanner({
  onSave,
  saving = false,
  reason = "insufficient_funds",
}: {
  onSave: () => void;
  saving?: boolean;
  reason?: SendFlowBlockReason;
}) {
  const label =
    reason === "pending_approval"
      ? "Wallet under review. Save as draft and continue later"
      : "Insufficient funds. Save as draft and continue later";

  return (
    <div className="banner" style={{ marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
      <button
        type="button"
        className="btn btn-soft"
        style={{ width: "100%", justifyContent: "center" }}
        disabled={saving}
        onClick={onSave}
      >
        {saving ? "Saving…" : label}
      </button>
    </div>
  );
}
