import { createHash, randomBytes } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Campaign } from '../src/modules/campaigns/campaign.model.js';
import { Recipient } from '../src/modules/campaigns/recipient.model.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { OauthGrantBinding } from '../src/modules/oauth/oauthGrantBinding.model.js';
import { LOCAL_OAUTH_CLIENT_ID, LOCAL_OAUTH_REDIRECT_URI, mcpResourceUrl } from '../src/modules/oauth/oauth.config.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { authHeader, makeEntity, makeFundedWallet, makeShop, makeTenant, makeUser } from './helpers.js';

const PROTOCOL = '2026-07-28';
const SECRET_EMAIL = 'campaign-secret-wave3@test.io';
const SECRET_PHONE = '9000003333';
const SECRET_STREET = 'Secret Campaign Lane 9';
const SECRET_PAY = 'pay_secret_wave3';
const SECRET_DRAFT = 'draft-recipient-secret@test.io';
const SECRET_TOKEN = 'redeem-token-wave3';

let app;

function s256(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

function mcpRequest(token, method, params = {}) {
  const req = request(app)
    .post('/mcp')
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .set('MCP-Protocol-Version', PROTOCOL)
    .set('Mcp-Method', method);
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
  const text = res.text ?? '';
  const line = text.split(/\r?\n/).find((row) => row.startsWith('data: '));
  if (!line) return null;
  return JSON.parse(line.slice('data: '.length));
}

async function callTool(token, name, args = {}) {
  const res = await mcpRequest(token, 'tools/call', { name, arguments: args });
  expect(res.status, JSON.stringify(res.body ?? res.text).slice(0, 800)).toBe(200);
  return rpcBody(res).result;
}

async function issueOauth(tenant, session, scope) {
  const agent = request.agent(app);
  const verifier = randomBytes(32).toString('base64url');
  const started = await agent.get('/auth').redirects(0).query({
    client_id: LOCAL_OAUTH_CLIENT_ID,
    redirect_uri: LOCAL_OAUTH_REDIRECT_URI,
    response_type: 'code',
    scope,
    resource: mcpResourceUrl(),
    state: 'campaigns-state',
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
});

async function seedCampaigns() {
  const tenant = await makeTenant({ name: 'Campaign Co' });
  const other = await makeTenant({ name: 'Other Campaign Co' });
  const wallet = await makeFundedWallet(tenant);
  const entity = await makeEntity(tenant, wallet, 'Marketing');
  const sales = await makeEntity(tenant, wallet, 'Sales');
  const shop = await makeShop(tenant);
  const points = await Campaign.create({
    tenantId: tenant._id,
    entityId: entity._id,
    shopId: shop._id,
    name: 'Diwali Points',
    type: 'points',
    status: 'redemption_open',
    fulfillmentMode: 'redeem',
    recipientCount: 4,
    creditsPerRecipient: 1000,
    totalBudget: 4000,
    catalogMode: 'full_store',
    paymentMode: 'wallet',
    razorpayPaymentId: SECRET_PAY,
    message: { from: 'People Team', body: 'Enjoy the gift' },
    singleLocation: {
      name: 'Hidden Desk',
      email: SECRET_EMAIL,
      phone: SECRET_PHONE,
      line1: SECRET_STREET,
      city: 'Hyderabad',
      state: 'TS',
      pincode: '500001',
    },
    draftState: {
      selectedWalletId: 'wallet-secret-wave3',
      selRecips: [SECRET_DRAFT],
    },
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
    updatedAt: new Date('2026-02-02T00:00:00.000Z'),
  });
  const kit = await Campaign.create({
    tenantId: tenant._id,
    entityId: entity._id,
    name: 'Welcome Kit',
    type: 'kit',
    status: 'launched',
    fulfillmentMode: 'surprise',
    recipientCount: 2,
    creditsPerRecipient: 0,
    totalBudget: 2500,
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
  });
  const salesCampaign = await Campaign.create({
    tenantId: tenant._id,
    entityId: sales._id,
    name: 'Sales Push',
    type: 'items',
    status: 'draft',
    recipientCount: 1,
    totalBudget: 800,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });
  const hidden = await Campaign.create({
    tenantId: tenant._id,
    entityId: entity._id,
    name: '__storefront_self_serve__',
    type: 'points',
    status: 'redemption_open',
    recipientCount: 9,
    totalBudget: 99,
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
  });
  await Recipient.create({
    tenantId: tenant._id,
    campaignId: points._id,
    name: 'Alice Wave',
    email: SECRET_EMAIL,
    phone: SECRET_PHONE,
    redemptionToken: SECRET_TOKEN,
    creditAmount: 1000,
  });
  await CatalogProduct.create({
    sku: 'MUG-STILL',
    name: 'Still Mug',
    category: 'Drinkware',
    basePriceInr: 118,
    status: 'active',
    source: { provider: 'manual' },
  });
  return { tenant, other, entity, points, kit, salesCampaign, hidden };
}

function expectRedacted(payload) {
  const text = JSON.stringify(payload);
  expect(text).not.toContain(SECRET_EMAIL);
  expect(text).not.toContain(SECRET_PHONE);
  expect(text).not.toContain(SECRET_STREET);
  expect(text).not.toContain(SECRET_PAY);
  expect(text).not.toContain(SECRET_DRAFT);
  expect(text).not.toContain(SECRET_TOKEN);
  expect(text).not.toContain('razorpayPaymentId');
  expect(text).not.toContain('draftState');
  expect(text).not.toContain('singleLocation');
  expect(text).not.toContain('__storefront_self_serve__');
}

describe('campaign read tools', () => {
  it('keeps catalog and order grants off campaign tools until campaigns:read is consented', async () => {
    const seeded = await seedCampaigns();
    const email = `admin-${seeded.tenant.slug}@test.io`;
    const password = 'correct-horse-1';
    const session = await makeUser(seeded.tenant, 'company_admin', 'tenant', { email, password });
    session.token = await login(email, password);
    const existing = await issueOauth(seeded.tenant, session, 'catalog:read orders:read');
    const binding = await OauthGrantBinding.findOne({ userId: session.user._id, scopes: 'orders:read' }).lean();
    expect(binding.scopes).toEqual(['catalog:read', 'orders:read']);

    const catalog = await callTool(existing, 'catalog_search', { query: 'MUG-STILL' });
    expect(catalog.structuredContent.items.map((item) => item.sku)).toEqual(['MUG-STILL']);
    const denied = await mcpRequest(existing, 'tools/call', { name: 'campaigns_search', arguments: {} });
    expect(denied.status).toBe(403);
    const challenge = `${denied.headers['www-authenticate'] || ''} ${JSON.stringify(denied.body)}`;
    expect(challenge).toContain('insufficient_scope');
    expect(challenge).toContain('campaigns:read');
    expectRedacted(challenge);
  });

  it('returns tenant campaigns to an admin and entity campaigns to a manager', async () => {
    const seeded = await seedCampaigns();
    const password = 'correct-horse-1';
    const adminEmail = `admin-${seeded.tenant.slug}@test.io`;
    const managerEmail = `mgr-${seeded.tenant.slug}@test.io`;
    const admin = await makeUser(seeded.tenant, 'company_admin', 'tenant', { email: adminEmail, password });
    admin.token = await login(adminEmail, password);
    const manager = await makeUser(seeded.tenant, 'entity_manager', 'entity', {
      email: managerEmail,
      password,
      scopeId: seeded.entity._id,
      assignedEntityIds: [seeded.entity._id],
    });
    manager.token = await login(managerEmail, password);
    const adminToken = await issueOauth(seeded.tenant, admin, 'campaigns:read');
    const managerToken = await issueOauth(seeded.tenant, manager, 'catalog:read campaigns:read');
    const adminBinding = await OauthGrantBinding.findOne({ userId: admin.user._id }).lean();
    expect(adminBinding.scopes).toEqual(['campaigns:read']);

    const listed = rpcBody(await mcpRequest(adminToken, 'tools/list'));
    const tool = listed.result.tools.find((entry) => entry.name === 'campaigns_search');
    expect(tool.annotations.readOnlyHint).toBe(true);
    expect(tool.annotations.destructiveHint).toBe(false);

    const page = await callTool(adminToken, 'campaigns_search', {});
    expect(page.structuredContent.pagination).toMatchObject({ page: 1, limit: 10, total: 3 });
    expect(page.structuredContent.items.map((item) => item.name)).toEqual(['Welcome Kit', 'Diwali Points', 'Sales Push']);
    expectRedacted(page);

    const detail = await callTool(adminToken, 'campaigns_get', { campaignId: String(seeded.points._id) });
    expect(detail.isError).not.toBe(true);
    expect(detail.structuredContent).toMatchObject({
      id: String(seeded.points._id),
      name: 'Diwali Points',
      type: 'points',
      status: 'redemption_open',
      fulfillmentMode: 'redeem',
      recipientCount: 4,
      creditsPerRecipient: 1000,
      totalBudget: 4000,
      entityId: String(seeded.entity._id),
      catalogMode: 'full_store',
      paymentMode: 'wallet',
      message: { from: 'People Team', body: 'Enjoy the gift' },
    });
    expect(detail.structuredContent.createdAt).toBe('2026-02-01T00:00:00.000Z');
    expect(detail.content[0].text).toContain('Diwali Points');
    expectRedacted(detail);

    const managerPage = await callTool(managerToken, 'campaigns_search', { type: 'points' });
    expect(managerPage.structuredContent.items.map((item) => item.name)).toEqual(['Diwali Points']);
    const launched = await callTool(managerToken, 'campaigns_search', { status: 'launched', limit: 10 });
    expect(launched.structuredContent.items.map((item) => item.name)).toEqual(['Welcome Kit']);
    const blocked = await callTool(managerToken, 'campaigns_get', { campaignId: String(seeded.salesCampaign._id) });
    expect(blocked.isError).toBe(true);
    expect(blocked.content[0].text).toBe('You do not have access to this campaign');
    expectRedacted(blocked);

    const hidden = await callTool(adminToken, 'campaigns_get', { campaignId: String(seeded.hidden._id) });
    expect(hidden.isError).toBe(true);
    expect(hidden.content[0].text).toBe('Campaign not found.');
    expectRedacted(hidden);

    const first = await callTool(adminToken, 'campaigns_search', { limit: 1, page: 1 });
    const second = await callTool(adminToken, 'campaigns_search', { limit: 1, page: 2 });
    expect(first.structuredContent.items.map((item) => item.name)).toEqual(['Welcome Kit']);
    expect(second.structuredContent.items.map((item) => item.name)).toEqual(['Diwali Points']);
    expect(first.structuredContent.pagination.total).toBe(3);
  });

  it('hides another tenant campaign and does not write', async () => {
    const seeded = await seedCampaigns();
    const email = `other-${seeded.other.slug}@test.io`;
    const password = 'correct-horse-1';
    const outsider = await makeUser(seeded.other, 'company_admin', 'tenant', { email, password });
    outsider.token = await login(email, password);
    const token = await issueOauth(seeded.other, outsider, 'campaigns:read');
    const before = await Campaign.countDocuments({ tenantId: seeded.tenant._id });
    const writes = ['create', 'insertMany', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'findOneAndUpdate', 'bulkWrite', 'replaceOne']
      .map((name) => vi.spyOn(Campaign, name));
    try {
      const page = await callTool(token, 'campaigns_search', {});
      expect(page.structuredContent.items).toEqual([]);
      const missing = await callTool(token, 'campaigns_get', { campaignId: String(seeded.points._id) });
      expect(missing.isError).toBe(true);
      expect(missing.content[0].text).toBe('Campaign not found.');
      expectRedacted(missing);
      const bad = await callTool(token, 'campaigns_search', { status: 'not-a-status' });
      expect(bad.isError).toBe(true);
      for (const spy of writes) expect(spy).not.toHaveBeenCalled();
      expect(await Campaign.countDocuments({ tenantId: seeded.tenant._id })).toBe(before);
    } finally {
      for (const spy of writes) spy.mockRestore();
    }
  });

  it('refuses a finance user before the campaign tool runs', async () => {
    const seeded = await seedCampaigns();
    const finance = await makeUser(seeded.tenant, 'company_finance_user', 'tenant');
    const res = await mcpRequest(finance.token, 'tools/call', { name: 'campaigns_search', arguments: {} });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
