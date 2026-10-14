import { PlatformError } from "../../../platform-ui";
import type { EmailAllowlistVm } from "../controllers/useEmailAllowlistController";

/** Super-admin UI for allowlisting emails that may sign up or log in. */
export function EmailAllowlistCard({
  emails,
  draft,
  busy,
  err,
  canWrite,
  onDraft,
  onAdd,
  onRemove,
  isProtectedEmail,
}: EmailAllowlistVm) {
  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 16, marginBottom: 4 }}>Login email allowlist</h3>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          Only addresses on this list can sign up or log in (work and personal). Most seeded demo accounts
          use password <code>demo1234</code>; <code>test@shelfmerch.io</code> is an <code>/app</code>-only
          login that uses the generated password below.
        </p>
      </div>

      {err && <PlatformError message={err} />}

      {emails.length === 0 ? (
        <p className="muted" style={{ fontSize: 13, marginBottom: canWrite ? 12 : 0 }}>
          No emails allowlisted. Nobody can sign in until you add addresses.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", display: "grid", gap: 8 }}>
          {emails.map((email) => (
            <li
              key={email}
              className="row"
              style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}
            >
              <code style={{ fontSize: 13 }}>{email}</code>
              {canWrite && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy || isProtectedEmail(email)}
                  onClick={() => onRemove(email)}
                >
                  {isProtectedEmail(email) ? "Protected" : "Remove"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canWrite && (
        <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
          <div className="field" style={{ flex: 1, margin: 0 }}>
            <label className="lbl" htmlFor="allowlist-email">
              Email
            </label>
            <input
              id="allowlist-email"
              className="inp"
              type="email"
              placeholder="user@company.com"
              value={draft}
              disabled={busy}
              onChange={(e) => onDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onAdd();
                }
              }}
            />
          </div>
          <button type="button" className="btn btn-brand btn-sm" disabled={busy} onClick={onAdd}>
            {busy ? "Saving…" : "Add"}
          </button>
        </div>
      )}
    </div>
  );
}
