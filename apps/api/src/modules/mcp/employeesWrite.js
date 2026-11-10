import { z } from 'zod';
import { ApiError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { writeAudit } from '../../services/audit.service.js';
import { managedEntityNamesForUserRead } from '../entities/entities.service.js';
import {
  assertContactAccess,
  createOrRestoreContact,
  getContactOrThrow,
  prepareContactPayloadForUser,
  updateContact,
} from '../contacts/contacts.service.js';
import { Contact } from '../contacts/contact.model.js';
import { employeeReaderFromContext } from './employeesRead.js';
import { executeMcpWrite, prepareMcpWrite } from './mcpWriteSafety.js';

const CONTACT_ROLES = ['Owner', 'Admin', 'Sender', 'Member', 'Non-Member'];
const WRITE_ROLES = new Set(rolesForTenantArea('contacts', 'write'));

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  department: z.string().trim().max(120).optional(),
  role: z.enum(CONTACT_ROLES).optional(),
});

const updateSchema = z.object({
  contactId: z.string().trim().regex(/^[a-fA-F0-9]{24}$/),
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(200).optional(),
  department: z.string().trim().max(120).optional(),
  role: z.enum(CONTACT_ROLES).optional(),
});

export const EMPLOYEES_PREPARE_CREATE_DESCRIPTION = [
  'Prepare a new ShelfMerch employee without saving the contact.',
  'Checks the name, work email, department, and whether this role may create employees.',
  'Company admins can choose a role. Department managers can add people only in their departments, and only as Member.',
  'A soft-deleted contact with the same email is restored when the confirmation is executed.',
  'Phone, address, employee codes, and HRIS ids are not accepted.',
  'The preview includes the work email so the caller can confirm the person. Audit summaries do not store it.',
  'Returns a one-use confirmation. Saving requires employees_execute_create.',
].join(' ');

export const EMPLOYEES_EXECUTE_CREATE_DESCRIPTION = [
  'Create or restore the employee from employees_prepare_create.',
  'Requires the confirmation id and an idempotency key.',
  'Rechecks the caller, department, and email before writing.',
  'The same idempotency key returns the original result, including the same work email.',
  'The work email is returned because it identifies the employee. Phone, address, tokens, and payment data stay redacted. Audit summaries do not store the email.',
].join(' ');

export const EMPLOYEES_PREPARE_UPDATE_DESCRIPTION = [
  'Prepare an employee name, work email, department, or role change without saving it.',
  'Company admins can change those fields. Department managers can rename people in their departments and cannot change roles or move them to another department.',
  'The confirmation is bound to the current employee record and expires.',
  'Phone, address, employee codes, and HRIS ids are not accepted or returned.',
  'The preview includes the work email. Audit summaries do not store it.',
].join(' ');

export const EMPLOYEES_EXECUTE_UPDATE_DESCRIPTION = [
  'Apply the employee change from employees_prepare_update.',
  'Requires the confirmation id and an idempotency key.',
  'Rechecks permissions and the employee record before writing.',
  'A changed record, an expired confirmation, or a repeated confirmation is rejected.',
  'The replay returns the same work email. Audit summaries do not store it.',
].join(' ');

const employeeResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  department: z.string(),
  role: z.string(),
  restored: z.boolean(),
});

export const employeesPrepareCreateInputSchema = createSchema;
export const employeesExecuteCreateInputSchema = createSchema.extend({
  confirmationId: z.string().trim().min(20).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
});
export const employeesPrepareCreateOutputSchema = z.object({
  confirmationId: z.string(),
  expiresAt: z.string(),
  preview: z.object({
    action: z.enum(['create', 'restore']),
    name: z.string(),
    email: z.string(),
    department: z.string(),
    role: z.string(),
    contactId: z.string().optional(),
  }),
});
export const employeesExecuteCreateOutputSchema = employeeResultSchema;

function hasEmployeeUpdate(value) {
  return ['name', 'email', 'department', 'role'].some((field) => value[field] !== undefined);
}

export const employeesPrepareUpdateInputSchema = updateSchema.refine(hasEmployeeUpdate, {
  message: 'Employee details are not valid',
});
// Use extend, not and: Zod and() becomes JSON Schema allOf with
// additionalProperties:false on each half, so ChatGPT rejects confirmationId.
export const employeesExecuteUpdateInputSchema = updateSchema.extend({
  confirmationId: z.string().trim().min(20).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
}).refine(hasEmployeeUpdate, {
  message: 'Employee details are not valid',
});
export const employeesPrepareUpdateOutputSchema = z.object({
  confirmationId: z.string(),
  expiresAt: z.string(),
  preview: z.object({
    contactId: z.string(),
    version: z.string(),
    changes: z.array(z.object({ field: z.string(), from: z.string(), to: z.string() })),
    employee: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      department: z.string(),
      role: z.string(),
    }),
  }),
});
export const employeesExecuteUpdateOutputSchema = employeeResultSchema;

function invalidDetails() {
  return new ApiError(400, 'Employee details are not valid', 'VALIDATION');
}

function parseCreate(input) {
  const parsed = createSchema.safeParse(input ?? {});
  if (!parsed.success) throw invalidDetails();
  return {
    name: parsed.data.name.trim(),
    email: parsed.data.email.trim().toLowerCase(),
    department: (parsed.data.department ?? '').trim(),
    role: parsed.data.role,
  };
}

function parseUpdate(input) {
  const parsed = updateSchema.safeParse(input ?? {});
  if (!parsed.success) throw invalidDetails();
  const fields = ['name', 'email', 'department', 'role'].filter((field) => parsed.data[field] !== undefined);
  if (!fields.length) throw invalidDetails();
  return {
    contactId: parsed.data.contactId,
    ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
    ...(parsed.data.email !== undefined ? { email: parsed.data.email.trim().toLowerCase() } : {}),
    ...(parsed.data.department !== undefined ? { department: parsed.data.department.trim() } : {}),
    ...(parsed.data.role !== undefined ? { role: parsed.data.role } : {}),
  };
}

function canonicalCreate(requested) {
  return {
    name: requested.name,
    email: requested.email,
    department: requested.department,
    role: requested.role ?? 'Member',
  };
}

function canonicalUpdate(requested) {
  return {
    contactId: requested.contactId,
    ...(requested.name !== undefined ? { name: requested.name } : {}),
    ...(requested.email !== undefined ? { email: requested.email } : {}),
    ...(requested.department !== undefined ? { department: requested.department } : {}),
    ...(requested.role !== undefined ? { role: requested.role } : {}),
  };
}

function isManager(user) {
  return user?.role === 'entity_manager' || user?.scopeType === 'entity';
}

function assertEmployeeWriter(actor) {
  if (!WRITE_ROLES.has(actor?.user?.role)) {
    throw new ForbiddenError('Employee changes require a company admin or department manager');
  }
}

function assertManagerRole(user, requestedRole, currentRole) {
  if (!isManager(user) || requestedRole == null) return;
  if (requestedRole !== currentRole) {
    throw new ApiError(403, 'Department managers cannot change employee roles', 'ROLE_CHANGE_FORBIDDEN');
  }
}

async function resolveDepartment(tenantId, user, requested, existingDepartment = '') {
  const names = await managedEntityNamesForUserRead({ tenantId, user });
  if (names === null) {
    return requested === undefined ? String(existingDepartment || '') : String(requested).trim();
  }
  if (!names.length) throw new ForbiddenError('No managed department assigned');
  const raw = String(requested || existingDepartment || names[0]).trim();
  const match = names.find((name) => name.toLowerCase() === raw.toLowerCase());
  if (!match) {
    throw new ApiError(403, 'Department must match one of your managed departments', 'DEPARTMENT_SCOPE');
  }
  return match;
}

async function createResourceState(tenantId, email) {
  const existing = await Contact.findOne({ tenantId, email }).setOptions({ includeDeleted: true });
  if (!existing) return { action: 'create' };
  if (!existing.deletedAt) throw new ConflictError('A contact with this email already exists');
  return {
    action: 'restore',
    contactId: String(existing._id),
    updatedAt: new Date(existing.updatedAt).toISOString(),
    deletedAt: new Date(existing.deletedAt).toISOString(),
  };
}

function safeAudit(contact) {
  return {
    name: contact.name,
    department: contact.department || '',
    role: contact.role,
  };
}

function safeEmployee(contact, extra = {}) {
  return {
    id: String(contact._id),
    name: contact.name,
    email: contact.email,
    department: contact.department || '',
    role: contact.role,
    ...extra,
  };
}

async function loadEmployee(tenantId, contactId) {
  try {
    return await getContactOrThrow({ tenantId, contactId });
  } catch (error) {
    if (error instanceof NotFoundError) throw new NotFoundError('Employee not found');
    throw error;
  }
}

function employeeChanges(current, next) {
  return ['name', 'email', 'department', 'role']
    .filter((field) => String(current[field] || '') !== String(next[field] || ''))
    .map((field) => ({ field, from: String(current[field] || ''), to: String(next[field] || '') }));
}

async function planUpdate(tenantId, user, requested, { requireChange = true } = {}) {
  const contact = await loadEmployee(tenantId, requested.contactId);
  await assertContactAccess({ tenantId, user, contact });
  assertManagerRole(user, requested.role, contact.role);
  const department = await resolveDepartment(
    tenantId,
    user,
    requested.department,
    contact.department,
  );
  if (requested.email && requested.email !== contact.email) {
    const other = await Contact.findOne({ tenantId, email: requested.email }).setOptions({ includeDeleted: true });
    if (other && !other.deletedAt && String(other._id) !== String(contact._id)) {
      throw new ConflictError('A contact with this email already exists');
    }
  }
  const next = {
    name: requested.name ?? contact.name,
    email: requested.email ?? contact.email,
    department,
    role: isManager(user) ? contact.role : (requested.role ?? contact.role),
  };
  const changes = employeeChanges(contact, next);
  if (requireChange && !changes.length) throw invalidDetails();
  return { contact, next, changes };
}

function resourceVersion(contact) {
  return {
    contactId: String(contact._id),
    name: contact.name,
    email: contact.email,
    department: contact.department || '',
    role: contact.role,
    updatedAt: new Date(contact.updatedAt).toISOString(),
    deletedAt: contact.deletedAt ? new Date(contact.deletedAt).toISOString() : null,
  };
}

export async function prepareEmployeeCreate({ tenantId, actorUserId, input, now }) {
  const requested = parseCreate(input);
  const resolved = {};
  const prepared = await prepareMcpWrite({
    tenantId,
    actorUserId,
    operation: 'employees.create',
    payload: requested,
    now,
    authorize: async (actor) => {
      assertEmployeeWriter(actor);
      assertManagerRole(actor.user, requested.role, 'Member');
      resolved.department = await resolveDepartment(tenantId, actor.user, requested.department);
      resolved.role = isManager(actor.user) ? 'Member' : (requested.role || 'Member');
    },
    validate: async () => canonicalCreate(requested),
    resourceState: async () => createResourceState(tenantId, requested.email),
    summary: async () => ({
      action: 'preview',
      name: requested.name,
      department: resolved.department,
      role: resolved.role,
    }),
  });
  const state = await createResourceState(tenantId, requested.email);
  return {
    confirmationId: prepared.confirmationId,
    expiresAt: prepared.expiresAt,
    preview: {
      action: state.action,
      name: requested.name,
      email: requested.email,
      department: resolved.department,
      role: resolved.role,
      ...(state.contactId ? { contactId: state.contactId } : {}),
    },
  };
}

export async function executeEmployeeCreate({
  tenantId,
  actorUserId,
  input,
  confirmationId,
  idempotencyKey,
  now,
}) {
  const requested = parseCreate(input);
  const result = await executeMcpWrite({
    tenantId,
    actorUserId,
    operation: 'employees.create',
    payload: requested,
    confirmationId,
    idempotencyKey,
    now,
    authorize: async (actor) => {
      assertEmployeeWriter(actor);
      assertManagerRole(actor.user, requested.role, 'Member');
      await resolveDepartment(tenantId, actor.user, requested.department);
    },
    validate: async () => canonicalCreate(requested),
    resourceState: async () => createResourceState(tenantId, requested.email),
    reconcile: async () => {
      const contact = await Contact.findOne({ tenantId, email: requested.email }).setOptions({ includeDeleted: true });
      if (!contact || contact.deletedAt) return { outcome: 'absent' };
      return { outcome: 'completed', result: safeEmployee(contact, { restored: false }) };
    },
    execute: async (actor) => {
      const department = await resolveDepartment(tenantId, actor.user, requested.department);
      const role = isManager(actor.user) ? 'Member' : (requested.role || 'Member');
      const prior = await Contact.findOne({ tenantId, email: requested.email }).setOptions({ includeDeleted: true });
      const payload = await prepareContactPayloadForUser({
        tenantId,
        user: actor.user,
        body: { name: requested.name, email: requested.email, department, role },
      });
      const contact = await createOrRestoreContact({ tenantId, payload, source: 'manual' });
      await writeAudit({
        tenantId,
        req: { tenantId, user: { userId: actor.user.userId, role: actor.user.role } },
        action: 'contact.create',
        entityType: 'Contact',
        entityId: contact._id,
        after: safeAudit(contact),
      });
      return safeEmployee(contact, { restored: Boolean(prior?.deletedAt) });
    },
  });
  if (result?.email && result?.id) return result;
  const contact = await Contact.findOne({ _id: result.contactId || result.id, tenantId });
  return safeEmployee(contact, { restored: Boolean(result.restored) });
}

export async function prepareEmployeeUpdate({ tenantId, actorUserId, input, now }) {
  const requested = parseUpdate(input);
  const planned = {};
  const prepared = await prepareMcpWrite({
    tenantId,
    actorUserId,
    operation: 'employees.update',
    payload: requested,
    now,
    authorize: async (actor) => {
      assertEmployeeWriter(actor);
      planned.detail = await planUpdate(tenantId, actor.user, requested);
    },
    validate: async () => canonicalUpdate(requested),
    resourceState: async () => resourceVersion(await loadEmployee(tenantId, requested.contactId)),
    summary: async () => ({
      action: 'preview',
      contactId: requested.contactId,
      changes: planned.detail.changes.map((change) => change.field),
    }),
  });
  const detail = planned.detail;
  return {
    confirmationId: prepared.confirmationId,
    expiresAt: prepared.expiresAt,
    preview: {
      contactId: String(detail.contact._id),
      version: new Date(detail.contact.updatedAt).toISOString(),
      changes: detail.changes,
      employee: {
        id: String(detail.contact._id),
        name: detail.next.name,
        email: detail.next.email,
        department: detail.next.department,
        role: detail.next.role,
      },
    },
  };
}

export async function executeEmployeeUpdate({
  tenantId,
  actorUserId,
  input,
  confirmationId,
  idempotencyKey,
  now,
}) {
  const requested = parseUpdate(input);
  const result = await executeMcpWrite({
    tenantId,
    actorUserId,
    operation: 'employees.update',
    payload: requested,
    confirmationId,
    idempotencyKey,
    now,
    authorize: async (actor) => {
      assertEmployeeWriter(actor);
      await planUpdate(tenantId, actor.user, requested, { requireChange: false });
    },
    validate: async () => canonicalUpdate(requested),
    resourceState: async () => resourceVersion(await loadEmployee(tenantId, requested.contactId)),
    reconcile: async () => {
      const contact = await Contact.findOne({ _id: requested.contactId, tenantId });
      if (!contact) return { outcome: 'uncertain' };
      const matches = (requested.name === undefined || contact.name === requested.name)
        && (requested.email === undefined || contact.email === requested.email)
        && (requested.department === undefined || contact.department === requested.department)
        && (requested.role === undefined || contact.role === requested.role);
      if (!matches) return { outcome: 'absent' };
      return { outcome: 'completed', result: safeEmployee(contact, { restored: false }) };
    },
    execute: async (actor) => {
      const body = {};
      if (requested.name !== undefined) body.name = requested.name;
      if (requested.email !== undefined) body.email = requested.email;
      if (requested.department !== undefined) body.department = requested.department;
      if (requested.role !== undefined && !isManager(actor.user)) body.role = requested.role;
      const { contact, before } = await updateContact({
        tenantId,
        user: actor.user,
        contactId: requested.contactId,
        body,
      });
      await writeAudit({
        tenantId,
        req: { tenantId, user: { userId: actor.user.userId, role: actor.user.role } },
        action: 'contact.update',
        entityType: 'Contact',
        entityId: contact._id,
        before: safeAudit(before),
        after: safeAudit(contact),
      });
      return safeEmployee(contact, { restored: false });
    },
  });
  if (result?.email && result?.id) return result;
  const contact = await Contact.findOne({ _id: result.contactId || result.id, tenantId });
  return safeEmployee(contact, { restored: false });
}

function requireCaller(ctx) {
  const caller = employeeReaderFromContext(ctx);
  if (!caller.tenantId || !caller.user.userId) {
    throw new ForbiddenError('Employees are not available for this account');
  }
  return caller;
}

export async function prepareEmployeeCreateForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return prepareEmployeeCreate({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
  });
}

export async function executeEmployeeCreateForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return executeEmployeeCreate({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
    confirmationId: args?.confirmationId,
    idempotencyKey: args?.idempotencyKey,
  });
}

export async function prepareEmployeeUpdateForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return prepareEmployeeUpdate({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
  });
}

export async function executeEmployeeUpdateForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return executeEmployeeUpdate({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
    confirmationId: args?.confirmationId,
    idempotencyKey: args?.idempotencyKey,
  });
}

export function employeeWriteText(output, heading) {
  const employee = output.preview?.employee || output.preview || output;
  const lines = [
    heading,
    `${employee.name} <${employee.email}> [${employee.department}] ${employee.role}`,
  ];
  if (output.preview?.action) lines.push(`Action: ${output.preview.action}.`);
  if (output.preview?.changes?.length) {
    lines.push(
      ...output.preview.changes.map((change) => `${change.field}: ${change.from} -> ${change.to}`),
    );
  }
  if (output.confirmationId) lines.push('Confirm this preview before it expires.');
  return lines.join('\n');
}

const WRITE_ERRORS = {
  FORBIDDEN: 'You cannot change employees.',
  ROLE_CHANGE_FORBIDDEN: 'Department managers cannot change employee roles.',
  DEPARTMENT_SCOPE: 'That department is outside your managed departments.',
  CONFLICT: 'An employee with this email already exists.',
  NOT_FOUND: 'Employee not found.',
  VALIDATION: 'Employee details are not valid.',
  CONFIRMATION_STALE: 'This preview is out of date. Prepare the change again.',
  CONFIRMATION_EXPIRED: 'This confirmation has expired. Prepare the change again.',
  CONFIRMATION_REUSED: 'This confirmation was already used.',
  CONFIRMATION_INVALID: 'This confirmation is not valid.',
  CONFIRMATION_MISMATCH: 'This confirmation does not match the requested change.',
  IDEMPOTENCY_PAYLOAD_MISMATCH: 'This idempotency key was used for a different change.',
  IDEMPOTENT_REPLAY_IN_FLIGHT: 'This employee change is already in progress.',
  ACTOR_INACTIVE: 'This account cannot change employees.',
  TENANT_INACTIVE: 'This workspace cannot change employees.',
};

export function employeeWriteError(error, fallback) {
  return WRITE_ERRORS[error?.code] || fallback;
}
