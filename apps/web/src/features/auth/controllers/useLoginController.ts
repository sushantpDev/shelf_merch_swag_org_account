import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { login, isPlatformUser } from "../model";
import { loginErrorToast } from "../loginErrors";

const SESSION_EXPIRED_NOTICE = "Your session expired. Please sign in again.";

export type LoginVm = {
  email: string;
  password: string;
  showPassword: boolean;
  busy: boolean;
  error: string;
  notice: string;
  loginDisabled: boolean;
  onEmail: (email: string) => void;
  onPassword: (password: string) => void;
  onToggleShowPassword: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onForgotPassword: () => void;
};

/** Controller for the login screen: form state, submit flow, redirect by role. */
export function useLoginController(): LoginVm {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const submitInFlight = useRef(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitInFlight.current) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      toast.error("Enter email and password");
      return;
    }

    submitInFlight.current = true;
    setError("");
    setBusy(true);
    try {
      const user = await login(trimmedEmail, password);
      toast.success(`Welcome back, ${user.name.split(" ")[0]} 👋`);
      const destination = isPlatformUser(user) ? "/platform/dashboard" : "/dashboard";
      window.location.assign(destination);
    } catch (err) {
      submitInFlight.current = false;
      setBusy(false);
      const toastCopy = loginErrorToast(err);
      const message = toastCopy.description
        ? `${toastCopy.title}. ${toastCopy.description}`
        : toastCopy.title;
      setError(message);
      if (toastCopy.description) {
        toast.error(toastCopy.title, { description: toastCopy.description });
      } else {
        toast.error(toastCopy.title);
      }
    }
  }

  return {
    email,
    password,
    showPassword,
    busy,
    error,
    notice: searchParams.get("session") === "expired" ? SESSION_EXPIRED_NOTICE : "",
    loginDisabled: busy,
    onEmail: setEmail,
    onPassword: setPassword,
    onToggleShowPassword: () => setShowPassword((s) => !s),
    onSubmit: submit,
    onForgotPassword: () => navigate("/forgot-password"),
  };
}
