import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import type { CopilotConfirmationArtifact, CopilotSuccessArtifact } from "./api";
import {
  cancelCopilotWriteApi,
  executeCopilotWriteApi,
  persistCopilotWriteArtifactApi,
  resolveCopilotWriteApi,
} from "./api";
import { buildWriteSuccessArtifact } from "./writeSuccess";
import { shopStorefrontHref } from "@/lib/shopRedeemUrl";
import { tenantPath } from "@/lib/workspaceSlug";

function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `copilot-write-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function previewEntries(
  preview: Record<string, unknown> | undefined,
  request: Record<string, unknown> | undefined,
) {
  const source = { ...(request || {}), ...(preview || {}) };
  const preferred = [
    "name",
    "amount",
    "currencyMode",
    "status",
    "shopId",
    "walletId",
    "entityId",
    "campaignId",
    "recipients",
  ];
  const rows: { label: string; value: string }[] = [];
  for (const key of preferred) {
    if (source[key] === undefined || source[key] === null || source[key] === "") continue;
    const raw = source[key];
    const value = Array.isArray(raw)
      ? `${raw.length} items`
      : typeof raw === "object"
        ? JSON.stringify(raw)
        : String(raw);
    rows.push({ label: key, value });
  }
  if (!rows.length) {
    for (const [key, raw] of Object.entries(source).slice(0, 6)) {
      if (typeof raw === "object" && raw !== null) continue;
      rows.push({ label: key, value: String(raw) });
    }
  }
  return rows;
}

function titleForOperation(operation: string) {
  return operation.replace(/[_.]/g, " ");
}

function toSuccessArtifact(
  workflow: string,
  result: Record<string, unknown> & { id?: string; name?: string; status?: string },
  artifact: CopilotConfirmationArtifact,
): CopilotSuccessArtifact {
  return buildWriteSuccessArtifact(workflow, result, {
    preview: artifact.preview,
    request: artifact.request as Record<string, unknown> | undefined,
  });
}

export function CopilotConfirmationCard({
  artifact,
  conversationId,
  onChange,
}: {
  artifact: CopilotConfirmationArtifact;
  conversationId?: string | null;
  onChange: (next: CopilotConfirmationArtifact | CopilotSuccessArtifact) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => newIdempotencyKey());
  const recoveringRef = useRef(false);
  const preview = artifact.preview || {};
  const pending = artifact.status === "pending";
  const workflow = artifact.operation;
  const rows = previewEntries(preview, artifact.request as Record<string, unknown> | undefined);

  async function persistOutcome(next: CopilotConfirmationArtifact | CopilotSuccessArtifact) {
    if (!conversationId || !artifact.confirmationId) return;
    try {
      await persistCopilotWriteArtifactApi(conversationId, {
        confirmationId: artifact.confirmationId,
        artifact: next,
      });
    } catch {
      // Local UI state still updates; persistence is best-effort for reload recovery.
    }
  }

  async function applyOutcome(next: CopilotConfirmationArtifact | CopilotSuccessArtifact) {
    onChange(next);
    await persistOutcome(next);
  }

  useEffect(() => {
    if (!pending || busy || recoveringRef.current) return;
    if (!artifact.confirmationId) return;
    recoveringRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const resolved = await resolveCopilotWriteApi(workflow, {
          ...(artifact.request || {}),
          confirmationId: artifact.confirmationId,
          idempotencyKey: `reconcile:${artifact.confirmationId}`,
        });
        if (cancelled) return;
        if (resolved.status === "completed" && resolved.result) {
          await applyOutcome(toSuccessArtifact(workflow, resolved.result, artifact));
          return;
        }
        if (resolved.status === "cancelled") {
          await applyOutcome({ ...artifact, status: "cancelled" });
        }
      } catch {
        // Leave the pending card so the user can confirm or cancel explicitly.
      } finally {
        recoveringRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
    // Recover once per mounted pending confirmation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact.confirmationId, pending]);

  async function onConfirm() {
    if (!pending || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await executeCopilotWriteApi(workflow, {
        ...(artifact.request || {}),
        confirmationId: artifact.confirmationId,
        idempotencyKey,
      });
      await applyOutcome(toSuccessArtifact(workflow, result, artifact));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not confirm";
      // Ambiguous client failure after a possible server success: reconcile without a new WRITE.
      try {
        const resolved = await resolveCopilotWriteApi(workflow, {
          ...(artifact.request || {}),
          confirmationId: artifact.confirmationId,
          idempotencyKey: `reconcile:${artifact.confirmationId}`,
        });
        if (resolved.status === "completed" && resolved.result) {
          await applyOutcome(toSuccessArtifact(workflow, resolved.result, artifact));
          return;
        }
      } catch {
        // Fall through to the original error.
      }
      setError(message);
      await applyOutcome({ ...artifact, status: "failed" });
    } finally {
      setBusy(false);
    }
  }

  async function onCancel() {
    if (!pending || busy) return;
    setBusy(true);
    setError(null);
    try {
      await cancelCopilotWriteApi(workflow, artifact.confirmationId);
      await applyOutcome({ ...artifact, status: "cancelled" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel");
    } finally {
      setBusy(false);
    }
  }

  if (artifact.status === "cancelled") {
    return (
      <div className="sm-copilot-confirm sm-copilot-confirm--cancelled" role="status">
        {titleForOperation(workflow)} was cancelled. No changes were saved.
      </div>
    );
  }

  if (artifact.status === "failed") {
    return (
      <div className="sm-copilot-confirm" role="group" aria-label={`Confirm ${titleForOperation(workflow)}`}>
        <div className="sm-copilot-confirm__head">
          <strong>Confirm {titleForOperation(workflow)}</strong>
        </div>
        <dl className="sm-copilot-confirm__preview">
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
        {error ? (
          <p className="sm-copilot-attach-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="sm-copilot-attach-error" role="alert">
            Confirmation failed. Refresh to recover status, or ask Copilot to prepare the change again.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="sm-copilot-confirm" role="group" aria-label={`Confirm ${titleForOperation(workflow)}`}>
      <div className="sm-copilot-confirm__head">
        <strong>Confirm {titleForOperation(workflow)}</strong>
      </div>
      <dl className="sm-copilot-confirm__preview">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="sm-copilot-confirm__note">Nothing is saved until you confirm. Cancel rejects this confirmation.</p>
      {workflow === "shops.create" ? (
        <p className="sm-copilot-confirm__note">Confirming creates and publishes this new store. It will be live, just like a store created from the dashboard.</p>
      ) : null}
      {error ? (
        <p className="sm-copilot-attach-error" role="alert">
          {error}
        </p>
      ) : null}
      {pending ? (
        <div className="sm-copilot-confirm__actions">
          <button type="button" className="sm-copilot-confirm__cancel" onClick={() => void onCancel()} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="sm-copilot-confirm__ok" onClick={() => void onConfirm()} disabled={busy}>
            {busy ? <LoaderCircle size={16} className="sm-copilot-spin" aria-hidden="true" /> : null}
            Confirm
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function CopilotWriteSuccess({ artifact }: { artifact: CopilotSuccessArtifact }) {
  const entity = artifact.result || artifact.shop;
  const actions =
    artifact.actions?.length
      ? artifact.actions
      : (() => {
          const shopId = String(entity?.id || "").trim();
          const slug = String(entity?.slug || "").trim();
          const storefront =
            typeof entity?.storefrontUrl === "string" && entity.storefrontUrl
              ? String(entity.storefrontUrl)
              : shopId || slug
                ? shopStorefrontHref({ id: shopId, slug: slug || undefined })
                : "";
          const manage = shopId ? tenantPath(`/shops/${shopId}`) : "";
          const rows: NonNullable<CopilotSuccessArtifact["actions"]> = [];
          if (artifact.operation === "shops.publish" && storefront) {
            rows.push({ label: "View Store", href: storefront, external: true });
          }
          if (shopId && artifact.operation.startsWith("shops.")) {
            rows.push({ label: "Manage Store", href: manage });
          }
          return rows;
        })();

  return (
    <div className="sm-copilot-confirm sm-copilot-confirm--success" role="status">
      <CheckCircle2 size={18} aria-hidden="true" />
      <div>
        <strong>{artifact.title || "Completed"}</strong>
        <p>{artifact.message}</p>
        {artifact.details?.length ? (
          <ul className="sm-copilot-confirm__details">
            {artifact.details.map((row) => (
              <li key={row}>{row}</li>
            ))}
          </ul>
        ) : null}
        {actions?.length ? (
          <div className="sm-copilot-confirm__actions">
            {actions.map((action) =>
              action.external ? (
                <a
                  key={action.label}
                  className="sm-copilot-confirm__ok"
                  href={action.href}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {action.label}
                </a>
              ) : (
                <a key={action.label} className="sm-copilot-confirm__cancel" href={action.href}>
                  {action.label}
                </a>
              ),
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
