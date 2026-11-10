import { User } from '../users/user.model.js';
import { RoleAssignment, PLATFORM_ROLES } from '../roles/roleAssignment.model.js';
import { AuditLog } from '../auditLogs/auditLog.model.js';
import { inviteUser } from '../users/users.service.js';
import {
  appendEmailAllowlist,
  getEmailAllowlist,
  isBuiltInPlatformEmail,
  normalizeEmail,
} from '../auth/workEmail.js';
import { ApiError, NotFoundError } from '../../utils/errors.js';
import { getPagination, paginatedResponse } from '../../utils/pagination.js';
import { BUILT_IN_PLATFORM_TEAM } from './platformTeamDefaults.js';

export async function ensureBuiltInPlatformTeam() {
  for (const member of BUILT_IN_PLATFORM_TEAM) {
    let user = await User.findOne({ email: member.email });
    if (!user) {
      user = await User.create({
        tenantId: null,
        name: member.name,
        email: member.email,
        status: 'active',
      });
    }

    const assignment = await RoleAssignment.findOne({
      userId: user._id,
      tenantId: null,
      scopeType: 'platform',
    });
    if (!assignment) {
      await RoleAssignment.create({
        tenantId: null,
        userId: user._id,
        role: member.role,
        scopeType: 'platform',
        scopeId: null,
        assignedEntityIds: [],
      });
    }
  }
}

/** §5 — internal ShelfMerch org: tenantId null, scopeType platform. */

export async function listTeam() {
  const [assignments, emailAllowlist] = await Promise.all([
    RoleAssignment.find({ tenantId: null, scopeType: 'platform' }).lean(),
    getEmailAllowlist(),
  ]);
  const allowlist = new Set(emailAllowlist);
  const userIds = assignments.map((a) => a.userId);
  const users = await User.find({ _id: { $in: userIds } }).lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));

  return assignments
    .map((a) => {
      const user = byId.get(String(a.userId));
      if (!user) return null;
      const userId = String(user._id);
      const email = normalizeEmail(user.email);
      const protectedBuiltIn = isBuiltInPlatformEmail(email);
      return {
        id: userId,
        userId,
        name: user.name,
        email,
        status: user.status,
        role: a.role,
        allowlisted: allowlist.has(email),
        protected: protectedBuiltIn,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      };
    })
    .filter(Boolean);
}

export async function invitePlatformUser({ name, email, role }) {
  if (!PLATFORM_ROLES.includes(role)) {
    throw new ApiError(422, `Role must be one of: ${PLATFORM_ROLES.join(', ')}`, 'INVALID_ROLE');
  }
  const result = await inviteUser({
    tenantId: null,
    name,
    email,
    role,
    scopeType: 'platform',
    requireAllowlist: false,
  });
  await appendEmailAllowlist([email]);
  return result;
}

async function getPlatformUser(userId) {
  const assignment = await RoleAssignment.findOne({ userId, tenantId: null, scopeType: 'platform' });
  if (!assignment) throw new NotFoundError('Platform user not found');
  const user = await User.findOne({ _id: userId });
  if (!user) throw new NotFoundError('Platform user not found');
  return { user, assignment };
}

export async function changePlatformRole({ userId, role }) {
  if (!PLATFORM_ROLES.includes(role)) {
    throw new ApiError(422, `Role must be one of: ${PLATFORM_ROLES.join(', ')}`, 'INVALID_ROLE');
  }
  const { user, assignment } = await getPlatformUser(userId);
  const before = assignment.role;
  assignment.role = role;
  await assignment.save();
  return { user, before, after: role };
}

export async function deactivatePlatformUser(userId) {
  const { user } = await getPlatformUser(userId);
  if (isBuiltInPlatformEmail(user.email)) {
    throw new ApiError(
      422,
      'Built-in ShelfMerch platform users must remain active and allowlisted.',
      'BUILT_IN_PLATFORM_USER_PROTECTED',
    );
  }
  user.status = 'suspended';
  await user.save();
  return user;
}

export async function reactivatePlatformUser(userId) {
  const { user } = await getPlatformUser(userId);
  user.status = 'active';
  await user.save();
  return user;
}

/** §5 — a platform user's activity = their audit-log trail. */
export async function getPlatformUserActivity(userId, query) {
  await getPlatformUser(userId);
  const { page, limit, skip } = getPagination(query);
  const filter = { actorUserId: userId };
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  return paginatedResponse(items, total, { page, limit });
}
