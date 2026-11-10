import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { exportJWK, importPKCS8, SignJWT } from 'jose';
import { clearTestDb, connectTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { makeTenant, makeUser } from './helpers.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { mcpResourceUrl, oauthIssuer } from '../src/modules/oauth/oauth.config.js';

const PROTOCOL = '2026-07-28';
const JWKS_URL = 'https://chatgpt.com/oauth/jwks.json';
const STABLE_CLIENT = 'https://chatgpt.com/oauth/client.json';
const STABLE_REDIRECT = 'https://chatgpt.com/connector_platform_oauth_redirect';

let app;
let replica;
let privateKey;
let publicJwk;

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
  return { status: res.status, error: res.body?.error, description: res.body?.error_description, accessToken, refreshToken };
}

function metadataDocument({ clientId, redirectUris, method, extra = {} }) {
  return {
    client_id: clientId,
    client_name: 'ChatGPT',
    client_uri: 'https://chatgpt.com/',
    redirect_uris: redirectUris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: method,
    ...(method === 'private_key_jwt'
      ? { token_endpoint_auth_signing_alg: 'RS256', jwks_uri: JWKS_URL }
      : {}),
    ...extra,
  };
}

function installFetch(routes) {
  const calls = [];
  vi.stubGlobal('fetch', async (url) => {
    const href = String(url);
    calls.push(href);
    const route = routes.get(href);
    if (!route) return new Response('missing', { status: 404 });
    return route.clone();
  });
  return calls;
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'max-age=30', ...headers },
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

async function authorizeAndApprove({ clientId, redirectUri, scope = 'catalog:read' }) {
  const tenant = await makeTenant({ slug: `cg-${randomBytes(3).toString('hex')}` });
  const session = await adminSession(tenant);
  const agent = request.agent(app);
  const verifier = randomBytes(32).toString('base64url');
  const started = await agent.get('/auth').redirects(0).query({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    resource: mcpResourceUrl(),
    state: 'chatgpt-state',
    code_challenge: s256(verifier),
    code_challenge_method: 'S256',
  });
  return { tenant, session, agent, verifier, started };
}

async function finishConsent(pending) {
  expect([302, 303]).toContain(pending.started.status);
  expect(pending.started.headers.location).toContain('/oauth/consent');
  const decision = await pending.agent
    .post('/oauth/consent/decision')
    .set('Authorization', `Bearer ${pending.session.token}`)
    .send({ decision: 'allow', tenantId: String(pending.tenant._id) });
  expect(decision.status).toBe(200);
  const resumed = await pending.agent.get(new URL(decision.body.resumeUrl).pathname).redirects(0);
  const redirected = redirectTarget(resumed.headers.location);
  expect(redirected.origin + redirected.pathname).toBe(pending.redirectUri ?? STABLE_REDIRECT);
  expect(redirected.searchParams.get('iss')).toBe(oauthIssuer());
  return { ...pending, code: redirected.searchParams.get('code') };
}

function tokenForm(fields) {
  return request(app).post('/token').type('form').send(fields).then(takeTokens);
}

async function assertionFor(clientId, { jti, expiresInSec = 120, key = privateKey, audience } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid, typ: 'JWT' })
    .setIssuer(clientId)
    .setSubject(clientId)
    .setAudience(audience ?? `${oauthIssuer()}/token`)
    .setJti(jti ?? randomBytes(12).toString('hex'))
    .setIssuedAt(now)
    .setExpirationTime(now + expiresInSec)
    .sign(key);
}

function mcpCall(token, method, params = {}) {
  const req = request(app)
    .post('/mcp')
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .set('MCP-Protocol-Version', PROTOCOL)
    .set('Mcp-Method', method)
    .set('Authorization', 'Bearer ' + token);
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

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
  replica = createApp();
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  privateKey = await importPKCS8(pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), 'RS256');
  publicJwk = await exportJWK(pair.publicKey);
  publicJwk.kid = 'chatgpt-test';
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

describe('ChatGPT OAuth client compatibility', () => {
  it('advertises CIMD, PKCE S256, issuer identification, and no dynamic registration', async () => {
    const discovery = await request(app).get('/.well-known/oauth-authorization-server');
    expect(discovery.status).toBe(200);
    expect(discovery.body.client_id_metadata_document_supported).toBe(true);
    expect(discovery.body.authorization_response_iss_parameter_supported).toBe(true);
    expect(discovery.body.registration_endpoint).toBeUndefined();
    expect(discovery.body.code_challenge_methods_supported).toEqual(['S256']);
    expect(discovery.body.token_endpoint_auth_methods_supported).toEqual(['none', 'private_key_jwt']);
    expect(discovery.body.scopes_supported).toEqual(expect.arrayContaining(['catalog:read', 'openid']));
    expect(discovery.body.scopes_supported).not.toEqual(expect.arrayContaining(['email', 'profile']));
    expect(discovery.body.userinfo_endpoint).toBeUndefined();
  });

  it('accepts a public ChatGPT metadata document and searches the catalog', async () => {
    const clientId = 'https://chatgpt.com/oauth/public-client/client.json';
    installFetch(new Map([
      [clientId, jsonResponse(metadataDocument({
        clientId,
        redirectUris: ['https://chatgpt.com/connector/oauth/public-client'],
        method: 'none',
      }))],
    ]));
    await CatalogProduct.create({
      sku: 'MUG-1',
      name: 'Ceramic Mug',
      category: 'Drinkware',
      basePriceInr: 118,
      status: 'active',
      source: { provider: 'manual' },
    });
    const pending = await authorizeAndApprove({
      clientId,
      redirectUri: 'https://chatgpt.com/connector/oauth/public-client',
    });
    const approved = await finishConsent({
      ...pending,
      redirectUri: 'https://chatgpt.com/connector/oauth/public-client',
    });
    const issued = await tokenForm({
      grant_type: 'authorization_code',
      code: approved.code,
      redirect_uri: 'https://chatgpt.com/connector/oauth/public-client',
      client_id: clientId,
      code_verifier: pending.verifier,
      resource: mcpResourceUrl(),
    });
    expect(issued.status).toBe(200);
    const found = await mcpCall(issued.accessToken, 'tools/call', {
      name: 'catalog_search',
      arguments: { query: 'MUG-1', tenantId: 'forged' },
    });
    expect(found.status).toBe(200);
    expect(JSON.stringify(found.body)).toContain('MUG-1');
    const listed = await mcpCall(issued.accessToken, 'tools/list');
    expect(listed.status).toBe(200);
    expect(JSON.stringify(listed.body)).toContain('catalog:read');
  });

  it('allows the advertised openid scope and rejects email', async () => {
    const clientId = STABLE_CLIENT;
    installFetch(new Map([
      [clientId, jsonResponse(metadataDocument({
        clientId,
        redirectUris: [STABLE_REDIRECT],
        method: 'none',
      }))],
    ]));
    const pending = await authorizeAndApprove({ clientId, redirectUri: STABLE_REDIRECT, scope: 'openid catalog:read' });
    const approved = await finishConsent({ ...pending, redirectUri: STABLE_REDIRECT });
    const issued = await tokenForm({
      grant_type: 'authorization_code',
      code: approved.code,
      redirect_uri: STABLE_REDIRECT,
      client_id: clientId,
      code_verifier: pending.verifier,
      resource: mcpResourceUrl(),
    });
    expect(issued.status).toBe(200);
    const claims = JSON.parse(Buffer.from(issued.accessToken.split('.')[1], 'base64url').toString('utf8'));
    expect(claims.scope.split(' ').sort()).toEqual(['catalog:read']);
    expect(claims).not.toHaveProperty('email');

    const email = await request(app).get('/auth').redirects(0).query({
      client_id: clientId,
      redirect_uri: STABLE_REDIRECT,
      response_type: 'code',
      scope: 'openid email catalog:read',
      resource: mcpResourceUrl(),
      state: 'email-state',
      code_challenge: s256(randomBytes(32).toString('base64url')),
      code_challenge_method: 'S256',
    });
    const location = redirectTarget(email.headers.location || oauthIssuer());
    expect(email.status === 400 || location.searchParams.get('error') === 'invalid_scope').toBe(true);
    expect(String(email.headers.location || '')).not.toContain('evil.example');
  });

  it('rejects an invalid metadata document, an untrusted redirect, and a secret client', async () => {
    const mismatch = 'https://chatgpt.com/oauth/mismatch/client.json';
    const untrusted = 'https://chatgpt.com/oauth/untrusted/client.json';
    const secret = 'https://chatgpt.com/oauth/secret/client.json';
    const foreign = 'https://evil.example/oauth/client.json';
    const calls = installFetch(new Map([
      [mismatch, jsonResponse(metadataDocument({
        clientId: 'https://chatgpt.com/oauth/other/client.json',
        redirectUris: ['https://chatgpt.com/connector/oauth/mismatch'],
        method: 'none',
      }))],
      [untrusted, jsonResponse(metadataDocument({
        clientId: untrusted,
        redirectUris: ['https://evil.example/callback'],
        method: 'none',
      }))],
      [secret, jsonResponse(metadataDocument({
        clientId: secret,
        redirectUris: ['https://chatgpt.com/connector/oauth/secret'],
        method: 'client_secret_basic',
      }))],
    ]));

    for (const clientId of [mismatch, untrusted, secret, foreign, 'https://127.0.0.1/oauth/client.json']) {
      const res = await request(app).get('/auth').redirects(0).query({
        client_id: clientId,
        redirect_uri: 'https://chatgpt.com/connector/oauth/mismatch',
        response_type: 'code',
        scope: 'catalog:read',
        resource: mcpResourceUrl(),
        state: 'bad',
        code_challenge: s256('verifier'),
        code_challenge_method: 'S256',
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(String(res.headers.location || '')).not.toContain('evil.example');
      expect(String(res.headers.location || '')).not.toContain('127.0.0.1');
    }
    expect(calls.some((href) => href.includes('127.0.0.1') || href.includes('evil.example'))).toBe(false);
  });

  it('does not follow a metadata redirect onto a private address', async () => {
    const clientId = 'https://chatgpt.com/oauth/redirected/client.json';
    const calls = installFetch(new Map([
      [clientId, new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/latest/meta-data' } })],
    ]));
    const res = await request(app).get('/auth').redirects(0).query({
      client_id: clientId,
      redirect_uri: 'https://chatgpt.com/connector/oauth/redirected',
      response_type: 'code',
      scope: 'catalog:read',
      resource: mcpResourceUrl(),
      state: 'redir',
      code_challenge: s256('verifier'),
      code_challenge_method: 'S256',
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((href) => href === clientId)).toBe(true);
  });

  it('requires PKCE S256 and the canonical resource for a ChatGPT client', async () => {
    const clientId = STABLE_CLIENT;
    installFetch(new Map([
      [clientId, jsonResponse(metadataDocument({
        clientId,
        redirectUris: [STABLE_REDIRECT],
        method: 'none',
      }))],
    ]));
    const missingPkce = await request(app).get('/auth').redirects(0).query({
      client_id: clientId,
      redirect_uri: STABLE_REDIRECT,
      response_type: 'code',
      scope: 'catalog:read',
      resource: mcpResourceUrl(),
      state: 'pkce',
    });
    expect([302, 303, 400]).toContain(missingPkce.status);
    const pkceError = missingPkce.headers.location
      ? redirectTarget(missingPkce.headers.location).searchParams.get('error')
      : missingPkce.body?.error;
    expect(pkceError).toBe('invalid_request');

    const verifier = randomBytes(32).toString('base64url');
    const wrongResource = await request(app).get('/auth').redirects(0).query({
      client_id: clientId,
      redirect_uri: STABLE_REDIRECT,
      response_type: 'code',
      scope: 'catalog:read',
      resource: 'https://evil.example/mcp',
      state: 'resource',
      code_challenge: s256(verifier),
      code_challenge_method: 'S256',
    });
    const resourceError = wrongResource.headers.location
      ? redirectTarget(wrongResource.headers.location).searchParams.get('error')
      : wrongResource.body?.error;
    expect(resourceError).toBe('invalid_target');
  });

  it('accepts a signed client assertion and rejects a bad, expired, or replayed one', async () => {
    const clientId = 'https://chatgpt.com/oauth/signed/client.json';
    const redirectUri = 'https://chatgpt.com/connector/oauth/signed';
    installFetch(new Map([
      [clientId, jsonResponse(metadataDocument({
        clientId,
        redirectUris: [redirectUri],
        method: 'private_key_jwt',
      }))],
      [JWKS_URL, jsonResponse({ keys: [publicJwk] })],
    ]));

    async function codeFor() {
      const pending = await authorizeAndApprove({ clientId, redirectUri });
      const approved = await finishConsent({ ...pending, redirectUri });
      return { verifier: pending.verifier, code: approved.code, session: pending.session, tenant: pending.tenant };
    }

    const first = await codeFor();
    const jti = randomBytes(12).toString('hex');
    const clientAssertion = await assertionFor(clientId, { jti });
    const issued = await tokenForm({
      grant_type: 'authorization_code',
      code: first.code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: first.verifier,
      resource: mcpResourceUrl(),
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: clientAssertion,
    });
    expect(issued.status).toBe(200);
    const listed = await mcpCall(issued.accessToken, 'tools/list');
    expect(listed.status).toBe(200);

    const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const otherPrivate = await importPKCS8(otherKey.privateKey.export({ type: 'pkcs8', format: 'pem' }), 'RS256');
    const second = await codeFor();
    const badSignature = await tokenForm({
      grant_type: 'authorization_code',
      code: second.code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: second.verifier,
      resource: mcpResourceUrl(),
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: await assertionFor(clientId, { key: otherPrivate }),
    });
    expect(badSignature.status).toBe(401);
    expect(badSignature.error).toBe('invalid_client');

    const third = await codeFor();
    const expired = await tokenForm({
      grant_type: 'authorization_code',
      code: third.code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: third.verifier,
      resource: mcpResourceUrl(),
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: await assertionFor(clientId, { expiresInSec: -120 }),
    });
    expect(expired.status).toBe(401);

    const fourth = await codeFor();
    const replay = await request(replica).post('/token').type('form').send({
      grant_type: 'authorization_code',
      code: fourth.code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: fourth.verifier,
      resource: mcpResourceUrl(),
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: clientAssertion,
    });
    expect(replay.status).toBe(401);
    expect(replay.body.error).toBe('invalid_client');
    delete replay.body.access_token;

    const disconnected = await request(app)
      .post('/api/v1/oauth/grants/disconnect')
      .set('Authorization', `Bearer ${first.session.token}`)
      .send({});
    expect(disconnected.status).toBe(200);
    const after = await mcpCall(issued.accessToken, 'tools/list');
    expect(after.status).toBe(401);
    const refreshed = await tokenForm({
      grant_type: 'refresh_token',
      refresh_token: issued.refreshToken,
      client_id: clientId,
      resource: mcpResourceUrl(),
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: await assertionFor(clientId),
    });
    expect(refreshed.status).toBe(400);
    expect(refreshed.error).toBe('invalid_grant');
  });
});
