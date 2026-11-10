import mongoose from 'mongoose';
import { User } from '../users/user.model.js';
import { Tenant } from '../tenants/tenant.model.js';
import { RoleAssignment } from '../roles/roleAssignment.model.js';
import { ApiError, ConflictError, UnauthorizedError } from '../../utils/errors.js';
import { getOidcProvider } from './createOidcProvider.js';
import { mcpResourceUrl, oauthIssuer } from './oauth.config.js';
import {
  OFFLINE_ACCESS_SCOPE,
  PROTOCOL_SCOPE,
  requestedResourceScopes,
  requestedScopesAllowed,
  scopeList,
} from './oauthScopes.js';
import {
  OAUTH_GRANT_ROLES,
  OauthConsentSubmission,
  OauthGrantBinding,
} from './oauthGrantBinding.model.js';

const ACTIVE_TENANT = ['active', 'trial'];

let indexesReady;
function ensureGrantIndexes() {
  indexesReady ??= Promise.all([OauthGrantBinding.init(), OauthConsentSubmission.init()]);
  return indexesReady;
}

function interactionError(err) {
  if (err?.name === 'SessionNotFound') {
    throw new UnauthorizedError(
      'The authorization request expired. Start again from the application.',
      'INTERACTION_EXPIRED',
    );
  }
  throw err;
}

async function loadInteraction(req, res) {
  try {
    return await getOidcProvider().interactionDetails(req, res);
  } catch (err) {
    interactionError(err);
  }
}

async function accountFor(userId) {
  const user = await User.findById(userId).select('name email status sessionVersion').lean();
  if (!user || user.status !== 'active') {
    throw new UnauthorizedError('Your session expired. Please sign in again.', 'SESSION_EXPIRED');
  }
  return user;
}

async function eligibleWorkspaces(userId) {
  const assignments = await RoleAssignment.find({
    userId,
    role: { $in: OAUTH_GRANT_ROLES },
    tenantId: { $ne: null },
  })
    .select('tenantId')
    .lean();
  const tenantIds = [...new Set(assignments.map((row) => String(row.tenantId)))];
  if (!tenantIds.length) return [];
  const tenants = await Tenant.find({
    _id: { $in: tenantIds },
    status: { $in: ACTIVE_TENANT },
  })
    .select('name')
    .lean();
  return tenants
    .map((tenant) => ({ id: String(tenant._id), name: tenant.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function assertInteractionRequest(interaction) {
  const params = interaction?.params || {};
  if (!requestedScopesAllowed(params.scope)) {
    throw new ApiError(400, 'Only the read scopes can be requested. offline_access may accompany them and does not grant data access', 'INVALID_SCOPE');
  }
  const resource = Array.isArray(params.resource) ? params.resource[0] : params.resource;
  if (resource !== mcpResourceUrl() || (Array.isArray(params.resource) && params.resource.length !== 1)) {
    throw new ApiError(400, 'This application asked for an unknown resource', 'INVALID_RESOURCE');
  }
  if (!params.client_id || !params.redirect_uri) {
    throw new ApiError(400, 'This authorization request is incomplete', 'INVALID_REQUEST');
  }
  return params;
}

function resumeUrlOnIssuer(returnTo) {
  const issuer = new URL(oauthIssuer());
  const resume = new URL(returnTo, issuer);
  if (resume.origin !== issuer.origin || !resume.pathname.startsWith('/auth/')) {
    throw new ApiError(500, 'Authorization could not be resumed', 'OAUTH_RESUME');
  }
  return resume.toString();
}

async function claimSubmission(interactionId) {
  try {
    await OauthConsentSubmission.create({ interactionId });
  } catch (err) {
    if (err?.code === 11000) {
      throw new ConflictError('This authorization request was already submitted');
    }
    throw err;
  }
}

export async function readConsent(req, res) {
  if (req.impersonation?.isImpersonating) {
    throw new ApiError(403, 'An impersonated session cannot approve application access', 'IMPERSONATION_FORBIDDEN');
  }
  const interaction = await loadInteraction(req, res);
  const params = assertInteractionRequest(interaction);
  const user = await accountFor(req.user.userId);
  const provider = getOidcProvider();
  const client = await provider.Client.find(params.client_id);
  return {
    client: { name: client.clientName || client.client_name || client.clientId },
    account: { name: user.name, email: user.email },
    workspaces: await eligibleWorkspaces(user._id),
    scope: requestedResourceScopes(params.scope).join(' '),
  };
}

export async function submitDecision(req, res) {
  if (req.impersonation?.isImpersonating) {
    throw new ApiError(403, 'An impersonated session cannot approve application access', 'IMPERSONATION_FORBIDDEN');
  }
  const decision = req.body?.decision;
  if (decision !== 'allow' && decision !== 'deny') {
    throw new ApiError(400, 'Choose allow or deny', 'INVALID_DECISION');
  }

  const interaction = await loadInteraction(req, res);
  const params = assertInteractionRequest(interaction);
  const user = await accountFor(req.user.userId);
  const interactionId = interaction.uid || interaction.jti;
  await ensureGrantIndexes();
  await claimSubmission(interactionId);

  const provider = getOidcProvider();
  let grantId;
  let grant;
  try {
    if (decision === 'deny') {
      const returnTo = await provider.interactionResult(
        req,
        res,
        { error: 'access_denied', error_description: 'The user denied the request' },
        { mergeWithLastSubmission: false },
      );
      return { resumeUrl: resumeUrlOnIssuer(returnTo) };
    }

    const tenantId = String(req.body?.tenantId || '');
    if (!mongoose.isValidObjectId(tenantId)) {
      throw new ApiError(400, 'Choose a workspace', 'WORKSPACE_REQUIRED');
    }
    const workspaces = await eligibleWorkspaces(user._id);
    if (!workspaces.some((workspace) => workspace.id === tenantId)) {
      throw new ApiError(403, 'You cannot grant this workspace', 'WORKSPACE_NOT_ELIGIBLE');
    }

    const client = await provider.Client.find(params.client_id);
    const resourceScopes = requestedResourceScopes(params.scope);
    grant = new provider.Grant({
      accountId: String(user._id),
      clientId: client.clientId,
    });
    const requested = scopeList(params.scope);
    for (const scope of resourceScopes) grant.addOIDCScope(scope);
    if (requested.includes(PROTOCOL_SCOPE)) grant.addOIDCScope(PROTOCOL_SCOPE);
    if (requested.includes(OFFLINE_ACCESS_SCOPE)) grant.addOIDCScope(OFFLINE_ACCESS_SCOPE);
    grant.addResourceScope(mcpResourceUrl(), resourceScopes.join(' '));
    grantId = await grant.save();
    await OauthGrantBinding.create({
      grantId,
      userId: user._id,
      tenantId,
      clientId: client.clientId,
      resource: mcpResourceUrl(),
      scopes: resourceScopes,
      sessionVersion: user.sessionVersion ?? 0,
    });

    const returnTo = await provider.interactionResult(req, res, {
      login: { accountId: String(user._id) },
      consent: { grantId },
    });
    return { resumeUrl: resumeUrlOnIssuer(returnTo) };
  } catch (err) {
    await OauthConsentSubmission.deleteOne({ interactionId });
    if (grantId) {
      await OauthGrantBinding.deleteOne({ grantId });
      if (grant) await grant.destroy();
    }
    throw err;
  }
}
