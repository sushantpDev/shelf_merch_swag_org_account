import { USER_MANAGEMENT_TOOLS } from "./data";

export const SYNC_NOW_HELPER =
  "Automatic sync is enabled. Use Sync now only if you want to refresh data immediately.";

export const ZOHO_MANUAL_SYNC_HELPER =
  "Zoho People sync is manual. Click Sync now to import or update employees. Nothing syncs until you do.";

const ZOHO_STATUS_COPY: Record<DirectoryConnectionState, string> = {
  connected: "Connected. Run Sync now to import or update Zoho People employees.",
  syncing: "Syncing Zoho People employees\u2026",
  disconnected:
    "Disconnected \u2014 Zoho People sync has stopped. Previously synced people may still be visible.",
  attention: "Zoho People needs to be reconnected before you can sync employees.",
};

export type DirectoryConnectionState = "connected" | "syncing" | "disconnected" | "attention";

const STATUS_COPY: Record<DirectoryConnectionState, string> = {
  connected: "Connected employee data syncs automatically.",
  syncing: "Syncing employee data\u2026 No action is required.",
  disconnected:
    "Disconnected \u2014 automatic syncing has stopped. Previously synced people may still be visible.",
  attention: "Connection needs attention. Review the connection to resume automatic syncing.",
};

export function directoryConnectionStatus(
  input: {
    syncing: boolean;
    needsAttention: boolean;
    disconnected: boolean;
    connected: boolean;
  },
  mode: "automatic" | "manual" = "automatic",
): { message: string; kind: DirectoryConnectionState } | null {
  const copy = mode === "manual" ? ZOHO_STATUS_COPY : STATUS_COPY;
  if (input.needsAttention) return { message: copy.attention, kind: "attention" };
  if (input.syncing) return { message: copy.syncing, kind: "syncing" };
  if (input.disconnected) return { message: copy.disconnected, kind: "disconnected" };
  if (input.connected) return { message: copy.connected, kind: "connected" };
  return null;
}

export type OverviewStep = {
  title: string;
  body: string;
};

const HR_PROVIDER_IDS = [
  "workday",
  "bamboohr",
  "gusto",
  "keka",
  "deel",
  "ukg-pro",
  "hibob",
  "zoho-people",
] as const;

export function integrationOverviewSteps(providerId: string, providerName: string): OverviewStep[] {
  if (providerId === "zoho-people") {
    return [
      {
        title: `Connect ${providerName}`,
        body: `A company administrator connects ${providerName} with Zoho OAuth. Employee import does not start until someone runs a sync.`,
      },
      {
        title: "Manual employee sync",
        body: "Click Sync now to import employees from Zoho People. ShelfMerch does not sync Zoho People automatically or on a schedule.",
      },
      {
        title: "Review the sync result",
        body: "After a sync, ShelfMerch shows how many employees were fetched, created, updated, skipped, and failed.",
      },
      {
        title: "Use employees across ShelfMerch",
        body: "Synced employees appear in the Employee Directory and can be used as Workspace Contacts for gifting, onboarding kits, recognition, campaigns, and other merch workflows.",
      },
      {
        title: "Sync again when you need a refresh",
        body: "Run Sync now again after people change in Zoho People. Matching uses the Zoho record ID, then work email, so existing contacts are updated instead of duplicated.",
      },
      {
        title: "Connection status",
        body: "ShelfMerch shows Connected, Needs attention, Connection expired, or Disconnected, plus the latest successful sync time.",
      },
      {
        title: "Disconnect anytime",
        body: `Disconnecting ${providerName} asks Zoho to revoke the stored authorization and stops future syncs. Previously imported employees stay in ShelfMerch. Other integrations are not affected.`,
      },
    ];
  }

  const directory = providerId === "google-workspace";
  const opening = directory
    ? `Connect ${providerName} once and ShelfMerch will automatically keep your company directory in sync.`
    : `Connect ${providerName} once and ShelfMerch will automatically keep your employee directory in sync.`;

  return [
    { title: `Connect ${providerName} once`, body: opening },
    {
      title: directory ? "Automatic directory sync" : "Automatic employee sync",
      body: directory
        ? "You do not need to click Sync now. Directory changes are synced automatically in the background."
        : "You do not need to click Sync now. Employee changes are synced automatically in the background.",
    },
    {
      title: directory ? "Keep directory details up to date" : "Keep employee details up to date",
      body: directory
        ? "Supported directory details are kept up to date automatically."
        : "Supported employee details, such as names, work emails, departments, job titles, locations, and employment status, are kept up to date automatically.",
    },
    {
      title: directory ? "Use people across ShelfMerch" : "Use employees across ShelfMerch",
      body: directory
        ? "Synced people appear in the Employee Directory and can be used as Workspace Contacts for gifting, onboarding kits, recognition, campaigns, and other merch workflows."
        : "Synced employees appear in the Employee Directory and can be used as Workspace Contacts for gifting, onboarding kits, recognition, campaigns, and other merch workflows.",
    },
    {
      title: "Sync now is optional",
      body: "Use Sync now only when you want to request an immediate refresh. Normal syncing happens automatically.",
    },
    {
      title: "Connection status",
      body: "ShelfMerch shows the current connection state and the latest successful sync time.",
    },
    {
      title: "Disconnect anytime",
      body: directory
        ? `Disconnecting ${providerName} stops future syncs without affecting your other ShelfMerch integrations. Previously synced people may remain visible as the last available snapshot.`
        : `Disconnecting ${providerName} stops future syncs without affecting your other ShelfMerch integrations. Previously synced employees may remain visible as the last available snapshot.`,
    },
  ];
}

export function supportedDirectoryProviderIds(): string[] {
  return USER_MANAGEMENT_TOOLS.map((tile) => tile.id);
}

export { HR_PROVIDER_IDS };
