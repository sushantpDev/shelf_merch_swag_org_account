import { useRef, useState, type Dispatch } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { toast } from "sonner";
import { inr } from "@/components/platform/platform-ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingState } from "@/components/LoadingState";
import { openRazorpayCheckout } from "@/lib/razorpay";
import type { WizardAction } from "../reducer";
import {
  ALLOC_STEP_MAX,
  ALLOC_STEP_MIN,
  ALLOC_STEPS,
  allocationFromPool,
  departmentsToSync,
  isAllocateEditFlow,
  selectedDepartments,
  wizardCommittedAllocations,
  type WizardState,
} from "../types";
import {

  validateWalletContactFields,
  walletContactFieldsValid,
  type WalletContactFieldErrors,
} from "../walletContactFields";
import { persistFundingSuccess } from "../fundingSuccess";
import { useCreateRazorpayOrder, useCreateWallet, useSyncOrgWizard, useVerifyRazorpayPayment } from "../model";
import { Step1Wallet } from "./steps/Step1Wallet";
import { Step2Departments } from "./steps/Step2Departments";
import { Step3Allocate } from "./steps/Step3Allocate";
import { Step4Managers } from "./steps/Step4Managers";
import { Step5Review } from "./steps/Step5Review";
import { managersValid } from "../managerValidation";

type AllocationSuccessManager = {
  name: string;
  email: string;
  department: string;
};

function managerInitials(name: string, email: string): string {
  const source = name.trim() || email.trim();
  const parts = source
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : source.slice(0, 2)).toUpperCase();
}

export function OrgWizard({
  account,
  state,
  dispatch,
  onExit,
  onFinished,
}: {
  account: string;
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
  onExit: () => void;
  onFinished: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showManagerErrors, setShowManagerErrors] = useState(false);
  const [contactErrors, setContactErrors] = useState<WalletContactFieldErrors>({});
  const submitInFlight = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [allocationSuccessManagers, setAllocationSuccessManagers] = useState<AllocationSuccessManager[] | null>(null);
  const createWallet = useCreateWallet();
  const rzpOrder = useCreateRazorpayOrder();
  const verifyPayment = useVerifyRazorpayPayment();
  const sync = useSyncOrgWizard();
  const isWalletFlow = state.flow === "wallet";
  const isPayOnline = isWalletFlow && state.wallet.funding === "pay";
  const busy = submitting || sync.isPending;
  const paymentBusy =
    paying ||
    (isPayOnline && (createWallet.isPending || rzpOrder.isPending || verifyPayment.isPending));
  const n = state.step;
  const isEditAllocate = isAllocateEditFlow(state.flow, state.mode);
  const fromPool = allocationFromPool(state.departments);
  const walletAlloc = wizardCommittedAllocations(state.departments);
  const over =
    !isWalletFlow &&
    n === 3 &&
    (isEditAllocate
      ? fromPool > (state.unallocatedAtStart ?? state.wallet.amount)
      : walletAlloc > state.wallet.amount);

  function validateWalletStep(): boolean {
    const w = state.wallet;
    if (!w.name.trim()) {
      toast.error("Enter a budget name");
      return false;
    }
    if (w.amount <= 0) {
      toast.error("Enter an amount above zero");
      return false;
    }
    const contactValidation = validateWalletContactFields(
      {
        address: w.address,
        pinCode: w.pinCode,
        mobileNumber: w.mobileNumber,
        gstin: w.gstin,
      },
      { required: true },
    );
    setContactErrors(contactValidation);
    if (!walletContactFieldsValid(contactValidation)) {
      toast.error("Complete all required wallet details");
      return false;
    }
    if (w.funding === "upload" && !w.uploaded && !w.uploadFile) {
      toast.error("Upload your PO or agreement");
      return false;
    }
    if (w.funding === "upload" && !w.docNumber.trim()) {
      toast.error("Enter the document number");
      return false;
    }
    return true;
  }

  async function handlePayOnline() {
    if (!validateWalletStep()) return;
    if (paying || submitInFlight.current) return;
    submitInFlight.current = true;
    setPaying(true);
    try {
      const { walletId } = await createWallet.mutateAsync(state);
      const order = await rzpOrder.mutateAsync({ walletId, amount: state.wallet.amount });
      await openRazorpayCheckout({
        order,
        walletName: state.wallet.name,
        description: `Fund ${state.wallet.name}`,
        onSuccess: async (response) => {
          try {
            await verifyPayment.mutateAsync({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            persistFundingSuccess({
              amount: state.wallet.amount,
              name: state.wallet.name,
              walletId,
              kind: "create",
            });
            dispatch({ type: "finished", walletId, invites: [] });
            toast.success("Payment submitted for review", {
              description: `${inr(state.wallet.amount)} pending approval`,
            });
            onFinished();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Payment verification failed");
            submitInFlight.current = false;
            setPaying(false);
          }
        },
        onDismiss: () => {
          toast.message("Payment cancelled", {
            description: "Budget saved as draft",
          });
          submitInFlight.current = false;
          setPaying(false);
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Payment could not be started";
      if (message === "Payment cancelled") {
        // handled in onDismiss
      } else if (message.includes("RAZORPAY_NOT_CONFIGURED") || message.includes("not configured")) {
        toast.error("Payment setup incomplete");
      } else {
        toast.error(message);
      }
      submitInFlight.current = false;
      setPaying(false);
    }
  }

  function validateManagersStep(): boolean {
    setShowManagerErrors(true);
    if (managersValid(state.departments)) return true;
    dispatch({ type: "goto", step: 4 });
    toast.error("Check the highlighted manager details");
    return false;
  }

  function goToStep(step: number) {
    if (step > 4 && !validateManagersStep()) return;
    dispatch({ type: "goto", step });
  }

  function handleNext() {
    if (isWalletFlow) {
      if (!validateWalletStep()) return;
      if (isPayOnline) {
        void handlePayOnline();
        return;
      }
      setConfirmOpen(true);
      return;
    }

    if (n === 2 && departmentsToSync(state.departments).length === 0) {
      toast.error("Select at least one department to continue");
      return;
    }
    if (n === 3 && over) {
      toast.error("Reduce your allocations");
      return;
    }
    if (n >= 4 && !validateManagersStep()) return;
    if (n === ALLOC_STEP_MAX) {
      if (walletAlloc <= 0) {
        toast.error("Allocate a department budget");
        return;
      }
      setConfirmOpen(true);
      return;
    }
    dispatch({ type: "next" });
  }

  async function handleFinish() {
    if (!isWalletFlow && !validateManagersStep()) {
      setConfirmOpen(false);
      return;
    }
    if (submitInFlight.current) return;
    submitInFlight.current = true;
    setSubmitting(true);
    setConfirmOpen(false);
    try {
      if (isWalletFlow) {
        const result = await createWallet.mutateAsync(state);
        persistFundingSuccess({
          amount: state.wallet.amount,
          name: state.wallet.name,
          walletId: result.walletId,
          kind: "create",
        });
        dispatch({ type: "finished", walletId: result.walletId, invites: [] });
        toast.success("Budget submitted for review");
        onFinished();
        return;
      }

      const result = await sync.mutateAsync(state);
      dispatch({ type: "finished", walletId: result.walletId, invites: result.invites });
      setSubmitting(false);
      setAllocationSuccessManagers(
        selectedDepartments(state.departments)
          .filter((d) => d.mgr.email.trim())
          .map((d) => ({
            name: d.mgr.name.trim() || d.mgr.email.trim(),
            email: d.mgr.email.trim(),
            department: d.name,
          })),
      );
      const inviteCount = result.invites.length;
      toast.success(
        inviteCount > 0
          ? inviteCount === 1 ? "1 invitation sent" : `${inviteCount} invitations sent`
          : "Managers notified",
      );
    } catch (err) {
      submitInFlight.current = false;
      setSubmitting(false);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  }

  function closeAllocationSuccess() {
    setAllocationSuccessManagers(null);
    onExit();
  }

  if (busy) {
    return (
      <LoadingState
        message={isWalletFlow ? "Setting up budget…" : "Saving allocation setup…"}
        fullScreen={false}
      />
    );
  }

  const stepLabels = [...ALLOC_STEPS];
  const stepNumbers = [2, 3, 4, 5];

  return (
    <div className={!isWalletFlow ? "allocation-wizard" : undefined}>
      <div className={isWalletFlow ? "page-h budget-setup-header" : "page-h"}>
        <div>
          <button
            type="button"
            className="lnk"
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 8,
            }}
            onClick={onExit}
          >
            <ArrowLeft size={15} /> Back to budget dashboard
          </button>
          <h1>{isWalletFlow ? "Setup budget" : "Allocate budget"}</h1>
          {isWalletFlow && (
            <div className="sub budget-setup-subtitle">
              {isPayOnline
                ? "Pay online to fund your organization budget."
                : "Submit a Purchase Order or Agreement to fund your organization budget."}
            </div>
          )}
        </div>
        {isWalletFlow && (
          <div className="budget-setup-info">
            <p>Create your organization&apos;s merchandise budget. Submit a Purchase Order or Agreement for ShelfMerch approval. This is your single budget for all campaigns and orders.</p>
          </div>
        )}
      </div>

      {!isWalletFlow && (
        <div className="org-stepper">
          {stepLabels.map((label, i) => {
            const s = stepNumbers[i];
            const cls = s < n ? "done" : s === n ? "active" : "";
            return (
              <div key={label} className={`org-step ${cls}`}>
                <button
                  type="button"
                  className="sbtn"
                  onClick={() => goToStep(s)}
                >
                  <div className="snum">{s < n ? "✓" : i + 1}</div>
                  <div className="smeta">
                    <span className="slabel">{label}</span>
                  </div>
                </button>
                {i < stepLabels.length - 1 && <div className="sline" />}
              </div>
            );
          })}
        </div>
      )}

      {isWalletFlow && n === 1 && (
        <Step1Wallet
          state={state}
          dispatch={dispatch}
          contactErrors={contactErrors}
          onProceedToPayment={handlePayOnline}
          paymentBusy={paymentBusy}
        />
      )}
      {!isWalletFlow && n === 2 && <Step2Departments state={state} dispatch={dispatch} />}
      {!isWalletFlow && n === 3 && <Step3Allocate state={state} dispatch={dispatch} />}
      {!isWalletFlow && n === 4 && <Step4Managers state={state} dispatch={dispatch} showErrors={showManagerErrors} />}
      {!isWalletFlow && n === 5 && (
        <Step5Review state={state} dispatch={dispatch} account={account} />
      )}

      <div className="org-foot">
        <span style={{ visibility: isWalletFlow || n === ALLOC_STEP_MIN ? "hidden" : undefined }}>
          <button
            type="button"
            className="lnk"
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
            onClick={() => dispatch({ type: "back" })}
          >
            <ArrowLeft size={15} /> Back
          </button>
        </span>
        <button
          type="button"
          className="btn btn-brand"
          id="org-next"
          disabled={over || paymentBusy}
          onClick={handleNext}
        >
          {isWalletFlow
            ? isPayOnline
              ? paymentBusy
                ? "Opening checkout…"
                : "Proceed to payment"
              : "Submit for review"
            : n === ALLOC_STEP_MAX
              ? "Finish allocation"
              : "Continue"}
          <Send size={15} />
        </button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm-modal budget-confirm-dialog">
          <div className="modal-pad">
            <DialogHeader className="budget-confirm-dialog__header">
              <DialogTitle>
                {isWalletFlow ? "Submit budget for review?" : "Finish allocation?"}
              </DialogTitle>
              <DialogDescription className="budget-confirm-dialog__copy">
                {isWalletFlow ? (
                  <>
                    Submit <b>{state.wallet.name}</b> ({inr(state.wallet.amount)})
                    {" "}to ShelfMerch for approval.
                  </>
                ) : (
                  <>
                    Save allocations for <b>{state.wallet.name}</b> ({inr(fromPool)}). New managers
                    get an invitation; active managers get a budget notification.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="budget-confirm-dialog__actions">
              <button
                type="button"
                className="btn btn-ghost"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => setConfirmOpen(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-brand"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={handleFinish}
                disabled={submitting}
              >
                {isWalletFlow ? "Submit" : "Finish"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={allocationSuccessManagers !== null}
        onOpenChange={(open) => {
          if (!open) closeAllocationSuccess();
        }}
      >
        <DialogContent className="sm-modal allocation-success-modal">
          <div className="allocation-success-modal__body">
            <div className="allocation-success-modal__plane" aria-hidden="true">
              <Send size={78} strokeWidth={1.2} />
            </div>
            <DialogHeader className="allocation-success-modal__header">
              <DialogTitle className="allocation-success-modal__title">
                Invitations sent!
              </DialogTitle>
              <DialogDescription className="allocation-success-modal__copy">
                Managers have been invited and their budgets are ready.
              </DialogDescription>
            </DialogHeader>

            <div className="allocation-success-modal__list">
              {(allocationSuccessManagers ?? []).map((manager) => (
                <div key={`${manager.email}-${manager.department}`} className="allocation-success-modal__row">
                  <div className="allocation-success-modal__avatar">
                    {managerInitials(manager.name, manager.email)}
                  </div>
                  <div className="allocation-success-modal__person">
                    <strong>{manager.name}</strong>
                    <span>
                      {manager.email} · {manager.department}
                    </span>
                  </div>
                  <span className="allocation-success-modal__sent">✓ Sent</span>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="allocation-success-modal__done"
              onClick={closeAllocationSuccess}
            >
              Done
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
