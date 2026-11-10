import { describe, expect, it } from "vitest";
import { USER_MANAGEMENT_TOOLS } from "./data";
import {
  SYNC_NOW_HELPER,
  ZOHO_MANUAL_SYNC_HELPER,
  directoryConnectionStatus,
  integrationOverviewSteps,
} from "./integrationOverviewCopy";

const OPENING: Record<string, string> = {
  workday: "Connect Workday once and ShelfMerch will automatically keep your employee directory in sync.",
  bamboohr: "Connect BambooHR once and ShelfMerch will automatically keep your employee directory in sync.",
  gusto: "Connect Gusto once and ShelfMerch will automatically keep your employee directory in sync.",
  keka: "Connect Keka once and ShelfMerch will automatically keep your employee directory in sync.",
  deel: "Connect Deel once and ShelfMerch will automatically keep your employee directory in sync.",
  "ukg-pro": "Connect UKG Pro once and ShelfMerch will automatically keep your employee directory in sync.",
  hibob: "Connect HiBob once and ShelfMerch will automatically keep your employee directory in sync.",
  "google-workspace":
    "Connect Google Workspace once and ShelfMerch will automatically keep your company directory in sync.",
  "zoho-people":
    "A company administrator connects Zoho People with Zoho OAuth. Employee import does not start until someone runs a sync.",
};

describe("integration overview copy", () => {
  it("covers every user management provider with its own opening line", () => {
    expect(USER_MANAGEMENT_TOOLS.map((tile) => tile.id).sort()).toEqual(Object.keys(OPENING).sort());
    for (const tile of USER_MANAGEMENT_TOOLS) {
      const steps = integrationOverviewSteps(tile.id, tile.name);
      expect(steps).toHaveLength(7);
      expect(steps[0]?.body).toBe(OPENING[tile.id]);
      if (tile.id !== "zoho-people") {
        expect(steps[4]?.body).toContain("Sync now only when you want");
      } else {
        expect(steps.map((step) => step.body).join(" ")).toContain("does not sync Zoho People automatically");
        expect(steps.map((step) => step.body).join(" ")).not.toMatch(/automatically keep your employee/);
      }
      expect(steps.map((step) => step.body).join(" ")).not.toMatch(/Merge|webhook|BullMQ|queue/i);
    }
  });

  it("does not reuse Gusto wording or payroll fields for Google Workspace", () => {
    const steps = integrationOverviewSteps("google-workspace", "Google Workspace");
    const text = steps.map((step) => `${step.title} ${step.body}`).join(" ");
    expect(text).toContain("company directory");
    expect(text).not.toContain("Gusto");
    expect(text).not.toMatch(/payroll|job titles|employment status/);
    expect(steps[2]?.body).toBe("Supported directory details are kept up to date automatically.");
  });

  it("uses supported employee details for HR platforms", () => {
    const body = integrationOverviewSteps("gusto", "Gusto")[2]?.body ?? "";
    expect(body.startsWith("Supported employee details")).toBe(true);
  });

  it("uses the shared connection status sentences", () => {
    expect(
      directoryConnectionStatus({
        syncing: false,
        needsAttention: false,
        disconnected: false,
        connected: true,
      })?.message,
    ).toBe("Connected employee data syncs automatically.");
    expect(
      directoryConnectionStatus({
        syncing: true,
        needsAttention: false,
        disconnected: false,
        connected: true,
      })?.message,
    ).toBe("Syncing employee data\u2026 No action is required.");
    expect(
      directoryConnectionStatus({
        syncing: false,
        needsAttention: false,
        disconnected: true,
        connected: false,
      })?.message,
    ).toBe(
      "Disconnected \u2014 automatic syncing has stopped. Previously synced people may still be visible.",
    );
    expect(
      directoryConnectionStatus({
        syncing: true,
        needsAttention: true,
        disconnected: false,
        connected: false,
      })?.message,
    ).toBe("Connection needs attention. Review the connection to resume automatic syncing.");
  });

  it("keeps one Sync now helper", () => {
    expect(SYNC_NOW_HELPER).toBe(
      "Automatic sync is enabled. Use Sync now only if you want to refresh data immediately.",
    );
  });

  it("describes Zoho People sync as manual", () => {
    expect(ZOHO_MANUAL_SYNC_HELPER).toContain("manual");
    expect(
      directoryConnectionStatus(
        { syncing: false, needsAttention: false, disconnected: false, connected: true },
        "manual",
      )?.message,
    ).toContain("Sync now");
    expect(
      directoryConnectionStatus(
        { syncing: false, needsAttention: false, disconnected: false, connected: true },
        "automatic",
      )?.message,
    ).toContain("automatically");
  });
});
