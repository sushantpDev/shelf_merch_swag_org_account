import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { AuthLayout } from "@/features/auth/views/AuthLayout";
import { clearSession, getAccessToken, isAuthenticated } from "@/services/auth-store";
import { permissionLines } from "./consentPermissions";
import { isSafeResumeUrl } from "./safeOauthReturn";
import { ShieldCheck } from "lucide-react";
import "./oauth-consent.css";

type ConsentSession = {
  client: { name: string };
  account: { name: string; email: string };
  workspaces: { id: string; name: string }[];
  scope: string;
};

type ApiErrorBody = { error?: { code?: string; message?: string } };

async function consentRequest(path: string, body?: unknown): Promise<Response> {
  const headers = new Headers();
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers,
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function OauthConsentPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<ConsentSession | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate("/login?return=/oauth/consent", { replace: true });
      return;
    }
    let cancelled = false;
    consentRequest("/oauth/consent/session")
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as ConsentSession & ApiErrorBody | null;
        if (cancelled) return;
        if (res.status === 401 && body?.error?.code !== "INTERACTION_EXPIRED") {
          if (body?.error?.code === "SESSION_EXPIRED") clearSession();
          const expired = body?.error?.code === "SESSION_EXPIRED" ? "session=expired&" : "";
          navigate(`/login?${expired}return=/oauth/consent`, { replace: true });
          return;
        }
        if (!res.ok) {
          setError(body?.error?.message || "This authorization request could not be opened.");
          return;
        }
        const next = body as ConsentSession;
        setSession(next);
        if (next.workspaces?.length === 1) setWorkspaceId(next.workspaces[0].id);
      })
      .catch(() => {
        if (!cancelled) setError("This authorization request could not be opened.");
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function decide(decision: "allow" | "deny") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await consentRequest("/oauth/consent/decision", {
        decision,
        ...(decision === "allow" ? { tenantId: workspaceId } : {}),
      });
      const body = (await res.json().catch(() => null)) as { resumeUrl?: string } & ApiErrorBody | null;
      if (!res.ok || !body?.resumeUrl || !isSafeResumeUrl(body.resumeUrl, window.location.origin)) {
        setError(body?.error?.message || "The decision could not be completed.");
        setBusy(false);
        return;
      }
      window.location.assign(body.resumeUrl);
    } catch {
      setError("The decision could not be completed.");
      setBusy(false);
    }
  }

  const canAllow = Boolean(session && workspaceId && session.workspaces.some((workspace) => workspace.id === workspaceId));

  return (
    <AuthLayout variant="welcome" className="oauth-consent" showDivider={false} title="Allow access" subtitle="Review the application, permissions and workspace before you connect.">
      {!session && !error ? <p className="auth-simple-subtitle">Checking your ShelfMerch session…</p> : null}
      {session ? (
        <div className="oauth-consent-form">
          <div className="oauth-consent-badge"><ShieldCheck size={17} aria-hidden="true" /> APPLICATION ACCESS REQUEST</div>
          <dl className="oauth-consent-details">
            <div>
              <dt className="auth-simple-label">Application</dt>
              <dd>{session.client.name}</dd>
            </div>
            <div>
              <dt className="auth-simple-label">ShelfMerch account</dt>
              <dd>
                {session.account.name} ({session.account.email})
              </dd>
            </div>
            <div>
              <dt className="auth-simple-label">Requested permissions</dt>
              <dd>
                <ul className="oauth-consent-permissions">
                {permissionLines(session.scope).map((line) => (
                  <li key={line}>{line}</li>
                ))}
                </ul>
              </dd>
            </div>
          </dl>
          {session.workspaces.length ? (
            <fieldset className="oauth-consent-workspaces">
              <legend className="auth-simple-label">Choose a workspace</legend>
              {session.workspaces.map((workspace) => (
                <label key={workspace.id} className="oauth-consent-workspace">
                  <input
                    type="radio"
                    name="workspace"
                    value={workspace.id}
                    checked={workspaceId === workspace.id}
                    onChange={() => setWorkspaceId(workspace.id)}
                  />{" "}
                  {workspace.name}
                </label>
              ))}
            </fieldset>
          ) : (
            <p className="auth-simple-error" role="status">
              This account has no company workspace you can connect. An admin or entity manager role is required.
            </p>
          )}
          {error ? (
            <p className="auth-simple-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="oauth-consent-actions" aria-busy={busy}>
          <button type="button" className="auth-simple-submit" disabled={!canAllow || busy} onClick={() => decide("allow")}>
            {busy ? "Processing…" : "Allow access"}
          </button>
          <button type="button" className="auth-simple-submit oauth-consent-deny" disabled={busy || !session} onClick={() => decide("deny")}>
            Deny
          </button>
          </div>
        </div>
      ) : null}
      {!session && error ? (
        <p className="auth-simple-error" role="alert">
          {error}
        </p>
      ) : null}
    </AuthLayout>
  );
}
