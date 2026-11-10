/**
 * Dashboard Allocate Budget suggested departments (apps/web wallets types ORG_SUGG).
 * Kept in the API so MCP can distinguish suggestions from existing Entity rows
 * without inventing a separate catalog.
 */

export const SUGGESTED_DEPARTMENT_NAMES = [
  'Marketing',
  'Sales',
  'HR',
  'Admin',
  'Customer Success',
  'Engineering',
  'Finance',
  'Operations',
];

/** Matches apps/web ORG_ROLES quick-add manager titles. */
export const SUGGESTED_MANAGER_ROLES = [
  'Marketing Manager',
  'Sales Manager',
  'HR Manager',
  'Admin Manager',
  'Customer Success Manager',
  'Operations Manager',
];

/** Matches apps/web QUICK_ADD_DESCRIPTIONS (+ default copy for other suggestions). */
export const SUGGESTED_DEPARTMENT_DESCRIPTIONS = {
  Engineering: 'Team merchandise, hackathon kits and dev swag.',
  Finance: 'Audit, compliance and finance team merchandise.',
  Operations: 'Operational supplies and field team kits.',
};

export const DEFAULT_DEPARTMENT_DESCRIPTION = 'Department merchandise and campaigns.';

/** Matches apps/web ORG_FALLBACK palette used when creating departments. */
export const DEPARTMENT_COLOR_PALETTE = [
  '#35B5E5',
  '#DF4545',
  '#FFC329',
  '#30B87A',
  '#7657D6',
  '#1677FF',
];

/** Dashboard DepartmentModal default for expected users. */
export const DEFAULT_EXPECTED_USERS = 10;

export function normalizeDepartmentName(name) {
  return String(name || '').trim().toLowerCase();
}

export function defaultDescriptionFor(name) {
  const trimmed = String(name || '').trim();
  return SUGGESTED_DEPARTMENT_DESCRIPTIONS[trimmed] || DEFAULT_DEPARTMENT_DESCRIPTION;
}

export function suggestedManagerRoleFor(name) {
  const trimmed = String(name || '').trim();
  return SUGGESTED_MANAGER_ROLES.find((role) => role.startsWith(trimmed)) || '';
}

export function departmentPaletteColor(index) {
  const i = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  return DEPARTMENT_COLOR_PALETTE[i % DEPARTMENT_COLOR_PALETTE.length];
}

/**
 * @param {Iterable<string>} existingNames
 */
export function listSuggestedDepartments(existingNames = []) {
  const existing = new Set(
    [...existingNames].map((name) => normalizeDepartmentName(name)).filter(Boolean),
  );
  return SUGGESTED_DEPARTMENT_NAMES.map((name) => ({
    name,
    defaultDescription: defaultDescriptionFor(name),
    suggestedManagerRole: suggestedManagerRoleFor(name),
    alreadyExists: existing.has(normalizeDepartmentName(name)),
  }));
}