import { createHash, randomBytes } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { AuditLog } from '../src/modules/auditLogs/auditLog.model.js';
import { OauthGrantBinding } from '../src/modules/oauth/oauthGrantBinding.model.js';
import { LOCAL_OAUTH_CLIENT_ID, LOCAL_OAUTH_REDIRECT_URI, mcpResourceUrl } from '../src/modules/oauth/oauth.config.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { authHeader, makeTenant, makeUser } from './helpers.js';
import {
  executeShopCreate,
  executeShopUpdate,
  prepareShopCreate,
  prepareShopUpdate,
  shopsExecuteUpdateInputSchema,
} from '../src/modules/mcp/shopsWrite.js';
import { prepareShopPublish } from '../src/modules/mcp/shopsPublishWrite.js';
import { listShops } from '../src/modules/mcp/shopsRead.js';
import { McpWriteConfirmation } from '../src/modules/mcp/mcpWriteConfirmation.model.js';

const PROTOCOL = '2026-07-28';
const READ_TOOLS = [
  'catalog_search',
  'catalog_get_product',
  'catalog_list_categories',
  'orders_search',
  'orders_get',
  'campaigns_search',
  'campaigns_get',
  'wallet_list_balances',
  'wallet_list_transactions',
  'employees_search',
  'employees_get',
  'points_summary',
  'gifts_search',
];
const PRIOR_WRITE_TOOLS = [
  'employees_prepare_create',
  'employees_execute_create',
  'employees_prepare_update',
  'employees_execute_update',
  'campaigns_prepare_points_draft',
  'campaigns_execute_points_draft',
];
const SHOP_TOOLS = [
  'shops_prepare_create',
  'shops_execute_create',
  'shops_prepare_update',
  'shops_execute_update',
];

let app;
let tenant;
let admin;

function s256(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

function mcpRequest(token, method, params = {}) {
  const req = request(app)
    .post('/mcp')
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .set('MCP-Protocol-Version', PROTOCOL)
    .set('mcp-method', method);
  if (typeof params.name === 'string') req.set('Mcp-Name', params.name);
  if (token) req.set(authHeader(token));
  return req.send({
    jsonrpc: '2.0',
    id: 1,
    method,
    params: {
      ...params,
      _meta: {
        'io.modelcontextprotocol/protocolVersion': PROTOCOL,
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    },
  });
}

function rpcBody(res) {
  if (res.body && typeof res.body === 'object' && res.body.jsonrpc) return res.body;
  const text = res.text || '';
  const line = text.split(/\r?\n/).find((row) => row.startsWith('data: '));
  if (!line) return null;
  return JSON.parse(line.slice('data: '.length));
}

async function issueOauth(session, scope) {
  const agent = request.agent(app);
  const verifier = randomBytes(32).toString('base64url');
  const started = await agent.get('/auth').redirects(0).query({
    client_id: LOCAL_OAUTH_CLIENT_ID,
    redirect_uri: LOCAL_OAUTH_REDIRECT_URI,
    response_type: 'code',
    scope,
    resource: mcpResourceUrl(),
    state: 'shops-write',
    code_challenge: s256(verifier),
    code_challenge_method: 'S256',
  });
  expect([302, 303]).toContain(started.status);
  const decision = await agent
    .post('/oauth/consent/decision')
    .set(authHeader(session.token))
    .send({ decision: 'allow', tenantId: String(tenant._id) });
  expect(decision.status, JSON.stringify(decision.body)).toBe(200);
  const resumed = await agent.get(new URL(decision.body.resumeUrl).pathname).redirects(0);
  const redirected = new URL(resumed.headers.location, 'http://127.0.0.1');
  const exchanged = await request(app).post('/token').type('form').send({
    grant_type: 'authorization_code',
    code: redirected.searchParams.get('code'),
    redirect_uri: LOCAL_OAUTH_REDIRECT_URI,
    client_id: LOCAL_OAUTH_CLIENT_ID,
    code_verifier: verifier,
    resource: mcpResourceUrl(),
  });
  expect(exchanged.status, JSON.stringify(exchanged.body)).toBe(200);
  return exchanged.body.access_token;
}

async function login(email, password) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken;
}

async function shopCount() {
  return Shop.countDocuments({ tenantId: tenant._id });
}

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});

afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  clearTenantLimitCache();
  tenant = await makeTenant({ slug: 'shops-write' });
  admin = await makeUser(tenant, 'company_admin', 'tenant');
});

describe('company store write service', () => {
  it('previews a draft store without writing, then creates it once', async () => {
    const input = {
      name: 'North Store',
      slug: 'north-store',
      currencyMode: 'points',
      companyEmailDomain: 'acme.com',
      pointsConversionEnabled: false,
      categories: ['Welcome'],
    };
    const prepared = await prepareShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
    });
    expect(await shopCount()).toBe(0);
    expect(prepared.preview).toMatchObject({
      action: 'create',
      name: 'North Store',
      slug: 'north-store',
      status: 'draft',
      currencyMode: 'points',
      companyEmailDomain: 'acme.com',
      categories: ['Welcome'],
      logoUrl: '',
      bannerConfig: { theme: 'dark', preset: 'solid-pattern' },
    });

    const created = await executeShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'shop-create-1',
    });
    expect(created).toMatchObject({
      name: 'North Store',
      slug: 'north-store',
      status: 'draft',
      currencyMode: 'points',
      companyEmailDomain: 'acme.com',
      logoUrl: '',
      bannerConfig: { theme: 'dark', preset: 'solid-pattern' },
    });
    expect((await Shop.findOne({ tenantId: tenant._id, name: 'North Store' })).bannerConfig)
      .toEqual({ theme: 'dark', preset: 'solid-pattern' });
    expect(await shopCount()).toBe(1);
    const replay = await executeShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'shop-create-1',
    });
    expect(replay.id).toBe(created.id);
    expect(await shopCount()).toBe(1);

    const again = await prepareShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
    });
    const reused = await executeShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: again.confirmationId,
      idempotencyKey: 'shop-create-2',
    });
    expect(reused.id).toBe(created.id);
    expect(await shopCount()).toBe(1);
    const audits = JSON.stringify(await AuditLog.find({ tenantId: tenant._id }).lean());
    expect(audits).toContain('shop.create');
    expect(audits).toContain('mcp_write.successful');
  });

  it('rejects invalid store input, other roles, and a second live store name', async () => {
    await expect(prepareShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Bad', slug: 'Not A Slug', currencyMode: 'points' },
    })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(prepareShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Banner', bannerConfig: { secret: 'no' }, status: 'live' },
    })).rejects.toMatchObject({ code: 'VALIDATION' });

    const manager = await makeUser(tenant, 'entity_manager', 'entity', {
      assignedEntityIds: [],
    });
    await expect(prepareShopCreate({
      tenantId: tenant._id,
      actorUserId: manager.user._id,
      input: { name: 'Manager Store' },
    })).rejects.toMatchObject({ status: 403 });
    const finance = await makeUser(tenant, 'company_finance_user', 'tenant');
    await expect(prepareShopCreate({
      tenantId: tenant._id,
      actorUserId: finance.user._id,
      input: { name: 'Finance Store' },
    })).rejects.toMatchObject({ status: 403 });

    await Shop.create({
      tenantId: tenant._id,
      name: 'Live Store',
      slug: 'live-store',
      status: 'live',
      categories: ['Welcome'],
    });
    await expect(prepareShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Live Store' },
    })).rejects.toMatchObject({ code: 'SHOP_EXISTS' });
    expect(await shopCount()).toBe(1);
  });

  it('previews text changes and rejects status, currency, and invalid banner edits', async () => {
    const shop = await Shop.create({
      tenantId: tenant._id,
      name: 'North Store',
      slug: 'north-store',
      currencyMode: 'points',
      companyEmailDomain: 'acme.com',
      categories: ['Welcome'],
      status: 'draft',
      bannerConfig: { theme: 'dark', preset: 'solid-pattern' },
    });
    const before = await shopCount();
    await expect(prepareShopUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id), status: 'live' },
    })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(prepareShopUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id), currencyMode: 'inr' },
    })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(prepareShopUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id), bannerConfig: { html: '<script>' } },
    })).rejects.toMatchObject({ code: 'VALIDATION' });
    const bannerPrepared = await prepareShopUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id), bannerConfig: { theme: 'brand', preset: 'welcome' } },
    });
    expect(bannerPrepared.preview.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'bannerConfig' }),
    ]));

    const input = { shopId: String(shop._id), name: 'North Outlet', companyEmailDomain: 'north.acme.com' };
    const prepared = await prepareShopUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
    });
    expect(await shopCount()).toBe(before);
    const stored = await Shop.findOne({ _id: shop._id, tenantId: tenant._id });
    expect(stored.name).toBe('North Store');
    expect(prepared.preview.changes).toEqual(expect.arrayContaining([
      { field: 'name', from: 'North Store', to: 'North Outlet' },
      { field: 'companyEmailDomain', from: 'acme.com', to: 'north.acme.com' },
    ]));

    const updated = await executeShopUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'shop-update-1',
    });
    expect(updated).toMatchObject({ id: String(shop._id), name: 'North Outlet', status: 'draft', currencyMode: 'points' });
    const replay = await executeShopUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'shop-update-1',
    });
    expect(replay.id).toBe(updated.id);
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).status).toBe('draft');
  });

    it('rejects an expired store-update confirmation', async () => {
    const shop = await Shop.create({
      tenantId: tenant._id,
      name: 'Expire Store',
      slug: 'expire-store',
      status: 'draft',
    });
    const input = { shopId: String(shop._id), name: 'Expire Store Renamed' };
    const prepared = await prepareShopUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
    });
    await McpWriteConfirmation.updateOne(
      { confirmationId: prepared.confirmationId, tenantId: tenant._id },
      { expiresAt: new Date(Date.now() - 60_000) },
    );
    await expect(executeShopUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'expired-shop-update',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_EXPIRED' });
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).name).toBe('Expire Store');
  });

    it('publishes shops_execute_update with confirmation fields in tools/list', async () => {
    const password = 'correct-horse';
    const email = `admin-${tenant.slug}@test.io`;
    admin = await makeUser(tenant, 'company_admin', 'tenant', { email, password });
    admin.token = await login(email, password);
    const writeToken = await issueOauth(admin, 'catalog:read shops:write');
    const listed = await mcpRequest(writeToken, 'tools/list', {});
    expect(listed.status).toBe(200);
    const tool = rpcBody(listed).result.tools.find((entry) => entry.name === 'shops_execute_update');
    expect(tool).toBeTruthy();
    const schema = tool.inputSchema;
    expect(schema.allOf).toBeUndefined();
    expect(schema.properties.confirmationId).toBeTruthy();
    expect(schema.properties.idempotencyKey).toBeTruthy();
    expect(schema.properties.shopId).toBeTruthy();
    expect(schema.properties.name).toBeTruthy();
  });

  it('publishes a flat execute-update schema that accepts confirmation fields', () => {
    const parsed = shopsExecuteUpdateInputSchema.safeParse({
      shopId: '6ae8883aa39e25f324f9883c',
      name: 'MCP QA Store Updated',
      confirmationId: 'c'.repeat(32),
      idempotencyKey: 'idem-key-1',
    });
    expect(parsed.success).toBe(true);
    expect(shopsExecuteUpdateInputSchema.safeParse({
      shopId: '6ae8883aa39e25f324f9883c',
      name: 'MCP QA Store Updated',
    }).success).toBe(false);
  });

it('rejects stale, cross-tenant, and concurrent store writes', async () => {
    const shop = await Shop.create({
      tenantId: tenant._id,
      name: 'North Store',
      slug: 'north-store',
      status: 'draft',
    });
    const staleInput = { shopId: String(shop._id), name: 'Edited' };
    const stale = await prepareShopUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: staleInput,
    });
    shop.name = 'Someone else';
    await shop.save();
    await expect(executeShopUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: staleInput,
      confirmationId: stale.confirmationId,
      idempotencyKey: 'stale-shop',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).name).toBe('Someone else');

    const other = await makeTenant({ slug: 'other-shops' });
    const outsider = await makeUser(other, 'company_admin', 'tenant');
    const foreign = await Shop.create({
      tenantId: other._id,
      name: 'Foreign',
      slug: 'foreign-store',
      status: 'draft',
    });
    await expect(prepareShopUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(foreign._id), name: 'Stolen' },
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const owned = await prepareShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Owned Store', slug: 'owned-store' },
    });
    await expect(executeShopCreate({
      tenantId: other._id,
      actorUserId: outsider.user._id,
      input: { name: 'Owned Store', slug: 'owned-store' },
      confirmationId: owned.confirmationId,
      idempotencyKey: 'cross-shop',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_INVALID' });

    const raced = await prepareShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Race Store', slug: 'race-store' },
    });
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => executeShopCreate({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: { name: 'Race Store', slug: 'race-store' },
        confirmationId: raced.confirmationId,
        idempotencyKey: 'race-shop',
      })),
    );
    expect(await Shop.countDocuments({ tenantId: tenant._id, name: 'Race Store' })).toBe(1);
    const fulfilled = results.filter((entry) => entry.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    expect(new Set(fulfilled.map((entry) => entry.value.id)).size).toBe(1);
  });
});

describe('company store MCP tools', () => {
    it('accepts confirmationId through MCP shops_execute_update', async () => {
    const password = 'correct-horse';
    const email = `admin-${tenant.slug}@test.io`;
    admin = await makeUser(tenant, 'company_admin', 'tenant', { email, password });
    admin.token = await login(email, password);
    const shop = await Shop.create({
      tenantId: tenant._id,
      name: 'MCP QA Store',
      slug: 'mcp-qa-store',
      currencyMode: 'points',
      companyEmailDomain: 'acme.com',
      categories: ['Welcome'],
      status: 'draft',
    });
    const writeToken = await issueOauth(admin, 'catalog:read shops:write');
    const prepared = await mcpRequest(writeToken, 'tools/call', {
      name: 'shops_prepare_update',
      arguments: { shopId: String(shop._id), name: 'MCP QA Store Updated' },
    });
    expect(prepared.status).toBe(200);
    const preview = rpcBody(prepared).result;
    expect(preview.isError).not.toBe(true);
    expect(preview.structuredContent.preview.changes).toEqual([
      { field: 'name', from: 'MCP QA Store', to: 'MCP QA Store Updated' },
    ]);
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).name).toBe('MCP QA Store');

    const updated = await mcpRequest(writeToken, 'tools/call', {
      name: 'shops_execute_update',
      arguments: {
        shopId: String(shop._id),
        name: 'MCP QA Store Updated',
        confirmationId: preview.structuredContent.confirmationId,
        idempotencyKey: 'mcp-shop-update-1',
      },
    });
    expect(updated.status).toBe(200);
    const body = rpcBody(updated).result;
    expect(body.isError).not.toBe(true);
    expect(body.structuredContent).toMatchObject({
      id: String(shop._id),
      name: 'MCP QA Store Updated',
      slug: 'mcp-qa-store',
      status: 'draft',
      currencyMode: 'points',
      companyEmailDomain: 'acme.com',
      categories: ['Welcome'],
    });

    const replay = await mcpRequest(writeToken, 'tools/call', {
      name: 'shops_execute_update',
      arguments: {
        shopId: String(shop._id),
        name: 'MCP QA Store Updated',
        confirmationId: preview.structuredContent.confirmationId,
        idempotencyKey: 'mcp-shop-update-1',
      },
    });
    expect(rpcBody(replay).result.isError).not.toBe(true);
    expect(rpcBody(replay).result.structuredContent.name).toBe('MCP QA Store Updated');
    expect(await Shop.countDocuments({ tenantId: tenant._id, _id: shop._id })).toBe(1);

    const mismatched = await mcpRequest(writeToken, 'tools/call', {
      name: 'shops_execute_update',
      arguments: {
        shopId: String(shop._id),
        name: 'Different Name',
        confirmationId: preview.structuredContent.confirmationId,
        idempotencyKey: 'mcp-shop-update-mismatch',
      },
    });
    const mismatchBody = rpcBody(mismatched).result;
    expect(mismatchBody.isError).toBe(true);
    expect(JSON.stringify(mismatchBody)).toMatch(/confirmation|payload|invalid|stale|mismatch/i);
    const stored = await Shop.findOne({ _id: shop._id, tenantId: tenant._id }).lean();
    expect(stored.name).toBe('MCP QA Store Updated');
    expect(stored.status).toBe('draft');
    expect(stored.slug).toBe('mcp-qa-store');
    expect(stored.currencyMode).toBe('points');
  });

it('blocks entity managers from creating, updating, publishing, or deleting stores', async () => {
  const manager = await makeUser(tenant, 'entity_manager', 'entity', { assignedEntityIds: [] });
  await expect(prepareShopCreate({
    tenantId: tenant._id,
    actorUserId: manager.user._id,
    input: { name: 'Manager Store', currencyMode: 'inr' },
  })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  expect(await shopCount()).toBe(0);

  const prepared = await prepareShopCreate({
    tenantId: tenant._id,
    actorUserId: admin.user._id,
    input: { name: 'Admin Store', currencyMode: 'inr' },
  });
  await expect(executeShopCreate({
    tenantId: tenant._id,
    actorUserId: manager.user._id,
    input: { name: 'Admin Store', currencyMode: 'inr' },
    confirmationId: prepared.confirmationId,
    idempotencyKey: 'manager-stolen-confirm',
  })).rejects.toMatchObject({ code: 'CONFIRMATION_INVALID' });
  expect(await shopCount()).toBe(0);

  await McpWriteConfirmation.updateOne(
    { confirmationId: prepared.confirmationId, tenantId: tenant._id },
    { $set: { actorUserId: manager.user._id } },
  );
  await expect(executeShopCreate({
    tenantId: tenant._id,
    actorUserId: manager.user._id,
    input: { name: 'Admin Store', currencyMode: 'inr' },
    confirmationId: prepared.confirmationId,
    idempotencyKey: 'manager-own-confirm',
  })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  expect(await shopCount()).toBe(0);

  const other = await makeTenant({ slug: 'shops-other' });
  const outsider = await makeUser(other, 'entity_manager', 'entity', { assignedEntityIds: [] });
  await expect(prepareShopCreate({
    tenantId: tenant._id,
    actorUserId: outsider.user._id,
    input: { name: 'Foreign Store' },
  })).rejects.toMatchObject({ code: 'ACTOR_INACTIVE' });
  await expect(executeShopCreate({
    tenantId: tenant._id,
    actorUserId: outsider.user._id,
    input: { name: 'Admin Store', currencyMode: 'inr' },
    confirmationId: prepared.confirmationId,
    idempotencyKey: 'outsider-confirm',
  })).rejects.toMatchObject({ code: 'ACTOR_INACTIVE' });
  expect(await shopCount()).toBe(0);

  const shop = await Shop.create({
    tenantId: tenant._id,
    name: 'Readable Store',
    slug: 'readable-store',
    status: 'draft',
    categories: ['Merch'],
  });
  const listed = await listShops({ tenantId: tenant._id, actorUserId: manager.user._id, input: {} });
  expect(listed.shops.map((row) => row.name)).toContain('Readable Store');

  await expect(prepareShopUpdate({
    tenantId: tenant._id,
    actorUserId: manager.user._id,
    input: { shopId: String(shop._id), name: 'Hijacked' },
  })).rejects.toMatchObject({ status: 403 });
  await expect(prepareShopPublish({
    tenantId: tenant._id,
    actorUserId: manager.user._id,
    input: { shopId: String(shop._id) },
  })).rejects.toMatchObject({ status: 403 });

  const removed = await request(app)
    .delete(`/api/v1/shops/${shop._id}`)
    .set(authHeader(manager.token));
  expect(removed.status).toBe(403);
  const stored = await Shop.findOne({ _id: shop._id, tenantId: tenant._id });
  expect(stored.name).toBe('Readable Store');
  expect(stored.status).toBe('draft');
});

it('keeps shops:write off the initial challenge and creates a draft through the tools', async () => {
    const password = 'correct-horse';
    const email = `admin-${tenant.slug}@test.io`;
    admin = await makeUser(tenant, 'company_admin', 'tenant', { email, password });
    admin.token = await login(email, password);

    const anonymous = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(anonymous.headers['www-authenticate']).toContain('catalog:read');
    expect(anonymous.headers['www-authenticate']).not.toContain('shops:write');
    const metadata = await request(app).get('/.well-known/oauth-protected-resource/mcp');
    expect(metadata.body.scopes_supported).not.toContain('shops:write');
    const discovery = await request(app).get('/.well-known/oauth-authorization-server');
    expect(discovery.body.scopes_supported).toContain('shops:write');

    const readOnly = await issueOauth(admin, 'catalog:read');
    const readBinding = await OauthGrantBinding.findOne({ userId: admin.user._id, scopes: 'catalog:read' }).lean();
    expect(readBinding.scopes).toEqual(['catalog:read']);
    const denied = await mcpRequest(readOnly, 'tools/call', {
      name: 'shops_prepare_create',
      arguments: { name: 'Denied Store' },
    });
    expect(denied.status).toBe(403);
    expect(`${denied.headers['www-authenticate'] || ''} ${JSON.stringify(denied.body)}`).toContain('shops:write');
    expect(await shopCount()).toBe(0);

    const writeToken = await issueOauth(admin, 'catalog:read shops:write');
    const writeBinding = await OauthGrantBinding.findOne({ userId: admin.user._id, scopes: 'shops:write' }).lean();
    expect(writeBinding.scopes).toEqual(['catalog:read', 'shops:write']);
    const listed = rpcBody(await mcpRequest(writeToken, 'tools/list')).result;
    const names = listed.tools.map((tool) => tool.name);
    for (const tool of READ_TOOLS) expect(names).toContain(tool);
    for (const tool of PRIOR_WRITE_TOOLS) expect(names).toContain(tool);
    for (const tool of SHOP_TOOLS) expect(names).toContain(tool);

    const prepared = await mcpRequest(writeToken, 'tools/call', {
      name: 'shops_prepare_create',
      arguments: { name: 'Tool Store', slug: 'tool-store', companyEmailDomain: 'acme.com' },
    });
    expect(prepared.status).toBe(200);
    const preview = rpcBody(prepared).result;
    expect(preview.isError).not.toBe(true);
    expect(await shopCount()).toBe(0);
    const confirmationId = preview.structuredContent.confirmationId;
    const created = await mcpRequest(writeToken, 'tools/call', {
      name: 'shops_execute_create',
      arguments: {
        name: 'Tool Store',
        slug: 'tool-store',
        companyEmailDomain: 'acme.com',
        confirmationId,
        idempotencyKey: 'tool-shop-1',
      },
    });
    expect(created.status).toBe(200);
    const body = rpcBody(created).result;
    expect(body.isError).not.toBe(true);
    expect(body.structuredContent).toMatchObject({ name: 'Tool Store', slug: 'tool-store', status: 'draft' });
    expect(await shopCount()).toBe(1);
  });
});
