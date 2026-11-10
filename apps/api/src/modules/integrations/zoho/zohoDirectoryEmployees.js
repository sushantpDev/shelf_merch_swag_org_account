import { Contact } from '../../contacts/contact.model.js';
import { deriveEffectiveEmploymentStatus } from '../merge/effectiveEmploymentStatus.js';

export const ZOHO_DIRECTORY_PROVIDER = 'zoho-people';

/** Placeholder written when Zoho has an employee id and no work email. */
export function isSyntheticZohoEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase()
    .endsWith('@employees.local');
}

export function zohoIntegrationAsDirectoryConnection(integration) {
  if (!integration) return null;
  return {
    status: integration.status,
    lastSyncAt: integration.lastSyncedAt || null,
    lastSyncStatus: '',
    provider: ZOHO_DIRECTORY_PROVIDER,
  };
}

function compactAddress(address) {
  if (!address) return '';
  return [address.line1, address.line2, address.city, address.state, address.pincode]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * Map a Zoho-synced Workspace Contact into the employee directory row shape.
 * Does not read tokens. Country is omitted unless a street address was stored,
 * because new contacts default address.country to IN.
 */
export function toZohoDirectoryEmployee(contact, integration) {
  const address = compactAddress(contact.address);
  const derived = deriveEffectiveEmploymentStatus({
    employmentStatus: contact.employmentStatus,
    terminationDate: contact.terminationDate,
    startDate: contact.dateOfJoining,
  });
  const firstName = contact.firstName || '';
  const lastName = contact.lastName || '';
  const displayName =
    String(contact.name || '').trim() || `${firstName} ${lastName}`.trim() || 'Employee';

  return {
    id: String(contact._id),
    connectionId: String(integration._id),
    connectionStatus: integration.status || 'disconnected',
    provider: ZOHO_DIRECTORY_PROVIDER,
    mergeEmployeeId: '',
    displayName,
    firstName,
    lastName,
    workEmail: isSyntheticZohoEmail(contact.email) ? '' : contact.email || '',
    employmentStatus: contact.employmentStatus || '',
    effectiveEmploymentStatus: derived.effectiveEmploymentStatus,
    effectiveStatusSource: derived.effectiveStatusSource,
    jobTitle: contact.designation || '',
    employmentType: '',
    departmentName: contact.department || '',
    address,
    country: address ? contact.address?.country || '' : '',
    locationName: contact.workLocation || '',
    departmentMergeIds: [],
    locationMergeId: null,
    startDate: contact.dateOfJoining || null,
    terminationDate: contact.terminationDate || null,
    lastSyncedAt: contact.updatedAt || integration.lastSyncedAt || null,
    source: 'zoho-people',
  };
}

export function zohoContactDuplicatesMergeEmployee(contact, { emails, mergeEmployeeIds }) {
  const mergeEmployeeId = String(contact.mergeEmployeeId || '').trim();
  if (mergeEmployeeId && mergeEmployeeIds.has(mergeEmployeeId)) return true;
  const email = String(contact.email || '').trim().toLowerCase();
  if (email && !isSyntheticZohoEmail(email) && emails.has(email)) return true;
  return false;
}

/**
 * Zoho People employees already stored as Workspace Contacts for this tenant.
 * Manual and Merge-only contacts are excluded. Soft-deleted rows stay hidden.
 */
export async function listZohoDirectoryEmployees({
  tenantId,
  integration,
  excludeEmails = new Set(),
  excludeMergeEmployeeIds = new Set(),
  limit = 500,
}) {
  if (!integration) return [];
  const contacts = await Contact.find({
    tenantId,
    zohoRecordId: { $gt: '' },
  })
    .sort({ updatedAt: -1 })
    .limit(Math.min(Number(limit) || 500, 500))
    .lean();

  return contacts
    .filter(
      (contact) =>
        !zohoContactDuplicatesMergeEmployee(contact, {
          emails: excludeEmails,
          mergeEmployeeIds: excludeMergeEmployeeIds,
        }),
    )
    .map((contact) => toZohoDirectoryEmployee(contact, integration));
}
