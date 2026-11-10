import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { clearTestDb, connectTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { makeTenant, makeUser } from './helpers.js';
import { signAccessToken } from '../src/modules/auth/auth.service.js';
import { User } from '../src/modules/users/user.model.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import {
  LOCAL_OAUTH_CLIENT_ID,
  LOCAL_OAUTH_REDIRECT_URI,
  mcpResourceUrl,
  oauthIssuer,
} from '../src/modules/oauth/oauth.config.js';
import { OauthGrantBinding } from '../src/modules/oauth/oauthGrantBinding.model.js';

let app;

function s256(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

function claimsOf(token) {
  const segment = token.split('.')[1];
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

function redirectTarget(location) {
  if (!location) throw new Error('missing redirect');
  return new URL(location, oauthIssuer());
}

function withoutSecrets(res) {
  const token = res.body?.access_token;
  if (res.body) {
    delete res.body.access_token;
    delete res.body.refresh_token;
    delete res.body.id_token;
  }
  return token ? claimsOf(token) : null;
}

async function grantCount(userId) {
  return mongoose.connection.collection('oidc_payloads').countDocuments({
    model: 'Grant',
    'payload.accountId': String(userId),
  });
}

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
});

async function adminSession(tenant, extra = {}) {
  const email = extra.email ?? `admin-${tenant.slug}@test.io`;
  const password = 'correct-horse-1';
  const made = await makeUser(tenant, extra.role ?? 'company_admin', extra.scopeType ?? 'tenant', {
    email,
    password,
    name: extra.name ?? 'Ada Admin',
    status: extra.status,
  });
  const login = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(login.status).toBe(200);
  const token = login.body.accessToken;
  delete login.body.accessToken;
  return { ...made, token, email };
}

function begin(agent, query = {}) {
  const verifier = randomBytes(32).toString('base64url');
  const req = agent.get('/auth').redirects(0).query({
    client_id: LOCAL_OAUTH_CLIENT_ID,
    redirect_uri: LOCAL_OAUTH_REDIRECT_URI,
    response_type: 'code',
    scope: 'catalog:read',
    resource: mcpResourceUrl(),
    state: 'consent-state',
    code_challenge: s256(verifier),
    code_challenge_method: 'S256',
    ...query,
  });
  return req.then((res) => ({ res, verifier }));
}

function exchange(code, verifier, extra = {}) {
  return request(app).post('/token').type('form').send({
    grant_type: 'authorization_code',
    code,
    redirect_uri: LOCAL_OAUTH_REDIRECT_URI,
    client_id: LOCAL_OAUTH_CLIENT_ID,
    code_verifier: verifier,
    resource: mcpResourceUrl(),
    ...extra,
  });
}

async function approve(agent, token, tenantId, body = {}) {
  return agent
    .post('/oauth/consent/decision')
    .set('Authorization', `Bearer ${token}`)
    .send({ decision: 'allow', tenantId, ...body });
}

describe('OAuth consent and grants', () => {
  it('completes login, consent, code issue, and PKCE exchange', async () => {
    const tenant = await makeTenant({ name: 'Northwind', slug: 'northwind' });
    const other = await makeTenant({ name: 'Other Co', slug: 'other-co' });
    const { user, token } = await adminSession(tenant);
    const agent = request.agent(app);
    const { res, verifier } = await begin(agent);
    expect([302, 303]).toContain(res.status);
    expect(res.headers.location).toContain('/oauth/consent');
    expect(res.headers.location).not.toContain('code=');
    expect(await OauthGrantBinding.countDocuments()).toBe(0);
    expect(await grantCount(user._id)).toBe(0);

    const session = await agent.get('/oauth/consent/session').set('Authorization', `Bearer ${token}`);
    expect(session.status).toBe(200);
    expect(session.body.client.name).toBe('ShelfMerch local MCP client');
    expect(session.body.account.email).toBe(user.email);
    expect(session.body.scope).toBe('catalog:read');
    expect(session.body.workspaces).toEqual([{ id: String(tenant._id), name: 'Northwind' }]);

    const decision = await approve(agent, token, String(tenant._id), {
      userId: String(other._id),
      scope: 'openid email',
      resource: 'https://evil.example/mcp',
      client_id: 'evil-client',
      redirect_uri: 'https://evil.example/callback',
    });
    expect(decision.status).toBe(200);
    const binding = await OauthGrantBinding.findOne({ userId: user._id }).lean();
    expect(String(binding.tenantId)).toBe(String(tenant._id));
    expect(binding.clientId).toBe(LOCAL_OAUTH_CLIENT_ID);
    expect(binding.resource).toBe(mcpResourceUrl());
    expect(binding.scopes).toEqual(['catalog:read']);
    expect(await grantCount(user._id)).toBe(1);

    const resumed = await agent.get(new URL(decision.body.resumeUrl).pathname).redirects(0);
    expect([302, 303]).toContain(resumed.status);
    const redirected = redirectTarget(resumed.headers.location);
    expect(redirected.origin + redirected.pathname).toBe(LOCAL_OAUTH_REDIRECT_URI);
    expect(redirected.searchParams.get('state')).toBe('consent-state');
    expect(redirected.searchParams.get('iss')).toBe(oauthIssuer());
    const code = redirected.searchParams.get('code');
    expect(code).toBeTruthy();

    const wrongRedirect = await exchange(code, verifier, {
      redirect_uri: 'https://evil.example/callback',
    });
    expect(wrongRedirect.status).toBe(400);

    const [first, second] = await Promise.all([
      exchange(code, verifier),
      exchange(code, verifier),
    ]);
    const ok = [first, second].filter((item) => item.status === 200);
    const rejected = [first, second].filter((item) => item.status === 400);
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].body.error).toBe('invalid_grant');
    const accessToken = ok[0].body.access_token;
    expect(String(accessToken).split('.')).toHaveLength(3);
    const claims = withoutSecrets(ok[0]);
    expect(claims.iss).toBe(oauthIssuer());
    expect(claims.aud).toBe(mcpResourceUrl());
    expect(claims.scope).toBe('catalog:read');

    const mcp = await request(app)
      .post('/mcp')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('Mcp-Method', 'tools/list')
      .set('MCP-Protocol-Version', '2026-07-28')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      });
    expect(mcp.status).toBe(200);
    expect(JSON.stringify(mcp.body) + (mcp.text || '')).toContain('catalog_search');
  });

  it('does not create a grant when consent is denied', async () => {
    const tenant = await makeTenant({ slug: 'deny-co' });
    const { user, token } = await adminSession(tenant);
    const agent = request.agent(app);
    await begin(agent);
    const decision = await agent
      .post('/oauth/consent/decision')
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'deny', tenantId: String(tenant._id) });
    expect(decision.status).toBe(200);
    const resumed = await agent.get(new URL(decision.body.resumeUrl).pathname).redirects(0);
    const redirected = redirectTarget(resumed.headers.location);
    expect(redirected.searchParams.get('error')).toBe('access_denied');
    expect(redirected.searchParams.get('code')).toBeNull();
    expect(await OauthGrantBinding.countDocuments({ userId: user._id })).toBe(0);
    expect(await grantCount(user._id)).toBe(0);
  });

  it('rejects a second decision and a decision without the interaction cookie', async () => {
    const tenant = await makeTenant({ slug: 'twice-co' });
    const { user, token } = await adminSession(tenant);
    const agent = request.agent(app);
    await begin(agent);
    const [first, second] = await Promise.all([
      approve(agent, token, String(tenant._id)),
      approve(agent, token, String(tenant._id)),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect(await OauthGrantBinding.countDocuments({ userId: user._id })).toBe(1);

    const forged = await request(app)
      .post('/oauth/consent/decision')
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'allow', tenantId: String(tenant._id) });
    expect(forged.status).toBe(401);
    expect(forged.body.error.code).toBe('INTERACTION_EXPIRED');
  });

  it('rejects consent without a ShelfMerch session', async () => {
    const tenant = await makeTenant({ slug: 'anon-co' });
    const { token } = await adminSession(tenant);
    const agent = request.agent(app);
    await begin(agent);
    const missing = await request(app).get('/oauth/consent/session');
    expect(missing.status).toBe(401);

    const noCookie = await request(app)
      .get('/oauth/consent/session')
      .set('Authorization', `Bearer ${token}`);
    expect(noCookie.status).toBe(401);
    expect(noCookie.body.error.code).toBe('INTERACTION_EXPIRED');
  });

  it('rejects an expired session and a suspended user', async () => {
    const tenant = await makeTenant({ slug: 'stale-co' });
    const { user, token } = await adminSession(tenant);
    const agent = request.agent(app);
    await begin(agent);
    await User.updateOne({ _id: user._id }, { $inc: { sessionVersion: 1 } });
    const expired = await agent.get('/oauth/consent/session').set('Authorization', `Bearer ${token}`);
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe('SESSION_EXPIRED');

    await User.updateOne({ _id: user._id }, { sessionVersion: 0, status: 'suspended' });
    const suspended = await agent.get('/oauth/consent/session').set('Authorization', `Bearer ${token}`);
    expect(suspended.status).toBe(401);
    expect(await OauthGrantBinding.countDocuments()).toBe(0);
  });

  it('rejects another workspace, a suspended workspace, and a role that cannot read the catalog', async () => {
    const home = await makeTenant({ name: 'Home', slug: 'home-co' });
    const foreign = await makeTenant({ name: 'Foreign', slug: 'foreign-co' });
    const suspendedTenant = await makeTenant({ name: 'Paused', slug: 'paused-co', status: 'suspended' });
    const { user, token } = await adminSession(home);
    await RoleAssignment.create({
      tenantId: suspendedTenant._id,
      userId: user._id,
      role: 'company_admin',
      scopeType: 'tenant',
    });
    const agent = request.agent(app);
    await begin(agent);
    const session = await agent.get('/oauth/consent/session').set('Authorization', `Bearer ${token}`);
    expect(session.body.workspaces.map((workspace) => workspace.id)).toEqual([String(home._id)]);

    const cross = await approve(agent, token, String(foreign._id));
    expect(cross.status).toBe(403);
    expect(cross.body.error.code).toBe('WORKSPACE_NOT_ELIGIBLE');
    expect(await OauthGrantBinding.countDocuments()).toBe(0);

    const paused = await approve(agent, token, String(suspendedTenant._id));
    expect(paused.status).toBe(403);

    const financeTenant = await makeTenant({ slug: 'finance-co' });
    const finance = await adminSession(financeTenant, {
      role: 'company_finance_user',
      email: 'finance@finance-co.test.io',
    });
    const financeAgent = request.agent(app);
    await begin(financeAgent);
    const financeSession = await financeAgent
      .get('/oauth/consent/session')
      .set('Authorization', `Bearer ${finance.token}`);
    expect(financeSession.body.workspaces).toEqual([]);
    const financeDecision = await approve(financeAgent, finance.token, String(financeTenant._id));
    expect(financeDecision.status).toBe(403);
    expect(await grantCount(finance.user._id)).toBe(0);
  });

  it('rejects an impersonated session', async () => {
    const tenant = await makeTenant({ slug: 'impersonated-co' });
    const { user, assignment } = await adminSession(tenant);
    const impersonated = signAccessToken(user, assignment, {
      isImpersonating: true,
      originalUserId: String(user._id),
    });
    const agent = request.agent(app);
    await begin(agent);
    const decision = await approve(agent, impersonated, String(tenant._id));
    expect(decision.status).toBe(403);
    expect(decision.body.error.code).toBe('IMPERSONATION_FORBIDDEN');
    expect(await OauthGrantBinding.countDocuments()).toBe(0);
  });

  it('rejects an unregistered redirect URI before consent', async () => {
    const agent = request.agent(app);
    const { res } = await begin(agent, { redirect_uri: 'https://evil.example/callback' });
    expect(res.status).toBe(400);
    expect(`${res.text || ''}`).toContain('invalid_redirect_uri');
    expect(res.headers.location || '').not.toContain('evil.example');
    expect(await OauthGrantBinding.countDocuments()).toBe(0);
  });

  it('rejects unsupported scopes even though discovery still lists openid', async () => {
    const discovery = await request(app).get('/.well-known/oauth-authorization-server');
    expect(discovery.body.scopes_supported).toContain('catalog:read');
    expect(discovery.body.scopes_supported).toContain('openid');
    expect(discovery.body.scopes_supported).toContain('offline_access');

    for (const scope of ['openid', 'email', 'profile', 'offline_access', 'catalog:read email', 'orders:write', 'campaigns:write', 'wallets:write', 'gifts:write', '*', 'catalog:read orders:write']) {
      const agent = request.agent(app);
      const { res } = await begin(agent, { scope });
      expect([302, 303]).toContain(res.status);
      const location = redirectTarget(res.headers.location);
      expect(location.searchParams.get('error')).toBe('invalid_scope');
      expect(location.searchParams.get('code')).toBeNull();
    }

    const writeOnly = request.agent(app);
    const { res: writeOnlyRes } = await begin(writeOnly, { scope: 'employees:write' });
    expect([302, 303]).toContain(writeOnlyRes.status);
    expect(String(writeOnlyRes.headers.location)).toContain('/oauth/consent');
    expect(String(writeOnlyRes.headers.location)).not.toContain('invalid_scope');
    const companion = request.agent(app);
    const { res: companionRes } = await begin(companion, { scope: 'catalog:read openid' });
    expect([302, 303]).toContain(companionRes.status);
    expect(companionRes.headers.location).toContain('/oauth/consent');
    expect(String(companionRes.headers.location)).not.toContain('invalid_scope');

    const ordersCompanion = request.agent(app);
    const { res: ordersRes } = await begin(ordersCompanion, { scope: 'catalog:read orders:read' });
    expect([302, 303]).toContain(ordersRes.status);
    expect(String(ordersRes.headers.location)).toContain('/oauth/consent');
    expect(String(ordersRes.headers.location)).not.toContain('invalid_scope');

    const campaignsCompanion = request.agent(app);
    const { res: campaignsRes } = await begin(campaignsCompanion, { scope: 'catalog:read campaigns:read' });
    expect([302, 303]).toContain(campaignsRes.status);
    expect(String(campaignsRes.headers.location)).toContain('/oauth/consent');
    expect(String(campaignsRes.headers.location)).not.toContain('invalid_scope');

    const walletsCompanion = request.agent(app);
    const { res: walletsRes } = await begin(walletsCompanion, { scope: 'catalog:read wallets:read' });
    expect([302, 303]).toContain(walletsRes.status);
    expect(String(walletsRes.headers.location)).toContain('/oauth/consent');
    expect(String(walletsRes.headers.location)).not.toContain('invalid_scope');

    const employeesCompanion = request.agent(app);
    const { res: employeesRes } = await begin(employeesCompanion, { scope: 'catalog:read employees:read' });
    expect([302, 303]).toContain(employeesRes.status);
    expect(String(employeesRes.headers.location)).toContain('/oauth/consent');
    expect(String(employeesRes.headers.location)).not.toContain('invalid_scope');

    const giftsCompanion = request.agent(app);
    const { res: giftsRes } = await begin(giftsCompanion, { scope: 'catalog:read gifts:read' });
    expect([302, 303]).toContain(giftsRes.status);
    expect(String(giftsRes.headers.location)).toContain('/oauth/consent');
    expect(String(giftsRes.headers.location)).not.toContain('invalid_scope');

    expect(await OauthGrantBinding.countDocuments()).toBe(0);
  });

  it('rejects a verifier, resource, suspended workspace, demotion, or ended session at exchange', async () => {
    const tenant = await makeTenant({ slug: 'redeem-co' });
    const session = await adminSession(tenant);

    async function freshCode() {
      const agent = request.agent(app);
      const started = await begin(agent);
      const decision = await approve(agent, session.token, String(tenant._id));
      expect(decision.status).toBe(200);
      const resumed = await agent.get(new URL(decision.body.resumeUrl).pathname).redirects(0);
      return {
        code: redirectTarget(resumed.headers.location).searchParams.get('code'),
        verifier: started.verifier,
      };
    }

    const pkce = await freshCode();
    const badVerifier = await exchange(pkce.code, 'not-the-verifier');
    expect(badVerifier.status).toBe(400);
    expect(badVerifier.body.error).toBe('invalid_request');
    expect(badVerifier.body.access_token).toBeUndefined();

    const endedCode = await freshCode();
    await User.updateOne({ _id: session.user._id }, { $inc: { sessionVersion: 1 } });
    const ended = await exchange(endedCode.code, endedCode.verifier);
    expect(ended.status).toBe(400);
    expect(ended.body.error).toBe('invalid_grant');
    await User.updateOne({ _id: session.user._id }, { sessionVersion: 0 });

    const pausedCode = await freshCode();
    await Tenant.updateOne({ _id: tenant._id }, { status: 'suspended' });
    const paused = await exchange(pausedCode.code, pausedCode.verifier);
    expect(paused.status).toBe(400);
    expect(paused.body.error).toBe('invalid_grant');
    await Tenant.updateOne({ _id: tenant._id }, { status: 'active' });

    const demotedCode = await freshCode();
    await RoleAssignment.updateOne({ userId: session.user._id, tenantId: tenant._id }, { role: 'recipient' });
    const demoted = await exchange(demotedCode.code, demotedCode.verifier);
    expect(demoted.status).toBe(400);
    expect(demoted.body.error).toBe('invalid_grant');
    await RoleAssignment.updateOne(
      { userId: session.user._id, tenantId: tenant._id },
      { role: 'company_admin' },
    );

    const resourceCode = await freshCode();
    const wrongResource = await exchange(resourceCode.code, resourceCode.verifier, {
      resource: `${oauthIssuer()}/mcp/`,
    });
    expect(wrongResource.status).toBe(400);
    expect(wrongResource.body.error).toBe('invalid_target');
  });

  it('lists an entity manager workspace and accepts its OAuth token on /mcp', async () => {
    const tenant = await makeTenant({ name: 'Entity Co', slug: 'entity-co' });
    const made = await adminSession(tenant, {
      role: 'entity_manager',
      scopeType: 'entity',
      email: 'manager@entity-co.test.io',
      name: 'Entity Manager',
    });
    const agent = request.agent(app);
    const { verifier } = await begin(agent);
    const session = await agent.get('/oauth/consent/session').set('Authorization', `Bearer ${made.token}`);
    expect(session.body.workspaces).toEqual([{ id: String(tenant._id), name: 'Entity Co' }]);
    const decision = await approve(agent, made.token, String(tenant._id));
    expect(decision.status).toBe(200);
    const resumed = await agent.get(new URL(decision.body.resumeUrl).pathname).redirects(0);
    const code = redirectTarget(resumed.headers.location).searchParams.get('code');
    const tokenResponse = await exchange(code, verifier);
    expect(tokenResponse.status).toBe(200);
    const accessToken = tokenResponse.body.access_token;
    expect(String(accessToken).split('.')).toHaveLength(3);
    const claims = withoutSecrets(tokenResponse);
    expect(claims.scope).toBe('catalog:read');
    const mcp = await request(app)
      .post('/mcp')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('Mcp-Method', 'tools/list')
      .set('MCP-Protocol-Version', '2026-07-28')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      });
    expect(mcp.status).toBe(200);
    expect(JSON.stringify(mcp.body) + (mcp.text || '')).toContain('catalog_search');
  });

  it('loads the consent screen without an API bearer token', async () => {
    const page = await request(app).get('/oauth/consent');
    expect(page.status).not.toBe(401);
    expect(page.headers['www-authenticate']).toBeUndefined();
    const session = await request(app).get('/oauth/consent/session');
    expect(session.status).toBe(401);
  });
});
