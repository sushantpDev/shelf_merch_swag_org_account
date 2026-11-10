import { createHash, randomBytes } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Campaign } from '../src/modules/campaigns/campaign.model.js';
import { Entity } from '../src/modules/entities/entity.model.js';
import { Contact } from '../src/modules/contacts/contact.model.js';
import { Recipient } from '../src/modules/campaigns/recipient.model.js';
import { AuditLog } from '../src/modules/auditLogs/auditLog.model.js';
import { OauthGrantBinding } from '../src/modules/oauth/oauthGrantBinding.model.js';
import { LOCAL_OAUTH_CLIENT_ID, LOCAL_OAUTH_REDIRECT_URI, mcpResourceUrl } from '../src/modules/oauth/oauth.config.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { authHeader, makeEntity, makeFundedWallet, makeShop, makeTenant, makeUser } from './helpers.js';
import {
  executePointsDraft,
  preparePointsDraft,
} from '../src/modules/mcp/campaignsDraftWrite.js';

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
const EMPLOYEE_WRITE_TOOLS = [
  'employees_prepare_create',
  'employees_execute_create',
  'employees_prepare_update',
  'employees_execute_update',
];
const DRAFT_TOOLS = ['campaigns_prepare_points_draft', 'campaigns_execute_points_draft'];
const SECRET_PHONE = '9003334444';
const SECRET_EMAIL = 'ada.secret@points-draft.test';

let app;
let tenant;
let admin;
let entity;
let shop;

function s256(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

function draftInput(extra = {}) {
  return {
    entityId: String(entity._id),
    shopId: String(shop._id),
    name: 'Welcome points',
    creditsPerRecipient: 0,
    recipients: [
      { name: 'Ada', email: SECRET_EMAIL, phone: SECRET_PHONE },
      { name: 'Ada duplicate', email: SECRET_EMAIL },
    ],
    ...extra,
  };
}

async function counts() {
  return {
    campaigns: await Campaign.countDocuments({ tenantId: tenant._id }),
    recipients: await Recipient.countDocuments({ tenantId: tenant._id }),
  };
}

function expectNoSecrets(value, token) {
  const text = JSON.stringify(value);
  expect(text).not.toContain(SECRET_EMAIL);
  expect(text).not.toContain(SECRET_PHONE);
  expect(text).not.toContain('redemptionToken');
  if (token) expect(text).not.toContain(token);
}

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});

afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  clearTenantLimitCache();
  tenant = await makeTenant({ slug: 'points-draft' });
  const wallet = await makeFundedWallet(tenant, { name: 'Draft budget', amount: 10_000 });
  entity = await makeEntity(tenant, wallet, 'Marketing');
  shop = await makeShop(tenant, { name: 'Points shop' });
  admin = await makeUser(tenant, 'company_admin', 'tenant');
});

describe('points campaign draft service', () => {
  it('prepares without writing, then creates one draft and replays it', async () => {
    const input = draftInput();
    const prepared = await preparePointsDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
    });
    expect(await counts()).toEqual({ campaigns: 0, recipients: 0 });
    expect(prepared.preview).toMatchObject({
      action: 'create',
      name: 'Welcome points',
      entityId: String(entity._id),
      shopId: String(shop._id),
      recipientCount: 1,
    });
    expectNoSecrets(prepared);

    const created = await executePointsDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'draft-welcome-1',
    });
    expect(created).toMatchObject({
      name: 'Welcome points',
      status: 'recipients_uploaded',
      type: 'points',
      recipientCount: 1,
    });
    expect(await counts()).toEqual({ campaigns: 1, recipients: 1 });
    const stored = await Recipient.findOne({ tenantId: tenant._id, email: SECRET_EMAIL });
    expect(stored.redemptionToken).toEqual(expect.any(String));
    expectNoSecrets(created, stored.redemptionToken);

    const replay = await executePointsDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'draft-welcome-1',
    });
    expect(replay.id).toBe(created.id);
    expect(await counts()).toEqual({ campaigns: 1, recipients: 1 });

    const again = await preparePointsDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: draftInput({ campaignId: created.id, name: 'Welcome points renamed' }),
    });
    expect(again.preview.action).toBe('update');
    expect(again.preview.campaignId).toBe(created.id);
    const updated = await executePointsDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: draftInput({ campaignId: created.id, name: 'Welcome points renamed' }),
      confirmationId: again.confirmationId,
      idempotencyKey: 'draft-welcome-2',
    });
    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('Welcome points renamed');
    expect(await counts()).toEqual({ campaigns: 1, recipients: 1 });

    const audits = JSON.stringify(await AuditLog.find({ tenantId: tenant._id }).lean());
    expect(audits).toContain('campaign.save_points_draft');
    expect(audits).toContain('mcp_write.successful');
    expectNoSecrets(audits, stored.redemptionToken);
  });

  it('rejects another entity, another tenant, a launched campaign, and a stale preview', async () => {
    const salesWallet = await makeFundedWallet(tenant, { name: 'Sales budget', amount: 5_000 });
    const sales = await makeEntity(tenant, salesWallet, 'Sales');
    const manager = await makeUser(tenant, 'entity_manager', 'entity', {
      assignedEntityIds: [entity._id],
      scopeId: entity._id,
    });
    await expect(
      preparePointsDraft({
        tenantId: tenant._id,
        actorUserId: manager.user._id,
        input: draftInput({ entityId: String(sales._id) }),
      }),
    ).rejects.toMatchObject({ status: 403 });
    const allowed = await preparePointsDraft({
      tenantId: tenant._id,
      actorUserId: manager.user._id,
      input: draftInput(),
    });
    expect(allowed.preview.action).toBe('create');

    const other = await makeTenant({ slug: 'other-drafts' });
    const otherShop = await makeShop(other, { name: 'Other shop' });
    await expect(
      preparePointsDraft({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: draftInput({ shopId: String(otherShop._id) }),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const finance = await makeUser(tenant, 'company_finance_user', 'tenant');
    await expect(
      preparePointsDraft({
        tenantId: tenant._id,
        actorUserId: finance.user._id,
        input: draftInput(),
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(await counts()).toEqual({ campaigns: 0, recipients: 0 });

    const prepared = await preparePointsDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: draftInput(),
    });
    const created = await executePointsDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: draftInput(),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'draft-lock',
    });
    await Campaign.updateOne({ _id: created.id, tenantId: tenant._id }, { status: 'launched' });
    await expect(
      preparePointsDraft({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: draftInput({ campaignId: created.id, name: 'After launch' }),
      }),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_LOCKED' });
    expect(await Campaign.countDocuments({ tenantId: tenant._id })).toBe(1);

    await Campaign.updateOne({ _id: created.id, tenantId: tenant._id }, { status: 'draft', name: 'Welcome points' });
    const stale = await preparePointsDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: draftInput({ campaignId: created.id, name: 'Stale rename' }),
    });
    await Campaign.updateOne({ _id: created.id, tenantId: tenant._id }, { name: 'Changed elsewhere' });
    await expect(
      executePointsDraft({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: draftInput({ campaignId: created.id, name: 'Stale rename' }),
        confirmationId: stale.confirmationId,
        idempotencyKey: 'draft-stale',
      }),
    ).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });
    expect((await Campaign.findOne({ _id: created.id, tenantId: tenant._id })).name).toBe('Changed elsewhere');
    const audits = JSON.stringify(await AuditLog.find({ tenantId: tenant._id }).lean());
    expect(audits).toContain('mcp_write.rejected');
    expect(audits).toContain('mcp_write.successful');
  });

  it('keeps one campaign when concurrent keys target the same draft', async () => {
    const input = draftInput({ recipients: [{ name: 'Ada', email: SECRET_EMAIL }] });
    const prepared = await Promise.all(
      Array.from({ length: 4 }, () =>
        preparePointsDraft({ tenantId: tenant._id, actorUserId: admin.user._id, input }),
      ),
    );
    const results = await Promise.allSettled(
      prepared.map((entry, index) =>
        executePointsDraft({
          tenantId: tenant._id,
          actorUserId: admin.user._id,
          input,
          confirmationId: entry.confirmationId,
          idempotencyKey: `draft-race-${index}`,
        }),
      ),
    );
    expect(await Campaign.countDocuments({ tenantId: tenant._id, type: 'points' })).toBe(1);
    expect(await Recipient.countDocuments({ tenantId: tenant._id, email: SECRET_EMAIL })).toBe(1);
    const fulfilled = results.filter((entry) => entry.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    expect(new Set(fulfilled.map((entry) => entry.value.id)).size).toBe(1);
    const token = (await Recipient.findOne({ tenantId: tenant._id, email: SECRET_EMAIL })).redemptionToken;
    for (const entry of fulfilled) expectNoSecrets(entry.value, token);
  });

  it('lets a company admin fund from the organization wallet without selecting a newer department', async () => {
    const walletId = entity.walletId;
    await makeEntity(tenant, { _id: walletId }, 'Sales');
    const { entityId: _ignored, ...base } = draftInput({ name: 'Org funded' });
    const input = { ...base, walletId: String(walletId) };
    const entitiesBefore = await Entity.countDocuments({ tenantId: tenant._id });
    const prepared = await preparePointsDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
    });
    expect(prepared.preview).toMatchObject({
      entityId: String(entity._id),
      entityName: 'Marketing',
      fundingSource: 'organization_unallocated',
      departmentBudgetCharged: false,
    });
    expect(await Entity.countDocuments({ tenantId: tenant._id })).toBe(entitiesBefore);
    const saved = await executePointsDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'org-wallet-draft',
    });
    expect(saved.entityId).toBe(String(entity._id));
    expect(await Entity.countDocuments({ tenantId: tenant._id })).toBe(entitiesBefore);
  });

  it('creates the default spend entity only when a company admin confirms a wallet with no department', async () => {
    const bare = await makeFundedWallet(tenant, { name: 'Org cash', amount: 5_000 });
    const { entityId: _ignored, ...base } = draftInput({ name: 'Bare wallet' });
    const input = { ...base, walletId: String(bare._id) };
    const prepared = await preparePointsDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
    });
    expect(prepared.preview.fundingSource).toBe('organization_unallocated');
    expect(prepared.preview.departmentBudgetCharged).toBe(false);
    expect(prepared.preview.entityId).toBeUndefined();
    expect(await Entity.countDocuments({ tenantId: tenant._id, walletId: bare._id })).toBe(0);
    const saved = await executePointsDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'bare-wallet-draft',
    });
    const created = await Entity.findOne({ tenantId: tenant._id, walletId: bare._id });
    expect(created.name).toBe('Org cash');
    expect(saved.entityId).toBe(String(created._id));
  });

  it('requires a department manager to choose their own department budget', async () => {
    const manager = await makeUser(tenant, 'entity_manager', 'entity', { assignedEntityIds: [entity._id] });
    const { entityId: _ignored, ...base } = draftInput({ name: 'Manager wallet only' });
    await expect(preparePointsDraft({
      tenantId: tenant._id,
      actorUserId: manager.user._id,
      input: { ...base, walletId: String(entity.walletId) },
    })).rejects.toMatchObject({ code: 'ENTITY_REQUIRED' });
    const prepared = await preparePointsDraft({
      tenantId: tenant._id,
      actorUserId: manager.user._id,
      input: draftInput({ name: 'Manager department' }),
    });
    expect(prepared.preview).toMatchObject({
      entityId: String(entity._id),
      fundingSource: 'department_budget',
      departmentBudgetCharged: true,
    });
  });

  it('resolves employees_search contact ids into recipients without returning emails', async () => {
    const ada = await Contact.create({
      tenantId: tenant._id,
      name: 'Ada Admin',
      email: 'ada.hidden@points-draft.test',
      department: 'Marketing',
      role: 'Member',
    });
    const bea = await Contact.create({
      tenantId: tenant._id,
      name: 'Bea Admin',
      email: 'bea.hidden@points-draft.test',
      department: 'Marketing',
      role: 'Member',
    });
    const contactsBefore = await Contact.countDocuments({ tenantId: tenant._id });
    const input = draftInput({
      name: 'Directory recipients',
      recipients: [{ contactId: String(ada._id) }, { contactId: String(bea._id) }, { contactId: String(ada._id) }],
    });
    const prepared = await preparePointsDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
    });
    expect(prepared.preview.recipientCount).toBe(2);
    expect(JSON.stringify(prepared)).not.toContain('ada.hidden@points-draft.test');
    expect(JSON.stringify(prepared)).not.toContain('bea.hidden@points-draft.test');
    expect(await counts()).toEqual({ campaigns: 0, recipients: 0 });
    expect(await Contact.countDocuments({ tenantId: tenant._id })).toBe(contactsBefore);
    const saved = await executePointsDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'directory-recipients',
    });
    expect(saved.recipientCount).toBe(2);
    expect(JSON.stringify(saved)).not.toContain('ada.hidden@points-draft.test');
    const stored = await Recipient.find({ tenantId: tenant._id, campaignId: saved.id }).sort({ email: 1 });
    expect(stored.map((row) => row.email)).toEqual([
      'ada.hidden@points-draft.test',
      'bea.hidden@points-draft.test',
    ]);
    expect(stored.map((row) => String(row.contactId))).toEqual([String(ada._id), String(bea._id)]);
    expect(await Contact.countDocuments({ tenantId: tenant._id })).toBe(contactsBefore);

    const other = await makeTenant({ slug: 'other-directory' });
    const foreign = await Contact.create({
      tenantId: other._id,
      name: 'Foreign Person',
      email: 'foreign.hidden@points-draft.test',
      department: 'Marketing',
      role: 'Member',
    });
    await expect(preparePointsDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: draftInput({ name: 'Foreign recipient', recipients: [{ contactId: String(foreign._id) }] }),
    })).rejects.toMatchObject({ code: 'RECIPIENT_NOT_FOUND' });

    const manager = await makeUser(tenant, 'entity_manager', 'entity', { assignedEntityIds: [entity._id] });
    const sales = await Contact.create({
      tenantId: tenant._id,
      name: 'Sam Sales',
      email: 'sam.hidden@points-draft.test',
      department: 'Sales',
      role: 'Member',
    });
    await expect(preparePointsDraft({
      tenantId: tenant._id,
      actorUserId: manager.user._id,
      input: draftInput({ name: 'Outside department', recipients: [{ contactId: String(sales._id) }] }),
    })).rejects.toMatchObject({ code: 'RECIPIENT_NOT_FOUND' });
    const allowed = await preparePointsDraft({
      tenantId: tenant._id,
      actorUserId: manager.user._id,
      input: draftInput({ name: 'Inside department', recipients: [{ contactId: String(ada._id) }] }),
    });
    expect(allowed.preview.recipientCount).toBe(1);
    expect(JSON.stringify(allowed)).not.toContain('ada.hidden@points-draft.test');

    await expect(preparePointsDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: draftInput({
        name: 'Mismatched email',
        recipients: [{ contactId: String(ada._id), name: 'Ada Admin', email: 'someone-else@points-draft.test' }],
      }),
    })).rejects.toMatchObject({ code: 'RECIPIENT_MISMATCH' });
  });
});

describe('points campaign draft MCP tools', () => {
  it('requires campaigns:draft and keeps read and employee tools', async () => {
    const password = 'correct-horse-1';
    const email = `admin-${tenant.slug}@test.io`;
    admin = await makeUser(tenant, 'company_admin', 'tenant', { email, password });
    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(login.status).toBe(200);
    admin.token = login.body.accessToken;

    const anonymous = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(anonymous.headers['www-authenticate']).toContain('campaigns:read');
    expect(anonymous.headers['www-authenticate']).not.toContain('campaigns:draft');
    expect(anonymous.headers['www-authenticate']).not.toContain('employees:write');
    const metadata = await request(app).get('/.well-known/oauth-protected-resource/mcp');
    expect(metadata.body.scopes_supported).not.toContain('campaigns:draft');
    const discovery = await request(app).get('/.well-known/openid-configuration');
    expect(discovery.body.scopes_supported).toContain('campaigns:draft');

    async function issue(scope) {
      const agent = request.agent(app);
      const verifier = randomBytes(32).toString('base64url');
      const started = await agent.get('/auth').redirects(0).query({
        client_id: LOCAL_OAUTH_CLIENT_ID,
        redirect_uri: LOCAL_OAUTH_REDIRECT_URI,
        response_type: 'code',
        scope,
        resource: mcpResourceUrl(),
        state: 'draft-write',
        code_challenge: s256(verifier),
        code_challenge_method: 'S256',
      });
      expect([302, 303]).toContain(started.status);
      const decision = await agent
        .post('/oauth/consent/decision')
        .set(authHeader(admin.token))
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

    function mcp(token, method, params = {}) {
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

    const readOnly = await issue('campaigns:read');
    const readBinding = await OauthGrantBinding.findOne({ userId: admin.user._id, scopes: { $size: 1 } }).lean();
    expect(readBinding.scopes).toEqual(['campaigns:read']);
    const denied = await mcp(readOnly, 'tools/call', {
      name: 'campaigns_prepare_points_draft',
      arguments: draftInput(),
    });
    expect(denied.status).toBe(403);
    const challenge = `${denied.headers['www-authenticate'] || ''} ${JSON.stringify(denied.body)}`;
    expect(challenge).toContain('insufficient_scope');
    expect(challenge).toContain('campaigns:draft');
    expect(await counts()).toEqual({ campaigns: 0, recipients: 0 });

    const token = await issue('campaigns:read campaigns:draft');
    const binding = await OauthGrantBinding.findOne({ userId: admin.user._id, scopes: 'campaigns:draft' }).lean();
    expect(binding.scopes).toEqual(['campaigns:read', 'campaigns:draft']);
    const listed = await mcp(token, 'tools/list');
    const body = listed.body?.result || JSON.parse(listed.text.split(/\r?\n/).find((row) => row.startsWith('data: ')).slice(6)).result;
    const names = body.tools.map((tool) => tool.name);
    for (const tool of [...READ_TOOLS, ...EMPLOYEE_WRITE_TOOLS, ...DRAFT_TOOLS]) expect(names).toContain(tool);

    const preview = await mcp(token, 'tools/call', {
      name: 'campaigns_prepare_points_draft',
      arguments: draftInput(),
    });
    expect(preview.status).toBe(200);
    const previewBody = preview.body?.result || JSON.parse(preview.text.split(/\r?\n/).find((row) => row.startsWith('data: ')).slice(6)).result;
    expect(previewBody.isError).not.toBe(true);
    expect(await counts()).toEqual({ campaigns: 0, recipients: 0 });
    expectNoSecrets(previewBody);
    const saved = await mcp(token, 'tools/call', {
      name: 'campaigns_execute_points_draft',
      arguments: {
        ...draftInput(),
        confirmationId: previewBody.structuredContent.confirmationId,
        idempotencyKey: 'tool-draft-1',
      },
    });
    expect(saved.status).toBe(200);
    const savedBody = saved.body?.result || JSON.parse(saved.text.split(/\r?\n/).find((row) => row.startsWith('data: ')).slice(6)).result;
    expect(savedBody.isError).not.toBe(true);
    expect(savedBody.structuredContent.recipientCount).toBe(1);
    const tokenValue = (await Recipient.findOne({ tenantId: tenant._id })).redemptionToken;
    expectNoSecrets(savedBody, tokenValue);
    expect(await counts()).toEqual({ campaigns: 1, recipients: 1 });
  });
});
