import { z } from 'zod';
import { ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { getContactRead, searchContactsRead } from '../contacts/contacts.service.js';

export const EMPLOYEES_SEARCH_DESCRIPTION = [
  'Search the ShelfMerch employee directory for the signed-in workspace.',
  'Includes manual, CSV, Zoho People, and Merge contacts the caller is allowed to see.',
  'Company admins see the workspace directory. Entity managers see only their departments.',
  'Inactive Merge-linked employees are omitted.',
  'Search results do not include email addresses.',
].join(' ');

export const EMPLOYEES_GET_DESCRIPTION = [
  'Look up one ShelfMerch employee by contact id.',
  'Uses the same workspace and department rules as employees_search.',
  'Includes the work email. Inactive Merge-linked employees omitted from search are not returned.',
  'Phone, address, employee codes, dates, and HRIS ids are not returned.',
].join(' ');

const employeeSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  department: z.string(),
  designation: z.string(),
  role: z.string(),
  effectiveEmploymentStatus: z.string(),
});

export const employeesSearchInputSchema = z.object({
  query: z.string().trim().max(80).optional().describe('Name search. Omitted text matches every visible employee.'),
  department: z.string().trim().max(120).optional().describe('Department name. Matching is case-insensitive.'),
  page: z.number().int().min(1).max(10_000).optional().describe('1-based page number. Default 1.'),
  limit: z.number().int().min(1).max(25).optional().describe('Page size. Default 10, maximum 25.'),
});

export const employeesSearchOutputSchema = z.object({
  items: z.array(employeeSummarySchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export const employeesGetInputSchema = z.object({
  contactId: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{24}$/, 'contactId must be a contact id')
    .describe('Contact id from employees_search.'),
});

export const employeesGetOutputSchema = employeeSummarySchema.extend({
  email: z.string(),
});

export function employeeReaderFromContext(ctx) {
  const authInfo = ctx?.http?.authInfo ?? ctx?.authInfo;
  const extra = authInfo?.extra ?? {};
  return {
    tenantId: extra.tenantId || null,
    user: {
      userId: extra.userId || null,
      role: extra.role,
      scopeType: extra.scopeType ?? null,
      scopeId: extra.scopeId ?? null,
      assignedEntityIds: Array.isArray(extra.assignedEntityIds) ? extra.assignedEntityIds.map(String) : [],
    },
  };
}

function readerOrThrow(ctx) {
  const reader = employeeReaderFromContext(ctx);
  if (!reader.tenantId) throw new ForbiddenError('Employees are not available for this account');
  return reader;
}

export async function searchEmployeesForCaller(ctx, args) {
  const reader = readerOrThrow(ctx);
  return searchContactsRead({
    tenantId: reader.tenantId,
    user: reader.user,
    query: args ?? {},
  });
}

export async function getEmployeeForCaller(ctx, contactId) {
  const reader = readerOrThrow(ctx);
  return getContactRead({
    tenantId: reader.tenantId,
    user: reader.user,
    contactId,
  });
}

export function employeesSearchText(output) {
  const { items, pagination } = output;
  const header = `Employees. Page ${pagination.page} of ${pagination.totalPages} (${pagination.total} total).`;
  if (!items.length) return `${header}\nNo matching employees.`;
  const lines = items.map(
    (employee) =>
      `${employee.name} [${employee.department}] ${employee.designation} ${employee.role} ${employee.effectiveEmploymentStatus}`,
  );
  return [header, ...lines].join('\n');
}

export function employeeDetailText(employee) {
  return [
    'Employee.',
    `${employee.name} [${employee.department}] ${employee.designation} ${employee.role} ${employee.effectiveEmploymentStatus}`,
    employee.email,
  ].join('\n');
}

export function employeeToolError(err, fallback) {
  if (err instanceof NotFoundError) return 'Employee not found.';
  if (err instanceof ForbiddenError) return err.message;
  return fallback;
}
