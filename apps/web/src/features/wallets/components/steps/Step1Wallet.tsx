import { inr } from "@/components/platform/platform-ui";
import { amtInput, fmtDate, parseAmt } from "../../types";
import { DocumentUploadZone } from "../DocumentUploadZone";
import { WalletContactFieldsForm } from "../WalletContactFieldsForm";
import type { WalletContactFieldErrors } from "../../walletContactFields";
import type { StepProps } from "./StepProps";

const FUNDING_OPTIONS = [
  { id: "upload", title: "Upload Agreement / PO", sub: "Fund against a signed agreement" },
  { id: "pay", title: "Pay Online", sub: "Card, bank transfer or UPI" },
] as const;

const PAY_METHODS = [
  { id: "card", label: "Credit card" },
  { id: "bank", label: "Bank transfer" },
  { id: "upi", label: "UPI" },
] as const;

export function Step1Wallet({
  state,
  dispatch,
  contactErrors = {},
  onProceedToPayment,
  paymentBusy = false,
}: StepProps & { contactErrors?: WalletContactFieldErrors }) {
  const o = state.wallet;
  const setField = (field: keyof typeof o, value: string | number | boolean) =>
    dispatch({ type: "walletField", field, value });

  const setContactField = (field: "address" | "pinCode" | "mobileNumber" | "gstin", value: string) =>
    setField(field, value);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 22 }}>
      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ fontSize: 18, marginBottom: 18 }}>Setup Organization Budget</h3>

        <div className="field">
          <label className="lbl" htmlFor="org-wname">
            Budget name
          </label>
          <input
            className="inp"
            id="org-wname"
            value={o.name}
            onChange={(e) => setField("name", e.target.value)}
          />
        </div>

        <div className="field">
          <label className="lbl" htmlFor="org-wamt">
            Budget amount
          </label>
          <div className="inp-wrap" style={{ position: "relative" }}>
            <span
              className="inp-prefix"
              style={{
                position: "absolute",
                left: 13,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--ink-3)",
              }}
            >
              ₹
            </span>
            <input
              className="inp num"
              id="org-wamt"
              inputMode="numeric"
              style={{ paddingLeft: 26 }}
              value={amtInput(o.amount)}
              onChange={(e) => setField("amount", parseAmt(e.target.value))}
            />
          </div>
          <div className="mut3" style={{ fontSize: "var(--workspace-font-caption, 11.5px)", marginTop: 6 }}>
            Total annual merchandise budget you want to fund.
          </div>
        </div>

        <div className="row" style={{ gap: 14 }}>
          <div className="field" style={{ flex: 1, margin: 0 }}>
            <label className="lbl" htmlFor="org-wstart">
              Period start
            </label>
            <input
              className="inp"
              type="date"
              id="org-wstart"
              value={o.start}
              onChange={(e) => setField("start", e.target.value)}
            />
          </div>
          <div className="field" style={{ flex: 1, margin: 0 }}>
            <label className="lbl" htmlFor="org-wend">
              Period end
            </label>
            <input
              className="inp"
              type="date"
              id="org-wend"
              value={o.end}
              onChange={(e) => setField("end", e.target.value)}
            />
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <WalletContactFieldsForm
            idPrefix="org"
            values={{
              address: o.address,
              pinCode: o.pinCode,
              mobileNumber: o.mobileNumber,
              gstin: o.gstin,
            }}
            errors={contactErrors}
            onChange={setContactField}
          />
        </div>

        <div className="field" style={{ marginTop: 16 }}>
          <label className="lbl">Funding method</label>
          <div className="row" style={{ gap: 12 }}>
            {FUNDING_OPTIONS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`radio-card ${o.funding === f.id ? "sel" : ""}`}
                style={{ flex: 1, textAlign: "left" }}
                aria-pressed={o.funding === f.id}
                onClick={() => setField("funding", f.id)}
              >
                <div className="rcd" />
                <div className="rct">{f.title}</div>
                <div className="rcs">{f.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {o.funding === "upload" ? (
          <>
            <div className="row" style={{ gap: 14 }}>
              <div className="field" style={{ flex: 1, margin: 0 }}>
                <label className="lbl" htmlFor="org-doctype">
                  Document type
                </label>
                <select
                  className="inp"
                  id="org-doctype"
                  value={o.docType}
                  onChange={(e) => setField("docType", e.target.value)}
                >
                  <option>Agreement</option>
                  <option>Purchase Order</option>
                  <option>Work Order</option>
                </select>
              </div>
              <div className="field" style={{ flex: 1, margin: 0 }}>
                <label className="lbl" htmlFor="org-docnum">
                  Document number
                </label>
                <input
                  className="inp"
                  id="org-docnum"
                  value={o.docNumber}
                  required={o.funding === "upload"}
                  onChange={(e) => setField("docNumber", e.target.value)}
                />
              </div>
            </div>
            <div className="field" style={{ marginTop: 16 }}>
              <label className="lbl">Upload document</label>
              <DocumentUploadZone
                file={o.uploadFile}
                onFileChange={(file) => dispatch({ type: "setUploadFile", file })}
              />
              <div className="row" style={{ gap: 9, alignItems: "center", marginTop: 12 }}>
                <span className="lbl" style={{ margin: 0 }}>
                  Approval status
                </span>
                <span className="tag tag-warn">
                  <span className="dot" />
                  Pending review
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <label className="lbl" htmlFor="org-payamt">
                Amount
              </label>
              <div className="inp-wrap" style={{ position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: 13,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--ink-3)",
                  }}
                >
                  ₹
                </span>
                <input
                  className="inp num"
                  id="org-payamt"
                  inputMode="numeric"
                  style={{ paddingLeft: 26 }}
                  value={amtInput(o.amount)}
                  onChange={(e) => setField("amount", parseAmt(e.target.value))}
                />
              </div>
            </div>
            <div className="field">
              <label className="lbl">Payment method</label>
              <div className="row" style={{ gap: 10 }}>
                {PAY_METHODS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`radio-card ${o.pay === p.id ? "sel" : ""}`}
                    style={{ flex: 1, padding: "12px 12px 12px 38px", textAlign: "left" }}
                    aria-pressed={o.pay === p.id}
                    onClick={() => setField("pay", p.id)}
                  >
                    <div className="rcd" />
                    <div className="rct">{p.label}</div>
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-dark btn-block"
              disabled={paymentBusy || !onProceedToPayment}
              onClick={() => onProceedToPayment?.()}
            >
              {paymentBusy ? "Opening checkout…" : "Proceed to payment"}
            </button>
          </>
        )}
      </div>

      <aside style={{ display: "grid", gap: 16, alignContent: "start" }}>
        <div className="card" style={{ padding: 20 }}>
          <div
            className="row"
            style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}
          >
            <span className="lbl" style={{ margin: 0 }}>
              Budget summary
            </span>
            <span className="tag tag-draft">
              <span className="dot" />
              Draft
            </span>
          </div>
          <SummaryRow label="Budget name" value={o.name || "Organization budget"} />
          <SummaryRow label="Budget" value={inr(o.amount)} big />
          <SummaryRow label="Validity" value={`${fmtDate(o.start)} → ${fmtDate(o.end)}`} />
          <SummaryRow
            label="Funding method"
            value={o.funding === "upload" ? "Upload Agreement / PO" : "Pay Online"}
          />
        </div>
      </aside>
    </div>
  );
}

function SummaryRow({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div style={{ borderTop: "1px solid var(--line)", padding: "12px 0" }}>
      <div
        className="mut3"
        style={{
          fontSize: "var(--workspace-font-caption, 11px)",
          textTransform: "uppercase",
          letterSpacing: ".04em",
          fontWeight: "var(--font-weight-bold)",
        }}
      >
        {label}
      </div>
      <div
        className={big ? "num" : ""}
        style={
          big
            ? { fontFamily: "var(--font-family-primary)", fontWeight: "var(--font-weight-bold)", fontSize: 24, marginTop: 3 }
            : { fontWeight: "var(--font-weight-medium)", marginTop: 3, fontSize: "var(--workspace-font-body, 13.5px)" }
        }
      >
        {value}
      </div>
    </div>
  );
}
