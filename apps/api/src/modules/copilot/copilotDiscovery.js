import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { hidesOrganizationWallet } from '../mcp/walletVisibility.js';
import { activeCopilotTools, COPILOT_TOOLS } from './copilotTools.js';
import { anyWriteDomainEnabled, isWriteFlagEnabled } from './copilotWriteFlags.js';

// This is presentation metadata, never an execution registry. Runtime availability
// comes from the embedded allowlist, RBAC and its write rollout gate.
export const DISCOVERY_ACTIONS = [
  { id: 'products_explore', category: 'products_kits', title: 'Explore products', description: 'Browse real merchandise, photos and prices.', area: 'catalog', tools: ['catalog_search'], prompt: 'Show me available ShelfMerch products with photos and prices.' },
  { id: 'products_budget', category: 'products_kits', title: 'Find products within a budget', description: 'Start with your spending limit.', area: 'catalog', tools: ['catalog_search'], prompt: 'Help me find available merchandise within a budget. Ask me for my spending limit first.' },
  { id: 'kits_curated', category: 'products_kits', title: 'Explore curated kits', description: 'Browse ready-made gifting collections.', area: 'kits', tools: ['kits_list_curated'], prompt: 'Show me the curated gift kits available in ShelfMerch.' },
  { id: 'kits_customized', category: 'products_kits', title: 'View my customized kits', description: 'See kits in this workspace.', area: 'kits', tools: ['kits_list'], prompt: 'Show the customized kits I can access in this workspace.' },
  { id: 'kits_contents', category: 'products_kits', title: 'Explore kit contents', description: 'See the actual products in a kit.', area: 'kits', tools: ['kits_get', 'kits_get_curated'], prompt: 'Help me explore the actual products inside a gift kit. Ask me which kit to look at first.' },
  { id: 'products_recommendations', category: 'products_kits', title: 'Get product recommendations', description: 'Choose merchandise for an occasion.', area: 'catalog', tools: ['catalog_search'], prompt: 'Recommend suitable merchandise for an occasion. Ask about the occasion and spending limit first, and clearly separate real ShelfMerch inventory from inspiration.' },

  { id: 'budget_available', category: 'budgets_wallet', title: 'Check my available budget', area: 'wallets', tools: ['entities_list'], prompt: 'Show my current available department budget, including allocated, spent and remaining amounts for departments I am allowed to see.' },
  { id: 'budget_departments', category: 'budgets_wallet', title: 'View department budgets', area: 'wallets', tools: ['entities_list'], prompt: 'Show the allocated, spent and remaining budgets for the departments I am allowed to see.' },
  { id: 'budget_allocate', category: 'budgets_wallet', title: 'Allocate budget to a department', area: 'wallets', write: true, writeFlag: 'budgets', organizationOnly: true, tools: ['budget_prepare_allocation', 'budget_execute_allocation'], prompt: 'Help me allocate a budget to a department. Ask me which department and amount.' },
  { id: 'budget_topup', category: 'budgets_wallet', title: 'Top up a department budget', area: 'wallets', write: true, writeFlag: 'budgets', organizationOnly: true, tools: ['budget_prepare_allocation', 'budget_execute_allocation'], prompt: 'Help me top up an existing department budget. Ask me which department and amount.' },
  { id: 'wallet_activity', category: 'budgets_wallet', title: 'View wallet balance and transactions', area: 'wallets', organizationOnly: true, tools: ['wallet_list_balances', 'wallet_list_transactions'], prompt: 'Show my organization wallet balances and help me review transactions. Ask which wallet if there is more than one.' },
  { id: 'wallet_fund', category: 'budgets_wallet', title: 'Add funds to the organization wallet', area: 'wallets', write: true, writeFlag: 'walletTopup', organizationOnly: true, tools: ['wallets_prepare_topup', 'wallets_execute_topup'], prompt: 'Help me add funds to the organization wallet. Ask for the required details first.' },

  { id: 'stores_list', category: 'stores_collections', title: 'View my stores', area: 'shops', tools: ['shops_list'], prompt: 'Show the stores I can access in this workspace and their draft or live status.' },
  { id: 'stores_details', category: 'stores_collections', title: 'Review store details', area: 'shops', tools: ['shops_get'], prompt: 'Help me review a store’s details and publishing readiness. Ask me which store first.' },
  { id: 'stores_create', category: 'stores_collections', title: 'Create a new store', area: 'shops', write: true, writeFlag: 'storeCreate', tools: ['shops_prepare_create', 'shops_execute_create'], prompt: 'I want to create a new store for my organization. Ask for the required details first.' },
  { id: 'stores_update', category: 'stores_collections', title: 'Update store details', area: 'shops', write: true, writeFlag: 'storeUpdate', tools: ['shops_prepare_update', 'shops_execute_update'], prompt: 'Help me update a store. Ask which store and which details to change.' },
  { id: 'stores_publish', category: 'stores_collections', title: 'Publish a draft store', area: 'shops', write: true, writeFlag: 'storePublish', tools: ['shops_prepare_publish', 'shops_execute_publish'], prompt: 'Help me publish a draft store. Ask me which store to review first.' },
  { id: 'stores_catalog', category: 'stores_collections', title: 'Show or hide store products', area: 'shops', write: true, writeFlag: 'shopCatalog', tools: ['shops_get', 'shops_prepare_catalog_update', 'shops_execute_catalog_update'], prompt: 'Help me show or hide products on a store. Ask which store and which product. Use shops_get availableListings, then prepare a catalog update for confirmation.' },
  { id: 'collections_manage', category: 'stores_collections', title: 'Create and publish collections', area: 'shops', write: true, writeFlag: 'collections', tools: ['shops_prepare_collection_draft', 'shops_execute_collection_draft', 'shops_prepare_collection_publish', 'shops_execute_collection_publish'], prompt: 'Help me create and publish a store collection. Ask me which store and which products to include.' },

  { id: 'gifting_plan', category: 'gifting_rewards', title: 'Plan employee gifts', description: 'Ideas grounded in your occasion and inventory.', area: 'catalog', tools: ['catalog_search'], prompt: 'Help me plan employee gifts. Ask about the occasion, recipients and spending limit, and separate actual ShelfMerch inventory from general gifting ideas.' },
  { id: 'gifting_budget', category: 'gifting_rewards', title: 'Find gifts within a budget', area: 'catalog', tools: ['catalog_search'], prompt: 'Help me find real ShelfMerch gifts within a budget. Ask me for the spending limit and occasion first.' },
  { id: 'gifting_previous', category: 'gifting_rewards', title: 'Review previous sends', area: 'campaigns', tools: ['campaigns_search'], prompt: 'Show the previous gifting campaigns and sends I am allowed to view.' },
  { id: 'gifting_points', category: 'gifting_rewards', title: 'Send Points', area: 'campaignOps', write: true, writeFlag: 'sendPoints', tools: ['campaigns_prepare_points_draft', 'campaigns_execute_points_draft', 'campaigns_prepare_credit_allocation', 'campaigns_execute_credit_allocation', 'campaigns_prepare_launch', 'campaigns_execute_launch'], prompt: 'I want to send Points to employees. Ask me for the recipients and campaign details first.' },
  { id: 'gifting_kit', category: 'gifting_rewards', title: 'Send an existing kit', area: 'campaignOps', write: true, writeFlag: 'sendKits', tools: ['campaigns_prepare_merchandise_draft', 'campaigns_execute_merchandise_draft', 'campaigns_prepare_merchandise_launch', 'campaigns_execute_merchandise_launch'], prompt: 'Help me send an existing kit to employees. Ask which kit and recipients first.' },
  { id: 'gifting_preview', category: 'gifting_rewards', title: 'Preview a gifting campaign', area: 'campaignOps', write: true, writeFlag: 'sendPoints', tools: ['campaigns_prepare_points_draft'], prompt: 'Help me preview a gifting campaign. Ask which type of gift and who should receive it.' },

  { id: 'employees_search', category: 'employees_teams', title: 'Search employees and contacts', area: 'contacts', tools: ['employees_search'], prompt: 'Help me find an employee or contact I am allowed to see. Ask me for their name or email.' },
  { id: 'employees_details', category: 'employees_teams', title: 'View employee details', area: 'contacts', tools: ['employees_search', 'employees_get'], prompt: 'Help me view an employee’s details within my permissions. Ask me who to look up first.' },
  { id: 'employees_departments', category: 'employees_teams', title: 'View departments', area: 'wallets', tools: ['entities_list'], prompt: 'Show the departments I am allowed to view.' },
  { id: 'employees_managers', category: 'employees_teams', title: 'Find department managers', area: 'wallets', tools: ['entities_list'], prompt: 'Show the managers of the departments I am allowed to view.' },
  { id: 'employees_manage', category: 'employees_teams', title: 'Manage employee records', area: 'contacts', write: true, writeFlag: 'employees', tools: ['employees_prepare_create', 'employees_execute_create', 'employees_prepare_update', 'employees_execute_update'], prompt: 'Help me manage an employee record within my authorized departments. Ask which record and what change is needed.' },

  { id: 'campaigns_recent', category: 'campaigns_orders', title: 'View recent campaigns', area: 'campaigns', tools: ['campaigns_search'], prompt: 'Show recent campaigns I am allowed to see, including their status.' },
  { id: 'campaigns_status', category: 'campaigns_orders', title: 'Check campaign status', area: 'campaigns', tools: ['campaigns_search', 'campaigns_get'], prompt: 'Help me check a campaign’s current status. Ask me which campaign first.' },
  { id: 'orders_track', category: 'campaigns_orders', title: 'Track an order', area: 'orders', tools: ['orders_search', 'orders_get'], prompt: 'Help me track an order I am allowed to view. Ask me which order first.' },
  { id: 'orders_recent', category: 'campaigns_orders', title: 'View recent orders', area: 'orders', tools: ['orders_search'], prompt: 'Show the recent orders I can access and their fulfillment status.' },
  { id: 'campaigns_details', category: 'campaigns_orders', title: 'Review campaign details', area: 'campaigns', tools: ['campaigns_get'], prompt: 'Help me review a campaign’s details within my permissions. Ask me which campaign first.' },
];

export const DISCOVERY_CATEGORIES = [
  { id: 'products_kits', title: 'Products & Kits', description: 'Discover merchandise and gift kits', heading: 'What would you like to explore?' },
  { id: 'budgets_wallet', title: 'Budgets & Wallet', description: 'View and manage available funds', heading: 'How can I help with your budget?' },
  { id: 'stores_collections', title: 'Stores & Collections', description: 'Create and manage company shops', heading: 'What would you like to do with your stores?' },
  { id: 'gifting_rewards', title: 'Gifting & Rewards', description: 'Send gifts and recognize employees', heading: 'How would you like to recognize your team?' },
  { id: 'employees_teams', title: 'Employees & Teams', description: 'Find people and explore teams', heading: 'Who would you like to find or manage?' },
  { id: 'campaigns_orders', title: 'Campaigns & Orders', description: 'Manage sends and track deliveries', heading: 'What would you like to track?' },
];

function actionWriteEnabled(action, { writeToolsEnabled, writeDomains } = {}) {
  if (!action.write) return true;
  if (action.writeFlag) {
    if (writeDomains && typeof writeDomains[action.writeFlag] === 'boolean') {
      return writeDomains[action.writeFlag];
    }
    // Unit-test seam: writeToolsEnabled:true without a domains map unlocks writes.
    if (writeDomains === undefined && writeToolsEnabled === true) return true;
    return isWriteFlagEnabled(action.writeFlag);
  }
  return Boolean(writeToolsEnabled);
}

export function discoveryForUser(
  user,
  {
    tools = activeCopilotTools(),
    writeToolsEnabled = anyWriteDomainEnabled(),
    writeDomains,
  } = {},
) {
  const allowed = (area, action = 'read') => rolesForTenantArea(area, action).includes(user?.role);
  if (!allowed('catalog')) return { categories: [] };
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const departmentScope = hidesOrganizationWallet(user);
  const categories = DISCOVERY_CATEGORIES.map((category) => {
    const actions = DISCOVERY_ACTIONS.filter((action) => action.category === category.id)
      .filter((action) => allowed(action.area, action.write ? 'write' : 'read'))
      .filter((action) => !action.organizationOnly || !departmentScope)
      .flatMap((action) => {
        const connected = action.tools.every((name) => {
          const tool = byName.get(name);
          return tool && allowed(tool.area, tool.action || 'read');
        });
        // Missing read tools are unsupported in this embedded rollout. Known MCP
        // writes remain discoverable as pending, but never receive a prompt.
        if (!connected && !action.write) return [];
        const domainOn = actionWriteEnabled(action, { writeToolsEnabled, writeDomains });
        const available = connected && (!action.write || domainOn);
        const result = {
          id: action.id,
          title: action.title,
          description: action.description || '',
          availability: available ? 'available' : 'integration_pending',
        };
        if (available) result.prompt = action.prompt;
        else result.explanation = 'Available elsewhere in ShelfMerch. Coming to Copilot; this action cannot run here yet.';
        if (action.id === 'budget_available' && !departmentScope && byName.has('wallet_list_balances')) {
          result.prompt = 'Show my current available organization wallet balance and the remaining budgets of departments I am allowed to see.';
        }
        return [result];
      });
    if (!actions.length) return null;
    const result = { ...category, actions };
    if (departmentScope && category.id === 'budgets_wallet') result.description = 'View budgets for your assigned departments';
    if (!allowed('shops', 'write') && category.id === 'stores_collections') result.description = 'Explore the stores you can access';
    return result;
  }).filter(Boolean);
  return { categories };
}

export { COPILOT_TOOLS };
