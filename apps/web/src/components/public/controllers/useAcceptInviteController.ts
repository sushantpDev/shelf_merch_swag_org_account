import { useMemo, useState, type FormEvent } from "react";
import { acceptInvite, ApiError } from "@/services/api-bridge";

function readInviteToken(searchToken: string): string {
  const fromSearch = searchToken.trim();
  if (fromSearch) return fromSearch;
  if (typeof window !== "undefined") {
    return new URLSearchParams(window.location.search).get("token")?.trim() ?? "";
  }
  return "";
}

function invitePasswordValid(password: string, confirm: string): boolean {
  if (password.length < 8) return false;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return false;
  return password === confirm;
}

export type AcceptInviteVm = {
  token: string;
  password: string;
  confirm: string;
  loading: boolean;
  error: string;
  done: boolean;
  showLoginHint: boolean;
  canSubmit: boolean;
  onPassword: (password: string) => void;
  onConfirm: (confirm: string) => void;
  onSubmit: (e: FormEvent) => void;
};

/** Controller for the accept-invite page: token resolution + password activation. */
export function useAcceptInviteController(searchToken: string): AcceptInviteVm {
  const token = useMemo(() => readInviteToken(searchToken), [searchToken]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [done, setDone] = useState(false);

  const canSubmit = invitePasswordValid(password, confirm);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setErrorCode("");
    if (!token) {
      setError("Invalid invitation link. Ask your admin to resend the invite.");
      return;
    }
    if (!invitePasswordValid(password, confirm)) {
      setError("Password must be at least 8 characters and include a letter and a number.");
      return;
    }
    setLoading(true);
    try {
      await acceptInvite(token, password);
      setDone(true);
      window.location.assign("/app");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setErrorCode(err.code);
      } else {
        setError("Could not accept invitation");
      }
    } finally {
      setLoading(false);
    }
  }

  return {
    token,
    password,
    confirm,
    loading,
    error,
    done,
    showLoginHint: errorCode === "INVALID_INVITE_TOKEN" || errorCode === "INVITE_EXPIRED",
    canSubmit,
    onPassword: setPassword,
    onConfirm: setConfirm,
    onSubmit,
  };
}
