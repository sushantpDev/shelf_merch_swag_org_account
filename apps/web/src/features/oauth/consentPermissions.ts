const PROTOCOL_SCOPES = new Set(["openid", "offline_access"]);

export const READ_PERMISSION_LABELS: Record<string, string> = {
  "catalog:read": "Read the product catalog (catalog:read)",
  "orders:read": "Read orders (orders:read)",
  "campaigns:read": "Read campaigns (campaigns:read)",
  "wallets:read": "Read wallets (wallets:read)",
  "employees:read": "Read employees (employees:read)",
  "gifts:read": "Read gifts (gifts:read)",
  "employees:write": "Manage employees (employees:write)",
  "campaigns:draft": "Create campaign drafts (campaigns:draft)",
  "shops:write": "Manage company stores (shops:write)",
  "shops:catalog": "Choose store products (shops:catalog)",
  "wallets:allocate": "Allocate department budgets (wallets:allocate)",
  "wallets:setup": "Set up organization budget wallets (wallets:setup)",
  "campaigns:send": "Send campaign rewards (campaigns:send)",
  "campaigns:merchandise": "Send kit campaigns (campaigns:merchandise)",
  "shops:publish": "Publish store collections (shops:publish)",
  "entities:read": "Read departments (entities:read)",
  "entities:write": "Set up departments (entities:write)",
};

/** Workspace permissions shown on the consent screen. Protocol scopes are omitted. */
export function permissionLines(scope: string) {
  const lines = String(scope || "")
    .split(/\s+/)
    .filter((item) => item && !PROTOCOL_SCOPES.has(item))
    .map((item) => READ_PERMISSION_LABELS[item] || item);
  return lines.length ? lines : [READ_PERMISSION_LABELS["catalog:read"]];
}
