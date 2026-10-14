import { describe, expect, it } from "vitest";
import type { HrisDirectoryStatus } from "@/services/merge-api";
import { deriveHrisDirectoryStatus, formatDirectorySyncAt, hrisDirectoryBannerText, resolveHrisDirectoryBanner } from "./hrisDirectoryBanner";

const TODAY = "2026-10-05T08:38:00.000Z";
const STALE = "2026-09-30T10:29:00.000Z";

function status(partial: Partial<HrisDirectoryStatus>): HrisDirectoryStatus {
  return {
    state: "empty",
    lastSuccessfulSyncAt: null,
    retainSnapshot: false,
    ...partial,
  };
}

describe("hris directory banner", () => {
  it("shows a connected provider with the exact successful sync time", () => {
    const text = hrisDirectoryBannerText(
      status({ state: "connected", lastSuccessfulSyncAt: TODAY }),
    );
    expect(text).toBe(`Connected last synced ${formatDirectorySyncAt(TODAY)}`);
    expect(text).not.toContain("People from the last snapshot");
  });

  it("shows syncing with the previous successful time", () => {
    expect(
      hrisDirectoryBannerText(status({ state: "syncing", lastSuccessfulSyncAt: TODAY })),
    ).toBe(`Syncing. Last successful sync ${formatDirectorySyncAt(TODAY)}`);
  });

  it("shows initial sync copy when no successful sync exists", () => {
    expect(hrisDirectoryBannerText(status({ state: "connected" }))).toBe(
      "Connected. Initial sync pending",
    );
    expect(hrisDirectoryBannerText(status({ state: "syncing" }))).toBe(
      "Syncing. Initial sync in progress",
    );
  });

  it("shows the snapshot sentence only for a disconnected directory", () => {
    expect(
      hrisDirectoryBannerText(
        status({ state: "disconnected", lastSuccessfulSyncAt: STALE, retainSnapshot: true }),
      ),
    ).toBe(
      `Disconnected. Last synced ${formatDirectorySyncAt(STALE)}. People from the last snapshot are still listed.`,
    );
  });

  it("does not invent a banner when there is no connection", () => {
    expect(hrisDirectoryBannerText(status({ state: "empty" }))).toBeNull();
  });

  it("maps a live Gusto connection of status connected and sync success to Connected", () => {
    const directory = deriveHrisDirectoryStatus([
      { status: "connected", lastSyncStatus: "success", lastSyncAt: TODAY },
    ]);
    expect(directory.state).toBe("connected");
    expect(directory.lastSuccessfulSyncAt).toBe(new Date(TODAY).toISOString());
    expect(hrisDirectoryBannerText(directory)).toBe(
      `Connected last synced ${formatDirectorySyncAt(TODAY)}`,
    );
  });

  it("maps an in-progress Gusto connection to Syncing and keeps the previous success", () => {
    const directory = deriveHrisDirectoryStatus([
      { status: "connected", lastSyncStatus: "syncing", lastSyncAt: TODAY },
    ]);
    expect(directory.state).toBe("syncing");
    expect(hrisDirectoryBannerText(directory)).toBe(
      `Syncing. Last successful sync ${formatDirectorySyncAt(TODAY)}`,
    );
  });

  it("does not treat a missing connection as Connected just because employees exist", () => {
    const directory = resolveHrisDirectoryBanner({
      connections: [],
      connectionsLoaded: true,
      employeeDirectory: { state: "empty", lastSuccessfulSyncAt: null, retainSnapshot: false },
    });
    expect(directory.state).toBe("empty");
    expect(hrisDirectoryBannerText(directory)).toBeNull();
  });

  it("keeps a current connected row ahead of an older disconnected row", () => {
    const directory = deriveHrisDirectoryStatus([
      { status: "disconnected", lastSyncStatus: "idle", lastSyncAt: STALE },
      { status: "connected", lastSyncStatus: "success", lastSyncAt: TODAY },
    ]);
    expect(directory).toMatchObject({ state: "connected", retainSnapshot: false });
    expect(directory.lastSuccessfulSyncAt).toBe(new Date(TODAY).toISOString());
  });

  it("uses the loaded Gusto connection when the employees payload has no directory", () => {
    const directory = resolveHrisDirectoryBanner({
      connections: [{ status: "connected", lastSyncStatus: "success", lastSyncAt: TODAY }],
      connectionsLoaded: true,
      employeeDirectory: { state: "empty", lastSuccessfulSyncAt: null, retainSnapshot: false },
    });
    expect(directory.state).toBe("connected");
    expect(hrisDirectoryBannerText(directory)).toContain("Connected");
  });
});
