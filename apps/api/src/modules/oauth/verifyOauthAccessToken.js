import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';
import { ApiError, UnauthorizedError } from '../../utils/errors.js';
import { User } from '../users/user.model.js';
import { Tenant } from '../tenants/tenant.model.js';
import { RoleAssignment } from '../roles/roleAssignment.model.js';
import { getOidcProvider } from './createOidcProvider.js';
import { mcpResourceUrl, oauthIssuer, oidcJwks } from './oauth.config.js';
import { OAUTH_GRANT_ROLES, OauthGrantBinding } from './oauthGrantBinding.model.js';
import { grantScopesAllowed, requestedResourceScopes, requestedScopesAllowed } from './oauthScopes.js';

const GENERIC_TOKEN = 'Invalid or expired access token';

let keySet;

function oauthKeySet() {
  if (!keySet) {
    const keys = oidcJwks().keys.map((jwk) => {
      const pub = { ...jwk };
      for (const field of ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k']) delete pub[field];
      return pub;
    });
    keySet = createLocalJWKSet({ keys });
  }
  return keySet;
}

function readHeader(token) {
  if (typeof token !== 'string' || token.split('.').length !== 3) return null;
  try {
    return decodeProtectedHeader(token);
  } catch {
    return null;
  }
}

function insufficientScope() {
  return new ApiError(403, 'This token does not include a permitted read scope', 'INSUFFICIENT_SCOPE');
}

function invalidToken() {
  return new UnauthorizedError(GENERIC_TOKEN);
}

function requireGrantedReadScopes(scope, bindingScopes) {
  if (!requestedScopesAllowed(scope)) throw insufficientScope();
  if (!grantScopesAllowed(bindingScopes)) throw insufficientScope();
  const requested = requestedResourceScopes(scope);
  if (!requested.every((item) => bindingScopes.includes(item))) throw insufficientScope();
  return requested;
}

async function loadAuthorizedGrant({ grantId, accountId, clientId, scope }) {
  if (!grantId || !accountId || !clientId) throw invalidToken();
  const provider = getOidcProvider();
  const grant = await provider.Grant.find(grantId);
  if (!grant || grant.isExpired) throw invalidToken();
  if (grant.accountId !== String(accountId) || grant.clientId !== clientId) throw invalidToken();

  let client;
  try {
    client = await provider.Client.find(clientId);
  } catch {
    client = null;
  }
  if (!client || client.clientId !== clientId) throw invalidToken();

  const binding = await OauthGrantBinding.findOne({ grantId }).lean();
  if (!binding) throw invalidToken();
  if (String(binding.userId) !== String(accountId)) throw invalidToken();
  if (binding.clientId !== clientId) throw invalidToken();
  if (binding.resource !== mcpResourceUrl()) throw invalidToken();
  const tokenScopes = requireGrantedReadScopes(scope, binding.scopes);
  if (typeof grant.getResourceScope === 'function') {
    const granted = grant.getResourceScope(mcpResourceUrl()).split(/\s+/).filter(Boolean);
    if (!tokenScopes.every((item) => granted.includes(item))) throw insufficientScope();
  }

  const user = await User.findById(accountId).select('status sessionVersion').lean();
  if (!user || user.status !== 'active') throw invalidToken();
  if ((user.sessionVersion ?? 0) !== binding.sessionVersion) throw invalidToken();

  const tenant = await Tenant.findById(binding.tenantId).select('status').lean();
  if (!tenant || !['active', 'trial'].includes(tenant.status)) throw invalidToken();

  const assignment = await RoleAssignment.findOne({
    userId: user._id,
    tenantId: binding.tenantId,
    role: { $in: OAUTH_GRANT_ROLES },
  }).lean();
  if (!assignment) throw insufficientScope();

  return {
    clientId,
    scopes: tokenScopes,
    user: {
      userId: String(user._id),
      tenantId: String(binding.tenantId),
      role: assignment.role,
      scopeType: assignment.scopeType,
      scopeId: assignment.scopeId ? String(assignment.scopeId) : null,
      assignedEntityIds: (assignment.assignedEntityIds ?? []).map(String),
    },
  };
}

/**
 * Verify a ShelfMerch MCP access token.
 * JWT access tokens are the format this provider issues: they are signed, not stored.
 * Opaque tokens are accepted only when the provider can resolve them from the grant store.
 * Returns null when the credential is not an MCP access token.
 */
export async function verifyOauthAccessToken(token) {
  const header = readHeader(token);
  if (!header) return verifyOpaque(token);
  if (header.alg === 'HS256') return null;
  if (header.alg !== 'RS256' || header.typ !== 'at+jwt' || typeof header.kid !== 'string' || !header.kid) {
    throw invalidToken();
  }

  let payload;
  try {
    const verified = await jwtVerify(token, oauthKeySet(), {
      algorithms: ['RS256'],
      issuer: oauthIssuer(),
      audience: mcpResourceUrl(),
      clockTolerance: 0,
    });
    payload = verified.payload;
  } catch {
    throw invalidToken();
  }

  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (audiences.length !== 1 || audiences[0] !== mcpResourceUrl()) throw invalidToken();
  if (payload.iss !== oauthIssuer()) throw invalidToken();
  return loadAuthorizedGrant({
    grantId: payload.grant_id,
    accountId: payload.sub,
    clientId: payload.client_id,
    scope: payload.scope,
  });
}

async function verifyOpaque(token) {
  if (typeof token !== 'string' || token.length < 20) return null;
  const accessToken = await getOidcProvider().AccessToken.find(token);
  if (!accessToken) return null;
  const audiences = Array.isArray(accessToken.aud) ? accessToken.aud : [accessToken.aud];
  if (!audiences.includes(mcpResourceUrl()) || audiences.some((aud) => aud !== mcpResourceUrl())) {
    throw invalidToken();
  }
  return loadAuthorizedGrant({
    grantId: accessToken.grantId,
    accountId: accessToken.accountId,
    clientId: accessToken.clientId,
    scope: accessToken.scope,
  });
}
