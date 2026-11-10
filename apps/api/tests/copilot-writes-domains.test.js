import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { authHeader, makeTenant, makeUser, makeShop, makeFundedWallet, makeEntity } from './helpers.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { registeredToolNames, runCopilotTool, listOpenAiToolsForRole } from '../src/modules/copilot/copilotTools.js';
import { buildCopilotToolCtx } from '../src/modules/copilot/buildCallerCtx.js';
import { discoveryForUser } from '../src/modules/copilot/copilotDiscovery.js';
import { toAnthropicTools } from '../src/modules/copilot/providers/anthropicChatAdapter.js';

let app;
const prev = {
  enabled: env.EMBEDDED_COPILOT_ENABLED,
  key: env.OPENAI_API_KEY,
  storeCreate: env.EMBEDDED_COPILOT_WRITE_STORE_CREATE,
  storeUpdate: env.EMBEDDED_COPILOT_WRITE_STORE_UPDATE,
  storePublish: env.EMBEDDED_COPILOT_WRITE_STORE_PUBLISH,
  collections: env.EMBEDDED_COPILOT_WRITE_COLLECTIONS,
  budgets: env.EMBEDDED_COPILOT_WRITE_BUDGETS,
  walletTopup: env.EMBEDDED_COPILOT_WRITE_WALLET_TOPUP,
  walletSetup: env.EMBEDDED_COPILOT_WRITE_WALLET_SETUP,
  payments: env.EMBEDDED_COPILOT_WRITE_PAYMENTS,
  sendPoints: env.EMBEDDED_COPILOT_WRITE_SEND_POINTS,
  sendKits: env.EMBEDDED_COPILOT_WRITE_SEND_KITS,
  employees: env.EMBEDDED_COPILOT_WRITE_EMPLOYEES,
  entities: env.EMBEDDED_COPILOT_WRITE_ENTITIES,
  shopCatalog: env.EMBEDDED_COPILOT_WRITE_SHOP_CATALOG,
  shopCategories: env.EMBEDDED_COPILOT_WRITE_SHOP_CATEGORIES,
};

function restoreFlags() {
  Object.assign(env, {
    EMBEDDED_COPILOT_ENABLED: prev.enabled,
    OPENAI_API_KEY: prev.key,
    EMBEDDED_COPILOT_WRITE_STORE_CREATE: prev.storeCreate,
    EMBEDDED_COPILOT_WRITE_STORE_UPDATE: prev.storeUpdate,
    EMBEDDED_COPILOT_WRITE_STORE_PUBLISH: prev.storePublish,
    EMBEDDED_COPILOT_WRITE_COLLECTIONS: prev.collections,
    EMBEDDED_COPILOT_WRITE_BUDGETS: prev.budgets,
    EMBEDDED_COPILOT_WRITE_WALLET_TOPUP: prev.walletTopup,
    EMBEDDED_COPILOT_WRITE_WALLET_SETUP: prev.walletSetup,
    EMBEDDED_COPILOT_WRITE_PAYMENTS: prev.payments,
    EMBEDDED_COPILOT_WRITE_SEND_POINTS: prev.sendPoints,
    EMBEDDED_COPILOT_WRITE_SEND_KITS: prev.sendKits,
    EMBEDDED_COPILOT_WRITE_EMPLOYEES: prev.employees,
    EMBEDDED_COPILOT_WRITE_ENTITIES: prev.entities,
    EMBEDDED_COPILOT_WRITE_SHOP_CATALOG: prev.shopCatalog,
    EMBEDDED_COPILOT_WRITE_SHOP_CATEGORIES: prev.shopCategories,
  });
}

/** Per-test baseline: ignore local .env WRITE flags so suites stay deterministic. */
function clearAllWriteFlags() {
  Object.assign(env, {
    EMBEDDED_COPILOT_WRITE_STORE_CREATE: 'false',
    EMBEDDED_COPILOT_WRITE_STORE_UPDATE: 'false',
    EMBEDDED_COPILOT_WRITE_STORE_PUBLISH: 'false',
    EMBEDDED_COPILOT_WRITE_COLLECTIONS: 'false',
    EMBEDDED_COPILOT_WRITE_BUDGETS: 'false',
    EMBEDDED_COPILOT_WRITE_WALLET_TOPUP: 'false',
    EMBEDDED_COPILOT_WRITE_WALLET_SETUP: 'false',
    EMBEDDED_COPILOT_WRITE_PAYMENTS: 'false',
    EMBEDDED_COPILOT_WRITE_SEND_POINTS: 'false',
    EMBEDDED_COPILOT_WRITE_SEND_KITS: 'false',
    EMBEDDED_COPILOT_WRITE_EMPLOYEES: 'false',
    EMBEDDED_COPILOT_WRITE_ENTITIES: 'false',
    EMBEDDED_COPILOT_WRITE_SHOP_CATALOG: 'false',
    EMBEDDED_COPILOT_WRITE_SHOP_CATEGORIES: 'false',
  });
}

beforeAll(async () => {
  env.EMBEDDED_COPILOT_ENABLED = 'true';
  env.OPENAI_API_KEY = '';
  await connectTestDb();
  app = createApp();
});

afterAll(async () => {
  restoreFlags();
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  clearTenantLimitCache();
  restoreFlags();
  env.EMBEDDED_COPILOT_ENABLED = 'true';
  env.OPENAI_API_KEY = '';
  clearAllWriteFlags();
});

async function adminCtx(tenant) {
  const { user, assignment, token } = await makeUser(tenant, 'company_admin');
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
  return { ctx, token, user };
}

describe('copilot domain writes behind flags', () => {
  it('does not expose write tools when all domain flags are off', () => {
    const names = registeredToolNames();
    expect(names.some((n) => n.includes('_prepare_') || n.includes('_execute_'))).toBe(false);
    expect(names).toHaveLength(23);
  });

  it('store update prepare/execute/cancel via generic workflow routes', async () => {
    env.EMBEDDED_COPILOT_WRITE_STORE_UPDATE = 'true';
    const tenant = await makeTenant();
    const { token, ctx } = await adminCtx(tenant);
    const shop = await makeShop(tenant, { name: 'Update Me', status: 'draft', currencyMode: 'points' });

    const modelTools = listOpenAiToolsForRole('company_admin').map((t) => t.function.name);
    expect(modelTools).toContain('shops_prepare_update');
    expect(modelTools).not.toContain('shops_execute_update');
    const anthropic = toAnthropicTools(listOpenAiToolsForRole('company_admin')).map((t) => t.name);
    expect(anthropic).toContain('shops_prepare_update');
    expect(anthropic).not.toContain('shops_execute_update');

    const prepared = await request(app)
      .post('/api/v1/copilot/writes/shops.update/prepare')
      .set(authHeader(token))
      .send({ shopId: String(shop._id), name: 'Updated Store' });
    expect(prepared.status).toBe(200);
    expect(prepared.body.confirmationId).toBeTruthy();
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).name).toBe('Update Me');

    const cancelled = await request(app)
      .post('/api/v1/copilot/writes/shops.update/cancel')
      .set(authHeader(token))
      .send({ confirmationId: prepared.body.confirmationId });
    expect(cancelled.status).toBe(200);

    const prepared2 = await request(app)
      .post('/api/v1/copilot/writes/shops.update/prepare')
      .set(authHeader(token))
      .send({ shopId: String(shop._id), name: 'Updated Store' });
    const executed = await request(app)
      .post('/api/v1/copilot/writes/shops.update/execute')
      .set(authHeader(token))
      .send({
        shopId: String(shop._id),
        name: 'Updated Store',
        confirmationId: prepared2.body.confirmationId,
        idempotencyKey: 'store-update-1',
      });
    expect(executed.status).toBe(200);
    expect(executed.body.name).toBe('Updated Store');

    const replay = await request(app)
      .post('/api/v1/copilot/writes/shops.update/execute')
      .set(authHeader(token))
      .send({
        shopId: String(shop._id),
        name: 'Updated Store',
        confirmationId: prepared2.body.confirmationId,
        idempotencyKey: 'store-update-1',
      });
    expect(replay.status).toBe(200);
    expect(replay.body.id).toBe(executed.body.id);
    expect(await Shop.countDocuments({ tenantId: tenant._id, name: 'Updated Store' })).toBe(1);

    await expect(
      runCopilotTool(
        'shops_execute_update',
        ctx,
        {
          shopId: String(shop._id),
          name: 'Hacked',
          confirmationId: 'x'.repeat(24),
          idempotencyKey: 'model-update-blocked',
        },
        'company_admin',
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects entity manager for store update prepare/execute', async () => {
    env.EMBEDDED_COPILOT_WRITE_STORE_UPDATE = 'true';
    const tenant = await makeTenant();
    const wallet = await makeFundedWallet(tenant);
    const entity = await makeEntity(tenant, wallet);
    const admin = await makeUser(tenant, 'company_admin');
    const manager = await makeUser(tenant, 'entity_manager', 'entity', {
      assignedEntityIds: [entity._id],
      scopeId: entity._id,
    });
    const shop = await makeShop(tenant, { name: 'RBAC Update Shop', status: 'draft', currencyMode: 'points' });

    const deniedPrepare = await request(app)
      .post('/api/v1/copilot/writes/shops.update/prepare')
      .set(authHeader(manager.token))
      .send({ shopId: String(shop._id), name: 'Manager Rename' });
    expect(deniedPrepare.status).toBe(403);

    const prepared = await request(app)
      .post('/api/v1/copilot/writes/shops.update/prepare')
      .set(authHeader(admin.token))
      .send({ shopId: String(shop._id), name: 'Admin Rename' });
    expect(prepared.status).toBe(200);

    const deniedExecute = await request(app)
      .post('/api/v1/copilot/writes/shops.update/execute')
      .set(authHeader(manager.token))
      .send({
        shopId: String(shop._id),
        name: 'Admin Rename',
        confirmationId: prepared.body.confirmationId,
        idempotencyKey: 'manager-update-steal',
      });
    expect([403, 404]).toContain(deniedExecute.status);
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).name).toBe('RBAC Update Shop');
  });

  it('store publish prepare/execute/cancel with Claude gating and idempotency', async () => {
    env.EMBEDDED_COPILOT_WRITE_STORE_PUBLISH = 'true';
    const tenant = await makeTenant();
    const { token, ctx } = await adminCtx(tenant);
    const shop = await makeShop(tenant, {
      name: 'Publish Me',
      status: 'draft',
      currencyMode: 'points',
      categories: ['Welcome'],
      logoUrl: 'https://cdn.test/logo.png',
      companyEmailDomain: 'acme.com',
      activeListingKeys: ['col1:prod1'],
      slug: `publish-me-${Date.now()}`,
    });

    const modelTools = listOpenAiToolsForRole('company_admin').map((t) => t.function.name);
    expect(modelTools).toContain('shops_prepare_publish');
    expect(modelTools).not.toContain('shops_execute_publish');
    const anthropic = toAnthropicTools(listOpenAiToolsForRole('company_admin')).map((t) => t.name);
    expect(anthropic).toContain('shops_prepare_publish');
    expect(anthropic).not.toContain('shops_execute_publish');

    const prepared = await request(app)
      .post('/api/v1/copilot/writes/shops.publish/prepare')
      .set(authHeader(token))
      .send({ shopId: String(shop._id) });
    expect(prepared.status).toBe(200);
    expect(prepared.body.confirmationId).toBeTruthy();
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).status).toBe('draft');

    const cancelled = await request(app)
      .post('/api/v1/copilot/writes/shops.publish/cancel')
      .set(authHeader(token))
      .send({ confirmationId: prepared.body.confirmationId });
    expect(cancelled.status).toBe(200);
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).status).toBe('draft');

    const prepared2 = await request(app)
      .post('/api/v1/copilot/writes/shops.publish/prepare')
      .set(authHeader(token))
      .send({ shopId: String(shop._id) });
    const executed = await request(app)
      .post('/api/v1/copilot/writes/shops.publish/execute')
      .set(authHeader(token))
      .send({
        shopId: String(shop._id),
        confirmationId: prepared2.body.confirmationId,
        idempotencyKey: 'store-publish-1',
      });
    expect(executed.status).toBe(200);
    expect(executed.body.status).toBe('live');

    const replay = await request(app)
      .post('/api/v1/copilot/writes/shops.publish/execute')
      .set(authHeader(token))
      .send({
        shopId: String(shop._id),
        confirmationId: prepared2.body.confirmationId,
        idempotencyKey: 'store-publish-1',
      });
    expect(replay.status).toBe(200);
    expect(replay.body.id).toBe(executed.body.id);
    expect(await Shop.countDocuments({ tenantId: tenant._id, status: 'live' })).toBe(1);

    await expect(
      runCopilotTool(
        'shops_execute_publish',
        ctx,
        {
          shopId: String(shop._id),
          confirmationId: 'y'.repeat(24),
          idempotencyKey: 'model-publish-blocked',
        },
        'company_admin',
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects entity manager for store publish prepare/execute', async () => {
    env.EMBEDDED_COPILOT_WRITE_STORE_PUBLISH = 'true';
    const tenant = await makeTenant();
    const wallet = await makeFundedWallet(tenant);
    const entity = await makeEntity(tenant, wallet);
    const admin = await makeUser(tenant, 'company_admin');
    const manager = await makeUser(tenant, 'entity_manager', 'entity', {
      assignedEntityIds: [entity._id],
      scopeId: entity._id,
    });
    const shop = await makeShop(tenant, {
      name: 'RBAC Publish Shop',
      status: 'draft',
      currencyMode: 'points',
      categories: ['Welcome'],
      slug: `rbac-publish-${Date.now()}`,
    });

    const deniedPrepare = await request(app)
      .post('/api/v1/copilot/writes/shops.publish/prepare')
      .set(authHeader(manager.token))
      .send({ shopId: String(shop._id) });
    expect(deniedPrepare.status).toBe(403);

    const prepared = await request(app)
      .post('/api/v1/copilot/writes/shops.publish/prepare')
      .set(authHeader(admin.token))
      .send({ shopId: String(shop._id) });
    expect(prepared.status).toBe(200);

    const deniedExecute = await request(app)
      .post('/api/v1/copilot/writes/shops.publish/execute')
      .set(authHeader(manager.token))
      .send({
        shopId: String(shop._id),
        confirmationId: prepared.body.confirmationId,
        idempotencyKey: 'manager-publish-steal',
      });
    expect([403, 404]).toContain(deniedExecute.status);
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).status).toBe('draft');
  });

  it('enables budget discovery only when budgets flag is on', async () => {
    const admin = { role: 'company_admin', scopeType: 'tenant' };
    const pending = discoveryForUser(admin).categories
      .flatMap((c) => c.actions)
      .find((a) => a.id === 'budget_allocate');
    expect(pending.availability).toBe('integration_pending');

    env.EMBEDDED_COPILOT_WRITE_BUDGETS = 'true';
    const available = discoveryForUser(admin).categories
      .flatMap((c) => c.actions)
      .find((a) => a.id === 'budget_allocate');
    expect(available.availability).toBe('available');
  });

  it('rejects payments prepare when payments flag is off and keeps Razorpay tools gated', async () => {
    env.EMBEDDED_COPILOT_WRITE_PAYMENTS = 'false';
    const tenant = await makeTenant();
    const { token } = await adminCtx(tenant);
    const res = await request(app)
      .post('/api/v1/copilot/writes/wallets.payment_order/prepare')
      .set(authHeader(token))
      .send({});
    expect(res.status).toBe(404);
    expect(registeredToolNames()).not.toContain('wallets_prepare_payment_order');
  });

  it('model cannot execute employees write even when employees flag is on', async () => {
    env.EMBEDDED_COPILOT_WRITE_EMPLOYEES = 'true';
    const tenant = await makeTenant();
    const { ctx } = await adminCtx(tenant);
    await expect(
      runCopilotTool(
        'employees_execute_create',
        ctx,
        { confirmationId: 'x'.repeat(24), idempotencyKey: 'nope' },
        'company_admin',
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('status reports writeDomains map with defaults false', async () => {
    const tenant = await makeTenant();
    const { token } = await adminCtx(tenant);
    const res = await request(app).get('/api/v1/copilot/status').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.writeToolsEnabled).toBe(false);
    expect(res.body.writeDomains.storeCreate).toBe(false);
    expect(res.body.writeDomains.payments).toBe(false);
  });
});
