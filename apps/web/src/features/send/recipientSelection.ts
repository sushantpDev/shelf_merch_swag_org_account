import type { UiContact } from "@/services/mappers";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MANUAL_RECIPIENT_PREFIX = "email:";

/** Optional shipping fields for CSV / manual email recipients. */
export type RecipientAddressInput = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
};

/** Full contact-profile fields (matches Contacts page / CSV template). */
export type RecipientProfileInput = {
  name?: string;
  phone?: string;
  role?: string;
  department?: string;
  employeeCode?: string;
  address?: RecipientAddressInput;
};

export type CsvRecipientRow = {
  email: string;
} & RecipientProfileInput;

const CSV_FIELD_ALIASES: Record<string, string[]> = {
  name: ["name", "full name", "employee name", "contact name", "display name"],
  email: ["email", "email address", "work email", "e mail", "mail"],
  phone: ["phone", "phone number", "mobile", "mobile number", "contact number", "cell"],
  role: ["role", "permission", "user role", "access"],
  department: ["department", "dept", "team", "division"],
  employeeCode: [
    "employeecode",
    "employee code",
    "employee id",
    "employee",
    "emp id",
    "emp code",
    "staff id",
  ],
  addressLine1: ["address", "address line 1", "address1", "street", "street address", "home address", "line1"],
  addressLine2: ["address line 2", "address2", "line2", "apt", "suite", "unit"],
  city: ["city", "town"],
  state: ["state", "province", "region"],
  pincode: ["pincode", "pin code", "zip", "zip code", "postal code", "postcode"],
  country: ["country", "nation"],
};

const CONTACT_ROLES = new Set(["Owner", "Admin", "Sender", "Member", "Non-Member"]);

function normalizeCountry(raw: string): string {
  const value = String(raw || "").trim();
  if (!value) return "IN";
  const key = value.toLowerCase();
  if (key === "in" || key === "india" || key === "ind") return "IN";
  if (key === "ae" || key === "uae" || key.includes("arab emirates")) return "AE";
  if (key === "us" || key === "usa" || key === "united states" || key === "united states of america") {
    return "US";
  }
  return value.length <= 3 ? value.toUpperCase() : value;
}

function normalizeRole(raw: string): string {
  const value = String(raw || "").trim();
  if (!value) return "Member";
  const match = [...CONTACT_ROLES].find((role) => role.toLowerCase() === value.toLowerCase());
  return match || "Member";
}

export function isManualRecipientId(id: string): boolean {
  return id.startsWith(MANUAL_RECIPIENT_PREFIX);
}

export function manualRecipientId(email: string): string {
  return `${MANUAL_RECIPIENT_PREFIX}${email.trim().toLowerCase()}`;
}

export function emailFromManualRecipientId(id: string): string {
  return id.slice(MANUAL_RECIPIENT_PREFIX.length);
}

export function isValidRecipientEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim().toLowerCase());
}

export function normalizeRecipientEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeCsvHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .replace(/[()]+/g, "")
    .trim();
}

function headerEqualsAlias(header: string, alias: string): boolean {
  return normalizeCsvHeader(header) === normalizeCsvHeader(alias);
}

/** Truncated headers only (e.g. "Departmen" → "department", "Employee" → "employee code"). */
function headerFuzzyAlias(header: string, alias: string): boolean {
  const h = normalizeCsvHeader(header);
  const a = normalizeCsvHeader(alias);
  if (!h || h === a) return false;
  return h.length >= 5 && a.startsWith(h) && h.length < a.length;
}

export function formatRecipientLoc(parts: {
  city?: string;
  state?: string;
  country?: string;
}): string {
  const loc = [parts.city, parts.state, parts.country === "IN" ? "IN" : parts.country]
    .filter(Boolean)
    .join(", ");
  return loc || "N/A";
}

export function hasCompleteRecipientAddress(contact: Pick<UiContact, "address" | "city" | "state" | "pincode">): boolean {
  return Boolean(contact.address?.trim() && contact.city?.trim() && contact.state?.trim() && contact.pincode?.trim());
}

export function applyProfileToContact(
  contact: UiContact,
  profile?: RecipientProfileInput | null,
): UiContact {
  const address = profile?.address;
  const line1 = String(address?.line1 ?? contact.address ?? "").trim();
  const city = String(address?.city ?? contact.city ?? "").trim();
  const state = String(address?.state ?? contact.state ?? "").trim();
  const pincode = String(address?.pincode ?? contact.pincode ?? "").trim();
  const country = normalizeCountry(
    String(address?.country ?? contact.country ?? "IN"),
  );
  const name = String(profile?.name ?? contact.name ?? "").trim() || contact.name;
  const phone =
    profile?.phone !== undefined ? String(profile.phone || "").trim() : contact.phone || "";
  const role =
    profile?.role !== undefined ? normalizeRole(profile.role) : contact.role || "Member";
  const department =
    profile?.department !== undefined
      ? String(profile.department || "").trim()
      : contact.department || "";
  const employeeCode =
    profile?.employeeCode !== undefined
      ? String(profile.employeeCode || "").trim()
      : contact.employeeCode || "";
  return {
    ...contact,
    name,
    phone,
    role,
    department,
    employeeCode,
    address: line1,
    city,
    state,
    pincode,
    country,
    loc: formatRecipientLoc({ city, state, country }),
  };
}

/** @deprecated Prefer applyProfileToContact */
export function applyAddressToContact(
  contact: UiContact,
  address?: RecipientAddressInput | null,
  extras?: { name?: string; phone?: string; role?: string; department?: string; employeeCode?: string },
): UiContact {
  return applyProfileToContact(contact, {
    name: extras?.name,
    phone: extras?.phone,
    role: extras?.role,
    department: extras?.department,
    employeeCode: extras?.employeeCode,
    address: address || undefined,
  });
}

export function profileHasDetails(profile?: RecipientProfileInput | null): boolean {
  if (!profile) return false;
  return Boolean(
    profile.name?.trim()
      || profile.phone?.trim()
      || profile.role?.trim()
      || profile.department?.trim()
      || profile.employeeCode?.trim()
      || profile.address?.line1?.trim()
      || profile.address?.city?.trim()
      || profile.address?.state?.trim()
      || profile.address?.pincode?.trim()
      || profile.address?.country?.trim(),
  );
}

/** Split pasted text into candidate email strings. */
export function parseEmailInput(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Parse CSV text — email column by header when present, else first column / bare email. */
export function parseCsvEmails(text: string): string[] {
  return parseCsvRecipientRows(text).map((row) => row.email);
}

/**
 * Parse CSV rows with optional name/phone/address columns (contacts template compatible).
 * Falls back to email-only rows when no header is present.
 */
export function parseCsvRecipientRows(text: string): CsvRecipientRow[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];

  const headerCells = splitCsvLine(lines[0]).map((c) => normalizeCsvHeader(c));
  const emailCol = headerCells.findIndex(
    (cell) => cell === "email" || cell.includes("email"),
  );
  const hasHeader = emailCol >= 0;
  const start = hasHeader ? 1 : 0;
  const colByField = new Map<string, number>();

  if (hasHeader) {
    const claimed = new Set<number>();
    const claim = (field: string, idx: number) => {
      if (idx < 0 || claimed.has(idx) || colByField.has(field)) return false;
      colByField.set(field, idx);
      claimed.add(idx);
      return true;
    };

    for (const [field, aliases] of Object.entries(CSV_FIELD_ALIASES)) {
      for (const alias of aliases) {
        const idx = headerCells.findIndex((cell, i) => !claimed.has(i) && headerEqualsAlias(cell, alias));
        if (claim(field, idx)) break;
      }
    }
    for (const [field, aliases] of Object.entries(CSV_FIELD_ALIASES)) {
      if (colByField.has(field)) continue;
      for (const alias of aliases) {
        const idx = headerCells.findIndex((cell, i) => !claimed.has(i) && headerFuzzyAlias(cell, alias));
        if (claim(field, idx)) break;
      }
    }
    const firstIdx = headerCells.findIndex(
      (cell, i) =>
        !claimed.has(i)
        && (cell === "first name" || cell === "firstname" || cell.startsWith("first")),
    );
    const lastIdx = headerCells.findIndex(
      (cell, i) =>
        !claimed.has(i)
        && (cell === "last name" || cell === "lastname" || cell.startsWith("last")),
    );
    if (!colByField.has("name") && firstIdx >= 0) {
      claim("firstName", firstIdx);
      if (lastIdx >= 0) claim("lastName", lastIdx);
    }
  } else {
    colByField.set("email", 0);
  }

  const pick = (cells: string[], field: string) => {
    const idx = colByField.get(field);
    if (idx == null) return "";
    return (cells[idx] ?? "").trim();
  };

  const rows: CsvRecipientRow[] = [];
  for (let i = start; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]);
    const email = pick(cells, "email") || (!hasHeader ? (cells[0] ?? "").trim() : "");
    if (!email) continue;

    let name = pick(cells, "name");
    if (!name && colByField.has("firstName")) {
      name = [pick(cells, "firstName"), pick(cells, "lastName")].filter(Boolean).join(" ").trim();
    }

    const line1 = pick(cells, "addressLine1");
    const line2 = pick(cells, "addressLine2");
    const city = pick(cells, "city");
    const state = pick(cells, "state");
    const pincode = pick(cells, "pincode");
    const country = pick(cells, "country");
    const hasAddress = Boolean(line1 || line2 || city || state || pincode || country);
    const phone = pick(cells, "phone");
    const role = pick(cells, "role");
    const department = pick(cells, "department");
    const employeeCode = pick(cells, "employeeCode");

    rows.push({
      email,
      name: name || undefined,
      phone: phone || undefined,
      role: role || undefined,
      department: department || undefined,
      employeeCode: employeeCode || undefined,
      address: hasAddress
        ? {
            line1,
            line2,
            city,
            state,
            pincode,
            country: normalizeCountry(country),
          }
        : undefined,
    });
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

export function contactForManualEmail(
  email: string,
  extras?: RecipientProfileInput,
): UiContact {
  const normalized = normalizeRecipientEmail(email);
  const base: UiContact = {
    id: manualRecipientId(normalized),
    email: normalized,
    name: normalized.split("@")[0] || normalized,
    role: "Member",
    address: "",
    loc: "N/A",
    phone: "",
    department: "",
    employeeCode: "",
  };
  return extras ? applyProfileToContact(base, extras) : base;
}

export function resolveRecipientId(
  email: string,
  contacts: UiContact[],
): string | null {
  const normalized = normalizeRecipientEmail(email);
  if (!isValidRecipientEmail(normalized)) return null;
  const existing = contacts.find((c) => normalizeRecipientEmail(c.email) === normalized);
  return existing?.id ?? manualRecipientId(normalized);
}

export function selectedEmails(
  selectedIds: string[],
  contacts: UiContact[],
): Set<string> {
  const emails = new Set<string>();
  for (const id of selectedIds) {
    if (isManualRecipientId(id)) {
      emails.add(emailFromManualRecipientId(id));
      continue;
    }
    const contact = contacts.find((c) => c.id === id);
    if (contact) emails.add(normalizeRecipientEmail(contact.email));
  }
  return emails;
}

export function mergePickerContacts(
  contacts: UiContact[],
  selectedIds: string[],
  overlays: Record<string, UiContact> = {},
): UiContact[] {
  const byEmail = new Map(
    contacts.map((c) => [normalizeRecipientEmail(c.email), applyOverlay(c, overlays)]),
  );
  const rows = contacts.map((c) => applyOverlay(c, overlays));

  for (const id of selectedIds) {
    if (!isManualRecipientId(id)) continue;
    const email = emailFromManualRecipientId(id);
    if (byEmail.has(email)) continue;
    const overlay = overlays[email] || overlays[id];
    const row = overlay
      ? { ...overlay, id: manualRecipientId(email), email }
      : contactForManualEmail(email);
    rows.push(row);
    byEmail.set(email, row);
  }

  // Include overlay-only contacts that were enriched before selection merge.
  for (const [email, overlay] of Object.entries(overlays)) {
    if (!email.includes("@")) continue;
    if (byEmail.has(normalizeRecipientEmail(email))) continue;
    if (!selectedIds.includes(overlay.id) && !selectedIds.includes(manualRecipientId(email))) {
      continue;
    }
    rows.push(overlay);
    byEmail.set(normalizeRecipientEmail(email), overlay);
  }

  return rows;
}

function applyOverlay(contact: UiContact, overlays: Record<string, UiContact>): UiContact {
  const email = normalizeRecipientEmail(contact.email);
  const overlay = overlays[email] || overlays[contact.id];
  if (!overlay) return contact;
  return {
    ...contact,
    ...overlay,
    id: contact.id,
    email: contact.email,
  };
}

export type AddRecipientsResult = {
  added: string[];
  invalid: string[];
  duplicates: string[];
  truncated: number;
};

/** Add emails up to the remaining recipient slots, deduping across methods. */
export function addRecipientsUpToLimit(
  emails: string[],
  selectedIds: string[],
  contacts: UiContact[],
  maxRecipients: number,
  sharedProfile?: RecipientProfileInput,
): { ids: string[]; result: AddRecipientsResult; overlays: Record<string, UiContact> } {
  const rows: CsvRecipientRow[] = emails.map((email) => ({
    email,
    ...sharedProfile,
  }));
  return addRecipientRowsUpToLimit(rows, selectedIds, contacts, maxRecipients);
}

/** Add CSV/manual recipient rows (with optional per-row profile) up to the limit. */
export function addRecipientRowsUpToLimit(
  rows: CsvRecipientRow[],
  selectedIds: string[],
  contacts: UiContact[],
  maxRecipients: number,
): { ids: string[]; result: AddRecipientsResult; overlays: Record<string, UiContact> } {
  const result: AddRecipientsResult = {
    added: [],
    invalid: [],
    duplicates: [],
    truncated: 0,
  };
  const next = [...selectedIds];
  const knownEmails = selectedEmails(next, contacts);
  const limit = Math.max(0, maxRecipients);
  const overlays: Record<string, UiContact> = {};

  for (const row of rows) {
    const id = resolveRecipientId(row.email, contacts);
    if (!id) {
      result.invalid.push(row.email);
      continue;
    }
    const email = isManualRecipientId(id)
      ? emailFromManualRecipientId(id)
      : normalizeRecipientEmail(contacts.find((c) => c.id === id)?.email ?? row.email);

    const profile: RecipientProfileInput = {
      name: row.name,
      phone: row.phone,
      role: row.role,
      department: row.department,
      employeeCode: row.employeeCode,
      address: row.address,
    };
    const existing = contacts.find((c) => c.id === id)
      || contacts.find((c) => normalizeRecipientEmail(c.email) === email);
    const base = existing
      ? applyProfileToContact(existing, profile)
      : contactForManualEmail(email, profile);

    // Already selected: still refresh profile/address from CSV so DB upsert can catch up.
    if (knownEmails.has(email) || next.includes(id)) {
      result.duplicates.push(row.email);
      if (profileHasDetails(profile)) {
        overlays[email] = { ...base, id: existing?.id ?? id };
      }
      continue;
    }

    if (next.length >= limit) {
      result.truncated += 1;
      continue;
    }

    next.push(id);
    knownEmails.add(email);
    result.added.push(email);
    if (profileHasDetails(profile)) {
      overlays[email] = { ...base, id };
    }
  }

  return { ids: next, result, overlays };
}

export function selectAllRecipientIds(
  contacts: UiContact[],
  selectedIds: string[],
  maxRecipients: number,
): string[] {
  const limit = Math.max(0, maxRecipients);
  const next = [...selectedIds];
  const knownEmails = selectedEmails(next, contacts);

  for (const contact of contacts) {
    if (next.length >= limit) break;
    const email = normalizeRecipientEmail(contact.email);
    if (next.includes(contact.id) || knownEmails.has(email)) continue;
    next.push(contact.id);
    knownEmails.add(email);
  }

  return next;
}
