import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  validateWalletContactFields,
  walletContactFieldsValid,
  type WalletContactFieldErrors,
  type WalletContactFields,
} from "../walletContactFields";
import { WalletContactFieldsForm } from "./WalletContactFieldsForm";
import { useUpdateWalletContact } from "../model";

export function WalletDetailsDialog({
  open,
  onOpenChange,
  walletId,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletId: string;
  initial: WalletContactFields;
}) {
  const updateContact = useUpdateWalletContact();
  const [values, setValues] = useState<WalletContactFields>(initial);
  const [errors, setErrors] = useState<WalletContactFieldErrors>({});

  useEffect(() => {
    if (open) {
      setValues(initial);
      setErrors({});
    }
  }, [open, initial]);

  function handleChange(field: keyof WalletContactFields, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  async function handleSave() {
    const nextErrors = validateWalletContactFields(values, { required: true });
    setErrors(nextErrors);
    if (!walletContactFieldsValid(nextErrors)) {
      toast.error("Complete all required wallet details");
      return;
    }

    try {
      await updateContact.mutateAsync({ walletId, fields: values });
      toast.success("Wallet details updated");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update wallet details");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm-modal" style={{ maxWidth: 520 }}>
        <div className="modal-pad">
          <DialogHeader>
            <DialogTitle style={{ fontSize: 20, fontFamily: "var(--font-family-primary)" }}>
              Wallet details
            </DialogTitle>
            <DialogDescription className="muted" style={{ fontSize: 14, margin: "8px 0 0" }}>
              Billing and contact details for this wallet.
            </DialogDescription>
          </DialogHeader>

          <div style={{ marginTop: 20 }}>
            <WalletContactFieldsForm
              idPrefix="wallet-edit"
              values={values}
              errors={errors}
              onChange={handleChange}
            />
          </div>

          <div className="row" style={{ gap: 10, marginTop: 24 }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() => onOpenChange(false)}
              disabled={updateContact.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-brand"
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() => void handleSave()}
              disabled={updateContact.isPending}
            >
              {updateContact.isPending ? "Saving…" : "Save details"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
