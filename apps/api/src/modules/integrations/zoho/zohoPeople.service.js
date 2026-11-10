import { ApiError } from '../../../utils/errors.js';
import { logger } from '../../../config/logger.js';
import { resolveZohoPeopleBaseUrl } from './zohoPeopleBaseUrl.js';

export const SKIP_REASONS = Object.freeze({
  MISSING_ZOHO_RECORD_ID: 'MISSING_ZOHO_RECORD_ID',
  MISSING_EMPLOYEE_IDENTIFIER: 'MISSING_EMPLOYEE_IDENTIFIER',
  INVALID_EMAIL: 'INVALID_EMAIL',
  DUPLICATE_IN_RESPONSE: 'DUPLICATE_IN_RESPONSE',
  UNSUPPORTED_RECORD_SHAPE: 'UNSUPPORTED_RECORD_SHAPE',
  DATABASE_VALIDATION_FAILED: 'DATABASE_VALIDATION_FAILED',
});

const PRIMARY_PATH = '/people/api/forms/employee/getRecords';
const FALLBACK_PATH = '/api/forms/P_EmployeeView/records';

function zohoAuthHeader(accessToken) {
  return { Authorization: `Zoho-oauthtoken ${accessToken}` };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Coerce Zoho field values (string | number | {Name,ID} | [obj]) to a trim string.
 * Never returns nested objects.
 */
export function coerceZohoFieldValue(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (Array.isArray(value)) {
    if (!value.length) return '';
    return coerceZohoFieldValue(value[0]);
  }
  if (isPlainObject(value)) {
    for (const key of ['id', 'ID', 'Id', 'name', 'Name', 'display_value', 'displayValue']) {
      if (value[key] != null && String(value[key]).trim() !== '') {
        return String(value[key]).trim();
      }
    }
  }
  return '';
}

function fieldKeyVariants(key) {
  const compact = String(key).toLowerCase().replace(/[\s._-]+/g, '');
  return compact;
}

/**
 * Read a field from a Zoho record using documented/common aliases.
 */
export function pickField(row, keys) {
  if (!isPlainObject(row)) return '';
  for (const key of keys) {
    if (key.includes('.')) {
      const [head, ...rest] = key.split('.');
      if (isPlainObject(row[head])) {
        const nested = pickField(row[head], [rest.join('.')]);
        if (nested) return nested;
      }
    }
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const v = coerceZohoFieldValue(row[key]);
      if (v) return v;
    }
  }
  const byCompact = {};
  for (const [k, v] of Object.entries(row)) {
    byCompact[fieldKeyVariants(k)] = v;
  }
  for (const key of keys) {
    const compact = fieldKeyVariants(key);
    if (Object.prototype.hasOwnProperty.call(byCompact, compact)) {
      const v = coerceZohoFieldValue(byCompact[compact]);
      if (v) return v;
    }
  }
  return '';
}

/**
 * Flatten Zoho forms getRecords / view payloads into plain employee objects.
 * Handles: [{ "<recordId>": [ { fields } ] }, ...]
 */
export function extractEmployeeRecords(payload) {
  const out = [];
  const pushRecord = (record, recordIdHint = '') => {
    if (!isPlainObject(record)) return;
    // Outer getRecords object keys are string IDs — prefer them over numeric Zoho_ID
    // (JSON numbers > Number.MAX_SAFE_INTEGER lose precision).
    if (recordIdHint) {
      out.push({ ...record, Zoho_ID: String(recordIdHint) });
      return;
    }
    out.push(record);
  };

  const walkResultItem = (item) => {
    if (!item) return;
    if (Array.isArray(item)) {
      for (const inner of item) pushRecord(inner);
      return;
    }
    if (!isPlainObject(item)) return;

    // Already a flat employee row
    if (
      item.Zoho_ID != null ||
      item.EmailID != null ||
      item.EmployeeID != null ||
      item.FirstName != null ||
      item.Email != null
    ) {
      pushRecord(item);
      return;
    }

    // Nested: { "<dynamicRecordId>": [ { fields } ] } or { "<id>": { fields } }
    for (const [key, value] of Object.entries(item)) {
      if (Array.isArray(value)) {
        for (const inner of value) pushRecord(inner, key);
      } else if (isPlainObject(value)) {
        pushRecord(value, key);
      }
    }
  };

  if (Array.isArray(payload)) {
    for (const item of payload) walkResultItem(item);
    return out;
  }

  const candidates = [
    payload?.response?.result,
    payload?.result,
    payload?.data,
    payload?.records,
    payload?.response?.data,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const item of candidate) walkResultItem(item);
      if (out.length) return out;
    }
  }

  return out;
}

export function mapEmployeeRecord(row) {
  if (!isPlainObject(row)) {
    return { ok: false, reason: SKIP_REASONS.UNSUPPORTED_RECORD_SHAPE };
  }

  const zohoRecordId = pickField(row, [
    'Zoho_ID',
    'zoho_id',
    'recordId',
    'RecordId',
    'Employee.ID',
  ]);
  const employeeId = pickField(row, [
    'EmployeeID',
    'Employee_ID',
    'EmployeeId',
    'employeeId',
    'EmployeeID.ID',
  ]);
  const firstName = pickField(row, ['FirstName', 'First_Name', 'firstName']);
  const lastName = pickField(row, ['LastName', 'Last_Name', 'lastName']);
  const displayName = pickField(row, ['DisplayName', 'Display_Name', 'EmployeeName', 'name']);
  const emailRaw = pickField(row, [
    'EmailID',
    'Email',
    'Work_Email',
    'workEmail',
    'EmailId',
  ]);
  const email = emailRaw.toLowerCase();
  const department = pickField(row, ['Department', 'Department_Name', 'department', 'Department.ID']);
  const designation = pickField(row, ['Designation', 'designation', 'Job_Title', 'Designation.ID']);
  const location = pickField(row, [
    'LocationName',
    'Location',
    'Work_Location',
    'location',
    'LocationName.ID',
  ]);
  const dateOfJoining = pickField(row, [
    'Dateofjoining',
    'Date_of_Joining',
    'DateOfJoining',
    'dateOfJoining',
  ]);
  const employmentStatus = pickField(row, [
    'Employeestatus',
    'EmployeeStatus',
    'Employee_Status',
    'Employment_Status',
    'employmentStatus',
  ]);

  return {
    ok: true,
    record: {
      zohoRecordId,
      employeeId,
      firstName,
      lastName,
      displayName,
      email,
      department,
      designation,
      location,
      dateOfJoining,
      employmentStatus,
      fieldKeys: Object.keys(row),
    },
  };
}

/**
 * Parse organisation payload from GET {peopleBaseUrl}/api/v3/organization
 * (and common alternate envelopes).
 */
export function parseOrganizationResponse(data) {
  const candidates = [
    data?.organization,
    data?.data?.organization,
    data?.response?.organization,
    data?.response?.result,
    data?.result,
    data?.data,
    Array.isArray(data?.response?.result) ? data.response.result[0] : null,
    data,
  ].filter(Boolean);

  for (const org of candidates) {
    if (Array.isArray(org)) {
      if (!org.length) continue;
      return parseOrganizationResponse(org[0]);
    }
    if (!isPlainObject(org)) continue;
    const id = pickField(org, [
      'Company',
      'organizationId',
      'orgId',
      'OrganizationID',
      'OrganizationId',
      'org_id',
      'id',
      'companyId',
      'CompanyID',
    ]);
    const name = pickField(org, [
      'organizationName',
      'orgName',
      'OrganizationName',
      'Organization_Name',
      'companyName',
      'CompanyName',
      'Company_Name',
      'name',
      'Name',
      'legalName',
    ]);
    // Zoho v3 /organization uses "Company" as the organisation id (often numeric).
    // Do not treat that id as the display name.
    if (id || name) {
      const nameLooksLikeId = name && id && name === id;
      return { id, name: nameLooksLikeId ? '' : name };
    }
  }
  return { id: '', name: '' };
}

function diagnosticPrimitive(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 80);
  return null;
}

function capZohoMessage(message) {
  if (typeof message !== 'string') return null;
  const cleaned = message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted]')
    .replace(/1000\.[A-Za-z0-9._-]{8,}/g, '[redacted]')
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, 200);
}

/**
 * HTTP status plus Zoho envelope status/code/message. Never includes the raw body.
 */
export function zohoOrgFailureDetails(payload, httpStatus) {
  const meta = zohoEnvelopeMeta(isPlainObject(payload) ? payload : {});
  return {
    httpStatus,
    zohoStatus: diagnosticPrimitive(meta.zohoStatus),
    zohoCode: diagnosticPrimitive(meta.zohoCode),
    zohoMessage: capZohoMessage(meta.zohoMessage),
  };
}

/** Sanitized lastError line. Example: `http 403; code 7074; Error occurred`. */
export function formatZohoOrgLastError(details) {
  if (!details || details.httpStatus == null) return 'Could not verify Zoho organisation';
  const parts = [`http ${details.httpStatus}`];
  if (details.zohoCode != null && String(details.zohoCode) !== '') {
    parts.push(`code ${details.zohoCode}`);
  }
  if (details.zohoMessage) parts.push(details.zohoMessage);
  return parts.join('; ');
}

async function readZohoResponsePayload(res) {
  try {
    if (typeof res.text === 'function') {
      const raw = await res.text();
      if (typeof raw !== 'string' || !raw) return {};
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    }
    if (typeof res.json === 'function') {
      const parsed = await res.json();
      return parsed && typeof parsed === 'object' ? parsed : {};
    }
  } catch {
    return {};
  }
  return {};
}

/**
 * Verify connection via Zoho People organisation API.
 * GET {peopleBaseUrl}/api/v3/organization
 */
export async function fetchZohoOrganization({ location, apiDomain, accessToken }) {
  const peopleBaseUrl = resolveZohoPeopleBaseUrl({ location, apiDomain });
  const endpoint = `${peopleBaseUrl}/api/v3/organization`;
  const res = await fetch(endpoint, {
    method: 'GET',
    headers: zohoAuthHeader(accessToken),
  });

  if (!res.ok) {
    const payload = await readZohoResponsePayload(res);
    const details = zohoOrgFailureDetails(payload, res.status);
    logger.warn(
      { endpointPath: '/api/v3/organization', ...details },
      'Zoho organisation probe failed',
    );
    throw new ApiError(
      502,
      'Could not verify Zoho People organisation',
      'ZOHO_ORG_FETCH_FAILED',
      details,
    );
  }

  const data = await res.json();
  const { id, name } = parseOrganizationResponse(data);
  if (!id && !name) {
    const details = zohoOrgFailureDetails(data, res.status);
    logger.warn(
      { endpointPath: '/api/v3/organization', ...details },
      'Zoho organisation response unusable',
    );
    throw new ApiError(502, 'Zoho organisation response was unusable', 'ZOHO_ORG_UNUSABLE', details);
  }
  // v3 /organization often returns Company id without a display name — that is not actionable.
  return { id, name, peopleBaseUrl, needsAttention: false };
}

function zohoEnvelopeMeta(payload) {
  const response = payload?.response || payload || {};
  return {
    zohoStatus: response.status ?? payload?.status ?? null,
    zohoMessage:
      typeof response.message === 'string'
        ? response.message
        : typeof payload?.message === 'string'
          ? payload.message
          : null,
    zohoCode: response.code ?? payload?.code ?? response.errors?.code ?? null,
  };
}

function isInvalidFormError(payload, httpStatus) {
  const meta = zohoEnvelopeMeta(payload);
  const msg = String(meta.zohoMessage || '').toLowerCase();
  const code = String(meta.zohoCode || '').toLowerCase();
  if (httpStatus === 404) return true;
  if (msg.includes('invalid form') || msg.includes('form name') || msg.includes('not found')) {
    return true;
  }
  if (code.includes('invalid') && code.includes('form')) return true;
  // Zoho forms error status (non-zero) with form wording
  if (meta.zohoStatus !== null && meta.zohoStatus !== 0 && meta.zohoStatus !== '0') {
    if (msg.includes('form') || msg.includes('uri')) return true;
  }
  return false;
}

function isStructurallyIncompatible(payload, rawCount) {
  if (rawCount > 0) return false;
  const hasResult =
    Array.isArray(payload?.response?.result) ||
    Array.isArray(payload?.result) ||
    Array.isArray(payload?.data) ||
    Array.isArray(payload?.records);
  if (!hasResult && isPlainObject(payload)) {
    // Unexpected envelope with no result arrays
    return true;
  }
  return false;
}

function sanitizeZohoRequestUrl(url) {
  try {
    const u = typeof url === 'string' ? new URL(url) : new URL(url.toString());
    u.username = '';
    u.password = '';
    for (const key of [...u.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (
        lower.includes('token') ||
        lower.includes('secret') ||
        lower === 'authorization' ||
        lower === 'authtoken'
      ) {
        u.searchParams.set(key, '[redacted]');
      }
    }
    return u.toString();
  } catch {
    return '[unparseable-url]';
  }
}

function zohoResponseHeadersToObject(headers) {
  if (!headers || typeof headers.forEach !== 'function') return null;
  const out = {};
  headers.forEach((value, key) => {
    const lower = String(key).toLowerCase();
    if (lower === 'authorization' || lower === 'cookie' || lower === 'set-cookie') return;
    out[key] = value;
  });
  return out;
}

function safeZohoErrorCode(error, responseBody) {
  const direct = error?.code;
  if (typeof direct === 'string' || typeof direct === 'number') return String(direct);
  const nested = responseBody?.response?.errors?.code ?? responseBody?.error?.code ?? responseBody?.code;
  if (typeof nested === 'string' || typeof nested === 'number') return String(nested);
  return null;
}

/**
 * Structured failure log for Zoho employee fetches.
 * Logs operation, HTTP status, Zoho error code, and request path only.
 * Never logs response bodies, headers, tokens, or employee fields.
 */
export function logZohoEmployeeFetchDebug({
  phase,
  requestUrl,
  httpStatus,
  responseBody,
  error,
}) {
  const status = httpStatus ?? error?.response?.status ?? null;
  let requestPath = null;
  if (requestUrl) {
    try {
      requestPath = new URL(sanitizeZohoRequestUrl(requestUrl)).pathname;
    } catch {
      requestPath = null;
    }
  }

  logger.error(
    {
      event: 'zoho_employee_fetch',
      phase: phase || 'unknown',
      httpStatus: status,
      errorCode: safeZohoErrorCode(error, responseBody),
      requestPath,
    },
    'Zoho employee fetch failed',
  );
}

async function fetchEmployeePage({ peopleBaseUrl, path, accessToken, sIndex, limit, useRecLimit }) {
  const url = new URL(`${peopleBaseUrl}${path}`);
  url.searchParams.set('sIndex', String(sIndex));
  if (useRecLimit) url.searchParams.set('rec_limit', String(limit));
  else url.searchParams.set('limit', String(limit));

  const requestUrl = sanitizeZohoRequestUrl(url);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: zohoAuthHeader(accessToken),
    });
    const responseHeaders = zohoResponseHeadersToObject(res.headers);
    let payload = {};
    if (typeof res.text === 'function') {
      const rawText = await res.text().catch(() => '');
      if (rawText) {
        try {
          payload = JSON.parse(rawText);
        } catch (parseError) {
          payload = {
            __nonJsonBody: rawText.slice(0, 5000),
            __parseError: parseError?.message ?? 'JSON parse failed',
          };
        }
      }
    } else if (typeof res.json === 'function') {
      payload = await res.json().catch(() => ({}));
    }
    return { res, payload, sanitizedPath: path, requestUrl, responseHeaders };
  } catch (error) {
    if (error && typeof error === 'object') {
      error.zohoRequestUrl = requestUrl;
    }
    throw error;
  }
}

/**
 * Paginated employee fetch. Primary: employee getRecords.
 * Controlled fallback: P_EmployeeView when primary is invalid-form / incompatible.
 */
export async function fetchAllZohoEmployees({ location, apiDomain, accessToken, pageSize = 200 }) {
  const peopleBaseUrl = resolveZohoPeopleBaseUrl({ location, apiDomain });
  const limit = Math.min(Math.max(pageSize, 1), 200);

  let path = PRIMARY_PATH;
  let useRecLimit = false;
  let endpointUsed = PRIMARY_PATH;
  let firstHttpStatus = null;
  let firstMeta = { zohoStatus: null, zohoMessage: null, zohoCode: null };
  let firstFieldKeys = [];

  try {
    // Probe first page of primary; maybe switch to fallback once (never both on every page).
    let cachedFirstPayload = null;
    let cachedFirstRequestUrl = null;
    let cachedFirstResponseHeaders = null;
    {
      const first = await fetchEmployeePage({
        peopleBaseUrl,
        path: PRIMARY_PATH,
        accessToken,
        sIndex: 1,
        limit,
        useRecLimit: false,
      });
      firstHttpStatus = first.res.status;
      firstMeta = zohoEnvelopeMeta(first.payload);
      const primaryRaw = extractEmployeeRecords(first.payload);

      const primaryFailedHttp = !first.res.ok;
      const primaryInvalidForm = isInvalidFormError(first.payload, first.res.status);
      const primaryIncompatible = isStructurallyIncompatible(first.payload, primaryRaw.length);
      const primaryApiErrorEmpty =
        firstMeta.zohoStatus !== null &&
        firstMeta.zohoStatus !== 0 &&
        firstMeta.zohoStatus !== '0' &&
        primaryRaw.length === 0;

      const shouldFallback =
        primaryFailedHttp ||
        primaryInvalidForm ||
        (primaryRaw.length === 0 && primaryIncompatible) ||
        primaryApiErrorEmpty;

      if (shouldFallback) {
        logZohoEmployeeFetchDebug({
          phase: 'primary_probe_before_fallback',
          requestUrl: first.requestUrl,
          httpStatus: first.res.status,
          responseBody: first.payload,
          responseHeaders: first.responseHeaders,
        });

        const fallback = await fetchEmployeePage({
          peopleBaseUrl,
          path: FALLBACK_PATH,
          accessToken,
          sIndex: 1,
          limit,
          useRecLimit: true,
        });
        path = FALLBACK_PATH;
        useRecLimit = true;
        endpointUsed = FALLBACK_PATH;
        firstHttpStatus = fallback.res.status;
        firstMeta = zohoEnvelopeMeta(fallback.payload);
        cachedFirstPayload = fallback.payload;
        cachedFirstRequestUrl = fallback.requestUrl;
        cachedFirstResponseHeaders = fallback.responseHeaders;

        if (!fallback.res.ok) {
          logZohoEmployeeFetchDebug({
            phase: 'fallback_http_failed',
            requestUrl: fallback.requestUrl,
            httpStatus: fallback.res.status,
            responseBody: fallback.payload,
            responseHeaders: fallback.responseHeaders,
          });
          logger.warn(
            {
              endpointPath: endpointUsed,
              httpStatus: fallback.res.status,
              zohoStatus: firstMeta.zohoStatus,
              zohoCode: firstMeta.zohoCode,
              zohoMessage: firstMeta.zohoMessage,
            },
            'Zoho employee fetch failed',
          );
          throw new ApiError(502, 'Failed to fetch Zoho employees', 'ZOHO_EMPLOYEE_FETCH_FAILED');
        }
      } else {
        cachedFirstPayload = first.payload;
        cachedFirstRequestUrl = first.requestUrl;
        cachedFirstResponseHeaders = first.responseHeaders;
      }
    }

    const employees = [];
    let sIndex = 1;
    let guard = 0;
    let rawCount = 0;
    let reuseFirst = Boolean(cachedFirstPayload);
    let lastRequestUrl = cachedFirstRequestUrl;
    let lastResponseHeaders = cachedFirstResponseHeaders;

    while (guard < 500) {
      guard += 1;
      let pagePayload;
      let pageHttpStatus = firstHttpStatus;

      if (reuseFirst) {
        pagePayload = cachedFirstPayload;
        reuseFirst = false;
      } else {
        const page = await fetchEmployeePage({
          peopleBaseUrl,
          path,
          accessToken,
          sIndex,
          limit,
          useRecLimit,
        });
        pageHttpStatus = page.res.status;
        lastRequestUrl = page.requestUrl;
        lastResponseHeaders = page.responseHeaders;
        if (!page.res.ok) {
          logZohoEmployeeFetchDebug({
            phase: 'page_http_failed',
            requestUrl: page.requestUrl,
            httpStatus: page.res.status,
            responseBody: page.payload,
            responseHeaders: page.responseHeaders,
          });
          logger.warn(
            {
              endpointPath: endpointUsed,
              httpStatus: page.res.status,
              ...zohoEnvelopeMeta(page.payload),
            },
            'Zoho employee page fetch failed',
          );
          throw new ApiError(502, 'Failed to fetch Zoho employees', 'ZOHO_EMPLOYEE_FETCH_FAILED');
        }
        pagePayload = page.payload;
      }

      const meta = zohoEnvelopeMeta(pagePayload);
      if (meta.zohoStatus !== null && meta.zohoStatus !== 0 && meta.zohoStatus !== '0') {
        const batchCheck = extractEmployeeRecords(pagePayload);
        if (!batchCheck.length) {
          logZohoEmployeeFetchDebug({
            phase: 'forms_api_error',
            requestUrl: lastRequestUrl,
            httpStatus: pageHttpStatus,
            responseBody: pagePayload,
            responseHeaders: lastResponseHeaders,
          });
          logger.warn(
            { endpointPath: endpointUsed, httpStatus: pageHttpStatus, ...meta },
            'Zoho employee forms API error',
          );
          throw new ApiError(502, 'Failed to fetch Zoho employees', 'ZOHO_EMPLOYEE_FETCH_FAILED');
        }
      }

      const rawBatch = extractEmployeeRecords(pagePayload);
      rawCount += rawBatch.length;
      if (!rawBatch.length) break;

      if (!firstFieldKeys.length && isPlainObject(rawBatch[0])) {
        firstFieldKeys = Object.keys(rawBatch[0]).slice(0, 40);
      }

      for (const raw of rawBatch) {
        const mapped = mapEmployeeRecord(raw);
        if (!mapped.ok) {
          employees.push({ __skipReason: mapped.reason });
          continue;
        }
        employees.push(mapped.record);
      }

      if (rawBatch.length < limit) break;
      sIndex += limit;
    }

    logger.info(
      {
        endpointPath: endpointUsed,
        httpStatus: firstHttpStatus,
        zohoStatus: firstMeta.zohoStatus,
        zohoCode: firstMeta.zohoCode,
        zohoMessage: firstMeta.zohoMessage,
        rawRecordCount: rawCount,
        normalizedCount: employees.filter((e) => !e.__skipReason).length,
        firstRecordFieldKeys: firstFieldKeys,
      },
      'Zoho employee fetch diagnostics',
    );

    return {
      employees,
      diagnostics: {
        endpointPath: endpointUsed,
        httpStatus: firstHttpStatus,
        ...firstMeta,
        rawRecordCount: rawCount,
      },
    };
  } catch (error) {
    if (error instanceof ApiError && error.code === 'ZOHO_EMPLOYEE_FETCH_FAILED') {
      throw error;
    }
    logZohoEmployeeFetchDebug({
      phase: 'fetch_exception',
      requestUrl: error?.zohoRequestUrl || `${peopleBaseUrl}${endpointUsed}`,
      httpStatus: error?.response?.status,
      responseBody: error?.response?.data,
      error,
    });
    throw new ApiError(502, 'Failed to fetch Zoho employees', 'ZOHO_EMPLOYEE_FETCH_FAILED');
  }
}
