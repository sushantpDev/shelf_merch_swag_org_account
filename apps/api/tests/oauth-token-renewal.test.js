import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { exportJWK, importJWK, importPKCS8, SignJWT } from 'jose';
import { clearTestDb, connectTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { makeTenant, makeUser } from './helpers.js';
import { OauthGrantBinding } from '../src/modules/oauth/oauthGrantBinding.model.js';
import { getOidcProvider } from '../src/modules/oauth/createOidcProvider.js';
import {
  LOCAL_OAUTH_CLIENT_ID,
  LOCAL_OAUTH_REDIRECT_URI,
  mcpResourceUrl,
  oauthIssuer,
  oidcJwks,
} from '../src/modules/oauth/oauth.config.js';

const PROTOCOL = '2026-07-28';
const JWKS_URL = 'https://chatgpt.com/oauth/jwks.json';
const CLIENT_ID = 'https://chatgpt.com/oauth/renewal/client.json';
const REDIRECT_URI = 'https://chatgpt.com/connector/oauth/renewal';

let app;
let privateKey;
let publicJwk;

function s256(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

function redirectTarget(location) {
  return new URL(location, oauthIssuer());
}

function claimsOf(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

function installFetch(routes) {
  vi.stubGlobal('fetch', async (url) => {
    const route = routes.get(String(url));
    if (!route) return new Response('missing', { status: 404 });
    return route.clone();
  });
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'max-age=30' },
  });
}

async function adminSession(tenant) {
  const email = `admin-${tenant.slug}@test.io`;
  const password = 'correct-horse-1';
  const made = await makeUser(tenant, 'company_admin', 'tenant', { email, password, name: 'Ada Admin' });
  const login = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(login.status).toBe(200);
  const token = login.body.accessToken;
  delete login.body.accessToken;
  delete login.body.refreshToken;
  return { ...made, token };
}

function mcpCall(token, method, params = {}) {
  const req = request(app)
    .post('/mcp')
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .set('MCP-Protocol-Version', PROTOCOL)
    .set('Mcp-Method', method)
    .set('Authorization', `Bearer ${token}`);
  if (typeof params.name === 'string') req.set('Mcp-Name', params.name);
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

async function assertionFor(clientId) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid, typ: 'JWT' })
    .setIssuer(clientId)
    .setSubject(clientId)
    .setAudience(`${oauthIssuer()}/token`)
    .setJti(randomBytes(12).toString('hex'))
    .setIssuedAt(now)
    .setExpirationTime(now + 120)
    .sign(privateKey);
}

async function expiredAccessToken({ sub, grantId, clientId }) {
  const jwk = oidcJwks().keys[0];
  const key = await importJWK(jwk, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ scope: 'catalog:read', client_id: clientId, grant_id: grantId })
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid, typ: 'at+jwt' })
    .setIssuer(oauthIssuer())
    .setSubject(String(sub))
    .setAudience(mcpResourceUrl())
    .setIssuedAt(now - 120)
    .setExpirationTime(now - 30)
    .setJti(randomBytes(8).toString('hex'))
    .sign(key);
}

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  privateKey = await importPKCS8(pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), 'RS256');
  publicJwk = await exportJWK(pair.publicKey);
  publicJwk.kid = 'chatgpt-renewal';
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OAuth token renewal', () => {
  it('advertises offline_access on the authorization server and not as MCP data access', async () => {
    const discovery = await request(app).get('/.well-known/oauth-authorization-server');
    expect(discovery.status).toBe(200);
    expect(discovery.body.grant_types_supported).toEqual(expect.arrayContaining(['refresh_token']));
    expect(discovery.body.scopes_supported).toContain('offline_access');
    expect(discovery.body.scopes_supported).toEqual(expect.arrayContaining([
      'catalog:read', 'orders:read', 'campaigns:read', 'wallets:read', 'employees:read', 'gifts:read',
    ]));

    const metadata = await request(app).get('/.well-known/oauth-protected-resource/mcp');
    expect(metadata.body.scopes_supported).toEqual([
      'catalog:read', 'orders:read', 'campaigns:read', 'wallets:read', 'employees:read', 'gifts:read',
    ]);
    expect(metadata.body.scopes_supported).not.toContain('offline_access');
  });

  it('renews a ChatGPT private_key_jwt grant without treating offline_access as data access', async () => {
    installFetch(new Map([
      [CLIENT_ID, jsonResponse({
        client_id: CLIENT_ID,
        client_name: 'ChatGPT',
        redirect_uris: [REDIRECT_URI],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'private_key_jwt',
        token_endpoint_auth_signing_alg: 'RS256',
        jwks_uri: JWKS_URL,
      })],
      [JWKS_URL, jsonResponse({ keys: [publicJwk] })],
    ]));

    const tenant = await makeTenant({ slug: 'renew-chatgpt' });
    const session = await adminSession(tenant);
    const agent = request.agent(app);
    const verifier = randomBytes(32).toString('base64url');
    const started = await agent.get('/auth').redirects(0).query({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'catalog:read offline_access',
      resource: mcpResourceUrl(),
      state: 'renew',
      code_challenge: s256(verifier),
      code_challenge_method: 'S256',
    });
    expect([302, 303]).toContain(started.status);

    const consent = await agent
      .get('/oauth/consent/session')
      .set('Authorization', `Bearer ${session.token}`);
    expect(consent.status).toBe(200);
    expect(consent.body.scope).toBe('catalog:read');

    const decision = await agent
      .post('/oauth/consent/decision')
      .set('Authorization', `Bearer ${session.token}`)
      .send({ decision: 'allow', tenantId: String(tenant._id) });
    expect(decision.status).toBe(200);
    const resumed = await agent.get(new URL(decision.body.resumeUrl).pathname).redirects(0);
    const redirected = redirectTarget(resumed.headers.location);
    const exchanged = await request(app).post('/token').type('form').send({
      grant_type: 'authorization_code',
      code: redirected.searchParams.get('code'),
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: verifier,
      resource: mcpResourceUrl(),
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: await assertionFor(CLIENT_ID),
    });
    expect(exchanged.status).toBe(200);
    expect(exchanged.body.expires_in).toBe(15 * 60);
    expect(exchanged.body.scope.split(/\s+/).sort()).toEqual(['catalog:read', 'offline_access']);
    const accessToken = exchanged.body.access_token;
    const refreshToken = exchanged.body.refresh_token;
    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();
    delete exchanged.body.access_token;
    delete exchanged.body.refresh_token;

    const claims = claimsOf(accessToken);
    expect(claims.scope).toBe('catalog:read');
    const binding = await OauthGrantBinding.findOne({ grantId: claims.grant_id }).lean();
    expect(binding.scopes).toEqual(['catalog:read']);
    const grant = await getOidcProvider().Grant.find(claims.grant_id);
    expect(grant.getOIDCScope().split(/\s+/)).toContain('offline_access');
    expect(grant.getResourceScope(mcpResourceUrl()).split(/\s+/)).not.toContain('offline_access');

    const listed = await mcpCall(accessToken, 'tools/list');
    expect(listed.status).toBe(200);
    const gifts = await mcpCall(accessToken, 'tools/call', { name: 'gifts_search', arguments: {} });
    expect(gifts.status).toBe(403);

    const expired = await mcpCall(
      await expiredAccessToken({ sub: claims.sub, grantId: claims.grant_id, clientId: CLIENT_ID }),
      'tools/list',
    );
    expect(expired.status).toBe(401);

    async function refresh(token) {
      const res = await request(app).post('/token').type('form').send({
        grant_type: 'refresh_token',
        refresh_token: token,
        client_id: CLIENT_ID,
        resource: mcpResourceUrl(),
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: await assertionFor(CLIENT_ID),
      });
      const nextAccess = res.body?.access_token ?? null;
      const nextRefresh = res.body?.refresh_token ?? null;
      if (res.body && typeof res.body === 'object') {
        delete res.body.access_token;
        delete res.body.refresh_token;
      }
      return { status: res.status, error: res.body?.error, scope: res.body?.scope, accessToken: nextAccess, refreshToken: nextRefresh };
    }

    const first = await refresh(refreshToken);
    expect(first.status).toBe(200);
    expect(first.refreshToken).toBe(refreshToken);
    expect(first.scope.split(/\s+/).sort()).toEqual(['catalog:read', 'offline_access']);
    const second = await refresh(refreshToken);
    expect(second.status).toBe(200);
    expect(second.refreshToken).toBe(refreshToken);
    expect((await mcpCall(first.accessToken, 'tools/list')).status).toBe(200);
    expect((await mcpCall(second.accessToken, 'tools/list')).status).toBe(200);

    const [left, right] = await Promise.all([refresh(refreshToken), refresh(refreshToken)]);
    expect([left.status, right.status]).toEqual([200, 200]);
    expect((await mcpCall(left.accessToken, 'tools/list')).status).toBe(200);
    expect((await mcpCall(right.accessToken, 'tools/list')).status).toBe(200);

    const disconnected = await request(app)
      .post('/api/v1/oauth/grants/disconnect')
      .set('Authorization', `Bearer ${session.token}`)
      .send({});
    expect(disconnected.status).toBe(200);
    const revoked = await refresh(refreshToken);
    expect(revoked.status).toBe(400);
    expect(revoked.error).toBe('invalid_grant');
    expect((await mcpCall(second.accessToken, 'tools/list')).status).toBe(401);
  });

  it('still refreshes a catalog-only public client and rotates that public refresh token', async () => {
    const tenant = await makeTenant({ slug: 'renew-public' });
    const session = await adminSession(tenant);
    const agent = request.agent(app);
    const verifier = randomBytes(32).toString('base64url');
    const started = await agent.get('/auth').redirects(0).query({
      client_id: LOCAL_OAUTH_CLIENT_ID,
      redirect_uri: LOCAL_OAUTH_REDIRECT_URI,
      response_type: 'code',
      scope: 'catalog:read',
      resource: mcpResourceUrl(),
      state: 'public',
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
    const exchanged = await request(app).post('/token').type('form').send({
      grant_type: 'authorization_code',
      code: redirected.searchParams.get('code'),
      redirect_uri: LOCAL_OAUTH_REDIRECT_URI,
      client_id: LOCAL_OAUTH_CLIENT_ID,
      code_verifier: verifier,
      resource: mcpResourceUrl(),
    });
    expect(exchanged.status).toBe(200);
    expect(exchanged.body.scope).toBe('catalog:read');
    expect(exchanged.body.refresh_token).toBeTruthy();
    const refreshToken = exchanged.body.refresh_token;
    delete exchanged.body.access_token;
    delete exchanged.body.refresh_token;

    const rotated = await request(app).post('/token').type('form').send({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: LOCAL_OAUTH_CLIENT_ID,
      resource: mcpResourceUrl(),
    });
    expect(rotated.status).toBe(200);
    expect(rotated.body.refresh_token).toBeTruthy();
    expect(rotated.body.refresh_token).not.toBe(refreshToken);
    expect(rotated.body.scope).toBe('catalog:read');
    const nextAccess = rotated.body.access_token;
    const nextRefresh = rotated.body.refresh_token;
    delete rotated.body.access_token;
    delete rotated.body.refresh_token;

    expect((await mcpCall(nextAccess, 'tools/list')).status).toBe(200);
    const replay = await request(app).post('/token').type('form').send({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: LOCAL_OAUTH_CLIENT_ID,
      resource: mcpResourceUrl(),
    });
    expect(replay.status).toBe(400);
    expect(replay.body.error).toBe('invalid_grant');
    delete replay.body.access_token;
    delete replay.body.refresh_token;
    expect((await mcpCall(nextAccess, 'tools/list')).status).toBe(401);
    const continued = await request(app).post('/token').type('form').send({
      grant_type: 'refresh_token',
      refresh_token: nextRefresh,
      client_id: LOCAL_OAUTH_CLIENT_ID,
      resource: mcpResourceUrl(),
    });
    expect(continued.status).toBe(400);
    expect(continued.body.error).toBe('invalid_grant');
    delete continued.body.access_token;
    delete continued.body.refresh_token;
  });
});
