import { createHash, randomBytes } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Campaign } from '../src/modules/campaigns/campaign.model.js';
import { Entity } from '../src/modules/entities/entity.model.js';
import { Recipient } from '../src/modules/campaigns/recipient.model.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';
import { WalletTransaction } from '../src/modules/wallets/walletTransaction.model.js';
import { Order } from '../src/modules/orders/order.model.js';
import { AuditLog } from '../src/modules/auditLogs/auditLog.model.js';
import { OauthGrantBinding } from '../src/modules/oauth/oauthGrantBinding.model.js';
import { McpWriteIdempotency } from '../src/modules/mcp/mcpWriteIdempotency.model.js';
import { LOCAL_OAUTH_CLIENT_ID, LOCAL_OAUTH_REDIRECT_URI, mcpResourceUrl } from '../src/modules/oauth/oauth.config.js';
import { notify } from '../src/modules/notifications/notifications.service.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import * as ledger from '../src/services/ledger.service.js';
import { authHeader, makeEntity, makeFundedWallet, makeTenant, makeUser } from './helpers.js';
import {
  executeCreditAllocation,
  executeLaunch,
  prepareCreditAllocation,
  prepareLaunch,
} from '../src/modules/mcp/campaignsSendWrite.js';

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
];

let app;
let tenant;
let admin;
let wallet;
let entity;
let campaign;

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
    state: 'campaign-send',
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
  tenant = await makeTenant({ slug: 'campaign-send' });
  admin = await makeUser(tenant, 'company_admin', 'tenant');
  wallet = await makeFundedWallet(tenant, { name: 'Operating', amount: 10_000 });
  entity = await makeEntity(tenant, wallet, 'Marketing');
  campaign = await Campaign.create({
    tenantId: tenant._id,
    entityId: entity._id,
    name: 'Welcome points',
    type: 'points',
    status: 'recipients_uploaded',
    paymentMode: 'wallet',
    schedule: { mode: 'now' },
    createdBy: admin.user._id,
  });
  await Recipient.create({
    tenantId: tenant._id,
    campaignId: campaign._id,
    name: 'Ada',
    email: 'hidden-recipient@test.io',
    redemptionToken: 'super-secret-token',
  });
  await Recipient.create({
    tenantId: tenant._id,
    campaignId: campaign._id,
    name: 'Bea',
    email: 'second-hidden@test.io',
    redemptionToken: 'second-secret-token',
  });
});

function creditInput(amount = 250) {
  return { campaignId: String(campaign._id), creditsPerRecipient: amount };
}

describe('reward credits and launch', () => {
  it('previews credits without debiting or storing them', async () => {
    const prepared = await prepareCreditAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: creditInput(),
    });
    expect(prepared.preview).toMatchObject({
      recipientCount: 2,
      creditsPerRecipient: 250,
      totalBudget: 500,
      status: 'approved',
      walletImpact: { debitedNow: 0, requiredAtLaunch: 500, balance: 10_000, unallocatedAmount: 10_000 },
    });
    const stored = await Campaign.findOne({ _id: campaign._id, tenantId: tenant._id });
    expect(stored.status).toBe('recipients_uploaded');
    expect(stored.totalBudget).toBe(0);
    expect((await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id })).balance).toBe(10_000);
    expect(JSON.stringify(prepared)).not.toContain('hidden-recipient@test.io');
    expect(JSON.stringify(prepared)).not.toContain('super-secret-token');
    await expect(prepareCreditAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: creditInput(100),
    })).rejects.toMatchObject({ code: 'BUDGET_TOO_LOW' });
  });

  it('allocates credits once, then launches and invites once across retries', async () => {
    const prepared = await prepareCreditAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: creditInput(),
    });
    const credited = await executeCreditAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: creditInput(),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'credits-1',
    });
    expect(credited).toMatchObject({ status: 'approved', totalBudget: 500, balance: 10_000 });
    expect((await Recipient.findOne({ campaignId: campaign._id, tenantId: tenant._id })).creditAmount).toBe(250);
    const creditRow = await McpWriteIdempotency.findOne({ key: 'credits-1', tenantId: tenant._id });
    await McpWriteIdempotency.updateOne(
      { _id: creditRow._id, tenantId: tenant._id },
      { $set: { status: 'pending', result: null, leaseOwner: 'replica-a', leaseExpiresAt: new Date(0) } },
    );
    const recoveredCredits = await executeCreditAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: creditInput(),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'credits-1',
    });
    expect(recoveredCredits.totalBudget).toBe(500);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'campaign_spend' })).toBe(0);

    const launchPreview = await prepareLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
    });
    expect(launchPreview.preview).toMatchObject({
      status: 'redemption_open',
      recipientCount: 2,
      totalBudget: 500,
      invitations: 2,
      walletImpact: { debitedNow: 500, balanceBefore: 10_000, balanceAfter: 9_500 },
    });
    expect((await Campaign.findOne({ _id: campaign._id, tenantId: tenant._id })).status).toBe('approved');

    const launched = await executeLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
      confirmationId: launchPreview.confirmationId,
      idempotencyKey: 'launch-1',
    });
    expect(launched.status).toBe('redemption_open');
    expect(launched.balance).toBe(9_500);
    expect(launched.invitationsSent).toBe(2);
    expect(launched.invitationsUnresolved).toBe(false);
    expect(JSON.stringify(launched)).not.toContain('hidden-recipient@test.io');
    expect(JSON.stringify(launched)).not.toContain('super-secret-token');
    expect(await Order.countDocuments({ tenantId: tenant._id })).toBe(0);
    expect(vi.mocked(notify).mock.calls.length).toBe(2);

    const launchRow = await McpWriteIdempotency.findOne({ key: 'launch-1', tenantId: tenant._id });
    await McpWriteIdempotency.updateOne(
      { _id: launchRow._id, tenantId: tenant._id },
      { $set: { status: 'pending', result: null, leaseOwner: 'replica-b', leaseExpiresAt: new Date(0) } },
    );
    const recoveredLaunch = await executeLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
      confirmationId: launchPreview.confirmationId,
      idempotencyKey: 'launch-1',
    });
    expect(recoveredLaunch.balance).toBe(9_500);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'campaign_spend' })).toBe(1);
    expect(vi.mocked(notify).mock.calls.length).toBe(2);
    const audits = JSON.stringify(await AuditLog.find({ tenantId: tenant._id }).lean());
    expect(audits).toContain('campaign.launch');
    expect(audits).not.toContain('super-secret-token');
  });

  it('rejects the wrong role, another tenant, a stale wallet, and a second debit', async () => {
    const finance = await makeUser(tenant, 'company_finance_user', 'tenant');
    await expect(prepareCreditAllocation({
      tenantId: tenant._id,
      actorUserId: finance.user._id,
      input: creditInput(),
    })).rejects.toMatchObject({ status: 403 });

    const other = await makeTenant({ slug: 'other-send' });
    const outsider = await makeUser(other, 'company_admin', 'tenant');
    const foreignWallet = await makeFundedWallet(other, { amount: 5_000 });
    const foreignEntity = await makeEntity(other, foreignWallet, 'Foreign');
    const manager = await makeUser(tenant, 'entity_manager', 'entity', { assignedEntityIds: [foreignEntity._id] });
    await expect(prepareCreditAllocation({
      tenantId: tenant._id,
      actorUserId: manager.user._id,
      input: creditInput(),
    })).rejects.toMatchObject({ status: 403 });
    await expect(prepareCreditAllocation({
      tenantId: other._id,
      actorUserId: outsider.user._id,
      input: creditInput(),
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const prepared = await prepareCreditAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: creditInput(),
    });
    await executeCreditAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: creditInput(),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'credits-auth',
    });
    const launchPreview = await prepareLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
    });
    await ledger.createTransaction({
      tenantId: tenant._id,
      walletId: wallet._id,
      type: 'fund_in',
      amount: 25,
    });
    await expect(executeLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
      confirmationId: launchPreview.confirmationId,
      idempotencyKey: 'stale-launch',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'campaign_spend' })).toBe(0);

    const fresh = await prepareLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
    });
    const second = await prepareLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
    });
    await Promise.allSettled([
      executeLaunch({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: { campaignId: String(campaign._id) },
        confirmationId: fresh.confirmationId,
        idempotencyKey: 'race-launch-a',
      }),
      executeLaunch({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: { campaignId: String(campaign._id) },
        confirmationId: second.confirmationId,
        idempotencyKey: 'race-launch-b',
      }),
    ]);
    expect((await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id })).balance).toBe(10_025 - 500);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'campaign_spend' })).toBe(1);
  });
});

  it('reports a claimed invitation as unresolved and does not send it again', async () => {
    const prepared = await prepareCreditAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: creditInput(),
    });
    await executeCreditAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: creditInput(),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'credits-unresolved',
    });
    const launchPreview = await prepareLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
    });
    const launched = await executeLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
      confirmationId: launchPreview.confirmationId,
      idempotencyKey: 'launch-unresolved',
    });
    expect(launched.invitationsSent).toBe(2);
    const sent = vi.mocked(notify).mock.calls.length;
    await Recipient.updateMany(
      { tenantId: tenant._id, campaignId: campaign._id },
      { $set: { invitedAt: null, inviteClaimedAt: new Date() } },
    );
    await Campaign.updateOne(
      { _id: campaign._id, tenantId: tenant._id },
      { $set: { 'schedule.invitesUnresolved': true } },
    );
    await McpWriteIdempotency.updateOne(
      { key: 'launch-unresolved', tenantId: tenant._id },
      { $set: { status: 'failed', result: null, errorCode: 'MCP_WRITE_FAILED', leaseOwner: '', leaseExpiresAt: new Date(0) } },
    );
    const replayed = await Promise.all([0, 1].map(() => executeLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
      confirmationId: launchPreview.confirmationId,
      idempotencyKey: 'launch-unresolved',
    })));
    for (const result of replayed) {
      expect(result.invitationsUnresolved).toBe(true);
      expect(result.invitationsSent).toBe(0);
      expect(result.status).toBe('redemption_open');
    }
    expect(vi.mocked(notify).mock.calls.length).toBe(sent);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'campaign_spend' })).toBe(1);
    expect((await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id })).balance).toBe(9_500);

    await McpWriteIdempotency.updateOne(
      { key: 'launch-unresolved', tenantId: tenant._id },
      { $set: { status: 'pending', result: null, errorCode: '', leaseOwner: 'crashed', leaseExpiresAt: new Date(0) } },
    );
    const crashed = await executeLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
      confirmationId: launchPreview.confirmationId,
      idempotencyKey: 'launch-unresolved',
    });
    expect(crashed.invitationsUnresolved).toBe(true);
    expect(crashed.invitationsSent).toBe(0);
    expect(vi.mocked(notify).mock.calls.length).toBe(sent);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'campaign_spend' })).toBe(1);
  });

describe('campaign send MCP tools', () => {
  it('keeps campaigns:send off the initial challenge and preserves existing tools', async () => {
    const password = 'correct-horse';
    const email = `admin-${tenant.slug}@test.io`;
    admin = await makeUser(tenant, 'company_admin', 'tenant', { email, password });
    campaign.createdBy = admin.user._id;
    await campaign.save();
    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    admin.token = login.body.accessToken;

    const anonymous = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(anonymous.headers['www-authenticate']).toContain('catalog:read');
    expect(anonymous.headers['www-authenticate']).not.toContain('campaigns:send');
    const metadata = await request(app).get('/.well-known/oauth-protected-resource/mcp');
    expect(metadata.body.scopes_supported).not.toContain('campaigns:send');
    const discovery = await request(app).get('/.well-known/oauth-authorization-server');
    expect(discovery.body.scopes_supported).toContain('campaigns:send');

    const readOnly = await issueOauth(admin, 'catalog:read');
    const denied = await mcpRequest(readOnly, 'tools/call', {
      name: 'campaigns_prepare_credit_allocation',
      arguments: creditInput(),
    });
    expect(denied.status).toBe(403);
    expect(`${denied.headers['www-authenticate'] || ''} ${JSON.stringify(denied.body)}`).toContain('campaigns:send');

    const writeToken = await issueOauth(admin, 'catalog:read campaigns:send');
    const binding = await OauthGrantBinding.findOne({ userId: admin.user._id, scopes: 'campaigns:send' }).lean();
    expect(binding.scopes).toEqual(['catalog:read', 'campaigns:send']);
    const names = rpcBody(await mcpRequest(writeToken, 'tools/list')).result.tools.map((tool) => tool.name);
    for (const tool of PRIOR_TOOLS) expect(names).toContain(tool);
    expect(names).toEqual(expect.arrayContaining([
      'campaigns_prepare_credit_allocation',
      'campaigns_execute_credit_allocation',
      'campaigns_prepare_launch',
      'campaigns_execute_launch',
    ]));
    const prepared = await mcpRequest(writeToken, 'tools/call', {
      name: 'campaigns_prepare_credit_allocation',
      arguments: creditInput(),
    });
    const preview = rpcBody(prepared).result;
    expect(preview.isError).not.toBe(true);
    expect(JSON.stringify(preview)).not.toContain('super-secret-token');
    expect((await Campaign.findOne({ _id: campaign._id, tenantId: tenant._id })).status).toBe('recipients_uploaded');
  });

  it('rejects fractional INR and launches a scheduled campaign without sending invites yet', async () => {
    await expect(prepareCreditAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: creditInput(250.5),
    })).rejects.toMatchObject({ code: 'VALIDATION' });

    campaign.schedule = { mode: 'scheduled', sendAt: new Date(Date.now() + 86_400_000), timezone: 'Asia/Kolkata' };
    await campaign.save();
    const credited = await prepareCreditAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: creditInput(500),
    });
    await executeCreditAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: creditInput(500),
      confirmationId: credited.confirmationId,
      idempotencyKey: 'sched-credits',
    });
    const preview = await prepareLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
    });
    expect(preview.preview).toMatchObject({ status: 'launched', deliveryMode: 'scheduled', invitations: 0 });
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'campaign_spend' })).toBe(0);
    const launched = await executeLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
      confirmationId: preview.confirmationId,
      idempotencyKey: 'sched-launch',
    });
    expect(launched.status).toBe('launched');
    expect(launched.invitationsSent).toBe(0);
    expect(launched.balance).toBe(9_000);
    const replay = await executeLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
      confirmationId: preview.confirmationId,
      idempotencyKey: 'sched-launch',
    });
    expect(replay.balance).toBe(9_000);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'campaign_spend' })).toBe(1);
    expect((await Recipient.findOne({ campaignId: campaign._id, tenantId: tenant._id })).creditAmount).toBe(0);
    expect(vi.mocked(notify).mock.calls.length).toBe(0);

    await McpWriteIdempotency.updateOne(
      { key: 'sched-launch', tenantId: tenant._id },
      { $set: { status: 'pending', result: null, leaseOwner: 'crashed', leaseExpiresAt: new Date(0) } },
    );
    const recovered = await executeLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
      confirmationId: preview.confirmationId,
      idempotencyKey: 'sched-launch',
    });
    expect(recovered.status).toBe('launched');
    expect(recovered.invitationsSent).toBe(0);
    expect(vi.mocked(notify).mock.calls.length).toBe(0);
    expect((await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id })).balance).toBe(9_000);

    await expect(executeLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
      confirmationId: preview.confirmationId,
      idempotencyKey: 'sched-launch-other',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_REUSED' });

    const again = await prepareLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
    });
    const second = await executeLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
      confirmationId: again.confirmationId,
      idempotencyKey: 'sched-launch-again',
    });
    expect(second.status).toBe('launched');
    expect(second.invitationsSent).toBe(0);
    expect(vi.mocked(notify).mock.calls.length).toBe(0);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'campaign_spend' })).toBe(1);
  });

  it('opens a self-share campaign without emailing invite links or exposing tokens', async () => {
    campaign.schedule = { mode: 'self' };
    await campaign.save();
    const credited = await prepareCreditAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: creditInput(250),
    });
    await executeCreditAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: creditInput(250),
      confirmationId: credited.confirmationId,
      idempotencyKey: 'self-credits',
    });
    expect((await Recipient.findOne({ campaignId: campaign._id, tenantId: tenant._id })).creditAmount).toBe(250);
    const preview = await prepareLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
    });
    expect(preview.preview).toMatchObject({ status: 'redemption_open', deliveryMode: 'self', invitations: 0 });
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'campaign_spend' })).toBe(0);
    const launched = await executeLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
      confirmationId: preview.confirmationId,
      idempotencyKey: 'self-launch',
    });
    expect(launched.status).toBe('redemption_open');
    expect(launched.invitationsSent).toBe(0);
    expect(launched.balance).toBe(9_500);
    expect(JSON.stringify(launched)).not.toContain('super-secret-token');
    expect(vi.mocked(notify).mock.calls.length).toBe(0);

    const again = await prepareLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
    });
    const second = await executeLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
      confirmationId: again.confirmationId,
      idempotencyKey: 'self-launch-again',
    });
    expect(second.invitationsSent).toBe(0);
    expect(second.balance).toBe(9_500);
    expect(vi.mocked(notify).mock.calls.length).toBe(0);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'campaign_spend' })).toBe(1);
    expect((await Recipient.findOne({ campaignId: campaign._id, tenantId: tenant._id })).creditAmount).toBe(250);
  });

  it('spends organization unallocated cash for a company admin and department budget for a manager', async () => {
    await ledger.createTransaction({
      tenantId: tenant._id,
      walletId: wallet._id,
      type: 'allocation_to_entity',
      amount: 3_000,
      relatedEntityId: entity._id,
    });
    const prepared = await prepareCreditAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: creditInput(250),
    });
    await executeCreditAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: creditInput(250),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'admin-unallocated-credits',
    });
    const preview = await prepareLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
    });
    expect(preview.preview.walletImpact).toMatchObject({
      debitedNow: 500,
      balance: 10_000,
      unallocatedAmount: 7_000,
      balanceBefore: 10_000,
      balanceAfter: 9_500,
      unallocatedBefore: 7_000,
      unallocatedAfter: 6_500,
    });
    const launchedAdmin = await executeLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
      confirmationId: preview.confirmationId,
      idempotencyKey: 'admin-unallocated-launch',
    });
    expect(launchedAdmin).toMatchObject({ balance: 9_500, unallocatedAmount: 6_500 });
    const afterAdmin = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    const marketing = await Entity.findOne({ _id: entity._id, tenantId: tenant._id });
    const adminSpend = await WalletTransaction.findOne({ tenantId: tenant._id, type: 'campaign_spend' });
    expect(afterAdmin.balance).toBe(9_500);
    expect(afterAdmin.allocatedAmount).toBe(3_000);
    expect(marketing.spentAmount).toBe(0);
    expect(adminSpend.relatedEntityId).toBeFalsy();
    expect(adminSpend.amount).toBe(-500);
  });

  it('debits a department manager from that department allocation only', async () => {
    await ledger.createTransaction({
      tenantId: tenant._id,
      walletId: wallet._id,
      type: 'allocation_to_entity',
      amount: 3_000,
      relatedEntityId: entity._id,
    });
    const manager = await makeUser(tenant, 'entity_manager', 'entity', { assignedEntityIds: [entity._id] });
    const prepared = await prepareCreditAllocation({
      tenantId: tenant._id,
      actorUserId: manager.user._id,
      input: creditInput(250),
    });
    expect(prepared.preview.walletImpact).toMatchObject({
      balance: 3_000,
      unallocatedAmount: 3_000,
    });
    expect(JSON.stringify(prepared.preview)).not.toContain('10000');
    expect(JSON.stringify(prepared.preview)).not.toContain('7000');
    const credited = await executeCreditAllocation({
      tenantId: tenant._id,
      actorUserId: manager.user._id,
      input: creditInput(250),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'manager-budget-credits',
    });
    expect(credited).toMatchObject({ balance: 3_000, unallocatedAmount: 3_000 });
    expect(JSON.stringify(credited)).not.toContain('10000');
    expect(JSON.stringify(credited)).not.toContain('7000');
    const preview = await prepareLaunch({
      tenantId: tenant._id,
      actorUserId: manager.user._id,
      input: { campaignId: String(campaign._id) },
    });
    expect(preview.preview.walletImpact).toMatchObject({
      debitedNow: 500,
      balance: 3_000,
      unallocatedAmount: 3_000,
      balanceBefore: 3_000,
      balanceAfter: 2_500,
      unallocatedBefore: 3_000,
      unallocatedAfter: 2_500,
    });
    expect(JSON.stringify(preview.preview)).not.toContain('10000');
    expect(JSON.stringify(preview.preview)).not.toContain('7000');
    expect(JSON.stringify(preview.preview)).not.toContain('9500');
    const launched = await executeLaunch({
      tenantId: tenant._id,
      actorUserId: manager.user._id,
      input: { campaignId: String(campaign._id) },
      confirmationId: preview.confirmationId,
      idempotencyKey: 'manager-budget-launch',
    });
    expect(launched).toMatchObject({ balance: 2_500, unallocatedAmount: 2_500 });
    expect(JSON.stringify(launched)).not.toContain('9500');
    expect(JSON.stringify(launched)).not.toContain('7000');
    expect(JSON.stringify(launched)).not.toContain('10000');
    const after = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    const marketing = await Entity.findOne({ _id: entity._id, tenantId: tenant._id });
    const spend = await WalletTransaction.findOne({ tenantId: tenant._id, type: 'campaign_spend' });
    expect(after.balance).toBe(9_500);
    expect(after.allocatedAmount).toBe(2_500);
    expect(marketing.spentAmount).toBe(500);
    expect(String(spend.relatedEntityId)).toBe(String(entity._id));
  });
});
