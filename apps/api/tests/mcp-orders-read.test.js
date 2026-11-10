import { createHash, randomBytes } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { Campaign } from '../src/modules/campaigns/campaign.model.js';
import { Recipient } from '../src/modules/campaigns/recipient.model.js';
import { Order } from '../src/modules/orders/order.model.js';
import { OrderInvoice } from '../src/modules/orderInvoices/orderInvoice.model.js';
import { OauthGrantBinding } from '../src/modules/oauth/oauthGrantBinding.model.js';
import { LOCAL_OAUTH_CLIENT_ID, LOCAL_OAUTH_REDIRECT_URI, mcpResourceUrl } from '../src/modules/oauth/oauth.config.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { authHeader, makeEntity, makeFundedWallet, makeShop, makeTenant, makeUser } from './helpers.js';

const PROTOCOL = '2026-07-28';
const SECRET_EMAIL = 'recipient-secret-wave2@test.io';
const SECRET_PHONE = '9000001111';
const SECRET_STREET = 'Secret Lane 77';
const SECRET_NOTE = 'SECRET-NOTE-WAVE2';
const SECRET_PDF = 'https://files.example/invoice-secret-wave2.pdf';
const SECRET_COST = 424242;

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
    state: 'orders-state',
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

async function seedOrders() {
  const tenant = await makeTenant({ name: 'Order Co' });
  const other = await makeTenant({ name: 'Other Co' });
  const wallet = await makeFundedWallet(tenant);
  const entity = await makeEntity(tenant, wallet, 'Marketing');
  const otherEntity = await makeEntity(tenant, wallet, 'Sales');
  const shop = await makeShop(tenant);
  const campaign = await Campaign.create({
    tenantId: tenant._id,
    entityId: entity._id,
    name: 'Diwali Gifts',
    type: 'kit',
    shopId: shop._id,
    status: 'redemption_open',
    totalBudget: 9000,
    recipientCount: 1,
  });
  const salesCampaign = await Campaign.create({
    tenantId: tenant._id,
    entityId: otherEntity._id,
    name: 'Sales Kits',
    type: 'points',
    shopId: shop._id,
    status: 'redemption_open',
    totalBudget: 500,
    recipientCount: 1,
  });
  const recipient = await Recipient.create({
    tenantId: tenant._id,
    campaignId: campaign._id,
    name: 'Alice Wave',
    email: SECRET_EMAIL,
    phone: SECRET_PHONE,
    creditAmount: 1000,
    redemptionToken: `token-${tenant.slug}-alice`,
    redemptionStatus: 'order_created',
  });
  const salesRecipient = await Recipient.create({
    tenantId: tenant._id,
    campaignId: salesCampaign._id,
    name: 'Bob Wave',
    email: 'bob-wave2@test.io',
    creditAmount: 500,
    redemptionToken: `token-${tenant.slug}-bob`,
    redemptionStatus: 'order_created',
  });
  const vendorId = new mongoose.Types.ObjectId();
  const visible = await Order.create({
    tenantId: tenant._id,
    campaignId: campaign._id,
    recipientId: recipient._id,
    orderNumber: 'SM-WAVE2-0001',
    status: 'created',
    trackingNumber: 'TRACK-1',
    vendorId,
    items: [{
      name: 'Detail Tee',
      sku: 'TEE-DETAIL',
      variant: { size: 'M', color: 'Navy' },
      qty: 2,
      unitPriceInr: 118,
      costPriceInr: SECRET_COST,
    }],
    shippingAddress: {
      name: 'Alice Wave',
      phone: SECRET_PHONE,
      line1: SECRET_STREET,
      city: 'Hyderabad',
      state: 'TS',
      pincode: '500001',
    },
    amountBreakdown: { subtotal: 236, packaging: 10, shipping: 20, serviceFee: 5, gst: 18, total: 1 },
    internalNotes: [{ body: SECRET_NOTE }],
  });
  await OrderInvoice.create({
    tenantId: tenant._id,
    orderId: visible._id,
    invoiceNumber: 'INV-WAVE2-1',
    pdfUrl: SECRET_PDF,
  });
  const shipped = await Order.create({
    tenantId: tenant._id,
    campaignId: campaign._id,
    recipientId: recipient._id,
    orderNumber: 'SM-WAVE2-0002',
    status: 'shipped',
    items: [{ name: 'Cap', sku: 'CAP-1', qty: 1, unitPriceInr: 80 }],
    amountBreakdown: { subtotal: 80, serviceFee: 0, gst: 0, total: 80 },
    shippingAddress: { name: 'Alice Wave', line1: 'Other Street', city: 'Hyderabad', state: 'TS', pincode: '500001' },
  });
  const hidden = await Order.create({
    tenantId: tenant._id,
    campaignId: salesCampaign._id,
    recipientId: salesRecipient._id,
    orderNumber: 'SM-WAVE2-SALES',
    status: 'created',
    items: [{ name: 'Sales Pen', sku: 'PEN-1', qty: 1, unitPriceInr: 40 }],
    amountBreakdown: { subtotal: 40, serviceFee: 0, gst: 0, total: 40 },
    shippingAddress: { name: 'Bob Wave', line1: 'Sales Street', city: 'Hyderabad', state: 'TS', pincode: '500001' },
  });
  await CatalogProduct.create({
    sku: 'MUG-STILL',
    name: 'Still Mug',
    category: 'Drinkware',
    basePriceInr: 118,
    status: 'active',
    source: { provider: 'manual' },
  });
  return { tenant, other, entity, visible, shipped, hidden, vendorId };
}

function expectRedacted(payload, vendorId) {
  const text = JSON.stringify(payload);
  expect(text).not.toContain('costPriceInr');
  expect(text).not.toContain(String(SECRET_COST));
  expect(text).not.toContain('vendorId');
  expect(text).not.toContain(String(vendorId));
  expect(text).not.toContain('internalNotes');
  expect(text).not.toContain(SECRET_NOTE);
  expect(text).not.toContain(SECRET_EMAIL);
  expect(text).not.toContain(SECRET_PHONE);
  expect(text).not.toContain(SECRET_STREET);
  expect(text).not.toContain(SECRET_PDF);
  expect(text).not.toContain('margin');
}

describe('orders read tools', () => {
  it('keeps a catalog-only grant on catalog tools and off order tools', async () => {
    const seeded = await seedOrders();
    const email = `admin-${seeded.tenant.slug}@test.io`;
    const password = 'correct-horse-1';
    const session = await makeUser(seeded.tenant, 'company_admin', 'tenant', { email, password });
    session.token = await login(email, password);
    const catalogToken = await issueOauth(seeded.tenant, session, 'catalog:read');
    const binding = await OauthGrantBinding.findOne({ userId: session.user._id }).lean();
    expect(binding.scopes).toEqual(['catalog:read']);

    const search = await callTool(catalogToken, 'catalog_search', { query: 'MUG-STILL' });
    expect(search.structuredContent.items.map((item) => item.sku)).toEqual(['MUG-STILL']);

    const denied = await mcpRequest(catalogToken, 'tools/call', {
      name: 'orders_search',
      arguments: {},
    });
    expect(denied.status).toBe(403);
    const challenge = `${denied.headers['www-authenticate'] || ''} ${JSON.stringify(denied.body)} ${denied.text || ''}`;
    expect(challenge).toContain('insufficient_scope');
    expect(challenge).toContain('orders:read');
    expectRedacted(challenge, seeded.vendorId);

    const legacy = await mcpRequest(session.token, 'tools/call', { name: 'orders_get', arguments: { orderId: String(seeded.visible._id) } });
    expect(legacy.status).toBe(403);
    expect(`${legacy.headers['www-authenticate'] || ''}`).toContain('insufficient_scope');
    const legacyCatalog = await callTool(session.token, 'catalog_search', { query: 'MUG-STILL' });
    expect(legacyCatalog.structuredContent.items).toHaveLength(1);
  });

  it('returns tenant orders to an admin and entity orders to a manager', async () => {
    const seeded = await seedOrders();
    const adminEmail = `admin-${seeded.tenant.slug}@test.io`;
    const managerEmail = `mgr-${seeded.tenant.slug}@test.io`;
    const password = 'correct-horse-1';
    const admin = await makeUser(seeded.tenant, 'company_admin', 'tenant', { email: adminEmail, password });
    admin.token = await login(adminEmail, password);
    const manager = await makeUser(seeded.tenant, 'entity_manager', 'entity', {
      email: managerEmail,
      password,
      scopeId: seeded.entity._id,
      assignedEntityIds: [seeded.entity._id],
    });
    manager.token = await login(managerEmail, password);
    const adminToken = await issueOauth(seeded.tenant, admin, 'catalog:read orders:read');
    const managerToken = await issueOauth(seeded.tenant, manager, 'orders:read');
    const adminBinding = await OauthGrantBinding.findOne({ userId: admin.user._id }).lean();
    expect(adminBinding.scopes).toEqual(['catalog:read', 'orders:read']);
    const managerBinding = await OauthGrantBinding.findOne({ userId: manager.user._id }).lean();
    expect(managerBinding.scopes).toEqual(['orders:read']);

    const listed = rpcBody(await mcpRequest(adminToken, 'tools/list'));
    const tool = listed.result.tools.find((entry) => entry.name === 'orders_search');
    expect(tool.annotations.readOnlyHint).toBe(true);
    expect(tool.annotations.destructiveHint).toBe(false);

    const page = await callTool(adminToken, 'orders_search', {});
    expect(page.structuredContent.pagination).toMatchObject({ page: 1, limit: 10, total: 3 });
    expect(page.structuredContent.items.map((item) => item.orderNumber).sort()).toEqual([
      'SM-WAVE2-0001',
      'SM-WAVE2-0002',
      'SM-WAVE2-SALES',
    ]);
    const detail = await callTool(adminToken, 'orders_get', { orderId: String(seeded.visible._id) });
    expect(detail.isError).not.toBe(true);
    expect(detail.structuredContent).toMatchObject({
      id: String(seeded.visible._id),
      orderNumber: 'SM-WAVE2-0001',
      status: 'created',
      campaignName: 'Diwali Gifts',
      recipientName: 'Alice Wave',
      trackingNumber: 'TRACK-1',
      invoiceNumber: 'INV-WAVE2-1',
      items: [{
        name: 'Detail Tee',
        sku: 'TEE-DETAIL',
        variant: { size: 'M', color: 'Navy' },
        quantity: 2,
        unitPriceInr: 118,
      }],
      amountBreakdown: { subtotal: 236, packaging: 10, shipping: 20, serviceFee: 5, gst: 18, total: 1 },
    });
    expect(detail.content[0].text).toContain('GST-inclusive');
    expectRedacted(detail, seeded.vendorId);

    const managerPage = await callTool(managerToken, 'orders_search', { status: 'created', limit: 25 });
    expect(managerPage.structuredContent.items.map((item) => item.orderNumber)).toEqual(['SM-WAVE2-0001']);
    const blocked = await callTool(managerToken, 'orders_get', { orderId: String(seeded.hidden._id) });
    expect(blocked.isError).toBe(true);
    expect(blocked.content[0].text).toBe('You do not have access to this order');
    expectRedacted(blocked, seeded.vendorId);

    const filtered = await callTool(adminToken, 'orders_search', { status: 'shipped', page: 1, limit: 10 });
    expect(filtered.structuredContent.items.map((item) => item.orderNumber)).toEqual(['SM-WAVE2-0002']);
    const first = await callTool(adminToken, 'orders_search', { limit: 1, page: 1 });
    const second = await callTool(adminToken, 'orders_search', { limit: 1, page: 2 });
    expect(first.structuredContent.items).toHaveLength(1);
    expect(second.structuredContent.items).toHaveLength(1);
    expect(first.structuredContent.items[0].orderNumber).not.toBe(second.structuredContent.items[0].orderNumber);
    expect(first.structuredContent.pagination.total).toBe(3);
  });

  it('hides another tenant order and does not write', async () => {
    const seeded = await seedOrders();
    const email = `other-${seeded.other.slug}@test.io`;
    const password = 'correct-horse-1';
    const outsider = await makeUser(seeded.other, 'company_admin', 'tenant', { email, password });
    outsider.token = await login(email, password);
    const token = await issueOauth(seeded.other, outsider, 'orders:read');
    const before = await Order.countDocuments({ tenantId: seeded.tenant._id });
    const stored = await Order.findOne({ _id: seeded.visible._id, tenantId: seeded.tenant._id }).lean();
    const writes = ['create', 'insertMany', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'findOneAndUpdate', 'bulkWrite', 'replaceOne']
      .map((name) => vi.spyOn(Order, name));
    const invoiceWrites = ['create', 'updateOne', 'updateMany', 'deleteOne', 'findOneAndUpdate']
      .map((name) => vi.spyOn(OrderInvoice, name));
    try {
      const page = await callTool(token, 'orders_search', {});
      expect(page.structuredContent.items).toEqual([]);
      expect(page.structuredContent.pagination.total).toBe(0);
      const missing = await callTool(token, 'orders_get', { orderId: String(seeded.visible._id) });
      expect(missing.isError).toBe(true);
      expect(missing.content[0].text).toBe('Order not found.');
      expectRedacted(missing, seeded.vendorId);
      const bad = await callTool(token, 'orders_search', { status: 'not-a-status' });
      expect(bad.isError).toBe(true);
      for (const spy of [...writes, ...invoiceWrites]) expect(spy).not.toHaveBeenCalled();
      expect(await Order.countDocuments({ tenantId: seeded.tenant._id })).toBe(before);
      const after = await Order.findOne({ _id: seeded.visible._id, tenantId: seeded.tenant._id }).lean();
      expect(after.amountBreakdown.total).toBe(stored.amountBreakdown.total);
      expect(after.status).toBe(stored.status);
    } finally {
      for (const spy of [...writes, ...invoiceWrites]) spy.mockRestore();
    }
  });

  it('refuses a finance user before the order tool runs', async () => {
    const seeded = await seedOrders();
    const finance = await makeUser(seeded.tenant, 'company_finance_user', 'tenant');
    const res = await mcpRequest(finance.token, 'tools/call', { name: 'orders_search', arguments: {} });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
