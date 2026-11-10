import { createHash, randomBytes } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';
import { WalletTransaction } from '../src/modules/wallets/walletTransaction.model.js';
import { Entity } from '../src/modules/entities/entity.model.js';
import { AuditLog } from '../src/modules/auditLogs/auditLog.model.js';
import { OauthGrantBinding } from '../src/modules/oauth/oauthGrantBinding.model.js';
import { McpWriteIdempotency } from '../src/modules/mcp/mcpWriteIdempotency.model.js';
import { McpWriteConfirmation } from '../src/modules/mcp/mcpWriteConfirmation.model.js';
import { LOCAL_OAUTH_CLIENT_ID, LOCAL_OAUTH_REDIRECT_URI, mcpResourceUrl } from '../src/modules/oauth/oauth.config.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import * as ledger from '../src/services/ledger.service.js';
import { authHeader, makeEntity, makeFundedWallet, makeTenant, makeUser } from './helpers.js';
import {
  executeBudgetAllocation,
  prepareBudgetAllocation,
} from '../src/modules/mcp/budgetsWrite.js';

const budgetEmails = vi.hoisted(() => []);
vi.mock('../src/services/email.service.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    sendBudgetAllocatedEmail: vi.fn(async (payload) => {
      budgetEmails.push(payload.to);
      return { success: true };
    }),
  };
});

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
  'shops_prepare_catalog_update',
  'shops_execute_catalog_update',
];

let app;
let tenant;
let admin;
let wallet;
let marketing;
let sales;

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
    state: 'budget-allocate',
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
  budgetEmails.length = 0;
  tenant = await makeTenant({ slug: 'budget-allocate' });
  admin = await makeUser(tenant, 'company_admin', 'tenant');
  wallet = await makeFundedWallet(tenant, { name: 'Operating', amount: 1_000 });
  const manager = await makeUser(tenant, 'entity_manager', 'entity', {
    email: 'manager-budget@test.io',
    name: 'Mina Manager',
  });
  marketing = await makeEntity(tenant, wallet, 'Marketing', { managerUserId: manager.user._id });
  sales = await makeEntity(tenant, wallet, 'Sales');
});

function input(lines) {
  return {
    walletId: String(wallet._id),
    allocations: lines.map((line) => ({ entityId: String(line.entityId), amount: line.amount })),
  };
}

describe('department budget allocation', () => {
  it('previews a positive allocation without moving money', async () => {
    const before = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    const prepared = await prepareBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([{ entityId: marketing._id, amount: 250 }]),
    });
    const after = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    expect(after.balance).toBe(before.balance);
    expect(after.allocatedAmount).toBe(0);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'allocation_to_entity' })).toBe(0);
    expect(prepared.preview.netChange).toBe(250);
    expect(prepared.preview.before).toMatchObject({ balance: 1000, allocatedAmount: 0, unallocatedAmount: 1000 });
    expect(prepared.preview.after).toMatchObject({ balance: 1000, allocatedAmount: 250, unallocatedAmount: 750 });
    expect(prepared.preview.departments).toEqual([
      expect.objectContaining({
        entityId: String(marketing._id),
        name: 'Marketing',
        amount: 250,
        beforeAllocated: 0,
        afterAllocated: 250,
        beforeUnspent: 0,
        afterUnspent: 250,
      }),
    ]);
    expect(prepared.preview.notifications).toEqual([
      { entityId: String(marketing._id), departmentName: 'Marketing' },
    ]);
    expect(JSON.stringify(prepared)).not.toContain('manager-budget@test.io');
  });

  it('allocates and returns budget once, and blocks spent funds', async () => {
    const prepared = await prepareBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([
        { entityId: marketing._id, amount: 400 },
        { entityId: sales._id, amount: 100 },
      ]),
    });
    const updated = await executeBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([
        { entityId: marketing._id, amount: 400 },
        { entityId: sales._id, amount: 100 },
      ]),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'budget-give',
    });
    expect(updated.allocatedAmount).toBe(500);
    expect(updated.unallocatedAmount).toBe(500);
    expect(updated.balance).toBe(1000);
    expect(JSON.stringify(updated)).not.toContain('manager-budget@test.io');
    const stamped = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    const replay = await executeBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([
        { entityId: marketing._id, amount: 400 },
        { entityId: sales._id, amount: 100 },
      ]),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'budget-give',
    });
    expect(replay.allocatedAmount).toBe(500);
    const again = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    expect(again.updatedAt.toISOString()).toBe(stamped.updatedAt.toISOString());
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'allocation_to_entity' })).toBe(2);
    expect(budgetEmails).toEqual(['manager-budget@test.io']);

    const row = await McpWriteIdempotency.findOne({ key: 'budget-give', tenantId: tenant._id });
    await McpWriteIdempotency.updateOne(
      { _id: row._id, tenantId: tenant._id },
      { $set: { status: 'pending', result: null, leaseOwner: 'replica-a', leaseExpiresAt: new Date(0) } },
    );
    const recovered = await executeBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([
        { entityId: marketing._id, amount: 400 },
        { entityId: sales._id, amount: 100 },
      ]),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'budget-give',
    });
    expect(recovered.allocatedAmount).toBe(500);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'allocation_to_entity' })).toBe(2);
    expect(budgetEmails).toEqual(['manager-budget@test.io']);

    const release = await prepareBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([{ entityId: sales._id, amount: -40 }]),
    });
    const released = await executeBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([{ entityId: sales._id, amount: -40 }]),
      confirmationId: release.confirmationId,
      idempotencyKey: 'budget-return',
    });
    expect(released.allocatedAmount).toBe(460);
    expect((await Entity.findOne({ _id: sales._id, tenantId: tenant._id })).allocatedAmount).toBe(60);

    await ledger.createTransaction({
      tenantId: tenant._id,
      walletId: wallet._id,
      type: 'campaign_spend',
      amount: -50,
      relatedEntityId: marketing._id,
    });
    await expect(prepareBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([{ entityId: marketing._id, amount: -360 }]),
    })).rejects.toMatchObject({ code: 'ALLOCATION_EXCEEDS_UNSPENT' });
    expect((await Entity.findOne({ _id: marketing._id, tenantId: tenant._id })).allocatedAmount).toBe(400);
  });

  it('prepares against ledger truth without repairing dirty wallet caches', async () => {
    await ledger.allocateToEntities({
      tenantId: tenant._id,
      walletId: wallet._id,
      allocations: [{ entityId: marketing._id, amount: 100 }],
    });
    await Wallet.updateOne(
      { _id: wallet._id, tenantId: tenant._id },
      { $set: { balance: 999_999, allocatedAmount: 0 } },
    );
    await Entity.updateOne(
      { _id: marketing._id, tenantId: tenant._id },
      { $set: { allocatedAmount: 0, spentAmount: 0 } },
    );
    const dirtyWallet = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id }).lean();
    const dirtyEntity = await Entity.findOne({ _id: marketing._id, tenantId: tenant._id }).lean();

    const prepared = await prepareBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([{ entityId: marketing._id, amount: 50 }]),
    });
    expect(prepared.preview.before).toMatchObject({
      balance: 1_000,
      allocatedAmount: 100,
      unallocatedAmount: 900,
    });
    expect(prepared.preview.departments[0]).toMatchObject({
      beforeAllocated: 100,
      afterAllocated: 150,
    });

    const afterPrepare = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id }).lean();
    expect(afterPrepare.balance).toBe(999_999);
    expect(afterPrepare.allocatedAmount).toBe(0);
    expect(new Date(afterPrepare.updatedAt).toISOString()).toBe(new Date(dirtyWallet.updatedAt).toISOString());
    const entityAfter = await Entity.findOne({ _id: marketing._id, tenantId: tenant._id }).lean();
    expect(entityAfter).toMatchObject({ allocatedAmount: 0, spentAmount: 0 });
    expect(new Date(entityAfter.updatedAt).toISOString()).toBe(new Date(dirtyEntity.updatedAt).toISOString());
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'allocation_to_entity' })).toBe(1);
  });

  it('applies a Marketing ₹5,000→₹7,000 top-up, ignores metadata churn, and rejects bad execute args', async () => {
    wallet = await makeFundedWallet(tenant, { name: 'OrgTopup', amount: 500_000 });
    marketing = await makeEntity(tenant, wallet, 'Marketing', {
      managerUserId: (await makeUser(tenant, 'entity_manager', 'entity', {
        email: 'topup-manager@test.io',
        name: 'Topup Manager',
      })).user._id,
    });
    sales = await makeEntity(tenant, wallet, 'Sales');
    await ledger.allocateToEntities({
      tenantId: tenant._id,
      walletId: wallet._id,
      allocations: [{ entityId: marketing._id, amount: 5_000 }],
    });

    const prepared = await prepareBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([{ entityId: marketing._id, amount: 2_000 }]),
    });
    expect(prepared.preview.departments[0]).toMatchObject({
      beforeAllocated: 5_000,
      afterAllocated: 7_000,
      amount: 2_000,
    });
    expect(prepared.preview.before.unallocatedAmount).toBe(495_000);
    expect(prepared.preview.after.unallocatedAmount).toBe(493_000);

    const touched = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    touched.name = 'OrgTopup Renamed';
    await touched.save();

    const executed = await executeBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([{ entityId: marketing._id, amount: 2_000 }]),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'marketing-topup-2000',
    });
    expect(executed).toMatchObject({
      allocatedAmount: 7_000,
      unallocatedAmount: 493_000,
      netChange: 2_000,
    });
    expect(executed.departments[0]).toMatchObject({
      entityId: String(marketing._id),
      name: 'Marketing',
      allocatedAmount: 7_000,
    });

    const replay = await executeBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([{ entityId: marketing._id, amount: 2_000 }]),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'marketing-topup-2000',
    });
    expect(replay.allocatedAmount).toBe(7_000);
    expect(await WalletTransaction.countDocuments({
      tenantId: tenant._id,
      type: 'allocation_to_entity',
      relatedEntityId: marketing._id,
    })).toBe(2);

    const mismatched = await prepareBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([{ entityId: marketing._id, amount: 1_000 }]),
    });
    await expect(executeBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([{ entityId: marketing._id, amount: 8_000 }]),
      confirmationId: mismatched.confirmationId,
      idempotencyKey: 'marketing-absolute-mistake',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_MISMATCH' });

    const expiredPrep = await prepareBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([{ entityId: marketing._id, amount: 500 }]),
    });
    await McpWriteConfirmation.updateOne(
      { tenantId: tenant._id, confirmationId: expiredPrep.confirmationId },
      { $set: { expiresAt: new Date(0) } },
    );
    await expect(executeBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([{ entityId: marketing._id, amount: 500 }]),
      confirmationId: expiredPrep.confirmationId,
      idempotencyKey: 'marketing-expired',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_EXPIRED' });
    expect((await Entity.findOne({ _id: marketing._id, tenantId: tenant._id })).allocatedAmount).toBe(7_000);
  });

  it('invalidates confirmation when spending changes department unspent budget', async () => {
    await ledger.allocateToEntities({
      tenantId: tenant._id,
      walletId: wallet._id,
      allocations: [{ entityId: marketing._id, amount: 400 }],
    });
    const prepared = await prepareBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([{ entityId: marketing._id, amount: -100 }]),
    });
    await ledger.createTransaction({
      tenantId: tenant._id,
      walletId: wallet._id,
      type: 'campaign_spend',
      amount: -50,
      relatedEntityId: marketing._id,
    });
    await expect(executeBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([{ entityId: marketing._id, amount: -100 }]),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'spend-stale',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });
  });

  it('rejects overspending, other roles, other tenants, stale state, and concurrent doubles', async () => {
    await expect(prepareBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([{ entityId: marketing._id, amount: 2_000 }]),
    })).rejects.toMatchObject({ code: 'ALLOCATION_EXCEEDS_BALANCE' });
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'allocation_to_entity' })).toBe(0);

    const manager = await makeUser(tenant, 'entity_manager', 'entity', { assignedEntityIds: [marketing._id] });
    await expect(prepareBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: manager.user._id,
      input: input([{ entityId: marketing._id, amount: 10 }]),
    })).rejects.toMatchObject({ status: 403 });
    const rejected = JSON.stringify(await AuditLog.find({ tenantId: tenant._id }).lean());
    expect(rejected).toContain('mcp_write.rejected');

    const other = await makeTenant({ slug: 'other-budget' });
    const outsider = await makeUser(other, 'company_admin', 'tenant');
    const foreignWallet = await makeFundedWallet(other, { amount: 500 });
    await expect(prepareBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { walletId: String(foreignWallet._id), allocations: [{ entityId: String(marketing._id), amount: 10 }] },
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const foreignEntity = await makeEntity(other, foreignWallet, 'Foreign');
    await expect(prepareBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([{ entityId: foreignEntity._id, amount: 10 }]),
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const stale = await prepareBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([{ entityId: marketing._id, amount: 100 }]),
    });
    await ledger.allocateToEntities({
      tenantId: tenant._id,
      walletId: wallet._id,
      allocations: [{ entityId: sales._id, amount: 25 }],
    });
    await expect(executeBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([{ entityId: marketing._id, amount: 100 }]),
      confirmationId: stale.confirmationId,
      idempotencyKey: 'stale-budget',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });
    expect((await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id })).allocatedAmount).toBe(25);

    const owned = await prepareBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([{ entityId: marketing._id, amount: 15 }]),
    });
    await expect(executeBudgetAllocation({
      tenantId: other._id,
      actorUserId: outsider.user._id,
      input: input([{ entityId: marketing._id, amount: 15 }]),
      confirmationId: owned.confirmationId,
      idempotencyKey: 'cross-budget',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_INVALID' });

    const first = await prepareBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([{ entityId: marketing._id, amount: 700 }]),
    });
    const second = await prepareBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: input([{ entityId: sales._id, amount: 700 }]),
    });
    const raced = await Promise.allSettled([
      executeBudgetAllocation({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: input([{ entityId: marketing._id, amount: 700 }]),
        confirmationId: first.confirmationId,
        idempotencyKey: 'race-marketing',
      }),
      executeBudgetAllocation({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: input([{ entityId: sales._id, amount: 700 }]),
        confirmationId: second.confirmationId,
        idempotencyKey: 'race-sales',
      }),
    ]);
    const won = raced.filter((entry) => entry.status === 'fulfilled');
    expect(won).toHaveLength(1);
    const finalWallet = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    expect(finalWallet.allocatedAmount).toBe(725);
    expect(finalWallet.balance).toBe(1000);
  });
});

describe('budget allocation MCP tools', () => {
  it('keeps wallets:allocate off the initial challenge and preserves existing tools', async () => {
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
    expect(anonymous.headers['www-authenticate']).not.toContain('wallets:allocate');
    const metadata = await request(app).get('/.well-known/oauth-protected-resource/mcp');
    expect(metadata.body.scopes_supported).not.toContain('wallets:allocate');
    const discovery = await request(app).get('/.well-known/oauth-authorization-server');
    expect(discovery.body.scopes_supported).toContain('wallets:allocate');

    const readOnly = await issueOauth(admin, 'catalog:read');
    const denied = await mcpRequest(readOnly, 'tools/call', {
      name: 'budget_prepare_allocation',
      arguments: input([{ entityId: marketing._id, amount: 20 }]),
    });
    expect(denied.status).toBe(403);
    expect(`${denied.headers['www-authenticate'] || ''} ${JSON.stringify(denied.body)}`).toContain('wallets:allocate');

    const writeToken = await issueOauth(admin, 'catalog:read wallets:allocate');
    const binding = await OauthGrantBinding.findOne({ userId: admin.user._id, scopes: 'wallets:allocate' }).lean();
    expect(binding.scopes).toEqual(['catalog:read', 'wallets:allocate']);
    const names = rpcBody(await mcpRequest(writeToken, 'tools/list')).result.tools.map((tool) => tool.name);
    for (const tool of PRIOR_TOOLS) expect(names).toContain(tool);
    expect(names).toContain('budget_prepare_allocation');
    expect(names).toContain('budget_execute_allocation');

    const prepared = await mcpRequest(writeToken, 'tools/call', {
      name: 'budget_prepare_allocation',
      arguments: input([{ entityId: marketing._id, amount: 20 }]),
    });
    const preview = rpcBody(prepared).result;
    expect(preview.isError).not.toBe(true);
    expect(JSON.stringify(preview)).not.toContain('manager-budget@test.io');
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'allocation_to_entity' })).toBe(0);
    const created = await mcpRequest(writeToken, 'tools/call', {
      name: 'budget_execute_allocation',
      arguments: {
        ...input([{ entityId: marketing._id, amount: 20 }]),
        confirmationId: preview.structuredContent.confirmationId,
        idempotencyKey: 'tool-budget-1',
      },
    });
    const body = rpcBody(created).result;
    expect(body.isError).not.toBe(true);
    expect(body.structuredContent.allocatedAmount).toBe(20);
    const audits = JSON.stringify(await AuditLog.find({ tenantId: tenant._id }).lean());
    expect(audits).toContain('wallet.allocate');
    expect(audits).toContain('mcp_write.successful');
  });
});
