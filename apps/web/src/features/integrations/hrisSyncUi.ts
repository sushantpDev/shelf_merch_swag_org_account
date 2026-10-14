import {
  isMergeDirectoryProvider,
  isMergeHrisIntegration,
  mergeSafeErrorMessage,
} from "@/services/merge-api";
import type { MergeSyncRunPublic, MergeSyncStatusPublic } from "@/services/merge-api";

export const HRIS_SYNC_POLL_MS = 4000;

const MODEL_ORDER = ["employee", "employment", "group", "location", "contact"] as const;
type ModelKey = (typeof MODEL_ORDER)[number];

const MODEL_STAGE: Record<ModelKey, string> = {
  employee: "Employees",
  employment: "Employments",
  group: "Groups",
  location: "Locations",
  contact: "Contacts",
};

const MODEL_NOUN: Record<ModelKey, string> = {
  employee: "employees",
  employment: "employments",
  group: "groups",
  location: "locations",
  contact: "contacts",
};

export type HrisConnectionHealth = "connected" | "needs_attention" | "disconnected";

export type HrisSyncView = {
  connectionWord: string;
  connectionLine: string;
  connectionMark: string;
  headline: string;
  lead: string;
  syncLine: string;
  automaticEnabled: boolean;
  lastSyncedLabel: string;
  lastSyncedExact: string | null;
  progressLines: string[];
  preparingNote: string | null;
  banner: string | null;
  bannerTone: "warning" | "info";
  showReconnect: boolean;
  showConnect: boolean;
  syncButtonLabel: string;
  syncButtonDisabled: boolean;
  showSyncButton: boolean;
  history: HrisSyncHistoryRow[];
  disconnectTitle: string;
  disconnectDescription: string;
  polling: boolean;
};

export type HrisSyncHistoryRow = {
  id: string;
  when: string;
  reasonLabel: string;
  statusLabel: string;
  recordsLabel: string;
  detailLines: string[];
};

type ConnectionSlice = {
  status?: string | null;
  lastSyncStatus?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
  category?: string | null;
};

export function usesHrisAutomaticSyncUi(tileId: string, category?: string | null): boolean {
  if (isMergeDirectoryProvider(tileId) || category === "directory") return false;
  return isMergeHrisIntegration(tileId);
}

export function shouldPollHrisSync(
  status: { lastSyncStatus?: string | null; activeRun?: unknown } | null | undefined,
): boolean {
  if (!status) return false;
  if (status.activeRun) return true;
  return status.lastSyncStatus === "queued" || status.lastSyncStatus === "syncing";
}

export { mergeSafeErrorMessage };

export function hrisDisconnectCopy(providerName: string) {
  return {
    title: `Disconnect ${providerName}?`,
    description:
      "Automatic employee syncing will stop. Employees already imported into ShelfMerch will not be automatically deleted.",
  };
}

export function deriveHrisSyncView(input: {
  providerName: string;
  connection: ConnectionSlice;
  syncStatus?: MergeSyncStatusPublic | null;
  enqueuePending?: boolean;
  now?: Date;
}): HrisSyncView {
  const now = input.now ?? new Date();
  const status = input.syncStatus;
  const health = normalizeHealth(status?.connectionStatus || input.connection.status);
  const lastSyncStatus = preferInFlightStatus(status?.lastSyncStatus, input.connection.lastSyncStatus);
  const lastSyncAt = status?.lastSyncAt ?? input.connection.lastSyncAt ?? null;
  const lastError = status?.lastError ?? input.connection.lastError ?? null;
  const activeRun = status?.activeRun ?? null;
  const enqueuePending = Boolean(input.enqueuePending);
  const active =
    enqueuePending ||
    Boolean(activeRun) ||
    lastSyncStatus === "queued" ||
    lastSyncStatus === "syncing";
  const initial = !lastSyncAt || activeRun?.reason === "initial";
  const syncing = lastSyncStatus === "syncing" || activeRun?.status === "running";
  const queued =
    !syncing &&
    (enqueuePending || lastSyncStatus === "queued" || activeRun?.status === "queued");
  const disconnect = hrisDisconnectCopy(input.providerName);
  const errorCopy = mergeSafeErrorMessage(lastError, input.providerName);

  let headline = "Up to date";
  let lead = "Employee data is kept up to date automatically.";
  let syncLine = "Sync: Up to date";
  let banner: string | null = null;
  let bannerTone: "warning" | "info" = "info";
  let showReconnect = false;
  let showConnect = false;
  let automaticEnabled = health === "connected";
  let preparingNote: string | null = null;

  if (health === "disconnected") {
    headline = "Disconnected";
    lead = "Automatic employee syncing is off.";
    syncLine = lastSyncAt ? "Last sync: Not running" : "Not synced yet";
    automaticEnabled = false;
    showConnect = true;
  } else if (health === "needs_attention") {
    headline = "Needs attention";
    automaticEnabled = false;
    showReconnect = true;
    if (lastError === "MERGE_SCOPES_DISABLED") {
      lead =
        "Employee access is not enabled for this connection. Reconnect or update your HRMS permissions so ShelfMerch can access employees.";
    } else if (lastError === "MERGE_AUTH_FAILED") {
      lead = `ShelfMerch can no longer fully access employee data from ${input.providerName}. Reconnect your account to restore automatic syncing.`;
    } else {
      lead = `Your HRMS connection needs to be reauthorized.`;
      banner = `ShelfMerch can no longer fully access employee data from ${input.providerName}. Reconnect your account to restore automatic syncing.`;
      bannerTone = "warning";
    }
    syncLine = syncLineFor(lastSyncStatus, lastSyncAt, false);
  } else if (active && initial && queued && !syncing) {
    headline = "Preparing initial sync";
    lead = "We're importing your employees in the background. You can leave this page.";
    syncLine = "Sync: Queued";
  } else if (active && initial) {
    headline = "Initial sync in progress";
    lead = "We're importing your employees in the background. You can leave this page.";
    syncLine = "Sync: Syncing…";
  } else if (active && queued && !syncing) {
    headline = "Queued";
    lead = "ShelfMerch will refresh employee data in the background. You can leave this page.";
    syncLine = "Sync: Queued";
  } else if (active) {
    headline = "Syncing…";
    lead = "ShelfMerch is updating employee data from your HRMS.";
    syncLine = "Sync: Syncing…";
  } else if (lastSyncStatus === "failed") {
    headline = "Connected";
    syncLine = "Last sync: Failed";
    lead = "Your HRMS connection is still active, but the latest sync could not complete. ShelfMerch will retry automatically.";
    banner = errorCopy;
    bannerTone = lastError === "MERGE_SYNC_STALE" || lastError === "MERGE_QUEUE_UNAVAILABLE" ? "info" : "warning";
  } else if (lastError === "MERGE_OPTIONAL_SCOPE_DISABLED") {
    headline = "Up to date";
    syncLine = "Sync: Up to date";
    lead = "Employee data is kept up to date automatically.";
    banner =
      "Connected with limited access. Some optional HRMS data is unavailable, but employee syncing is still working.";
    bannerTone = "info";
  } else if (!lastSyncAt) {
    headline = "Not synced yet";
    syncLine = "Not synced yet";
    lead = "Automatic sync is enabled. ShelfMerch keeps employee data updated automatically from your HRMS.";
  } else {
    headline = "Up to date";
    syncLine = "Sync: Up to date";
    lead = "Employee data is kept up to date automatically.";
  }

  const progressLines = active ? progressLinesFor(activeRun) : [];
  const hasCounts = progressLines.some((line) => line.includes("processed") || line.includes("pages completed"));
  if (active && initial && !hasCounts && !queued) {
    preparingNote = "Employee data is still being prepared.";
  }

  const syncButtonLabel = active
    ? queued && !syncing
      ? "Queued"
      : "Syncing…"
    : lastSyncStatus === "failed" && health === "connected"
      ? "Try again"
      : "Sync now";

  const connectionWord =
    health === "needs_attention" ? "Needs attention" : health === "disconnected" ? "Disconnected" : "Connected";
  const connectionMark = health === "needs_attention" ? "!" : health === "disconnected" ? "○" : "✓";

  return {
    connectionWord,
    connectionLine: `Connection: ${connectionWord}`,
    connectionMark,
    headline,
    lead,
    syncLine,
    automaticEnabled,
    lastSyncedLabel: lastSyncedLabel(lastSyncAt, active && !lastSyncAt, now),
    lastSyncedExact: lastSyncAt ? formatExact(lastSyncAt) : null,
    progressLines,
    preparingNote,
    banner,
    bannerTone,
    showReconnect,
    showConnect,
    syncButtonLabel,
    syncButtonDisabled: active,
    showSyncButton: health === "connected",
    history: (status?.runs ?? []).slice(0, 20).map((run) => historyRow(run, now)),
    disconnectTitle: disconnect.title,
    disconnectDescription: disconnect.description,
    polling:
      enqueuePending ||
      shouldPollHrisSync({
        lastSyncStatus,
        activeRun,
      }),
  };
}

function preferInFlightStatus(server: string | null | undefined, connection: string | null | undefined): string {
  const rank = (value: string | null | undefined) =>
    value === "syncing" ? 2 : value === "queued" ? 1 : 0;
  if (rank(connection) > rank(server)) return connection || "idle";
  return server || connection || "idle";
}

function normalizeHealth(status: string | null | undefined): HrisConnectionHealth {
  if (status === "needs_attention") return "needs_attention";
  if (status === "disconnected") return "disconnected";
  return "connected";
}

function syncLineFor(lastSyncStatus: string, lastSyncAt: string | null, active: boolean): string {
  if (active) return lastSyncStatus === "queued" ? "Sync: Queued" : "Sync: Syncing…";
  if (lastSyncStatus === "failed") return "Last sync: Failed";
  if (lastSyncStatus === "success" && lastSyncAt) return "Last sync: Successful";
  if (!lastSyncAt) return "Not synced yet";
  return "Last sync: Successful";
}

function lastSyncedLabel(lastSyncAt: string | null, initialActive: boolean, now: Date): string {
  if (initialActive) return "Initial sync in progress";
  if (!lastSyncAt) return "Not synced yet";
  return `Last synced: ${relativeTime(lastSyncAt, now)}`;
}

function relativeTime(iso: string, now: Date): string {
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatExact(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function progressLinesFor(run: MergeSyncRunPublic | null): string[] {
  if (!run) return [];
  const current = currentModel(run);
  if (!current) {
    return ["Syncing employee data…"];
  }
  const progress = run.models?.[current];
  const records = progress?.recordsProcessed ?? 0;
  const pages = progress?.pagesProcessed ?? 0;
  const lines = [`Syncing ${MODEL_NOUN[current]}…`, MODEL_STAGE[current]];
  if (records > 0) lines.push(`${records.toLocaleString("en-US")} ${MODEL_NOUN[current]} processed`);
  if (pages > 0) lines.push(`${pages.toLocaleString("en-US")} pages completed`);
  return lines;
}

function currentModel(run: MergeSyncRunPublic): ModelKey | null {
  const running = MODEL_ORDER.find((key) => run.models?.[key]?.status === "running");
  if (running) return running;
  const started = [...MODEL_ORDER].reverse().find((key) => {
    const row = run.models?.[key];
    return Boolean(row && ((row.recordsProcessed ?? 0) > 0 || (row.pagesProcessed ?? 0) > 0 || row.status));
  });
  return started ?? null;
}

export function syncReasonListLabel(reason: string | null | undefined): string {
  if (reason === "initial") return "Initial sync";
  if (reason === "manual") return "Manual";
  if (reason === "webhook" || reason === "scheduled") return "Automatic";
  return "Sync";
}

export function syncReasonDetailLabel(reason: string | null | undefined): string {
  if (reason === "initial") return "Initial sync";
  if (reason === "manual") return "Manual sync";
  if (reason === "webhook") return "Automatic sync";
  if (reason === "scheduled") return "Scheduled sync";
  return "Sync";
}

function historyRow(run: MergeSyncRunPublic, now: Date): HrisSyncHistoryRow {
  const whenIso = run.finishedAt || run.startedAt || run.lastProgressAt || null;
  const records = sumRecords(run);
  const active = run.status === "running" || run.status === "queued";
  const hideZero = active && records === 0;
  return {
    id: run.id,
    when: whenIso ? historyWhen(whenIso, now) : "N/A",
    reasonLabel: syncReasonListLabel(run.reason),
    statusLabel: historyStatus(run.status),
    recordsLabel: hideZero ? "" : records > 0 || run.status === "success" ? `${records.toLocaleString("en-US")} records` : "",
    detailLines: safeRunDetailLines(run),
  };
}

function sumRecords(run: MergeSyncRunPublic): number {
  return MODEL_ORDER.reduce((total, key) => total + (run.models?.[key]?.recordsProcessed ?? 0), 0);
}

function historyStatus(status: string): string {
  if (status === "success") return "Success";
  if (status === "failed" || status === "stale") return "Failed";
  if (status === "running") return "Syncing";
  if (status === "queued") return "Queued";
  if (status === "cancelled") return "Cancelled";
  return status || "Unknown";
}

function historyWhen(iso: string, now: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "N/A";
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diffDays = Math.round((start.getTime() - day.getTime()) / 86400000);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (diffDays === 0) return `Today ${time}`;
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function safeRunDetailLines(run: MergeSyncRunPublic): string[] {
  const lines = [
    `Status: ${historyStatus(run.status)}`,
    `Reason: ${syncReasonDetailLabel(run.reason)}`,
  ];
  if (run.mode === "incremental") lines.push("Sync type: Incremental");
  else if (run.mode === "full") lines.push("Sync type: Full");
  if (run.startedAt) lines.push(`Started: ${formatExact(run.startedAt)}`);
  if (run.finishedAt) lines.push(`Finished: ${formatExact(run.finishedAt)}`);
  if (run.durationMs != null) {
    const duration = formatDuration(run.durationMs);
    if (duration) lines.push(`Duration: ${duration}`);
  }
  const records = sumRecords(run);
  const pages = MODEL_ORDER.reduce((total, key) => total + (run.models?.[key]?.pagesProcessed ?? 0), 0);
  if (records > 0) lines.push(`Records processed: ${records.toLocaleString("en-US")}`);
  if (pages > 0) lines.push(`Pages processed: ${pages.toLocaleString("en-US")}`);
  if (run.failedModel && MODEL_STAGE[run.failedModel as ModelKey]) {
    lines.push(`Model: ${MODEL_STAGE[run.failedModel as ModelKey]}`);
  }
  if (run.errorCode && /^[A-Z0-9_]{1,80}$/.test(run.errorCode)) {
    lines.push(`Error code: ${run.errorCode}`);
  }
  return lines;
}

function formatDuration(ms: number): string | null {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}
