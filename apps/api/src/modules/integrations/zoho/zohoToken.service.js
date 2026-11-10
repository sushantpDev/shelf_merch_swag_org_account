import { env, zohoAccountsUrl, zohoPeopleConfigured } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import { ApiError } from '../../../utils/errors.js';
import { decryptToken, encryptToken } from '../../../utils/tokenEncryption.js';
import { revokeEmbedSessionsForUser } from './zohoEmbedAuth.service.js';
import { ZohoIntegration } from './zohoIntegration.model.js';

const EXPIRY_SKEW_MS = 60_000;

function assertConfigured() {
  if (!zohoPeopleConfigured()) {
    throw new ApiError(503, 'Zoho People integration is not configured', 'ZOHO_NOT_CONFIGURED');
  }
}

/**
 * Refresh Zoho access token. Never returns tokens to the caller beyond this service layer
 * (callers use getValidAccessToken which keeps plaintext in-process only).
 */
async function refreshAccessToken(integration) {
  assertConfigured();
  const refreshToken = decryptToken(integration.encryptedRefreshToken);
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: env.ZOHO_CLIENT_ID,
    client_secret: env.ZOHO_CLIENT_SECRET,
    grant_type: 'refresh_token',
  });

  const res = await fetch(`${zohoAccountsUrl()}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    integration.status = 'expired';
    integration.lastError = 'Token refresh failed';
    await integration.save();
    throw new ApiError(401, 'Zoho connection expired — reconnect Zoho People', 'ZOHO_CONNECTION_EXPIRED');
  }

  const data = await res.json();
  if (!data.access_token) {
    integration.status = 'expired';
    integration.lastError = 'Token refresh returned no access token';
    await integration.save();
    throw new ApiError(401, 'Zoho connection expired — reconnect Zoho People', 'ZOHO_CONNECTION_EXPIRED');
  }

  const expiresInSec = Number(data.expires_in) || 3600;
  integration.encryptedAccessToken = encryptToken(data.access_token);
  if (typeof data.refresh_token === 'string' && data.refresh_token) {
    integration.encryptedRefreshToken = encryptToken(data.refresh_token);
  }
  integration.accessTokenExpiresAt = new Date(Date.now() + expiresInSec * 1000);
  if (data.api_domain) {
    integration.apiDomain = String(data.api_domain).replace(/\/$/, '');
  }
  if (integration.status === 'expired' || integration.status === 'error') {
    integration.status = 'connected';
    integration.lastError = '';
  }
  await integration.save();
  return data.access_token;
}

/**
 * Load the tenant's Zoho integration and return a valid (possibly refreshed) access token.
 * Plaintext token stays in memory for the request only — never sent to the frontend.
 */
export async function getValidAccessToken(tenantId) {
  const integration = await ZohoIntegration.findOne({ tenantId });
  if (!integration || integration.status === 'disconnected') {
    throw new ApiError(404, 'Zoho People is not connected', 'ZOHO_NOT_CONNECTED');
  }
  if (!integration.encryptedAccessToken || !integration.encryptedRefreshToken) {
    throw new ApiError(401, 'Zoho connection expired — reconnect Zoho People', 'ZOHO_CONNECTION_EXPIRED');
  }

  const expiresAt = integration.accessTokenExpiresAt
    ? new Date(integration.accessTokenExpiresAt).getTime()
    : 0;
  const expired = !expiresAt || expiresAt <= Date.now() + EXPIRY_SKEW_MS;

  let accessToken;
  if (expired) {
    accessToken = await refreshAccessToken(integration);
  } else {
    try {
      accessToken = decryptToken(integration.encryptedAccessToken);
    } catch {
      accessToken = await refreshAccessToken(integration);
    }
  }

  return { accessToken, integration };
}

const CONFIRMED_INVALID_TOKEN = new Set([
  'invalid_token',
  'invalid_grant',
  'invalid_code',
  'expired_token',
]);

const CLIENT_REQUEST_FAILURES = new Set([
  'invalid_client',
  'unauthorized_client',
  'invalid_request',
  'unsupported_token_type',
  'invalid_token_type',
]);

function zohoErrorCode(body) {
  if (!body || typeof body !== 'object') return '';
  const raw = body.error || body.code || body.error_code || '';
  return String(raw).trim().toLowerCase().slice(0, 64);
}

async function readRevokeBody(res) {
  try {
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Classify a Zoho revoke response.
 * Official contract (POST /oauth/v2/revoke/token): 200 revokes the token.
 * HTTP 400 covers an invalid token, a token_type mismatch, or a token that
 * does not belong to this client. Only a parsed invalid-token code is treated
 * as already revoked. A bare 400 is unresolved.
 */
export function classifyZohoRevokeResponse(status, body) {
  const errorCode = zohoErrorCode(body);
  if (status >= 200 && status < 300) {
    if (body && errorCode && body.status && body.status !== 'success') {
      return { revoked: false, reason: 'unexpected', errorCode };
    }
    return { revoked: true, reason: 'revoked', errorCode: errorCode || null };
  }
  if (status === 401 || status === 403) {
    return { revoked: false, reason: 'client_auth_failed', errorCode: errorCode || null };
  }
  if (status === 400) {
    if (CONFIRMED_INVALID_TOKEN.has(errorCode)) {
      return { revoked: true, reason: 'already_invalid', errorCode };
    }
    if (CLIENT_REQUEST_FAILURES.has(errorCode)) {
      return { revoked: false, reason: errorCode, errorCode };
    }
    return { revoked: false, reason: 'unconfirmed_client_response', errorCode: errorCode || null };
  }
  return { revoked: false, reason: 'unexpected', errorCode: errorCode || null };
}

/**
 * Revoke a refresh token at the Accounts server for this registered client.
 * POST {accounts}/oauth/v2/revoke/token
 * Authorization: Basic base64(client_id:client_secret)
 * Body: token, token_type=refresh_token
 * The token is never logged and is not placed in the URL.
 */
export async function revokeZohoRefreshToken(refreshToken) {
  assertConfigured();
  const endpoint = `${zohoAccountsUrl()}/oauth/v2/revoke/token`;
  const credentials = Buffer.from(`${env.ZOHO_CLIENT_ID}:${env.ZOHO_CLIENT_SECRET}`).toString('base64');
  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        token: refreshToken,
        token_type: 'refresh_token',
      }),
    });
  } catch {
    logger.warn(
      { event: 'zoho_token_revoke', outcome: 'network_error' },
      'Zoho refresh token revoke failed',
    );
    return { revoked: false, reason: 'network_error', errorCode: null };
  }

  const body = await readRevokeBody(res);
  const result = classifyZohoRevokeResponse(res.status, body);
  const log = result.revoked ? logger.info.bind(logger) : logger.warn.bind(logger);
  log(
    {
      event: 'zoho_token_revoke',
      outcome: result.reason,
      httpStatus: res.status,
      errorCode: result.errorCode,
    },
    'Zoho refresh token revoke finished',
  );
  return result;
}

/**
 * Stop local use immediately. Delete the refresh-token ciphertext only when
 * Zoho confirms revocation or reports that token invalid.
 * If revocation is unresolved, keep the ciphertext, mark remoteAuthorization
 * unresolved, and refuse API use via status=disconnected. Retry with
 * retryUnresolvedZohoRevocation. Plaintext is never stored.
 * Imported contacts and other integrations are unchanged.
 */
export async function disconnectZoho(tenantId) {
  const integration = await ZohoIntegration.findOne({ tenantId });
  if (!integration) return null;
  if (integration.status === 'disconnected' && integration.remoteAuthorization !== 'unresolved') {
    return integration;
  }

  let revokeResult = { revoked: true, reason: 'nothing_to_revoke', errorCode: null };
  if (integration.encryptedRefreshToken) {
    try {
      const refreshToken = decryptToken(integration.encryptedRefreshToken);
      revokeResult = await revokeZohoRefreshToken(refreshToken);
    } catch {
      logger.warn(
        { event: 'zoho_token_revoke', outcome: 'decrypt_failed' },
        'Could not decrypt Zoho refresh token before revoke',
      );
      revokeResult = { revoked: false, reason: 'decrypt_failed', errorCode: null };
    }
  }

  const connectedByUserId = integration.connectedByUserId
    ? String(integration.connectedByUserId)
    : '';

  integration.encryptedAccessToken = '';
  integration.accessTokenExpiresAt = null;
  integration.status = 'disconnected';
  if (revokeResult.revoked) {
    integration.encryptedRefreshToken = '';
    integration.remoteAuthorization = 'revoked';
    integration.lastError = '';
  } else {
    integration.remoteAuthorization = 'unresolved';
    integration.lastError = `ZOHO_REVOKE_${revokeResult.reason}`.slice(0, 120);
  }
  await integration.save();

  if (connectedByUserId) {
    try {
      await revokeEmbedSessionsForUser({ tenantId, userId: connectedByUserId });
    } catch {
      logger.warn(
        { event: 'zoho_embed_revoke', outcome: 'failed' },
        'Zoho embed session revoke failed during disconnect',
      );
    }
  }

  return integration;
}

/** Retry a stored unresolved grant. Decrypts only in memory. */
export async function retryUnresolvedZohoRevocation(tenantId) {
  const integration = await ZohoIntegration.findOne({
    tenantId,
    remoteAuthorization: 'unresolved',
  });
  if (!integration?.encryptedRefreshToken) {
    return { revoked: false, reason: 'nothing_pending' };
  }
  let result;
  try {
    result = await revokeZohoRefreshToken(decryptToken(integration.encryptedRefreshToken));
  } catch {
    return { revoked: false, reason: 'decrypt_failed' };
  }
  if (result.revoked) {
    integration.encryptedRefreshToken = '';
    integration.remoteAuthorization = 'revoked';
    integration.lastError = '';
  } else {
    integration.lastError = `ZOHO_REVOKE_${result.reason}`.slice(0, 120);
  }
  await integration.save();
  return { revoked: result.revoked, reason: result.reason };
}
