import { Entity } from './entity.model.js';
import { Wallet } from '../wallets/wallet.model.js';
import { WalletTransaction } from '../wallets/walletTransaction.model.js';
import { Tenant } from '../tenants/tenant.model.js';
import { User } from '../users/user.model.js';
import { inviteUser } from '../users/users.service.js';
import { appendEmailAllowlist } from '../auth/workEmail.js';
import { RoleAssignment } from '../roles/roleAssignment.model.js';
import { transitionState } from '../../services/stateMachine.service.js';
import * as ledger from '../../services/ledger.service.js';
import { ApiError, NotFoundError } from '../../utils/errors.js';
import { assertEntityAccess } from '../../middleware/abac.middleware.js';
import { getPagination, paginatedResponse } from '../../utils/pagination.js';

/** Keep role assignments in sync when a user is set as entity.managerUserId. */
export async function syncManagerEntityAccess({ tenantId, userId }) {
  const managed = await Entity.find({ tenantId, managerUserId: userId }).select('_id').lean();
  if (!managed.length) return;

  let assignment = await RoleAssignment.findOne({ userId, tenantId });
  if (!assignment) {
    await RoleAssignment.create({
      tenantId,
      userId,
      role: 'entity_manager',
      scopeType: 'entity',
      scopeId: managed[0]._id,
      assignedEntityIds: managed.map((e) => e._id),
    });
    return;
  }

  let dirty = false;
  const known = new Set(assignment.assignedEntityIds.map(String));
  for (const entity of managed) {
    if (!known.has(String(entity._id))) {
      assignment.assignedEntityIds.push(entity._id);
      dirty = true;
    }
  }
  if (assignment.role !== 'entity_manager') {
    assignment.role = 'entity_manager';
    dirty = true;
  }
  if (assignment.scopeType !== 'entity') {
    assignment.scopeType = 'entity';
    dirty = true;
  }
  if (!assignment.scopeId && managed.length === 1) {
    assignment.scopeId = managed[0]._id;
    dirty = true;
  }
  if (dirty) await assignment.save();
}

async function managedEntitiesForUser({ tenantId, user }) {
  const dbUser = await User.findOne({ _id: user.userId, tenantId }).select('email').lean();
  const email = dbUser?.email?.toLowerCase();

  const or = [{ managerUserId: user.userId }];
  if (email) or.push({ managerEmail: email });

  const managed = await Entity.find({ tenantId, $or: or }).select('_id managerUserId').lean();

  for (const entity of managed) {
    if (!entity.managerUserId || String(entity.managerUserId) !== String(user.userId)) {
      await Entity.updateOne(
        { _id: entity._id, tenantId },
        { managerUserId: user.userId, managerInvitePending: false },
      );
    }
  }

  await syncManagerEntityAccess({ tenantId, userId: user.userId });

  return managed.map((e) => String(e._id));
}

async function entityIdsVisibleToManager({ tenantId, user }) {
  const isEntityManager = user.role === 'entity_manager' || user.scopeType === 'entity';
  if (!isEntityManager) return null;

  const managedIds = await managedEntitiesForUser({ tenantId, user });
  const merged = [
    ...new Set([...(user.assignedEntityIds ?? []).map(String), ...managedIds]),
  ].filter(Boolean);

  return merged;
}

/**
 * Department names an entity manager may see/create contacts for.
 * Returns null for company admins (unscoped); [] when an EM has no departments.
 */
export async function managedEntityNamesForUser({ tenantId, user }) {
  const visibleIds = await entityIdsVisibleToManager({ tenantId, user });
  if (visibleIds === null) return null;
  if (!visibleIds.length) return [];

  const entities = await Entity.find({ tenantId, _id: { $in: visibleIds } })
    .select('name')
    .lean();
  return entities.map((e) => String(e.name || '').trim()).filter(Boolean);
}

async function managedEntityIdsRead({ tenantId, user }) {
  const dbUser = await User.findOne({ _id: user.userId, tenantId }).select('email').lean();
  const email = dbUser?.email?.toLowerCase();
  const or = [{ managerUserId: user.userId }];
  if (email) or.push({ managerEmail: email });
  const managed = await Entity.find({ tenantId, $or: or }).select('_id').lean();
  return managed.map((entity) => String(entity._id));
}

/**
 * Department names for a read-only directory view.
 * Matches managedEntityNamesForUser without backfilling manager links or role assignments.
 */
export async function managedEntityNamesForUserRead({ tenantId, user }) {
  const isEntityManager = user?.role === 'entity_manager' || user?.scopeType === 'entity';
  if (!isEntityManager) return null;

  const managedIds = user?.userId ? await managedEntityIdsRead({ tenantId, user }) : [];
  const merged = [...new Set([...(user.assignedEntityIds ?? []).map(String), ...managedIds])].filter(Boolean);
  if (!merged.length) return [];

  const entities = await Entity.find({ tenantId, _id: { $in: merged } })
    .select('name')
    .lean();
  return entities.map((entity) => String(entity.name || '').trim()).filter(Boolean);
}

export async function listEntities({ tenantId, user, walletId }) {
  const filter = { tenantId, ...(walletId ? { walletId } : {}) };
  const visibleIds = await entityIdsVisibleToManager({ tenantId, user });
  if (visibleIds) {
    filter._id = { $in: visibleIds };
  }

  const walletsToRepair = walletId
    ? await Wallet.find({ tenantId, _id: walletId }).select('_id').lean()
    : await Wallet.find({ tenantId }).select('_id').lean();
  await Promise.all(
    walletsToRepair.map((w) => ledger.repairWalletCaches({ tenantId, walletId: w._id })),
  );

  return Entity.find(filter).sort({ createdAt: 1 }).populate('managerUserId', 'name email phone status');
}

export async function getEntity({ tenantId, entityId }) {
  const entity = await Entity.findOne({ _id: entityId, tenantId });
  if (!entity) throw new NotFoundError('Entity not found');
  await ledger.repairWalletCaches({ tenantId, walletId: entity.walletId });
  return Entity.findOne({ _id: entityId, tenantId });
}

export async function createEntity({ tenantId, data, userId }) {
  const wallet = await Wallet.findOne({ _id: data.walletId, tenantId });
  if (!wallet) throw new NotFoundError('Wallet not found');

  const entity = await Entity.create({
    tenantId,
    walletId: wallet._id,
    name: data.name,
    description: data.description,
    colorHex: data.colorHex,
    expectedUsers: data.expectedUsers,
  });

  // First entity advances the wallet setup wizard.
  if (wallet.status === 'wallet_created') {
    transitionState('wallet', wallet, 'entities_added', { userId });
    await wallet.save();
  }
  return entity;
}

/** Return an entity on the wallet that campaigns can bill against (creates one for tenant admins when missing). */
export async function ensureSpendEntity({ tenantId, walletId, userId, user }) {
  const wallet = await Wallet.findOne({ _id: walletId, tenantId });
  if (!wallet) throw new NotFoundError('Wallet not found');

  const isEntityManager = user?.role === 'entity_manager' || user?.scopeType === 'entity';
  if (isEntityManager) {
    const managedIds = await entityIdsVisibleToManager({ tenantId, user });
    const entity = await Entity.findOne({
      tenantId,
      walletId,
      _id: { $in: managedIds ?? [] },
    }).sort({ createdAt: 1 });
    if (!entity) {
      throw new ApiError(
        422,
        'No budget department found for this wallet — allocate funds first',
        'NO_SPEND_ENTITY',
      );
    }
    return entity;
  }

  const existing = await Entity.findOne({ tenantId, walletId }).sort({ createdAt: 1 });
  if (existing) return existing;

  return createEntity({
    tenantId,
    data: {
      walletId,
      name: wallet.name?.trim() || 'General',
      description: 'Default department for campaign spending',
    },
    userId,
  });
}

export async function updateEntity({ tenantId, entityId, patch }) {
  const entity = await getEntity({ tenantId, entityId });
  const before = entity.toObject();
  // allocatedAmount/spentAmount are ledger-derived — never patchable.
  const { allocatedAmount, spentAmount, ...rest } = patch;
  Object.assign(entity, rest);
  await entity.save();
  return { before, entity };
}

export async function deleteEntity({ tenantId, entityId }) {
  const entity = await getEntity({ tenantId, entityId });
  // §7.5 — soft delete only when no live budget is at stake.
  if (entity.allocatedAmount - entity.spentAmount > 0) {
    throw new ApiError(
      422,
      'Entity still has unspent allocated budget — deallocate it before deleting',
      'ENTITY_HAS_BUDGET',
    );
  }
  // Campaign check joins here in Phase 4 (no active campaigns).
  await entity.softDelete();
  return entity;
}

/**
 * §7.5 /assign-manager — invite (or reuse) a user and bind them to the entity.
 * Company admins may invite any manager email; we allowlist it so they can accept
 * the invite and sign in without a separate Shelf Merch admin step.
 */
export async function assignManager({ tenantId, entityId, data, userId }) {
  const entity = await getEntity({ tenantId, entityId });
  const tenant = await Tenant.findById(tenantId).select('name').lean();
  const sendInvite = data.sendInvite !== false;

  const { user, inviteToken } = await inviteUser({
    tenantId,
    name: data.name,
    email: data.email,
    phone: data.mobile ?? '',
    role: 'entity_manager',
    scopeType: 'entity',
    scopeId: entity._id,
    assignedEntityIds: [entity._id],
    sendInvite,
    requireAllowlist: false,
    emailContext: {
      departmentName: entity.name,
      organizationName: tenant?.name || 'your organization',
      roleTitle: data.role || 'Department Manager',
    },
  });
  await appendEmailAllowlist([data.email], userId);

  entity.managerUserId = user._id;
  // Pending whenever the bound account still needs to accept / activate.
  entity.managerInvitePending = user.status === 'invited';
  entity.managerTitle = data.role || '';
  entity.managerName = data.name || user.name || '';
  entity.managerEmail = user.email || data.email || '';
  await entity.save();

  await syncManagerEntityAccess({ tenantId, userId: user._id });

  // Wizard advance: all entities of the wallet managed → managers_assigned.
  const wallet = await Wallet.findOne({ _id: entity.walletId, tenantId });
  if (wallet?.status === 'budget_allocated') {
    const unmanaged = await Entity.countDocuments({
      tenantId,
      walletId: wallet._id,
      managerUserId: null,
    });
    if (unmanaged === 0) {
      transitionState('wallet', wallet, 'managers_assigned', { userId });
      await wallet.save();
    }
  }

  return {
    entity,
    manager: user,
    inviteToken: user.status === 'invited' ? inviteToken : undefined,
    alreadyActive: user.status === 'active',
  };
}

export async function entityRoleAssignment({ tenantId, entityId }) {
  return RoleAssignment.findOne({ tenantId, scopeType: 'entity', scopeId: entityId });
}

/** Ledger rows for a department — works even when the source wallet was removed. */
export async function listEntityTransactions({ tenantId, entityId, user, query }) {
  const entity = await getEntity({ tenantId, entityId });
  assertEntityAccess(user, entity._id);

  const { page, limit, skip } = getPagination(query);
  const filter = {
    tenantId,
    relatedEntityId: entity._id,
    type: { $in: ['allocation_to_entity', 'campaign_spend', 'order_payment', 'refund'] },
  };
  const [items, total] = await Promise.all([
    WalletTransaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    WalletTransaction.countDocuments(filter),
  ]);
  const manager = user?.role === 'entity_manager' || user?.scopeType === 'entity';
  // balanceAfter is the organization wallet cash snapshot. The department
  // history screen recomputes remaining budget, so entity managers do not receive it.
  const visible = manager
    ? items.map(({ balanceAfter: _balanceAfter, ...row }) => row)
    : items;
  return paginatedResponse(visible, total, { page, limit });
}
