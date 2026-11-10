import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { env } from '../../config/env.js';

const COPILOT_ROLES = new Set(rolesForTenantArea('catalog', 'read'));

/**
 * Customer-facing capability cards. Keys never expose MCP tool names.
 * `area` maps to tenantAccess MATRIX for server-side filtering.
 */
export const CAPABILITY_CATALOG = [
  {
    id: 'explore_catalog',
    group: 'Discover',
    title: 'Explore Product Catalog',
    prompt: 'Show me apparel products suitable for employee gifting under ₹1500.',
    area: 'catalog',
    action: 'read',
  },
  {
    id: 'explore_kits',
    group: 'Discover',
    title: 'Explore Customized & Curated Kits',
    prompt: 'List customized and curated kits I can send to employees.',
    area: 'kits',
    action: 'read',
  },
  {
    id: 'gifting_ideas',
    group: 'Discover',
    title: 'Corporate Gifting Ideas',
    prompt: 'Suggest corporate gifting ideas for a new-hire welcome pack, and clearly separate ShelfMerch inventory from inspiration.',
    area: 'catalog',
    action: 'read',
  },
  {
    id: 'check_budget',
    group: 'Manage',
    title: 'Check Wallet / Department Budget',
    prompt: 'Summarize the wallet or department budget I am allowed to see.',
    area: 'wallets',
    action: 'read',
  },
  {
    id: 'browse_stores',
    group: 'Manage',
    title: 'Browse Stores and Collections',
    prompt: 'List the stores in this workspace.',
    area: 'shops',
    action: 'read',
  },
  {
    id: 'find_contacts',
    group: 'Manage',
    title: 'Find Contacts / Employees',
    prompt: 'Search employees whose name or email contains “an”.',
    area: 'contacts',
    action: 'read',
  },
  {
    id: 'campaign_status',
    group: 'Execute and Track',
    title: 'Campaign Status',
    prompt: 'Show recent campaigns and their status.',
    area: 'campaigns',
    action: 'read',
  },
  {
    id: 'order_tracking',
    group: 'Execute and Track',
    title: 'Order Tracking',
    prompt: 'Show recent orders and their fulfillment status.',
    area: 'orders',
    action: 'read',
  },
];

export function isCopilotRole(role) {
  return COPILOT_ROLES.has(role);
}

export function isEmbeddedCopilotEnabled() {
  return env.EMBEDDED_COPILOT_ENABLED === 'true';
}

export {
  openaiProviderStatus,
  resolveCopilotProviderStatus,
  providerDisabledMessage,
} from './copilotAiProvider.js';

export function capabilitiesForRole(role) {
  return CAPABILITY_CATALOG.filter((card) =>
    rolesForTenantArea(card.area, card.action).includes(role),
  ).map(({ id, group, title, prompt }) => ({ id, group, title, prompt }));
}
