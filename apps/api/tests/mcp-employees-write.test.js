import { createHash, randomBytes } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Contact } from '../src/modules/contacts/contact.model.js';
import { AuditLog } from '../src/modules/auditLogs/auditLog.model.js';
import { McpWriteIdempotency } from '../src/modules/mcp/mcpWriteIdempotency.model.js';
import { OauthGrantBinding } from '../src/modules/oauth/oauthGrantBinding.model.js';
import { LOCAL_OAUTH_CLIENT_ID, LOCAL_OAUTH_REDIRECT_URI, mcpResourceUrl } from '../src/modules/oauth/oauth.config.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { authHeader, makeEntity, makeFundedWallet, makeTenant, makeUser } from './helpers.js';
import {
  executeEmployeeCreate,
  executeEmployeeUpdate,
  prepareEmployeeCreate,
  prepareEmployeeUpdate,
} from '../src/modules/mcp/employeesWrite.js';

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
const WRITE_TOOLS = [
  'employees_prepare_create',
  'employees_execute_create',
  'employees_prepare_update',
  'employees_execute_update',
];
const SECRET_PHONE = '9001112222';
const SECRET_CODE = 'EMP-WRITE-SECRET';
const SECRET_ZOHO = 'zoho-write-secret';
const SECRET_MERGE = 'merge-write-secret';
const SECRET_STREET = 'Hidden Write Lane';

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

async function issueOauth(session, scope) {
  const agent = request.agent(app);
  const verifier = randomBytes(32).toString('base64url');
  const started = await agent.get('/auth').redirects(0).query({
    client_id: LOCAL_OAUTH_CLIENT_ID,
    redirect_uri: LOCAL_OAUTH_REDIRECT_URI,
    response_type: 'code',
    scope,
    resource: mcpResourceUrl(),
    state: 'employees-write',
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

async function contactCount() {
  return Contact.countDocuments({ tenantId: tenant._id }).setOptions({ includeDeleted: true });
}

function expectNoSecrets(value) {
  const text = JSON.stringify(value);
  expect(text).not.toContain(SECRET_PHONE);
  expect(text).not.toContain(SECRET_CODE);
  expect(text).not.toContain(SECRET_ZOHO);
  expect(text).not.toContain(SECRET_MERGE);
  expect(text).not.toContain(SECRET_STREET);
}

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});

afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  clearTenantLimitCache();
  tenant = await makeTenant({ slug: 'employees-write' });
  const wallet = await makeFundedWallet(tenant, { name: 'People', amount: 10_000 });
  const marketing = await makeEntity(tenant, wallet, 'Marketing');
  await makeEntity(tenant, wallet, 'Sales');
  admin = await makeUser(tenant, 'company_admin', 'tenant');
  admin.marketing = marketing;
});

describe('employee write service', () => {
  it('prepares a create without writing a contact, then creates it once', async () => {
    const input = {
      name: 'Nia New',
      email: 'nia@employees-write.test',
      department: 'Marketing',
      role: 'Admin',
    };
    const prepared = await prepareEmployeeCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
    });
    expect(await contactCount()).toBe(0);
    expect(prepared.preview).toMatchObject({
      action: 'create',
      name: 'Nia New',
      email: 'nia@employees-write.test',
      department: 'Marketing',
      role: 'Admin',
    });
    expectNoSecrets(prepared);

    const created = await executeEmployeeCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'create-nia-1',
    });
    expect(created).toMatchObject({
      name: 'Nia New',
      email: 'nia@employees-write.test',
      department: 'Marketing',
      role: 'Admin',
      restored: false,
    });
    expect(await contactCount()).toBe(1);
    const replay = await executeEmployeeCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'create-nia-1',
    });
    expect(replay.id).toBe(created.id);
    expect(await contactCount()).toBe(1);
    await expect(
      executeEmployeeCreate({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input,
        confirmationId: prepared.confirmationId,
        idempotencyKey: 'create-nia-2',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const audits = JSON.stringify(await AuditLog.find({ tenantId: tenant._id }).lean());
    expect(audits).toContain('contact.create');
    expect(audits).toContain('mcp_write.successful');
    expect(audits).not.toContain(prepared.confirmationId);
    expectNoSecrets(audits);
  });


  it('returns the same work email on replay and stores that email on the idempotency result', async () => {
    const input = {
      name: 'Nia New',
      email: 'nia@employees-write.test',
      department: 'Marketing',
      role: 'Admin',
    };
    const prepared = await prepareEmployeeCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
    });
    const created = await executeEmployeeCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'email-policy',
    });
    const replayed = await executeEmployeeCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'email-policy',
    });
    expect(created.email).toBe(input.email);
    expect(replayed.email).toBe(input.email);
    const stored = await McpWriteIdempotency.findOne({ key: 'email-policy', tenantId: tenant._id });
    expect(stored.result.email).toBe(input.email);
    const audits = await AuditLog.find({ tenantId: tenant._id, action: /^mcp_write\./ }).lean();
    expect(JSON.stringify(audits)).not.toContain(input.email);
  });

  it('restores a soft-deleted contact with the same email', async () => {
    const existing = await Contact.create({
      tenantId: tenant._id,
      name: 'Old Nia',
      email: 'nia@employees-write.test',
      department: 'Sales',
      role: 'Member',
      phone: SECRET_PHONE,
      employeeCode: SECRET_CODE,
      zohoRecordId: SECRET_ZOHO,
      mergeEmployeeId: SECRET_MERGE,
      address: { line1: SECRET_STREET },
    });
    await existing.softDelete();
    const input = {
      name: 'Nia Restored',
      email: 'nia@employees-write.test',
      department: 'Marketing',
      role: 'Sender',
    };
    const prepared = await prepareEmployeeCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
    });
    expect(prepared.preview.action).toBe('restore');
    const during = await Contact.findOne({ _id: existing._id, tenantId: tenant._id }).setOptions({
      includeDeleted: true,
    });
    expect(during.deletedAt).toBeTruthy();
    expect(during.name).toBe('Old Nia');

    const restored = await executeEmployeeCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'restore-nia',
    });
    expect(restored).toMatchObject({ id: String(existing._id), name: 'Nia Restored', restored: true, role: 'Sender' });
    const saved = await Contact.findOne({ _id: existing._id, tenantId: tenant._id });
    expect(saved.deletedAt).toBeNull();
    expect(saved.department).toBe('Marketing');
    expectNoSecrets(prepared);
    expectNoSecrets(restored);
  });

  it('rejects a duplicate active email and an entity manager outside their department or role', async () => {
    await Contact.create({
      tenantId: tenant._id,
      name: 'Existing',
      email: 'nia@employees-write.test',
      department: 'Marketing',
      role: 'Member',
    });
    await expect(
      prepareEmployeeCreate({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: { name: 'Copy', email: 'nia@employees-write.test', department: 'Marketing' },
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const manager = await makeUser(tenant, 'entity_manager', 'entity', {
      assignedEntityIds: [admin.marketing._id],
      scopeId: admin.marketing._id,
    });
    await expect(
      prepareEmployeeCreate({
        tenantId: tenant._id,
        actorUserId: manager.user._id,
        input: { name: 'Sales Person', email: 'sales@employees-write.test', department: 'Sales' },
      }),
    ).rejects.toMatchObject({ code: 'DEPARTMENT_SCOPE' });
    await expect(
      prepareEmployeeCreate({
        tenantId: tenant._id,
        actorUserId: manager.user._id,
        input: { name: 'Escalator', email: 'boss@employees-write.test', department: 'Marketing', role: 'Admin' },
      }),
    ).rejects.toMatchObject({ code: 'ROLE_CHANGE_FORBIDDEN' });
    const allowed = await prepareEmployeeCreate({
      tenantId: tenant._id,
      actorUserId: manager.user._id,
      input: { name: 'Membered', email: 'member@employees-write.test', department: 'Marketing' },
    });
    expect(allowed.preview.role).toBe('Member');
    expect(await contactCount()).toBe(1);

    const finance = await makeUser(tenant, 'company_finance_user', 'tenant');
    await expect(
      prepareEmployeeCreate({
        tenantId: tenant._id,
        actorUserId: finance.user._id,
        input: { name: 'Nope', email: 'nope@employees-write.test', department: 'Marketing' },
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('previews and applies email and department changes without exposing HRIS data', async () => {
    const contact = await Contact.create({
      tenantId: tenant._id,
      name: 'Nia New',
      email: 'nia@employees-write.test',
      department: 'Marketing',
      role: 'Member',
      phone: SECRET_PHONE,
      employeeCode: SECRET_CODE,
      zohoRecordId: SECRET_ZOHO,
      mergeEmployeeId: SECRET_MERGE,
      address: { line1: SECRET_STREET },
    });
    const input = {
      contactId: String(contact._id),
      email: 'nia.moved@employees-write.test',
      department: 'Sales',
    };
    const before = await contactCount();
    const prepared = await prepareEmployeeUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
    });
    expect(await contactCount()).toBe(before);
    const stored = await Contact.findOne({ _id: contact._id, tenantId: tenant._id });
    expect(stored.email).toBe('nia@employees-write.test');
    expect(stored.department).toBe('Marketing');
    expect(prepared.preview.changes).toEqual(
      expect.arrayContaining([
        { field: 'email', from: 'nia@employees-write.test', to: 'nia.moved@employees-write.test' },
        { field: 'department', from: 'Marketing', to: 'Sales' },
      ]),
    );
    expectNoSecrets(prepared);

    const updated = await executeEmployeeUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'move-nia',
    });
    expect(updated).toMatchObject({
      id: String(contact._id),
      email: 'nia.moved@employees-write.test',
      department: 'Sales',
      role: 'Member',
    });
    expectNoSecrets(updated);
    const again = await executeEmployeeUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'move-nia',
    });
    expect(again.id).toBe(updated.id);
    expect(await Contact.countDocuments({ tenantId: tenant._id, email: 'nia.moved@employees-write.test' })).toBe(1);
    await expect(
      executeEmployeeUpdate({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input,
        confirmationId: prepared.confirmationId,
        idempotencyKey: 'move-nia-again',
      }),
    ).rejects.toMatchObject({ code: 'CONFIRMATION_REUSED' });

    const manager = await makeUser(tenant, 'entity_manager', 'entity', {
      assignedEntityIds: [admin.marketing._id],
      scopeId: admin.marketing._id,
    });
    await expect(
      prepareEmployeeUpdate({
        tenantId: tenant._id,
        actorUserId: manager.user._id,
        input: { contactId: String(contact._id), name: 'Hijack' },
      }),
    ).rejects.toMatchObject({ status: 403 });

    const inside = await Contact.create({
      tenantId: tenant._id,
      name: 'Inside',
      email: 'inside@employees-write.test',
      department: 'Marketing',
      role: 'Member',
      phone: SECRET_PHONE,
    });
    await expect(
      prepareEmployeeUpdate({
        tenantId: tenant._id,
        actorUserId: manager.user._id,
        input: { contactId: String(inside._id), role: 'Admin' },
      }),
    ).rejects.toMatchObject({ code: 'ROLE_CHANGE_FORBIDDEN' });
    await expect(
      prepareEmployeeUpdate({
        tenantId: tenant._id,
        actorUserId: manager.user._id,
        input: { contactId: String(inside._id), name: 'Inside Renamed', department: 'Sales' },
      }),
    ).rejects.toMatchObject({ code: 'DEPARTMENT_SCOPE' });
    const renamed = await prepareEmployeeUpdate({
      tenantId: tenant._id,
      actorUserId: manager.user._id,
      input: { contactId: String(inside._id), name: 'Inside Renamed' },
    });
    expect(renamed.preview.changes).toEqual([{ field: 'name', from: 'Inside', to: 'Inside Renamed' }]);
    const saved = await executeEmployeeUpdate({
      tenantId: tenant._id,
      actorUserId: manager.user._id,
      input: { contactId: String(inside._id), name: 'Inside Renamed' },
      confirmationId: renamed.confirmationId,
      idempotencyKey: 'rename-inside',
    });
    expect(saved).toMatchObject({ name: 'Inside Renamed', department: 'Marketing', role: 'Member' });
    expectNoSecrets(saved);
  });

  it('rejects stale, expired, reused, and cross-tenant confirmations, and runs one concurrent create', async () => {
    const contact = await Contact.create({
      tenantId: tenant._id,
      name: 'Nia New',
      email: 'nia@employees-write.test',
      department: 'Marketing',
      role: 'Member',
    });
    const staleInput = { contactId: String(contact._id), name: 'Nia Edited' };
    const stale = await prepareEmployeeUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: staleInput,
    });
    contact.name = 'Someone else';
    await contact.save();
    await expect(
      executeEmployeeUpdate({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: staleInput,
        confirmationId: stale.confirmationId,
        idempotencyKey: 'stale-nia',
      }),
    ).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });
    expect((await Contact.findOne({ _id: contact._id, tenantId: tenant._id })).name).toBe('Someone else');

    let current = new Date('2026-01-01T00:00:00.000Z');
    const expiring = await prepareEmployeeCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Late', email: 'late@employees-write.test', department: 'Marketing' },
      now: () => current,
    });
    current = new Date('2026-01-01T00:20:00.000Z');
    await expect(
      executeEmployeeCreate({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: { name: 'Late', email: 'late@employees-write.test', department: 'Marketing' },
        confirmationId: expiring.confirmationId,
        idempotencyKey: 'late-nia',
        now: () => current,
      }),
    ).rejects.toMatchObject({ code: 'CONFIRMATION_EXPIRED' });

    const other = await makeTenant({ slug: 'other-employees' });
    const outsider = await makeUser(other, 'company_admin', 'tenant');
    const foreign = await Contact.create({
      tenantId: other._id,
      name: 'Foreign',
      email: 'foreign@employees-write.test',
      department: 'Marketing',
      role: 'Member',
    });
    await expect(
      prepareEmployeeUpdate({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: { contactId: String(foreign._id), name: 'Stolen' },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const owned = await prepareEmployeeCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Owned', email: 'owned@employees-write.test', department: 'Marketing' },
    });
    await expect(
      executeEmployeeCreate({
        tenantId: other._id,
        actorUserId: outsider.user._id,
        input: { name: 'Owned', email: 'owned@employees-write.test', department: 'Marketing' },
        confirmationId: owned.confirmationId,
        idempotencyKey: 'cross-owned',
      }),
    ).rejects.toMatchObject({ code: 'CONFIRMATION_INVALID' });

    const raced = await prepareEmployeeCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Race', email: 'race@employees-write.test', department: 'Marketing' },
    });
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        executeEmployeeCreate({
          tenantId: tenant._id,
          actorUserId: admin.user._id,
          input: { name: 'Race', email: 'race@employees-write.test', department: 'Marketing' },
          confirmationId: raced.confirmationId,
          idempotencyKey: 'race-nia',
        }),
      ),
    );
    expect(await Contact.countDocuments({ tenantId: tenant._id, email: 'race@employees-write.test' })).toBe(1);
    const fulfilled = results.filter((entry) => entry.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    expect(new Set(fulfilled.map((entry) => entry.value.id)).size).toBe(1);
  });
});

describe('employee write MCP tools', () => {
  it('keeps write off the initial challenge and read-only grants, then creates through the tools', async () => {
    const password = 'correct-horse-1';
    const email = `admin-${tenant.slug}@test.io`;
    admin = await makeUser(tenant, 'company_admin', 'tenant', { email, password });
    admin.token = await login(email, password);

    const anonymous = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(anonymous.headers['www-authenticate']).toContain('employees:read');
    expect(anonymous.headers['www-authenticate']).not.toContain('employees:write');
    const metadata = await request(app).get('/.well-known/oauth-protected-resource/mcp');
    expect(metadata.body.scopes_supported).not.toContain('employees:write');
    const discovery = await request(app).get('/.well-known/openid-configuration');
    expect(discovery.body.scopes_supported).toContain('employees:write');

    const readOnly = await issueOauth(admin, 'employees:read');
    const readBinding = await OauthGrantBinding.findOne({ userId: admin.user._id, scopes: 'employees:read' }).lean();
    expect(readBinding.scopes).toEqual(['employees:read']);
    const denied = await mcpRequest(readOnly, 'tools/call', {
      name: 'employees_prepare_create',
      arguments: { name: 'Denied', email: 'denied@employees-write.test', department: 'Marketing' },
    });
    expect(denied.status).toBe(403);
    const challenge = `${denied.headers['www-authenticate'] || ''} ${JSON.stringify(denied.body)}`;
    expect(challenge).toContain('insufficient_scope');
    expect(challenge).toContain('employees:write');
    expect(await contactCount()).toBe(0);

    const writeToken = await issueOauth(admin, 'employees:read employees:write');
    const writeBinding = await OauthGrantBinding.findOne({ userId: admin.user._id, scopes: 'employees:write' }).lean();
    expect(writeBinding.scopes).toEqual(['employees:read', 'employees:write']);
    const listed = rpcBody(await mcpRequest(writeToken, 'tools/list')).result;
    const names = listed.tools.map((tool) => tool.name);
    for (const tool of READ_TOOLS) expect(names).toContain(tool);
    for (const tool of WRITE_TOOLS) expect(names).toContain(tool);
    expect(names.filter((name) => WRITE_TOOLS.includes(name))).toHaveLength(4);

    const prepared = await mcpRequest(writeToken, 'tools/call', {
      name: 'employees_prepare_create',
      arguments: {
        name: 'Tool Nia',
        email: 'tool-nia@employees-write.test',
        department: 'Marketing',
        role: 'Member',
        phone: SECRET_PHONE,
      },
    });
    expect(prepared.status).toBe(200);
    const preview = rpcBody(prepared).result;
    expect(preview.isError).not.toBe(true);
    expect(await contactCount()).toBe(0);
    expectNoSecrets(preview);
    const confirmationId = preview.structuredContent.confirmationId;
    const created = await mcpRequest(writeToken, 'tools/call', {
      name: 'employees_execute_create',
      arguments: {
        name: 'Tool Nia',
        email: 'tool-nia@employees-write.test',
        department: 'Marketing',
        role: 'Member',
        confirmationId,
        idempotencyKey: 'tool-nia-1',
      },
    });
    expect(created.status).toBe(200);
    const body = rpcBody(created).result;
    expect(body.isError).not.toBe(true);
    expect(body.structuredContent).toMatchObject({
      name: 'Tool Nia',
      email: 'tool-nia@employees-write.test',
      department: 'Marketing',
      role: 'Member',
    });
    expectNoSecrets(body);
    expect(await contactCount()).toBe(1);
  });
});
