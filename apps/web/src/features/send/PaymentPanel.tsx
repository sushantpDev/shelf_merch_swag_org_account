import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { formatWalletAmount, walletUnallocated } from "@/lib/walletFormat";
import type { UiWallet } from "@/services/mappers";
import type { PaymentMethod } from "./types";

function defaultWalletAvailable(w: UiWallet): number {
  return walletUnallocated(w);
}

/** Shared payment method picker (Send Items + Send Points). */
export function PaymentPanel({
  wallet,
  wallets,
  selected,
  onSelect,
  selectedWalletId,
  onWalletSelect,
  walletAvailable = defaultWalletAvailable,
  walletPayEnabled = true,
  walletDisabledHint = "Pay via UPI or card",
  walletDisabledBadge = "Unavailable",
}: {
  wallet: UiWallet | undefined;
  wallets?: UiWallet[];
  selected: PaymentMethod;
  onSelect: (method: PaymentMethod) => void;
  selectedWalletId?: string;
  onWalletSelect?: (walletId: string) => void;
  /** Spendable balance for checkout — unallocated for admins, dept budget for managers. */
  walletAvailable?: (wallet: UiWallet) => number;
  /** When false, wallet debit is disabled (pending approval or insufficient funds). */
  walletPayEnabled?: boolean;
  /** Short reason shown under the wallet option when disabled. */
  walletDisabledHint?: string;
  /** Pill label when wallet pay is disabled (e.g. Under review / Insufficient funds). */
  walletDisabledBadge?: string;
}) {
  const walletOptions = useMemo(
    () => (wallets?.length ? wallets : wallet ? [wallet] : []),
    [wallet, wallets],
  );
  const [internalWalletId, setInternalWalletId] = useState(walletOptions[0]?.id ?? "");
  const activeWalletId = selectedWalletId ?? internalWalletId;

  useEffect(() => {
    if (walletOptions.length && !walletOptions.some((item) => item.id === activeWalletId)) {
      const next = walletOptions[0].id;
      setInternalWalletId(next);
      onWalletSelect?.(next);
    }
  }, [activeWalletId, onWalletSelect, walletOptions]);

  useEffect(() => {
    if (!walletPayEnabled && selected === "wallet") {
      onSelect("upi");
    }
  }, [walletPayEnabled, selected, onSelect]);

  const selectedWallet =
    walletOptions.find((item) => item.id === activeWalletId) ?? walletOptions[0];

  function pickWallet(walletId: string) {
    setInternalWalletId(walletId);
    onWalletSelect?.(walletId);
  }

  function selectWalletPayment() {
    if (!walletPayEnabled) return;
    onSelect("wallet");
    if (walletOptions.length && !activeWalletId) {
      pickWallet(walletOptions[0].id);
    }
  }

  const option = (key: PaymentMethod, title: string, sub: string, extra?: React.ReactNode) => (
    <button
      type="button"
      className={`pay-opt ${selected === key ? "on" : ""}`}
      onClick={() => onSelect(key)}
    >
      <div className="rd" />
      <div style={{ flex: 1, textAlign: "left" }}>
        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{title}</div>
        <div className="mut3" style={{ fontSize: 11.5 }}>
          {sub}
        </div>
      </div>
      {extra}
    </button>
  );

  return (
    <div className="card" style={{ padding: 22 }}>
      <h3 style={{ fontSize: 16, marginBottom: 4 }}>Payment method</h3>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
        Pay from your wallet balance, or add a new payment method.
      </p>

      {walletOptions.length ? (
        <div
          className={`pay-wallet-group ${selected === "wallet" ? "is-active" : ""}${
            walletPayEnabled ? "" : " is-disabled"
          }`}
        >
          <button
            type="button"
            className={`pay-opt pay-opt--wallet ${selected === "wallet" ? "on" : ""}`}
            onClick={selectWalletPayment}
            disabled={!walletPayEnabled}
            aria-disabled={!walletPayEnabled}
            title={walletPayEnabled ? undefined : walletDisabledHint}
            style={walletPayEnabled ? undefined : { opacity: 0.55, cursor: "not-allowed" }}
          >
            <div className="rd" />
            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>Select from wallet</div>
              <div className="mut3" style={{ fontSize: 11.5 }}>
                {walletPayEnabled ? "Choose the wallet to use for this send" : walletDisabledHint}
              </div>
            </div>
            {!walletPayEnabled ? (
              <span className="tag tag-draft">{walletDisabledBadge}</span>
            ) : null}
          </button>

          {selected === "wallet" && walletPayEnabled ? (
            <div className="pay-wallet-picker">
              <div className="pay-wallet-picker-head">
                <span>Choose wallet</span>
                <b>{walletOptions.length} available</b>
              </div>
              <div className="pay-wallet-list" role="listbox" aria-label="Wallets">
                {walletOptions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={item.id === selectedWallet?.id}
                    className={`pay-wallet-list-item ${
                      item.id === selectedWallet?.id ? "on" : ""
                    }`}
                    onClick={() => {
                      pickWallet(item.id);
                      onSelect("wallet");
                    }}
                  >
                    <span className="pay-wallet-check" aria-hidden="true" />
                    <span className="pay-wallet-name">{item.name}</span>
                    <b>{formatWalletAmount(walletAvailable(item), item.cur)} available</b>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        option(
          "wallet",
          "Wallet balance",
          `${formatWalletAmount(0, "INR")} available`,
          <span className="tag tag-draft">Unavailable</span>,
        )
      )}

      {option("upi", "UPI / Netbanking", "Pay instantly via any UPI app or bank")}
      {option("card", "Debit / credit card", "Pay securely via Razorpay. Visa, Mastercard, RuPay, Amex")}

      <div className="field" style={{ marginTop: 14 }}>
        <label className="lbl">Billing</label>
        <div
          className="card"
          style={{ padding: "11px 13px", fontSize: 12.5, color: "var(--ink-2)" }}
        >
          Hyderabad, Telangana, IN GSTIN 36AAAAA0000A1Z5{" "}
          <button
            type="button"
            className="lnk"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
            onClick={() => toast("Edit billing in Settings")}
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}
