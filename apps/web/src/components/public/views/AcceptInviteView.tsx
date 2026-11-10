import { Link } from "react-router";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { AcceptInviteVm } from "../controllers/useAcceptInviteController";
import { AuthLabel, AuthLayout } from "@/features/auth/views/AuthLayout";
import { PasswordField } from "@/features/auth/components/PasswordField";

/** Accept-invite view: branded password activation matching login / reset-password. */
export function AcceptInviteView(vm: AcceptInviteVm) {
  if (!vm.token) {
    return (
      <AuthLayout
        variant="welcome"
        showDivider={false}
        title="Invitation link invalid"
        subtitle="This invite link is missing or no longer valid. Ask your admin to resend the invitation."
        footerLink={{ hint: "", label: "Log in", to: "/login" }}
      >
        <div className="auth-expired-panel">
          <Link
            to="/login"
            className="auth-simple-submit"
            style={{ display: "inline-flex", textDecoration: "none" }}
          >
            Go to login
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (vm.done) {
    return (
      <AuthLayout variant="welcome" showDivider={false} title="You're in">
        <div className="auth-success-panel" role="status">
          <CheckCircle2
            className="auth-success-icon auth-success-icon--pop"
            size={52}
            strokeWidth={1.75}
          />
          <p className="auth-success-headline">Invitation accepted</p>
          <p className="auth-success-copy">Taking you to your workspace…</p>
          <p className="auth-success-redirect" aria-live="polite">
            Redirecting…
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      variant="welcome"
      showDivider={false}
      title="Create your password"
      subtitle="Set a password for your invited account. We'll sign you in to your workspace."
      footerLink={
        vm.showLoginHint ? { hint: "Already activated?", label: "Log in", to: "/login" } : undefined
      }
    >
      <form className="auth-simple-form" onSubmit={vm.onSubmit} aria-busy={vm.loading} noValidate>
        <fieldset className="auth-simple-fieldset" disabled={vm.loading}>
          <div className="auth-simple-field">
            <AuthLabel htmlFor="invite-password">Password</AuthLabel>
            <PasswordField
              id="invite-password"
              value={vm.password}
              onValueChange={vm.onPassword}
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
          </div>

          <div className="auth-simple-field">
            <AuthLabel htmlFor="invite-confirm">Confirm password</AuthLabel>
            <PasswordField
              id="invite-confirm"
              value={vm.confirm}
              onValueChange={vm.onConfirm}
              autoComplete="new-password"
            />
          </div>

          <p className="auth-simple-legal" style={{ marginTop: -4, marginBottom: 16 }}>
            Use at least 8 characters with one letter and one number.
          </p>

          {vm.error ? (
            <p className="auth-simple-error auth-simple-error--shake" role="alert">
              {vm.error}
            </p>
          ) : null}

          <button
            type="submit"
            className="auth-simple-submit"
            disabled={vm.loading || !vm.canSubmit}
          >
            {vm.loading ? (
              <span className="auth-submit-busy">
                <Loader2 size={18} className="auth-spin" aria-hidden="true" />
                Accepting…
              </span>
            ) : (
              "Accept invitation"
            )}
          </button>
        </fieldset>
      </form>
    </AuthLayout>
  );
}
