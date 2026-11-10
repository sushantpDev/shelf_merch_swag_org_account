import { createHash, randomBytes } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { AuditLog } from '../src/modules/auditLogs/auditLog.model.js';
import { OauthGrantBinding } from '../src/modules/oauth/oauthGrantBinding.model.js';
import { McpWriteConfirmation } from '../src/modules/mcp/mcpWriteConfirmation.model.js';
import { LOCAL_OAUTH_CLIENT_ID, LOCAL_OAUTH_REDIRECT_URI, mcpResourceUrl } from '../src/modules/oauth/oauth.config.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { authHeader, makeTenant, makeUser } from './helpers.js';
import {
  executeShopPublish,
  prepareShopPublish,
} from '../src/modules/mcp/shopsPublishWrite.js';

const PROTOCOL = '2026-07-28';

let app;
let tenant;
let admin;
let shop;
let otherShop;

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
    state: 'shops-publish',
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

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});

afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  clearTenantLimitCache();
  tenant = await makeTenant({ slug: 'shops-publish' });
  admin = await makeUser(tenant, 'company_admin', 'tenant');
  shop = await Shop.create({
    tenantId: tenant._id,
    name: 'MCP QA Store Updated',
    slug: `mcp-qa-${Date.now()}`,
    status: 'draft',
    currencyMode: 'points',
    categories: ['Welcome'],
    logoUrl: 'https://cdn.test/logo.png',
    companyEmailDomain: 'acme.com',
    activeListingKeys: ['col1:prod1', 'col1:prod2'],
  });
  otherShop = await Shop.create({
    tenantId: tenant._id,
    name: 'Other Draft Store',
    slug: `other-${Date.now()}`,
    status: 'draft',
    currencyMode: 'points',
    categories: ['Kits'],
    activeListingKeys: ['keep:listing'],
  });
});

describe('store publish service', () => {
  it('publishes a draft store to live and preserves catalog listings', async () => {
    const prepared = await prepareShopPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id) },
    });
    expect(prepared.preview).toMatchObject({
      action: 'publish',
      shopId: String(shop._id),
      name: 'MCP QA Store Updated',
      status: 'draft',
      currencyMode: 'points',
      categories: ['Welcome'],
      readiness: {
        hasLogo: true,
        hasCompanyEmailDomain: true,
        categoriesReady: true,
        activeProductCount: 2,
      },
      missingRequirements: [],
    });
    expect(prepared.preview.effects.some((line) => /draft to live/i.test(line))).toBe(true);
    expect(prepared.confirmationId).toBeTruthy();
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).status).toBe('draft');

    const published = await executeShopPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id) },
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'shop-publish-1',
    });
    expect(published).toMatchObject({
      id: String(shop._id),
      name: 'MCP QA Store Updated',
      status: 'live',
      currencyMode: 'points',
      activeProductCount: 2,
      alreadyLive: false,
    });
    expect(published.storefrontUrl).toMatch(new RegExp('/s/' + shop.slug + '$'));

    const stored = await Shop.findOne({ _id: shop._id, tenantId: tenant._id });
    expect(stored.status).toBe('live');
    expect(stored.currencyMode).toBe('points');
    expect(stored.activeListingKeys).toEqual(['col1:prod1', 'col1:prod2']);

    const untouched = await Shop.findOne({ _id: otherShop._id, tenantId: tenant._id });
    expect(untouched.status).toBe('draft');
    expect(untouched.activeListingKeys).toEqual(['keep:listing']);

    const replay = await executeShopPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id) },
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'shop-publish-1',
    });
    expect(replay.id).toBe(published.id);
    expect(replay.status).toBe('live');
    expect(await Shop.countDocuments({ tenantId: tenant._id, status: 'live' })).toBe(1);
  });

  it('resolves a unique store by name and asks when the name is ambiguous', async () => {
    await Shop.create({
      tenantId: tenant._id,
      name: 'MCP QA Store Updated',
      slug: `dup-${Date.now()}`,
      status: 'draft',
      categories: ['Welcome'],
    });

    await expect(prepareShopPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'MCP QA Store Updated' },
    })).rejects.toMatchObject({ code: 'SHOP_AMBIGUOUS' });

    const prepared = await prepareShopPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Other Draft Store' },
    });
    expect(prepared.preview.shopId).toBe(String(otherShop._id));
    const published = await executeShopPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Other Draft Store' },
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'shop-publish-by-name',
    });
    expect(published.id).toBe(String(otherShop._id));
    expect(published.status).toBe('live');
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).status).toBe('draft');
  });

  it('rejects missing categories without publishing', async () => {
    shop.categories = [];
    await shop.save();
    await expect(prepareShopPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id) },
    })).rejects.toMatchObject({ code: 'SHOP_NO_CATEGORIES' });
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).status).toBe('draft');
  });

  it('previews an already-live store as a no-op publish', async () => {
    shop.status = 'live';
    await shop.save();
    const prepared = await prepareShopPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id) },
    });
    expect(prepared.preview.action).toBe('already_live');
    const published = await executeShopPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id) },
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'shop-publish-live',
    });
    expect(published).toMatchObject({ status: 'live', alreadyLive: true, activeProductCount: 2 });
    expect((await Shop.findOne({ _id: otherShop._id, tenantId: tenant._id })).status).toBe('draft');
  });

  it('rejects expired or mismatched confirmations and stale store state', async () => {
    const prepared = await prepareShopPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id) },
    });

    await expect(executeShopPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id) },
      confirmationId: 'not-a-real-confirmation-id-xxxxx',
      idempotencyKey: 'shop-publish-invalid',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_INVALID' });

    await McpWriteConfirmation.updateOne(
      { confirmationId: prepared.confirmationId, tenantId: tenant._id },
      { $set: { expiresAt: new Date(0) } },
    );
    await expect(executeShopPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id) },
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'shop-publish-expired',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_EXPIRED' });
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).status).toBe('draft');

    const fresh = await prepareShopPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id) },
    });
    shop.name = 'Renamed After Prepare';
    await shop.save();
    await expect(executeShopPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id) },
      confirmationId: fresh.confirmationId,
      idempotencyKey: 'shop-publish-stale',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).status).toBe('draft');
    expect((await Shop.findOne({ _id: otherShop._id, tenantId: tenant._id })).status).toBe('draft');
  });

  it('rejects unauthorized roles and cross-tenant access', async () => {
    const manager = await makeUser(tenant, 'entity_manager', 'entity', { assignedEntityIds: [] });
    await expect(prepareShopPublish({
      tenantId: tenant._id,
      actorUserId: manager.user._id,
      input: { shopId: String(shop._id) },
    })).rejects.toMatchObject({ status: 403 });

    const other = await makeTenant({ slug: 'shops-publish-other' });
    const outsider = await makeUser(other, 'company_admin', 'tenant');
    await expect(prepareShopPublish({
      tenantId: other._id,
      actorUserId: outsider.user._id,
      input: { shopId: String(shop._id) },
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).status).toBe('draft');
  });
  it('allows optional branding and an empty catalog when categories exist', async () => {
    shop.logoUrl = '';
    shop.companyEmailDomain = '';
    shop.bannerConfig = {};
    shop.activeListingKeys = [];
    shop.selectedCatalogProductIds = [];
    await shop.save();

    const prepared = await prepareShopPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id) },
    });
    expect(prepared.preview.readiness).toMatchObject({
      hasLogo: false,
      hasCompanyEmailDomain: false,
      hasBanner: false,
      categoriesReady: true,
      activeProductCount: 0,
    });
    expect(prepared.preview.missingRequirements).toEqual([]);

    const published = await executeShopPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id) },
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'shop-publish-empty-branding',
    });
    expect(published).toMatchObject({
      status: 'live',
      activeProductCount: 0,
      alreadyLive: false,
    });
    const stored = await Shop.findOne({ _id: shop._id, tenantId: tenant._id });
    expect(stored.status).toBe('live');
    expect(stored.logoUrl || '').toBe('');
    expect(stored.companyEmailDomain || '').toBe('');
    expect(stored.activeListingKeys || []).toEqual([]);
    expect((await Shop.findOne({ _id: otherShop._id, tenantId: tenant._id })).status).toBe('draft');
  });

  it('rejects execute when the confirmation was prepared for a different store', async () => {
    const prepared = await prepareShopPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id) },
    });
    await expect(executeShopPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(otherShop._id) },
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'shop-publish-mismatch-store',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_MISMATCH' });
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).status).toBe('draft');
    expect((await Shop.findOne({ _id: otherShop._id, tenantId: tenant._id })).status).toBe('draft');
  });

});


describe('store publish MCP tools and dashboard publish', () => {
  it('requires shops:publish, lists the tools, and publishes through MCP', async () => {
    const password = 'correct-horse';
    const email = `admin-${tenant.slug}@test.io`;
    admin = await makeUser(tenant, 'company_admin', 'tenant', { email, password });
    admin.token = await login(email, password);

    const anonymous = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(anonymous.headers['www-authenticate']).toContain('catalog:read');
    expect(anonymous.headers['www-authenticate']).not.toContain('shops:publish');

    const discovery = await request(app).get('/.well-known/oauth-authorization-server');
    expect(discovery.body.scopes_supported).toContain('shops:publish');

    const readOnly = await issueOauth(admin, 'catalog:read');
    const denied = await mcpRequest(readOnly, 'tools/call', {
      name: 'shops_prepare_publish',
      arguments: { shopId: String(shop._id) },
    });
    expect(denied.status).toBe(403);
    expect(`${denied.headers['www-authenticate'] || ''} ${JSON.stringify(denied.body)}`).toContain('shops:publish');

    const writeToken = await issueOauth(admin, 'catalog:read shops:publish');
    const binding = await OauthGrantBinding.findOne({ userId: admin.user._id, scopes: 'shops:publish' }).lean();
    expect(binding.scopes).toEqual(['catalog:read', 'shops:publish']);
    const names = rpcBody(await mcpRequest(writeToken, 'tools/list')).result.tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(['shops_prepare_publish', 'shops_execute_publish']));

    const prepared = await mcpRequest(writeToken, 'tools/call', {
      name: 'shops_prepare_publish',
      arguments: { name: 'MCP QA Store Updated' },
    });
    expect(prepared.status).toBe(200);
    const preview = rpcBody(prepared).result;
    expect(preview.isError).not.toBe(true);
    expect(preview.structuredContent.preview.status).toBe('draft');
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).status).toBe('draft');

    const published = await mcpRequest(writeToken, 'tools/call', {
      name: 'shops_execute_publish',
      arguments: {
        name: 'MCP QA Store Updated',
        confirmationId: preview.structuredContent.confirmationId,
        idempotencyKey: 'mcp-shop-publish-1',
      },
    });
    expect(published.status).toBe(200);
    const body = rpcBody(published).result;
    expect(body.isError).not.toBe(true);
    expect(body.structuredContent).toMatchObject({
      id: String(shop._id),
      status: 'live',
      alreadyLive: false,
    });
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).status).toBe('live');
    expect((await Shop.findOne({ _id: otherShop._id, tenantId: tenant._id })).status).toBe('draft');
    expect(await AuditLog.findOne({
      tenantId: tenant._id,
      action: 'shop.publish',
      entityId: shop._id,
    })).toBeTruthy();
  });

  it('keeps dashboard publish working for the same draft rules', async () => {
    const password = 'correct-horse';
    const email = `dash-${tenant.slug}@test.io`;
    admin = await makeUser(tenant, 'company_admin', 'tenant', { email, password });
    const token = await login(email, password);

    const missing = await Shop.create({
      tenantId: tenant._id,
      name: 'No Categories',
      slug: `nocat-${Date.now()}`,
      status: 'draft',
      categories: [],
    });
    const blocked = await request(app)
      .post(`/api/v1/shops/${missing._id}/publish`)
      .set(authHeader(token));
    expect(blocked.status).toBe(422);
    expect(blocked.body.error?.code).toBe('SHOP_NO_CATEGORIES');

    const ok = await request(app)
      .post(`/api/v1/shops/${shop._id}/publish`)
      .set(authHeader(token));
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('live');
    expect(ok.body.activeListingKeys).toEqual(['col1:prod1', 'col1:prod2']);
    expect((await Shop.findOne({ _id: otherShop._id, tenantId: tenant._id })).status).toBe('draft');
  });
});
