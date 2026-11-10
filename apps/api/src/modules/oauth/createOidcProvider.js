import Provider, { errors } from 'oidc-provider';
import { env } from '../../config/env.js';
import { OidcMongoAdapter } from './oidcMongoAdapter.js';
import { findOauthAccount } from './oauthAccount.js';
import { shelfMerchInteractionPolicy } from './oauthInteraction.js';
import {
  localOauthClients,
  mcpResourceUrl,
  oauthIssuer,
  oidcCookieKeys,
  oidcJwks,
} from './oauth.config.js';
import { allowChatGptClient, allowChatGptMetadataFetch } from './chatgptClient.js';

const DAY = 24 * 60 * 60;

async function defaultResource(_ctx, _client, oneOf) {
  const canonical = mcpResourceUrl();
  if (Array.isArray(oneOf) && oneOf.length === 1 && oneOf[0] === canonical) return canonical;
  throw new errors.InvalidTarget('resource indicator is missing, or unknown');
}

async function getResourceServerInfo(_ctx, resourceIndicator) {
  const canonical = mcpResourceUrl();
  if (resourceIndicator !== canonical) {
    throw new errors.InvalidTarget('resource indicator is missing, or unknown');
  }
  return {
    scope: 'catalog:read orders:read campaigns:read wallets:read employees:read gifts:read entities:read employees:write campaigns:draft shops:write shops:catalog wallets:allocate wallets:setup campaigns:send campaigns:merchandise shops:publish entities:write',
    audience: canonical,
    accessTokenTTL: 15 * 60,
    accessTokenFormat: 'jwt',
    jwt: { sign: { alg: 'RS256' } },
  };
}

let provider;

export function getOidcProvider() {
  if (provider) return provider;

  const issuer = oauthIssuer();
  const secure = issuer.startsWith('https:');
  provider = new Provider(issuer, {
    adapter: OidcMongoAdapter,
    jwks: oidcJwks(),
    clients: localOauthClients(),
    cookies: {
      keys: oidcCookieKeys(),
      names: {
        session: 'sm_oauth_session',
        interaction: 'sm_oauth_interaction',
        resume: 'sm_oauth_resume',
      },
      long: { httpOnly: true, sameSite: 'lax', secure },
      short: { httpOnly: true, sameSite: 'lax', secure },
    },
    // Read scopes, then the optional write scopes, then offline_access.
    // Those write scopes are accepted only when a client requests them. It is not
    // part of the initial MCP challenge, and existing read grants are unchanged.
    // offline_access only asks for a refresh token. oidc-provider 9.13.3 also
    // adds openid in collectScopes.
    scopes: ['catalog:read', 'orders:read', 'campaigns:read', 'wallets:read', 'employees:read', 'gifts:read', 'entities:read', 'employees:write', 'campaigns:draft', 'shops:write', 'shops:catalog', 'wallets:allocate', 'wallets:setup', 'campaigns:send', 'campaigns:merchandise', 'shops:publish', 'entities:write', 'offline_access'],
    responseTypes: ['code'],
    clientAuthMethods: ['none', 'private_key_jwt'],
    pkce: {
      required() {
        return true;
      },
    },
    // ChatGPT keeps a refresh token when discovery advertises offline_access.
    // Clients that already omit it still receive one when their grant allows
    // refresh_token, so a catalog-only grant keeps working.
    issueRefreshToken(_ctx, client) {
      return client.grantTypeAllowed('refresh_token');
    },
    rotateRefreshToken(ctx) {
      const refreshToken = ctx.oidc.entities.RefreshToken;
      const client = ctx.oidc.entities.Client || ctx.oidc.client;
      if (!refreshToken) return true;
      if (refreshToken.totalLifetime() >= 365.25 * DAY) return false;
      // Public clients rotate on every use. ChatGPT uses private_key_jwt.
      // Rotating that client on every refresh consumes the token, and the
      // next in-flight refresh revokes the grant.
      if (client?.clientAuthMethod === 'none' && !refreshToken.isSenderConstrained()) return true;
      return refreshToken.ttlPercentagePassed() >= 70;
    },
    async expiresWithSession() {
      return false;
    },
    findAccount: findOauthAccount,
    ttl: {
      AccessToken: 15 * 60,
      AuthorizationCode: 60,
      RefreshToken: 30 * DAY,
      Grant: 30 * DAY,
      Session: 60 * 60,
      Interaction: 10 * 60,
      IdToken: 60 * 60,
      ClientCredentials: 10 * 60,
      DeviceCode: 10 * 60,
      BackchannelAuthenticationRequest: 10 * 60,
    },
    formats: {
      customizers: {
        async jwt(_ctx, token, structured) {
          if (token.grantId) structured.payload.grant_id = token.grantId;
        },
      },
    },
    interactions: {
      policy: shelfMerchInteractionPolicy(),
      url() {
        return '/oauth/consent';
      },
    },
    features: {
      clientIdMetadataDocument: {
        enabled: true,
        ack: 'draft-02',
        allowFetch: allowChatGptMetadataFetch,
        allowClient: allowChatGptClient,
      },
      devInteractions: { enabled: false },
      userinfo: { enabled: false },
      registration: { enabled: false },
      revocation: { enabled: true },
      rpInitiatedLogout: { enabled: false },
      resourceIndicators: {
        enabled: true,
        defaultResource,
        getResourceServerInfo,
        useGrantedResource() {
          return true;
        },
      },
    },
  });
  provider.proxy = env.TRUST_PROXY > 0;
  // The access token scope stays the resource read scopes. Echo offline_access
  // on the token response so a client that requested it can see it was granted.
  provider.use(async (ctx, next) => {
    await next();
    const body = ctx.body;
    if (!body || typeof body !== 'object' || typeof body.refresh_token !== 'string' || !body.refresh_token) return;
    const grant = ctx.oidc?.entities?.Grant;
    const oidcScope = typeof grant?.getOIDCScope === 'function' ? grant.getOIDCScope() : '';
    if (!oidcScope.split(/\s+/).includes('offline_access')) return;
    const current = typeof body.scope === 'string' ? body.scope.split(/\s+/).filter(Boolean) : [];
    if (current.includes('offline_access')) return;
    body.scope = [...current, 'offline_access'].join(' ');
  });
  return provider;
}
