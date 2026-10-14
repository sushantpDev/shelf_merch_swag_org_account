import { useEffect, useState } from "react";
import { ArrowLeft, ChevronDown, Clock, CreditCard, FileText, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { inr } from "@/components/platform/platform-ui";
import { openRazorpayCheckout } from "@/lib/razorpay";
import { useInvalidateWorkspace } from "@/hooks/useWorkspace";
import { persistFundingSuccess } from "../fundingSuccess";
import { parseAmt, type WalletUploadFile } from "../types";
import { useCreateRazorpayOrder, useFundWallet, useVerifyRazorpayPayment } from "../model";
import { DocumentUploadZone } from "./DocumentUploadZone";

const PRESET_AMOUNTS = [10_000, 25_000, 50_000, 1_00_000, 2_00_000];
const PO_BONUS_THRESHOLD = 1_00_000;

type PaymentMethod = "po" | "online";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletId: string;
  walletName: string;
};

export function AddFundsDialog({ open, onOpenChange, walletId, walletName }: Props) {
  const fund = useFundWallet();
  const rzpOrder = useCreateRazorpayOrder();
  const verifyPayment = useVerifyRazorpayPayment();
  const invalidateWorkspace = useInvalidateWorkspace();

  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState(0);
  const [amountText, setAmountText] = useState("");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("online");
  const [docType, setDocType] = useState("Purchase Order");
  const [docNumber, setDocNumber] = useState("");
  const [uploadFile, setUploadFile] = useState<WalletUploadFile | null>(null);
  const [paying, setPaying] = useState(false);

  const busy = fund.isPending || rzpOrder.isPending || verifyPayment.isPending || paying;

  useEffect(() => {
    if (!open) {
      setStep(1);
      setAmount(0);
      setAmountText("");
      setNote("");
      setMethod("online");
      setDocType("Purchase Order");
      setDocNumber("");
      setUploadFile(null);
      setPaying(false);
    }
  }, [open]);

  const poBonusEligible = method === "po" && amount >= PO_BONUS_THRESHOLD;

  function AmountSummary({
    label,
    badge,
  }: {
    label: string;
    badge?: { text: string; tone: "pending" | "instant" };
  }) {
    if (amount <= 0) return null;
    return (
      <div className="add-funds-brand-summary">
        <div className="add-funds-brand-summary-main">
          <span className="add-funds-brand-summary-label">{label}</span>
          <span className="add-funds-brand-summary-amt num">{inr(amount)}</span>
        </div>
        {badge && (
          <span className={`add-funds-brand-badge add-funds-brand-badge--${badge.tone}`}>
            {badge.tone === "pending" ? (
              <Clock size={12} strokeWidth={2.5} aria-hidden />
            ) : (
              <Zap size={12} strokeWidth={2.5} aria-hidden />
            )}
            {badge.text}
          </span>
        )}
      </div>
    );
  }

  const canNext =
    (step === 1 && amount > 0) ||
    step === 2 ||
    (step === 3 && method === "online") ||
    (step === 3 && method === "po" && Boolean(uploadFile?.file) && docNumber.trim().length > 0);

  function handleAmountChange(raw: string) {
    setAmountText(raw);
    setAmount(parseAmt(raw));
  }

  function selectPreset(value: number) {
    setAmount(value);
    setAmountText(value.toLocaleString("en-IN"));
  }

  async function handlePoSubmit() {
    const description = [note.trim() || undefined, walletName].filter(Boolean).join(" · ");

    try {
      await fund.mutateAsync({
        walletId,
        amount,
        description: description || "Top-up to organization budget",
        fundingMethod: "po_upload",
        docType,
        docNumber: docNumber.trim(),
        uploadFile: uploadFile?.file,
      });
      persistFundingSuccess({
        amount,
        name: walletName,
        walletId,
        kind: "topup",
      });
      toast.success("Funding request submitted 🙌");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit funding request");
    }
  }

  async function handleRazorpayPay() {
    setPaying(true);
    try {
      const order = await rzpOrder.mutateAsync({ walletId, amount });
      await openRazorpayCheckout({
        order,
        walletName,
        onSuccess: async (response) => {
          try {
            await verifyPayment.mutateAsync({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            persistFundingSuccess({
              amount,
              name: walletName,
              walletId,
              kind: "topup",
            });
            toast.success("Payment submitted for review", {
              description: `${inr(amount)} pending approval`,
            });
            invalidateWorkspace();
            onOpenChange(false);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Payment verification failed");
          } finally {
            setPaying(false);
          }
        },
        onDismiss: () => setPaying(false),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Payment could not be started";
      if (message.includes("RAZORPAY_NOT_CONFIGURED") || message.includes("not configured")) {
        toast.error("Payment setup incomplete");
      } else if (message !== "Payment cancelled") {
        toast.error(message);
      }
      setPaying(false);
    }
  }

  async function handleConfirm() {
    if (method === "po") {
      await handlePoSubmit();
    } else {
      await handleRazorpayPay();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="add-funds-modal">
        <div className="add-funds-inner">
          <div className="add-funds-scroll">
            <p className="add-funds-eyebrow">Request top-up ({step}/4)</p>

            {step === 1 && (
              <div className="add-funds-body add-funds-step">
                <DialogHeader className="add-funds-header">
                  <DialogTitle>How much would you like to add?</DialogTitle>
                  <DialogDescription>
                    Add ₹1,00,000+ via PO and get up to 5% bonus funds after finance approval.
                    Online payments via Razorpay are also reviewed by finance before crediting.
                  </DialogDescription>
                </DialogHeader>

                <AmountSummary label={`Adding to ${walletName}`} />

                <div className="add-funds-brand-card">
                  <p className="add-funds-brand-card-title">Amount</p>
                  <div className="add-funds-field add-funds-field--tight">
                    <div className={`add-funds-amount-wrap${amount > 0 ? " has-value" : ""}`}>
                      <span className="add-funds-currency">₹</span>
                      <input
                        id="add-funds-amount"
                        className="add-funds-amount-input num"
                        inputMode="numeric"
                        placeholder="0"
                        autoFocus
                        value={amountText}
                        onChange={(e) => handleAmountChange(e.target.value)}
                      />
                    </div>
                    <div className="add-funds-presets">
                      {PRESET_AMOUNTS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          className={`add-funds-preset${amount === p ? " on" : ""}`}
                          onClick={() => selectPreset(p)}
                        >
                          ₹{p.toLocaleString("en-IN")}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="add-funds-brand-card">
                  <p className="add-funds-brand-card-title">Reference note</p>
                  <div className="add-funds-field add-funds-field--tight">
                    <p className="add-funds-field-hint">Optional. Shown on your funding request</p>
                    <input
                      id="add-funds-note"
                      className="add-funds-inp"
                      placeholder='e.g. "Q3 gifting budget"'
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="add-funds-body add-funds-step">
                <DialogHeader className="add-funds-header">
                  <DialogTitle>Select your payment method</DialogTitle>
                  <DialogDescription>
                    Choose how you want to fund <b>{walletName}</b>.
                  </DialogDescription>
                </DialogHeader>

                <AmountSummary label="Amount to add" />

                <div className="add-funds-brand-card add-funds-brand-card--methods">
                  <p className="add-funds-brand-card-title">Payment method</p>
                  <div className="add-funds-methods">
                    <button
                      type="button"
                      className={`add-funds-method${method === "online" ? " on" : ""}`}
                      onClick={() => setMethod("online")}
                    >
                      <span
                        className={`add-funds-method-radio${method === "online" ? " on" : ""}`}
                        aria-hidden="true"
                      />
                      <div>
                        <div className="add-funds-method-title">Pay online (Razorpay)</div>
                        <div className="add-funds-method-sub">
                          UPI, cards, or net banking. Credited after finance approval.
                        </div>
                      </div>
                    </button>

                    <p className="add-funds-bonus-hint">
                      Get 5% extra funds when you add ₹1,00,000+ with:
                    </p>

                    <button
                      type="button"
                      className={`add-funds-method${method === "po" ? " on" : ""}`}
                      onClick={() => setMethod("po")}
                    >
                      <span
                        className={`add-funds-method-radio${method === "po" ? " on" : ""}`}
                        aria-hidden="true"
                      />
                      <div>
                        <div className="add-funds-method-title">Upload Purchase Order</div>
                        <div className="add-funds-method-sub">
                          Submit a signed PO for finance approval. Credited once approved.
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && method === "po" && (
              <div className="add-funds-body add-funds-step">
                <DialogHeader className="add-funds-header">
                  <DialogTitle>Upload purchase order</DialogTitle>
                  <DialogDescription>
                    Your balance will be credited after finance approval.
                  </DialogDescription>
                </DialogHeader>

                <AmountSummary
                  label="Amount requested"
                  badge={{ text: "Pending review", tone: "pending" }}
                />

                <div className="add-funds-brand-card">
                  <p className="add-funds-brand-card-title">Document details</p>
                  <div className="add-funds-doc-grid">
                    <div className="add-funds-field add-funds-field--tight">
                      <label className="add-funds-lbl" htmlFor="add-funds-doctype">
                        Document type
                      </label>
                      <div className="add-funds-select-wrap">
                        <select
                          id="add-funds-doctype"
                          className="add-funds-inp add-funds-select"
                          value={docType}
                          onChange={(e) => setDocType(e.target.value)}
                        >
                          <option>Agreement</option>
                          <option>Purchase Order</option>
                          <option>Work Order</option>
                        </select>
                        <ChevronDown size={16} className="add-funds-select-chevron" aria-hidden />
                      </div>
                    </div>
                    <div className="add-funds-field add-funds-field--tight">
                      <label className="add-funds-lbl" htmlFor="add-funds-docnum">
                        Document number
                      </label>
                      <input
                        id="add-funds-docnum"
                        className="add-funds-inp"
                        placeholder="PO-2026-001"
                        value={docNumber}
                        onChange={(e) => setDocNumber(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="add-funds-field add-funds-po-upload-field">
                  <label className="add-funds-lbl">Upload document</label>
                  <p className="add-funds-field-hint">PDF or DOCX · max 25 MB</p>
                  <DocumentUploadZone
                    variant="modal"
                    file={uploadFile}
                    onFileChange={setUploadFile}
                  />
                </div>
              </div>
            )}

            {step === 3 && method === "online" && (
              <div className="add-funds-body add-funds-step">
                <DialogHeader className="add-funds-header">
                  <DialogTitle>Pay with Razorpay</DialogTitle>
                  <DialogDescription>
                    You&apos;ll be redirected to Razorpay&apos;s secure checkout to complete
                    payment. If your account was charged, contact support and we&apos;ll verify
                    the payment.
                  </DialogDescription>
                </DialogHeader>

                <AmountSummary
                  label="Amount to pay"
                  badge={{ text: "Pending review", tone: "pending" }}
                />

                <div className="add-funds-brand-card">
                  <p className="add-funds-brand-card-title">Payment details</p>
                  <div className="add-funds-detail-rows">
                    <div className="add-funds-detail-row">
                      <span>Payment gateway</span>
                      <b>Razorpay</b>
                    </div>
                    <div className="add-funds-detail-row">
                      <span>Accepted methods</span>
                      <b>UPI · Cards · Net banking</b>
                    </div>
                    <div className="add-funds-detail-row">
                      <span>Budget</span>
                      <b>{walletName}</b>
                    </div>
                  </div>
                </div>

                <p className="add-funds-brand-hint">
                  <CreditCard size={14} strokeWidth={2} aria-hidden />
                  Payment is collected via Razorpay. Your budget is credited after ShelfMerch finance
                  approves the funding request.
                </p>
              </div>
            )}

            {step === 4 && (
              <div className="add-funds-body add-funds-step">
                <DialogHeader className="add-funds-header">
                  <DialogTitle>Review and confirm</DialogTitle>
                  <DialogDescription>
                    Check the details before requesting a budget top-up.
                  </DialogDescription>
                </DialogHeader>

                <AmountSummary
                  label={method === "online" ? "Total to pay" : "Amount requested"}
                  badge={
                    method === "online"
                      ? { text: "Pending review", tone: "pending" }
                      : { text: "Pending review", tone: "pending" }
                  }
                />

                <div className="add-funds-brand-card">
                  <p className="add-funds-brand-card-title">Summary</p>
                  <div className="add-funds-detail-rows">
                    <div className="add-funds-detail-row">
                      <span>Budget</span>
                      <b>{walletName}</b>
                    </div>
                    <div className="add-funds-detail-row">
                      <span>Amount</span>
                      <b className="num add-funds-detail-amt">{inr(amount)}</b>
                    </div>
                    {poBonusEligible && (
                      <div className="add-funds-detail-row">
                        <span>Bonus (5%, after approval)</span>
                        <b className="num add-funds-detail-bonus">
                          +{inr(Math.floor(amount * 0.05))}
                        </b>
                      </div>
                    )}
                    <div className="add-funds-detail-row">
                      <span>Payment method</span>
                      <b>{method === "online" ? "Razorpay (online)" : "Purchase Order"}</b>
                    </div>
                    {method === "po" && (
                      <>
                        <div className="add-funds-detail-row">
                          <span>Document</span>
                          <b>
                            {docType} {docNumber}
                          </b>
                        </div>
                        <div className="add-funds-detail-row">
                          <span>File</span>
                          <b>{uploadFile?.name ?? "N/A"}</b>
                        </div>
                      </>
                    )}
                    {note.trim() && (
                      <div className="add-funds-detail-row">
                        <span>Note</span>
                        <b>{note.trim()}</b>
                      </div>
                    )}
                  </div>
                </div>

                <div className="add-funds-brand-summary add-funds-brand-summary--foot">
                  {method === "online" ? <CreditCard size={18} /> : <FileText size={18} />}
                  <span>
                    {method === "online" ? (
                      <>
                        Pay <b className="num">{inr(amount)}</b> via Razorpay
                      </>
                    ) : (
                      <>
                        Submit <b className="num">{inr(amount)}</b> for approval
                      </>
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="add-funds-foot">
            {step > 1 ? (
              <button
                type="button"
                className="add-funds-back"
                onClick={() => setStep((s) => s - 1)}
                disabled={busy}
              >
                <ArrowLeft size={15} /> Back
              </button>
            ) : (
              <button type="button" className="add-funds-back" onClick={() => onOpenChange(false)}>
                Cancel
              </button>
            )}

            {step < 4 ? (
              <button
                type="button"
                className={`add-funds-next${canNext ? " ready" : ""}`}
                disabled={!canNext}
                onClick={() => setStep((s) => s + 1)}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                className="add-funds-next ready"
                disabled={busy}
                onClick={handleConfirm}
              >
                {busy
                  ? method === "online"
                    ? "Opening checkout…"
                    : "Submitting…"
                  : method === "online"
                    ? "Pay with Razorpay"
                    : "Submit for approval"}
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
