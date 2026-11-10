import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { authHeader, makeTenant, makeUser } from './helpers.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { runCopilotTool } from '../src/modules/copilot/copilotTools.js';
import { buildCopilotToolCtx } from '../src/modules/copilot/buildCallerCtx.js';
import { registeredToolNames } from '../src/modules/copilot/copilotTools.js';

let app;
const prev = { enabled: env.EMBEDDED_COPILOT_ENABLED, key: env.OPENAI_API_KEY };

beforeAll(async () => {
  env.EMBEDDED_COPILOT_ENABLED = 'true';
  env.OPENAI_API_KEY = '';
  await connectTestDb();
  app = createApp();
});

afterAll(async () => {
  env.EMBEDDED_COPILOT_ENABLED = prev.enabled;
  env.OPENAI_API_KEY = prev.key;
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  clearTenantLimitCache();
  env.EMBEDDED_COPILOT_ENABLED = 'true';
});

describe('copilot missing READ tools', () => {
  it('registers all 23 READ/upload_status tools when write flags are off', () => {
    const names = registeredToolNames();
    for (const name of [
      'catalog_list_categories',
      'gifts_search',
      'points_summary',
      'shops_get_categories',
      'shops_get_asset_upload',
      'wallets_get_document_upload',
    ]) {
      expect(names).toContain(name);
    }
    expect(names).toHaveLength(23);
  });

  it('runs catalog_list_categories and points_summary for company admin', async () => {
    const tenant = await makeTenant();
    const { user, assignment } = await makeUser(tenant, 'company_admin');
    const ctx = buildCopilotToolCtx({
      user: {
        userId: user._id,
        role: assignment.role,
        scopeType: assignment.scopeType,
        scopeId: assignment.scopeId,
        assignedEntityIds: [],
      },
      tenantId: tenant._id,
    });
    const categories = await runCopilotTool('catalog_list_categories', ctx, {}, 'company_admin');
    expect(categories.result).toBeTruthy();
    const points = await runCopilotTool('points_summary', ctx, {}, 'company_admin');
    expect(points.result).toBeTruthy();
  });

  it('keeps entity_manager organization wallet cash empty via wallet_list_balances', async () => {
    const tenant = await makeTenant();
    const { user, assignment } = await makeUser(tenant, 'entity_manager', 'entity', {
      assignedEntityIds: [],
    });
    const ctx = buildCopilotToolCtx({
      user: {
        userId: user._id,
        role: assignment.role,
        scopeType: assignment.scopeType,
        scopeId: assignment.scopeId,
        assignedEntityIds: [],
      },
      tenantId: tenant._id,
    });
    const { result, artifacts } = await runCopilotTool('wallet_list_balances', ctx, {}, 'entity_manager');
    const items = result?.items ?? result?.wallets ?? (Array.isArray(result) ? result : []);
    expect(Array.isArray(items) ? items.length : 0).toBe(0);
    expect(artifacts || []).toEqual([]);
  });

  it('wallet_list_balances artifacts stay empty for entity_manager visibility', async () => {
    const tenant = await makeTenant();
    const { user, assignment } = await makeUser(tenant, 'entity_manager', 'entity', {
      assignedEntityIds: [],
    });
    const ctx = buildCopilotToolCtx({
      user: {
        userId: user._id,
        role: assignment.role,
        scopeType: assignment.scopeType,
        scopeId: assignment.scopeId,
        assignedEntityIds: [],
      },
      tenantId: tenant._id,
    });
    const { artifacts } = await runCopilotTool('wallet_list_balances', ctx, {}, 'entity_manager');
    expect(artifacts.some((row) => row.kind === 'wallet_balance')).toBe(false);
  });
});
