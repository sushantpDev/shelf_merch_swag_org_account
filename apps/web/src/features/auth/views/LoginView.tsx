import { PasswordField } from "../components/PasswordField";
import type { LoginVm } from "../controllers/useLoginController";
import { AuthLayout, authInputClassName } from "./AuthLayout";

export function LoginView(vm: LoginVm) {
  return (
    <AuthLayout
      className="auth-simple--login"
      variant="welcome"
      title="Welcome back 👋"
      subtitle="Sign in to manage your merch, gifting and orders."
      footerLink={{ hint: "Need an account?", label: "Create account", to: "/signup" }}
    >
      <form className="auth-simple-form" onSubmit={vm.onSubmit} aria-busy={vm.busy}>
        <fieldset className="auth-simple-fieldset" disabled={vm.loginDisabled}>
          <div className="auth-simple-field">
            <label htmlFor="login-email" className="auth-simple-label">
              Work email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="Work email"
              value={vm.email}
              onChange={(e) => vm.onEmail(e.target.value)}
              className={authInputClassName}
            />
          </div>

          <div className="auth-simple-field">
            <label htmlFor="login-password" className="auth-simple-label">
              Password
            </label>
            <PasswordField
              id="login-password"
              value={vm.password}
              onValueChange={vm.onPassword}
              autoComplete="current-password"
              placeholder="Password"
            />
            <button
              type="button"
              className="auth-simple-label-action auth-forgot-below"
              onClick={vm.onForgotPassword}
            >
              Forgot password?
            </button>
          </div>

          {vm.notice ? (
            <p className="auth-simple-subtitle" role="status">
              {vm.notice}
            </p>
          ) : null}

          {vm.error ? (
            <p className="auth-simple-error auth-simple-error--shake" role="alert">
              {vm.error}
            </p>
          ) : null}

          <button type="submit" className="auth-simple-submit" disabled={vm.loginDisabled}>
            {vm.busy ? "Signing in…" : "Log in"}
          </button>
        </fieldset>
      </form>
    </AuthLayout>
  );
}
