import { errors, interactionPolicy } from 'oidc-provider';
import { requestedScopesAllowed } from './oauthScopes.js';

/**
 * oidc-provider 9.13.3 always advertises `openid` in scopes_supported because
 * the openid claim is built in. Removing it from discovery would not reject a
 * request. This check runs before a code is issued and is the enforcement.
 */
/**
 * oidc-provider drops offline_access unless the request includes prompt=consent.
 * ChatGPT asks for the scope and then shows our consent screen, without that prompt.
 * Put the scope back when this server will still require that consent. prompt=none
 * cannot receive it. The scope is not a data permission.
 */
function restoreOfflineAccess(ctx) {
  const current = String(ctx.oidc?.params?.scope || '');
  const requested = current.split(/\s+/).filter(Boolean);
  if (requested.includes('offline_access')) return;
  if (ctx.oidc?.prompts?.has('none')) return;
  const original = typeof ctx.query?.scope === 'string' ? ctx.query.scope : '';
  if (!original.split(/\s+/).includes('offline_access')) return;
  const responseType = String(ctx.oidc?.params?.response_type || '');
  if (responseType && !responseType.includes('code')) return;
  if (!ctx.oidc?.client?.grantTypeAllowed?.('refresh_token')) return;
  ctx.oidc.params.scope = [...requested, 'offline_access'].join(' ');
}

function rejectUnsupportedOauthScope(ctx) {
  restoreOfflineAccess(ctx);
  if (!requestedScopesAllowed(ctx.oidc?.params?.scope)) {
    throw new errors.InvalidScope('Only the read scopes can be requested. offline_access may accompany them and does not grant data access');
  }
  return false;
}

export function shelfMerchInteractionPolicy() {
  const policy = interactionPolicy.base();
  const login = policy.get('login');
  login.checks.add(
    new interactionPolicy.Check(
      'catalog_read_only',
      'Only the read scopes can be requested. offline_access may accompany them and does not grant data access',
      rejectUnsupportedOauthScope,
    ),
    0,
  );
  return policy;
}
