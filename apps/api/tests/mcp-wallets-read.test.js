import { createHash, randomBytes } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';
import { WalletTransaction } from '../src/modules/wallets/walletTransaction.model.js';
import { OauthGrantBinding } from '../src/modules/oauth/oauthGrantBinding.model.js';
import { LOCAL_OAUTH_CLIENT_ID, LOCAL_OAUTH_REDIRECT_URI, mcpResourceUrl } from '../src/modules/oauth/oauth.config.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import * as ledger from '../src/services/ledger.service.js';
import { authHeader, makeEntity, makeFundedWallet, makeTenant, makeUser } from './helpers.js';

const PROTOCOL = '2026-07-28';
const SECRET_GSTIN = '29SECRETGSTIN1Z5';
const SECRET_PHONE = '9000004444';
const SECRET_STREET = 'Secret Wallet Street 4';
const SECRET_PIN = '560099';
const SECRET_DOC = 'https://files.example/wallet-secret-wave4.pdf';
const SECRET_NOTE = 'SECRET-ALLOC-NOTE-WAVE4';

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
    state: 'wallets-state',
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

async function seedWallets() {
  const tenant = await makeTenant({ name: 'Wallet Co' });
  const other = await makeTenant({ name: 'Other Wallet Co' });
  const cash = await makeFundedWallet(tenant, { name: 'Company Cash', amount: 100_000 });
  const entity = await makeEntity(tenant, cash, 'Marketing');
  const admin = await makeUser(tenant, 'company_admin', 'tenant', {
    email: `admin-${tenant.slug}@test.io`,
    password: 'correct-horse-1',
  });
  await ledger.createTransaction({
    tenantId: tenant._id,
    walletId: cash._id,
    type: 'allocation_to_entity',
    amount: 40_000,
    relatedEntityId: entity._id,
    description: SECRET_NOTE,
    performedBy: admin.user._id,
  });
  await Wallet.updateOne(
    { _id: cash._id, tenantId: tenant._id },
    {
      $set: {
        gstin: SECRET_GSTIN,
        mobileNumber: SECRET_PHONE,
        address: SECRET_STREET,
        pinCode: SECRET_PIN,
        'fundingDocument.fileUrl': SECRET_DOC,
      },
    },
  );
  const reserve = await Wallet.create({
    tenantId: tenant._id,
    name: 'Reserve',
    currency: 'INR',
    status: 'active',
    balance: 500,
    allocatedAmount: 200,
    gstin: SECRET_GSTIN,
    mobileNumber: SECRET_PHONE,
    address: SECRET_STREET,
    pinCode: SECRET_PIN,
    fundingDocument: { fileUrl: SECRET_DOC },
    ownerUserId: admin.user._id,
  });
  const foreign = await makeFundedWallet(other, { name: 'Foreign Cash', amount: 80_000 });
  return { tenant, other, cash, reserve, foreign, entity, admin };
}

function expectRedacted(payload) {
  const text = JSON.stringify(payload);
  expect(text).not.toContain(SECRET_GSTIN);
  expect(text).not.toContain(SECRET_PHONE);
  expect(text).not.toContain(SECRET_STREET);
  expect(text).not.toContain(SECRET_PIN);
  expect(text).not.toContain(SECRET_DOC);
  expect(text).not.toContain(SECRET_NOTE);
  expect(text).not.toContain('performedBy');
  expect(text).not.toContain('fundingDocument');
  expect(text).not.toContain('gstin');
  expect(text).not.toContain('mobileNumber');
  expect(text).not.toContain('pinCode');
}

describe('wallet read tools', () => {
  it('keeps catalog, orders, and campaign grants off wallet tools until wallets:read is consented', async () => {
    const seeded = await seedWallets();
    const email = `admin-${seeded.tenant.slug}@test.io`;
    const password = 'correct-horse-1';
    const session = seeded.admin;
    session.token = await login(email, password);
    const existing = await issueOauth(seeded.tenant, session, 'catalog:read orders:read campaigns:read');
    const binding = await OauthGrantBinding.findOne({ userId: session.user._id, scopes: 'orders:read' }).lean();
    expect(binding.scopes).toEqual(['catalog:read', 'orders:read', 'campaigns:read']);

    const catalog = await callTool(existing, 'catalog_search', { query: 'MUG-STILL' });
    expect(catalog.isError).not.toBe(true);

    const denied = await mcpRequest(existing, 'tools/call', { name: 'wallet_list_balances', arguments: {} });
    expect(denied.status).toBe(403);
    const challenge = `${denied.headers['www-authenticate'] || ''} ${JSON.stringify(denied.body)}`;
    expect(challenge).toContain('insufficient_scope');
    expect(challenge).toContain('wallets:read');
    expectRedacted(challenge);
  });

  it('returns organization wallet balances to a company admin only', async () => {
    const seeded = await seedWallets();
    const password = 'correct-horse-1';
    const adminEmail = `admin-${seeded.tenant.slug}@test.io`;
    const managerEmail = `mgr-${seeded.tenant.slug}@test.io`;
    const admin = seeded.admin;
    admin.token = await login(adminEmail, password);
    const manager = await makeUser(seeded.tenant, 'entity_manager', 'entity', {
      email: managerEmail,
      password,
      scopeId: seeded.entity._id,
      assignedEntityIds: [seeded.entity._id],
    });
    manager.token = await login(managerEmail, password);
    const adminToken = await issueOauth(seeded.tenant, admin, 'wallets:read');
    const managerToken = await issueOauth(seeded.tenant, manager, 'catalog:read wallets:read');
    const adminBinding = await OauthGrantBinding.findOne({ userId: admin.user._id }).lean();
    expect(adminBinding.scopes).toEqual(['wallets:read']);

    const listed = rpcBody(await mcpRequest(adminToken, 'tools/list')).result;
    const tool = listed.tools.find((entry) => entry.name === 'wallet_list_balances');
    expect(tool.annotations.readOnlyHint).toBe(true);
    expect(tool.annotations.destructiveHint).toBe(false);
    expect(tool.description).toContain('Entity managers do not receive organization wallet cash');

    const balances = await callTool(adminToken, 'wallet_list_balances');
    expect(balances.structuredContent.items.map((item) => item.name)).toEqual(['Reserve', 'Company Cash']);
    const cash = balances.structuredContent.items.find((item) => item.name === 'Company Cash');
    expect(cash).toMatchObject({
      id: String(seeded.cash._id),
      currency: 'INR',
      balance: 100_000,
      allocatedAmount: 40_000,
      unallocatedAmount: 60_000,
      fundingPending: false,
    });
    const reserve = balances.structuredContent.items.find((item) => item.name === 'Reserve');
    expect(reserve.unallocatedAmount).toBe(300);
    expect(reserve.unallocatedAmount).toBe(reserve.balance - reserve.allocatedAmount);
    expectRedacted(balances);

    const managerBalances = await callTool(managerToken, 'wallet_list_balances');
    expect(managerBalances.structuredContent).toEqual({ items: [], scope: 'department' });
    expect(managerBalances.content[0].text).toContain('Organization wallet balances are not available');
    expect(JSON.stringify(managerBalances)).not.toContain('100000');
    expect(JSON.stringify(managerBalances)).not.toContain('60000');
    expect(JSON.stringify(managerBalances)).not.toContain('Company Cash');

    const history = await callTool(adminToken, 'wallet_list_transactions', {
      walletId: String(seeded.cash._id),
    });
    expect(history.structuredContent.pagination).toMatchObject({ page: 1, limit: 10, total: 2 });
    expect(history.structuredContent.items.map((item) => item.type)).toEqual([
      'allocation_to_entity',
      'fund_in',
    ]);
    expect(history.structuredContent.items[0]).toMatchObject({
      type: 'allocation_to_entity',
      amount: 40_000,
      balanceAfter: 100_000,
      availableAfter: 60_000,
    });
    expect(history.structuredContent.items[1].availableAfter).toBe(100_000);
    expect(history.structuredContent.items[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expectRedacted(history);
    expect(JSON.stringify(history)).not.toContain(String(admin.user._id));
  });

  it('shows an entity manager their department budget and hides organization cash, other departments, and other tenants', async () => {
    const seeded = await seedWallets();
    const password = 'correct-horse-1';
    const sales = await makeEntity(seeded.tenant, seeded.cash, 'Sales');
    await ledger.createTransaction({
      tenantId: seeded.tenant._id,
      walletId: seeded.cash._id,
      type: 'allocation_to_entity',
      amount: 10_000,
      relatedEntityId: sales._id,
    });
    const managerEmail = `mgr-scope-${seeded.tenant.slug}@test.io`;
    const manager = await makeUser(seeded.tenant, 'entity_manager', 'entity', {
      email: managerEmail,
      password,
      scopeId: seeded.entity._id,
      assignedEntityIds: [seeded.entity._id],
    });
    manager.token = await login(managerEmail, password);
    const managerToken = await issueOauth(seeded.tenant, manager, 'wallets:read entities:read');

    const foreignEntity = await makeEntity(seeded.other, seeded.foreign, 'Overseas', { allocatedAmount: 80_000 });
    const outsiderEmail = `outsider-${seeded.other.slug}@test.io`;
    const outsider = await makeUser(seeded.other, 'entity_manager', 'entity', {
      email: outsiderEmail,
      password,
      scopeId: foreignEntity._id,
      assignedEntityIds: [foreignEntity._id],
    });
    outsider.token = await login(outsiderEmail, password);
    const outsiderToken = await issueOauth(seeded.other, outsider, 'wallets:read entities:read');

    const departments = await callTool(managerToken, 'entities_list');
    expect(departments.structuredContent.departments).toEqual([
      expect.objectContaining({
        name: 'Marketing',
        allocatedAmount: 40_000,
        spentAmount: 0,
        remainingAmount: 40_000,
      }),
    ]);
    expect(departments.structuredContent.departments[0]).not.toHaveProperty('balance');
    expect(departments.structuredContent.departments[0]).not.toHaveProperty('unallocatedAmount');
    const departmentText = JSON.stringify(departments.structuredContent.departments);
    expect(departmentText).not.toContain('100000');
    expect(departmentText).not.toContain('60000');
    expect(departmentText).not.toContain('Sales');

    const balances = await callTool(managerToken, 'wallet_list_balances');
    expect(balances.structuredContent.items).toEqual([]);
    const balanceText = JSON.stringify(balances);
    expect(balanceText).not.toContain('100000');
    expect(balanceText).not.toContain('60000');
    expect(balanceText).not.toContain('Company Cash');
    expect(balanceText).not.toContain('Reserve');

    const history = await callTool(managerToken, 'wallet_list_transactions', {
      walletId: String(seeded.cash._id),
    });
    expect(history.structuredContent.items).toEqual([
      expect.objectContaining({
        type: 'allocation_to_entity',
        amount: 40_000,
        balanceAfter: 40_000,
        availableAfter: 40_000,
      }),
    ]);
    const historyText = JSON.stringify(history);
    expect(historyText).not.toContain('fund_in');
    expect(historyText).not.toContain('100000');
    expect(historyText).not.toContain('10000');
    expect(historyText).not.toContain('60000');

    const funding = await callTool(managerToken, 'wallet_list_transactions', {
      walletId: String(seeded.cash._id),
      type: 'fund_in',
    });
    expect(funding.structuredContent.items).toEqual([]);
    expect(funding.structuredContent.pagination.total).toBe(0);

    const reserve = await callTool(managerToken, 'wallet_list_transactions', {
      walletId: String(seeded.reserve._id),
    });
    expect(reserve.isError).toBe(true);
    expect(reserve.content[0].text).toBe('Wallet not found.');

    const foreignDepartments = await callTool(outsiderToken, 'entities_list');
    expect(foreignDepartments.structuredContent.departments.map((row) => row.name)).toEqual(['Overseas']);
    expect(JSON.stringify(foreignDepartments.structuredContent.departments)).not.toContain('Marketing');
    expect(JSON.stringify(foreignDepartments.structuredContent.departments)).not.toContain('40000');
    const foreignBalances = await callTool(outsiderToken, 'wallet_list_balances');
    expect(foreignBalances.structuredContent.items).toEqual([]);
    expect(JSON.stringify(foreignBalances)).not.toContain('Company Cash');
    expect(JSON.stringify(foreignBalances)).not.toContain('100000');
    expect(JSON.stringify(foreignBalances)).not.toContain('Foreign Cash');
    const foreignHistory = await callTool(outsiderToken, 'wallet_list_transactions', {
      walletId: String(seeded.cash._id),
    });
    expect(foreignHistory.isError).toBe(true);
    expect(foreignHistory.content[0].text).toBe('Wallet not found.');
    const ownForeign = await callTool(outsiderToken, 'wallet_list_transactions', {
      walletId: String(seeded.foreign._id),
    });
    expect(ownForeign.structuredContent.items).toEqual([]);
    expect(JSON.stringify(ownForeign)).not.toContain('fund_in');
    expect(JSON.stringify(ownForeign)).not.toContain('80000');
  });

  it('filters and pages transactions and rejects an unknown type', async () => {
    const seeded = await seedWallets();
    const password = 'correct-horse-1';
    const email = `admin-${seeded.tenant.slug}@test.io`;
    const admin = seeded.admin;
    admin.token = await login(email, password);
    const token = await issueOauth(seeded.tenant, admin, 'wallets:read');

    const filtered = await callTool(token, 'wallet_list_transactions', {
      walletId: String(seeded.cash._id),
      type: 'fund_in',
    });
    expect(filtered.structuredContent.items).toHaveLength(1);
    expect(filtered.structuredContent.items[0].type).toBe('fund_in');
    expect(filtered.structuredContent.pagination.total).toBe(1);

    const first = await callTool(token, 'wallet_list_transactions', {
      walletId: String(seeded.cash._id),
      limit: 1,
      page: 1,
    });
    const second = await callTool(token, 'wallet_list_transactions', {
      walletId: String(seeded.cash._id),
      limit: 1,
      page: 2,
    });
    expect(first.structuredContent.items.map((item) => item.type)).toEqual(['allocation_to_entity']);
    expect(second.structuredContent.items.map((item) => item.type)).toEqual(['fund_in']);
    expect(first.structuredContent.pagination.total).toBe(2);

    const bad = await callTool(token, 'wallet_list_transactions', {
      walletId: String(seeded.cash._id),
      type: 'not_a_type',
    });
    expect(bad.isError).toBe(true);
  });

  it('hides another tenant wallet and does not write', async () => {
    const seeded = await seedWallets();
    const email = `other-${seeded.other.slug}@test.io`;
    const password = 'correct-horse-1';
    const outsider = await makeUser(seeded.other, 'company_admin', 'tenant', { email, password });
    outsider.token = await login(email, password);
    const token = await issueOauth(seeded.other, outsider, 'wallets:read');
    const beforeWallets = await Wallet.countDocuments({ tenantId: seeded.tenant._id });
    const beforeTxns = await WalletTransaction.countDocuments({ tenantId: seeded.tenant._id });
    const writes = ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'create'].map(
      (name) => vi.spyOn(Wallet, name),
    );
    writes.push(vi.spyOn(WalletTransaction, 'create'));
    const repair = vi.spyOn(ledger, 'repairWalletCaches');
    try {
      const page = await callTool(token, 'wallet_list_balances');
      expect(page.structuredContent.items.map((item) => item.name)).toEqual(['Foreign Cash']);
      expect(JSON.stringify(page)).not.toContain('Company Cash');
      expect(JSON.stringify(page)).not.toContain('Reserve');

      const missing = await callTool(token, 'wallet_list_transactions', {
        walletId: String(seeded.cash._id),
      });
      expect(missing.isError).toBe(true);
      expect(missing.content[0].text).toBe('Wallet not found.');
      expectRedacted(missing);

      const absent = await callTool(token, 'wallet_list_transactions', {
        walletId: '507f1f77bcf86cd799439011',
      });
      expect(absent.isError).toBe(true);
      expect(absent.content[0].text).toBe('Wallet not found.');

      const invalid = await callTool(token, 'wallet_list_transactions', { walletId: 'not-a-wallet' });
      expect(invalid.isError).toBe(true);

      for (const spy of writes) expect(spy).not.toHaveBeenCalled();
      expect(repair).not.toHaveBeenCalled();
      expect(await Wallet.countDocuments({ tenantId: seeded.tenant._id })).toBe(beforeWallets);
      expect(await WalletTransaction.countDocuments({ tenantId: seeded.tenant._id })).toBe(beforeTxns);
    } finally {
      for (const spy of writes) spy.mockRestore();
      repair.mockRestore();
    }
  });

  it('refuses a finance user before the wallet tool runs', async () => {
    const seeded = await seedWallets();
    const finance = await makeUser(seeded.tenant, 'company_finance_user', 'tenant');
    const res = await mcpRequest(finance.token, 'tools/call', { name: 'wallet_list_balances', arguments: {} });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
