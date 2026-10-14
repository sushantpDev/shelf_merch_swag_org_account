import { inr, PlatformError, PlatformModal } from "../../../platform-ui";
import type { CreditNoteVm } from "../controllers/useCreditNoteController";

/** Issue credit note modal. */
export function CreditNoteModalView({
  invoice,
  amount,
  reason,
  busy,
  err,
  onClose,
  onAmount,
  onReason,
  onSubmit,
}: CreditNoteVm) {
  return (
    <PlatformModal
      title="Issue credit note"
      subtitle={`${invoice.invoiceNumber}${invoice.tenantName ? ` · ${invoice.tenantName}` : ""}`}
      onClose={onClose}
    >
      {err && <PlatformError message={err} />}
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
        Credit notes adjust a tax invoice after billing (returns, overcharges, GST corrections). Max:{" "}
        {inr(invoice.totalAmount)}.
      </p>
      <div className="field">
        <label className="lbl" htmlFor="cn-amount">
          Amount (₹)
        </label>
        <input
          id="cn-amount"
          className="inp"
          type="number"
          min={1}
          max={invoice.totalAmount}
          step="0.01"
          value={amount || ""}
          onChange={(e) => onAmount(Number(e.target.value))}
        />
      </div>
      <div className="field">
        <label className="lbl" htmlFor="cn-reason">
          Reason
        </label>
        <input
          id="cn-reason"
          className="inp"
          value={reason}
          onChange={(e) => onReason(e.target.value)}
          placeholder="e.g. partial return, damaged goods"
        />
      </div>
      <button
        type="button"
        className="btn btn-brand btn-block"
        disabled={busy}
        onClick={onSubmit}
      >
        {busy ? "Issuing…" : "Issue credit note"}
      </button>
    </PlatformModal>
  );
}
