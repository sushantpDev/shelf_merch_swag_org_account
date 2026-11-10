import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { importJWK, SignJWT } from 'jose';
import { clearTestDb, connectTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { shopSignOptions } from '../src/config/jwt.js';
import { makeTenant, makeUser } from './helpers.js';
import { signAccessToken } from '../src/modules/auth/auth.service.js';
import { User } from '../src/modules/users/user.model.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { PasswordResetToken } from '../src/modules/auth/passwordResetToken.model.js';
import { signRedemptionSession } from '../src/modules/redemptions/redemptions.service.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import {
  LOCAL_OAUTH_CLIENT_ID,
  LOCAL_OAUTH_REDIRECT_URI,
  mcpResourceUrl,
  oauthIssuer,
  oidcJwks,
} from '../src/modules/oauth/oauth.config.js';

const PROTOCOL = '2026-07-28';

let app;
let replica;

function s256(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

function redirectTarget(location) {
  return new URL(location, oauthIssuer());
}

function takeTokens(res) {
  const accessToken = res.body?.access_token ?? null;
  const refreshToken = res.body?.refresh_token ?? null;
  if (res.body && typeof res.body === 'object') {
    delete res.body.access_token;
    delete res.body.refresh_token;
    delete res.body.id_token;
  }
  return { status: res.status, error: res.body?.error, accessToken, refreshToken };
}

function mcpOn(target, token, method, params = {}, headers = {}) {
  const req = request(target)
    .post('/mcp')
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .set('MCP-Protocol-Version', PROTOCOL)
    .set('Mcp-Method', method);
  if (typeof params.name === 'string') req.set('Mcp-Name', params.name);
  if (token) req.set('Authorization', 'Bearer ' + token);
  for (const [name, value] of Object.entries(headers)) req.set(name, value);
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

function mcpCall(token, method, params = {}, headers = {}) {
  return mcpOn(app, token, method, params, headers);
}

function bodyText(res) {
  return `${JSON.stringify(res.body ?? {})}${res.text || ''}`;
}

async function adminSession(tenant, extra = {}) {
  const email = extra.email ?? `admin-${tenant.slug}@test.io`;
  const password = extra.password ?? 'correct-horse-1';
  const made = await makeUser(tenant, extra.role ?? 'company_admin', extra.scopeType ?? 'tenant', {
    email,
    password,
    name: extra.name ?? 'Ada Admin',
  });
  const login = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(login.status).toBe(200);
  const token = login.body.accessToken;
  delete login.body.accessToken;
  delete login.body.refreshToken;
  return { ...made, token, email, password };
}

async function issueOauth(tenant, session) {
  const agent = request.agent(app);
  const verifier = randomBytes(32).toString('base64url');
  const started = await agent.get('/auth').redirects(0).query({
    client_id: LOCAL_OAUTH_CLIENT_ID,
    redirect_uri: LOCAL_OAUTH_REDIRECT_URI,
    response_type: 'code',
    scope: 'catalog:read',
    resource: mcpResourceUrl(),
    state: 'mcp-state',
    code_challenge: s256(verifier),
    code_challenge_method: 'S256',
  });
  expect([302, 303]).toContain(started.status);
  const decision = await agent
    .post('/oauth/consent/decision')
    .set('Authorization', `Bearer ${session.token}`)
    .send({ decision: 'allow', tenantId: String(tenant._id) });
  expect(decision.status).toBe(200);
  const resumed = await agent.get(new URL(decision.body.resumeUrl).pathname).redirects(0);
  const redirected = redirectTarget(resumed.headers.location);
  const exchanged = takeTokens(await request(app).post('/token').type('form').send({
    grant_type: 'authorization_code',
    code: redirected.searchParams.get('code'),
    redirect_uri: LOCAL_OAUTH_REDIRECT_URI,
    client_id: LOCAL_OAUTH_CLIENT_ID,
    code_verifier: verifier,
    resource: mcpResourceUrl(),
  }));
  expect(exchanged.status).toBe(200);
  expect(exchanged.accessToken).toBeTruthy();
  expect(exchanged.refreshToken).toBeTruthy();
  return exchanged;
}

function refresh(refreshToken) {
  return request(app).post('/token').type('form').send({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: LOCAL_OAUTH_CLIENT_ID,
    resource: mcpResourceUrl(),
  }).then(takeTokens);
}

async function signResourceJwt({ sub, grantId, audience, scope, expiresInSec, kid }) {
  const jwk = oidcJwks().keys[0];
  const key = await importJWK(jwk, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ scope, client_id: LOCAL_OAUTH_CLIENT_ID, grant_id: grantId })
    .setProtectedHeader({ alg: 'RS256', kid: kid ?? jwk.kid, typ: 'at+jwt' })
    .setIssuer(oauthIssuer())
    .setSubject(String(sub))
    .setAudience(audience)
    .setIssuedAt(now - 10)
    .setExpirationTime(now + expiresInSec)
    .setJti(randomBytes(8).toString('hex'))
    .sign(key);
}

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
  replica = createApp();
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  clearTenantLimitCache();
});

describe('OAuth access tokens on /mcp', () => {
  it('searches the catalog after the authorization-code flow', async () => {
    await CatalogProduct.create({
      sku: 'MUG-1',
      name: 'Ceramic Mug',
      brand: 'Shelf',
      category: 'Drinkware',
      basePriceInr: 118,
      gstRate: 18,
      costPriceInr: 40,
      supplierName: 'Secret Mill',
      status: 'active',
      source: { provider: 'manual' },
    });
    const tenant = await makeTenant({ slug: 'oauth-catalog' });
    const session = await adminSession(tenant);
    const issued = await issueOauth(tenant, session);
    const claims = JSON.parse(Buffer.from(issued.accessToken.split('.')[1], 'base64url').toString('utf8'));
    expect(claims.iss).toBe(oauthIssuer());
    expect(claims.aud).toBe(mcpResourceUrl());
    expect(claims.scope).toBe('catalog:read');
    expect(typeof claims.grant_id).toBe('string');

    const found = await mcpCall(issued.accessToken, 'tools/call', {
      name: 'catalog_search',
      arguments: { query: 'MUG-1', tenantId: 'forged-tenant' },
    });
    expect(found.status).toBe(200);
    const text = bodyText(found);
    expect(text).toContain('MUG-1');
    expect(text).not.toContain('costPriceInr');
    expect(text).not.toContain('Secret Mill');
  });

  it('rejects missing, invalid, expired, and wrong-audience tokens', async () => {
    const tenant = await makeTenant({ slug: 'bad-token' });
    const session = await adminSession(tenant);
    const issued = await issueOauth(tenant, session);
    const claims = JSON.parse(Buffer.from(issued.accessToken.split('.')[1], 'base64url').toString('utf8'));

    const missing = await mcpCall(null, 'tools/list');
    expect(missing.status).toBe(401);
    expect(missing.headers['www-authenticate']).toContain('resource_metadata=');
    expect(missing.headers['www-authenticate']).not.toContain('error=');

    const invalid = await mcpCall('not-a-token', 'tools/list');
    expect(invalid.status).toBe(401);
    expect(invalid.headers['www-authenticate']).toContain('error="invalid_token"');

    const expired = await signResourceJwt({
      sub: session.user._id,
      grantId: claims.grant_id,
      audience: mcpResourceUrl(),
      scope: 'catalog:read',
      expiresInSec: -30,
    });
    const expiredRes = await mcpCall(expired, 'tools/list');
    expect(expiredRes.status).toBe(401);
    expect(expiredRes.headers['www-authenticate']).toContain('error="invalid_token"');

    const wrongAudience = await signResourceJwt({
      sub: session.user._id,
      grantId: claims.grant_id,
      audience: `${oauthIssuer()}/api`,
      scope: 'catalog:read',
      expiresInSec: 60,
    });
    const wrong = await mcpCall(wrongAudience, 'tools/list');
    expect(wrong.status).toBe(401);
    expect(wrong.headers['www-authenticate']).toContain('error="invalid_token"');

    const extraScope = await signResourceJwt({
      sub: session.user._id,
      grantId: claims.grant_id,
      audience: mcpResourceUrl(),
      scope: 'catalog:read profile',
      expiresInSec: 60,
    });
    const scopeRes = await mcpCall(extraScope, 'tools/list');
    expect(scopeRes.status).toBe(403);
    expect(scopeRes.body.error.code).toBe('INSUFFICIENT_SCOPE');
    expect(scopeRes.headers['www-authenticate']).toContain('error="insufficient_scope"');
  });

  it('rejects an MCP access token on REST routes', async () => {
    const tenant = await makeTenant({ slug: 'rest-reject' });
    const session = await adminSession(tenant);
    const issued = await issueOauth(tenant, session);
    const rest = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${issued.accessToken}`);
    expect(rest.status).toBe(401);
    const web = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${session.token}`);
    expect(web.status).toBe(200);
  });

  it('rejects app, shop, and redemption tokens when production MCP is enabled', async () => {
    const previousEnv = env.NODE_ENV;
    const previousIssuer = env.MCP_OAUTH_ISSUER;
    env.NODE_ENV = 'production';
    env.MCP_OAUTH_ISSUER = 'https://localhost:8080';
    try {
      const tenant = await makeTenant({ slug: 'prod-reject' });
      const { user } = await makeUser(tenant, 'company_admin', 'tenant');
      const appToken = signAccessToken(user, {
        tenantId: tenant._id,
        role: 'company_admin',
        scopeType: 'tenant',
      });
      const shop = jwt.sign(
        { sub: 'shop-user', tenantId: String(tenant._id) },
        env.JWT_ACCESS_SECRET,
        shopSignOptions({ expiresIn: '5m' }),
      );
      const redemption = signRedemptionSession({ _id: tenant._id, tenantId: tenant._id });
      const allowedHost = new URL(env.APP_URL || 'http://localhost:8080').host;
      for (const token of [appToken, shop, redemption]) {
        const res = await request(app)
          .post('/mcp')
          .set('Host', allowedHost)
          .set('Authorization', `Bearer ${token}`)
          .set('Accept', 'application/json, text/event-stream')
          .set('Content-Type', 'application/json')
          .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
        expect(res.status).toBe(401);
        expect(res.headers['www-authenticate']).toContain('error="invalid_token"');
        expect(bodyText(res)).not.toContain('catalog_search');
      }
    } finally {
      env.NODE_ENV = previousEnv;
      env.MCP_OAUTH_ISSUER = previousIssuer;
    }
  });

  it('ignores a forged workspace id and another tenant header', async () => {
    await CatalogProduct.create({
      sku: 'MUG-1',
      name: 'Ceramic Mug',
      category: 'Drinkware',
      basePriceInr: 118,
      status: 'active',
      source: { provider: 'manual' },
    });
    const tenant = await makeTenant({ slug: 'bound-ws' });
    const other = await makeTenant({ slug: 'other-ws', status: 'suspended' });
    const session = await adminSession(tenant);
    const issued = await issueOauth(tenant, session);
    const found = await mcpCall(issued.accessToken, 'tools/call', {
      name: 'catalog_search',
      arguments: { query: 'MUG-1', tenantId: String(other._id) },
    }, { 'X-Tenant-Id': String(other._id) });
    expect(found.status).toBe(200);
    expect(bodyText(found)).toContain('MUG-1');
  });

  it('rejects a deleted or downgraded role without using an old role claim', async () => {
    const tenant = await makeTenant({ slug: 'role-change' });
    const session = await adminSession(tenant);
    const issued = await issueOauth(tenant, session);
    await RoleAssignment.updateOne({ userId: session.user._id }, { role: 'company_finance_user' });
    const downgraded = await mcpCall(issued.accessToken, 'tools/list');
    expect(downgraded.status).toBe(403);
    expect(downgraded.body.error.code).toBe('INSUFFICIENT_SCOPE');

    await RoleAssignment.deleteMany({ userId: session.user._id });
    const deleted = await mcpCall(issued.accessToken, 'tools/list');
    expect(deleted.status).toBe(403);
    expect(deleted.headers['www-authenticate']).toContain('error="insufficient_scope"');
    expect(bodyText(deleted)).not.toContain('company_admin');
  });

  it('stops access when the user or workspace is suspended', async () => {
    const tenant = await makeTenant({ slug: 'suspend-ws' });
    const session = await adminSession(tenant);
    const issued = await issueOauth(tenant, session);
    await User.updateOne({ _id: session.user._id }, { status: 'suspended' });
    const userSuspended = await mcpCall(issued.accessToken, 'tools/list');
    expect(userSuspended.status).toBe(401);
    expect(userSuspended.headers['www-authenticate']).toContain('error="invalid_token"');

    await User.updateOne({ _id: session.user._id }, { status: 'active' });
    await Tenant.updateOne({ _id: tenant._id }, { status: 'suspended' });
    const workspaceSuspended = await mcpCall(issued.accessToken, 'tools/list');
    expect(workspaceSuspended.status).toBe(401);
  });

  it('revokes the grant from connected-app disconnect and ignores a foreign user id', async () => {
    const tenant = await makeTenant({ slug: 'disconnect' });
    const victim = await adminSession(tenant, { email: 'victim@disconnect.test.io' });
    const attacker = await adminSession(tenant, { email: 'attacker@disconnect.test.io' });
    const issued = await issueOauth(tenant, victim);
    const blocked = await request(app)
      .post('/api/v1/oauth/grants/disconnect')
      .set('Authorization', `Bearer ${attacker.token}`)
      .send({ userId: String(victim.user._id) });
    expect(blocked.status).toBe(200);
    const stillThere = await mcpCall(issued.accessToken, 'tools/list');
    expect(stillThere.status).toBe(200);

    const disconnected = await request(app)
      .post('/api/v1/oauth/grants/disconnect')
      .set('Authorization', `Bearer ${victim.token}`)
      .send({ userId: String(attacker.user._id) });
    expect(disconnected.status).toBe(200);
    const gone = await mcpCall(issued.accessToken, 'tools/list');
    expect(gone.status).toBe(401);
    const replay = await refresh(issued.refreshToken);
    expect(replay.status).toBe(400);
    expect(replay.error).toBe('invalid_grant');
  });

  it('revokes MCP access on password reset and logout everywhere', async () => {
    const tenant = await makeTenant({ slug: 'revoke-session' });
    const session = await adminSession(tenant);
    const resetIssued = await issueOauth(tenant, session);
    const raw = randomBytes(32).toString('hex');
    await PasswordResetToken.create({
      userId: session.user._id,
      tokenHash: createHash('sha256').update(raw).digest('hex'),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    const reset = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: raw, newPassword: 'NewPassw0rd!' });
    expect(reset.status).toBe(200);
    delete reset.body.accessToken;
    delete reset.body.refreshToken;
    const afterReset = await mcpCall(resetIssued.accessToken, 'tools/list');
    expect(afterReset.status).toBe(401);
    const resetRefresh = await refresh(resetIssued.refreshToken);
    expect(resetRefresh.status).toBe(400);

    const relogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: session.email, password: 'NewPassw0rd!' });
    expect(relogin.status).toBe(200);
    const webToken = relogin.body.accessToken;
    delete relogin.body.accessToken;
    delete relogin.body.refreshToken;
    const again = await issueOauth(tenant, { ...session, token: webToken });
    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${webToken}`)
      .send({ everywhere: true });
    expect(logout.status).toBe(200);
    const afterLogout = await mcpCall(again.accessToken, 'tools/list');
    expect(afterLogout.status).toBe(401);
    const logoutRefresh = await refresh(again.refreshToken);
    expect(logoutRefresh.status).toBe(400);
    expect(logoutRefresh.error).toBe('invalid_grant');
  });

  it('serves concurrent catalog calls and enforces the tenant request quota', async () => {
    await CatalogProduct.create({
      sku: 'MUG-1',
      name: 'Ceramic Mug',
      category: 'Drinkware',
      basePriceInr: 118,
      status: 'active',
      source: { provider: 'manual' },
    });
    const tenant = await makeTenant({ slug: 'concurrent', limits: { requestsPerMinute: 2 } });
    clearTenantLimitCache(tenant._id);
    const session = await adminSession(tenant);
    const issued = await issueOauth(tenant, session);
    const [first, second] = await Promise.all([
      mcpCall(issued.accessToken, 'tools/call', { name: 'catalog_search', arguments: { query: 'MUG-1' } }),
      mcpCall(issued.accessToken, 'tools/call', { name: 'catalog_search', arguments: { query: 'MUG-1' } }),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const third = await mcpCall(issued.accessToken, 'tools/list');
    expect(third.status).toBe(429);
  });

  it('uses the same authorization records on a second app instance', async () => {
    const tenant = await makeTenant({ slug: 'replica' });
    const session = await adminSession(tenant);
    const issued = await issueOauth(tenant, session);
    const other = await mcpOn(replica, issued.accessToken, 'tools/list');
    expect(other.status).toBe(200);
    await request(app)
      .post('/api/v1/oauth/grants/disconnect')
      .set('Authorization', `Bearer ${session.token}`)
      .send({});
    const firstApp = await mcpCall(issued.accessToken, 'tools/list');
    const secondApp = await mcpOn(replica, issued.accessToken, 'tools/list');
    expect(firstApp.status).toBe(401);
    expect(secondApp.status).toBe(401);
  });

  it('rotates refresh tokens and revokes the family on reuse, including a concurrent race', async () => {
    const tenant = await makeTenant({ slug: 'refresh-rotate' });
    const session = await adminSession(tenant);
    const issued = await issueOauth(tenant, session);

    const rotated = await refresh(issued.refreshToken);
    expect(rotated.status).toBe(200);
    const second = await refresh(rotated.refreshToken);
    expect(second.status).toBe(200);
    const replay = await refresh(issued.refreshToken);
    expect(replay.status).toBe(400);
    expect(replay.error).toBe('invalid_grant');
    const afterReuse = await refresh(second.refreshToken);
    expect(afterReuse.status).toBe(400);
    const staleAccess = await mcpCall(rotated.accessToken, 'tools/list');
    expect(staleAccess.status).toBe(401);

    const fresh = await issueOauth(tenant, session);
    const [left, right] = await Promise.all([refresh(fresh.refreshToken), refresh(fresh.refreshToken)]);
    const statuses = [left.status, right.status].sort();
    expect(statuses).toEqual([200, 400]);
    const winner = left.status === 200 ? left : right;
    const raced = await refresh(fresh.refreshToken);
    expect(raced.status).toBe(400);
    expect(raced.error).toBe('invalid_grant');
    const family = await refresh(winner.refreshToken);
    expect(family.status).toBe(400);
    const racedAccess = await mcpCall(winner.accessToken, 'tools/list');
    expect(racedAccess.status).toBe(401);
  });
});
