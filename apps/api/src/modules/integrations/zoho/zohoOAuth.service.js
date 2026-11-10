import {
  env,
  zohoAccountsUrl,
  zohoPeopleConfigured,
  zohoRedirectUri,
} from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import { ApiError } from '../../../utils/errors.js';
import { encryptToken } from '../../../utils/tokenEncryption.js';
import { ZohoIntegration } from './zohoIntegration.model.js';
import { generateOAuthState, storeOAuthState } from './zohoOAuthState.service.js';
import { fetchZohoOrganization, formatZohoOrgLastError } from './zohoPeople.service.js';
import { normalizeZohoLocation } from './zohoPeopleBaseUrl.js';

const ZOHO_SCOPES = 'ZOHOPEOPLE.forms.READ,ZOHOPEOPLE.organization.READ';

export function assertZohoConfigured() {
  if (!zohoPeopleConfigured()) {
    throw new ApiError(503, 'Zoho People integration is not configured', 'ZOHO_NOT_CONFIGURED');
  }
}

/**
 * Build Zoho India Accounts authorization URL and persist OAuth state server-side.
 * Does not expose client secret. Returns { url, state } for the controller to set cookies.
 */
export async function beginZohoConnect({ tenantId, userId, embedPopup = false, requestId = '' }) {
  assertZohoConfigured();
  const redirectUri = zohoRedirectUri();
  if (env.NODE_ENV === 'development') {
    logger.info(`Zoho OAuth redirect URI: ${redirectUri}`);
  }

  const state = generateOAuthState();
  await storeOAuthState(state, {
    tenantId,
    userId,
    embedPopup,
    requestId: typeof requestId === 'string' ? requestId : '',
  });

  const params = new URLSearchParams({
    scope: ZOHO_SCOPES,
    client_id: env.ZOHO_CLIENT_ID,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    redirect_uri: redirectUri,
    state,
  });

  return {
    state,
    url: `${zohoAccountsUrl()}/oauth/v2/auth?${params.toString()}`,
  };
}

/**
 * Exchange authorization code for tokens. Never log tokens or the code.
 * Uses the identical redirect_uri string as the authorization request.
 */
export async function exchangeAuthorizationCode(code) {
  assertZohoConfigured();
  const redirectUri = zohoRedirectUri();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: env.ZOHO_CLIENT_ID,
    client_secret: env.ZOHO_CLIENT_SECRET,
    redirect_uri: redirectUri,
    code,
  });

  const res = await fetch(`${zohoAccountsUrl()}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    throw new ApiError(401, 'Zoho authorization failed — try connecting again', 'ZOHO_TOKEN_EXCHANGE_FAILED');
  }

  const data = await res.json();
  if (!data.access_token || !data.refresh_token) {
    throw new ApiError(401, 'Zoho did not return the required tokens', 'ZOHO_TOKEN_INCOMPLETE');
  }

  const expiresInSec = Number(data.expires_in) || 3600;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    apiDomain: String(data.api_domain || '').replace(/\/$/, ''),
    expiresAt: new Date(Date.now() + expiresInSec * 1000),
  };
}

/**
 * Persist connection, verify org API, return public integration snapshot.
 */
export async function completeZohoConnection({
  tenantId,
  userId,
  code,
  zohoLocation = '',
}) {
  const tokens = await exchangeAuthorizationCode(code);
  // api_domain is kept for debugging / DC inference only — People calls use people.*.zoho.*
  const location = normalizeZohoLocation(zohoLocation) || 'in';

  let org = { id: '', name: '', needsAttention: false };
  let orgVerified = false;
  let orgFailure = 'Could not verify Zoho organisation';
  try {
    org = await fetchZohoOrganization({
      location,
      apiDomain: tokens.apiDomain,
      accessToken: tokens.accessToken,
    });
    orgVerified = true;
  } catch (error) {
    orgVerified = false;
    orgFailure = formatZohoOrgLastError(error?.details);
  }

  const encryptedAccessToken = encryptToken(tokens.accessToken);
  const encryptedRefreshToken = encryptToken(tokens.refreshToken);
  const connectedAt = new Date();
  const status = orgVerified ? 'connected' : 'error';

  const doc = await ZohoIntegration.findOneAndUpdate(
    { tenantId },
    {
      $set: {
        tenantId,
        connectedByUserId: userId,
        zohoOrganizationId: org.id || '',
        zohoOrganizationName: org.name || '',
        encryptedAccessToken,
        encryptedRefreshToken,
        accessTokenExpiresAt: tokens.expiresAt,
        apiDomain: tokens.apiDomain || '',
        zohoLocation: location,
        status,
        connectedAt,
        remoteAuthorization: '',
        lastError: status === 'error' ? orgFailure : '',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  if (!orgVerified) {
    throw new ApiError(502, 'Connected to Zoho but organisation verification failed', 'ZOHO_ORG_VERIFY_FAILED');
  }

  return doc;
}
