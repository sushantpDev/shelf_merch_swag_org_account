import { useId, useState } from "react";
import { LoaderCircle, Store } from "lucide-react";
import type { CopilotConfirmationArtifact, CopilotSuccessArtifact } from "./api";
import { prepareCopilotStoreCreateApi } from "./api";
import { CopilotConfirmationCard, CopilotWriteSuccess } from "./CopilotConfirmationCard";

export function CopilotStoreCreateForm({
  disabled,
  onPrepared,
}: {
  disabled?: boolean;
  onPrepared: (artifact: CopilotConfirmationArtifact) => void;
}) {
  const nameId = useId();
  const currencyId = useId();
  const [name, setName] = useState("");
  const [currencyMode, setCurrencyMode] = useState<"points" | "inr">("points");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy || disabled) return;
    setBusy(true);
    setError(null);
    try {
      const prepared = await prepareCopilotStoreCreateApi({
        name: name.trim(),
        currencyMode,
      });
      onPrepared({
        kind: "confirmation",
        operation: "shops.create",
        confirmationId: prepared.confirmationId,
        expiresAt: prepared.expiresAt,
        preview: prepared.preview,
        request: prepared.request,
        status: "pending",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare store create");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="sm-copilot-store-form" onSubmit={(event) => void onSubmit(event)}>
      <div className="sm-copilot-store-form__head">
        <Store size={16} aria-hidden="true" />
        <strong>Create a new store</strong>
      </div>
      <p className="sm-copilot-store-form__hint">
        Preview first. Nothing is saved until you confirm. Currency cannot change after creation.
      </p>
      <label htmlFor={nameId}>Store name</label>
      <input
        id={nameId}
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={80}
        required
        disabled={disabled || busy}
        placeholder="e.g. Employee Store"
      />
      <label htmlFor={currencyId}>Currency</label>
      <select
        id={currencyId}
        value={currencyMode}
        onChange={(event) => setCurrencyMode(event.target.value as "points" | "inr")}
        disabled={disabled || busy}
      >
        <option value="points">Points (₹1 = 2 Points)</option>
        <option value="inr">INR credits (₹1 = 1 Credit)</option>
      </select>
      {error ? (
        <p className="sm-copilot-attach-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="sm-copilot-store-form__submit" disabled={disabled || busy || !name.trim()}>
        {busy ? <LoaderCircle size={16} className="sm-copilot-spin" aria-hidden="true" /> : null}
        Preview store create
      </button>
    </form>
  );
}

export function CopilotStoreCreateConfirm({
  artifact,
  conversationId,
  onChange,
}: {
  artifact: CopilotConfirmationArtifact;
  conversationId?: string | null;
  onChange: (next: CopilotConfirmationArtifact | CopilotSuccessArtifact) => void;
}) {
  return <CopilotConfirmationCard artifact={artifact} conversationId={conversationId} onChange={onChange} />;
}

export function CopilotStoreCreateSuccess({ artifact }: { artifact: CopilotSuccessArtifact }) {
  return <CopilotWriteSuccess artifact={artifact} />;
}
