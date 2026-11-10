import { generateKeyPairSync } from 'node:crypto';
import { env } from '../../config/env.js';

/** Pre-registered public client for local PKCE tests. Absent in production. */
export const LOCAL_OAUTH_CLIENT_ID = 'shelfmerch-mcp-local';
export const LOCAL_OAUTH_REDIRECT_URI = 'http://127.0.0.1:6274/oauth/callback';

const DEV_COOKIE_SECRET = 'dev-only-oidc-cookie-secret-change-me';

/**
 * Issuer must be an origin. A path would move RFC 8414 discovery off the URL
 * MCP clients fetch from protected-resource metadata.
 */
export function assertOauthIssuer(value, nodeEnv) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('MCP_OAUTH_ISSUER must be an absolute URL');
  }
  if (url.username || url.password) {
    throw new Error('MCP_OAUTH_ISSUER must not include credentials');
  }
  if (url.search || url.hash) {
    throw new Error('MCP_OAUTH_ISSUER must not include a query or fragment');
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new Error('MCP_OAUTH_ISSUER must be an origin with no path');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('MCP_OAUTH_ISSUER must use http or https');
  }
  if (nodeEnv === 'production' && url.protocol !== 'https:') {
    throw new Error('MCP_OAUTH_ISSUER must use HTTPS in production');
  }
  return url.origin;
}

export function oauthIssuer() {
  const configured = env.MCP_OAUTH_ISSUER.trim().replace(/\/+$/, '');
  const value = configured || (env.NODE_ENV === 'production' ? '' : `http://127.0.0.1:${env.PORT}`);
  return assertOauthIssuer(value, env.NODE_ENV);
}

/** Canonical MCP resource. No trailing slash, no fragment. */
export function mcpResourceUrl() {
  return `${oauthIssuer()}/mcp`;
}

/**
 * ShelfMerch access JWTs remain valid on /mcp only outside production, and
 * only when this flag is set. Production ignores the flag.
 */
export function legacyMcpJwtAllowed() {
  if (env.NODE_ENV === 'production') return false;
  return env.MCP_ALLOW_LEGACY_JWT === 'true';
}

export function oidcCookieKeys() {
  const configured = env.MCP_OIDC_COOKIE_SECRET.trim();
  if (env.NODE_ENV === 'production') {
    if (configured.length < 32 || configured === DEV_COOKIE_SECRET) {
      throw new Error('MCP_OIDC_COOKIE_SECRET must be a unique secret of at least 32 characters in production');
    }
    return [configured];
  }
  return [configured.length >= 32 ? configured : DEV_COOKIE_SECRET];
}

function parsePrivateJwks(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('MCP_OIDC_JWKS must be JSON');
  }
  const keys = Array.isArray(parsed) ? parsed : parsed?.keys;
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new Error('MCP_OIDC_JWKS must contain at least one private key');
  }
  for (const key of keys) {
    if (!key || typeof key !== 'object' || typeof key.d !== 'string' || typeof key.kty !== 'string') {
      throw new Error('MCP_OIDC_JWKS keys must be private JWKs');
    }
  }
  return { keys };
}

let ephemeralJwks;

function generateEphemeralJwks() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = privateKey.export({ format: 'jwk' });
  jwk.kid = 'shelfmerch-mcp-dev';
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  return { keys: [jwk] };
}

/**
 * Production must load one private JWKS from the environment so all replicas
 * sign and verify the same tokens. Development and test may use a process-local
 * key. That key is not written to disk and is not used in production.
 */
export function oidcJwks() {
  const configured = env.MCP_OIDC_JWKS.trim();
  if (env.NODE_ENV === 'production') {
    if (!configured) {
      throw new Error('MCP_OIDC_JWKS must be set in production so every API replica uses the same MCP signing key');
    }
    return parsePrivateJwks(configured);
  }
  if (configured) return parsePrivateJwks(configured);
  ephemeralJwks ??= generateEphemeralJwks();
  return ephemeralJwks;
}

export function localOauthClients() {
  if (env.NODE_ENV === 'production') return [];
  return [
    {
      client_id: LOCAL_OAUTH_CLIENT_ID,
      client_name: 'ShelfMerch local MCP client',
      application_type: 'native',
      redirect_uris: [LOCAL_OAUTH_REDIRECT_URI],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    },
  ];
}
