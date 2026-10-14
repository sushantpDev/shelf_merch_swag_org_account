import { formatErrorDetails, messageFromGatewayResponse } from "@/lib/errorMessage";
import { API_BASE } from "./config";
import {
  clearSession,
  getAccessToken,
  setSession,
  type AuthUser,
} from "./auth-store";
import { queryClient } from "./queryClient";
import { beginSessionLogout, isSessionLogoutStarted } from "./sessionExpired";

export const SESSION_EXPIRED_MESSAGE = "Your session expired. Please sign in again.";

const TECHNICAL_SESSION_MESSAGES = new Set([
  "Invalid or expired access token",
  "Invalid refresh token",
  "Missing access token",
  "Session expired. Please sign in again.",
]);

function friendlySessionMessage(status: number, code: string | undefined, message: string) {
  if (status !== 401) return message;
  if (code === "SESSION_EXPIRED" || code === "REFRESH_IN_PROGRESS") return SESSION_EXPIRED_MESSAGE;
  if (TECHNICAL_SESSION_MESSAGES.has(message)) return SESSION_EXPIRED_MESSAGE;
  return message;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = "API_ERROR", details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type RequestOptions = RequestInit & {
  auth?: boolean;
  idempotencyKey?: string;
};

type RefreshOutcome = "ok" | "expired" | "failed";

let refreshPromise: Promise<RefreshOutcome> | null = null;
const REFRESH_LOCK_KEY = "sm_refresh_lock";

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function errorFromResponse(status: number, body: unknown): ApiError {
  const apiError =
    body && typeof body === "object" && "error" in body
      ? (
          body as {
            error: {
              message?: string;
              code?: string;
              details?: unknown;
            };
          }
        ).error
      : null;

  // Prefer the API's own message when present (e.g. RAZORPAY_NOT_CONFIGURED).
  // Only use the generic gateway copy when the proxy/upstream returned an empty body.
  if ((status === 502 || status === 503 || status === 504) && !apiError?.message) {
    return new ApiError(
      status,
      "Server temporarily unavailable. Please wait a moment and try again",
      "GATEWAY_ERROR",
      body,
    );
  }

  if (apiError) {
    let message = friendlySessionMessage(status, apiError.code, apiError.message || "Request failed");
    const detailMessages = formatErrorDetails(apiError.details);
    if (detailMessages.length) {
      message = `${message}: ${detailMessages.join("; ")}`;
    }
    return new ApiError(status, message, apiError.code || "API_ERROR", body);
  }

  const gatewayMessage = messageFromGatewayResponse(status, body);
  if (gatewayMessage) {
    return new ApiError(
      status,
      gatewayMessage,
      status === 413 ? "PAYLOAD_TOO_LARGE" : "GATEWAY_ERROR",
      body,
    );
  }

  return new ApiError(status, typeof body === "string" && body.trim() ? body : "Request failed");
}

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** Another tab is already rotating the cookie. Wait until it writes the new access token. */
function waitForPeerRefresh(timeoutMs = 4000): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  let lock: string | null = null;
  try {
    lock = localStorage.getItem(REFRESH_LOCK_KEY);
  } catch {
    return Promise.resolve(false);
  }
  if (!lock) return Promise.resolve(false);
  const age = Date.now() - Number(lock);
  if (!Number.isFinite(age) || age < 0 || age > 8000) return Promise.resolve(false);

  const before = getAccessToken();
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("storage", onStorage);
      resolve(Boolean(getAccessToken()) && getAccessToken() !== before);
    }, timeoutMs);
    const onStorage = (event: StorageEvent) => {
      if (event.key === "sm_access" && event.newValue) {
        window.clearTimeout(timer);
        window.removeEventListener("storage", onStorage);
        resolve(true);
      }
    };
    window.addEventListener("storage", onStorage);
  });
}

type RefreshResult =
  | { ok: true; accessToken: string; user: AuthUser }
  | { ok: false; code?: string };

async function postRefresh(): Promise<RefreshResult> {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const body = (await parseBody(res)) as {
    accessToken?: string;
    user?: AuthUser;
    error?: { code?: string };
  } | null;
  if (res.ok && body?.accessToken && body.user) {
    return { ok: true, accessToken: body.accessToken, user: body.user };
  }
  return { ok: false, code: body?.error?.code };
}

async function refreshAccessToken(): Promise<RefreshOutcome> {
  if (await waitForPeerRefresh()) return "ok";

  const lock = String(Date.now());
  try {
    localStorage.setItem(REFRESH_LOCK_KEY, lock);
  } catch {
    /* private mode — still refresh in this tab */
  }

  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("sm:session-refresh"));
    }
    let result = await postRefresh();
    if (!result.ok && result.code === "REFRESH_IN_PROGRESS") {
      await delay(300);
      if (await waitForPeerRefresh(1000)) return "ok";
      result = await postRefresh();
    }
    if (!result.ok) return result.code === "SESSION_EXPIRED" ? "expired" : "failed";
    setSession({ accessToken: result.accessToken, user: result.user });
    return "ok";
  } finally {
    try {
      if (localStorage.getItem(REFRESH_LOCK_KEY) === lock) localStorage.removeItem(REFRESH_LOCK_KEY);
    } catch {
      /* ignore */
    }
  }
}

function logoutExpiredSession() {
  if (!beginSessionLogout()) return;
  clearSession();
  try {
    localStorage.removeItem(REFRESH_LOCK_KEY);
  } catch {
    /* private mode */
  }
  queryClient.clear();
  if (typeof window === "undefined") return;
  const path = window.location.pathname;
  if (path === "/login" || path.startsWith("/login/")) return;
  window.location.assign("/login");
}

function shouldRefresh(path: string, status: number, auth: boolean) {
  if (!auth || status !== 401) return false;
  return !path.includes("/auth/refresh");
}

async function ensureRefreshed(): Promise<RefreshOutcome> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { auth = true, idempotencyKey, headers: extraHeaders, ...init } = options;
  const headers = new Headers(extraHeaders);

  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (auth) {
    const token = getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  if (idempotencyKey) {
    headers.set("Idempotency-Key", idempotencyKey);
  }

  const url = path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

  let res = await fetch(url, { ...init, headers, credentials: init.credentials ?? "include" });

  if (shouldRefresh(path, res.status, auth)) {
    if (isSessionLogoutStarted()) {
      throw new ApiError(401, SESSION_EXPIRED_MESSAGE, "SESSION_EXPIRED");
    }
    const refreshed = await ensureRefreshed();
    if (refreshed === "expired") {
      logoutExpiredSession();
      throw new ApiError(401, SESSION_EXPIRED_MESSAGE, "SESSION_EXPIRED");
    }
    if (refreshed !== "ok") {
      throw new ApiError(401, "Could not refresh your session. Please try again.", "REFRESH_FAILED");
    }
    const retryHeaders = new Headers(headers);
    const token = getAccessToken();
    if (token) retryHeaders.set("Authorization", `Bearer ${token}`);
    res = await fetch(url, { ...init, headers: retryHeaders, credentials: init.credentials ?? "include" });
  }

  const body = await parseBody(res);
  if (!res.ok) {
    const err = errorFromResponse(res.status, body);
    if (auth && err.status === 401 && err.code === "SESSION_EXPIRED") {
      logoutExpiredSession();
      throw new ApiError(401, SESSION_EXPIRED_MESSAGE, "SESSION_EXPIRED");
    }
    throw err;
  }
  return body as T;
}

/** Public redemption routes - no auth header. */
export async function publicFetch<T = unknown>(
  path: string,
  init: Omit<RequestOptions, "auth"> = {},
): Promise<T> {
  return apiFetch<T>(path, { ...init, auth: false });
}
