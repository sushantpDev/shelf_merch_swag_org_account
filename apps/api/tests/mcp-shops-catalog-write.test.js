import { createHash, randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { Collection } from '../src/modules/collections/collection.model.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { AuditLog } from '../src/modules/auditLogs/auditLog.model.js';
import { OauthGrantBinding } from '../src/modules/oauth/oauthGrantBinding.model.js';
import { LOCAL_OAUTH_CLIENT_ID, LOCAL_OAUTH_REDIRECT_URI, mcpResourceUrl } from '../src/modules/oauth/oauth.config.js';
import { listingKey } from '../src/modules/shops/listingKeys.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { authHeader, makeTenant, makeUser } from './helpers.js';
import {
  executeShopCatalogUpdate,
  prepareShopCatalogUpdate,
} from '../src/modules/mcp/shopsCatalogWrite.js';

const PROTOCOL = '2026-07-28';
const PRIOR_TOOLS = [
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
  'employees_prepare_create',
  'employees_execute_create',
  'employees_prepare_update',
  'employees_execute_update',
  'campaigns_prepare_points_draft',
  'campaigns_execute_points_draft',
  'shops_prepare_create',
  'shops_execute_create',
  'shops_prepare_update',
  'shops_execute_update',
];

let app;
let tenant;
let admin;
let shop;
let teeKey;
let capKey;

function s256(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
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
    state: 'shops-catalog',
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

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});

afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  clearTenantLimitCache();
  tenant = await makeTenant({ slug: 'shops-catalog' });
  admin = await makeUser(tenant, 'company_admin', 'tenant');
  shop = await Shop.create({
    tenantId: tenant._id,
    name: 'North Store',
    slug: 'north-catalog',
    status: 'draft',
  });
  const teeId = new mongoose.Types.ObjectId();
  const capId = new mongoose.Types.ObjectId();
  const collection = await Collection.create({
    tenantId: tenant._id,
    name: 'Welcome kit',
    code: 'C100000001',
    status: 'ready',
    shopIds: [shop._id],
    productRefs: [
      { catalogProductId: teeId, name: 'Tee', artworkUrl: 'https://files.example/secret-tee.png', brand: 'Secret Supplier' },
      { catalogProductId: capId, name: 'Cap', mockupUrl: 'https://files.example/secret-cap.png' },
    ],
  });
  teeKey = listingKey(collection._id, teeId);
  capKey = listingKey(collection._id, capId);
  shop.activeListingKeys = [teeKey, capKey];
  shop.featuredListingKeys = [teeKey];
  await shop.save();
});

function input(active, featured = []) {
  return { shopId: String(shop._id), activeListingKeys: active, featuredListingKeys: featured };
}

describe('store catalog visibility', () => {
  it('previews shown, hidden, and featured products without writing', async () => {
    const beforeShop = await Shop.findOne({ _id: shop._id, tenantId: tenant._id });
    const beforeCollection = await Collection.findOne({ tenantId: tenant._id });
    const prepared = await prepareShopCatalogUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([capKey], [capKey]),
    });
    const afterShop = await Shop.findOne({ _id: shop._id, tenantId: tenant._id });
    const afterCollection = await Collection.findOne({ tenantId: tenant._id });
    expect(afterShop.updatedAt.toISOString()).toBe(beforeShop.updatedAt.toISOString());
    expect(afterShop.activeListingKeys).toEqual([teeKey, capKey]);
    expect(afterCollection.updatedAt.toISOString()).toBe(beforeCollection.updatedAt.toISOString());
    expect(afterCollection.status).toBe('ready');
    expect(await CatalogProduct.countDocuments()).toBe(0);
    expect(prepared.preview.shown).toEqual([
      { listingKey: capKey, productName: 'Cap', collectionName: 'Welcome kit' },
    ]);
    expect(prepared.preview.hidden).toEqual([
      { listingKey: teeKey, productName: 'Tee', collectionName: 'Welcome kit' },
    ]);
    expect(prepared.preview.featured).toEqual([
      { listingKey: capKey, productName: 'Cap', collectionName: 'Welcome kit' },
    ]);
    const text = JSON.stringify(prepared);
    expect(text).not.toContain('secret-tee');
    expect(text).not.toContain('secret-cap');
    expect(text).not.toContain('Secret Supplier');
    expect(text).not.toContain('artworkUrl');
  });

  it('applies a confirmed listing change once and rejects bad keys', async () => {
    const prepared = await prepareShopCatalogUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([capKey], [capKey]),
    });
    const updated = await executeShopCatalogUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([capKey], [capKey]),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'catalog-1',
    });
    expect(updated.activeListingKeys).toEqual([capKey]);
    expect(updated.featuredListingKeys).toEqual([capKey]);
    const saved = await Shop.findOne({ _id: shop._id, tenantId: tenant._id });
    const stamp = saved.updatedAt.toISOString();
    const replay = await executeShopCatalogUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([capKey], [capKey]),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'catalog-1',
    });
    expect(replay.activeListingKeys).toEqual([capKey]);
    const again = await Shop.findOne({ _id: shop._id, tenantId: tenant._id });
    expect(again.updatedAt.toISOString()).toBe(stamp);
    expect((await Collection.findOne({ tenantId: tenant._id })).status).toBe('ready');
    const audits = JSON.stringify(await AuditLog.find({ tenantId: tenant._id }).lean());
    expect(audits).toContain('shop.catalog_visibility');
    expect(audits).not.toContain('secret-tee');

    const fresh = input([teeKey, 'not-a-listing'], []);
    await expect(prepareShopCatalogUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: fresh,
    })).rejects.toMatchObject({ code: 'LISTING_KEY_INVALID' });
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).activeListingKeys).toEqual([capKey]);

    await expect(prepareShopCatalogUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([capKey], [teeKey]),
    })).rejects.toMatchObject({ code: 'FEATURED_NOT_ACTIVE' });
  });

  it('rejects other roles, other tenants, stale membership, and concurrent overwrites', async () => {
    const manager = await makeUser(tenant, 'entity_manager', 'entity', { assignedEntityIds: [] });
    await expect(prepareShopCatalogUpdate({
      tenantId: tenant._id,
      actorUserId: manager.user._id,
      input: input([capKey], []),
    })).rejects.toMatchObject({ status: 403 });

    const other = await makeTenant({ slug: 'other-catalog' });
    const outsider = await makeUser(other, 'company_admin', 'tenant');
    const foreign = await Shop.create({
      tenantId: other._id,
      name: 'Foreign',
      slug: 'foreign-catalog',
      status: 'draft',
    });
    await expect(prepareShopCatalogUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(foreign._id), activeListingKeys: [], featuredListingKeys: [] },
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const stale = await prepareShopCatalogUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([teeKey], []),
    });
    shop.activeListingKeys = [capKey];
    shop.featuredListingKeys = [];
    await shop.save();
    await expect(executeShopCatalogUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([teeKey], []),
      confirmationId: stale.confirmationId,
      idempotencyKey: 'stale-catalog',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).activeListingKeys).toEqual([capKey]);

    const owned = await prepareShopCatalogUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([], []),
    });
    await expect(executeShopCatalogUpdate({
      tenantId: other._id,
      actorUserId: outsider.user._id,
      input: input([], []),
      confirmationId: owned.confirmationId,
      idempotencyKey: 'cross-catalog',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_INVALID' });

    const first = await prepareShopCatalogUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([teeKey], [teeKey]),
    });
    const second = await prepareShopCatalogUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([capKey], [capKey]),
    });
    const raced = await Promise.allSettled([
      executeShopCatalogUpdate({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: input([teeKey], [teeKey]),
        confirmationId: first.confirmationId,
        idempotencyKey: 'race-tee',
      }),
      executeShopCatalogUpdate({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: input([capKey], [capKey]),
        confirmationId: second.confirmationId,
        idempotencyKey: 'race-cap',
      }),
    ]);
    const won = raced.filter((entry) => entry.status === 'fulfilled');
    expect(won).toHaveLength(1);
    const finalShop = await Shop.findOne({ _id: shop._id, tenantId: tenant._id });
    expect(finalShop.activeListingKeys).toEqual(won[0].value.activeListingKeys);
    expect(finalShop.featuredListingKeys).toEqual(won[0].value.featuredListingKeys);
  });
});

describe('store catalog MCP tools', () => {
  it('keeps shops:catalog off the initial challenge and preserves existing tools', async () => {
    const password = 'correct-horse';
    const email = `admin-${tenant.slug}@test.io`;
    admin = await makeUser(tenant, 'company_admin', 'tenant', { email, password });
    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    admin.token = login.body.accessToken;

    const anonymous = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(anonymous.headers['www-authenticate']).toContain('catalog:read');
    expect(anonymous.headers['www-authenticate']).not.toContain('shops:catalog');
    const metadata = await request(app).get('/.well-known/oauth-protected-resource/mcp');
    expect(metadata.body.scopes_supported).not.toContain('shops:catalog');
    const discovery = await request(app).get('/.well-known/oauth-authorization-server');
    expect(discovery.body.scopes_supported).toContain('shops:catalog');

    const readOnly = await issueOauth(admin, 'catalog:read');
    const denied = await mcpRequest(readOnly, 'tools/call', {
      name: 'shops_prepare_catalog_update',
      arguments: input([capKey], []),
    });
    expect(denied.status).toBe(403);
    expect(`${denied.headers['www-authenticate'] || ''} ${JSON.stringify(denied.body)}`).toContain('shops:catalog');

    const writeToken = await issueOauth(admin, 'catalog:read shops:catalog');
    const binding = await OauthGrantBinding.findOne({ userId: admin.user._id, scopes: 'shops:catalog' }).lean();
    expect(binding.scopes).toEqual(['catalog:read', 'shops:catalog']);
    const listed = rpcBody(await mcpRequest(writeToken, 'tools/list')).result;
    const names = listed.tools.map((tool) => tool.name);
    for (const tool of PRIOR_TOOLS) expect(names).toContain(tool);
    expect(names).toContain('shops_prepare_catalog_update');
    expect(names).toContain('shops_execute_catalog_update');

    const prepared = await mcpRequest(writeToken, 'tools/call', {
      name: 'shops_prepare_catalog_update',
      arguments: input([teeKey], [teeKey]),
    });
    const preview = rpcBody(prepared).result;
    expect(preview.isError).not.toBe(true);
    expect(JSON.stringify(preview)).not.toContain('secret-tee');
    const stored = await Shop.findOne({ _id: shop._id, tenantId: tenant._id });
    expect(stored.activeListingKeys).toEqual([teeKey, capKey]);
    const created = await mcpRequest(writeToken, 'tools/call', {
      name: 'shops_execute_catalog_update',
      arguments: {
        ...input([teeKey], [teeKey]),
        confirmationId: preview.structuredContent.confirmationId,
        idempotencyKey: 'tool-catalog-1',
      },
    });
    const body = rpcBody(created).result;
    expect(body.isError).not.toBe(true);
    expect(body.structuredContent.activeListingKeys).toEqual([teeKey]);
  });
});
