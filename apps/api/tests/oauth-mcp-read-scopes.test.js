import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { clearTestDb, connectTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { makeTenant, makeUser } from './helpers.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { getOidcProvider } from '../src/modules/oauth/createOidcProvider.js';
import {
  LOCAL_OAUTH_CLIENT_ID,
  LOCAL_OAUTH_REDIRECT_URI,
  mcpResourceUrl,
  oauthIssuer,
} from '../src/modules/oauth/oauth.config.js';
import { OauthGrantBinding } from '../src/modules/oauth/oauthGrantBinding.model.js';
import { OFFLINE_ACCESS_SCOPE, RESOURCE_SCOPES } from '../src/modules/oauth/oauthScopes.js';
import { CATALOG_PRODUCT_CARD_URI } from '../src/modules/mcp/catalogProductCard.js';
import { KIT_CATALOG_CARD_URI } from '../src/modules/mcp/kitCatalogCard.js';

const PROTOCOL = '2026-07-28';
const READ_SCOPE = RESOURCE_SCOPES.join(' ');
const INITIAL_SCOPE = READ_SCOPE + ' ' + OFFLINE_ACCESS_SCOPE;

let app;

function s256(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

function claimsOf(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

function mcpCall(token, method, params = {}) {
  const req = request(app)
    .post('/mcp')
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .set('MCP-Protocol-Version', PROTOCOL)
    .set('Mcp-Method', method);
  if (typeof params.name === 'string') req.set('Mcp-Name', params.name);
  if (token) req.set('Authorization', 'Bearer ' + token);
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
  if (res.body && res.body.jsonrpc) return res.body;
  const line = String(res.text || '').split(/\r?\n/).find((row) => row.startsWith('data: '));
  if (!line) return res.body;
  return JSON.parse(line.slice('data: '.length));
}

async function adminSession(tenant) {
  const email = 'admin-' + tenant.slug + '@test.io';
  const password = 'correct-horse-1';
  const made = await makeUser(tenant, 'company_admin', 'tenant', { email, password });
  const login = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(login.status).toBe(200);
  const token = login.body.accessToken;
  delete login.body.accessToken;
  delete login.body.refreshToken;
  return { ...made, token };
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
    state: 'scope-state',
    code_challenge: s256(verifier),
    code_challenge_method: 'S256',
  });
  expect([302, 303]).toContain(started.status);
  expect(String(started.headers.location || '')).not.toContain('invalid_scope');

  const consent = await agent
    .get('/oauth/consent/session')
    .set('Authorization', 'Bearer ' + session.token);
  expect(consent.status).toBe(200);

  const decision = await agent
    .post('/oauth/consent/decision')
    .set('Authorization', 'Bearer ' + session.token)
    .send({ decision: 'allow', tenantId: String(tenant._id) });
  expect(decision.status).toBe(200);

  const resumed = await agent.get(new URL(decision.body.resumeUrl).pathname).redirects(0);
  const redirected = new URL(resumed.headers.location, oauthIssuer());
  const exchanged = await request(app).post('/token').type('form').send({
    grant_type: 'authorization_code',
    code: redirected.searchParams.get('code'),
    redirect_uri: LOCAL_OAUTH_REDIRECT_URI,
    client_id: LOCAL_OAUTH_CLIENT_ID,
    code_verifier: verifier,
    resource: mcpResourceUrl(),
  });
  expect(exchanged.status).toBe(200);
  const accessToken = exchanged.body.access_token;
  const responseScope = exchanged.body.scope;
  delete exchanged.body.access_token;
  delete exchanged.body.refresh_token;
  delete exchanged.body.id_token;
  return { accessToken, consentScope: consent.body.scope, responseScope };
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

describe('initial MCP read scopes', () => {
  it('asks a new client for every read scope and offline_access, then shows only the read permissions', async () => {
    const challenged = await request(app)
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    expect(challenged.status).toBe(401);
    expect(challenged.headers['www-authenticate']).toContain('scope="' + INITIAL_SCOPE + '"');

    const metadata = await request(app).get('/.well-known/oauth-protected-resource/mcp');
    expect(metadata.body.scopes_supported).toEqual(RESOURCE_SCOPES);
    expect(metadata.body.scopes_supported).not.toContain(OFFLINE_ACCESS_SCOPE);

    const tenant = await makeTenant({ slug: 'all-reads' });
    const session = await adminSession(tenant);
    const issued = await issueOauth(tenant, session, INITIAL_SCOPE);
    expect(issued.consentScope).toBe(READ_SCOPE);
    expect(issued.consentScope.split(/\s+/)).not.toContain(OFFLINE_ACCESS_SCOPE);

    const claims = claimsOf(issued.accessToken);
    expect(claims.scope.split(/\s+/).sort()).toEqual([...RESOURCE_SCOPES].sort());
    expect(claims.scope.split(/\s+/)).not.toContain(OFFLINE_ACCESS_SCOPE);
    const binding = await OauthGrantBinding.findOne({ grantId: claims.grant_id }).lean();
    expect(binding.scopes).toEqual(RESOURCE_SCOPES);
    const grant = await getOidcProvider().Grant.find(claims.grant_id);
    expect(grant.getOIDCScope().split(/\s+/)).toContain(OFFLINE_ACCESS_SCOPE);
    expect(grant.getResourceScope(mcpResourceUrl()).split(/\s+/)).not.toContain(OFFLINE_ACCESS_SCOPE);

    const categories = await mcpCall(issued.accessToken, 'tools/call', {
      name: 'catalog_list_categories',
      arguments: {},
    });
    expect(categories.status).toBe(200);
    expect(rpcBody(categories).result?.isError).not.toBe(true);

    const wallets = await mcpCall(issued.accessToken, 'tools/call', {
      name: 'wallet_list_balances',
      arguments: {},
    });
    expect(wallets.status).toBe(200);
    expect(rpcBody(wallets).result?.isError).not.toBe(true);
  });

  it('keeps an existing catalog-only grant on catalog tools and off wallet tools', async () => {
    const tenant = await makeTenant({ slug: 'catalog-only' });
    const session = await adminSession(tenant);
    const issued = await issueOauth(tenant, session, 'catalog:read');
    expect(issued.consentScope).toBe('catalog:read');

    const claims = claimsOf(issued.accessToken);
    expect(claims.scope).toBe('catalog:read');
    const binding = await OauthGrantBinding.findOne({ grantId: claims.grant_id }).lean();
    expect(binding.scopes).toEqual(['catalog:read']);

    const categories = await mcpCall(issued.accessToken, 'tools/call', {
      name: 'catalog_list_categories',
      arguments: {},
    });
    expect(categories.status).toBe(200);
    expect(rpcBody(categories).result?.isError).not.toBe(true);

    const wallets = await mcpCall(issued.accessToken, 'tools/call', {
      name: 'wallet_list_balances',
      arguments: {},
    });
    expect(wallets.status).toBe(403);
    const challenge = (wallets.headers['www-authenticate'] || '') + ' ' + JSON.stringify(wallets.body);
    expect(challenge).toContain('insufficient_scope');
    expect(challenge).toContain('wallets:read');
  });

  it('loads the kit card for company admins and entity managers with either kit read scope', async () => {
    async function readCard(token) {
      return request(app)
        .post('/mcp')
        .set('Accept', 'application/json, text/event-stream')
        .set('Content-Type', 'application/json')
        .set('MCP-Protocol-Version', PROTOCOL)
        .set('Mcp-Method', 'resources/read')
        .set('Mcp-Name', KIT_CATALOG_CARD_URI)
        .set('Authorization', 'Bearer ' + token)
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'resources/read',
          params: {
            uri: KIT_CATALOG_CARD_URI,
            _meta: {
              'io.modelcontextprotocol/protocolVersion': PROTOCOL,
              'io.modelcontextprotocol/clientCapabilities': {},
            },
          },
        });
    }

    const fullTenant = await makeTenant({ slug: 'kit-card-full' });
    const full = await issueOauth(fullTenant, await adminSession(fullTenant), INITIAL_SCOPE);
    const listed = rpcBody(await mcpCall(full.accessToken, 'tools/list'));
    const kitTools = listed.result.tools.filter((tool) => tool.name.startsWith('kits_'));
    expect(kitTools.map((tool) => tool.name).sort()).toEqual(['kits_get', 'kits_get_curated', 'kits_list', 'kits_list_curated']);
    for (const tool of kitTools) {
      expect(tool._meta.ui.resourceUri).toBe(KIT_CATALOG_CARD_URI);
      expect(tool._meta['openai/outputTemplate']).toBe(KIT_CATALOG_CARD_URI);
    }
    const catalogSearch = listed.result.tools.find((tool) => tool.name === 'catalog_search');
    expect(catalogSearch._meta.ui.resourceUri).toBe(CATALOG_PRODUCT_CARD_URI);
    expect(catalogSearch._meta['openai/outputTemplate']).toBe(CATALOG_PRODUCT_CARD_URI);
    expect(CATALOG_PRODUCT_CARD_URI).not.toBe(KIT_CATALOG_CARD_URI);

    const campaignTenant = await makeTenant({ slug: 'kit-card-campaigns' });
    const campaigns = await issueOauth(campaignTenant, await adminSession(campaignTenant), 'campaigns:read');
    const campaignCard = await readCard(campaigns.accessToken);
    expect(campaignCard.status).toBe(200);
    expect(rpcBody(campaignCard).result.contents[0].uri).toBe(KIT_CATALOG_CARD_URI);

    const managerTenant = await makeTenant({ slug: 'kit-card-manager' });
    const managerEmail = 'manager-' + managerTenant.slug + '@test.io';
    await makeUser(managerTenant, 'entity_manager', 'tenant', { email: managerEmail, password: 'correct-horse-1' });
    const managerLogin = await request(app).post('/api/v1/auth/login').send({ email: managerEmail, password: 'correct-horse-1' });
    expect(managerLogin.status).toBe(200);
    const manager = await issueOauth(managerTenant, { token: managerLogin.body.accessToken }, 'catalog:read');
    const managerCard = await readCard(manager.accessToken);
    expect(managerCard.status).toBe(200);

    const walletTenant = await makeTenant({ slug: 'kit-card-wallet' });
    const wallets = await issueOauth(walletTenant, await adminSession(walletTenant), 'wallets:read');
    const denied = await readCard(wallets.accessToken);
    expect(denied.status).toBe(403);
    expect((denied.headers['www-authenticate'] || '') + JSON.stringify(denied.body)).toContain('insufficient_scope');
  });
});
