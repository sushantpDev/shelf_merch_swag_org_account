import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { resendSignupOtp, verifySignupOtp, isPlatformUser, ApiError } from "./model";
import { OtpInput } from "./components/OtpInput";
import { AuthLayout } from "./views/AuthLayout";
import {
  clearSignupDraft,
  type SignupDraft,
} from "./controllers/useSignupController";

type VerifyState = {
  pendingId: string;
  email: string;
  emailMasked: string;
  otpExpiresInSec: number;
  resendAvailableInSec: number;
  draft?: SignupDraft;
};

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const initial = (location.state as VerifyState | null) || null;

  const [pendingId, setPendingId] = useState(initial?.pendingId || "");
  const [emailMasked, setEmailMasked] = useState(initial?.emailMasked || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [draft, setDraft] = useState<SignupDraft | undefined>(initial?.draft);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resendIn, setResendIn] = useState(initial?.resendAvailableInSec ?? 30);
  const [otpLeft, setOtpLeft] = useState(initial?.otpExpiresInSec ?? 120);
  const tickRef = useRef<number | null>(null);
  const submitInFlight = useRef(false);

  useEffect(() => {
    if (!pendingId) {
      navigate("/signup", { replace: true });
    }
  }, [pendingId, navigate]);

  useEffect(() => {
    tickRef.current = window.setInterval(() => {
      setResendIn((s) => Math.max(0, s - 1));
      setOtpLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, []);

  const canVerify = otp.length === 6 && !busy;

  const otpExpiryLabel = useMemo(() => {
    const m = Math.floor(otpLeft / 60);
    const s = otpLeft % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }, [otpLeft]);

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!canVerify || submitInFlight.current || !pendingId) return;
    submitInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const user = await verifySignupOtp(pendingId, otp);
      clearSignupDraft();
      toast.success(`Welcome to Shelf Merch, ${user.name.split(" ")[0]} 👋`);
      const destination = isPlatformUser(user) ? "/platform/dashboard" : "/dashboard";
      window.location.assign(destination);
    } catch (err) {
      submitInFlight.current = false;
      setBusy(false);
      if (err instanceof ApiError) {
        if (err.code === "OTP_EXPIRED") {
          setError("Verification code has expired. Please request a new code.");
        } else if (err.code === "OTP_INVALID") {
          setError("Incorrect verification code. Please try again.");
          setOtp("");
        } else if (err.code === "EMAIL_EXISTS") {
          setError("Account already exists. Sign in");
        } else if (err.code === "SIGNUP_SESSION_EXPIRED") {
          setError("Signup session expired. Please sign up again.");
        } else {
          setError(err.message || "Verification failed");
        }
      } else {
        setError("Cannot reach the server. Please try again shortly.");
      }
    }
  }

  async function onResend() {
    if (resendIn > 0 || busy || !pendingId) return;
    setBusy(true);
    setError("");
    try {
      const result = await resendSignupOtp(pendingId);
      setPendingId(result.pendingId);
      setEmail(result.email);
      setEmailMasked(result.emailMasked);
      setResendIn(result.resendAvailableInSec);
      setOtpLeft(result.otpExpiresInSec);
      setOtp("");
      toast.success("Verification code sent");
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const retry =
          err.details && typeof err.details === "object" && "retryAfterSec" in err.details
            ? Number((err.details as { retryAfterSec?: number }).retryAfterSec)
            : 30;
        setResendIn(Number.isFinite(retry) ? retry : 30);
        toast.error("Please wait before requesting a new code.");
      } else {
        toast.error(err instanceof Error ? err.message : "Could not resend code");
      }
    } finally {
      setBusy(false);
    }
  }

  function onChangeEmail() {
    navigate("/signup", {
      state: {
        draft: draft || {
          firstName: "",
          lastName: "",
          company: "",
          password: "",
          email,
        },
      },
    });
  }

  if (!pendingId) return null;

  return (
    <AuthLayout
      title="Verify your email"
      subtitle={`Enter the 6-digit code we sent to ${emailMasked || "your email"}.`}
      footerLink={{ hint: "Wrong account?", label: "Back to signup", to: "/signup" }}
    >
      <form className="auth-simple-form" onSubmit={onVerify} aria-busy={busy}>
        <fieldset className="auth-simple-fieldset" disabled={busy}>
          <div className="auth-verify-meta">
            <span>
              Code expires in <strong>{otpExpiryLabel}</strong>
            </span>
            <button type="button" className="auth-simple-label-action" onClick={onChangeEmail}>
              Change email
            </button>
          </div>

          <OtpInput value={otp} onChange={setOtp} disabled={busy} />

          {error ? (
            <p className="auth-simple-error auth-simple-error--shake" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="auth-simple-submit" disabled={!canVerify}>
            {busy ? (
              <span className="auth-submit-busy">
                <Loader2 size={18} className="auth-spin" aria-hidden="true" />
                Verifying…
              </span>
            ) : (
              "Verify Email"
            )}
          </button>

          <div className="auth-resend-row">
            <button
              type="button"
              className="auth-simple-secondary"
              disabled={busy || resendIn > 0}
              onClick={onResend}
            >
              {resendIn > 0 ? `Resend OTP in ${resendIn}s` : "Resend OTP"}
            </button>
          </div>
        </fieldset>
      </form>
    </AuthLayout>
  );
}
