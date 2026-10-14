/** Client mirror of apps/api/src/middleware/tenantAccess.middleware.js */

import { tenantPath } from "@/lib/workspaceSlug";

const SUPER = "platform_super_admin";
const COMPANY_ADMIN = "company_admin";
const ENTITY_MANAGER = "entity_manager";

const BOTH = [COMPANY_ADMIN, ENTITY_MANAGER];

export type TenantArea =
  | "home"
  | "orders"
  | "wallets"
  | "shops"
  | "swag"
  | "kits"
  | "campaigns"
  | "campaignOps"
  | "contacts"
  | "support"
  | "integrations"
  | "settings"
  | "catalog"
  | "users";

const MATRIX: Record<TenantArea, { write: string[]; read: string[] }> = {
  home: { read: BOTH, write: [] },
  orders: { read: BOTH, write: [COMPANY_ADMIN] },
  wallets: { read: BOTH, write: [COMPANY_ADMIN] },
  shops: { read: BOTH, write: [COMPANY_ADMIN] },
  swag: { read: BOTH, write: [COMPANY_ADMIN] },
  kits: { read: BOTH, write: [COMPANY_ADMIN] },
  campaigns: { read: BOTH, write: BOTH },
  campaignOps: { read: BOTH, write: BOTH },
  contacts: { read: BOTH, write: BOTH },
  support: { read: BOTH, write: BOTH },
  integrations: { read: BOTH, write: [COMPANY_ADMIN] },
  settings: { read: BOTH, write: [COMPANY_ADMIN] },
  catalog: { read: BOTH, write: [] },
  users: { read: [COMPANY_ADMIN], write: [COMPANY_ADMIN] },
};

export function rolesForTenantArea(
  area: TenantArea,
  action: "read" | "write" = "read",
): string[] {
  const entry = MATRIX[area];
  const roles = action === "write" ? entry.write : entry.read;
  return [...new Set([SUPER, ...roles])];
}

export function canAccessTenantArea(
  role: string | undefined,
  area: TenantArea,
  action: "read" | "write" = "read",
): boolean {
  if (!role) return false;
  return rolesForTenantArea(area, action).includes(role);
}

export type TenantNavItem = {
  area: TenantArea;
  key: string;
  label: string;
  href: string;
  match?: (pathname: string) => boolean;
};

export const TENANT_NAV: TenantNavItem[] = [
  {
    area: "home",
    key: "home",
    label: "Dashboard",
    href: "/dashboard",
    match: (pathname) =>
      pathname === "/dashboard" ||
      pathname === "/dashboard/" ||
      pathname === "/app" ||
      pathname === "/app/",
  },
  { area: "orders", key: "orders", label: "Orders", href: "/dashboard/orders" },
  { area: "wallets", key: "wallets", label: "Budget", href: "/dashboard/wallets" },
  { area: "shops", key: "shops", label: "Shops", href: "/dashboard/shops" },
  { area: "swag", key: "swag", label: "Swag", href: "/dashboard/swag" },
  { area: "kits", key: "kits", label: "Kits", href: "/dashboard/kits" },
  { area: "campaigns", key: "campaigns", label: "Campaigns", href: "/dashboard/campaigns" },
  { area: "contacts", key: "contacts", label: "Contacts", href: "/dashboard/contacts" },
  { area: "support", key: "support", label: "Support", href: "/dashboard/support" },
  { area: "integrations", key: "integrations", label: "Integrations", href: "/dashboard/integrations" },
  { area: "settings", key: "settings", label: "Settings", href: "/dashboard/settings" },
  { area: "catalog", key: "catalog", label: "Catalog", href: "/dashboard/catalog" },
];

/** Build nav items with dynamic slug-based paths (e.g. /shelfmerch/shops). */
function buildTenantNav(): TenantNavItem[] {
  const base = tenantPath();
  return [
    {
      area: "home",
      key: "home",
      label: "Dashboard",
      href: base,
      match: (pathname) => {
        const slug = base;
        return (
          pathname === slug ||
          pathname === `${slug}/` ||
          pathname === "/dashboard" ||
          pathname === "/dashboard/" ||
          pathname === "/app" ||
          pathname === "/app/"
        );
      },
    },
    { area: "orders", key: "orders", label: "Orders", href: tenantPath("/orders") },
    { area: "wallets", key: "wallets", label: "Budget", href: tenantPath("/wallets") },
    { area: "shops", key: "shops", label: "Shops", href: tenantPath("/shops") },
    { area: "swag", key: "swag", label: "Swag", href: tenantPath("/swag") },
    { area: "kits", key: "kits", label: "Kits", href: tenantPath("/kits") },
    { area: "campaigns", key: "campaigns", label: "Campaigns", href: tenantPath("/campaigns") },
    { area: "contacts", key: "contacts", label: "Contacts", href: tenantPath("/contacts") },
    { area: "support", key: "support", label: "Support", href: tenantPath("/support") },
    { area: "integrations", key: "integrations", label: "Integrations", href: tenantPath("/integrations") },
    { area: "settings", key: "settings", label: "Settings", href: tenantPath("/settings") },
    { area: "catalog", key: "catalog", label: "Catalog", href: tenantPath("/catalog") },
  ];
}

export function navItemsForTenantRole(role: string | undefined): TenantNavItem[] {
  return buildTenantNav().filter((item) => canAccessTenantArea(role, item.area, "read"));
}
