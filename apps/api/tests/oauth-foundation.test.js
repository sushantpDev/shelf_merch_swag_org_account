import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { clearTestDb, connectTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { authHeader, makeTenant, makeUser } from './helpers.js';
import { assertOauthIssuer } from '../src/modules/oauth/oauth.config.js';
import {
  LOCAL_OAUTH_CLIENT_ID,
  LOCAL_OAUTH_REDIRECT_URI,
  mcpResourceUrl,
  oauthIssuer,
} from '../src/modules/oauth/oauth.config.js';
import { getOidcProvider } from '../src/modules/oauth/createOidcProvider.js';

let app;

function s256(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

function claimsOf(token) {
  const segment = token.split('.')[1];
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
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

describe('OAuth issuer', () => {
  it('rejects a non-HTTPS issuer in production', () => {
    expect(() => assertOauthIssuer('http://shelfmerch.io', 'production')).toThrow(/HTTPS/);
    expect(() => assertOauthIssuer('https://user:pass@shelfmerch.io', 'production')).toThrow(/credentials/);
    expect(() => assertOauthIssuer('https://shelfmerch.io/oauth', 'production')).toThrow(/path/);
    expect(assertOauthIssuer('https://shelfmerch.io', 'production')).toBe('https://shelfmerch.io');
  });
});

describe('OAuth discovery and protected-resource metadata', () => {
  it('publishes the authorization server and the MCP resource', async () => {
    const issuer = oauthIssuer();
    const resource = mcpResourceUrl();

    const discovery = await request(app).get('/.well-known/oauth-authorization-server');
    expect(discovery.status).toBe(200);
    expect(discovery.headers['content-type']).toMatch(/json/);
    expect(discovery.body.issuer).toBe(issuer);
    expect(discovery.body.authorization_endpoint).toBe(`${issuer}/auth`);
    expect(discovery.body.token_endpoint).toBe(`${issuer}/token`);
    expect(discovery.body.jwks_uri).toBe(`${issuer}/jwks`);
    expect(discovery.body.revocation_endpoint).toBe(`${issuer}/token/revocation`);
    expect(discovery.body.code_challenge_methods_supported).toEqual(['S256']);
    expect(discovery.body.authorization_response_iss_parameter_supported).toBe(true);
    expect(discovery.body.registration_endpoint).toBeUndefined();
    expect(discovery.body.userinfo_endpoint).toBeUndefined();
    expect(discovery.body.grant_types_supported).toEqual(expect.arrayContaining(['authorization_code', 'refresh_token']));
    expect(discovery.body.response_types_supported).toEqual(['code']);
    expect(discovery.body.token_endpoint_auth_methods_supported).toEqual(['none', 'private_key_jwt']);
    expect(discovery.body.client_id_metadata_document_supported).toBe(true);
    expect(discovery.body.registration_endpoint).toBeUndefined();
    expect(discovery.body.scopes_supported).toEqual(expect.arrayContaining(['catalog:read']));
    expect(discovery.body.scopes_supported).toContain('offline_access');

    const metadata = await request(app).get('/.well-known/oauth-protected-resource/mcp');
    expect(metadata.status).toBe(200);
    expect(metadata.headers['access-control-allow-origin']).toBe('*');
    expect(metadata.body.resource).toBe(resource);
    expect(metadata.body.authorization_servers).toEqual([issuer]);
    expect(metadata.body.scopes_supported).toEqual(['catalog:read', 'orders:read', 'campaigns:read', 'wallets:read', 'employees:read', 'gifts:read']);
    expect(metadata.body.bearer_methods_supported).toEqual(['header']);

    const jwks = await request(app).get('/jwks');
    expect(jwks.status).toBe(200);
    expect(jwks.body.keys.length).toBeGreaterThan(0);
    expect(jwks.body.keys.every((key) => key.d === undefined && key.p === undefined)).toBe(true);
  });
});

describe('authorization request policy', () => {
  function authorize(query) {
    return request(app).get('/auth').query({
      client_id: LOCAL_OAUTH_CLIENT_ID,
      redirect_uri: LOCAL_OAUTH_REDIRECT_URI,
      response_type: 'code',
      scope: 'catalog:read',
      state: 'state-1',
      ...query,
    });
  }

  it('rejects a missing PKCE challenge before login', async () => {
    const res = await authorize({ resource: mcpResourceUrl() });
    expect([302, 303]).toContain(res.status);
    const location = new URL(res.headers.location);
    expect(location.origin + location.pathname).toBe(LOCAL_OAUTH_REDIRECT_URI);
    expect(location.searchParams.get('error')).toBe('invalid_request');
    expect(location.searchParams.get('iss')).toBe(oauthIssuer());
    expect(location.searchParams.get('code')).toBeNull();
  });

  it('rejects the plain PKCE method', async () => {
    const verifier = randomBytes(32).toString('base64url');
    const res = await authorize({
      resource: mcpResourceUrl(),
      code_challenge: verifier,
      code_challenge_method: 'plain',
    });
    expect([302, 303]).toContain(res.status);
    const location = new URL(res.headers.location);
    expect(location.searchParams.get('error')).toBe('invalid_request');
    expect(location.searchParams.get('iss')).toBe(oauthIssuer());
  });

  it('rejects a missing resource and a resource that is not this MCP server', async () => {
    const verifier = randomBytes(32).toString('base64url');
    const pkce = { code_challenge: s256(verifier), code_challenge_method: 'S256' };

    const missing = await authorize(pkce);
    expect([302, 303]).toContain(missing.status);
    expect(new URL(missing.headers.location).searchParams.get('error')).toBe('invalid_target');
    expect(new URL(missing.headers.location).searchParams.get('iss')).toBe(oauthIssuer());

    const foreign = await authorize({ ...pkce, resource: 'https://evil.example/mcp' });
    expect([302, 303]).toContain(foreign.status);
    expect(new URL(foreign.headers.location).searchParams.get('error')).toBe('invalid_target');

    const slash = await authorize({ ...pkce, resource: `${mcpResourceUrl()}/` });
    expect([302, 303]).toContain(slash.status);
    expect(new URL(slash.headers.location).searchParams.get('error')).toBe('invalid_target');
  });

  it('does not issue a code when PKCE and resource are valid, before the user approves', async () => {
    const verifier = randomBytes(32).toString('base64url');
    const res = await authorize({
      resource: mcpResourceUrl(),
      code_challenge: s256(verifier),
      code_challenge_method: 'S256',
    });
    expect([302, 303]).toContain(res.status);
    const location = res.headers.location;
    expect(location).toContain('/oauth/consent');
    expect(location).not.toContain('code=');
  });
});

describe('MCP authentication challenge', () => {
  it('challenges a missing access token', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    const challenge = res.headers['www-authenticate'];
    expect(challenge).toContain(`resource_metadata="${oauthIssuer()}/.well-known/oauth-protected-resource/mcp"`);
    expect(challenge).toContain(
      'scope="catalog:read orders:read campaigns:read wallets:read employees:read gifts:read offline_access"',
    );
  });

  it('rejects a ShelfMerch application JWT when legacy access is disabled', async () => {
    const previous = env.NODE_ENV;
    const previousIssuer = env.MCP_OAUTH_ISSUER;
    env.NODE_ENV = 'production';
    env.MCP_OAUTH_ISSUER = 'https://localhost:8080';
    try {
      const tenant = await makeTenant();
      const { token } = await makeUser(tenant, 'company_admin', 'tenant');
      const allowedHost = new URL(env.APP_URL || 'http://localhost:8080').host;
      const res = await request(app)
        .post('/mcp')
        .set('Host', allowedHost)
        .set(authHeader(token))
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toContain('error="invalid_token"');
      expect(JSON.stringify(res.body)).not.toContain('catalog_search');
    } finally {
      env.NODE_ENV = previous;
      env.MCP_OAUTH_ISSUER = previousIssuer;
    }
  });

  it('still accepts a ShelfMerch application JWT while the development flag is on', async () => {
    expect(env.MCP_ALLOW_LEGACY_JWT).toBe('true');
    expect(env.NODE_ENV).not.toBe('production');
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin', 'tenant');
    const res = await request(app)
      .post('/mcp')
      .set(authHeader(token))
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(res.status).toBe(200);
  });
});

describe('authorization code persistence', () => {
  async function issueCode() {
    const provider = getOidcProvider();
    const client = await provider.Client.find(LOCAL_OAUTH_CLIENT_ID);
    const accountId = 'oauth-foundation-user';
    const grant = new provider.Grant({ accountId, clientId: client.clientId });
    grant.addResourceScope(mcpResourceUrl(), 'catalog:read');
    const grantId = await grant.save();
    const verifier = randomBytes(32).toString('base64url');
    const code = new provider.AuthorizationCode({
      accountId,
      client,
      grantId,
      scope: 'catalog:read',
      redirectUri: LOCAL_OAUTH_REDIRECT_URI,
      codeChallenge: s256(verifier),
      codeChallengeMethod: 'S256',
      resource: mcpResourceUrl(),
    });
    const value = await code.save();
    return { verifier, value };
  }

  function exchange(value, verifier, resource = mcpResourceUrl()) {
    return request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: value,
        redirect_uri: LOCAL_OAUTH_REDIRECT_URI,
        client_id: LOCAL_OAUTH_CLIENT_ID,
        code_verifier: verifier,
        resource,
      });
  }

  it('stores a code with an expiration index and rejects it after expiry', async () => {
    const { value, verifier } = await issueCode();
    const collection = mongoose.connection.db.collection('oidc_payloads');
    const stored = await collection.findOne({ model: 'AuthorizationCode', id: value });
    expect(stored.expiresAt).toBeInstanceOf(Date);
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(JSON.stringify(stored)).not.toContain(verifier);

    const indexes = await collection.indexes();
    expect(indexes.some((index) => index.expireAfterSeconds === 0 && index.key.expiresAt === 1)).toBe(true);

    await collection.updateOne(
      { model: 'AuthorizationCode', id: value },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    const expired = await exchange(value, verifier);
    expect(expired.status).toBe(400);
    expect(expired.body.error).toBe('invalid_grant');
  });

  it('consumes an authorization code once when two exchanges race', async () => {
    const { value, verifier } = await issueCode();
    const [first, second] = await Promise.all([
      exchange(value, verifier),
      exchange(value, verifier),
    ]);
    const responses = [first, second];
    const succeeded = responses.filter((res) => res.status === 200);
    const rejected = responses.filter((res) => res.status === 400);
    expect(succeeded).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].body.error).toBe('invalid_grant');

    const claims = claimsOf(succeeded[0].body.access_token);
    expect(claims.iss).toBe(oauthIssuer());
    expect(claims.aud).toBe(mcpResourceUrl());
    expect(succeeded[0].body.access_token.split('.')).toHaveLength(3);

    const again = await exchange(value, verifier);
    expect(again.status).toBe(400);
    expect(again.body.error).toBe('invalid_grant');
  });

  it('rejects a token request whose resource is not the granted MCP resource', async () => {
    const { value, verifier } = await issueCode();
    const res = await exchange(value, verifier, 'https://evil.example/mcp');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_target');
  });
});

describe('existing routes stay in place', () => {
  it('keeps login and the health check on the JSON API', async () => {
    const health = await request(app).get('/api/v1/health/live');
    expect(health.status).toBe(200);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'not-a-real-password' });
    expect([400, 401]).toContain(login.status);
    expect(login.headers['content-type']).toMatch(/json/);
  });
});
