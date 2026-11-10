/** Client mirror of apps/api platformAccess.middleware.js role to area matrix. */

const SUPER = "platform_super_admin";
const OPS = "platform_ops_admin";
const CATALOG = "platform_catalog_admin";
const PRODUCTION = "platform_production_manager";
const FINANCE = "platform_finance_admin";
const SALES = "platform_sales_manager";
const SUPPORT = "platform_support_agent";
const LOGISTICS = "platform_logistics_manager";
const AUDITOR = "platform_readonly_auditor";

const PLATFORM_ROLES = [
  SUPER,
  OPS,
  CATALOG,
  PRODUCTION,
  FINANCE,
  SALES,
  SUPPORT,
  LOGISTICS,
  AUDITOR,
];

export type PlatformArea =
  | "dashboard"
  | "catalog"
  | "inventory"
  | "kits"
  | "tenants"
  | "orders"
  | "production"
  | "shipments"
  | "finance"
  | "sales"
  | "blog"
  | "support"
  | "team"
  | "settings"
  | "auditLogs";

const MATRIX: Record<PlatformArea, { write: string[]; read: string[] }> = {
  dashboard: { write: [], read: PLATFORM_ROLES },
  catalog: { write: [CATALOG], read: PLATFORM_ROLES },
  inventory: { write: [CATALOG, OPS], read: PLATFORM_ROLES },
  kits: { write: [CATALOG], read: PLATFORM_ROLES },
  tenants: { write: [], read: PLATFORM_ROLES },
  orders: { write: [OPS, PRODUCTION], read: PLATFORM_ROLES },
  production: { write: [OPS, PRODUCTION], read: PLATFORM_ROLES },
  shipments: { write: [OPS, LOGISTICS], read: PLATFORM_ROLES },
  finance: { write: [FINANCE], read: [FINANCE] },
  sales: { write: [SALES], read: [SALES] },
  blog: { write: [SALES], read: [SALES] },
  support: { write: [OPS, SUPPORT], read: PLATFORM_ROLES },
  // Ops + support need a read-only roster to assign tickets; invite/role
  // changes stay super-admin-only (write: []).
  team: { write: [], read: [OPS, SUPPORT] },
  settings: { write: [], read: [] },
  auditLogs: { write: [], read: [] },
};

export function rolesForArea(area: PlatformArea, action: "read" | "write" = "read"): string[] {
  const entry = MATRIX[area];
  const roles = action === "write" ? entry.write : [...entry.read, AUDITOR];
  return [...new Set([SUPER, ...roles])];
}

export function canAccessArea(
  role: string | undefined,
  area: PlatformArea,
  action: "read" | "write" = "read",
): boolean {
  if (!role) return false;
  return rolesForArea(area, action).includes(role);
}

export type PlatformNavItem = {
  area: PlatformArea;
  label: string;
  path: string;
  section?: string;
};

export const PLATFORM_NAV: PlatformNavItem[] = [
  { area: "dashboard", label: "Dashboard", path: "/platform/dashboard" },
  { area: "tenants", label: "Tenants", path: "/platform/tenants", section: "Operations" },
  { area: "orders", label: "Orders", path: "/platform/orders", section: "Operations" },
  { area: "production", label: "Production", path: "/platform/production", section: "Operations" },
  { area: "shipments", label: "Shipments", path: "/platform/shipments", section: "Operations" },
  { area: "catalog", label: "Catalog", path: "/platform/catalog", section: "Supply" },
  { area: "kits", label: "Kits", path: "/platform/kits", section: "Supply" },
  { area: "inventory", label: "Inventory", path: "/platform/inventory", section: "Supply" },
  { area: "support", label: "Support", path: "/platform/support", section: "Service" },
  { area: "sales", label: "Sales", path: "/platform/sales", section: "Marketing" },
  { area: "blog", label: "Blog", path: "/platform/blog", section: "Marketing" },
  { area: "blog", label: "SEO Growth", path: "/platform/seo", section: "Marketing" },
  { area: "finance", label: "Finance", path: "/platform/finance", section: "Money" },
  { area: "team", label: "Platform Users", path: "/platform/team", section: "Admin" },
  { area: "auditLogs", label: "Audit Logs", path: "/platform/audit", section: "Admin" },
  { area: "settings", label: "Settings", path: "/platform/settings", section: "Admin" },
];

export function navItemsForRole(role: string | undefined): PlatformNavItem[] {
  return PLATFORM_NAV.filter((item) => canAccessArea(role, item.area, "read"));
}
