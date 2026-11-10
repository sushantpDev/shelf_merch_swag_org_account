import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import {
  authHeader,
  makeTenant,
  makeUser,
  makeShop,
  makeFundedWallet,
  makeEntity,
} from './helpers.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import {
  registeredToolNames,
  runCopilotTool,
  listOpenAiToolsForRole,
} from '../src/modules/copilot/copilotTools.js';
import { buildCopilotToolCtx } from '../src/modules/copilot/buildCallerCtx.js';
import { toAnthropicTools } from '../src/modules/copilot/providers/anthropicChatAdapter.js';

let app;
const prev = {
  enabled: env.EMBEDDED_COPILOT_ENABLED,
  storeCreate: env.EMBEDDED_COPILOT_WRITE_STORE_CREATE,
  storeUpdate: env.EMBEDDED_COPILOT_WRITE_STORE_UPDATE,
  storePublish: env.EMBEDDED_COPILOT_WRITE_STORE_PUBLISH,
  key: env.OPENAI_API_KEY,
};

beforeAll(async () => {
  env.EMBEDDED_COPILOT_ENABLED = 'true';
  env.EMBEDDED_COPILOT_WRITE_STORE_CREATE = 'false';
  env.EMBEDDED_COPILOT_WRITE_STORE_UPDATE = 'true';
  env.EMBEDDED_COPILOT_WRITE_STORE_PUBLISH = 'true';
  env.OPENAI_API_KEY = '';
  await connectTestDb();
  app = createApp();
});

afterAll(async () => {
  Object.assign(env, {
    EMBEDDED_COPILOT_ENABLED: prev.enabled,
    EMBEDDED_COPILOT_WRITE_STORE_CREATE: prev.storeCreate,
    EMBEDDED_COPILOT_WRITE_STORE_UPDATE: prev.storeUpdate,
    EMBEDDED_COPILOT_WRITE_STORE_PUBLISH: prev.storePublish,
    OPENAI_API_KEY: prev.key,
  });
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  clearTenantLimitCache();
  env.EMBEDDED_COPILOT_ENABLED = 'true';
  env.EMBEDDED_COPILOT_WRITE_STORE_CREATE = 'false';
  env.EMBEDDED_COPILOT_WRITE_STORE_UPDATE = 'true';
  env.EMBEDDED_COPILOT_WRITE_STORE_PUBLISH = 'true';
  env.OPENAI_API_KEY = '';
});

function adminTools() {
  return listOpenAiToolsForRole('company_admin').map((row) => row.function.name);
}

async function adminBundle(tenant) {
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
  return { token, ctx, user };
}

describe('copilot store update + publish writes (in-memory only)', () => {
  it('exposes prepare tools to Claude and keeps execute confirmation-gated', () => {
    const model = adminTools();
    expect(model).toEqual(expect.arrayContaining(['shops_prepare_update', 'shops_prepare_publish']));
    expect(model).not.toContain('shops_execute_update');
    expect(model).not.toContain('shops_execute_publish');
    const anthropic = toAnthropicTools(listOpenAiToolsForRole('company_admin')).map((t) => t.name);
    expect(anthropic).toEqual(expect.arrayContaining(['shops_prepare_update', 'shops_prepare_publish']));
    expect(anthropic).not.toContain('shops_execute_update');
    expect(anthropic).not.toContain('shops_execute_publish');
    expect(registeredToolNames()).toEqual(
      expect.arrayContaining([
        'shops_prepare_update',
        'shops_execute_update',
        'shops_prepare_publish',
        'shops_execute_publish',
      ]),
    );
  });

  it('company admin can update with cancel + idempotent execute', async () => {
    const tenant = await makeTenant();
    const { token, ctx } = await adminBundle(tenant);
    const shop = await makeShop(tenant, { name: 'Update Me', status: 'draft', currencyMode: 'points' });

    const prepared = await request(app)
      .post('/api/v1/copilot/writes/shops.update/prepare')
      .set(authHeader(token))
      .send({ shopId: String(shop._id), name: 'Updated Store' });
    expect(prepared.status).toBe(200);
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
    const first = await request(app)
      .post('/api/v1/copilot/writes/shops.update/execute')
      .set(authHeader(token))
      .send({
        shopId: String(shop._id),
        name: 'Updated Store',
        confirmationId: prepared2.body.confirmationId,
        idempotencyKey: 'store-update-idem-1',
      });
    expect(first.status).toBe(200);
    expect(first.body.name).toBe('Updated Store');

    const second = await request(app)
      .post('/api/v1/copilot/writes/shops.update/execute')
      .set(authHeader(token))
      .send({
        shopId: String(shop._id),
        name: 'Updated Store',
        confirmationId: prepared2.body.confirmationId,
        idempotencyKey: 'store-update-idem-1',
      });
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(await Shop.countDocuments({ tenantId: tenant._id, name: 'Updated Store' })).toBe(1);

    await expect(
      runCopilotTool(
        'shops_execute_update',
        ctx,
        {
          shopId: String(shop._id),
          name: 'Nope',
          confirmationId: 'x'.repeat(24),
          idempotencyKey: 'model-update-blocked',
        },
        'company_admin',
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects entity manager for store update', async () => {
    const tenant = await makeTenant();
    const wallet = await makeFundedWallet(tenant);
    const entity = await makeEntity(tenant, wallet);
    const admin = await makeUser(tenant, 'company_admin');
    const manager = await makeUser(tenant, 'entity_manager', 'entity', {
      assignedEntityIds: [entity._id],
      scopeId: entity._id,
    });
    const shop = await makeShop(tenant, { name: 'RBAC Update', status: 'draft', currencyMode: 'points' });

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
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).name).toBe('RBAC Update');
  });

  it('company admin can publish with cancel + idempotent execute', async () => {
    const tenant = await makeTenant();
    const { token, ctx } = await adminBundle(tenant);
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

    const prepared = await request(app)
      .post('/api/v1/copilot/writes/shops.publish/prepare')
      .set(authHeader(token))
      .send({ shopId: String(shop._id) });
    expect(prepared.status).toBe(200);
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).status).toBe('draft');

    const cancelled = await request(app)
      .post('/api/v1/copilot/writes/shops.publish/cancel')
      .set(authHeader(token))
      .send({ confirmationId: prepared.body.confirmationId });
    expect(cancelled.status).toBe(200);

    const prepared2 = await request(app)
      .post('/api/v1/copilot/writes/shops.publish/prepare')
      .set(authHeader(token))
      .send({ shopId: String(shop._id) });
    const first = await request(app)
      .post('/api/v1/copilot/writes/shops.publish/execute')
      .set(authHeader(token))
      .send({
        shopId: String(shop._id),
        confirmationId: prepared2.body.confirmationId,
        idempotencyKey: 'store-publish-idem-1',
      });
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('live');

    const second = await request(app)
      .post('/api/v1/copilot/writes/shops.publish/execute')
      .set(authHeader(token))
      .send({
        shopId: String(shop._id),
        confirmationId: prepared2.body.confirmationId,
        idempotencyKey: 'store-publish-idem-1',
      });
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
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

  it('successful update remount with a new idempotency key reconciles without rewriting', async () => {
    const tenant = await makeTenant();
    const { token } = await adminBundle(tenant);
    const shop = await makeShop(tenant, { name: 'Rename Source', status: 'draft', currencyMode: 'points' });

    const prepared = await request(app)
      .post('/api/v1/copilot/writes/shops.update/prepare')
      .set(authHeader(token))
      .send({ shopId: String(shop._id), name: 'Rename Target' });
    expect(prepared.status).toBe(200);

    const first = await request(app)
      .post('/api/v1/copilot/writes/shops.update/execute')
      .set(authHeader(token))
      .send({
        shopId: String(shop._id),
        name: 'Rename Target',
        confirmationId: prepared.body.confirmationId,
        idempotencyKey: 'store-update-first-confirm',
      });
    expect(first.status).toBe(200);
    expect(first.body.name).toBe('Rename Target');
    const afterFirst = await Shop.findOne({ _id: shop._id, tenantId: tenant._id });
    const updatedAtAfterFirst = afterFirst.updatedAt.getTime();

    // Remounted confirmation card generates a new idempotency key and retries.
    const remount = await request(app)
      .post('/api/v1/copilot/writes/shops.update/execute')
      .set(authHeader(token))
      .send({
        shopId: String(shop._id),
        name: 'Rename Target',
        confirmationId: prepared.body.confirmationId,
        idempotencyKey: 'store-update-remount-retry',
      });
    expect(remount.status).toBe(200);
    expect(remount.body.name).toBe('Rename Target');
    expect(remount.body.id).toBe(first.body.id);
    expect(await Shop.countDocuments({ tenantId: tenant._id, name: 'Rename Target' })).toBe(1);
    const afterRemount = await Shop.findOne({ _id: shop._id, tenantId: tenant._id });
    expect(afterRemount.updatedAt.getTime()).toBe(updatedAtAfterFirst);

    const resolved = await request(app)
      .post('/api/v1/copilot/writes/shops.update/resolve')
      .set(authHeader(token))
      .send({
        shopId: String(shop._id),
        name: 'Rename Target',
        confirmationId: prepared.body.confirmationId,
      });
    expect(resolved.status).toBe(200);
    expect(resolved.body.status).toBe('completed');
    expect(resolved.body.result.name).toBe('Rename Target');
  });

  it('rejects empty/invalid update bodies and no-op prepare without writing', async () => {
    const tenant = await makeTenant();
    const { token } = await adminBundle(tenant);
    const shop = await makeShop(tenant, { name: 'Valid Name', status: 'draft', currencyMode: 'points' });

    const invalidExecute = await request(app)
      .post('/api/v1/copilot/writes/shops.update/execute')
      .set(authHeader(token))
      .send({
        shopId: String(shop._id),
        confirmationId: 'c'.repeat(24),
        idempotencyKey: 'invalid-update-body',
      });
    expect(invalidExecute.status).toBe(400);
    expect(String(invalidExecute.body?.error?.message || '')).toMatch(/not valid/i);

    const noopPrepare = await request(app)
      .post('/api/v1/copilot/writes/shops.update/prepare')
      .set(authHeader(token))
      .send({ shopId: String(shop._id), name: 'Valid Name' });
    expect(noopPrepare.status).toBe(400);
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).name).toBe('Valid Name');
  });

  it('rejects entity manager for store publish', async () => {
    const tenant = await makeTenant();
    const wallet = await makeFundedWallet(tenant);
    const entity = await makeEntity(tenant, wallet);
    const admin = await makeUser(tenant, 'company_admin');
    const manager = await makeUser(tenant, 'entity_manager', 'entity', {
      assignedEntityIds: [entity._id],
      scopeId: entity._id,
    });
    const shop = await makeShop(tenant, {
      name: 'RBAC Publish',
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
});