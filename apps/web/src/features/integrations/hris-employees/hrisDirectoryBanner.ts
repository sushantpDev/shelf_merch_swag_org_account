import type { HrisDirectoryStatus } from "@/services/merge-api";

const PROBLEM_STATUSES = new Set(["needs_attention", "error", "expired"]);
const IN_PROGRESS_SYNC = new Set(["queued", "syncing"]);

export type HrisDirectoryConnection = {
  status?: string | null;
  lastSyncStatus?: string | null;
  lastSyncAt?: string | null;
};

function latestSuccessfulSyncAt(connections: HrisDirectoryConnection[]) {
  let best: number | null = null;
  let iso: string | null = null;
  for (const connection of connections) {
    if (!connection.lastSyncAt) continue;
    const time = new Date(connection.lastSyncAt).getTime();
    if (Number.isNaN(time)) continue;
    if (best == null || time > best) {
      best = time;
      iso = new Date(time).toISOString();
    }
  }
  return iso;
}

/**
 * Same buckets as the employees API. Employee rows are not an input.
 * Status and sync status are matched case-insensitively.
 */
export function deriveHrisDirectoryStatus(
  connections: HrisDirectoryConnection[],
): HrisDirectoryStatus {
  const normalized = connections.filter(Boolean).map((connection) => ({
    ...connection,
    status: String(connection.status || "").toLowerCase(),
    lastSyncStatus: String(connection.lastSyncStatus || "").toLowerCase(),
  }));
  const current = normalized.filter((connection) => connection.status !== "disconnected");
  const disconnected = normalized.filter((connection) => connection.status === "disconnected");
  const syncing = current.filter((connection) => IN_PROGRESS_SYNC.has(connection.lastSyncStatus));
  const connected = current.filter((connection) => connection.status === "connected");
  const problem = current.filter((connection) => PROBLEM_STATUSES.has(connection.status));

  if (syncing.length) {
    return {
      state: "syncing",
      lastSuccessfulSyncAt: latestSuccessfulSyncAt(current),
      retainSnapshot: false,
    };
  }
  if (connected.length) {
    return {
      state: "connected",
      lastSuccessfulSyncAt: latestSuccessfulSyncAt(connected),
      retainSnapshot: false,
    };
  }
  if (problem.length) {
    return {
      state: "error",
      lastSuccessfulSyncAt: latestSuccessfulSyncAt(problem),
      retainSnapshot: false,
    };
  }
  if (disconnected.length) {
    return {
      state: "disconnected",
      lastSuccessfulSyncAt: latestSuccessfulSyncAt(disconnected),
      retainSnapshot: true,
    };
  }
  return { state: "empty", lastSuccessfulSyncAt: null, retainSnapshot: false };
}

/**
 * Connection rows decide the banner. A missing employees directory field must
 * not become "no connection" while a current connection is loaded.
 * Employee rows never promote the banner to Connected.
 */
export function resolveHrisDirectoryBanner(input: {
  connections: HrisDirectoryConnection[];
  connectionsLoaded: boolean;
  employeeDirectory?: HrisDirectoryStatus | null;
}): HrisDirectoryStatus {
  const fromConnections = deriveHrisDirectoryStatus(input.connections);
  if (input.connectionsLoaded && fromConnections.state !== "empty") return fromConnections;
  if (input.employeeDirectory && input.employeeDirectory.state !== "empty") {
    return input.employeeDirectory;
  }
  if (input.connectionsLoaded) return fromConnections;
  return (
    input.employeeDirectory ?? {
      state: "empty",
      lastSuccessfulSyncAt: null,
      retainSnapshot: false,
    }
  );
}

export function formatDirectorySyncAt(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Renders directory state. Does not infer status from employee rows. */
export function hrisDirectoryBannerText(directory: HrisDirectoryStatus): string | null {
  const syncedAt = formatDirectorySyncAt(directory.lastSuccessfulSyncAt);
  if (directory.state === "syncing") {
    return syncedAt
      ? `Syncing. Last successful sync ${syncedAt}`
      : "Syncing. Initial sync in progress";
  }
  if (directory.state === "connected") {
    return syncedAt ? `Connected last synced ${syncedAt}` : "Connected. Initial sync pending";
  }
  if (directory.state === "error") {
    return syncedAt ? `Error. Last synced ${syncedAt}` : "Error";
  }
  if (directory.state === "disconnected") {
    const when = syncedAt ? `. Last synced ${syncedAt}` : "";
    return `Disconnected${when}. People from the last snapshot are still listed.`;
  }
  return null;
}
