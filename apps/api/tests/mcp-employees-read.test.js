import { createHash, randomBytes } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Contact } from '../src/modules/contacts/contact.model.js';
import { Entity } from '../src/modules/entities/entity.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { MergeConnection } from '../src/modules/integrations/merge/mergeConnection.model.js';
import { MergeHrisEmployee } from '../src/modules/integrations/merge/models/mergeHrisEmployee.model.js';
import { OauthGrantBinding } from '../src/modules/oauth/oauthGrantBinding.model.js';
import { LOCAL_OAUTH_CLIENT_ID, LOCAL_OAUTH_REDIRECT_URI, mcpResourceUrl } from '../src/modules/oauth/oauth.config.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { authHeader, makeEntity, makeFundedWallet, makeTenant, makeUser } from './helpers.js';

const PROTOCOL = '2026-07-28';
const SECRET_PHONE = '9000005555';
const SECRET_CODE = 'EMP-SECRET-WAVE5';
const SECRET_STREET = 'Secret Employee Lane';
const SECRET_PIN = '500081';
const SECRET_JOINED = '2020-01-15';
const SECRET_ZOHO = 'zoho-wave5-asha';
const SECRET_MERGE = 'merge-wave5-active';
const SECRET_MERGE_INACTIVE = 'merge-wave5-inactive';
const SECRET_PERSONAL = 'secret-personal-wave5@employees.test';
const MIA_EMAIL = 'mia.manual-wave5@employees.test';
const CARL_EMAIL = 'carl.csv-wave5@employees.test';
const ASHA_EMAIL = 'asha.zoho-wave5@employees.test';
const PRIYA_EMAIL = 'priya.merge-wave5@employees.test';
const IAN_EMAIL = 'ian.inactive-wave5@employees.test';
const SAM_EMAIL = 'sam.sales-wave5@employees.test';
const FOREIGN_EMAIL = 'olivia.other-wave5@employees.test';

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
    state: 'employees-state',
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

async function seedDirectory() {
  const tenant = await makeTenant({ name: 'People Co' });
  const other = await makeTenant({ name: 'Other People' });
  const wallet = await makeFundedWallet(tenant, { name: 'People Budget', amount: 10_000 });
  const marketing = await makeEntity(tenant, wallet, 'Marketing');
  const sales = await makeEntity(tenant, wallet, 'Sales');
  const password = 'correct-horse-1';
  const admin = await makeUser(tenant, 'company_admin', 'tenant', {
    email: `admin-${tenant.slug}@test.io`,
    password,
  });
  const synced = new Date('2026-06-01T00:00:00.000Z');
  const connection = await MergeConnection.create({
    tenantId: tenant._id,
    connectedByUserId: admin.user._id,
    provider: 'gusto',
    status: 'connected',
    lastSyncAt: synced,
  });
  await MergeHrisEmployee.create({
    tenantId: tenant._id,
    connectionId: connection._id,
    provider: 'gusto',
    mergeEmployeeId: SECRET_MERGE,
    employmentStatus: 'ACTIVE',
    personalEmail: SECRET_PERSONAL,
    workEmail: PRIYA_EMAIL,
    lastSyncedAt: synced,
  });
  await MergeHrisEmployee.create({
    tenantId: tenant._id,
    connectionId: connection._id,
    provider: 'gusto',
    mergeEmployeeId: SECRET_MERGE_INACTIVE,
    employmentStatus: 'INACTIVE',
    workEmail: IAN_EMAIL,
    lastSyncedAt: synced,
  });

  const base = {
    tenantId: tenant._id,
    phone: SECRET_PHONE,
    employeeCode: SECRET_CODE,
    dateOfJoining: new Date(`${SECRET_JOINED}T00:00:00.000Z`),
    address: { line1: SECRET_STREET, city: 'Hyderabad', pincode: SECRET_PIN, country: 'IN' },
  };
  const mia = await Contact.create({
    ...base,
    name: 'Mia Manual',
    email: MIA_EMAIL,
    department: 'Marketing',
    designation: 'Designer',
    role: 'Member',
    source: 'manual',
    employmentStatus: 'Active',
  });
  const carl = await Contact.create({
    ...base,
    name: 'Carl Csv',
    email: CARL_EMAIL,
    department: 'Marketing',
    designation: 'Analyst',
    role: 'Sender',
    source: 'csv',
    employmentStatus: 'Active',
  });
  const asha = await Contact.create({
    ...base,
    name: 'Asha Zoho',
    email: ASHA_EMAIL,
    department: 'Marketing',
    designation: 'Lead',
    role: 'Admin',
    source: 'hris',
    employmentStatus: 'Active',
    zohoRecordId: SECRET_ZOHO,
  });
  const priya = await Contact.create({
    ...base,
    name: 'Priya Merge',
    email: PRIYA_EMAIL,
    department: 'Marketing',
    designation: 'Partner',
    role: 'Member',
    source: 'hris',
    employmentStatus: 'PENDING',
    mergeEmployeeId: SECRET_MERGE,
    mergeConnectionId: connection._id,
  });
  const ian = await Contact.create({
    ...base,
    name: 'Ian Inactive',
    email: IAN_EMAIL,
    department: 'Marketing',
    designation: 'Former',
    role: 'Member',
    source: 'hris',
    employmentStatus: 'ACTIVE',
    mergeEmployeeId: SECRET_MERGE_INACTIVE,
    mergeConnectionId: connection._id,
  });
  const sam = await Contact.create({
    ...base,
    name: 'Sam Sales',
    email: SAM_EMAIL,
    department: 'Sales',
    designation: 'Seller',
    role: 'Member',
    source: 'manual',
    employmentStatus: 'Active',
  });
  const deleted = await Contact.create({
    ...base,
    name: 'Dana Deleted',
    email: 'dana.deleted-wave5@employees.test',
    department: 'Marketing',
    source: 'manual',
  });
  await deleted.softDelete();
  await Contact.create({
    tenantId: other._id,
    name: 'Olivia Other',
    email: FOREIGN_EMAIL,
    department: 'Marketing',
    phone: SECRET_PHONE,
    source: 'manual',
  });
  return { tenant, other, marketing, sales, admin, mia, carl, asha, priya, ian, sam, password };
}

function expectRedacted(payload, { allowEmail = false } = {}) {
  const text = JSON.stringify(payload);
  expect(text).not.toContain(SECRET_PHONE);
  expect(text).not.toContain(SECRET_CODE);
  expect(text).not.toContain(SECRET_STREET);
  expect(text).not.toContain(SECRET_PIN);
  expect(text).not.toContain(SECRET_JOINED);
  expect(text).not.toContain(SECRET_ZOHO);
  expect(text).not.toContain(SECRET_MERGE);
  expect(text).not.toContain(SECRET_PERSONAL);
  expect(text).not.toContain('employeeCode');
  expect(text).not.toContain('zohoRecordId');
  expect(text).not.toContain('mergeEmployeeId');
  expect(text).not.toContain('mergeConnectionId');
  expect(text).not.toContain('dateOfJoining');
  expect(text).not.toContain('terminationDate');
  if (!allowEmail) {
    expect(text).not.toContain(MIA_EMAIL);
    expect(text).not.toContain(CARL_EMAIL);
    expect(text).not.toContain(ASHA_EMAIL);
    expect(text).not.toContain(PRIYA_EMAIL);
    expect(text).not.toContain(IAN_EMAIL);
    expect(text).not.toContain(SAM_EMAIL);
    expect(text).not.toContain(FOREIGN_EMAIL);
  }
}

describe('employee read tools', () => {
  it('keeps existing read grants off employee tools until employees:read is consented', async () => {
    const seeded = await seedDirectory();
    const session = seeded.admin;
    session.token = await login(`admin-${seeded.tenant.slug}@test.io`, seeded.password);
    const existing = await issueOauth(
      seeded.tenant,
      session,
      'catalog:read orders:read campaigns:read wallets:read',
    );
    const binding = await OauthGrantBinding.findOne({ userId: session.user._id, scopes: 'wallets:read' }).lean();
    expect(binding.scopes).toEqual(['catalog:read', 'orders:read', 'campaigns:read', 'wallets:read']);

    const denied = await mcpRequest(existing, 'tools/call', { name: 'employees_search', arguments: {} });
    expect(denied.status).toBe(403);
    const challenge = `${denied.headers['www-authenticate'] || ''} ${JSON.stringify(denied.body)}`;
    expect(challenge).toContain('insufficient_scope');
    expect(challenge).toContain('employees:read');
    expectRedacted(challenge);
  });

  it('returns the company directory to an admin and only managed departments to an entity manager', async () => {
    const seeded = await seedDirectory();
    const admin = seeded.admin;
    admin.token = await login(`admin-${seeded.tenant.slug}@test.io`, seeded.password);
    const manager = await makeUser(seeded.tenant, 'entity_manager', 'entity', {
      email: `mgr-${seeded.tenant.slug}@test.io`,
      password: seeded.password,
      scopeId: seeded.marketing._id,
      assignedEntityIds: [seeded.marketing._id],
    });
    manager.token = await login(`mgr-${seeded.tenant.slug}@test.io`, seeded.password);
    const adminToken = await issueOauth(seeded.tenant, admin, 'employees:read');
    const managerToken = await issueOauth(seeded.tenant, manager, 'catalog:read employees:read');
    const adminBinding = await OauthGrantBinding.findOne({ userId: admin.user._id }).lean();
    expect(adminBinding.scopes).toEqual(['employees:read']);

    const listed = rpcBody(await mcpRequest(adminToken, 'tools/list')).result;
    const tool = listed.tools.find((entry) => entry.name === 'employees_search');
    expect(tool.annotations.readOnlyHint).toBe(true);
    expect(tool.annotations.destructiveHint).toBe(false);

    const page = await callTool(adminToken, 'employees_search');
    expect(page.structuredContent.pagination).toMatchObject({ page: 1, limit: 10, total: 5 });
    expect(page.structuredContent.items.map((item) => item.name)).toEqual([
      'Asha Zoho',
      'Carl Csv',
      'Mia Manual',
      'Priya Merge',
      'Sam Sales',
    ]);
    expect(page.structuredContent.items.find((item) => item.name === 'Asha Zoho')).toMatchObject({
      id: String(seeded.asha._id),
      department: 'Marketing',
      designation: 'Lead',
      role: 'Admin',
      effectiveEmploymentStatus: 'ACTIVE',
    });
    expect(page.structuredContent.items.find((item) => item.name === 'Priya Merge').effectiveEmploymentStatus).toBe(
      'ACTIVE',
    );
    expect(page.structuredContent.items.some((item) => item.email)).toBe(false);
    expectRedacted(page);

    const managerPage = await callTool(managerToken, 'employees_search');
    expect(managerPage.structuredContent.items.map((item) => item.name)).toEqual([
      'Asha Zoho',
      'Carl Csv',
      'Mia Manual',
      'Priya Merge',
    ]);
    expectRedacted(managerPage);

    const named = await callTool(adminToken, 'employees_search', { query: 'priya', department: 'marketing' });
    expect(named.structuredContent.items.map((item) => item.name)).toEqual(['Priya Merge']);
    expectRedacted(named);

    const sales = await callTool(adminToken, 'employees_search', { department: 'Sales' });
    expect(sales.structuredContent.items.map((item) => item.name)).toEqual(['Sam Sales']);

    const first = await callTool(adminToken, 'employees_search', { limit: 1, page: 1 });
    const second = await callTool(adminToken, 'employees_search', { limit: 1, page: 2 });
    expect(first.structuredContent.items.map((item) => item.name)).toEqual(['Asha Zoho']);
    expect(second.structuredContent.items.map((item) => item.name)).toEqual(['Carl Csv']);
    expect(first.structuredContent.pagination.total).toBe(5);

    const detail = await callTool(adminToken, 'employees_get', { contactId: String(seeded.mia._id) });
    expect(detail.structuredContent).toMatchObject({
      id: String(seeded.mia._id),
      name: 'Mia Manual',
      department: 'Marketing',
      designation: 'Designer',
      role: 'Member',
      effectiveEmploymentStatus: 'ACTIVE',
      email: MIA_EMAIL,
    });
    expectRedacted(detail, { allowEmail: true });
    expect(detail.content[0].text).toContain(MIA_EMAIL);

    const managerDetail = await callTool(managerToken, 'employees_get', { contactId: String(seeded.carl._id) });
    expect(managerDetail.structuredContent.email).toBe(CARL_EMAIL);
    const blocked = await callTool(managerToken, 'employees_get', { contactId: String(seeded.sam._id) });
    expect(blocked.isError).toBe(true);
    expect(blocked.content[0].text).toBe('Employee not found.');
    expectRedacted(blocked);

    const inactive = await callTool(adminToken, 'employees_get', { contactId: String(seeded.ian._id) });
    expect(inactive.isError).toBe(true);
    expect(inactive.content[0].text).toBe('Employee not found.');
    expect(JSON.stringify(inactive)).not.toContain('Ian Inactive');
    expectRedacted(inactive);
  });

  it('uses the same not-found result for a missing id, another tenant, and does not write', async () => {
    const seeded = await seedDirectory();
    const email = `other-${seeded.other.slug}@test.io`;
    const outsider = await makeUser(seeded.other, 'company_admin', 'tenant', { email, password: seeded.password });
    outsider.token = await login(email, seeded.password);
    const token = await issueOauth(seeded.other, outsider, 'employees:read');
    const before = await Contact.countDocuments({ tenantId: seeded.tenant._id });
    const writes = ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'create'].flatMap(
      (name) => [vi.spyOn(Contact, name), vi.spyOn(Entity, name), vi.spyOn(RoleAssignment, name)],
    );
    writes.push(vi.spyOn(MergeConnection, 'updateOne'), vi.spyOn(MergeHrisEmployee, 'updateOne'));
    try {
      const page = await callTool(token, 'employees_search');
      expect(page.structuredContent.items.map((item) => item.name)).toEqual(['Olivia Other']);
      expectRedacted(page);

      const foreign = await callTool(token, 'employees_get', { contactId: String(seeded.mia._id) });
      const missing = await callTool(token, 'employees_get', { contactId: '507f1f77bcf86cd799439011' });
      expect(foreign.isError).toBe(true);
      expect(missing.isError).toBe(true);
      expect(foreign.content[0].text).toBe('Employee not found.');
      expect(missing.content[0].text).toBe(foreign.content[0].text);
      expectRedacted(foreign);
      expectRedacted(missing);

      const invalid = await callTool(token, 'employees_get', { contactId: 'not-a-contact' });
      expect(invalid.isError).toBe(true);

      for (const spy of writes) expect(spy).not.toHaveBeenCalled();
      expect(await Contact.countDocuments({ tenantId: seeded.tenant._id })).toBe(before);
    } finally {
      for (const spy of writes) spy.mockRestore();
    }
  });

  it('refuses a finance user before the employee tool runs', async () => {
    const seeded = await seedDirectory();
    const finance = await makeUser(seeded.tenant, 'company_finance_user', 'tenant');
    const res = await mcpRequest(finance.token, 'tools/call', { name: 'employees_search', arguments: {} });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
