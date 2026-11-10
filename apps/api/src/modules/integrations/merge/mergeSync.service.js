import { logger } from '../../../config/logger.js';
import { ApiError } from '../../../utils/errors.js';
import { decryptToken } from '../../../utils/tokenEncryption.js';
import { Contact } from '../../contacts/contact.model.js';
import {
  MERGE_FULL_RECONCILE_MS,
  MERGE_HRIS_EMPLOYEES_URL,
  MERGE_HRIS_EMPLOYMENTS_URL,
  MERGE_HRIS_GROUPS_URL,
  MERGE_HRIS_LOCATIONS_URL,
  MERGE_INCREMENTAL_OVERLAP_MS,
} from './merge.constants.js';
import { MergeHrisDepartment } from './models/mergeHrisDepartment.model.js';
import { MergeHrisLocation } from './models/mergeHrisLocation.model.js';
import { MergeHrisEmployee } from './models/mergeHrisEmployee.model.js';
import { MergeHrisEmployment } from './models/mergeHrisEmployment.model.js';
import { MergeConnection } from './mergeConnection.model.js';
import { mergePaginateEach, requireMergeConfigured } from './mergeHttp.js';
import {
  beginMergeSyncRun,
  finishMergeSyncRun,
  noteMergeSyncPage,
  noteMergeSyncRateLimit,
  touchMergeSyncRun,
  safeMergeSyncRunError,
} from './mergeSyncRun.service.js';
import { getOwnedMergeConnection } from './merge.service.js';
import {
  getMergeSyncStatus,
  isMergeModelSnapshotAuthoritative,
  isMergeModelSyncInProgress,
  mergeModelSyncLogFields,
  storedMergeModelSync,
} from './mergeSyncStatus.js';
import { deriveEffectiveEmploymentStatus } from './effectiveEmploymentStatus.js';
import { deriveHrisDirectoryStatus } from './hrisDirectoryStatus.js';
import { ZohoIntegration } from '../zoho/zohoIntegration.model.js';
import {
  listZohoDirectoryEmployees,
  zohoIntegrationAsDirectoryConnection,
} from '../zoho/zohoDirectoryEmployees.js';
import { isMergeSyncAttemptTerminal } from './mergeSyncErrors.js';
import {
  connectionStatusAfterSyncSuccess,
  scopeFailureChangesConnection,
} from './mergeConnectionState.js';
import {
  MERGE_SYNC_LOCK_LEASE_MS,
  MERGE_SYNC_LOCK_RENEW_EVERY_MS,
  acquireMergeSyncLock,
  assertMergeSyncLockOwned,
  completeMergeSyncLock,
  releaseMergeSyncLock,
  mergeSyncInProgressError,
  mergeSyncLockLostError,
  startMergeSyncLockHeartbeat,
} from './mergeSyncLock.js';

function emptyCounts() {
  return { created: 0, updated: 0, unchanged: 0, pruned: 0 };
}

function asDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function asString(value) {
  if (value == null) return '';
  return String(value).trim();
}

/** Normalize Merge employment_status for directory/HRIS (incl. Google suspended). */
export function normalizeMergeEmploymentStatus(value) {
  const raw = asString(value).toUpperCase().replace(/\s+/g, '_');
  if (!raw) return '';
  if (raw === 'ACTIVE' || raw === 'ENABLED') return 'ACTIVE';
  if (raw === 'SUSPENDED' || raw === 'DISABLED' || raw === 'SUSPEND') return 'SUSPENDED';
  if (raw === 'INACTIVE' || raw === 'ARCHIVED' || raw === 'DELETED' || raw === 'TERMINATED') {
    return 'INACTIVE';
  }
  if (raw === 'PENDING') return 'PENDING';
  return raw;
}


function titleCasePlace(value) {
  const raw = asString(value);
  if (!raw) return '';
  if (/^[A-Z]{2,3}$/.test(raw)) return raw;
  return raw
    .split(/\s+/)
    .map((part) => {
      if (/^\d/.test(part)) return part;
      if (/^[A-Z]{2,3}$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

const COUNTRY_LABELS = Object.freeze({
  IN: 'India',
  IND: 'India',
  AU: 'Australia',
  US: 'United States',
  USA: 'United States',
  GB: 'United Kingdom',
  UK: 'United Kingdom',
  CA: 'Canada',
  SG: 'Singapore',
  AE: 'United Arab Emirates',
  DE: 'Germany',
  NL: 'Netherlands',
});

const REGION_LABELS = Object.freeze({
  // India
  TG: 'Telangana',
  TS: 'Telangana',
  AP: 'Andhra Pradesh',
  KA: 'Karnataka',
  MH: 'Maharashtra',
  TN: 'Tamil Nadu',
  DL: 'Delhi',
  HR: 'Haryana',
  UP: 'Uttar Pradesh',
  GJ: 'Gujarat',
  RJ: 'Rajasthan',
  WB: 'West Bengal',
  KL: 'Kerala',
  // Australia
  NSW: 'New South Wales',
  VIC: 'Victoria',
  QLD: 'Queensland',
  SA: 'South Australia',
  WA: 'Western Australia',
  TAS: 'Tasmania',
  ACT: 'Australian Capital Territory',
  NT: 'Northern Territory',
});

function expandCountry(value) {
  const raw = asString(value);
  if (!raw) return '';
  const key = raw.toUpperCase();
  return COUNTRY_LABELS[key] || titleCasePlace(raw);
}

function expandRegion(value) {
  const raw = asString(value);
  if (!raw) return '';
  const key = raw.toUpperCase();
  return REGION_LABELS[key] || titleCasePlace(raw);
}

/**
 * Compact display address from a synced MergeHrisLocation.
 * Uses street/city when present; otherwise falls back to location name + region/country.
 */
export function formatHrisLocationAddress(loc) {
  if (!loc || typeof loc !== 'object') return '';
  const street1 = asString(loc.street1);
  const street2 = asString(loc.street2);
  const city = asString(loc.city);
  const placeName = titleCasePlace(loc.name);
  const state = expandRegion(loc.state);
  const zipCode = asString(loc.zipCode);
  const country = expandCountry(loc.country);

  const locality = titleCasePlace(city) || placeName;
  const street = [street1, street2].filter(Boolean).join(', ');
  const region = [state, zipCode].filter(Boolean).join(' ');

  const parts = [street, locality, region, country].filter(Boolean);
  // Deduplicate consecutive identical parts (e.g. name === city).
  const unique = [];
  for (const part of parts) {
    if (!unique.length || unique[unique.length - 1].toLowerCase() !== part.toLowerCase()) {
      unique.push(part);
    }
  }
  return unique.join(', ');
}

function arraysEqual(a = [], b = []) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function normalizeGroupType(row) {
  const type = String(row?.type || '').toUpperCase();
  if (type === 'DEPARTMENT') return 'DEPARTMENT';
  if (type === 'TEAM') return 'TEAM';
  if (row?.is_commonly_used_as_team === true && type !== 'DEPARTMENT') return 'TEAM';
  return 'UNKNOWN';
}

function buildDepartmentMergeIds({ groupIds, teamMergeId, groupTypeById }) {
  const dept = [];
  const team = [];
  const other = [];
  const seen = new Set();
  const pushUnique = (bucket, id) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    bucket.push(id);
  };
  for (const id of groupIds) {
    const groupType = groupTypeById.get(id) || 'UNKNOWN';
    if (groupType === 'DEPARTMENT') pushUnique(dept, id);
    else if (groupType === 'TEAM') pushUnique(team, id);
    else pushUnique(other, id);
  }
  const ordered = [...dept, ...team, ...other];
  if (teamMergeId && !seen.has(teamMergeId)) ordered.push(teamMergeId);
  return ordered;
}

function resolveOrgUnitName({ departmentMergeIds, departmentsById }) {
  const ids = Array.isArray(departmentMergeIds) ? departmentMergeIds : [];
  const pickNamed = (predicate) => {
    for (const id of ids) {
      const dept = departmentsById.get(id);
      if (!dept) continue;
      const name = asString(dept.name);
      if (!name) continue;
      if (!predicate || predicate(dept)) return name;
    }
    return '';
  };
  return (
    pickNamed((d) => (d.groupType || 'UNKNOWN') === 'DEPARTMENT') ||
    pickNamed((d) => (d.groupType || 'UNKNOWN') === 'TEAM') ||
    pickNamed()
  );
}

/**
 * Delete local Merge rows missing from a complete snapshot.
 * Incomplete / malformed snapshots never prune.
 * A complete empty snapshot (zero items) deletes all rows for this connection.
 * A complete snapshot with rows but zero usable ids does not prune.
 */
async function pruneByMergeIds({
  Model,
  tenantId,
  connectionId,
  mergeIdField,
  seenIds,
  snapshotComplete,
  allowPrune = false,
  rawItemCount,
  counts,
  logContext,
  assertLock,
}) {
  if (assertLock) await assertLock();
  if (!snapshotComplete) {
    counts.pruneSkippedReason = 'incomplete';
    logger.warn(
      { ...logContext, rawItemCount, seenCount: seenIds.length, pruneAllowed: false },
      'Merge snapshot incomplete — skipped prune',
    );
    return;
  }

  if (!allowPrune) {
    counts.pruneSkippedReason = 'merge_sync_not_ready';
    logger.warn(
      { ...logContext, rawItemCount, seenCount: seenIds.length, pruneAllowed: false },
      'Merge common model is not a complete successful sync — skipped prune',
    );
    return;
  }

  if (seenIds.length === 0) {
    if (rawItemCount > 0) {
      counts.pruneSkippedReason = 'no_usable_ids';
      logger.warn(
        { ...logContext, rawItemCount },
        'Merge snapshot had rows but no usable ids — skipped prune',
      );
      return;
    }
    const deleted = await Model.deleteMany({ tenantId, connectionId });
    counts.pruned = deleted?.deletedCount || 0;
    return;
  }

  const deleted = await Model.deleteMany({
    tenantId,
    connectionId,
    [mergeIdField]: { $nin: seenIds },
  });
  counts.pruned = deleted?.deletedCount || 0;
}

async function upsertByMergeId({
  Model,
  tenantId,
  connectionId,
  mergeIdField,
  mergeId,
  fields,
  counts,
}) {
  if (!mergeId) {
    return;
  }
  const existing = await Model.findOne({
    tenantId,
    connectionId,
    [mergeIdField]: mergeId,
  });

  if (!existing) {
    await Model.create({
      tenantId,
      connectionId,
      ...fields,
      [mergeIdField]: mergeId,
    });
    counts.created += 1;
    return;
  }

  let changed = false;
  for (const [key, value] of Object.entries(fields)) {
    // Always refresh sync timestamp without counting it as a data change.
    if (key === 'lastSyncedAt') {
      existing[key] = value;
      continue;
    }
    if (key === 'departmentMergeIds') {
      if (!arraysEqual(existing[key] || [], value || [])) {
        existing[key] = value;
        changed = true;
      }
      continue;
    }
    const prev = existing[key];
    const next = value;
    const same =
      prev instanceof Date || next instanceof Date
        ? String(prev || '') === String(next || '')
        : prev === next;
    if (!same) {
      existing[key] = next;
      changed = true;
    }
  }

  if (changed) {
    await existing.save();
    counts.updated += 1;
  } else {
    await existing.save();
    counts.unchanged += 1;
  }
}

/**
 * manual/initial always pull every page.
 * webhook/scheduled stay incremental until the last full import is 24h old,
 * or until this connection has never completed a full import.
 */
export function resolveMergeSyncMode({ reason = 'manual', lastFullSyncAt, now = new Date() } = {}) {
  if (reason !== 'webhook' && reason !== 'scheduled') return 'full';
  if (!lastFullSyncAt) return 'full';
  const age = now.getTime() - new Date(lastFullSyncAt).getTime();
  if (!Number.isFinite(age) || age >= MERGE_FULL_RECONCILE_MS) return 'full';
  return 'incremental';
}

/** Stored boundary minus the overlap. Null means this model has no cursor yet. */
export function effectiveModifiedAfter(watermark, overlapMs = MERGE_INCREMENTAL_OVERLAP_MS) {
  if (!watermark) return null;
  const at = new Date(watermark).getTime();
  if (!Number.isFinite(at)) return null;
  return new Date(at - overlapMs);
}

function cursorUpdates(cursors) {
  const fields = {};
  for (const [key, value] of Object.entries(cursors || {})) {
    if (value) fields[`mergeSyncCursors.${key}`] = value;
  }
  return fields;
}

function describeModel(counts) {
  return {
    mode: counts?.mode || 'full',
    processed: counts?.processed || 0,
    fallback: counts?.fallback || null,
  };
}

function valuesEqual(key, prev, next) {
  if (key === 'departmentMergeIds') return arraysEqual(prev || [], next || []);
  if (prev instanceof Date || next instanceof Date) return String(prev || '') === String(next || '');
  return prev === next;
}

/**
 * One page, one bulkWrite. created/updated/unchanged match the previous per-row upsert.
 * lastSyncedAt is refreshed without counting as a data change.
 */
async function bulkUpsertPage({ Model, tenantId, connectionId, mergeIdField, rows, counts }) {
  const usable = rows.filter((row) => row?.mergeId);
  if (!usable.length) return;
  const existing = await Model.find({
    tenantId,
    connectionId,
    [mergeIdField]: { $in: usable.map((row) => row.mergeId) },
  });
  const byId = new Map(existing.map((doc) => [doc[mergeIdField], doc]));
  const ops = [];
  for (const row of usable) {
    const prev = byId.get(row.mergeId);
    if (!prev) {
      counts.created += 1;
      ops.push({
        insertOne: {
          document: {
            tenantId,
            connectionId,
            [mergeIdField]: row.mergeId,
            ...row.fields,
          },
        },
      });
      continue;
    }
    const $set = {};
    let changed = false;
    for (const [key, value] of Object.entries(row.fields)) {
      if (key === 'lastSyncedAt') {
        $set[key] = value;
        continue;
      }
      if (!valuesEqual(key, prev[key], value)) {
        $set[key] = value;
        changed = true;
      }
    }
    if (changed) counts.updated += 1;
    else counts.unchanged += 1;
    if (Object.keys($set).length) {
      ops.push({
        updateOne: {
          filter: { _id: prev._id, tenantId },
          update: { $set },
        },
      });
    }
  }
  if (ops.length) await Model.bulkWrite(ops, { ordered: true });
}

/**
 * Page-at-a-time Merge read. The cursor is used only inside this walk.
 * A rejected modified_after restarts that model from page 1 without the filter.
 */
async function walkMergeModel({
  url,
  accountToken,
  query,
  logContext,
  modifiedAfter,
  onPage,
  onRateLimit,
  onRestart,
}) {
  const once = async (after) => {
    const pageQuery = after instanceof Date ? { ...query, modified_after: after.toISOString() } : { ...query };
    return mergePaginateEach(url, {
      accountToken,
      query: pageQuery,
      logContext,
      onRateLimit,
      onPage,
    });
  };
  if (!(modifiedAfter instanceof Date)) {
    const snapshot = await once(null);
    return { ...snapshot, mode: 'full', fallback: null };
  }
  try {
    const snapshot = await once(modifiedAfter);
    return { ...snapshot, mode: 'incremental', fallback: null };
  } catch (err) {
    if (err?.code !== 'MERGE_REQUEST_REJECTED') throw err;
    logger.warn(
      { ...logContext, code: err.code, event: 'merge_modified_after_rejected' },
      'merge_modified_after_rejected',
    );
    // Earlier incremental pages may already be upserted. Restart the model
    // from page 1 and drop in-memory id lists so prune sees only the full walk.
    onRestart?.();
    const snapshot = await once(null);
    return { ...snapshot, mode: 'full', fallback: 'modified_after_rejected' };
  }
}

async function syncDepartments({
  tenantId,
  connection,
  accountToken,
  now,
  modifiedAfter = null,
  onPageDone,
  onRateLimit,
}) {
  const counts = emptyCounts();
  const logContext = {
    organizationId: String(tenantId),
    connectionId: String(connection._id),
    model: 'group',
  };
  let pages = 0;
  let records = 0;
  const walked = await walkMergeModel({
    url: MERGE_HRIS_GROUPS_URL,
    accountToken,
    query: { page_size: 100 },
    logContext,
    modifiedAfter,
    onRateLimit,
    onRestart: () => {
      pages = 0;
      records = 0;
    },
    onPage: async (rows) => {
      const prepared = [];
      for (const row of rows) {
        const mergeId = asString(row?.id);
        if (!mergeId) continue;
        prepared.push({
          mergeId,
          fields: {
            provider: connection.provider,
            remoteId: asString(row.remote_id),
            name: asString(row.name),
            groupType: normalizeGroupType(row),
            parentDepartmentMergeId: asString(row.parent_group),
            lastSyncedAt: now,
            source: 'merge',
          },
        });
      }
      await bulkUpsertPage({
        Model: MergeHrisDepartment,
        tenantId,
        connectionId: connection._id,
        mergeIdField: 'mergeDepartmentId',
        rows: prepared,
        counts,
      });
      pages += 1;
      records += rows.length;
      await onPageDone?.({ pagesProcessed: pages, recordsProcessed: records });
    },
  });
  counts.mode = walked.mode;
  counts.fallback = walked.fallback;
  counts.processed = records;
  counts.fetchComplete = Boolean(walked.complete);
  return counts;
}

async function syncLocations({
  tenantId,
  connection,
  accountToken,
  now,
  modifiedAfter = null,
  onPageDone,
  onRateLimit,
}) {
  const counts = emptyCounts();
  const logContext = {
    organizationId: String(tenantId),
    connectionId: String(connection._id),
    model: 'location',
  };
  let pages = 0;
  let records = 0;
  const walked = await walkMergeModel({
    url: MERGE_HRIS_LOCATIONS_URL,
    accountToken,
    query: { page_size: 100 },
    logContext,
    modifiedAfter,
    onRateLimit,
    onRestart: () => {
      pages = 0;
      records = 0;
    },
    onPage: async (rows) => {
      const prepared = [];
      for (const row of rows) {
        const mergeId = asString(row?.id);
        if (!mergeId) continue;
        prepared.push({
          mergeId,
          fields: {
            provider: connection.provider,
            remoteId: asString(row.remote_id),
            name: asString(row.name),
            street1: asString(row.street_1),
            street2: asString(row.street_2),
            city: asString(row.city),
            state: asString(row.state),
            zipCode: asString(row.zip_code),
            country: asString(row.country),
            lastSyncedAt: now,
            source: 'merge',
          },
        });
      }
      await bulkUpsertPage({
        Model: MergeHrisLocation,
        tenantId,
        connectionId: connection._id,
        mergeIdField: 'mergeLocationId',
        rows: prepared,
        counts,
      });
      pages += 1;
      records += rows.length;
      await onPageDone?.({ pagesProcessed: pages, recordsProcessed: records });
    },
  });
  counts.mode = walked.mode;
  counts.fallback = walked.fallback;
  counts.processed = records;
  counts.fetchComplete = Boolean(walked.complete);
  return counts;
}

async function syncEmployees({
  tenantId,
  connection,
  accountToken,
  now,
  groupTypeById,
  assertLock,
  allowPrune = false,
  modifiedAfter = null,
  onPageDone,
  onRateLimit,
  onEmployeesWritten,
}) {
  const counts = emptyCounts();
  const logContext = {
    organizationId: String(tenantId),
    connectionId: String(connection._id),
    model: 'employee',
  };
  const seenMergeEmployeeIds = [];
  let pages = 0;
  let records = 0;
  const walked = await walkMergeModel({
    url: MERGE_HRIS_EMPLOYEES_URL,
    accountToken,
    query: { page_size: 100, expand: 'team' },
    logContext,
    modifiedAfter,
    onRateLimit,
    onRestart: () => {
      pages = 0;
      records = 0;
      seenMergeEmployeeIds.length = 0;
    },
    onPage: async (pageRows) => {
      const prepared = [];
      const pageIds = [];
      for (const row of pageRows) {
    const mergeId = asString(row?.id);
    if (!mergeId) continue;
    pageIds.push(mergeId);

    const groupIds = Array.isArray(row.groups)
      ? row.groups.map((g) => (typeof g === 'object' && g ? asString(g.id) : asString(g))).filter(Boolean)
      : [];

    let teamMergeId = '';
    let teamName = '';
    if (row?.team && typeof row.team === 'object') {
      teamMergeId = asString(row.team.id);
      teamName = asString(row.team.name);
    } else {
      teamMergeId = asString(row.team);
    }

    if (teamMergeId && teamName && !groupTypeById.has(teamMergeId)) {
      await upsertByMergeId({
        Model: MergeHrisDepartment,
        tenantId,
        connectionId: connection._id,
        mergeIdField: 'mergeDepartmentId',
        mergeId: teamMergeId,
        counts: emptyCounts(),
        fields: {
          provider: connection.provider,
          remoteId: '',
          name: teamName,
          groupType: 'TEAM',
          parentDepartmentMergeId: '',
          lastSyncedAt: now,
          source: 'merge',
        },
      });
      groupTypeById.set(teamMergeId, 'TEAM');
    }

    const knownGroupIds = groupIds.filter((id) => groupTypeById.has(id));
    const departmentMergeIds = buildDepartmentMergeIds({
      groupIds: knownGroupIds,
      teamMergeId,
      groupTypeById,
    });

    prepared.push({
      mergeId,
      fields: {
        provider: connection.provider,
        remoteEmployeeId: asString(row.remote_id),
        firstName: asString(row.first_name),
        lastName: asString(row.last_name),
        displayName: asString(row.display_full_name || row.preferred_name),
        workEmail: asString(row.work_email).toLowerCase(),
        personalEmail: asString(row.personal_email).toLowerCase(),
        mobilePhoneNumber: asString(row.mobile_phone_number),
        employmentStatus: normalizeMergeEmploymentStatus(row.employment_status),
        managerMergeEmployeeId: asString(row.manager),
        departmentMergeIds,
        locationMergeId: asString(row.work_location || row.home_location),
        startDate: asDate(row.start_date || row.hire_date),
        terminationDate: asDate(row.termination_date),
        rawModifiedAt: asDate(row.modified_at),
        lastSyncedAt: now,
        source: 'merge',
      },
    });
      }
      await bulkUpsertPage({
        Model: MergeHrisEmployee,
        tenantId,
        connectionId: connection._id,
        mergeIdField: 'mergeEmployeeId',
        rows: prepared,
        counts,
      });
      seenMergeEmployeeIds.push(...pageIds);
      pages += 1;
      records += pageRows.length;
      await onPageDone?.({ pagesProcessed: pages, recordsProcessed: records });
      if (onEmployeesWritten && pageIds.length) await onEmployeesWritten(pageIds);
    },
  });
  const pruneThisSnapshot = allowPrune && walked.mode === 'full' && !walked.fallback;
  counts.mode = walked.mode;
  counts.fallback = walked.fallback;
  counts.processed = records;
  counts.fetchComplete = Boolean(walked.complete);

  await pruneByMergeIds({
    Model: MergeHrisEmployee,
    tenantId,
    connectionId: connection._id,
    mergeIdField: 'mergeEmployeeId',
    seenIds: seenMergeEmployeeIds,
    snapshotComplete: walked.complete,
    allowPrune: pruneThisSnapshot,
    rawItemCount: records,
    counts,
    logContext,
    assertLock,
  });

  if (counts.pruneSkippedReason) {
    // Directory hides rows with lastSyncedAt older than connection.lastSyncAt.
    // Skipped prunes must not make kept employees disappear from the list.
    await MergeHrisEmployee.updateMany(
      { tenantId, connectionId: connection._id },
      { $set: { lastSyncedAt: now } },
    );
  }

  counts.snapshotComplete = Boolean(walked.complete && !counts.pruneSkippedReason);
  counts.seenIds = seenMergeEmployeeIds;
  return counts;
}

async function syncEmployments({
  tenantId,
  connection,
  accountToken,
  now,
  assertLock,
  allowPrune = false,
  modifiedAfter = null,
  onPageDone,
  onRateLimit,
}) {
  const counts = emptyCounts();
  const logContext = {
    organizationId: String(tenantId),
    connectionId: String(connection._id),
    model: 'employment',
  };
  const latestTitleByEmployee = new Map();
  const seenEmploymentIds = [];
  let pages = 0;
  let records = 0;
  const walked = await walkMergeModel({
    url: MERGE_HRIS_EMPLOYMENTS_URL,
    accountToken,
    query: { page_size: 100 },
    logContext,
    modifiedAfter,
    onRateLimit,
    onRestart: () => {
      pages = 0;
      records = 0;
      seenEmploymentIds.length = 0;
      latestTitleByEmployee.clear();
    },
    onPage: async (pageRows) => {
      const prepared = [];
      const pageIds = [];
      for (const row of pageRows) {
        const mergeId = asString(row?.id);
        if (!mergeId) continue;
        pageIds.push(mergeId);
        const mergeEmployeeId = asString(row.employee);
        const jobTitle = asString(row.job_title);
        const effectiveDate = asDate(row.effective_date);
        prepared.push({
          mergeId,
          fields: {
            provider: connection.provider,
            mergeEmployeeId,
            jobTitle,
            employmentType: asString(row.employment_type),
            effectiveDate,
            payFrequency: asString(row.pay_frequency),
            payPeriod: asString(row.pay_period),
            lastSyncedAt: now,
            source: 'merge',
          },
        });
        if (mergeEmployeeId) {
          const prev = latestTitleByEmployee.get(mergeEmployeeId);
          if (!prev) {
            latestTitleByEmployee.set(mergeEmployeeId, { title: jobTitle, at: effectiveDate });
          } else if (effectiveDate && (!prev.at || effectiveDate > prev.at)) {
            latestTitleByEmployee.set(mergeEmployeeId, { title: jobTitle, at: effectiveDate });
          }
        }
      }
      await bulkUpsertPage({
        Model: MergeHrisEmployment,
        tenantId,
        connectionId: connection._id,
        mergeIdField: 'mergeEmploymentId',
        rows: prepared,
        counts,
      });
      seenEmploymentIds.push(...pageIds);
      pages += 1;
      records += pageRows.length;
      await onPageDone?.({ pagesProcessed: pages, recordsProcessed: records });
    },
  });
  const pruneThisSnapshot = allowPrune && walked.mode === 'full' && !walked.fallback;
  counts.mode = walked.mode;
  counts.fallback = walked.fallback;
  counts.processed = records;
  counts.fetchComplete = Boolean(walked.complete);

  await pruneByMergeIds({
    Model: MergeHrisEmployment,
    tenantId,
    connectionId: connection._id,
    mergeIdField: 'mergeEmploymentId',
    seenIds: seenEmploymentIds,
    snapshotComplete: walked.complete,
    allowPrune: pruneThisSnapshot,
    rawItemCount: records,
    counts,
    logContext,
    assertLock,
  });

  const titleIds = [...latestTitleByEmployee.keys()];
  const titleOps = titleIds.map((mergeEmployeeId) => ({
    updateOne: {
      filter: { tenantId, connectionId: connection._id, mergeEmployeeId },
      update: { $set: { jobTitle: latestTitleByEmployee.get(mergeEmployeeId).title } },
    },
  }));
  for (let i = 0; i < titleOps.length; i += 100) {
    await MergeHrisEmployee.bulkWrite(titleOps.slice(i, i + 100), { ordered: false });
  }
  if (walked.complete && allowPrune) {
    await MergeHrisEmployee.updateMany(
      {
        tenantId,
        connectionId: connection._id,
        ...(titleIds.length ? { mergeEmployeeId: { $nin: titleIds } } : {}),
      },
      { $set: { jobTitle: '' } },
    );
  }

  counts.seenEmployeeIds = titleIds;
  return counts;
}

function isUsableContactEmail(email) {
  const v = asString(email).toLowerCase();
  if (!v || !v.includes('@') || v.startsWith('@') || v.endsWith('@')) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function contactHasMergeIdentity(contact) {
  return Boolean(contact?.mergeEmployeeId && contact?.mergeConnectionId);
}

function mergeIdentityMatches(contact, { mergeEmployeeId, mergeConnectionId }) {
  return (
    contactHasMergeIdentity(contact) &&
    contact.mergeEmployeeId === mergeEmployeeId &&
    String(contact.mergeConnectionId) === String(mergeConnectionId)
  );
}

/**
 * Mirror synced Merge HRIS employees into Workspace Contacts (source=hris).
 * Upsert order: Merge identity → claim/reclaim by email → create.
 * After a complete employee snapshot, Contacts whose Merge IDs are no longer live
 * on this connection become stale (IDs preserved, records not deleted).
 */
async function syncContactsFromHrisEmployees({
  tenantId,
  connection,
  employeeSnapshotComplete = false,
  assertLock,
  onlyMergeEmployeeIds = null,
}) {
  if (assertLock) await assertLock();
  const counts = { ...emptyCounts(), conflicts: 0, mode: onlyMergeEmployeeIds ? 'incremental' : 'full' };
  const mergeConnectionId = connection._id;
  const employeeFilter = { tenantId, connectionId: mergeConnectionId };
  if (Array.isArray(onlyMergeEmployeeIds)) {
    employeeFilter.mergeEmployeeId = { $in: onlyMergeEmployeeIds };
  }
  const employees = await MergeHrisEmployee.find(employeeFilter).lean();

  const liveIds = employees.map((e) => asString(e.mergeEmployeeId)).filter(Boolean);

  if (employees.length) {
    const [departments, locations] = await Promise.all([
      MergeHrisDepartment.find({ tenantId, connectionId: mergeConnectionId })
        .select('mergeDepartmentId name groupType')
        .lean(),
      MergeHrisLocation.find({ tenantId, connectionId: mergeConnectionId }).lean(),
    ]);

    const departmentsById = new Map(departments.map((d) => [d.mergeDepartmentId, d]));
    const locById = new Map(locations.map((l) => [l.mergeLocationId, l]));

    for (const emp of employees) {
      const mergeEmployeeId = asString(emp.mergeEmployeeId);
      if (!mergeEmployeeId) continue;

      const email = asString(emp.workEmail || emp.personalEmail).toLowerCase();
      if (!isUsableContactEmail(email)) continue;

      const firstName = asString(emp.firstName);
      const lastName = asString(emp.lastName);
      const name =
        asString(emp.displayName) ||
        `${firstName} ${lastName}`.trim() ||
        email;

      const department = resolveOrgUnitName({
        departmentMergeIds: emp.departmentMergeIds,
        departmentsById,
      });

      const loc = emp.locationMergeId ? locById.get(emp.locationMergeId) : null;
      const workLocation = loc
        ? asString(loc.name) || formatHrisLocationAddress(loc)
        : '';
      const address = loc
        ? {
            line1: asString(loc.street1),
            line2: asString(loc.street2),
            city: asString(loc.city) || asString(loc.name),
            state: asString(loc.state),
            pincode: asString(loc.zipCode),
            country: asString(loc.country),
          }
        : undefined;

      const patch = {
        name,
        firstName,
        lastName,
        email,
        phone: asString(emp.mobilePhoneNumber),
        employeeCode: asString(emp.remoteEmployeeId),
        department,
        designation: asString(emp.jobTitle),
        workLocation,
        dateOfJoining: emp.startDate || null,
        employmentStatus: asString(emp.employmentStatus),
        terminationDate: emp.terminationDate || null,
        source: 'hris',
        mergeEmployeeId,
        mergeConnectionId,
        hrisLinkStatus: 'current',
        ...(address ? { address } : {}),
      };

      try {
        const existing = await Contact.findOne({
          tenantId,
          mergeConnectionId,
          mergeEmployeeId,
        });

        if (existing) {
          if (existing.email !== email) {
            const emailOwner = await Contact.findOne({ tenantId, email });
            if (emailOwner && String(emailOwner._id) !== String(existing._id)) {
              logger.warn(
                {
                  organizationId: String(tenantId),
                  connectionId: String(mergeConnectionId),
                  provider: connection.provider,
                  mergeEmployeeId,
                  code: 'MERGE_CONTACT_EMAIL_CONFLICT',
                  linkedContactId: String(existing._id),
                  conflictingContactId: String(emailOwner._id),
                },
                'Merge HRIS contact email conflict — skipped update',
              );
              counts.conflicts += 1;
              continue;
            }
          }
          Object.assign(existing, patch);
          await existing.save();
          counts.updated += 1;
          continue;
        }

        const byEmail = await Contact.findOne({ tenantId, email });
        if (byEmail) {
          if (
            contactHasMergeIdentity(byEmail) &&
            !mergeIdentityMatches(byEmail, { mergeEmployeeId, mergeConnectionId })
          ) {
            if (String(byEmail.mergeConnectionId) !== String(mergeConnectionId)) {
              logger.warn(
                {
                  organizationId: String(tenantId),
                  connectionId: String(mergeConnectionId),
                  provider: connection.provider,
                  mergeEmployeeId,
                  code: 'MERGE_CONTACT_IDENTITY_CONFLICT',
                  reason: 'cross_connection',
                  existingContactId: String(byEmail._id),
                  existingMergeEmployeeId: byEmail.mergeEmployeeId,
                  existingMergeConnectionId: String(byEmail.mergeConnectionId),
                },
                'Merge HRIS contact identity conflict — skipped claim',
              );
              counts.conflicts += 1;
              continue;
            }

            const oldLive = await MergeHrisEmployee.exists({
              tenantId,
              connectionId: mergeConnectionId,
              mergeEmployeeId: byEmail.mergeEmployeeId,
            });
            if (oldLive) {
              logger.warn(
                {
                  organizationId: String(tenantId),
                  connectionId: String(mergeConnectionId),
                  provider: connection.provider,
                  mergeEmployeeId,
                  code: 'MERGE_CONTACT_IDENTITY_CONFLICT',
                  reason: 'live_identity',
                  existingContactId: String(byEmail._id),
                  existingMergeEmployeeId: byEmail.mergeEmployeeId,
                  existingMergeConnectionId: String(byEmail.mergeConnectionId),
                },
                'Merge HRIS contact identity conflict — skipped claim',
              );
              counts.conflicts += 1;
              continue;
            }
            // Old Merge employee is gone on this connection — reclaim.
          }
          Object.assign(byEmail, patch);
          await byEmail.save();
          counts.updated += 1;
          continue;
        }

        await Contact.create({ tenantId, ...patch });
        counts.created += 1;
      } catch (err) {
        if (err?.code === 11000) counts.conflicts += 1;
        logger.warn(
          {
            organizationId: String(tenantId),
            connectionId: String(mergeConnectionId),
            provider: connection.provider,
            mergeEmployeeId,
            code: err?.code || err?.name,
          },
          'Merge HRIS contact upsert skipped',
        );
      }
    }
  }

  counts.processed = employees.length;
  counts.fetchComplete = true;
  if (employeeSnapshotComplete && !Array.isArray(onlyMergeEmployeeIds)) {
    if (assertLock) await assertLock();
    await Contact.updateMany(
      {
        tenantId,
        mergeConnectionId,
        mergeEmployeeId: { $gt: '', $nin: liveIds },
      },
      { $set: { hrisLinkStatus: 'stale' } },
    );
  }

  return counts;
}

async function persistMergeModelSync({ tenantId, connectionId, token, models, listComplete }) {
  const updated = await MergeConnection.findOneAndUpdate(
    { _id: connectionId, tenantId, syncLockToken: token },
    { $set: { mergeModelSync: storedMergeModelSync(models, { listComplete }) } },
    { new: true },
  );
  if (!updated) throw mergeSyncLockLostError();
  return updated;
}

/**
 * Read Merge /sync-status. A failure or an incomplete page list is not authoritative
 * and must not be used to prune local rows.
 */
async function readMergeModelSync({ accountToken, logContext }) {
  try {
    const fetched = await getMergeSyncStatus(accountToken, { logContext });
    if (!fetched.listComplete) {
      logger.warn(logContext, 'Merge sync status list incomplete — destructive prune disabled');
      return { known: false, models: null };
    }
    logger.info(
      { ...logContext, ...mergeModelSyncLogFields(fetched.models) },
      'Merge sync status fetched',
    );
    logger.info(
      {
        ...logContext,
        status: fetched.models.employee?.status || null,
        lastSyncResult: fetched.models.employee?.lastSyncResult || null,
        isInitialSync:
          typeof fetched.models.employee?.isInitialSync === 'boolean'
            ? fetched.models.employee.isInitialSync
            : null,
      },
      'Merge employee model status',
    );
    logger.info(
      {
        ...logContext,
        status: fetched.models.employment?.status || null,
        lastSyncResult: fetched.models.employment?.lastSyncResult || null,
        isInitialSync:
          typeof fetched.models.employment?.isInitialSync === 'boolean'
            ? fetched.models.employment.isInitialSync
            : null,
      },
      'Merge employment model status',
    );
    return { known: true, models: fetched.models };
  } catch (err) {
    logger.warn(
      { ...logContext, code: err?.code || err?.name },
      'Merge sync status fetch failed — destructive prune disabled',
    );
    return { known: false, models: null };
  }
}

function safeSyncErrorCode(err) {
  const code = typeof err?.code === 'string' ? err.code : '';
  if (/^[A-Z0-9_]{1,80}$/.test(code)) return code;
  return 'SYNC_FAILED';
}

async function reportProgress(onProgress, value) {
  if (typeof onProgress !== 'function') return;
  try {
    await onProgress(value);
  } catch (err) {
    logger.warn({ code: err?.code || err?.name }, 'Merge sync progress update failed');
  }
}

/** A queued job that cannot start must not stay queued. Does not change connection status. */
async function failIfQueued(tenantId, connectionId, code) {
  if (!tenantId || !connectionId) return;
  try {
    await MergeConnection.updateOne(
      { _id: connectionId, tenantId, lastSyncStatus: 'queued' },
      {
        $set: {
          lastSyncStatus: 'failed',
          lastError: safeSyncErrorCode({ code }),
          lastSyncFinishedAt: new Date(),
        },
      },
    );
  } catch (err) {
    logger.warn({ code: err?.code || err?.name }, 'Could not mark queued Merge sync failed');
  }
}

function assertSyncableConnection(connection) {
  if (!connection || (connection.status !== 'connected' && connection.status !== 'needs_attention')) {
    throw new ApiError(400, 'Merge connection is not active', 'MERGE_CONNECTION_INACTIVE');
  }
  if (!connection.encryptedAccountToken) {
    throw new ApiError(400, 'Merge account token is missing', 'MERGE_TOKEN_MISSING');
  }
}

function absorbContactCounts(target, part) {
  target.created += part.created || 0;
  target.updated += part.updated || 0;
  target.unchanged += part.unchanged || 0;
  target.conflicts = (target.conflicts || 0) + (part.conflicts || 0);
  target.processed += part.processed || 0;
  target.fetchComplete = true;
}

/**
 * Contact rows follow local employees in pages of 100.
 * Titles are already applied, so one pass keeps created/updated counts stable.
 * Stale marking uses the completed employee id list and does not load every employee document.
 */
async function mirrorContactsByIds({
  tenantId,
  connection,
  ids,
  employeeSnapshotComplete,
  assertLock,
}) {
  const counts = {
    ...emptyCounts(),
    conflicts: 0,
    mode: employeeSnapshotComplete ? 'full' : 'incremental',
  };
  const list = Array.isArray(ids) ? ids : [];
  let pages = 0;
  for (let i = 0; i < list.length; i += 100) {
    const part = await syncContactsFromHrisEmployees({
      tenantId,
      connection,
      employeeSnapshotComplete: false,
      assertLock,
      onlyMergeEmployeeIds: list.slice(i, i + 100),
    });
    absorbContactCounts(counts, part);
    pages += 1;
  }
  if (employeeSnapshotComplete) {
    if (assertLock) await assertLock();
    await Contact.updateMany(
      {
        tenantId,
        mergeConnectionId: connection._id,
        mergeEmployeeId: { $gt: '', $nin: list },
      },
      { $set: { hrisLinkStatus: 'stale' } },
    );
  }
  counts.fetchComplete = true;
  counts.pages = Math.max(pages, list.length ? pages : 0);
  return counts;
}

/**
 * Full paginated HRIS sync for a tenant-owned Merge connection.
 * Updates Merge HRIS models and mirrors employees into Workspace Contacts.
 * Never creates ShelfMerch Users/logins.
 * Called by the merge-hris-sync worker. `lock` lease/renew overrides are for tests only.
 */
export async function syncMergeConnection({
  tenantId,
  connectionId,
  lock,
  onProgress,
  reason = 'manual',
  requestedByUserId = null,
  now: nowInput = null,
  jobId = '',
  attempt = 1,
  maxAttempts = 1,
} = {}) {
  requireMergeConfigured();

  logger.info(
    {
      event: 'merge_sync_started',
      organizationId: String(tenantId),
      connectionId: String(connectionId),
      jobId: jobId ? String(jobId) : null,
      reason,
      attempt: Math.max(1, Number(attempt) || 1),
      requestedByUserId: requestedByUserId ? String(requestedByUserId) : null,
    },
    'merge_sync_started',
  );

  let owned;
  try {
    owned = await getOwnedMergeConnection({ tenantId, connectionId });
    assertSyncableConnection(owned);
  } catch (err) {
    await failIfQueued(tenantId, connectionId, err?.code);
    throw err;
  }

  let accountToken;
  try {
    accountToken = decryptToken(owned.encryptedAccountToken);
  } catch (err) {
    await failIfQueued(tenantId, connectionId, 'MERGE_TOKEN_DECRYPT_FAILED');
    throw new ApiError(500, 'Could not decrypt Merge account token', 'MERGE_TOKEN_DECRYPT_FAILED');
  }

  const leaseMs = Number(lock?.leaseMs) > 0 ? Number(lock.leaseMs) : MERGE_SYNC_LOCK_LEASE_MS;
  const renewEveryMs =
    Number(lock?.renewEveryMs) > 0 ? Number(lock.renewEveryMs) : MERGE_SYNC_LOCK_RENEW_EVERY_MS;

  const acquired = await acquireMergeSyncLock({ tenantId, connectionId, leaseMs });
  if (!acquired) throw mergeSyncInProgressError();

  const { token } = acquired;
  let connection = acquired.connection;
  let lockLost = false;
  const stopHeartbeat = startMergeSyncLockHeartbeat({
    tenantId,
    connectionId: connection._id,
    token,
    leaseMs,
    renewEveryMs,
    onLost: () => {
      lockLost = true;
    },
    onRenewed: () => {
      if (syncRun) void touchMergeSyncRun(syncRun);
    },
  });

  const assertLock = async () => {
    if (lockLost) throw mergeSyncLockLostError();
    await assertMergeSyncLockOwned({ tenantId, connectionId: connection._id, token });
  };

  let syncRun = null;
  let failedModel = '';
  const now = nowInput instanceof Date ? new Date(nowInput.getTime()) : new Date();
  const syncBoundaryAt = now;
  const completedWatermarks = {};
  const summary = {
    employees: emptyCounts(),
    departments: emptyCounts(),
    locations: emptyCounts(),
    employments: emptyCounts(),
    contacts: emptyCounts(),
  };

  try {
    await reportProgress(onProgress, 10);
    const fresh = await MergeConnection.findOne({ _id: connection._id, tenantId });
    assertSyncableConnection(fresh);
    try {
      accountToken = decryptToken(fresh.encryptedAccountToken);
    } catch {
      throw new ApiError(500, 'Could not decrypt Merge account token', 'MERGE_TOKEN_DECRYPT_FAILED');
    }

    await assertLock();
    const statusLog = {
      organizationId: String(tenantId),
      connectionId: String(connection._id),
      provider: connection.provider,
    };
    const governed = await readMergeModelSync({ accountToken, logContext: statusLog });
    if (governed.known) {
      await persistMergeModelSync({
        tenantId,
        connectionId: connection._id,
        token,
        models: governed.models,
        listComplete: true,
      });
    }
    const employeeModelReady =
      governed.known && isMergeModelSnapshotAuthoritative(governed.models.employee);
    const employmentSnapshotAuthoritative =
      governed.known && isMergeModelSnapshotAuthoritative(governed.models.employment);
    const jobMode = resolveMergeSyncMode({
      reason,
      lastFullSyncAt: fresh.lastFullSyncAt,
      now,
    });
    const cursors = fresh.mergeSyncCursors || {};
    const modifiedAfterFor = (key) =>
      jobMode === 'incremental' ? effectiveModifiedAfter(cursors[key]) : null;
    summary.mode = jobMode;
    summary.reason = reason;
    syncRun = await beginMergeSyncRun({
      tenantId,
      connectionId: connection._id,
      jobId,
      reason,
      mode: jobMode,
      attempt,
    });
    const runLog = {
      connectionId: String(connection._id),
      syncRunId: String(syncRun._id),
      jobId: jobId ? String(jobId) : null,
      reason,
      mode: jobMode,
      attempt: Math.max(1, Number(attempt) || 1),
    };
    const onRateLimit = () => noteMergeSyncRateLimit(syncRun);
    const runModel = async (model, fn) => {
      failedModel = model;
      logger.info({ ...runLog, event: 'merge_model_started', model }, 'merge_model_started');
      try {
        const result = await fn();
        logger.info(
          {
            ...runLog,
            event: 'merge_model_completed',
            model,
            records: result?.processed || 0,
          },
          'merge_model_completed',
        );
        failedModel = '';
        return result;
      } catch (err) {
        if (err?.code === 'MERGE_SCOPES_DISABLED' && !scopeFailureChangesConnection(model)) {
          logger.warn(
            { ...runLog, event: 'merge_optional_scope_disabled', model, code: err.code },
            'merge_optional_scope_disabled',
          );
          summary.optionalScopeLimited = true;
          await noteMergeSyncPage(syncRun, model, { pagesProcessed: 0, recordsProcessed: 0 });
          failedModel = '';
          return { ...emptyCounts(), fetchComplete: false, fallback: 'scope_disabled', processed: 0 };
        }
        throw err;
      }
    };
    await reportProgress(onProgress, 20);

    summary.departments = await runModel('group', () =>
      syncDepartments({
        tenantId,
        connection,
        accountToken,
        now,
        modifiedAfter: modifiedAfterFor('group'),
        onRateLimit,
        onPageDone: (progress) => noteMergeSyncPage(syncRun, 'group', progress),
      }),
    );
    if (summary.departments.fetchComplete) completedWatermarks.group = syncBoundaryAt;

    await assertLock();
    const departments = await MergeHrisDepartment.find({
      tenantId,
      connectionId: connection._id,
    })
      .select('mergeDepartmentId groupType')
      .lean();
    const groupTypeById = new Map(
      departments.map((d) => [d.mergeDepartmentId, d.groupType || 'UNKNOWN']),
    );

    await reportProgress(onProgress, 30);
    await assertLock();
    summary.locations = await runModel('location', () =>
      syncLocations({
        tenantId,
        connection,
        accountToken,
        now,
        modifiedAfter: modifiedAfterFor('location'),
        onRateLimit,
        onPageDone: (progress) => noteMergeSyncPage(syncRun, 'location', progress),
      }),
    );
    if (summary.locations.fetchComplete) completedWatermarks.location = syncBoundaryAt;

    await reportProgress(onProgress, 40);
    await assertLock();
    summary.employees = await runModel('employee', () =>
      syncEmployees({
        tenantId,
        connection,
        accountToken,
        now,
        groupTypeById,
        assertLock,
        allowPrune: jobMode === 'full' && employeeModelReady,
        modifiedAfter: modifiedAfterFor('employee'),
        onRateLimit,
        onPageDone: (progress) => noteMergeSyncPage(syncRun, 'employee', progress),
      }),
    );

    await reportProgress(onProgress, 50);
    await assertLock();
    summary.employments = await runModel('employment', () =>
      syncEmployments({
        tenantId,
        connection,
        accountToken,
        now,
        assertLock,
        allowPrune: jobMode === 'full' && employmentSnapshotAuthoritative,
        modifiedAfter: modifiedAfterFor('employment'),
        onRateLimit,
        onPageDone: (progress) => noteMergeSyncPage(syncRun, 'employment', progress),
      }),
    );
    if (
      summary.employments.fetchComplete &&
      (jobMode === 'incremental' || !summary.employments.pruneSkippedReason)
    ) {
      completedWatermarks.employment = syncBoundaryAt;
    }

    await reportProgress(onProgress, 70);
    await assertLock();
    const contactIds =
      jobMode === 'incremental'
        ? [...new Set([...(summary.employees.seenIds || []), ...(summary.employments.seenEmployeeIds || [])])]
        : summary.employees.seenIds || [];
    summary.contacts = await runModel('contact', async () => {
      const counts = await mirrorContactsByIds({
        tenantId,
        connection,
        ids: contactIds,
        employeeSnapshotComplete: jobMode === 'full' && Boolean(summary.employees.snapshotComplete),
        assertLock,
      });
      await noteMergeSyncPage(syncRun, 'contact', {
        pagesProcessed: counts.pages || 0,
        recordsProcessed: counts.processed || 0,
      });
      return counts;
    });
    const employeeCursorReady =
      summary.employees.fetchComplete &&
      (jobMode === 'incremental' || !summary.employees.pruneSkippedReason);
    if (employeeCursorReady) completedWatermarks.employee = syncBoundaryAt;
    if (employeeCursorReady && summary.contacts.fetchComplete) {
      completedWatermarks.contact = syncBoundaryAt;
    }

    logger.info(
      {
        ...statusLog,
        employeePruneAllowed: employeeModelReady,
        employeePruneSkippedReason: summary.employees.pruneSkippedReason || null,
        employmentPruneAllowed: employmentSnapshotAuthoritative,
        employmentPruneSkippedReason: summary.employments.pruneSkippedReason || null,
      },
      'Merge employee prune decision',
    );

    await reportProgress(onProgress, 85);
    const refreshed = await readMergeModelSync({ accountToken, logContext: statusLog });
    const latest = refreshed.known ? refreshed : governed;
    if (refreshed.known) {
      await persistMergeModelSync({
        tenantId,
        connectionId: connection._id,
        token,
        models: refreshed.models,
        listComplete: true,
      });
    }
    await reportProgress(onProgress, 95);

    stopHeartbeat();
    await assertLock();

    const stillConnected = await MergeConnection.findOne({ _id: connection._id, tenantId }).select(
      'status encryptedAccountToken',
    );
    assertSyncableConnection(stillConnected);

    if (jobMode === 'incremental') {
      await MergeHrisEmployee.updateMany(
        { tenantId, connectionId: connection._id },
        { $set: { lastSyncedAt: now } },
      );
    }

    const fullModelsComplete = ['departments', 'locations', 'employees', 'employments'].every(
      (key) => summary[key]?.fetchComplete,
    );
    summary.models = {
      employees: describeModel(summary.employees),
      employments: describeModel(summary.employments),
      groups: describeModel(summary.departments),
      locations: describeModel(summary.locations),
      contacts: describeModel(summary.contacts),
    };

    const completed = await completeMergeSyncLock({
      tenantId,
      connectionId: connection._id,
      token,
      fields: {
        lastSyncAt: now,
        lastSyncStatus: 'success',
        lastSyncFinishedAt: new Date(),
        lastError: summary.optionalScopeLimited ? 'MERGE_OPTIONAL_SCOPE_DISABLED' : '',
        status: connectionStatusAfterSyncSuccess(stillConnected.status),
        ...cursorUpdates(completedWatermarks),
        ...(jobMode === 'full' &&
        fullModelsComplete &&
        !summary.employees.pruneSkippedReason &&
        !summary.employments.pruneSkippedReason
          ? { lastFullSyncAt: syncBoundaryAt }
          : {}),
      },
    });
    if (!completed) throw mergeSyncLockLostError();
    connection = completed;

    await finishMergeSyncRun(syncRun, { status: 'success', mode: jobMode });
    logger.info(
      {
        event: 'merge_sync_completed',
        connectionId: String(connection._id),
        syncRunId: syncRun ? String(syncRun._id) : null,
        jobId: jobId ? String(jobId) : null,
        reason,
        mode: jobMode,
        attempt: Math.max(1, Number(attempt) || 1),
        contactsCreated: summary.contacts.created,
        contactsUpdated: summary.contacts.updated,
        contactsConflicts: summary.contacts.conflicts || 0,
      },
      'merge_sync_completed',
    );

    const mergeSyncInProgress = Boolean(
      latest.known && isMergeModelSyncInProgress(latest.models?.employee),
    );
    const employeeSnapshotAuthoritative =
      employeeModelReady && !summary.employees.pruneSkippedReason;

    await reportProgress(onProgress, 100);

    return {
      connection: connection.toPublicJSON(),
      sync: summary,
      mergeSyncInProgress,
      employeeSnapshotAuthoritative,
      mergeSyncStateKnown: Boolean(latest.known),
    };
  } catch (err) {
    stopHeartbeat();
    const terminal = isMergeSyncAttemptTerminal(err, { attempt, maxAttempts });
    if (err?.code === 'MERGE_SYNC_LOCK_LOST') {
      logger.warn(
        {
          organizationId: String(tenantId),
          connectionId: String(connection._id),
          provider: connection.provider,
          code: err.code,
        },
        'Merge HRIS sync aborted — lock lost',
      );
      if (terminal && syncRun) {
        await finishMergeSyncRun(syncRun, {
          status: 'failed',
          errorCode: 'MERGE_SYNC_LOCK_LOST',
          failedModel,
        });
      }
      throw err;
    }

    if (!terminal) {
      const released = await releaseMergeSyncLock({ tenantId, connectionId: connection._id, token });
      if (released) {
        await MergeConnection.updateOne(
          { _id: connection._id, tenantId, syncLockToken: '' },
          { $set: { lastError: safeSyncErrorCode(err) } },
        );
      }
      if (syncRun) await touchMergeSyncRun(syncRun, { errorCode: safeMergeSyncRunError(err) });
      throw err;
    }

    const failedFields = {
      lastSyncStatus: 'failed',
      lastError: safeSyncErrorCode(err),
      lastSyncFinishedAt: new Date(),
    };
    const blockWatermarks =
      err?.code === 'MERGE_CONNECTION_INACTIVE' ||
      err?.code === 'MERGE_TOKEN_MISSING' ||
      err?.code === 'MERGE_TOKEN_DECRYPT_FAILED';
    if (!blockWatermarks) {
      Object.assign(failedFields, cursorUpdates(completedWatermarks));
    }
    if (err?.code === 'MERGE_SCOPES_DISABLED' && scopeFailureChangesConnection(failedModel)) {
      failedFields.status = 'needs_attention';
      failedFields.lastError = 'MERGE_SCOPES_DISABLED';
    } else if (err?.code === 'MERGE_AUTH_FAILED') {
      failedFields.status = 'needs_attention';
    }

    await completeMergeSyncLock({
      tenantId,
      connectionId: connection._id,
      token,
      fields: failedFields,
    });

    if (syncRun) {
      await finishMergeSyncRun(syncRun, {
        status: 'failed',
        errorCode: safeMergeSyncRunError(err),
        failedModel,
      });
    }
    logger.warn(
      {
        event: 'merge_sync_failed',
        connectionId: String(connection._id),
        syncRunId: syncRun ? String(syncRun._id) : null,
        jobId: jobId ? String(jobId) : null,
        reason,
        attempt: Math.max(1, Number(attempt) || 1),
        model: failedModel || null,
        code: safeMergeSyncRunError(err),
      },
      'merge_sync_failed',
    );
    throw err;
  } finally {
    stopHeartbeat();
  }
}

/** Canonical Merge HRIS import. The HTTP handler only enqueues this. */
export const runMergeHrisSync = syncMergeConnection;

/** List synced HRIS employees for the tenant (safe fields only). */
export async function listMergeHrisEmployees({ tenantId, connectionId, limit = 100 }) {
  const connFilter = { tenantId };
  if (connectionId) connFilter._id = connectionId;

  const connections = await MergeConnection.find(connFilter)
    .select('_id lastSyncAt lastSyncStatus status provider')
    .lean();
  const connectionById = new Map(connections.map((c) => [String(c._id), c]));
  // A specific Merge connection filter must not mix in the direct Zoho directory.
  const zohoIntegration = connectionId
    ? null
    : await ZohoIntegration.findOne({ tenantId })
        .select('_id status lastSyncedAt')
        .lean();
  const directoryConnections = zohoIntegration
    ? [...connections, zohoIntegrationAsDirectoryConnection(zohoIntegration)]
    : connections;
  const directory = deriveHrisDirectoryStatus(directoryConnections);

  if (!connections.length && !zohoIntegration) {
    return { employees: [], directory };
  }

  const cap = Math.min(Number(limit) || 100, 500);
  let rows = [];
  if (connections.length) {
    const filter = {
      tenantId,
      $or: connections.map((c) => {
        const clause = { connectionId: c._id };
        if (c.lastSyncAt) {
          // Drop leftover rows from a prior Linked Account / Merge UUID rotation.
          // Rows with no lastSyncedAt are kept (tests and pre-timestamp imports).
          clause.$or = [
            { lastSyncedAt: { $exists: false } },
            { lastSyncedAt: null },
            { lastSyncedAt: { $gte: c.lastSyncAt } },
          ];
        }
        return clause;
      }),
    };

    rows = await MergeHrisEmployee.find(filter).sort({ updatedAt: -1 }).limit(cap).lean();
  }

  const connectionIds = [...new Set(rows.map((r) => String(r.connectionId)))];
  const [departments, locations, employments] = await Promise.all([
    MergeHrisDepartment.find({ tenantId, connectionId: { $in: connectionIds } })
      .select('connectionId mergeDepartmentId name groupType')
      .lean(),
    MergeHrisLocation.find({ tenantId, connectionId: { $in: connectionIds } })
      .select('connectionId mergeLocationId name street1 street2 city state zipCode country')
      .lean(),
    MergeHrisEmployment.find({ tenantId, connectionId: { $in: connectionIds } })
      .select('connectionId mergeEmployeeId employmentType jobTitle effectiveDate')
      .lean(),
  ]);

  const departmentsByKey = new Map(
    departments.map((d) => [`${d.connectionId}:${d.mergeDepartmentId}`, d]),
  );
  const locByKey = new Map(
    locations.map((l) => [`${l.connectionId}:${l.mergeLocationId}`, l]),
  );
  const employmentByEmployee = new Map();
  for (const emp of employments) {
    const key = `${emp.connectionId}:${emp.mergeEmployeeId}`;
    const prev = employmentByEmployee.get(key);
    if (
      !prev ||
      (emp.effectiveDate && (!prev.effectiveDate || emp.effectiveDate > prev.effectiveDate))
    ) {
      employmentByEmployee.set(key, emp);
    }
  }

  const mergeEmployees = rows.map((r) => {
      const connKey = String(r.connectionId);
      const departmentsById = new Map();
      if (Array.isArray(r.departmentMergeIds)) {
        for (const deptId of r.departmentMergeIds) {
          const dept = departmentsByKey.get(`${connKey}:${deptId}`);
          if (dept) departmentsById.set(deptId, dept);
        }
      }
      const deptName = resolveOrgUnitName({
        departmentMergeIds: r.departmentMergeIds,
        departmentsById,
      });
      const loc = r.locationMergeId
        ? locByKey.get(`${connKey}:${r.locationMergeId}`)
        : null;
      const employment = employmentByEmployee.get(`${connKey}:${r.mergeEmployeeId}`);
      const address = formatHrisLocationAddress(loc);
      const derived = deriveEffectiveEmploymentStatus({
        employmentStatus: r.employmentStatus,
        terminationDate: r.terminationDate,
        startDate: r.startDate,
      });

      return {
        id: String(r._id),
        connectionId: connKey,
        connectionStatus: connectionById.get(connKey)?.status || 'disconnected',
        provider: r.provider,
        mergeEmployeeId: r.mergeEmployeeId,
        displayName: r.displayName || `${r.firstName} ${r.lastName}`.trim(),
        firstName: r.firstName,
        lastName: r.lastName,
        workEmail: r.workEmail,
        employmentStatus: r.employmentStatus,
        effectiveEmploymentStatus: derived.effectiveEmploymentStatus,
        effectiveStatusSource: derived.effectiveStatusSource,
        jobTitle: r.jobTitle || '',
        employmentType: employment?.employmentType || '',
        departmentName: deptName,
        address,
        country: loc?.country || '',
        locationName: loc?.name || '',
        departmentMergeIds: r.departmentMergeIds || [],
        locationMergeId: r.locationMergeId || null,
        startDate: r.startDate,
        terminationDate: r.terminationDate,
        lastSyncedAt: r.lastSyncedAt,
        source: r.source,
      };
    });

  const excludeEmails = new Set(
    mergeEmployees
      .map((employee) => String(employee.workEmail || '').trim().toLowerCase())
      .filter(Boolean),
  );
  const excludeMergeEmployeeIds = new Set(
    mergeEmployees.map((employee) => String(employee.mergeEmployeeId || '').trim()).filter(Boolean),
  );
  const zohoEmployees = await listZohoDirectoryEmployees({
    tenantId,
    integration: zohoIntegration,
    excludeEmails,
    excludeMergeEmployeeIds,
    limit: cap,
  });

  return {
    directory,
    employees: [...mergeEmployees, ...zohoEmployees].slice(0, cap),
  };
}
