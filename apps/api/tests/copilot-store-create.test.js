import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { authHeader, makeTenant, makeUser, makeFundedWallet, makeEntity } from './helpers.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import {
  registeredToolNames,
  runCopilotTool,
  listOpenAiToolsForRole,
} from '../src/modules/copilot/copilotTools.js';
import { buildCopilotToolCtx } from '../src/modules/copilot/buildCallerCtx.js';
import { discoveryForUser } from '../src/modules/copilot/copilotDiscovery.js';

let app;
const prev = {
  enabled: env.EMBEDDED_COPILOT_ENABLED,
  writeStoreCreate: env.EMBEDDED_COPILOT_WRITE_STORE_CREATE,
  key: env.OPENAI_API_KEY,
};

beforeAll(async () => {
  env.EMBEDDED_COPILOT_ENABLED = 'true';
  env.EMBEDDED_COPILOT_WRITE_STORE_CREATE = 'true';
  env.OPENAI_API_KEY = '';
  await connectTestDb();
  app = createApp();
});

afterAll(async () => {
  env.EMBEDDED_COPILOT_ENABLED = prev.enabled;
  env.EMBEDDED_COPILOT_WRITE_STORE_CREATE = prev.writeStoreCreate;
  env.OPENAI_API_KEY = prev.key;
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  clearTenantLimitCache();
  env.EMBEDDED_COPILOT_ENABLED = 'true';
  env.EMBEDDED_COPILOT_WRITE_STORE_CREATE = 'true';
  env.OPENAI_API_KEY = '';
});

describe('copilot create store write (in-memory only)', () => {
  it('exposes prepare to the model but keeps execute confirmation-gated', () => {
    expect(registeredToolNames()).toEqual(
      expect.arrayContaining(['shops_prepare_create', 'shops_execute_create']),
    );
    const modelTools = listOpenAiToolsForRole('company_admin').map((row) => row.function.name);
    expect(modelTools).toContain('shops_prepare_create');
    expect(modelTools).not.toContain('shops_execute_create');
    const discovery = discoveryForUser({ role: 'company_admin', scopeType: 'tenant' });
    expect(
      discovery.categories.flatMap((c) => c.actions).find((a) => a.id === 'stores_create'),
    ).toMatchObject({ availability: 'available' });
  });

  it('lets company admin prepare and execute create store via authenticated endpoints', async () => {
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin');

    const prepared = await request(app)
      .post('/api/v1/copilot/writes/shops/create/prepare')
      .set(authHeader(token))
      .send({ name: 'Copilot Store', currencyMode: 'points' });

    expect(prepared.status).toBe(200);
    expect(prepared.body.confirmationId).toBeTruthy();
    expect(prepared.body.preview.status).toBe('live');
    expect(await Shop.countDocuments({ tenantId: tenant._id })).toBe(0);

    const executed = await request(app)
      .post('/api/v1/copilot/writes/shops/create/execute')
      .set(authHeader(token))
      .send({
        name: 'Copilot Store',
        currencyMode: 'points',
        confirmationId: prepared.body.confirmationId,
        idempotencyKey: 'copilot-store-create-1',
      });

    expect(executed.status).toBe(200);
    expect(executed.body.status).toBe('live');
    expect(executed.body.name).toBe('Copilot Store');
    expect(await Shop.countDocuments({ tenantId: tenant._id })).toBe(1);
  });

  it('rejects entity manager prepare and execute', async () => {
    const tenant = await makeTenant();
    const wallet = await makeFundedWallet(tenant);
    const entity = await makeEntity(tenant, wallet);
    const admin = await makeUser(tenant, 'company_admin');
    const manager = await makeUser(tenant, 'entity_manager', 'entity', {
      assignedEntityIds: [entity._id],
      scopeId: entity._id,
    });

    const deniedPrepare = await request(app)
      .post('/api/v1/copilot/writes/shops/create/prepare')
      .set(authHeader(manager.token))
      .send({ name: 'Manager Store', currencyMode: 'inr' });
    expect(deniedPrepare.status).toBe(403);

    const prepared = await request(app)
      .post('/api/v1/copilot/writes/shops/create/prepare')
      .set(authHeader(admin.token))
      .send({ name: 'Admin Store', currencyMode: 'inr' });
    expect(prepared.status).toBe(200);

    const deniedExecute = await request(app)
      .post('/api/v1/copilot/writes/shops/create/execute')
      .set(authHeader(manager.token))
      .send({
        name: 'Admin Store',
        currencyMode: 'inr',
        confirmationId: prepared.body.confirmationId,
        idempotencyKey: 'manager-steal',
      });
    expect([403, 404]).toContain(deniedExecute.status);
    expect(await Shop.countDocuments({ tenantId: tenant._id })).toBe(0);
  });

  it('cancel leaves no store written', async () => {
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin');
    const prepared = await request(app)
      .post('/api/v1/copilot/writes/shops/create/prepare')
      .set(authHeader(token))
      .send({ name: 'Cancelled Store', currencyMode: 'points' });
    expect(prepared.status).toBe(200);

    const cancelled = await request(app)
      .post('/api/v1/copilot/writes/shops/create/cancel')
      .set(authHeader(token))
      .send({ confirmationId: prepared.body.confirmationId });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('cancelled');
    expect(await Shop.countDocuments({ tenantId: tenant._id })).toBe(0);

    const afterCancel = await request(app)
      .post('/api/v1/copilot/writes/shops/create/execute')
      .set(authHeader(token))
      .send({
        name: 'Cancelled Store',
        currencyMode: 'points',
        confirmationId: prepared.body.confirmationId,
        idempotencyKey: 'after-cancel',
      });
    expect([409, 410, 400, 422]).toContain(afterCancel.status);
    expect(await Shop.countDocuments({ tenantId: tenant._id })).toBe(0);
  });

  it('duplicate execute with the same idempotency key does not create a second store', async () => {
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin');
    const prepared = await request(app)
      .post('/api/v1/copilot/writes/shops/create/prepare')
      .set(authHeader(token))
      .send({ name: 'Idempotent Store', currencyMode: 'points' });

    const first = await request(app)
      .post('/api/v1/copilot/writes/shops/create/execute')
      .set(authHeader(token))
      .send({
        name: 'Idempotent Store',
        currencyMode: 'points',
        confirmationId: prepared.body.confirmationId,
        idempotencyKey: 'dup-key-1',
      });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/v1/copilot/writes/shops/create/execute')
      .set(authHeader(token))
      .send({
        name: 'Idempotent Store',
        currencyMode: 'points',
        confirmationId: prepared.body.confirmationId,
        idempotencyKey: 'dup-key-1',
      });
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(await Shop.countDocuments({ tenantId: tenant._id })).toBe(1);
  });

  it('model tool path can prepare but cannot execute directly', async () => {
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
    const { result } = await runCopilotTool(
      'shops_prepare_create',
      ctx,
      { name: 'Tool Path Store', currencyMode: 'points' },
      'company_admin',
    );
    expect(result.confirmationId).toBeTruthy();
    await expect(
      runCopilotTool(
        'shops_execute_create',
        ctx,
        {
          name: 'Tool Path Store',
          currencyMode: 'points',
          confirmationId: result.confirmationId,
          idempotencyKey: 'model-execute-blocked',
        },
        'company_admin',
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(await Shop.countDocuments({ tenantId: tenant._id })).toBe(0);
  });

  it('status reports writeToolsEnabled when store-create write flag is on', async () => {
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin');
    const res = await request(app).get('/api/v1/copilot/status').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.writeToolsEnabled).toBe(true);
    expect(res.body.allowlistedTools).toEqual(expect.arrayContaining(['shops_prepare_create']));
  });
});
