import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { CheckCircle2, Loader2 } from "lucide-react";
import {
  ApiError,
  resetPasswordWithToken,
  resetShopPassword,
  validatePasswordResetToken,
} from "@/services/api-bridge";
import { AuthLabel, AuthLayout, authInputClassName } from "./views/AuthLayout";
import { PasswordField } from "./components/PasswordField";
import {
  PasswordRulesChecklist,
  allPasswordRulesPass,
  evaluatePasswordRules,
} from "./components/PasswordRulesChecklist";
import { shopStorefrontPath } from "@/lib/shopRedeemUrl";

type Phase = "validating" | "invalid" | "form" | "success";

/** Shop reset tokens are `rawHex.shopObjectId`. */
function parseShopResetToken(token: string): { shopId: string } | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const shopId = token.slice(dot + 1);
  if (!/^[a-f\d]{24}$/i.test(shopId)) return null;
  return { shopId };
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token")?.trim() || "";
  const navigate = useNavigate();
  const shopReset = useMemo(() => (token ? parseShopResetToken(token) : null), [token]);

  const [phase, setPhase] = useState<Phase>(token ? "validating" : "invalid");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reuseFailed, setReuseFailed] = useState(false);
  const [shopId, setShopId] = useState(shopReset?.shopId || "");

  const rules = useMemo(
    () =>
      evaluatePasswordRules(password, confirm, {
        treatAsDifferentFromCurrent: !reuseFailed,
      }),
    [password, confirm, reuseFailed],
  );
  const canSubmit = allPasswordRulesPass(rules) && !busy;

  useEffect(() => {
    if (!token) {
      setPhase("invalid");
      return;
    }
    if (shopReset) {
      setShopId(shopReset.shopId);
      setPhase("form");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await validatePasswordResetToken(token);
        if (cancelled) return;
        if (!result.valid || !result.email) {
          setPhase("invalid");
          return;
        }
        setEmail(result.email);
        setPhase("form");
      } catch {
        if (!cancelled) setPhase("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, shopReset]);

  useEffect(() => {
    if (phase !== "success") return;
    const dest = shopId ? shopStorefrontPath(shopId) : "/login";
    const t = window.setTimeout(() => navigate(dest, { replace: true }), 2000);
    return () => window.clearTimeout(t);
  }, [phase, navigate, shopId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !token) return;
    setBusy(true);
    setError("");
    setReuseFailed(false);
    try {
      if (shopReset) {
        const res = await resetShopPassword(token, password);
        setShopId(res.shopId);
      } else {
        await resetPasswordWithToken(token, password);
      }
      setPhase("success");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "PASSWORD_REUSED") {
          setReuseFailed(true);
          setError("New password must be different from your current password.");
        } else if (
          err.code === "INVALID_RESET_TOKEN" ||
          err.code === "RESET_TOKEN_USED" ||
          err.status === 400
        ) {
          setPhase("invalid");
        } else if (err.status === 429) {
          setError("Too many attempts. Please wait and try again.");
        } else {
          setError(err.message || "Something went wrong. Please try again.");
        }
      } else {
        setError("Cannot reach the server. Please try again shortly.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (phase === "validating") {
    return (
      <AuthLayout variant="welcome" showDivider={false} title="Verifying reset link">
        <div className="auth-loading-panel" role="status" aria-live="polite">
          <Loader2 className="auth-spin" size={28} aria-hidden="true" />
          <p>Checking your reset link…</p>
        </div>
      </AuthLayout>
    );
  }

  if (phase === "invalid") {
    return (
      <AuthLayout
        variant="welcome"
        showDivider={false}
        title="Reset Link Expired"
        subtitle="This reset link is no longer valid."
        footerLink={{ hint: "", label: "Back to Login", to: "/login" }}
      >
        <div className="auth-expired-panel">
          <button
            type="button"
            className="auth-simple-submit"
            onClick={() => navigate("/forgot-password")}
          >
            Request New Link
          </button>
          <button
            type="button"
            className="auth-simple-secondary"
            style={{ marginTop: 12 }}
            onClick={() => navigate("/login")}
          >
            Back to Login
          </button>
        </div>
      </AuthLayout>
    );
  }

  if (phase === "success") {
    return (
      <AuthLayout variant="welcome" showDivider={false} title="Password updated">
        <div className="auth-success-panel" role="status">
          <CheckCircle2
            className="auth-success-icon auth-success-icon--pop"
            size={52}
            strokeWidth={1.75}
          />
          <p className="auth-success-headline">Password updated successfully</p>
          <p className="auth-success-copy">Your password has been reset.</p>
          <p className="auth-success-redirect" aria-live="polite">
            {shopId ? "Redirecting to store…" : "Redirecting to Login…"}
          </p>
          <Link
            to={shopId ? shopStorefrontPath(shopId) : "/login"}
            className="auth-simple-switch-link"
          >
            Continue now
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      variant="welcome"
      showDivider={false}
      title="Create a new password"
      subtitle="Choose a strong password for your Shelf Merch account."
      footerLink={{ hint: "", label: "Back to Login", to: "/login" }}
    >
      <form className="auth-simple-form" onSubmit={onSubmit} aria-busy={busy} noValidate>
        <fieldset className="auth-simple-fieldset" disabled={busy}>
          {!shopReset ? (
            <div className="auth-simple-field">
              <AuthLabel htmlFor="reset-email">Email Address</AuthLabel>
              <input
                id="reset-email"
                type="email"
                value={email}
                readOnly
                disabled
                className={`${authInputClassName} auth-simple-input--readonly`}
                autoComplete="username"
              />
            </div>
          ) : null}

          <div className="auth-simple-field">
            <AuthLabel htmlFor="reset-password">New Password</AuthLabel>
            <PasswordField
              id="reset-password"
              value={password}
              onValueChange={(v) => {
                setReuseFailed(false);
                setPassword(v);
              }}
              autoComplete="new-password"
              aria-describedby="reset-pw-rules"
            />
          </div>

          <div className="auth-simple-field">
            <AuthLabel htmlFor="reset-confirm">Confirm Password</AuthLabel>
            <PasswordField
              id="reset-confirm"
              value={confirm}
              onValueChange={setConfirm}
              autoComplete="new-password"
            />
          </div>

          <div id="reset-pw-rules">
            <PasswordRulesChecklist rules={rules} password={password} confirm={confirm} />
          </div>

          {error ? (
            <p className="auth-simple-error auth-simple-error--shake" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="auth-simple-submit" disabled={!canSubmit}>
            {busy ? (
              <span className="auth-submit-busy">
                <Loader2 size={18} className="auth-spin" aria-hidden="true" />
                Updating…
              </span>
            ) : (
              "Reset Password"
            )}
          </button>
        </fieldset>
      </form>
    </AuthLayout>
  );
}
