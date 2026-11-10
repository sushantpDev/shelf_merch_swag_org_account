import { authenticate } from '../../middleware/auth.middleware.js';
import { globalHttpRateLimit } from '../../middleware/globalRateLimit.middleware.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { getOidcProvider } from './createOidcProvider.js';
import { legacyMcpJwtAllowed, mcpResourceUrl, oauthIssuer } from './oauth.config.js';
import { OFFLINE_ACCESS_SCOPE, RESOURCE_SCOPES } from './oauthScopes.js';
import { verifyOauthAccessToken } from './verifyOauthAccessToken.js';

/** Scopes a new MCP client should request. offline_access is not a data permission. */
const MCP_INITIAL_SCOPE = [...RESOURCE_SCOPES, OFFLINE_ACCESS_SCOPE].join(' ');

const OIDC_PATHS = new Set([
  '/.well-known/oauth-authorization-server',
  '/.well-known/openid-configuration',
  '/auth',
  '/token',
  '/jwks',
  '/token/revocation',
  '/session/end',
  '/session/end/confirm',
  '/session/end/success',
]);

export function isOidcProviderPath(path) {
  if (OIDC_PATHS.has(path)) return true;
  return path.startsWith('/auth/');
}

export function mcpWwwAuthenticate(error) {
  const metadata = `${oauthIssuer()}/.well-known/oauth-protected-resource/mcp`;
  const parts = [
    'Bearer realm="shelfmerch"',
    `resource_metadata="${metadata}"`,
    `scope="${MCP_INITIAL_SCOPE}"`,
  ];
  if (error) parts.push(`error="${error}"`);
  return parts.join(', ');
}

export function sendProtectedResourceMetadata(_req, res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'no-store');
  res.json({
    resource: mcpResourceUrl(),
    authorization_servers: [oauthIssuer()],
    scopes_supported: ['catalog:read', 'orders:read', 'campaigns:read', 'wallets:read', 'employees:read', 'gifts:read'],
    bearer_methods_supported: ['header'],
    resource_name: 'ShelfMerch catalog',
  });
}

/**
 * Forwards only the authorization server's own paths. The provider callback
 * does not call Express next(), so it must not see the rest of the app.
 */
function pinIssuerHeaders(req) {
  const issuer = new URL(oauthIssuer());
  req.headers.host = issuer.host;
  req.headers['x-forwarded-host'] = issuer.host;
  req.headers['x-forwarded-proto'] = issuer.protocol === 'https:' ? 'https' : 'http';
}

export function oidcMiddleware(req, res, next) {
  if (!isOidcProviderPath(req.path)) return next();
  return globalHttpRateLimit(req, res, (err) => {
    if (err) return next(err);
    // Discovery URLs follow the request host. Pin them to the configured issuer
    // so a forwarded Host header cannot advertise another authorization server.
    pinIssuerHeaders(req);
    return getOidcProvider().callback()(req, res);
  });
}

/**
 * /mcp challenge. Development may still accept a ShelfMerch access JWT when
 * MCP_ALLOW_LEGACY_JWT=true. Production never does. OAuth access tokens are
 * not accepted until consent binds them to a user and workspace.
 */
function setMcpChallenge(res, error) {
  try {
    res.set('WWW-Authenticate', mcpWwwAuthenticate(error));
  } catch {
    res.set('WWW-Authenticate', `Bearer realm="shelfmerch", scope="${MCP_INITIAL_SCOPE}"`);
  }
}
export function mcpAuthenticate(req, res, next) {
  const header = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  const hasBearer = /^Bearer\s+\S+/.test(header);
  const token = hasBearer ? header.replace(/^Bearer\s+/, '') : '';
  if (!token) {
    setMcpChallenge(res);
    return next(new UnauthorizedError('Missing access token'));
  }
  return verifyOauthAccessToken(token).then((oauth) => {
    if (oauth) {
      req.user = oauth.user;
      req.impersonation = { isImpersonating: false, originalUserId: null };
      req.oauthAccess = { clientId: oauth.clientId, scopes: oauth.scopes };
      return next();
    }
    if (!legacyMcpJwtAllowed()) {
      setMcpChallenge(res, 'invalid_token');
      return next(new UnauthorizedError('ShelfMerch application tokens are not accepted on this resource'));
    }
    return authenticate(req, res, (err) => {
      if (err?.status === 401) setMcpChallenge(res, 'invalid_token');
      next(err);
    });
  }).catch((err) => {
    if (err?.status === 401) setMcpChallenge(res, 'invalid_token');
    if (err?.status === 403 && err.code === 'INSUFFICIENT_SCOPE') setMcpChallenge(res, 'insufficient_scope');
    next(err);
  });
}
