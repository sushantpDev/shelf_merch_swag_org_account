import { z } from 'zod';
import { ForbiddenError } from '../../utils/errors.js';
import { Entity } from '../entities/entity.model.js';
import { User } from '../users/user.model.js';
import { Wallet } from '../wallets/wallet.model.js';
import { employeeReaderFromContext } from './employeesRead.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { listSuggestedDepartments } from './departmentSuggestions.js';

const READ_ROLES = new Set(rolesForTenantArea('wallets', 'read'));

export const ENTITIES_LIST_DESCRIPTION = [
  'List departments the caller is allowed to see, plus the dashboard suggested department names.',
  'Company admins see every department in the workspace. Department managers see only departments assigned to them.',
  'Each existing department includes id, name, description, expectedUsers, allocated budget, remaining budget, manager name and title, and the wallet id.',
  'suggestedDepartments mirrors the Allocate Budget wizard quick-add list (Marketing, Sales, HR, Admin, Customer Success, Engineering, Finance, Operations).',
  'Use alreadyExists on each suggestion to tell suggested names apart from departments that already exist.',
  'Manager email, phone, and invitation links are not included.',
].join(' ');

export const entitiesListInputSchema = z.object({
  walletId: z.string().trim().regex(/^[a-f0-9]{24}$/i).optional(),
});

const departmentSchema = z.object({
  entityId: z.string(),
  name: z.string(),
  description: z.string(),
  expectedUsers: z.number(),
  allocatedAmount: z.number(),
  spentAmount: z.number(),
  remainingAmount: z.number(),
  walletId: z.string(),
  walletName: z.string(),
  manager: z.object({
    name: z.string(),
    title: z.string(),
    invitePending: z.boolean(),
    assigned: z.boolean(),
  }),
});

const suggestionSchema = z.object({
  name: z.string(),
  defaultDescription: z.string(),
  suggestedManagerRole: z.string(),
  alreadyExists: z.boolean(),
});

export const entitiesListOutputSchema = z.object({
  departments: z.array(departmentSchema),
  suggestedDepartments: z.array(suggestionSchema),
});

function assertReader(user) {
  if (!READ_ROLES.has(user?.role)) {
    throw new ForbiddenError('Departments are not available for this account');
  }
}

export async function visibleDepartmentIds(tenantId, user) {
  const manager = user.role === 'entity_manager' || user.scopeType === 'entity';
  if (!manager) return null;
  const dbUser = user.userId
    ? await User.findOne({ _id: user.userId, tenantId }).select('email').lean()
    : null;
  const email = dbUser?.email?.toLowerCase();
  const or = [{ managerUserId: user.userId }];
  if (email) or.push({ managerEmail: email });
  const managed = user.userId
    ? await Entity.find({ tenantId, $or: or }).select('_id').lean()
    : [];
  return [...new Set([
    ...(user.assignedEntityIds ?? []).map(String),
    ...managed.map((entity) => String(entity._id)),
  ])].filter(Boolean);
}

function present(entity, walletName) {
  const allocated = Number(entity.allocatedAmount) || 0;
  const spent = Number(entity.spentAmount) || 0;
  const name = entity.managerName || '';
  return {
    entityId: String(entity._id),
    name: entity.name,
    description: entity.description || '',
    expectedUsers: Number(entity.expectedUsers) || 0,
    allocatedAmount: allocated,
    spentAmount: spent,
    remainingAmount: Math.max(0, allocated - spent),
    walletId: String(entity.walletId),
    walletName: walletName || '',
    manager: {
      name,
      title: entity.managerTitle || '',
      invitePending: Boolean(entity.managerInvitePending),
      assigned: Boolean(entity.managerUserId || entity.managerEmail || name),
    },
  };
}

export async function listEntitiesForCaller(ctx, args = {}) {
  const reader = employeeReaderFromContext(ctx);
  if (!reader.tenantId) throw new ForbiddenError('Departments are not available for this account');
  assertReader(reader.user);
  const parsed = entitiesListInputSchema.safeParse(args ?? {});
  if (!parsed.success) throw new ForbiddenError('Department filter is not valid');
  return listDepartments({
    tenantId: reader.tenantId,
    user: reader.user,
    walletId: parsed.data.walletId,
  });
}

export async function listDepartments({ tenantId, user, walletId }) {
  assertReader(user);
  const filter = { tenantId, ...(walletId ? { walletId } : {}) };
  const visible = await visibleDepartmentIds(tenantId, user);
  if (visible) filter._id = { $in: visible };
  const entities = await Entity.find(filter).sort({ createdAt: 1 }).lean();
  const walletIds = [...new Set(entities.map((entity) => String(entity.walletId)))];
  const wallets = walletIds.length
    ? await Wallet.find({ tenantId, _id: { $in: walletIds } }).select('name').lean()
    : [];
  const names = new Map(wallets.map((wallet) => [String(wallet._id), wallet.name || '']));
  const departments = entities.map((entity) => present(entity, names.get(String(entity.walletId))));
  return {
    departments,
    suggestedDepartments: listSuggestedDepartments(departments.map((row) => row.name)),
  };
}

export function entitiesListText(output) {
  const rows = output?.departments ?? [];
  const suggestions = output?.suggestedDepartments ?? [];
  const existing = rows.length
    ? rows.map((row) => `${row.name}: allocated ${row.allocatedAmount} INR, remaining ${row.remainingAmount} INR`).join('\n')
    : 'No departments are visible for this account.';
  const available = suggestions
    .filter((row) => !row.alreadyExists)
    .map((row) => row.name);
  const suggestionLine = available.length
    ? `Suggested departments not yet created: ${available.join(', ')}.`
    : 'All suggested departments already exist (or none are available).';
  return `${existing}\n${suggestionLine}`;
}

export function entitiesReadError(error, fallback) {
  return error?.message || fallback;
}
