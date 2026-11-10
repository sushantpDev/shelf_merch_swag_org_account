import { createHash, randomBytes } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Campaign } from '../src/modules/campaigns/campaign.model.js';
import { Recipient } from '../src/modules/campaigns/recipient.model.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { Kit } from '../src/modules/kits/kit.model.js';
import { Contact } from '../src/modules/contacts/contact.model.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { Order } from '../src/modules/orders/order.model.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';
import { WalletTransaction } from '../src/modules/wallets/walletTransaction.model.js';
import { OauthGrantBinding } from '../src/modules/oauth/oauthGrantBinding.model.js';
import { McpWriteConfirmation } from '../src/modules/mcp/mcpWriteConfirmation.model.js';
import { McpWriteIdempotency } from '../src/modules/mcp/mcpWriteIdempotency.model.js';
import { LOCAL_OAUTH_CLIENT_ID, LOCAL_OAUTH_REDIRECT_URI, mcpResourceUrl } from '../src/modules/oauth/oauth.config.js';
import { notify } from '../src/modules/notifications/notifications.service.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import * as ledger from '../src/services/ledger.service.js';
import { authHeader, makeEntity, makeFundedWallet, makeTenant, makeUser } from './helpers.js';
import {
  executeMerchandiseDraft,
  executeMerchandiseLaunch,
  prepareMerchandiseDraft,
  prepareMerchandiseLaunch,
} from '../src/modules/mcp/campaignsMerchandiseWrite.js';

vi.mock('../src/modules/notifications/notifications.service.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, notify: vi.fn(async () => ({ queued: true })) };
});

const PROTOCOL = '2026-07-28';
const PRIOR_TOOLS = [
  'catalog_search', 'catalog_get_product', 'catalog_list_categories',
  'orders_search', 'orders_get', 'campaigns_search', 'campaigns_get',
  'wallet_list_balances', 'wallet_list_transactions', 'employees_search', 'employees_get',
  'points_summary', 'gifts_search',
  'employees_prepare_create', 'employees_execute_create', 'employees_prepare_update', 'employees_execute_update',
  'campaigns_prepare_points_draft', 'campaigns_execute_points_draft',
  'shops_prepare_create', 'shops_execute_create', 'shops_prepare_update', 'shops_execute_update',
  'shops_prepare_catalog_update', 'shops_execute_catalog_update',
  'budget_prepare_allocation', 'budget_execute_allocation',
  'campaigns_prepare_credit_allocation', 'campaigns_execute_credit_allocation',
  'campaigns_prepare_launch', 'campaigns_execute_launch',
];

let app;
let tenant;
let admin;
let wallet;
let entity;
let shop;
let product;
let kit;
let contact;

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
    state: 'merchandise',
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
  vi.mocked(notify).mockClear();
  tenant = await makeTenant({ slug: 'kit-send' });
  admin = await makeUser(tenant, 'company_admin', 'tenant');
  wallet = await makeFundedWallet(tenant, { name: 'Operating', amount: 10_000 });
  entity = await makeEntity(tenant, wallet, 'Marketing');
  shop = await Shop.create({ tenantId: tenant._id, name: 'HQ Store', slug: `hq-${Date.now()}`, status: 'draft' });
  product = await CatalogProduct.create({
    sku: `SM-TEE-${Date.now()}`,
    name: 'Test Tee',
    category: 'Apparel',
    group: 'tee',
    basePriceInr: 500,
    costPriceInr: 111111,
  });
  kit = await Kit.create({
    tenantId: tenant._id,
    name: 'Welcome Kit',
    productRefs: [{ catalogProductId: product._id, name: 'Test Tee', brand: '', group: 'tee' }],
    status: 'live',
    packaging: 'none',
  });
  contact = await Contact.create({
    tenantId: tenant._id,
    name: 'Ada',
    email: 'hidden-recipient@test.io',
    address: { line1: 'SECRET-STREET', city: 'Hyderabad', state: 'Telangana', pincode: '500001', country: 'IN' },
  });
});

function draftInput(extra = {}) {
  return {
    entityId: String(entity._id),
    shopId: String(shop._id),
    kitId: String(kit._id),
    name: 'Welcome kits',
    fulfillmentMode: 'surprise',
    packaging: 'none',
    recipients: [{ name: 'Ada', email: 'hidden-recipient@test.io', contactId: String(contact._id) }],
    ...extra,
  };
}

describe('kit campaign draft and launch', () => {
  it('previews a priced kit without writing, then saves and launches once', async () => {
    const prepared = await prepareMerchandiseDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: draftInput(),
    });
    expect(prepared.preview).toMatchObject({
      type: 'kit',
      fulfillment: 'one_order_per_recipient',
      recipientCount: 1,
      totalBudget: 500,
      walletImpact: { debitedNow: 0, requiredAtLaunch: 500, balance: 10_000 },
    });
    expect(prepared.preview.items).toEqual([{ name: 'Test Tee', quantity: 1 }]);
    expect(JSON.stringify(prepared)).not.toContain('hidden-recipient@test.io');
    expect(JSON.stringify(prepared)).not.toContain('SECRET-STREET');
    expect(JSON.stringify(prepared)).not.toContain('111111');
    expect(await Campaign.countDocuments({ tenantId: tenant._id })).toBe(0);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'campaign_spend' })).toBe(0);

    const saved = await executeMerchandiseDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: draftInput(),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'kit-draft-1',
    });
    expect(saved).toMatchObject({ status: 'approved', totalBudget: 500, balance: 10_000 });
    expect(JSON.stringify(saved)).not.toContain('hidden-recipient@test.io');
    const recipient = await Recipient.findOne({ tenantId: tenant._id, campaignId: saved.id });
    expect(recipient.invitedAt).toBeFalsy();
    expect(JSON.stringify(saved)).not.toContain(recipient.redemptionToken);
    const draftRow = await McpWriteIdempotency.findOne({ key: 'kit-draft-1', tenantId: tenant._id });
    await McpWriteIdempotency.updateOne(
      { _id: draftRow._id, tenantId: tenant._id },
      { $set: { status: 'pending', result: null, leaseOwner: 'replica-a', leaseExpiresAt: new Date(0) } },
    );
    const recovered = await executeMerchandiseDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: draftInput(),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'kit-draft-1',
    });
    expect(recovered.id).toBe(saved.id);
    expect(await Campaign.countDocuments({ tenantId: tenant._id })).toBe(1);

    const launchPreview = await prepareMerchandiseLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: saved.id },
    });
    expect(launchPreview.preview).toMatchObject({
      orderCount: 1,
      totalBudget: 500,
      walletImpact: { debitedNow: 500, balanceBefore: 10_000, balanceAfter: 9_500 },
    });
    expect((await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id })).balance).toBe(10_000);

    const launched = await executeMerchandiseLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: saved.id },
      confirmationId: launchPreview.confirmationId,
      idempotencyKey: 'kit-launch-1',
    });
    expect(launched.balance).toBe(9_500);
    expect(launched.orderCount).toBe(1);
    expect(launched.invitationsSent).toBe(1);
    expect(JSON.stringify(launched)).not.toContain('SECRET-STREET');
    expect(JSON.stringify(launched)).not.toContain(recipient.redemptionToken);
    expect(await Order.countDocuments({ tenantId: tenant._id, campaignId: saved.id })).toBe(1);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'campaign_spend' })).toBe(1);
    const callsAfterLaunch = vi.mocked(notify).mock.calls.length;

    const launchRow = await McpWriteIdempotency.findOne({ key: 'kit-launch-1', tenantId: tenant._id });
    await McpWriteIdempotency.updateOne(
      { _id: launchRow._id, tenantId: tenant._id },
      { $set: { status: 'pending', result: null, leaseOwner: 'replica-b', leaseExpiresAt: new Date(0) } },
    );
    const recoveredLaunch = await executeMerchandiseLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: saved.id },
      confirmationId: launchPreview.confirmationId,
      idempotencyKey: 'kit-launch-1',
    });
    expect(recoveredLaunch.balance).toBe(9_500);
    expect(await Order.countDocuments({ tenantId: tenant._id })).toBe(1);
    expect(vi.mocked(notify).mock.calls.length).toBe(callsAfterLaunch);
    expect((await CatalogProduct.findById(product._id)).basePriceInr).toBe(500);
  });

  it('launches a recipient-choice kit without creating a fulfillment order', async () => {
    const input = draftInput({ fulfillmentMode: 'redeem', name: 'Choose a size' });
    const prepared = await prepareMerchandiseDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
    });
    expect(prepared.preview.fulfillment).toBe('recipient_chooses_later');
    expect(await Campaign.countDocuments({ tenantId: tenant._id })).toBe(0);
    expect(await Order.countDocuments({ tenantId: tenant._id })).toBe(0);

    const saved = await executeMerchandiseDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'kit-redeem-draft',
    });
    expect(saved.fulfillmentMode).toBe('redeem');
    expect(await Order.countDocuments({ tenantId: tenant._id })).toBe(0);
    const recipient = await Recipient.findOne({ tenantId: tenant._id, campaignId: saved.id });
    expect(recipient.invitedAt).toBeFalsy();

    const launchPreview = await prepareMerchandiseLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: saved.id },
    });
    expect(launchPreview.preview.orderCount).toBe(0);
    expect((await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id })).balance).toBe(10_000);

    const launched = await executeMerchandiseLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: saved.id },
      confirmationId: launchPreview.confirmationId,
      idempotencyKey: 'kit-redeem-launch',
    });
    expect(launched).toMatchObject({ status: 'redemption_open', orderCount: 0, invitationsSent: 1 });
    expect(await Order.countDocuments({ tenantId: tenant._id })).toBe(0);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'campaign_spend' })).toBe(1);
    const invite = vi.mocked(notify).mock.calls.map((call) => call[0]).find((row) => row?.type === 'redemption_invite');
    expect(invite.link).toMatch(/^\/redeem\//);
    expect(JSON.stringify(launched)).not.toContain(recipient.redemptionToken);

    const again = await executeMerchandiseLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: saved.id },
      confirmationId: launchPreview.confirmationId,
      idempotencyKey: 'kit-redeem-launch',
    });
    expect(again.campaignId).toBe(launched.campaignId);
    expect(await Order.countDocuments({ tenantId: tenant._id })).toBe(0);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'campaign_spend' })).toBe(1);
  });

  it('rejects an expired private-link confirmation before any debit', async () => {
    const input = draftInput({ fulfillmentMode: 'redeem', name: 'Expired link' });
    const prepared = await prepareMerchandiseDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
    });
    await McpWriteConfirmation.updateOne(
      { confirmationId: prepared.confirmationId, tenantId: tenant._id },
      { expiresAt: new Date(Date.now() - 60_000) },
    );
    await expect(executeMerchandiseDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'expired-kit-draft',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_EXPIRED' });
    expect(await Campaign.countDocuments({ tenantId: tenant._id })).toBe(0);
    expect(await Order.countDocuments({ tenantId: tenant._id })).toBe(0);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'campaign_spend' })).toBe(0);
  });

  it('rejects the wrong role, another tenant, a short wallet, and a stale launch', async () => {
    const finance = await makeUser(tenant, 'company_finance_user', 'tenant');
    await expect(prepareMerchandiseDraft({
      tenantId: tenant._id,
      actorUserId: finance.user._id,
      input: draftInput(),
    })).rejects.toMatchObject({ status: 403 });

    const other = await makeTenant({ slug: 'other-kit' });
    const outsider = await makeUser(other, 'company_admin', 'tenant');
    await expect(prepareMerchandiseDraft({
      tenantId: other._id,
      actorUserId: outsider.user._id,
      input: draftInput(),
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const poor = await makeFundedWallet(tenant, { name: 'Small', amount: 100 });
    const poorEntity = await makeEntity(tenant, poor, 'Small');
    await expect(prepareMerchandiseDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: draftInput({ entityId: String(poorEntity._id), name: 'Too expensive' }),
    })).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    expect(await Campaign.countDocuments({ tenantId: tenant._id })).toBe(0);

    const prepared = await prepareMerchandiseDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: draftInput(),
    });
    const saved = await executeMerchandiseDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: draftInput(),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'kit-draft-stale',
    });
    const launchPreview = await prepareMerchandiseLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: saved.id },
    });
    await ledger.createTransaction({
      tenantId: tenant._id,
      walletId: wallet._id,
      type: 'fund_in',
      amount: 25,
    });
    await expect(executeMerchandiseLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: saved.id },
      confirmationId: launchPreview.confirmationId,
      idempotencyKey: 'stale-kit-launch',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'campaign_spend' })).toBe(0);

    const first = await prepareMerchandiseLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: saved.id },
    });
    const second = await prepareMerchandiseLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: saved.id },
    });
    await Promise.allSettled([
      executeMerchandiseLaunch({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: { campaignId: saved.id },
        confirmationId: first.confirmationId,
        idempotencyKey: 'kit-race-a',
      }),
      executeMerchandiseLaunch({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: { campaignId: saved.id },
        confirmationId: second.confirmationId,
        idempotencyKey: 'kit-race-b',
      }),
    ]);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'campaign_spend' })).toBe(1);
    expect(await Order.countDocuments({ tenantId: tenant._id, campaignId: saved.id })).toBe(1);
    expect((await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id })).balance).toBe(10_025 - 500);
  });

  it('keeps a single-location address out of the preview', async () => {
    const prepared = await prepareMerchandiseDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: draftInput({
        name: 'Office drop',
        fulfillmentMode: 'single',
        singleLocation: {
          name: 'Front desk',
          email: 'desk@test.io',
          line1: 'SECRET-STREET',
          city: 'Hyderabad',
          state: 'Telangana',
          pincode: '500001',
        },
      }),
    });
    expect(prepared.preview.fulfillment).toBe('single_location');
    expect(JSON.stringify(prepared)).not.toContain('desk@test.io');
    expect(JSON.stringify(prepared)).not.toContain('SECRET-STREET');
    expect(await Campaign.countDocuments({ tenantId: tenant._id })).toBe(0);
  });
});

  it('keeps a claimed kit invitation unresolved after a failed or crashed replay', async () => {
    const prepared = await prepareMerchandiseDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: draftInput(),
    });
    const saved = await executeMerchandiseDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: draftInput(),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'kit-unresolved-draft',
    });
    const launchPreview = await prepareMerchandiseLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: saved.id },
    });
    await executeMerchandiseLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: saved.id },
      confirmationId: launchPreview.confirmationId,
      idempotencyKey: 'kit-unresolved-launch',
    });
    const sent = vi.mocked(notify).mock.calls.length;
    await Recipient.updateMany(
      { tenantId: tenant._id, campaignId: saved.id },
      { $set: { invitedAt: null, inviteClaimedAt: new Date() } },
    );
    await Campaign.updateOne(
      { _id: saved.id, tenantId: tenant._id },
      { $set: { 'schedule.invitesUnresolved': false } },
    );
    await McpWriteIdempotency.updateOne(
      { key: 'kit-unresolved-launch', tenantId: tenant._id },
      { $set: { status: 'failed', result: null, errorCode: 'MCP_WRITE_FAILED', leaseExpiresAt: new Date(0) } },
    );
    const replayed = await Promise.all([0, 1].map(() => executeMerchandiseLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: saved.id },
      confirmationId: launchPreview.confirmationId,
      idempotencyKey: 'kit-unresolved-launch',
    })));
    for (const result of replayed) {
      expect(result.invitationsUnresolved).toBe(true);
      expect(result.invitationsSent).toBe(0);
    }
    expect(vi.mocked(notify).mock.calls.length).toBe(sent);
    expect(await Order.countDocuments({ tenantId: tenant._id })).toBe(1);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'campaign_spend' })).toBe(1);

    await McpWriteIdempotency.updateOne(
      { key: 'kit-unresolved-launch', tenantId: tenant._id },
      { $set: { status: 'pending', result: null, errorCode: '', leaseOwner: 'crashed', leaseExpiresAt: new Date(0) } },
    );
    const crashed = await executeMerchandiseLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: saved.id },
      confirmationId: launchPreview.confirmationId,
      idempotencyKey: 'kit-unresolved-launch',
    });
    expect(crashed.invitationsUnresolved).toBe(true);
    expect(crashed.invitationsSent).toBe(0);
    expect(vi.mocked(notify).mock.calls.length).toBe(sent);
  });

  it('reports an unresolved single-location kit invite without sending it again', async () => {
    const input = draftInput({
      name: 'Desk kits',
      fulfillmentMode: 'single',
      singleLocation: {
        name: 'Front desk',
        email: 'desk@test.io',
        line1: 'SECRET-STREET',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500001',
      },
    });
    const prepared = await prepareMerchandiseDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
    });
    const saved = await executeMerchandiseDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'single-draft',
    });
    const launchPreview = await prepareMerchandiseLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: saved.id },
    });
    const launched = await executeMerchandiseLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: saved.id },
      confirmationId: launchPreview.confirmationId,
      idempotencyKey: 'single-launch',
    });
    expect(launched.invitationsUnresolved).toBe(false);
    expect(JSON.stringify(launched)).not.toContain('desk@test.io');
    const sent = vi.mocked(notify).mock.calls.length;
    await Campaign.updateOne(
      { _id: saved.id, tenantId: tenant._id },
      { $set: { 'schedule.invitesSentAt': null, 'schedule.inviteClaimedAt': new Date(), 'schedule.invitesUnresolved': false } },
    );
    await McpWriteIdempotency.updateOne(
      { key: 'single-launch', tenantId: tenant._id },
      { $set: { status: 'failed', result: null, errorCode: 'MCP_WRITE_FAILED', leaseExpiresAt: new Date(0) } },
    );
    const replayed = await executeMerchandiseLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: saved.id },
      confirmationId: launchPreview.confirmationId,
      idempotencyKey: 'single-launch',
    });
    expect(replayed.invitationsUnresolved).toBe(true);
    expect(replayed.invitationsSent).toBe(0);
    expect(JSON.stringify(replayed)).not.toContain('desk@test.io');
    expect(JSON.stringify(replayed)).not.toContain('SECRET-STREET');
    expect(vi.mocked(notify).mock.calls.length).toBe(sent);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'campaign_spend' })).toBe(1);
  });

  it('shows a department manager their remaining budget and refuses another tenant', async () => {
    await ledger.createTransaction({
      tenantId: tenant._id,
      walletId: wallet._id,
      type: 'allocation_to_entity',
      amount: 3_000,
      relatedEntityId: entity._id,
    });
    const manager = await makeUser(tenant, 'entity_manager', 'entity', { assignedEntityIds: [entity._id] });
    const prepared = await prepareMerchandiseDraft({
      tenantId: tenant._id,
      actorUserId: manager.user._id,
      input: draftInput(),
    });
    expect(prepared.preview.walletImpact).toMatchObject({
      balance: 3_000,
      unallocatedAmount: 3_000,
    });
    expect(JSON.stringify(prepared.preview)).not.toContain('10000');
    expect(JSON.stringify(prepared.preview)).not.toContain('7000');

    const other = await makeTenant({ slug: 'kit-other' });
    const outsider = await makeUser(other, 'entity_manager', 'entity', { assignedEntityIds: [] });
    await expect(prepareMerchandiseDraft({
      tenantId: tenant._id,
      actorUserId: outsider.user._id,
      input: draftInput(),
    })).rejects.toMatchObject({ code: 'ACTOR_INACTIVE' });
  });

describe('kit campaign MCP tools', () => {
  it('keeps campaigns:merchandise off the initial challenge and preserves existing tools', async () => {
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
    expect(anonymous.headers['www-authenticate']).not.toContain('campaigns:merchandise');
    const metadata = await request(app).get('/.well-known/oauth-protected-resource/mcp');
    expect(metadata.body.scopes_supported).not.toContain('campaigns:merchandise');
    const discovery = await request(app).get('/.well-known/oauth-authorization-server');
    expect(discovery.body.scopes_supported).toContain('campaigns:merchandise');

    const readOnly = await issueOauth(admin, 'catalog:read');
    const denied = await mcpRequest(readOnly, 'tools/call', {
      name: 'campaigns_prepare_merchandise_draft',
      arguments: draftInput(),
    });
    expect(denied.status).toBe(403);
    expect(`${denied.headers['www-authenticate'] || ''} ${JSON.stringify(denied.body)}`).toContain('campaigns:merchandise');

    const writeToken = await issueOauth(admin, 'catalog:read campaigns:merchandise');
    const binding = await OauthGrantBinding.findOne({ userId: admin.user._id, scopes: 'campaigns:merchandise' }).lean();
    expect(binding.scopes).toEqual(['catalog:read', 'campaigns:merchandise']);
    const names = rpcBody(await mcpRequest(writeToken, 'tools/list')).result.tools.map((tool) => tool.name);
    for (const tool of PRIOR_TOOLS) expect(names).toContain(tool);
    expect(names).toEqual(expect.arrayContaining([
      'campaigns_prepare_merchandise_draft',
      'campaigns_execute_merchandise_draft',
      'campaigns_prepare_merchandise_launch',
      'campaigns_execute_merchandise_launch',
      'shops_prepare_collection_draft',
      'shops_execute_collection_draft',
      'shops_prepare_collection_publish',
      'shops_execute_collection_publish',
      'shops_prepare_publish',
      'shops_execute_publish',
      'shops_get_categories',
      'shops_prepare_categories_update',
      'shops_execute_categories_update',
    ]));
  });
});
