import type { WalletContactFieldErrors, WalletContactFields } from "../walletContactFields";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="mut3" style={{ color: "var(--danger)", fontSize: "var(--workspace-font-caption, 11px)", marginTop: 4 }}>
      {message}
    </div>
  );
}

export function WalletContactFieldsForm({
  values,
  errors,
  onChange,
  idPrefix = "wallet",
}: {
  values: WalletContactFields;
  errors: WalletContactFieldErrors;
  onChange: (field: keyof WalletContactFields, value: string) => void;
  idPrefix?: string;
}) {
  return (
    <>
      <div className="field">
        <label className="lbl" htmlFor={`${idPrefix}-address`}>
          Address *
        </label>
        <textarea
          className="inp"
          id={`${idPrefix}-address`}
          rows={3}
          value={values.address}
          onChange={(e) => onChange("address", e.target.value)}
          style={{ resize: "vertical", minHeight: 72 }}
        />
        <FieldError message={errors.address} />
      </div>

      <div className="row" style={{ gap: 14 }}>
        <div className="field" style={{ flex: 1, margin: 0 }}>
          <label className="lbl" htmlFor={`${idPrefix}-pin`}>
            Pin Code *
          </label>
          <input
            className="inp num"
            id={`${idPrefix}-pin`}
            inputMode="numeric"
            maxLength={6}
            value={values.pinCode}
            onChange={(e) => onChange("pinCode", e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="500089"
          />
          <FieldError message={errors.pinCode} />
        </div>
        <div className="field" style={{ flex: 1, margin: 0 }}>
          <label className="lbl" htmlFor={`${idPrefix}-mobile`}>
            Mobile Number *
          </label>
          <input
            className="inp num"
            id={`${idPrefix}-mobile`}
            inputMode="numeric"
            maxLength={10}
            value={values.mobileNumber}
            onChange={(e) =>
              onChange("mobileNumber", e.target.value.replace(/\D/g, "").slice(0, 10))
            }
            placeholder="9876543210"
          />
          <FieldError message={errors.mobileNumber} />
        </div>
      </div>

      <div className="field" style={{ marginTop: 16 }}>
        <label className="lbl" htmlFor={`${idPrefix}-gstin`}>
          GSTIN *
        </label>
        <input
          className="inp"
          id={`${idPrefix}-gstin`}
          maxLength={15}
          value={values.gstin}
          onChange={(e) => onChange("gstin", e.target.value.toUpperCase().replace(/\s/g, ""))}
          placeholder="36ABCDE1234F1Z5"
          style={{ textTransform: "uppercase" }}
        />
        <FieldError message={errors.gstin} />
      </div>
    </>
  );
}
