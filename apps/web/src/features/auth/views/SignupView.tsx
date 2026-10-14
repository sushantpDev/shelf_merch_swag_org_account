import { Link } from "react-router";
import { PasswordField } from "../components/PasswordField";
import type { SignupVm } from "../controllers/useSignupController";
import { AuthLabel, AuthLayout, authInputClassName } from "./AuthLayout";

export function SignupView(vm: SignupVm) {
  return (
    <AuthLayout
      variant="welcome"
      dense
      title="Create your account"
      subtitle="Start managing merch, gifting and orders"
      footerLink={{ hint: "Already have an account?", label: "Log in", to: "/login" }}
    >
      {vm.accountExists ? (
        <div className="auth-exists-panel" role="alert">
          <p className="auth-exists-copy">Account already exists. Sign in</p>
          <button type="button" className="auth-simple-submit" onClick={vm.onSignIn}>
            Sign In
          </button>
          <button
            type="button"
            className="auth-simple-secondary"
            style={{ marginTop: 12 }}
            onClick={vm.onDismissExists}
          >
            Use a different email
          </button>
        </div>
      ) : (
        <form className="auth-simple-form" onSubmit={vm.onSubmit}>
          <div className="auth-simple-name-row">
            <div className="auth-simple-field">
              <AuthLabel htmlFor="signup-first">First name</AuthLabel>
              <input
                id="signup-first"
                type="text"
                autoComplete="given-name"
                placeholder="First name"
                value={vm.firstName}
                onChange={(e) => vm.onFirstName(e.target.value)}
                className={authInputClassName}
                autoFocus
              />
            </div>
            <div className="auth-simple-field">
              <AuthLabel htmlFor="signup-last">Last name</AuthLabel>
              <input
                id="signup-last"
                type="text"
                autoComplete="family-name"
                placeholder="Last name"
                value={vm.lastName}
                onChange={(e) => vm.onLastName(e.target.value)}
                className={authInputClassName}
              />
            </div>
          </div>

          <div className="auth-simple-field">
            <AuthLabel htmlFor="signup-email">Work email</AuthLabel>
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={vm.email}
              onChange={(e) => vm.onEmail(e.target.value)}
              className={authInputClassName}
            />
          </div>

          <div className="auth-simple-field">
            <AuthLabel htmlFor="signup-company">Company</AuthLabel>
            <input
              id="signup-company"
              type="text"
              autoComplete="organization"
              placeholder="Company name"
              value={vm.company}
              onChange={(e) => vm.onCompany(e.target.value)}
              className={authInputClassName}
            />
          </div>

          <div className="auth-simple-field">
            <AuthLabel htmlFor="signup-password">Password</AuthLabel>
            <PasswordField
              id="signup-password"
              value={vm.password}
              onValueChange={vm.onPassword}
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
          </div>

          <div className="auth-simple-field">
            <AuthLabel htmlFor="signup-confirm">Confirm password</AuthLabel>
            <PasswordField
              id="signup-confirm"
              value={vm.confirmPassword}
              onValueChange={vm.onConfirmPassword}
              autoComplete="new-password"
              placeholder="Re-enter password"
            />
          </div>

          <p className="auth-simple-legal">
            By proceeding, you agree to Shelf Merch&apos;s{" "}
            <Link to="/legal/privacy-policy" className="auth-simple-legal-link">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link to="/legal/terms-of-service" className="auth-simple-legal-link">
              Terms of Service
            </Link>
            .
          </p>

          <button type="submit" disabled={vm.busy} className="auth-simple-submit">
            {vm.busy ? "Sending code…" : "Create account"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
