import { z } from 'zod';
import { ApiError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { writeAudit } from '../../services/audit.service.js';
import { Entity } from '../entities/entity.model.js';
import { assignManager, createEntity } from '../entities/entities.service.js';
import { User } from '../users/user.model.js';
import { RoleAssignment } from '../roles/roleAssignment.model.js';
import { Wallet } from '../wallets/wallet.model.js';
import { WalletTransaction } from '../wallets/walletTransaction.model.js';
import { allocate, activate, allocationLedgerKey } from '../wallets/wallets.service.js';
import { employeeReaderFromContext } from './employeesRead.js';
import { executeMcpWrite, prepareMcpWrite } from './mcpWriteSafety.js';
import { McpEntityClaim } from './mcpEntityClaim.model.js';
import {
  DEFAULT_EXPECTED_USERS,
  defaultDescriptionFor,
  departmentPaletteColor,
} from './departmentSuggestions.js';

const WRITE_ROLES = new Set(rolesForTenantArea('wallets', 'write'));
const MONEY = z.number().int().positive().max(100_000_000);
const OBJECT_ID = z.string().trim().regex(/^[a-f0-9]{24}$/i);
const managerSchema = z.object({
  name: z.string().trim().min(1).max(100).describe('Manager full name. Required, same as the dashboard.'),
  email: z.string().trim().email().max(254).describe('Manager work email. Required.'),
  role: z.string().trim().max(100).optional().default('').describe('Role or designation, such as Marketing Manager. Optional. Saved as the department manager title.'),
  mobile: z.string().trim().refine(
    (value) => !value || /^(?:\+?91)?\d{10}$/.test(value.replace(/[\s()-]/g, '')),
    'Enter a valid 10-digit mobile number',
  ).optional().default('').describe('Optional Indian mobile number. 10 digits, with or without +91. Saved on the manager account and not repeated in the preview.'),
  sendInvite: z.boolean().optional().default(true).describe(
    'When true (default), send the ShelfMerch manager invitation email if the account is not already active. When false, assign the manager without sending email — same as the dashboard invitation toggle.',
  ),
});
const departmentSchema = z.object({
  name: z.string().trim().min(1).max(120).describe(
    'Department name. Prefer a dashboard suggestion from entities_list.suggestedDepartments, or a custom name.',
  ),
  description: z.string().trim().max(2000).optional().default('').describe(
    'Optional department description. When omitted for a suggested name, the dashboard quick-add description is used.',
  ),
  expectedUsers: z.number().int().nonnegative().max(1_000_000).optional().default(DEFAULT_EXPECTED_USERS).describe(
    'Optional expected headcount. Defaults to 10, matching the dashboard Department modal.',
  ),
  budget: MONEY.describe('Absolute initial budget target in INR for this department (not a delta).'),
  manager: managerSchema,
});

const setupSchema = z.object({
  walletId: OBJECT_ID,
  departments: z.array(departmentSchema).min(1).max(20),
}).strict();

const assignSchema = z.object({
  entityId: OBJECT_ID,
  manager: managerSchema,
}).strict();

export const ENTITIES_PREPARE_SETUP_DESCRIPTION = [
  'Preview creating departments, assigning their first managers, and allocating the initial budget from a company wallet.',
  'This is the MCP equivalent of the dashboard Allocate Budget finish step for new or unfinished departments.',
  'Company admins only. Nothing is saved.',
  'Call entities_list first. Offer suggestedDepartments where alreadyExists is false; also allow custom department names.',
  'Optional description and expectedUsers match the dashboard Department modal (defaults applied when omitted).',
  'Ask for each manager full name and work email. Also ask for the role or designation, mobile number, and whether to send the invitation email (sendInvite, default true).',
  'Role and mobile may be left blank. sendInvite false assigns without email, matching the dashboard toggle.',
  'budget is the absolute initial amount for that department. Sum of new budgets cannot exceed wallet unallocatedAmount (use wallet_list_balances).',
  'For equal split across N departments, divide unallocatedAmount by N (floor to whole INR) the same way the dashboard Split evenly control does.',
  'The preview shows each department, description, expected users, manager name and title, invite preference, the budget, the total, and the wallet balance before and after.',
  'The mobile number itself is not returned.',
  'An invitation email is sent only when sendInvite is true and the manager does not already have an active account.',
  'A Slack budget notice is sent once, and only after the wallet movement succeeds, when Slack is already connected.',
  'Applying it requires entities_execute_setup.',
].join(' ');

export const ENTITIES_EXECUTE_SETUP_DESCRIPTION = [
  'Create the departments from entities_prepare_setup and allocate their initial budgets.',
  'Requires the confirmation id and an idempotency key.',
  'The wallet balance and department names are checked again. A repeated key finishes missing steps and does not allocate the same budget twice.',
  'This is not one database transaction. A retry continues from the department, manager, or wallet step that already succeeded.',
  'Changing a manager who is already assigned is not part of this tool.',
].join(' ');

export const ENTITIES_PREPARE_ASSIGN_DESCRIPTION = [
  'Preview assigning the first manager of an existing department.',
  'Company admins only. Nothing is saved.',
  'Use this when the department already exists and does not have a manager yet.',
  'Ask for manager name, email, optional role, optional mobile, and sendInvite (default true) matching the dashboard Assign Managers step.',
  'An existing company admin is not turned into a department manager.',
  'Applying it requires entities_execute_assign_manager.',
].join(' ');

export const ENTITIES_EXECUTE_ASSIGN_DESCRIPTION = [
  'Assign the first manager previewed by entities_prepare_assign_manager.',
  'Requires the confirmation id and an idempotency key.',
  'A repeated key does not create another account or send another invitation.',
  'A department that already has a different manager is left unchanged.',
].join(' ');

export const entitiesPrepareSetupInputSchema = setupSchema;
export const entitiesExecuteSetupInputSchema = setupSchema.extend({
  confirmationId: z.string().trim().min(20).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
});
export const entitiesPrepareAssignInputSchema = assignSchema;
export const entitiesExecuteAssignInputSchema = assignSchema.extend({
  confirmationId: z.string().trim().min(20).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
});

const moneySchema = z.object({
  balance: z.number(),
  allocatedAmount: z.number(),
  unallocatedAmount: z.number(),
});

export const entitiesPrepareSetupOutputSchema = z.object({
  confirmationId: z.string(),
  expiresAt: z.string(),
  preview: z.object({
    walletId: z.string(),
    currency: z.string(),
    totalAllocation: z.number(),
    before: moneySchema,
    after: moneySchema,
    fundingPending: z.boolean(),
    departments: z.array(z.object({
      name: z.string(),
      description: z.string(),
      expectedUsers: z.number(),
      budget: z.number(),
      action: z.string(),
      managerName: z.string(),
      managerTitle: z.string(),
      mobileProvided: z.boolean(),
      sendInvite: z.boolean(),
      invitation: z.string(),
    })),
    notices: z.array(z.object({
      kind: z.string(),
      departmentName: z.string(),
      detail: z.string(),
    })),
  }),
});

export const entitiesExecuteSetupOutputSchema = z.object({
  walletId: z.string(),
  totalAllocation: z.number(),
  balance: z.number(),
  allocatedAmount: z.number(),
  unallocatedAmount: z.number(),
  walletActivated: z.boolean(),
  departments: z.array(z.object({
    entityId: z.string(),
    name: z.string(),
    allocatedAmount: z.number(),
    remainingAmount: z.number(),
    managerName: z.string(),
    invitePending: z.boolean(),
  })),
});

export const entitiesPrepareAssignOutputSchema = z.object({
  confirmationId: z.string(),
  expiresAt: z.string(),
  preview: z.object({
    entityId: z.string(),
    departmentName: z.string(),
    managerName: z.string(),
    managerTitle: z.string(),
    mobileProvided: z.boolean(),
    sendInvite: z.boolean(),
    invitation: z.string(),
  }),
});

export const entitiesExecuteAssignOutputSchema = z.object({
  entityId: z.string(),
  departmentName: z.string(),
  managerName: z.string(),
  managerTitle: z.string(),
  invitePending: z.boolean(),
});

function invalid(message = 'Department details are not valid') {
  return new ApiError(400, message, 'VALIDATION');
}

function businessInput(input) {
  if (!input || typeof input !== 'object') return {};
  const { confirmationId: _confirmationId, idempotencyKey: _idempotencyKey, ...rest } = input;
  return rest;
}

function assertWriter(actor) {
  if (!WRITE_ROLES.has(actor?.user?.role)) {
    throw new ForbiddenError('Department setup requires a company admin');
  }
}

function requireCaller(ctx) {
  const caller = employeeReaderFromContext(ctx);
  if (!caller.tenantId || !caller.user.userId) {
    throw new ForbiddenError('Department setup is not available for this account');
  }
  return caller;
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

function money(wallet) {
  const balance = Number(wallet?.balance) || 0;
  const allocatedAmount = Number(wallet?.allocatedAmount) || 0;
  return { balance, allocatedAmount, unallocatedAmount: balance - allocatedAmount };
}

function fundingPending(wallet) {
  return wallet?.fundingMethod === 'po_upload'
    && wallet?.fundingDocument?.approvalStatus === 'pending';
}

function setupKey(name, budget) {
  return `setup:${normalizeName(name)}:${budget}`;
}

async function loadWallet(tenantId, walletId) {
  const wallet = await Wallet.findOne({ _id: walletId, tenantId });
  if (!wallet) throw new NotFoundError('Wallet not found');
  return wallet;
}

async function findDepartment(tenantId, walletId, name) {
  const entities = await Entity.find({ tenantId, walletId }).select(
    'name description expectedUsers allocatedAmount spentAmount managerUserId managerEmail managerName managerTitle managerInvitePending walletId updatedAt',
  );
  return entities.find((entity) => normalizeName(entity.name) === normalizeName(name)) || null;
}

async function accountFor(email) {
  const user = await User.findOne({ email: email.toLowerCase() }).select('tenantId status name').lean();
  if (!user) return { invitation: 'new_invitation' };
  return { user, invitation: user.status === 'active' ? 'link_existing' : 'refresh_invitation' };
}

async function assertLinkable(tenantId, manager) {
  const found = await accountFor(manager.email);
  if (!found.user) return found.invitation;
  if (String(found.user.tenantId || '') !== String(tenantId)) {
    if (found.user.status === 'invited') return 'refresh_invitation';
    throw new ApiError(409, 'That email is already used in another workspace', 'CONFLICT');
  }
  if (found.user.status !== 'active') return 'refresh_invitation';
  const assignment = await RoleAssignment.findOne({ userId: found.user._id, tenantId }).select('role').lean();
  if (assignment?.role !== 'entity_manager') {
    throw new ApiError(409, 'That email belongs to a user who cannot be assigned as a department manager', 'ROLE_CONFLICT');
  }
  return 'link_existing';
}

function wantsInvite(manager) {
  return manager?.sendInvite !== false;
}

/** Align invitation preview codes with dashboard sendInvite toggle. */
function invitationOutcome(baseInvitation, manager) {
  if (baseInvitation === 'already_assigned' || baseInvitation === 'link_existing') {
    return baseInvitation;
  }
  if (!wantsInvite(manager)) return 'assign_without_invite';
  return baseInvitation;
}

function resolveCreateMeta(department, colorIndex = 0) {
  const name = String(department?.name || '').trim();
  const providedDescription = String(department?.description || '').trim();
  return {
    description: providedDescription || defaultDescriptionFor(name),
    expectedUsers: Number.isFinite(department?.expectedUsers)
      ? Number(department.expectedUsers)
      : DEFAULT_EXPECTED_USERS,
    colorHex: departmentPaletteColor(colorIndex),
  };
}

function sameManager(entity, manager) {
  return normalizeName(entity?.managerEmail) === normalizeName(manager.email);
}

function assertManagerAvailable(entity, manager) {
  if (!entity?.managerUserId && !entity?.managerEmail) return;
  if (sameManager(entity, manager)) return;
  throw new ApiError(409, `${entity.name} already has a manager. This tool does not replace one.`, 'MANAGER_ALREADY_ASSIGNED');
}

async function claimDepartment(tenantId, wallet, department) {
  const name = typeof department === 'string' ? department : department.name;
  const logicalKey = `${wallet._id}:${normalizeName(name)}`;
  const existing = await findDepartment(tenantId, wallet._id, name);
  if (existing) {
    await McpEntityClaim.updateOne(
      { tenantId, logicalKey },
      { $setOnInsert: { tenantId, logicalKey, entityId: existing._id } },
      { upsert: true },
    );
    return existing;
  }
  try {
    await McpEntityClaim.create({ tenantId, logicalKey, entityId: null });
  } catch (err) {
    if (err?.code !== 11000) throw err;
    const claimed = await McpEntityClaim.findOne({ tenantId, logicalKey });
    if (claimed?.entityId) {
      const entity = await Entity.findOne({ _id: claimed.entityId, tenantId, walletId: wallet._id });
      if (entity) return entity;
    }
    const raced = await findDepartment(tenantId, wallet._id, name);
    if (raced) return raced;
    throw new ApiError(409, 'This department is already being created', 'DEPARTMENT_SETUP_IN_PROGRESS');
  }
  let entity;
  try {
    const colorIndex = await Entity.countDocuments({ tenantId, walletId: wallet._id });
    const meta = resolveCreateMeta(department, colorIndex);
    entity = await createEntity({
      tenantId,
      userId: null,
      data: {
        walletId: wallet._id,
        name: String(name).trim(),
        description: meta.description,
        colorHex: meta.colorHex,
        expectedUsers: meta.expectedUsers,
      },
    });
  } catch (err) {
    await McpEntityClaim.deleteOne({ tenantId, logicalKey, entityId: null });
    throw err;
  }
  await McpEntityClaim.updateOne({ tenantId, logicalKey }, { entityId: entity._id });
  return entity;
}

async function ensureManager({ tenantId, entity, manager, userId }) {
  const current = await Entity.findOne({ _id: entity._id, tenantId });
  if (!current) throw new NotFoundError('Department not found');
  assertManagerAvailable(current, manager);
  if (sameManager(current, manager)) return current;
  await assertLinkable(tenantId, manager);
  const assigned = await assignManager({
    tenantId,
    entityId: current._id,
    userId,
    data: {
      name: manager.name,
      email: manager.email,
      role: manager.role || '',
      mobile: manager.mobile || '',
      sendInvite: wantsInvite(manager),
    },
  });
  return assigned.entity;
}

function assertUnfundedOrMatching(entity, budget) {
  const allocated = Number(entity.allocatedAmount) || 0;
  if (allocated === 0 || allocated === budget) return;
  throw new ApiError(
    409,
    `${entity.name} already has a different budget. Use budget allocation to change it.`,
    'DEPARTMENT_ALREADY_FUNDED',
  );
}

async function setupState(tenantId, requested) {
  const wallet = await loadWallet(tenantId, requested.walletId);
  const names = new Set();
  const departments = [];
  for (const department of requested.departments) {
    const key = normalizeName(department.name);
    if (names.has(key)) throw invalid('Each department name can be used once');
    names.add(key);
    const entity = await findDepartment(tenantId, wallet._id, department.name);
    if (entity) assertUnfundedOrMatching(entity, department.budget);
    if (entity) assertManagerAvailable(entity, department.manager);
    const baseInvitation = entity && sameManager(entity, department.manager)
      ? 'already_assigned'
      : await assertLinkable(tenantId, department.manager);
    const invitation = invitationOutcome(baseInvitation, department.manager);
    departments.push({ ...department, entity, invitation });
  }
  const total = requested.departments.reduce((sum, department) => sum + department.budget, 0);
  const pending = fundingPending(wallet);
  if (!pending) {
    const fresh = departments.filter((department) => (Number(department.entity?.allocatedAmount) || 0) === 0);
    const needed = fresh.reduce((sum, department) => sum + department.budget, 0);
    if (needed > money(wallet).unallocatedAmount) {
      throw new ApiError(422, 'Allocations exceed unallocated balance', 'ALLOCATION_EXCEEDS_BALANCE');
    }
  }
  return { wallet, departments, total, pending };
}

function resourceVersion(wallet, departments) {
  return {
    walletId: String(wallet._id),
    balance: Number(wallet.balance) || 0,
    allocatedAmount: Number(wallet.allocatedAmount) || 0,
    fundingPending: fundingPending(wallet),
    departments: departments
      .map((department) => ({
        name: normalizeName(department.name),
        entityId: department.entity ? String(department.entity._id) : null,
        allocatedAmount: Number(department.entity?.allocatedAmount) || 0,
        managerEmail: normalizeName(department.entity?.managerEmail),
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}

function noticesFor(departments, pending) {
  const notices = [];
  for (const department of departments) {
    const invitation = department.invitation === 'already_assigned'
      ? 'This manager is already assigned. No new invitation is sent.'
      : department.invitation === 'link_existing'
        ? 'The existing department manager account will be linked. No new invitation is sent.'
        : department.invitation === 'assign_without_invite'
          ? 'The manager will be assigned without sending an invitation email.'
          : 'An invitation email will be sent to the manager you entered.';
    notices.push({ kind: 'manager_invitation', departmentName: department.name, detail: invitation });
    notices.push({
      kind: pending ? 'planned_budget' : 'slack_budget',
      departmentName: department.name,
      detail: pending
        ? 'The budget is saved as a planned allocation until wallet funding is approved. Slack is not sent yet.'
        : 'A Slack budget notice is sent once after the wallet movement, when Slack is connected.',
    });
  }
  return notices;
}

function previewFrom(state) {
  const before = money(state.wallet);
  const needed = state.departments
    .filter((department) => (Number(department.entity?.allocatedAmount) || 0) === 0)
    .reduce((sum, department) => sum + department.budget, 0);
  return {
    walletId: String(state.wallet._id),
    currency: state.wallet.currency || 'INR',
    totalAllocation: state.total,
    before,
    after: state.pending ? before : {
      ...before,
      allocatedAmount: before.allocatedAmount + needed,
      unallocatedAmount: before.unallocatedAmount - needed,
    },
    fundingPending: state.pending,
    departments: state.departments.map((department) => {
      const meta = resolveCreateMeta(department);
      return {
        name: department.name,
        description: department.entity?.description || meta.description,
        expectedUsers: department.entity
          ? (Number(department.entity.expectedUsers) || 0)
          : meta.expectedUsers,
        budget: department.budget,
        action: !department.entity
          ? 'create'
          : (Number(department.entity.allocatedAmount) || 0) === department.budget
            ? 'already_saved'
            : 'finish_budget',
        managerName: department.manager.name,
        managerTitle: department.manager.role || '',
        mobileProvided: Boolean(String(department.manager.mobile || '').trim()),
        sendInvite: wantsInvite(department.manager),
        invitation: department.invitation,
      };
    }),
    notices: noticesFor(state.departments, state.pending),
  };
}

async function rememberPlan(wallet, departments) {
  const planned = departments.map((department) => ({
    entityId: department.entity._id,
    amount: department.budget,
  }));
  wallet.fundingDocument = wallet.fundingDocument || {};
  wallet.fundingDocument.plannedAllocations = planned;
  wallet.markModified('fundingDocument');
  await wallet.save();
}

async function applySetup({ tenantId, actor, requested }) {
  const wallet = await loadWallet(tenantId, requested.walletId);
  const pending = fundingPending(wallet);
  const finished = [];
  for (const department of requested.departments) {
    const entity = await claimDepartment(tenantId, wallet, department);
    assertUnfundedOrMatching(entity, department.budget);
    const managed = await ensureManager({
      tenantId,
      entity,
      manager: department.manager,
      userId: actor.user.userId,
    });
    finished.push({ entity: managed, budget: department.budget, name: department.name });
  }
  if (pending) {
    const current = await loadWallet(tenantId, wallet._id);
    await rememberPlan(current, finished);
  } else {
    const lines = [];
    for (const department of finished) {
      const current = await Entity.findOne({ _id: department.entity._id, tenantId });
      const allocated = Number(current?.allocatedAmount) || 0;
      if (allocated === department.budget) continue;
      lines.push({
        entityId: department.entity._id,
        amount: department.budget,
        idempotencyKey: allocationLedgerKey(wallet._id, department.entity._id, setupKey(department.name, department.budget)),
      });
    }
    if (lines.length) {
      await allocate({
        tenantId,
        walletId: wallet._id,
        userId: actor.user.userId,
        allocations: lines,
      });
    }
  }
  let walletActivated = false;
  if (!pending) {
    try {
      const activated = await activate({ tenantId, walletId: wallet._id, userId: actor.user.userId });
      walletActivated = activated?.status === 'active' || activated?.wallet?.status === 'active';
    } catch (err) {
      if (err?.code !== 'WALLET_SETUP_INCOMPLETE') throw err;
    }
  }
  return setupResult(tenantId, wallet._id, finished, walletActivated);
}

async function setupResult(tenantId, walletId, finished, walletActivated) {
  const wallet = await loadWallet(tenantId, walletId);
  const ids = finished.map((department) => department.entity._id);
  const entities = await Entity.find({ tenantId, _id: { $in: ids } });
  const byId = new Map(entities.map((entity) => [String(entity._id), entity]));
  return {
    walletId: String(wallet._id),
    totalAllocation: finished.reduce((sum, department) => sum + department.budget, 0),
    ...money(wallet),
    walletActivated,
    departments: finished.map((department) => {
      const entity = byId.get(String(department.entity._id));
      const allocated = Number(entity?.allocatedAmount) || 0;
      const spent = Number(entity?.spentAmount) || 0;
      return {
        entityId: String(department.entity._id),
        name: entity?.name || department.name,
        allocatedAmount: allocated,
        remainingAmount: Math.max(0, allocated - spent),
        managerName: entity?.managerName || '',
        invitePending: Boolean(entity?.managerInvitePending),
      };
    }),
  };
}

async function setupProgress(tenantId, requested) {
  const wallet = await Wallet.findOne({ _id: requested.walletId, tenantId });
  if (!wallet) return { outcome: 'uncertain' };
  const finished = [];
  for (const department of requested.departments) {
    const entity = await findDepartment(tenantId, wallet._id, department.name);
    if (!entity || !sameManager(entity, department.manager)) return { outcome: 'absent' };
    const allocated = Number(entity.allocatedAmount) || 0;
    if (fundingPending(wallet)) {
      const planned = wallet.fundingDocument?.plannedAllocations || [];
      const match = planned.some((line) => String(line.entityId) === String(entity._id) && Number(line.amount) === department.budget);
      if (!match) return { outcome: 'absent' };
    } else if (allocated !== department.budget) {
      const key = allocationLedgerKey(wallet._id, entity._id, setupKey(department.name, department.budget));
      const txn = await WalletTransaction.findOne({ tenantId, idempotencyKey: key });
      if (!txn) return { outcome: 'absent' };
    }
    finished.push({ entity, budget: department.budget, name: department.name });
  }
  return { outcome: 'completed', result: await setupResult(tenantId, wallet._id, finished, wallet.status === 'active') };
}

export async function prepareEntitySetup({ tenantId, actorUserId, input, now }) {
  const requested = setupSchema.safeParse(businessInput(input));
  if (!requested.success) throw invalid();
  const state = {};
  const prepared = await prepareMcpWrite({
    tenantId,
    actorUserId,
    operation: 'entities.setup',
    payload: requested.data,
    now,
    authorize: async (actor) => {
      assertWriter(actor);
      Object.assign(state, await setupState(tenantId, requested.data));
    },
    validate: async () => requested.data,
    resourceState: async () => {
      const current = await setupState(tenantId, requested.data);
      return resourceVersion(current.wallet, current.departments);
    },
    summary: async () => ({
      action: 'preview',
      walletId: requested.data.walletId,
      departmentCount: requested.data.departments.length,
      totalAllocation: requested.data.departments.reduce((sum, department) => sum + department.budget, 0),
    }),
  });
  return {
    confirmationId: prepared.confirmationId,
    expiresAt: prepared.expiresAt,
    preview: previewFrom(state),
  };
}

export async function executeEntitySetup({ tenantId, actorUserId, input, confirmationId, idempotencyKey, now }) {
  const requested = setupSchema.safeParse(businessInput(input));
  if (!requested.success) throw invalid();
  return executeMcpWrite({
    tenantId,
    actorUserId,
    operation: 'entities.setup',
    payload: requested.data,
    confirmationId,
    idempotencyKey,
    now,
    authorize: async (actor) => {
      assertWriter(actor);
      await setupState(tenantId, requested.data);
    },
    validate: async () => requested.data,
    resourceState: async () => {
      const current = await setupState(tenantId, requested.data);
      return resourceVersion(current.wallet, current.departments);
    },
    reconcile: async () => setupProgress(tenantId, requested.data),
    execute: async (actor) => {
      const result = await applySetup({ tenantId, actor, requested: requested.data });
      await writeAudit({
        tenantId,
        req: { tenantId, user: { userId: actor.user.userId, role: actor.user.role } },
        action: 'entities.setup',
        entityType: 'Wallet',
        entityId: requested.data.walletId,
        after: { departmentCount: result.departments.length, totalAllocation: result.totalAllocation },
      });
      return result;
    },
  });
}

async function assignState(tenantId, requested) {
  const entity = await Entity.findOne({ _id: requested.entityId, tenantId });
  if (!entity) throw new NotFoundError('Department not found');
  assertManagerAvailable(entity, requested.manager);
  const baseInvitation = sameManager(entity, requested.manager)
    ? 'already_assigned'
    : await assertLinkable(tenantId, requested.manager);
  const invitation = invitationOutcome(baseInvitation, requested.manager);
  return { entity, invitation };
}

export async function prepareAssignManager({ tenantId, actorUserId, input, now }) {
  const requested = assignSchema.safeParse(businessInput(input));
  if (!requested.success) throw invalid();
  const state = {};
  const prepared = await prepareMcpWrite({
    tenantId,
    actorUserId,
    operation: 'entities.assign_manager',
    payload: requested.data,
    now,
    authorize: async (actor) => {
      assertWriter(actor);
      Object.assign(state, await assignState(tenantId, requested.data));
    },
    validate: async () => requested.data,
    resourceState: async () => {
      const current = await assignState(tenantId, requested.data);
      return {
        entityId: String(current.entity._id),
        managerEmail: normalizeName(current.entity.managerEmail),
        updatedAt: new Date(current.entity.updatedAt).toISOString(),
      };
    },
    summary: async () => ({
      action: 'preview',
      entityId: requested.data.entityId,
      departmentName: state.entity?.name || '',
    }),
  });
  return {
    confirmationId: prepared.confirmationId,
    expiresAt: prepared.expiresAt,
    preview: {
      entityId: String(state.entity._id),
      departmentName: state.entity.name,
      managerName: requested.data.manager.name,
      managerTitle: requested.data.manager.role || '',
      mobileProvided: Boolean(String(requested.data.manager.mobile || '').trim()),
      sendInvite: wantsInvite(requested.data.manager),
      invitation: state.invitation,
    },
  };
}

export async function executeAssignManager({ tenantId, actorUserId, input, confirmationId, idempotencyKey, now }) {
  const requested = assignSchema.safeParse(businessInput(input));
  if (!requested.success) throw invalid();
  return executeMcpWrite({
    tenantId,
    actorUserId,
    operation: 'entities.assign_manager',
    payload: requested.data,
    confirmationId,
    idempotencyKey,
    now,
    authorize: async (actor) => {
      assertWriter(actor);
      await assignState(tenantId, requested.data);
    },
    validate: async () => requested.data,
    resourceState: async () => {
      const current = await assignState(tenantId, requested.data);
      return {
        entityId: String(current.entity._id),
        managerEmail: normalizeName(current.entity.managerEmail),
        updatedAt: new Date(current.entity.updatedAt).toISOString(),
      };
    },
    reconcile: async () => {
      const entity = await Entity.findOne({ _id: requested.data.entityId, tenantId });
      if (!entity) return { outcome: 'uncertain' };
      if (!sameManager(entity, requested.data.manager)) return { outcome: 'absent' };
      return {
        outcome: 'completed',
        result: {
          entityId: String(entity._id),
          departmentName: entity.name,
          managerName: entity.managerName || '',
          managerTitle: entity.managerTitle || '',
          invitePending: Boolean(entity.managerInvitePending),
        },
      };
    },
    execute: async (actor) => {
      const current = await Entity.findOne({ _id: requested.data.entityId, tenantId });
      if (!current) throw new NotFoundError('Department not found');
      const entity = await ensureManager({
        tenantId,
        entity: current,
        manager: requested.data.manager,
        userId: actor.user.userId,
      });
      await writeAudit({
        tenantId,
        req: { tenantId, user: { userId: actor.user.userId, role: actor.user.role } },
        action: 'entities.assign_manager',
        entityType: 'Entity',
        entityId: entity._id,
        after: { departmentName: entity.name, invitePending: Boolean(entity.managerInvitePending) },
      });
      return {
        entityId: String(entity._id),
        departmentName: entity.name,
        managerName: entity.managerName || '',
        managerTitle: entity.managerTitle || '',
        invitePending: Boolean(entity.managerInvitePending),
      };
    },
  });
}

export async function prepareEntitySetupForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return prepareEntitySetup({ tenantId: caller.tenantId, actorUserId: caller.user.userId, input: args });
}

export async function executeEntitySetupForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return executeEntitySetup({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
    confirmationId: args?.confirmationId,
    idempotencyKey: args?.idempotencyKey,
  });
}

export async function prepareAssignManagerForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return prepareAssignManager({ tenantId: caller.tenantId, actorUserId: caller.user.userId, input: args });
}

export async function executeAssignManagerForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return executeAssignManager({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
    confirmationId: args?.confirmationId,
    idempotencyKey: args?.idempotencyKey,
  });
}

export function entitiesSetupText(output) {
  const preview = output?.preview;
  if (preview?.departments) {
    const names = preview.departments.map((department) => `${department.name} (${department.managerTitle || 'no title'}) ${department.budget} INR`).join(', ');
    return `Total ${preview.totalAllocation} INR. ${names}. Confirm this preview before it expires.`;
  }
  const names = (output?.departments || []).map((department) => department.name).join(', ');
  return `Departments saved: ${names}. Wallet allocated ${output?.allocatedAmount ?? 0} INR.`;
}

export function entitiesAssignText(output) {
  if (output?.preview) {
    return `${output.preview.departmentName}: manager ${output.preview.managerName}. Confirm this preview before it expires.`;
  }
  return `${output?.departmentName || 'Department'} manager saved.`;
}

const SETUP_ERRORS = {
  FORBIDDEN: 'You cannot set up departments.',
  NOT_FOUND: 'That wallet or department was not found.',
  VALIDATION: 'Department details are not valid.',
  CONFLICT: 'That email cannot be used for this department.',
  ROLE_CONFLICT: 'That email belongs to a user who cannot be assigned as a department manager.',
  MANAGER_ALREADY_ASSIGNED: 'This department already has a different manager.',
  DEPARTMENT_ALREADY_FUNDED: 'This department already has a different budget.',
  DEPARTMENT_SETUP_IN_PROGRESS: 'This department is already being created.',
  ALLOCATION_EXCEEDS_BALANCE: 'This allocation exceeds the unallocated wallet balance.',
  CONFIRMATION_EXPIRED: 'This preview has expired. Prepare the setup again.',
  CONFIRMATION_STALE: 'The wallet or department changed. Prepare the setup again.',
  CONFIRMATION_REUSED: 'This confirmation was already used.',
  CONFIRMATION_INVALID: 'This confirmation is not valid.',
  CONFIRMATION_MISMATCH: 'This confirmation does not match the request.',
  IDEMPOTENCY_PAYLOAD_MISMATCH: 'This idempotency key was used for a different setup.',
  IDEMPOTENT_REPLAY_IN_FLIGHT: 'This setup is already in progress.',
  IDEMPOTENCY_RECONCILIATION_REQUIRED: 'This setup needs to be checked before it can be retried.',
  ACTOR_INACTIVE: 'This account cannot set up departments.',
  TENANT_INACTIVE: 'This workspace cannot set up departments.',
};

export function entitiesSetupError(error, fallback) {
  return SETUP_ERRORS[error?.code] || fallback;
}
