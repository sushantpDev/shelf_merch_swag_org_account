import mongoose from 'mongoose';
import { User } from '../users/user.model.js';
import { Tenant } from '../tenants/tenant.model.js';
import { RoleAssignment } from '../roles/roleAssignment.model.js';
import { OauthGrantBinding, OAUTH_GRANT_ROLES } from './oauthGrantBinding.model.js';

function accountEcho(sub) {
  return {
    accountId: sub,
    async claims() {
      return { sub };
    },
  };
}

/**
 * Token-endpoint account lookup. A ShelfMerch user id is accepted only while
 * the user, session version, workspace, and catalog role on the consent
 * binding are still valid. Non-user ids stay available for the protocol
 * foundation tests. This does not authorize the token on /mcp.
 */
export async function findOauthAccount(_ctx, sub, token) {
  if (!sub) return undefined;
  if (!mongoose.isValidObjectId(sub)) return accountEcho(sub);

  const user = await User.findById(sub).select('status sessionVersion').lean();
  if (!user || user.status !== 'active') return undefined;

  if (token?.grantId) {
    const binding = await OauthGrantBinding.findOne({ grantId: token.grantId }).lean();
    if (!binding || String(binding.userId) !== String(user._id)) return undefined;
    if ((user.sessionVersion ?? 0) !== binding.sessionVersion) return undefined;

    const tenant = await Tenant.findById(binding.tenantId).select('status').lean();
    if (!tenant || !['active', 'trial'].includes(tenant.status)) return undefined;

    const assignment = await RoleAssignment.findOne({
      userId: user._id,
      tenantId: binding.tenantId,
      role: { $in: OAUTH_GRANT_ROLES },
    }).lean();
    if (!assignment) return undefined;
  }

  return accountEcho(String(user._id));
}
