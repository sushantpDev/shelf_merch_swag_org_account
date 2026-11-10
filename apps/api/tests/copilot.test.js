import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { authHeader, makeTenant, makeUser, makeFundedWallet, makeEntity } from './helpers.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { buildCopilotToolCtx } from '../src/modules/copilot/buildCallerCtx.js';
import { runDirectToolTurn, createConversation } from '../src/modules/copilot/copilotChat.service.js';
import { registeredToolNames, runCopilotTool } from '../src/modules/copilot/copilotTools.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';
import { hidesOrganizationWallet } from '../src/modules/mcp/walletVisibility.js';

let app;
const prev = {
  enabled: env.EMBEDDED_COPILOT_ENABLED,
  key: env.OPENAI_API_KEY,
};

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
  env.OPENAI_API_KEY = '';
});

async function seedApparel() {
  await CatalogProduct.create({
    sku: 'TEE-1',
    name: 'Classic Tee',
    brand: 'Shelf',
    category: 'Apparel',
    subcategory: 'T-Shirts',
    basePriceInr: 599,
    gstRate: 18,
    moq: 1,
    status: 'active',
    primaryImageUrl: 'https://cdn.example/tee.png',
    variants: [{ sku: 'TEE-1-M', color: 'Navy', size: 'M', stock: 12 }],
  });
}

describe('embedded copilot', () => {
  it('rejects unauthenticated status', async () => {
    const res = await request(app).get('/api/v1/copilot/status');
    expect(res.status).toBe(401);
  });

  it('returns status with capabilities for company admin when enabled', async () => {
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin');
    const res = await request(app).get('/api/v1/copilot/status').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.provider).toBe('disabled');
    expect(res.body.writeToolsEnabled).toBe(false);
    expect(res.body.discovery.categories).toHaveLength(6);
    const actions = res.body.discovery.categories.flatMap(category => category.actions);
    expect(actions.find(action => action.id === 'stores_create')).toMatchObject({ availability: 'integration_pending' });
    expect(actions.find(action => action.id === 'stores_create')).not.toHaveProperty('prompt');
    expect(res.body.capabilities.some((c) => c.id === 'explore_catalog')).toBe(true);
    expect(res.body.capabilities.some((c) => /create store/i.test(c.title))).toBe(false);
    expect(res.body.allowlistedTools).toEqual(expect.arrayContaining(['catalog_search', 'catalog_get_product']));
    expect(res.body.allowlistedTools.every((name) => !String(name).includes('execute'))).toBe(true);
  });

  it('hides create-store style capabilities for entity managers and keeps budget card', async () => {
    const tenant = await makeTenant();
    const wallet = await makeFundedWallet(tenant);
    const entity = await makeEntity(tenant, wallet);
    const { token } = await makeUser(tenant, 'entity_manager', 'entity', {
      assignedEntityIds: [entity._id],
      scopeId: entity._id,
    });
    const res = await request(app).get('/api/v1/copilot/status').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.capabilities.some((c) => c.id === 'check_budget')).toBe(true);
    expect(res.body.capabilities.every((c) => !/create store/i.test(c.title))).toBe(true);
    const ids = res.body.discovery.categories.flatMap(category => category.actions.map(action => action.id));
    expect(ids).not.toContain('stores_create');
    expect(ids).not.toContain('wallet_activity');
    expect(ids).not.toContain('wallet_fund');
  });

  it('scopes conversations to the authenticated user', async () => {
    const tenant = await makeTenant();
    const a = await makeUser(tenant, 'company_admin');
    const b = await makeUser(tenant, 'company_admin');
    const createA = await request(app)
      .post('/api/v1/copilot/conversations')
      .set(authHeader(a.token))
      .send({ title: 'A only' });
    expect(createA.status).toBe(201);

    const listB = await request(app).get('/api/v1/copilot/conversations').set(authHeader(b.token));
    expect(listB.status).toBe(200);
    expect(listB.body.items).toEqual([]);

    const getB = await request(app)
      .get(`/api/v1/copilot/conversations/${createA.body.id}`)
      .set(authHeader(b.token));
    expect(getB.status).toBe(404);
  });

  it('catalog_search tool returns real apparel inventory artifacts', async () => {
    await seedApparel();
    const tenant = await makeTenant();
    const { user, assignment } = await makeUser(tenant, 'company_admin');
    const ctx = buildCopilotToolCtx({
      user: {
        userId: user._id,
        role: assignment.role,
        scopeType: assignment.scopeType,
        scopeId: assignment.scopeId,
        assignedEntityIds: assignment.assignedEntityIds,
      },
      tenantId: tenant._id,
    });
    const { result, artifacts } = await runCopilotTool(
      'catalog_search',
      ctx,
      { query: 'Tee', category: 'Apparel', limit: 5 },
      'company_admin',
    );
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0].name).toBe('Classic Tee');
    expect(result.items[0].sellingPriceInr).toBe(599);
    expect(result.items[0].primaryImageUrl).toContain('tee.png');
    expect(artifacts[0].kind).toBe('product');
  });

  it('entity manager wallet balances hide organization cash via existing handler', async () => {
    const tenant = await makeTenant();
    const wallet = await makeFundedWallet(tenant);
    const entity = await makeEntity(tenant, wallet);
    const { user, assignment } = await makeUser(tenant, 'entity_manager', 'entity', {
      assignedEntityIds: [entity._id],
      scopeId: entity._id,
    });
    expect(
      hidesOrganizationWallet({
        role: assignment.role,
        assignedEntityIds: assignment.assignedEntityIds.map(String),
      }),
    ).toBe(true);

    const ctx = buildCopilotToolCtx({
      user: {
        userId: user._id,
        role: assignment.role,
        scopeType: assignment.scopeType,
        scopeId: assignment.scopeId,
        assignedEntityIds: assignment.assignedEntityIds,
      },
      tenantId: tenant._id,
    });
    const { result } = await runCopilotTool('wallet_list_balances', ctx, {}, 'entity_manager');
    expect(result.items).toEqual([]);
    expect(result.scope).toBe('department');
  });

  it('rejects unknown / write tool names', async () => {
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
    await expect(runCopilotTool('campaigns_execute_launch', ctx, {}, 'company_admin')).rejects.toMatchObject({
      status: 403,
    });
    expect(registeredToolNames().some((n) => n.includes('execute'))).toBe(false);
  });

  it('direct tool turn persists assistant artifacts on the conversation', async () => {
    await seedApparel();
    const tenant = await makeTenant();
    const { user, assignment } = await makeUser(tenant, 'company_admin');
    const conversation = await createConversation({
      tenantId: tenant._id,
      userId: user._id,
      title: 'Apparel',
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
    const { artifacts } = await runDirectToolTurn({
      tenantId: tenant._id,
      userId: user._id,
      role: 'company_admin',
      conversationId: conversation._id,
      toolName: 'catalog_search',
      toolArgs: { category: 'Apparel', limit: 3 },
      toolCtx: ctx,
    });
    expect(artifacts.length).toBeGreaterThan(0);
    const saved = await CopilotConversation.findById(conversation._id).lean();
    expect(saved.messages.some((m) => m.role === 'assistant' && m.artifacts?.length)).toBe(true);
  });

  it('chat messages return PROVIDER_DISABLED when OpenAI key is missing', async () => {
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin');
    const created = await request(app)
      .post('/api/v1/copilot/conversations')
      .set(authHeader(token))
      .send({});
    expect(created.status).toBe(201);

    const res = await request(app)
      .post(`/api/v1/copilot/conversations/${created.body.id}/messages`)
      .set(authHeader(token))
      .send({ content: 'Show apparel products' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('PROVIDER_DISABLED');
  });
});
