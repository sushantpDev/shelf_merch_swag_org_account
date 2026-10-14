import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { startSignup, ApiError } from "../model";
import { loginErrorToast } from "../loginErrors";

const DRAFT_KEY = "sm_signup_draft";

export type SignupDraft = {
  firstName: string;
  lastName: string;
  company: string;
  password: string;
  email?: string;
};

export function saveSignupDraft(draft: SignupDraft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

export function readSignupDraft(): SignupDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SignupDraft;
  } catch {
    return null;
  }
}

export function clearSignupDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export type SignupVm = {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  company: string;
  showPassword: boolean;
  showConfirmPassword: boolean;
  busy: boolean;
  accountExists: boolean;
  onEmail: (email: string) => void;
  onPassword: (password: string) => void;
  onConfirmPassword: (password: string) => void;
  onFirstName: (firstName: string) => void;
  onLastName: (lastName: string) => void;
  onCompany: (company: string) => void;
  onToggleShowPassword: () => void;
  onToggleShowConfirmPassword: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onSignIn: () => void;
  onDismissExists: () => void;
};

/** Controller for the signup screen: form state → OTP start (no user create yet). */
export function useSignupController(): SignupVm {
  const submitInFlight = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = (location.state as { draft?: SignupDraft } | null)?.draft;
  const query = new URLSearchParams(location.search);
  const queryEmail = query.get("email")?.trim() ?? "";
  const queryFirst = query.get("firstName")?.trim() ?? "";
  const queryLast = query.get("lastName")?.trim() ?? "";
  const queryCompany = query.get("company")?.trim() ?? "";

  const [email, setEmail] = useState(
    () => prefill?.email || queryEmail || readSignupDraft()?.email || "",
  );
  const [password, setPassword] = useState(() => prefill?.password ?? readSignupDraft()?.password ?? "");
  const [confirmPassword, setConfirmPassword] = useState(() => prefill?.password ?? readSignupDraft()?.password ?? "");
  const [firstName, setFirstName] = useState(
    () => prefill?.firstName || queryFirst || readSignupDraft()?.firstName || "",
  );
  const [lastName, setLastName] = useState(
    () => prefill?.lastName || queryLast || readSignupDraft()?.lastName || "",
  );
  const [company, setCompany] = useState(
    () => prefill?.company || queryCompany || readSignupDraft()?.company || "",
  );
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accountExists, setAccountExists] = useState(false);

  useEffect(() => {
    if (prefill) {
      // Clear one-shot navigation state.
      navigate(location.pathname, { replace: true, state: null });
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitInFlight.current) return;

    const name = `${firstName.trim()} ${lastName.trim()}`.trim();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password || !name || !company.trim()) {
      toast.error("Fill in all fields");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      toast.error("Include a letter and a number");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    submitInFlight.current = true;
    setBusy(true);
    setAccountExists(false);
    const draft: SignupDraft = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      company: company.trim(),
      password,
      email: trimmedEmail,
    };
    saveSignupDraft(draft);

    try {
      const result = await startSignup({
        name,
        email: trimmedEmail,
        password,
        companyName: company.trim(),
      });
      navigate("/signup/verify", {
        replace: false,
        state: {
          pendingId: result.pendingId,
          email: result.email,
          emailMasked: result.emailMasked,
          otpExpiresInSec: result.otpExpiresInSec,
          resendAvailableInSec: result.resendAvailableInSec,
          draft,
        },
      });
    } catch (err) {
      submitInFlight.current = false;
      setBusy(false);
      if (err instanceof ApiError && (err.code === "EMAIL_EXISTS" || err.status === 409)) {
        setAccountExists(true);
        toast.error("Account already exists. Sign in");
        return;
      }
      const toastCopy = loginErrorToast(err);
      if (toastCopy.description) {
        toast.error(toastCopy.title, { description: toastCopy.description });
      } else {
        toast.error(toastCopy.title === "Login failed" ? "Sign up failed" : toastCopy.title);
      }
    }
  }

  return {
    email,
    password,
    confirmPassword,
    firstName,
    lastName,
    company,
    showPassword,
    showConfirmPassword,
    busy,
    accountExists,
    onEmail: (v) => {
      setAccountExists(false);
      setEmail(v);
    },
    onPassword: setPassword,
    onConfirmPassword: setConfirmPassword,
    onFirstName: setFirstName,
    onLastName: setLastName,
    onCompany: setCompany,
    onToggleShowPassword: () => setShowPassword((s) => !s),
    onToggleShowConfirmPassword: () => setShowConfirmPassword((s) => !s),
    onSubmit: submit,
    onSignIn: () => navigate("/login"),
    onDismissExists: () => setAccountExists(false),
  };
}
