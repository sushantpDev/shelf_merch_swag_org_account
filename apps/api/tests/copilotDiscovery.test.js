import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { discoveryForUser, DISCOVERY_ACTIONS } from '../src/modules/copilot/copilotDiscovery.js';
import { COPILOT_TOOLS } from '../src/modules/copilot/copilotTools.js';

const admin = { role: 'company_admin', scopeType: 'tenant' };
const manager = { role: 'entity_manager', scopeType: 'entity' };
const actions = discovery => discovery.categories.flatMap(category => category.actions);

describe('authenticated Copilot discovery', () => {
  it('provides six categories, available read actions and clearly pending writes without prompts', () => {
    const result = discoveryForUser(admin);
    expect(result.categories).toHaveLength(6);
    expect(result.categories.every(category => category.actions.length > 0 && category.actions.length <= 6)).toBe(true);
    expect(actions(result).find(action => action.id === 'stores_list')).toMatchObject({ availability: 'available' });
    for (const pending of actions(result).filter(action => action.availability === 'integration_pending')) {
      expect(pending).not.toHaveProperty('prompt');
      expect(pending.explanation).toContain('cannot run here yet');
    }
    expect(actions(result).find(action => action.id === 'gifting_kit')).toMatchObject({ availability: 'integration_pending' });
  });
  it('hides organization funding, allocation and store writes from entity managers', () => {
    const result = discoveryForUser(manager);
    expect(result.categories).toHaveLength(6);
    const ids = actions(result).map(action => action.id);
    for (const id of ['wallet_activity', 'wallet_fund', 'budget_allocate', 'budget_topup', 'stores_create', 'stores_update', 'stores_publish', 'collections_manage']) expect(ids).not.toContain(id);
    expect(ids).toContain('budget_available');
    expect(ids).toContain('stores_list');
    expect(actions(result).find(action => action.id === 'budget_available').prompt).toContain('department budget');
    expect(result.categories.find(category => category.id === 'budgets_wallet').description).toContain('assigned departments');
  });
  it('honors department scope even when the role is company_admin', () => {
    const ids = actions(discoveryForUser({ ...admin, scopeType: 'entity' })).map(action => action.id);
    expect(ids).not.toContain('wallet_activity');
    expect(ids).not.toContain('wallet_fund');
    expect(ids).not.toContain('budget_allocate');
  });
  it('omits unsupported reads and never advertises recipient data that tools do not return', () => {
    const result = discoveryForUser(admin, { tools: COPILOT_TOOLS.filter(tool => tool.name !== 'catalog_search') });
    expect(actions(result).map(action => action.id)).not.toContain('products_explore');
    expect(actions(result).map(action => action.id)).not.toContain('products_budget');
    expect(actions(result).map(action => action.id)).not.toContain('campaign_recipients');
    expect(actions(result).map(action => action.id)).not.toContain('stores_collections_read');
    expect(discoveryForUser({ role: 'member' }).categories).toEqual([]);
  });
  it('uses the real embedded allowlist for every available action', () => {
    const names = new Set(COPILOT_TOOLS.map(tool => tool.name));
    for (const action of actions(discoveryForUser(admin)).filter(action => action.availability === 'available')) {
      const definition = DISCOVERY_ACTIONS.find(row => row.id === action.id);
      expect(definition.tools.every(name => names.has(name))).toBe(true);
      expect(definition.write).not.toBe(true);
    }
  });
  it('only labels writes as pending when their exact tools exist in the MCP registry', () => {
    const registry = readFileSync(new URL('../src/modules/mcp/createShelfMerchMcp.js', import.meta.url), 'utf8');
    for (const action of DISCOVERY_ACTIONS.filter(action => action.write)) {
      for (const name of action.tools) expect(registry, `${action.id}: missing MCP tool ${name}`).toContain(`'${name}'`);
    }
  });
  it('requires both actual write tools and an explicit rollout gate before future writes become available', () => {
    const action = DISCOVERY_ACTIONS.find(row => row.id === 'stores_create');
    const tools = [...COPILOT_TOOLS, ...action.tools.map(name => ({ name, area: 'shops', action: 'write' }))];
    expect(actions(discoveryForUser(admin, { tools })).find(row => row.id === action.id).availability).toBe('integration_pending');
    expect(actions(discoveryForUser(admin, { tools, writeToolsEnabled: true })).find(row => row.id === action.id)).toMatchObject({ availability: 'available', prompt: action.prompt });
    expect(actions(discoveryForUser(manager, { tools, writeToolsEnabled: true })).find(row => row.id === action.id)).toBeUndefined();
  });
});
