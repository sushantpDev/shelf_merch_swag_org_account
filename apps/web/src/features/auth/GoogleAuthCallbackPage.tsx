import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { isPlatformUser, setSession, type AuthUser } from "@/services/auth-store";

function parseHashSession(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const accessToken = params.get("accessToken");
  const userRaw = params.get("user");
  if (!accessToken || !userRaw) return null;
  try {
    const user = JSON.parse(userRaw) as AuthUser;
    return { accessToken, user };
  } catch {
    return null;
  }
}

export function GoogleAuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState("Completing Google sign-in…");

  useEffect(() => {
    const error = searchParams.get("error");
    const errorMessage = searchParams.get("message");
    if (error) {
      const text = errorMessage || "Google sign-in failed";
      setMessage(text);
      toast.error(text);
      const timer = window.setTimeout(() => navigate("/login", { replace: true }), 2400);
      return () => window.clearTimeout(timer);
    }

    const session = parseHashSession(window.location.hash);
    if (!session) {
      const text = "Invalid Google sign-in response. Try again";
      setMessage(text);
      toast.error(text);
      const timer = window.setTimeout(() => navigate("/login", { replace: true }), 2400);
      return () => window.clearTimeout(timer);
    }

    setSession(session);
    window.history.replaceState(null, "", window.location.pathname);
    toast.success(`Welcome, ${session.user.name.split(" ")[0]} 👋`);
    const destination = isPlatformUser(session.user) ? "/platform/dashboard" : "/dashboard";
    navigate(destination, { replace: true });
  }, [navigate, searchParams]);

  return (
    <div className="auth-simple">
      <div className="auth-simple-body">
        <div className="auth-simple-card">
          <p className="auth-simple-subtitle" role="status">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}
