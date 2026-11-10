import { ApiError } from '../../../utils/errors.js';
import { logger } from '../../../config/logger.js';
import {
  env,
  zohoIntegrationsClientPath,
  zohoPeopleConfigured,
} from '../../../config/env.js';
import { ZohoIntegration, ZOHO_PUBLIC_STATUSES } from './zohoIntegration.model.js';
import { resolveZohoIntegrationPublicStatus } from './zohoIntegrationStatus.service.js';
import { beginZohoConnect, completeZohoConnection } from './zohoOAuth.service.js';
import { consumeOAuthState } from './zohoOAuthState.service.js';
import { disconnectZoho } from './zohoToken.service.js';
import { syncZohoEmployees } from './zohoSync.service.js';
import { issueEmbedAuthCode, exchangeEmbedAuthCode, resolveEmbedSession } from './zohoEmbedAuth.service.js';
import {
  issueOAuthLaunchCode,
  exchangeOAuthLaunchCode,
  resolveOAuthLaunchSession,
  consumeOAuthLaunchSession,
  markOAuthLaunchCompleted,
  markOAuthLaunchFailed,
  getOAuthLaunchCompletionStatus,
  OAUTH_LAUNCH_SAFE_ERROR_CODES,
} from './zohoOAuthLaunch.service.js';
import { User } from '../../users/user.model.js';
import { RoleAssignment } from '../../roles/roleAssignment.model.js';
import { signAccessToken } from '../../auth/auth.service.js';
import {
  clearAuthBridgeCookie,
  clearOAuthStateCookie,
  readCookies,
  setAuthBridgeCookie,
  setEmbedSessionCookie,
  setOAuthStateCookie,
  setOAuthPopupCookie,
  clearOAuthPopupCookie,
  isOAuthPopupRequest,
  setOAuthLaunchSessionCookie,
  clearOAuthLaunchSessionCookie,
  ZOHO_AUTH_BRIDGE_COOKIE,
  ZOHO_EMBED_SESSION_COOKIE,
  ZOHO_OAUTH_LAUNCH_COOKIE,
  ZOHO_OAUTH_STATE_COOKIE,
} from './zohoCookies.js';

function clientRedirect(query) {
  const base = (env.BASE_URL || env.APP_URL || '').replace(/\/$/, '');
  const path = zohoIntegrationsClientPath();
  const qs = new URLSearchParams(query).toString();
  // Prefer absolute URL when BASE_URL/APP_URL is set; otherwise relative (same origin).
  const target = base ? `${base}${path}?${qs}` : `${path}?${qs}`;
  return target;
}

function embedPopupRedirect(query) {
  const base = (env.BASE_URL || env.APP_URL || '').replace(/\/$/, '');
  const qs = new URLSearchParams(query).toString();
  return base ? `${base}/zoho/people/oauth-done?${qs}` : `/zoho/people/oauth-done?${qs}`;
}

function integrationsWriteAllowed(user) {
  return user?.role === 'company_admin';
}

function publicStatus(doc) {
  return resolveZohoIntegrationPublicStatus(doc);
}

export async function getStatus(req, res) {
  const doc = await ZohoIntegration.findOne({ tenantId: req.tenantId });
  const status = publicStatus(doc);
  const canManage = integrationsWriteAllowed(req.user);
  if (!doc || status === ZOHO_PUBLIC_STATUSES.not_connected) {
    return res.json({
      configured: zohoPeopleConfigured(),
      status: ZOHO_PUBLIC_STATUSES.not_connected,
      integration: null,
      canManage,
    });
  }
  return res.json({
    configured: zohoPeopleConfigured(),
    status,
    integration: doc.toPublicJSON(),
    canManage,
  });
}

/**
 * Sets an HttpOnly cookie so the subsequent browser navigation to GET /connect
 * can authenticate without putting the JWT in the query string.
 * Accepts Bearer JWT or an existing embedded-session cookie (popup from iframe).
 */
export async function bridge(req, res) {
  const header = req.headers.authorization || '';
  let token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token && req.authSource === 'embed_session' && req.user?.userId) {
    const user = await User.findById(req.user.userId);
    if (!user) {
      throw new ApiError(401, 'Missing access token', 'UNAUTHORIZED');
    }
    const assignment = await RoleAssignment.findOne({
      userId: user._id,
      tenantId: req.tenantId,
    }).lean();
    if (!assignment) {
      throw new ApiError(401, 'Missing access token', 'UNAUTHORIZED');
    }
    token = signAccessToken(user, assignment);
  }

  if (!token) {
    throw new ApiError(401, 'Missing access token', 'UNAUTHORIZED');
  }
  setAuthBridgeCookie(res, token);
  return res.json({ ok: true });
}

export async function connect(req, res) {
  const embedPopup = req.query.popup === '1' || req.query.popup === 'true';
  const requestId =
    typeof req.query.requestId === 'string' && req.query.requestId.trim()
      ? req.query.requestId.trim()
      : '';

  if (req.authSource === 'oauth_launch_session') {
    const launchToken = extractOAuthLaunchSessionToken(req);
    await consumeOAuthLaunchSession(launchToken);
    clearOAuthLaunchSessionCookie(res);
  }

  const { url, state } = await beginZohoConnect({
    tenantId: req.tenantId,
    userId: req.user.userId,
    embedPopup,
    requestId: embedPopup ? requestId : '',
  });
  setOAuthStateCookie(res, state);
  if (embedPopup) setOAuthPopupCookie(res);
  clearAuthBridgeCookie(res);
  return res.redirect(302, url);
}

export async function callback(req, res) {
  const { code, state, error, location: zohoLocation } = req.query;
  const popupMode = isOAuthPopupRequest(req);

  clearOAuthStateCookie(res);

  const finish = (query) => {
    if (popupMode) clearOAuthPopupCookie(res);
    return res.redirect(302, popupMode ? embedPopupRedirect(query) : clientRedirect(query));
  };

  const markLaunchFailed = async (oauthRecord, errorCode) => {
    if (!popupMode || !oauthRecord?.requestId) return;
    await markOAuthLaunchFailed({
      requestId: oauthRecord.requestId,
      tenantId: oauthRecord.tenantId,
      userId: oauthRecord.userId,
      errorCode,
    });
  };

  const markLaunchCompleted = async (oauthRecord) => {
    if (!popupMode || !oauthRecord?.requestId) return;
    await markOAuthLaunchCompleted({
      requestId: oauthRecord.requestId,
      tenantId: oauthRecord.tenantId,
      userId: oauthRecord.userId,
    });
  };

  if (error) {
    return finish({ zoho: 'error', reason: 'denied' });
  }

  const cookies = readCookies(req);
  const cookieState = cookies[ZOHO_OAUTH_STATE_COOKIE];
  if (!state || !cookieState || cookieState !== state) {
    return finish({ zoho: 'error', reason: 'state' });
  }

  let oauthRecord;
  try {
    oauthRecord = await consumeOAuthState(state);
  } catch {
    return finish({ zoho: 'error', reason: 'state' });
  }

  if (!code || typeof code !== 'string') {
    await markLaunchFailed(oauthRecord, OAUTH_LAUNCH_SAFE_ERROR_CODES.OAUTH_CODE_MISSING);
    const doneQuery = { zoho: 'error', reason: 'code' };
    if (popupMode && oauthRecord.requestId) {
      doneQuery.requestId = oauthRecord.requestId;
    }
    return finish(doneQuery);
  }

  try {
    await completeZohoConnection({
      tenantId: oauthRecord.tenantId,
      userId: oauthRecord.userId,
      code,
      zohoLocation: typeof zohoLocation === 'string' ? zohoLocation : '',
    });
    await markLaunchCompleted(oauthRecord);
    const doneQuery = { zoho: 'connected' };
    if (popupMode && oauthRecord.requestId) {
      doneQuery.requestId = oauthRecord.requestId;
    }
    return finish(doneQuery);
  } catch {
    await markLaunchFailed(oauthRecord, OAUTH_LAUNCH_SAFE_ERROR_CODES.OAUTH_CONNECTION_FAILED);
    const doneQuery = { zoho: 'error' };
    if (popupMode && oauthRecord.requestId) {
      doneQuery.requestId = oauthRecord.requestId;
    }
    return finish(doneQuery);
  }
}

export async function issueEmbedAuth(req, res) {
  const requestId =
    typeof req.body?.requestId === 'string' && req.body.requestId.trim()
      ? req.body.requestId.trim()
      : '';
  const result = await issueEmbedAuthCode({
    tenantId: req.tenantId,
    userId: req.user.userId,
    requestId,
  });
  return res.json(result);
}

export async function issueOAuthLaunch(req, res) {
  const requestId =
    typeof req.body?.requestId === 'string' && req.body.requestId.trim()
      ? req.body.requestId.trim()
      : '';
  const result = await issueOAuthLaunchCode({
    tenantId: req.tenantId,
    userId: req.user.userId,
    requestId,
  });
  return res.json(result);
}

export async function exchangeOAuthLaunch(req, res) {
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  const requestId = typeof req.body?.requestId === 'string' ? req.body.requestId : '';
  const { sessionToken, expiresInSec } = await exchangeOAuthLaunchCode({ code, requestId });
  setOAuthLaunchSessionCookie(res, sessionToken, expiresInSec);
  return res.json({ ok: true });
}

export async function getOAuthLaunchStatus(req, res) {
  const requestId =
    typeof req.query?.requestId === 'string' && req.query.requestId.trim()
      ? req.query.requestId.trim()
      : '';
  const result = await getOAuthLaunchCompletionStatus({
    requestId,
    tenantId: req.tenantId,
  });
  return res.json(result);
}

export async function exchangeEmbedAuth(req, res) {
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  const requestId = typeof req.body?.requestId === 'string' ? req.body.requestId : '';
  const { sessionToken, expiresInSec } = await exchangeEmbedAuthCode({ code, requestId });
  setEmbedSessionCookie(res, sessionToken, expiresInSec);
  return res.json({ ok: true });
}

const EMBED_SAFE_EVENT_CODES = new Set(['EMBED_OPENER_MISSING']);

/** Log a whitelisted embed diagnostic code — never accepts secrets or PII. */
export async function reportEmbedEvent(req, res) {
  const event = typeof req.body?.event === 'string' ? req.body.event : '';
  const requestId = typeof req.body?.requestId === 'string' ? req.body.requestId : '';
  if (!EMBED_SAFE_EVENT_CODES.has(event)) {
    return res.status(400).json({ ok: false });
  }
  logger.warn({ event, requestId: requestId || undefined }, 'Zoho embed client event');
  return res.json({ ok: true });
}

export async function syncEmployees(req, res) {
  const summary = await syncZohoEmployees(req.tenantId);
  return res.json(summary);
}

export async function disconnect(req, res) {
  const doc = await disconnectZoho(req.tenantId);
  return res.json({
    ok: true,
    status: ZOHO_PUBLIC_STATUSES.not_connected,
    remoteAuthorization: doc?.remoteAuthorization || 'revoked',
  });
}

/** Authenticate using Bearer header, Zoho bridge cookie, or embedded-session cookie. */
export function extractZohoAccessToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  const cookies = readCookies(req);
  return cookies[ZOHO_AUTH_BRIDGE_COOKIE] || null;
}

export function extractEmbedSessionToken(req) {
  const cookies = readCookies(req);
  return cookies[ZOHO_EMBED_SESSION_COOKIE] || null;
}

export function extractOAuthLaunchSessionToken(req) {
  const cookies = readCookies(req);
  return cookies[ZOHO_OAUTH_LAUNCH_COOKIE] || null;
}

export async function resolveOAuthLaunchSessionUser(req) {
  const token = extractOAuthLaunchSessionToken(req);
  if (!token) return null;
  return resolveOAuthLaunchSession(token);
}

export async function resolveEmbedSessionUser(req) {
  const token = extractEmbedSessionToken(req);
  if (!token) return null;
  return resolveEmbedSession(token);
}
