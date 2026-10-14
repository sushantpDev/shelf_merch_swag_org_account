import { ArrowLeftRight } from "lucide-react";
import { useEffect, useState } from "react";
import { LoadingState } from "@/components/LoadingState";
import { SendingPointsAnimation } from "@/components/SendingPointsAnimation";
import { inr } from "@/components/platform/platform-ui";
import { WizardChrome } from "@/features/swag/wizard/WizardChrome";
import { RecipientPicker } from "@/features/send/RecipientPicker";
import { RecipientExperience } from "@/features/send/RecipientExperience";
import { PaymentPanel } from "@/features/send/PaymentPanel";
import { InsufficientFundsDraftBanner } from "@/features/send/InsufficientFundsDraftBanner";
import { POINTS_PER_RUPEE } from "@/lib/storeCurrency";
import {
  conversionBadge,
  formatPointsQuantity,
  sendFlowTitle,
  unitLabel,
  unitLabelLower,
} from "@/lib/storeCurrency";
import { formatWalletAmount } from "@/lib/walletFormat";
import {
  budgetPerRecipientError,
  isValidBudgetPerRecipient,
  SEND_POINTS_PLACEHOLDERS,
} from "../pointsDraft";
import type { SendPointsVm } from "../controllers/useSendPointsController";

const STEPS = ["Budget", "Recipients", "Message", "Checkout"];

/** Pure wizard shell for the send-points flow; all state and actions come from the controller. */
export function SendPointsView({
  isLoading,
  isSending,
  isSaving,
  sendPhase,
  sendError,
  sendRecipients,
  onDismissSendError,
  step,
  draft,
  dispatch,
  totals,
  billableRecipientCount,
  shop,
  shopCurrencyLabel,
  currencyMode,
  wallet,
  wallets,
  selectedWalletId,
  onWalletSelect,
  walletAvailable,
  onExit,
  onNext,
  onBack,
  onPayNow,
  onSaveAndExit,
  fundsBlockReason,
  pickerContacts,
  onToggleRecip,
  onSelectAllRecips,
  onAddRecipientEmails,
  onImportRecipientCsv,
}: SendPointsVm) {
  const [pprRaw, setPprRaw] = useState(draft.ppr > 0 ? String(draft.ppr) : "");
  const usesCredits = currencyMode === "inr";
  const unit = unitLabel(currencyMode);
  const unitLower = unitLabelLower(currencyMode);
  const flowTitle = sendFlowTitle(currencyMode);
  const conversion = conversionBadge(currencyMode);

  useEffect(() => {
    setPprRaw(draft.ppr > 0 ? String(Math.trunc(draft.ppr)) : "");
  }, [draft.ppr]);

  const pprError = budgetPerRecipientError(pprRaw);
  const budgetStepValid = Boolean(draft.recips) && isValidBudgetPerRecipient(pprRaw);
  const recipientsStepValid = Boolean(draft.recips) && draft.selRecips.length === draft.recips;

  const sendTotalUnits = usesCredits
    ? Math.round(totals.sub)
    : Math.round(totals.totalPoints);

  const payingWithWallet = draft.pay === "wallet";
  const checkoutWallets = wallets?.length ? wallets : wallet ? [wallet] : [];
  const activeCheckoutWallet =
    checkoutWallets.find((w) => w.id === selectedWalletId) ?? checkoutWallets[0];
  const walletBalance = activeCheckoutWallet ? walletAvailable(activeCheckoutWallet) : 0;
  const purchaseAmount = Math.round(totals.sub);
  const remainingBalance = Math.max(0, walletBalance - purchaseAmount);
  const walletCur = activeCheckoutWallet?.cur ?? "INR";
  const purchasePointsLabel = usesCredits
    ? formatPointsQuantity(totals.totalPoints, currencyMode)
    : `${totals.totalPoints.toLocaleString("en-IN")} Pts`;


  if (isLoading) {
    return <LoadingState message="Loading…" fullScreen={false} variant="compact" />;
  }
  if (isSending || sendPhase !== "idle") {
    return (
      <div className="sm-loading-inline" style={{ minHeight: 420 }}>
        <SendingPointsAnimation
          recipients={sendRecipients}
          totalPoints={sendTotalUnits}
          isComplete={sendPhase === "success"}
          error={sendPhase === "error" ? sendError : null}
          onRetry={onDismissSendError}
          unitLabel={unitLower}
        />
      </div>
    );
  }

  const footer = (
    <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
      <button
        type="button"
        className="lnk"
        style={{ background: "none", border: "none", cursor: "pointer" }}
        disabled={isSaving}
        onClick={() => (step === 0 ? onExit() : onBack())}
      >
        {step === 0 ? "Cancel" : "Back"}
      </button>
      {step < 3 ? (
        <button
          type="button"
          className="btn btn-brand"
          disabled={(step === 0 && !budgetStepValid) || (step === 1 && !recipientsStepValid)}
          onClick={onNext}
        >
          Next
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-soft"
          disabled={isSaving}
          onClick={() => void onSaveAndExit()}
        >
          {isSaving ? "Saving…" : "Save and exit"}
        </button>
      )}
    </div>
  );

  return (
    <WizardChrome
      title={flowTitle}
      steps={STEPS}
      activeIndex={step}
      onExit={() => void onSaveAndExit()}
      exitLabel={isSaving ? "Saving…" : "Save and exit"}
      exitDisabled={isSaving}
      showExit
      footer={footer}
    >
      {step === 0 && (
        <div
          className="card"
          style={{ padding: 24, maxWidth: 880, width: "100%", margin: "10px auto 0" }}
        >
          <div
            className="row"
            style={{ justifyContent: "space-between", alignItems: "flex-start" }}
          >
            <div>
              <h1 style={{ fontSize: 24 }}>{flowTitle}</h1>
              <p className="muted">
                {unit} let recipients redeem items from your shop.
              </p>
              {shop ? (
                <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Sending from <b>{shop.name}</b>
                </p>
              ) : null}
            </div>
            <span className="tag tag-ready">{shopCurrencyLabel}</span>
          </div>
          <div className="divider" />
          <div className="row" style={{ gap: 20 }}>
            <div className="field" style={{ flex: 1 }}>
              <label className="lbl">Campaign name</label>
              <input
                className="inp"
                value={draft.orderName}
                placeholder={SEND_POINTS_PLACEHOLDERS.orderName}
                onChange={(e) => dispatch({ type: "setOrderName", orderName: e.target.value })}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label className="lbl">Number of recipients</label>
              <input
                className="inp num"
                value={draft.recips || ""}
                placeholder={SEND_POINTS_PLACEHOLDERS.recips}
                onChange={(e) =>
                  dispatch({ type: "setRecips", recips: Number(e.target.value) || 0 })
                }
              />
            </div>
          </div>
          <label className="lbl">Budget per recipient ({conversion})</label>
          <div className="row" style={{ alignItems: "center", gap: 14 }}>
            <div className="inp-wrap" style={{ flex: 1 }}>
              <input
                className="inp num"
                inputMode="numeric"
                value={pprRaw}
                placeholder={SEND_POINTS_PLACEHOLDERS.ppr}
                aria-invalid={Boolean(pprRaw && pprError)}
                onChange={(e) => {
                  const raw = e.target.value;
                  setPprRaw(raw);
                  if (raw.trim() === "") {
                    dispatch({ type: "setPpr", ppr: 0 });
                    return;
                  }
                  if (/^\d+$/.test(raw.trim())) {
                    dispatch({ type: "setPpr", ppr: Number(raw.trim()) });
                    return;
                  }
                  // Keep draft invalid so Continue stays disabled for decimals / junk.
                  const asNum = Number(raw);
                  dispatch({
                    type: "setPpr",
                    ppr: Number.isFinite(asNum) ? asNum : 0,
                  });
                }}
              />
              <span className="inp-suffix">INR</span>
            </div>
            <div style={{ color: "var(--ink-3)" }}>
              <ArrowLeftRight size={18} />
            </div>
            <div className="inp-wrap" style={{ flex: 1 }}>
              <input
                className="inp num"
                value={
                  isValidBudgetPerRecipient(pprRaw)
                    ? usesCredits
                      ? Number(pprRaw).toFixed(2)
                      : (Number(pprRaw) * POINTS_PER_RUPEE).toFixed(2)
                    : ""
                }
                placeholder={SEND_POINTS_PLACEHOLDERS.points}
                readOnly
                style={{ background: "#fff" }}
              />
              <span className="inp-suffix">{usesCredits ? "CREDITS" : "POINTS"}</span>
            </div>
          </div>
          {pprRaw && pprError ? (
            <p style={{ fontSize: 12, marginTop: 8, color: "var(--danger)", fontWeight: 600 }}>
              {pprError}
            </p>
          ) : (
            <p className="mut3" style={{ fontSize: 12, marginTop: 8 }}>
              Minimum ₹250 per recipient. Whole numbers only. Shipping included.
            </p>
          )}
          <div className="divider" style={{ marginTop: 18 }} />
          <div
            className="card"
            style={{
              marginTop: 18,
              padding: 18,
              background: "#fff",
              border: "1px solid var(--line)",
            }}
          >
            <h3 style={{ fontSize: 16, marginBottom: 6 }}>Shop {unit}</h3>
            <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.55, margin: 0 }}>
              {shop ? (
                <>
                  These {unitLower} belong to <b>{shop.name}</b>. They will be allocated to the recipients selected in the next step. They can only be redeemed in this shop and cannot be transferred or used in any other shop.
                </>
              ) : (
                <>
                  These {unitLower} will be allocated to the recipients selected in the next step and can
                  only be redeemed in this shop.
                </>
              )}
            </p>
          </div>
        </div>
      )}
 
      {step === 1 && (
        <RecipientPicker
          title="Add recipients"
          subtitle="Don't have all emails? You can add recipients later from the shop dashboard."
          contacts={pickerContacts}
          selected={draft.selRecips}
          maxRecipients={draft.recips || undefined}
          onToggle={onToggleRecip}
          onDeselectAll={() => dispatch({ type: "deselectRecips" })}
          onSelectAll={onSelectAllRecips}
          onAddEmails={onAddRecipientEmails}
          onCsvImport={onImportRecipientCsv}
        />
      )}

      {step === 2 && (
        <>
          {fundsBlockReason ? (
            <InsufficientFundsDraftBanner
              reason={fundsBlockReason}
              saving={isSaving}
              onSave={() => void onSaveAndExit()}
            />
          ) : null}
          <RecipientExperience
            kind="points"
            shopName={shop?.name}
            shopBrand={
              shop
                ? { name: shop.name, logoUrl: shop.logoUrl, bannerConfig: shop.bannerConfig }
                : undefined
            }
            currencyMode={currencyMode}
            pointsScope={draft.pointsScope}
            pointsAmount={
              usesCredits ? Math.round(draft.ppr) : Math.round(draft.ppr * POINTS_PER_RUPEE)
            }
            from={draft.from}
            message={draft.msg}
            fromPlaceholder={SEND_POINTS_PLACEHOLDERS.from}
            messagePlaceholder={SEND_POINTS_PLACEHOLDERS.msg}
            onFrom={(from) => dispatch({ type: "setFrom", from })}
            onMessage={(msg) => dispatch({ type: "setMsg", msg })}
            when={draft.when}
            onWhen={(when) => dispatch({ type: "setWhen", when })}
            schedule={draft.schedule}
            onSchedule={(key, value) => dispatch({ type: "setSchedule", key, value })}
            preview={draft.preview}
            onPreview={(preview) => dispatch({ type: "setPreview", preview })}
          />
        </>
      )}

      {step === 3 && (
        <>
          <h1 style={{ fontSize: 24, marginBottom: 16 }}>Checkout</h1>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <PaymentPanel
              wallet={wallet}
              wallets={wallets}
              selected={draft.pay}
              onSelect={(pay) => dispatch({ type: "setPay", pay })}
              selectedWalletId={selectedWalletId}
              onWalletSelect={onWalletSelect}
              walletAvailable={walletAvailable}
            />
            <div className="card" style={{ padding: 22, height: "fit-content" }}>
              <div
                className="row"
                style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}
              >
                <h3 style={{ fontSize: 18 }}>Order summary</h3>
                <span className="tag tag-ready">{conversion}</span>
              </div>
              <SumRow
                k="No. of recipients"
                v={billableRecipientCount ? String(billableRecipientCount) : SEND_POINTS_PLACEHOLDERS.recips}
              />
              <SumRow
                k={`${draft.pointsScope === "stadium" ? "Shelf Merch" : "Shop"} ${unitLower} per recipient`}
                v={formatPointsQuantity(totals.pointsPerRecipient, currencyMode)}
              />
              <SumRow
                k={`Total ${draft.pointsScope === "stadium" ? "Shelf Merch" : "Shop"} ${unitLower} purchased`}
                v={
                  usesCredits
                    ? `${formatPointsQuantity(totals.totalPoints, currencyMode)} (${inr(totals.sub)})`
                    : `${totals.totalPoints.toLocaleString("en-IN")} Pts (${inr(totals.sub)})`
                }
              />
              {/* <SumRow k="Service fee (15%)" v={inr(totals.fee)} /> */}
              {/* <SumRow k="Estimated GST (18%)" v={inr(totals.tax)} /> */}
              <div className="divider" />
              {payingWithWallet ? (
                <div style={{ marginTop: 4 }}>
                  <SumRow
                    k="Wallet balance"
                    v={formatWalletAmount(walletBalance, walletCur)}
                  />
                  <SumRow
                    k="Purchase amount"
                    v={`${inr(purchaseAmount)} (${purchasePointsLabel})`}
                  />
                  <SumRow k="Amount to be paid now" v={inr(0)} />
                  <div
                    className="row"
                    style={{
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 0 0",
                    }}
                  >
                    <b style={{ fontSize: 15 }}>Remaining balance</b>
                    <b className="num" style={{ fontSize: 18, fontFamily: "var(--disp)" }}>
                      {formatWalletAmount(remainingBalance, walletCur)}
                    </b>
                  </div>
                </div>
              ) : (
                <div
                  className="row"
                  style={{ justifyContent: "space-between", alignItems: "center" }}
                >
                  <b style={{ fontSize: 18 }}>You pay</b>
                  <b className="num" style={{ fontSize: 22, fontFamily: "var(--disp)" }}>
                    {inr(totals.sub)}
                  </b>
                </div>
              )}
              <button
                type="button"
                className="btn btn-brand btn-block btn-lg"
                style={{ marginTop: 14 }}
                onClick={onPayNow}
              >
                {payingWithWallet ? `Confirm & ${flowTitle}` : `Pay ${inr(purchaseAmount)}`}
              </button>
              <button
                type="button"
                className="btn btn-soft btn-block"
                style={{ marginTop: 10 }}
                disabled={isSaving}
                onClick={() => void onSaveAndExit()}
              >
                {isSaving ? "Saving…" : "Save as draft"}
              </button>
            </div>
          </div>
        </>
      )}
    </WizardChrome>
  );
}

function SumRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", padding: "7px 0" }}>
      <span className="muted" style={{ fontSize: 13 }}>
        {k}
      </span>
      <span className="num" style={{ fontWeight: 600, fontSize: 13 }}>
        {v}
      </span>
    </div>
  );
}
