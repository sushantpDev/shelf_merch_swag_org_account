/**
 * Zoho People API helpers — routes live at /api/integrations/zoho (not /api/v1).
 */
import { ApiError } from "./api";
import { getAccessToken } from "./auth-store";

const ZOHO_API_BASE = "/api/integrations/zoho";

export type ZohoConnectionStatus =
  | "not_connected"
  | "connected"
  | "expired"
  | "error"
  | "needs_attention";

export type ZohoIntegrationPublic = {
  id: string;
  companyId: string;
  status: "connected" | "expired" | "error" | "disconnected" | "needs_attention";
  zohoOrganizationId: string | null;
  zohoOrganizationName: string | null;
  zohoLocation: string | null;
  connectedAt: string | null;
  lastSyncedAt: string | null;
  connectedByUserId: string | null;
  updatedAt: string | null;
};

export type ZohoStatusResponse = {
  configured: boolean;
  status: ZohoConnectionStatus;
  integration: ZohoIntegrationPublic | null;
  canManage?: boolean;
};

export type ZohoSyncSummary = {
  totalFetched: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  skippedByReason?: Record<string, number>;
};

async function zohoFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${ZOHO_API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  return parseZohoResponse<T>(res);
}

/** Zoho API calls authenticated by embed session cookie only (no Bearer). */
async function zohoEmbedSessionFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${ZOHO_API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  return parseZohoResponse<T>(res);
}

async function parseZohoResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const err =
      body && typeof body === "object" && "error" in body
        ? (body as { error: { message?: string; code?: string } }).error
        : null;
    throw new ApiError(
      res.status,
      err?.message || "Zoho request failed",
      err?.code || "ZOHO_API_ERROR",
      body,
    );
  }

  return body as T;
}

export function fetchZohoStatus() {
  return zohoFetch<ZohoStatusResponse>("/status");
}

/**
 * Establish an HttpOnly auth bridge cookie, then navigate to the backend connect
 * route (authorization URL is never built in the browser).
 */
export async function startZohoConnect(): Promise<void> {
  await zohoFetch<{ ok: boolean }>("/bridge", { method: "POST" });
  window.location.assign(`${ZOHO_API_BASE}/connect`);
}

export function formatZohoSyncResult(summary: ZohoSyncSummary) {
  const counts = `${summary.totalFetched} fetched, ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped, ${summary.failed} failed`;
  if (summary.failed > 0) {
    return `Employee sync finished with failures: ${counts}.`;
  }
  return `Employee sync complete: ${counts}.`;
}

export function syncZohoEmployees() {
  return zohoFetch<ZohoSyncSummary>("/sync-employees", { method: "POST" });
}

export function disconnectZoho() {
  return zohoFetch<{ ok: boolean; status: ZohoConnectionStatus }>("/disconnect", {
    method: "DELETE",
  });
}

/** First-party only — mint one-time embed code (Bearer required; never in URL). */
export function issueZohoEmbedCode(requestId: string) {
  return zohoFetch<{ code: string; requestId: string; expiresInSec: number }>("/embed/issue", {
    method: "POST",
    body: JSON.stringify({ requestId }),
  });
}

/** Iframe exchanges one-time code for HttpOnly embed session cookie. */
export function exchangeZohoEmbedCode(code: string, requestId: string) {
  return zohoFetch<{ ok: boolean }>("/embed/exchange", {
    method: "POST",
    body: JSON.stringify({ code, requestId }),
  });
}

/** Iframe issues one-time OAuth launch code (embed session cookie auth). */
export function issueZohoOAuthLaunch(requestId: string) {
  return zohoEmbedSessionFetch<{ code: string; requestId: string; expiresInSec: number }>(
    "/oauth-launch/issue",
    { method: "POST", body: JSON.stringify({ requestId }) },
  );
}

/** Popup exchanges launch code for temporary OAuth launch session cookie. */
export function exchangeZohoOAuthLaunch(code: string, requestId: string) {
  return zohoEmbedSessionFetch<{ ok: boolean }>("/oauth-launch/exchange", {
    method: "POST",
    body: JSON.stringify({ code, requestId }),
  });
}

export type OAuthLaunchCompletionStatus = "pending" | "completed" | "failed";

export type OAuthLaunchStatusResponse = {
  status: OAuthLaunchCompletionStatus;
  errorCode: string | null;
};

/** Iframe polls OAuth completion status (embed session cookie auth). */
export function fetchOAuthLaunchStatus(requestId: string) {
  const qs = new URLSearchParams({ requestId });
  return zohoEmbedSessionFetch<OAuthLaunchStatusResponse>(
    `/oauth-launch/status?${qs.toString()}`,
  );
}

export const ZOHO_CONNECT_URL = `${ZOHO_API_BASE}/connect`;

/** Report a safe embed client event (no secrets). */
export function reportZohoEmbedEvent(event: string, requestId?: string) {
  return zohoFetch<{ ok: boolean }>("/embed/event", {
    method: "POST",
    body: JSON.stringify({ event, requestId }),
  });
}
