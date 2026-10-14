import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { PasswordField } from "@/features/auth/components/PasswordField";
import { OtpInput } from "@/features/auth/components/OtpInput";
import { AuthLabel, AuthLayout, authInputClassName } from "@/features/auth/views/AuthLayout";
import {
  claimRedeemShopAccount,
  forgotShopPassword,
  loginShopCustomer,
  resendShopSignupOtp,
  resetShopPassword,
  startShopSignup,
  verifyShopSignupOtp,
  type StorefrontData,
} from "@/services/api-bridge";
import {
  setShopCustomerSession,
  type ShopCustomerSession,
} from "@/services/shop-customer-store";
import { shopStorefrontHref, shopStorefrontPath } from "@/lib/shopRedeemUrl";

type AuthMode = "signin" | "signup" | "verify" | "forgot" | "reset" | "claim";

function persistSession(shopId: string, res: {
  accessToken: string;
  customer: ShopCustomerSession["customer"];
  creditAmount: number;
  redemptionToken: string | null;
}): ShopCustomerSession {
  const session: ShopCustomerSession = {
    accessToken: res.accessToken,
    customer: res.customer,
    creditAmount: res.creditAmount,
    redemptionToken: res.redemptionToken,
  };
  setShopCustomerSession(shopId, session);
  return session;
}

function storeHref(shop: { id: string; slug?: string }) {
  return shopStorefrontHref(shop);
}

/** Compact store auth UI reused for subdomain and /shop/:id gating. */
export function StoreAuthPanel({
  shop,
  initialMode = "signin",
  redeemToken,
  onAuthenticated,
  onCancel,
}: {
  shop: StorefrontData["shop"];
  initialMode?: AuthMode;
  /** When set, claim-redeem password flow after invite. */
  redeemToken?: string;
  onAuthenticated: (session: ShopCustomerSession) => void;
  onCancel?: () => void;
}) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const resetToken = params.get("token") || "";

  const [mode, setMode] = useState<AuthMode>(() => {
    if (redeemToken) return "claim";
    if (resetToken) return "reset";
    return initialMode;
  });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [otp, setOtp] = useState("");
  const [pendingId, setPendingId] = useState("");
  const [emailMasked, setEmailMasked] = useState("");
  const [resendIn, setResendIn] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [claimInfo, setClaimInfo] = useState<{ email: string; emailMasked: string; name: string } | null>(
    null,
  );

  const domainHint = useMemo(() => {
    const d = String(shop.companyEmailDomain || "").replace(/^@/, "");
    return d ? `@${d}` : "your company email";
  }, [shop.companyEmailDomain]);

  useEffect(() => {
    if (mode !== "verify" || resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [mode, resendIn]);

  useEffect(() => {
    if (!redeemToken || claimInfo) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const res = await claimRedeemShopAccount(redeemToken);
        if (cancelled) return;
        if (res.needsPassword) {
          setClaimInfo({
            email: res.email,
            emailMasked: res.emailMasked,
            name: res.name,
          });
          setEmail(res.email);
          setName(res.name);
          setMode("claim");
        } else {
          const session = persistSession(shop.id, res);
          onAuthenticated(session);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not open invite");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [redeemToken, claimInfo, shop.id, onAuthenticated]);

  async function onSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await loginShopCustomer(shop.id, { email, password });
      onAuthenticated(persistSession(shop.id, res));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const res = await startShopSignup(shop.id, { name, email, password });
      setPendingId(res.pendingId);
      setEmailMasked(res.emailMasked);
      setEmail(res.email);
      setResendIn(res.resendAvailableInSec);
      setOtp("");
      setMode("verify");
      toast.success("Verification code sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start signup");
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await verifyShopSignupOtp(shop.id, { pendingId, otp });
      onAuthenticated(persistSession(shop.id, res));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    if (resendIn > 0 || !pendingId) return;
    setBusy(true);
    setError("");
    try {
      const res = await resendShopSignupOtp(shop.id, pendingId);
      setResendIn(res.resendAvailableInSec);
      setEmailMasked(res.emailMasked);
      toast.success("Verification code sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend code");
    } finally {
      setBusy(false);
    }
  }

  async function onForgot(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await forgotShopPassword(shop.id, email);
      toast.success("Reset link sent if account exists");
      setMode("signin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email");
    } finally {
      setBusy(false);
    }
  }

  async function onReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const res = await resetShopPassword(resetToken, password);
      toast.success("Password updated. Sign in");
      navigate(`${shopStorefrontPath(res.shopId)}?auth=signin`, { replace: true });
      setMode("signin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      setBusy(false);
    }
  }

  async function onClaim(e: React.FormEvent) {
    e.preventDefault();
    if (!redeemToken) return;
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const res = await claimRedeemShopAccount(redeemToken, password);
      if (res.needsPassword) {
        setError("Could not create account. Try again");
        return;
      }
      onAuthenticated(persistSession(shop.id, res));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account");
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "signup"
      ? "Create account"
      : mode === "verify"
        ? "Verify your email"
        : mode === "forgot"
          ? "Forgot password"
          : mode === "reset"
            ? "Reset password"
            : mode === "claim"
              ? "Create your password"
              : "Sign in";

  const subtitle =
    mode === "signup"
      ? `Use your ${domainHint} work email to shop at ${shop.name}.`
      : mode === "verify"
        ? `Enter the 6-digit code sent to ${emailMasked || email}.`
        : mode === "claim"
          ? `Welcome${claimInfo?.name ? `, ${claimInfo.name}` : ""}. Set a password for ${claimInfo?.emailMasked || "your invite email"} to save your rewards.`
          : mode === "forgot"
            ? "We'll email you a reset link if an account exists."
            : `Welcome to ${shop.name}`;

  return (
    <AuthLayout variant="welcome" title={title} subtitle={subtitle}>
      {mode === "signin" ? (
        <form className="auth-simple-form" onSubmit={onSignIn}>
          <div className="auth-simple-field">
            <AuthLabel htmlFor="store-email">Work email</AuthLabel>
            <input
              id="store-email"
              type="email"
              className={authInputClassName}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              autoFocus
            />
          </div>
          <div className="auth-simple-field">
            <AuthLabel
              htmlFor="store-password"
              action={
                <button type="button" className="auth-simple-label-action" onClick={() => setMode("forgot")}>
                  Forgot password
                </button>
              }
            >
              Password
            </AuthLabel>
            <PasswordField id="store-password" value={password} onValueChange={setPassword} />
          </div>
          {error ? <p className="auth-simple-error" role="alert">{error}</p> : null}
          <button type="submit" className="auth-simple-submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="auth-simple-switch">
            Don&apos;t have an account?{" "}
            <button type="button" className="auth-simple-switch-link" onClick={() => setMode("signup")}>
              Create account
            </button>
          </p>
          {onCancel ? (
            <button type="button" className="auth-simple-switch-link" onClick={onCancel} style={{ marginTop: 8 }}>
              Continue browsing
            </button>
          ) : null}
        </form>
      ) : null}

      {mode === "signup" ? (
        <form className="auth-simple-form" onSubmit={onSignUp}>
          <div className="auth-simple-field">
            <AuthLabel htmlFor="store-name">Full name</AuthLabel>
            <input
              id="store-name"
              className={authInputClassName}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="auth-simple-field">
            <AuthLabel htmlFor="store-signup-email">Work email ({domainHint})</AuthLabel>
            <input
              id="store-signup-email"
              type="email"
              className={authInputClassName}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div className="auth-simple-field">
            <AuthLabel htmlFor="store-signup-password">Password</AuthLabel>
            <PasswordField
              id="store-signup-password"
              value={password}
              onValueChange={setPassword}
              autoComplete="new-password"
            />
          </div>
          <div className="auth-simple-field">
            <AuthLabel htmlFor="store-signup-confirm">Confirm password</AuthLabel>
            <PasswordField
              id="store-signup-confirm"
              value={confirm}
              onValueChange={setConfirm}
              autoComplete="new-password"
            />
          </div>
          {error ? <p className="auth-simple-error" role="alert">{error}</p> : null}
          <button type="submit" className="auth-simple-submit" disabled={busy}>
            {busy ? "Sending code…" : "Continue"}
          </button>
          <p className="auth-simple-switch">
            Already have an account?{" "}
            <button type="button" className="auth-simple-switch-link" onClick={() => setMode("signin")}>
              Sign in
            </button>
          </p>
        </form>
      ) : null}

      {mode === "verify" ? (
        <form className="auth-simple-form" onSubmit={onVerify}>
          <OtpInput value={otp} onChange={setOtp} disabled={busy} />
          {error ? <p className="auth-simple-error" role="alert">{error}</p> : null}
          <button type="submit" className="auth-simple-submit" disabled={busy || otp.length !== 6}>
            {busy ? "Verifying…" : "Verify & continue"}
          </button>
          <p className="auth-simple-switch">
            {resendIn > 0 ? (
              <>Resend code in {resendIn}s</>
            ) : (
              <button type="button" className="auth-simple-switch-link" onClick={onResend} disabled={busy}>
                Resend code
              </button>
            )}
            {" · "}
            <button type="button" className="auth-simple-switch-link" onClick={() => setMode("signup")}>
              Change email
            </button>
          </p>
        </form>
      ) : null}

      {mode === "forgot" ? (
        <form className="auth-simple-form" onSubmit={onForgot}>
          <div className="auth-simple-field">
            <AuthLabel htmlFor="store-forgot-email">Work email</AuthLabel>
            <input
              id="store-forgot-email"
              type="email"
              className={authInputClassName}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          {error ? <p className="auth-simple-error" role="alert">{error}</p> : null}
          <button type="submit" className="auth-simple-submit" disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </button>
          <p className="auth-simple-switch">
            <button type="button" className="auth-simple-switch-link" onClick={() => setMode("signin")}>
              Back to sign in
            </button>
          </p>
        </form>
      ) : null}

      {mode === "reset" ? (
        <form className="auth-simple-form" onSubmit={onReset}>
          <div className="auth-simple-field">
            <AuthLabel htmlFor="store-reset-password">New password</AuthLabel>
            <PasswordField
              id="store-reset-password"
              value={password}
              onValueChange={setPassword}
              autoComplete="new-password"
            />
          </div>
          <div className="auth-simple-field">
            <AuthLabel htmlFor="store-reset-confirm">Confirm password</AuthLabel>
            <PasswordField
              id="store-reset-confirm"
              value={confirm}
              onValueChange={setConfirm}
              autoComplete="new-password"
            />
          </div>
          {error ? <p className="auth-simple-error" role="alert">{error}</p> : null}
          <button type="submit" className="auth-simple-submit" disabled={busy || !resetToken}>
            {busy ? "Saving…" : "Update password"}
          </button>
        </form>
      ) : null}

      {mode === "claim" ? (
        <form className="auth-simple-form" onSubmit={onClaim}>
          {error && !claimInfo ? <p className="auth-simple-error" role="alert">{error}</p> : null}
          {claimInfo ? (
            <>
              <div className="auth-simple-field">
                <AuthLabel htmlFor="store-claim-password">Create password</AuthLabel>
                <PasswordField
                  id="store-claim-password"
                  value={password}
                  onValueChange={setPassword}
                  autoComplete="new-password"
                />
              </div>
              <div className="auth-simple-field">
                <AuthLabel htmlFor="store-claim-confirm">Confirm password</AuthLabel>
                <PasswordField
                  id="store-claim-confirm"
                  value={confirm}
                  onValueChange={setConfirm}
                  autoComplete="new-password"
                />
              </div>
              {error ? <p className="auth-simple-error" role="alert">{error}</p> : null}
              <button type="submit" className="auth-simple-submit" disabled={busy}>
                {busy ? "Creating account…" : "Continue to store"}
              </button>
            </>
          ) : (
            <p className="muted">{busy ? "Opening your invite…" : "Preparing your account…"}</p>
          )}
        </form>
      ) : null}

      {mode !== "claim" ? (
        <p className="auth-simple-switch">
          <Link to={storeHref(shop)} className="auth-simple-switch-link">
            {shop.name}
          </Link>
        </p>
      ) : null}
    </AuthLayout>
  );
}
