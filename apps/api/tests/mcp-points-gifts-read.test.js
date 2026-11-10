import { createHash, randomBytes } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Campaign } from '../src/modules/campaigns/campaign.model.js';
import { Recipient } from '../src/modules/campaigns/recipient.model.js';
import { Entity } from '../src/modules/entities/entity.model.js';
import { Order } from '../src/modules/orders/order.model.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';
import { OauthGrantBinding } from '../src/modules/oauth/oauthGrantBinding.model.js';
import { LOCAL_OAUTH_CLIENT_ID, LOCAL_OAUTH_REDIRECT_URI, mcpResourceUrl } from '../src/modules/oauth/oauth.config.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import * as ledger from '../src/services/ledger.service.js';
import { authHeader, makeEntity, makeFundedWallet, makeTenant, makeUser } from './helpers.js';

const PROTOCOL = '2026-07-28';
const SECRET_EMAIL = 'gift-secret-wave6@employees.test';
const SECRET_PHONE = '9000006666';
const SECRET_STREET = 'Secret Gift Lane 6';
const SECRET_TOKEN = 'redeem-token-wave6';
const SECRET_OTP = 'otp-hash-wave6';
const SECRET_PAY = 'pay_secret_wave6';
const SECRET_COST = 4242;

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
    state: 'gifts-state',
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

async function addRecipient(tenant, campaign, extra) {
  return Recipient.create({
    tenantId: tenant._id,
    campaignId: campaign._id,
    name: extra.name,
    email: extra.email,
    phone: SECRET_PHONE,
    creditAmount: extra.creditAmount,
    redemptionToken: extra.token,
    redemptionStatus: extra.status,
    openedAt: extra.openedAt ?? null,
    redeemedAt: extra.redeemedAt ?? null,
    otpHash: SECRET_OTP,
    createdAt: extra.createdAt,
  });
}

async function seedGifts() {
  const tenant = await makeTenant({ name: 'Points Co' });
  const other = await makeTenant({ name: 'Other Points' });
  const wallet = await makeFundedWallet(tenant, { name: 'Points Budget', amount: 100_000 });
  const otherWallet = await makeFundedWallet(other, { name: 'Other Budget', amount: 10_000 });
  const marketing = await makeEntity(tenant, wallet, 'Marketing');
  const sales = await makeEntity(tenant, wallet, 'Sales');
  const overflow = await makeEntity(tenant, wallet, 'Overflow');
  const foreignEntity = await makeEntity(other, otherWallet, 'Foreign');
  await Entity.updateOne({ _id: marketing._id, tenantId: tenant._id }, { $set: { allocatedAmount: 50_000, spentAmount: 12_000 } });
  await Entity.updateOne({ _id: sales._id, tenantId: tenant._id }, { $set: { allocatedAmount: 10_000, spentAmount: 1_000 } });
  await Entity.updateOne({ _id: overflow._id, tenantId: tenant._id }, { $set: { allocatedAmount: 1_000, spentAmount: 4_000 } });
  const password = 'correct-horse-1';
  const admin = await makeUser(tenant, 'company_admin', 'tenant', {
    email: `admin-${tenant.slug}@test.io`,
    password,
  });
  const diwali = await Campaign.create({
    tenantId: tenant._id,
    entityId: marketing._id,
    name: 'Diwali Points',
    type: 'points',
    status: 'redemption_open',
    razorpayPaymentId: SECRET_PAY,
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
  });
  const salesCampaign = await Campaign.create({
    tenantId: tenant._id,
    entityId: sales._id,
    name: 'Sales Points',
    type: 'points',
    status: 'launched',
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
  });
  const hidden = await Campaign.create({
    tenantId: tenant._id,
    entityId: marketing._id,
    name: '__storefront_self_serve__',
    type: 'points',
    status: 'redemption_open',
  });
  const kit = await Campaign.create({
    tenantId: tenant._id,
    entityId: marketing._id,
    name: 'Welcome Kit',
    type: 'kit',
    status: 'launched',
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
  });
  const foreign = await Campaign.create({
    tenantId: other._id,
    entityId: foreignEntity._id,
    name: 'Foreign Points',
    type: 'points',
    status: 'launched',
  });

  const openedAt = new Date('2026-03-02T00:00:00.000Z');
  const redeemedAt = new Date('2026-03-03T00:00:00.000Z');
  await addRecipient(tenant, diwali, { name: 'Invited Guest', email: 'invited-wave6@test.io', creditAmount: 1000, status: 'invited', token: 'tok-invited', createdAt: new Date('2026-03-01T01:00:00.000Z') });
  await addRecipient(tenant, diwali, { name: 'Opened Guest', email: 'opened-wave6@test.io', creditAmount: 2000, status: 'opened', token: 'tok-opened', openedAt, createdAt: new Date('2026-03-01T02:00:00.000Z') });
  await addRecipient(tenant, diwali, { name: 'Verified Guest', email: 'verified-wave6@test.io', creditAmount: 500, status: 'verified', token: 'tok-verified', createdAt: new Date('2026-03-01T03:00:00.000Z') });
  await addRecipient(tenant, diwali, { name: 'Redeemed Guest', email: 'redeemed-wave6@test.io', creditAmount: 3000, status: 'redeemed', token: 'tok-redeemed', redeemedAt, createdAt: new Date('2026-03-01T04:00:00.000Z') });
  const ordered = await addRecipient(tenant, diwali, { name: 'Ordered Guest', email: SECRET_EMAIL, creditAmount: 4000, status: 'order_created', token: SECRET_TOKEN, redeemedAt, createdAt: new Date('2026-03-01T05:00:00.000Z') });
  const cancelled = await addRecipient(tenant, diwali, { name: 'Cancelled Guest', email: 'cancelled-wave6@test.io', creditAmount: 1500, status: 'redeemed', token: 'tok-cancelled', redeemedAt, createdAt: new Date('2026-03-01T06:00:00.000Z') });
  await addRecipient(tenant, diwali, { name: 'Expired Guest', email: 'expired-wave6@test.io', creditAmount: 800, status: 'expired', token: 'tok-expired', createdAt: new Date('2026-03-01T07:00:00.000Z') });
  await addRecipient(tenant, diwali, { name: 'Zero Guest', email: 'zero-wave6@test.io', creditAmount: 0, status: 'invited', token: 'tok-zero', createdAt: new Date('2026-03-01T08:00:00.000Z') });
  await addRecipient(tenant, salesCampaign, { name: 'Sales Guest', email: 'sales-wave6@test.io', creditAmount: 9000, status: 'invited', token: 'tok-sales', createdAt: new Date('2026-02-02T00:00:00.000Z') });
  await addRecipient(tenant, hidden, { name: 'Hidden Shopper', email: 'hidden-wave6@test.io', creditAmount: 99_999, status: 'opened', token: 'tok-hidden', createdAt: new Date('2026-05-01T00:00:00.000Z') });
  await addRecipient(tenant, kit, { name: 'Kit Guest', email: 'kit-wave6@test.io', creditAmount: 0, status: 'invited', token: 'tok-kit', createdAt: new Date('2026-04-02T00:00:00.000Z') });
  await addRecipient(other, foreign, { name: 'Foreign Guest', email: 'foreign-wave6@test.io', creditAmount: 77_000, status: 'invited', token: 'tok-foreign', createdAt: new Date('2026-05-02T00:00:00.000Z') });

  await Order.create({
    tenantId: tenant._id,
    campaignId: diwali._id,
    recipientId: ordered._id,
    orderNumber: 'SM-GIFT-1',
    status: 'created',
    items: [{ name: 'Mug', qty: 1, unitPriceInr: 100, costPriceInr: SECRET_COST }],
    shippingAddress: { name: 'Ordered Guest', phone: SECRET_PHONE, line1: SECRET_STREET, city: 'Hyderabad', pincode: '500001' },
    amountBreakdown: { subtotal: 100, gst: 18, total: 118 },
    internalNotes: [{ body: 'secret-note-wave6' }],
  });
  await Order.create({
    tenantId: tenant._id,
    campaignId: diwali._id,
    recipientId: cancelled._id,
    orderNumber: 'SM-GIFT-CANCELLED',
    status: 'cancelled',
    items: [{ name: 'Cap', qty: 1, unitPriceInr: 50, costPriceInr: SECRET_COST }],
    shippingAddress: { phone: SECRET_PHONE, line1: SECRET_STREET },
  });

  return { tenant, other, marketing, sales, overflow, admin, diwali, salesCampaign, foreign, password };
}

function expectRedacted(payload) {
  const text = JSON.stringify(payload);
  expect(text).not.toContain(SECRET_EMAIL);
  expect(text).not.toContain(SECRET_PHONE);
  expect(text).not.toContain(SECRET_STREET);
  expect(text).not.toContain(SECRET_TOKEN);
  expect(text).not.toContain(SECRET_OTP);
  expect(text).not.toContain(SECRET_PAY);
  expect(text).not.toContain(String(SECRET_COST));
  expect(text).not.toContain('secret-note-wave6');
  expect(text).not.toContain('redemptionToken');
  expect(text).not.toContain('otpHash');
  expect(text).not.toContain('Hidden Shopper');
  expect(text).not.toContain('Foreign Guest');
}

describe('points and gift read tools', () => {
  it('keeps gifts off existing grants and keeps points on wallets:read', async () => {
    const seeded = await seedGifts();
    const session = seeded.admin;
    session.token = await login(`admin-${seeded.tenant.slug}@test.io`, seeded.password);
    const walletsOnly = await issueOauth(seeded.tenant, session, 'wallets:read');
    const walletsBinding = await OauthGrantBinding.findOne({ userId: session.user._id, scopes: 'wallets:read' }).lean();
    expect(walletsBinding.scopes).toEqual(['wallets:read']);

    const summary = await callTool(walletsOnly, 'points_summary');
    expect(summary.isError).not.toBe(true);
    expect(summary.structuredContent.currency).toBe('INR');

    const deniedGifts = await mcpRequest(walletsOnly, 'tools/call', { name: 'gifts_search', arguments: {} });
    expect(deniedGifts.status).toBe(403);
    const giftsChallenge = `${deniedGifts.headers['www-authenticate'] || ''} ${JSON.stringify(deniedGifts.body)}`;
    expect(giftsChallenge).toContain('insufficient_scope');
    expect(giftsChallenge).toContain('gifts:read');

    const giftsOnly = await issueOauth(seeded.tenant, session, 'gifts:read');
    const giftsBinding = await OauthGrantBinding.findOne({ userId: session.user._id, scopes: 'gifts:read' }).lean();
    expect(giftsBinding.scopes).toEqual(['gifts:read']);
    const deniedPoints = await mcpRequest(giftsOnly, 'tools/call', { name: 'points_summary', arguments: {} });
    expect(deniedPoints.status).toBe(403);
    expect(`${deniedPoints.headers['www-authenticate'] || ''}`).toContain('wallets:read');
  });

  it('totals rupee credits for an admin and only assigned entities for a manager', async () => {
    const seeded = await seedGifts();
    const admin = seeded.admin;
    admin.token = await login(`admin-${seeded.tenant.slug}@test.io`, seeded.password);
    const manager = await makeUser(seeded.tenant, 'entity_manager', 'entity', {
      email: `mgr-${seeded.tenant.slug}@test.io`,
      password: seeded.password,
      scopeId: seeded.marketing._id,
      assignedEntityIds: [seeded.marketing._id],
    });
    manager.token = await login(`mgr-${seeded.tenant.slug}@test.io`, seeded.password);
    const adminToken = await issueOauth(seeded.tenant, admin, 'wallets:read gifts:read');
    const managerToken = await issueOauth(seeded.tenant, manager, 'wallets:read gifts:read');

    const listed = rpcBody(await mcpRequest(adminToken, 'tools/list')).result;
    const tool = listed.tools.find((entry) => entry.name === 'points_summary');
    expect(tool.annotations.readOnlyHint).toBe(true);
    expect(tool.annotations.destructiveHint).toBe(false);

    const summary = await callTool(adminToken, 'points_summary');
    expect(summary.structuredContent.amountBasis).toContain('denominated in INR');
    expect(summary.structuredContent).toMatchObject({
      recipientCount: 9,
      issuedCreditInr: 21_800,
      outstandingCreditInr: 12_500,
      redeemedCreditInr: 8_500,
      expiredCreditInr: 800,
    });
    const diwali = summary.structuredContent.campaigns.find((row) => row.name === 'Diwali Points');
    expect(diwali).toMatchObject({
      recipientCount: 8,
      issuedCreditInr: 12_800,
      outstandingCreditInr: 3_500,
      redeemedCreditInr: 8_500,
      expiredCreditInr: 800,
    });
    expect(summary.structuredContent.campaigns.some((row) => row.name === 'Welcome Kit')).toBe(false);
    expect(summary.structuredContent.entities.map((row) => [row.name, row.availableAllocationInr])).toEqual([
      ['Marketing', 38_000],
      ['Overflow', 0],
      ['Sales', 9_000],
    ]);
    expect(JSON.stringify(summary)).not.toContain('Invited Guest');
    expectRedacted(summary);

    const managerSummary = await callTool(managerToken, 'points_summary');
    expect(managerSummary.structuredContent).toMatchObject({
      recipientCount: 8,
      issuedCreditInr: 12_800,
      outstandingCreditInr: 3_500,
      redeemedCreditInr: 8_500,
      expiredCreditInr: 800,
    });
    expect(managerSummary.structuredContent.campaigns.map((row) => row.name)).toEqual(['Diwali Points']);
    expect(managerSummary.structuredContent.entities.map((row) => row.name)).toEqual(['Marketing']);

    const gifts = await callTool(adminToken, 'gifts_search', { campaignId: String(seeded.diwali._id), redemptionStatus: 'invited' });
    expect(gifts.structuredContent.items.map((item) => item.recipientName).sort()).toEqual(['Invited Guest', 'Zero Guest']);
    expect(gifts.structuredContent.items.find((item) => item.recipientName === 'Zero Guest').creditAmountInr).toBe(0);
    expectRedacted(gifts);

    const ordered = await callTool(adminToken, 'gifts_search', {
      campaignId: String(seeded.diwali._id),
      redemptionStatus: 'order_created',
    });
    expect(ordered.structuredContent.items).toEqual([
      expect.objectContaining({
        campaignName: 'Diwali Points',
        recipientName: 'Ordered Guest',
        creditAmountInr: 4000,
        redemptionStatus: 'order_created',
        orderNumber: 'SM-GIFT-1',
      }),
    ]);
    expect(ordered.structuredContent.items[0].redeemedAt).toBe('2026-03-03T00:00:00.000Z');
    expectRedacted(ordered);

    const cancelled = await callTool(adminToken, 'gifts_search', {
      campaignId: String(seeded.diwali._id),
      redemptionStatus: 'redeemed',
    });
    const cancelledRow = cancelled.structuredContent.items.find((item) => item.recipientName === 'Cancelled Guest');
    expect(cancelledRow.orderNumber).toBe('SM-GIFT-CANCELLED');
    expect(cancelledRow.creditAmountInr).toBe(1500);

    const hiddenPage = await callTool(managerToken, 'gifts_search', { campaignId: String(seeded.salesCampaign._id) });
    expect(hiddenPage.structuredContent.items).toEqual([]);
    const foreignPage = await callTool(adminToken, 'gifts_search', { campaignId: String(seeded.foreign._id) });
    expect(foreignPage.structuredContent.items).toEqual([]);

    const first = await callTool(managerToken, 'gifts_search', { limit: 1, page: 1 });
    const second = await callTool(managerToken, 'gifts_search', { limit: 1, page: 2 });
    expect(first.structuredContent.pagination.total).toBe(9);
    expect(first.structuredContent.items[0].recipientName).not.toBe(second.structuredContent.items[0].recipientName);

    const bad = await callTool(adminToken, 'gifts_search', { redemptionStatus: 'not_a_status' });
    expect(bad.isError).toBe(true);
  });

  it('does not write while reading points or gifts', async () => {
    const seeded = await seedGifts();
    const email = `other-${seeded.other.slug}@test.io`;
    const outsider = await makeUser(seeded.other, 'company_admin', 'tenant', { email, password: seeded.password });
    outsider.token = await login(email, seeded.password);
    const token = await issueOauth(seeded.other, outsider, 'wallets:read gifts:read');
    const before = await Recipient.countDocuments({ tenantId: seeded.tenant._id });
    const writes = ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'create'].flatMap((name) => [
      vi.spyOn(Campaign, name),
      vi.spyOn(Recipient, name),
      vi.spyOn(Order, name),
      vi.spyOn(Entity, name),
      vi.spyOn(Wallet, name),
    ]);
    const repair = vi.spyOn(ledger, 'repairWalletCaches');
    try {
      const summary = await callTool(token, 'points_summary');
      expect(summary.structuredContent.campaigns.map((row) => row.name)).toEqual(['Foreign Points']);
      expect(summary.structuredContent.issuedCreditInr).toBe(77_000);
      const gifts = await callTool(token, 'gifts_search');
      expect(gifts.structuredContent.items.map((item) => item.recipientName)).toEqual(['Foreign Guest']);
      for (const spy of writes) expect(spy).not.toHaveBeenCalled();
      expect(repair).not.toHaveBeenCalled();
      expect(await Recipient.countDocuments({ tenantId: seeded.tenant._id })).toBe(before);
    } finally {
      for (const spy of writes) spy.mockRestore();
      repair.mockRestore();
    }
  });

  it('refuses a finance user before the tools run', async () => {
    const seeded = await seedGifts();
    const finance = await makeUser(seeded.tenant, 'company_finance_user', 'tenant');
    const res = await mcpRequest(finance.token, 'tools/call', { name: 'points_summary', arguments: {} });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
