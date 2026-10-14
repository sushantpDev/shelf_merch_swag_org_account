import { useRef, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { COUNTRY_OPTIONS } from "@/data/countries";
import type { UiContact } from "@/services/mappers";
import type { SendMode, SingleLocation } from "./types";
import {
  locFieldKindForKey,
  sanitizeLocField,
  validateLocField,
  type LocFieldKind,
} from "./singleLocationValidation";
import { CountrySelect } from "./CountrySelect";

const MODE_CARDS: Array<[SendMode, string, string]> = [
  [
    "redeem",
    "Recipients redeem",
    "Recipients choose size, colour & shipping address from a private link.",
  ],
  [
    "surprise",
    "Surprise recipients",
    "Enter recipient details up front so gifts ship without input.",
  ],
  ["single", "Single location", "Ship all units to one office, event venue or address."],
];

const COUNTRY_ALIASES: Record<string, string> = {
  IND: "IN",
  USA: "US",
  UK: "GB",
  UAE: "AE",
};

function recipientInitials(contact: UiContact) {
  const name = (contact.name || "").trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
  }
  return (contact.email[0] ?? "?").toUpperCase();
}

function recipientAvatarTone(seed: string) {
  const tones = [
    { bg: "#ede9fe", fg: "#5b21b6" },
    { bg: "#dbeafe", fg: "#1d4ed8" },
    { bg: "#fce7f3", fg: "#9d174d" },
    { bg: "#d1fae5", fg: "#047857" },
    { bg: "#ffedd5", fg: "#c2410c" },
    { bg: "#e0f2fe", fg: "#0369a1" },
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash + seed.charCodeAt(i) * 17) % tones.length;
  return tones[hash];
}

function countryDisplay(code?: string) {
  const raw = (code || "").trim();
  if (!raw) return null;
  const upper = COUNTRY_ALIASES[raw.toUpperCase()] || raw.toUpperCase();
  const byCode = COUNTRY_OPTIONS.find((country) => country.value === upper);
  const byLabel = COUNTRY_OPTIONS.find((country) => country.label.toLowerCase() === raw.toLowerCase());
  const match = byCode || byLabel;
  if (match) return { iso: match.value.toLowerCase(), label: match.label };
  if (/^[A-Z]{2}$/.test(upper)) return { iso: upper.toLowerCase(), label: raw };
  return { iso: "", label: raw };
}

function countryFlagSrc(iso: string) {
  return `https://cdn.jsdelivr.net/gh/HatScripts/circle-flags@2.7.0/flags/${iso}.svg`;
}

function emptyCell(value?: string) {
  const v = (value ?? "").trim();
  return v ? v : "N/A";
}

/** Shared recipient picker (Send Items + Send Points). */
export function RecipientPicker({
  title,
  subtitle,
  contacts,
  selected,
  onToggle,
  onDeselectAll,
  onSelectAll,
  onAddEmails,
  onCsvImport,
  maxRecipients,
  showModes = false,
  mode = "redeem",
  onMode,
  singleLocation,
  onSingleLocationChange,
  showErrors = false,
}: {
  title: string;
  subtitle: string;
  contacts: UiContact[];
  selected: string[];
  onToggle: (id: string) => void;
  onDeselectAll: () => void;
  onSelectAll?: () => void;
  onAddEmails?: (raw: string) => void;
  onCsvImport?: (file: File) => void;
  maxRecipients?: number;
  showModes?: boolean;
  mode?: SendMode;
  onMode?: (mode: SendMode) => void;
  singleLocation?: SingleLocation;
  onSingleLocationChange?: (key: keyof SingleLocation, value: string) => void;
  showErrors?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const csvInputRef = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();
  const rows = q
    ? contacts.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
    : contacts;
  const atLimit = Boolean(maxRecipients && selected.length >= maxRecipients);
  const remainingRequired = maxRecipients ? Math.max(0, maxRecipients - selected.length) : 0;

  const loc = singleLocation;

  function handleAddEmails() {
    if (!onAddEmails) return;
    const raw = emailDraft.trim();
    if (!raw) {
      toast.error("Enter at least one email address");
      return;
    }
    onAddEmails(raw);
    setEmailDraft("");
    setShowEmailInput(false);
  }

  function handleCsvChange(file: File | undefined) {
    if (!file || !onCsvImport) return;
    onCsvImport(file);
    if (csvInputRef.current) csvInputRef.current.value = "";
  }

  return (
    <>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>{title}</h1>
      <p className="muted" style={{ marginBottom: 18 }}>
        {subtitle}
      </p>

      {showModes && onMode && (
        <div className="grid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 18 }}>
          {MODE_CARDS.map(([key, t, d]) => (
            <button
              key={key}
              type="button"
              className={`optcard ${mode === key ? "on" : ""}`}
              onClick={() => onMode(key)}
            >
              <div className="rd" />
              <div>
                <h4>{t}</h4>
                <p>{d}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {showModes && mode === "single" && loc && onSingleLocationChange && (
        <div className="card" style={{ padding: 20, marginBottom: 18 }}>
          <h3 style={{ fontSize: 16, marginBottom: 5 }}>Single delivery location</h3>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
            All selected recipients' gifts will ship together to this address. A notification will
            be sent to the email below.
          </p>
          <div className="row">
            <LocField label="Contact name" k="name" kind="personName" required showErrors={showErrors} loc={loc} onChange={onSingleLocationChange} />
            <LocField
              label="Notification email"
              k="email"
              kind="email"
              type="email"
              required
              showErrors={showErrors}
              loc={loc}
              onChange={onSingleLocationChange}
            />
            <LocField
              label="Phone"
              k="phone"
              kind="phone"
              required
              showErrors={showErrors}
              loc={loc}
              onChange={onSingleLocationChange}
            />
          </div>
          <LocField label="Address" k="line1" kind="address" required showErrors={showErrors} loc={loc} onChange={onSingleLocationChange} block />
          <LocField
            label="Address line 2 (optional)"
            k="line2"
            kind="address"
            showErrors={showErrors}
            loc={loc}
            onChange={onSingleLocationChange}
            block
          />
          <div className="row">
            <LocField label="City" k="city" kind="city" required showErrors={showErrors} loc={loc} onChange={onSingleLocationChange} />
            <LocField label="State" k="state" kind="state" required showErrors={showErrors} loc={loc} onChange={onSingleLocationChange} />
            <LocField
              label="PIN / Postal code"
              k="pincode"
              kind="postal"
              required
              showErrors={showErrors}
              loc={loc}
              onChange={onSingleLocationChange}
            />
            <CountrySelect
              value={loc.country || "IN"}
              onChange={(value) => onSingleLocationChange("country", value)}
              required
            />
          </div>
        </div>
      )}

      <div className="recipient-table-card">
        <div className="recipient-table-toolbar">
          <span className="recipient-table-count">
            {selected.length}
            {maxRecipients ? ` / ${maxRecipients}` : ""} selected
          </span>
          {onSelectAll ? (
            <button
              type="button"
              className="recipient-table-action"
              disabled={atLimit}
              onClick={onSelectAll}
            >
              Select all
            </button>
          ) : null}
          <button type="button" className="recipient-table-action" onClick={onDeselectAll}>
            Deselect all
          </button>
          <button
            type="button"
            className="recipient-table-action"
            disabled={atLimit || !onAddEmails}
            onClick={() => setShowEmailInput((open) => !open)}
          >
            Input emails
          </button>
          <button
            type="button"
            className="recipient-table-action"
            disabled={atLimit || !onCsvImport}
            onClick={() => csvInputRef.current?.click()}
          >
            Add by CSV
          </button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={(e) => handleCsvChange(e.target.files?.[0])}
          />
          <label className="recipient-table-search">
            <Search size={16} aria-hidden="true" />
            <input
              placeholder="Search by name or email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search recipients"
            />
          </label>
        </div>

        {showEmailInput && onAddEmails ? (
          <div className="recipient-table-email-panel">
            <label className="lbl">Paste email addresses</label>
            <textarea
              className="inp"
              rows={3}
              placeholder="Separate emails with commas, spaces, or new lines"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
            />
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <button type="button" className="btn btn-brand btn-sm" onClick={handleAddEmails}>
                Add recipients
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setShowEmailInput(false);
                  setEmailDraft("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {maxRecipients && remainingRequired > 0 ? (
          <p className="recipient-table-limit">
            Select {remainingRequired} more {remainingRequired === 1 ? "recipient" : "recipients"} to continue.
          </p>
        ) : atLimit && maxRecipients ? (
          <p className="recipient-table-limit">
            Recipient limit reached ({maxRecipients}). Deselect someone to add more.
          </p>
        ) : null}

        {rows.length === 0 ? (
          <div className="recipient-table-empty">
            {contacts.length ? "No recipients match your search." : "No recipients yet."}
          </div>
        ) : (
          <div className="recipient-table-wrap">
            <table className="recipient-table">
          <thead>
            <tr>
              <th className="recipient-table-th-check" />
              <th>Person</th>
              <th>Group</th>
              <th>Country</th>
              <th>Home address</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const on = selected.includes(c.id);
              const disabled = atLimit && !on;
              const tone = recipientAvatarTone(c.id || c.email || c.name);
              const country = countryDisplay(c.country);
              return (
                <tr key={c.id} className={on ? "is-selected" : undefined}>
                  <td className="recipient-table-td-check">
                    <button
                      type="button"
                      className="recipient-table-check"
                      aria-pressed={on}
                      aria-label={`${on ? "Deselect" : "Select"} ${c.name || c.email}`}
                      disabled={disabled}
                      onClick={() => onToggle(c.id)}
                    >
                      {on && <span style={{ color: "#fff", fontSize: 11 }}>✓</span>}
                    </button>
                  </td>
                  <td>
                    <div className="recipient-table-person">
                      <span
                        className="recipient-table-avatar"
                        style={{ backgroundColor: tone.bg, color: tone.fg }}
                        aria-hidden="true"
                      >
                        {recipientInitials(c)}
                      </span>
                      <span className="recipient-table-copy">
                        <span className="recipient-table-name">{emptyCell(c.name)}</span>
                        <span className="recipient-table-email">{c.email}</span>
                      </span>
                    </div>
                  </td>
                  <td className="recipient-table-muted">{emptyCell(c.department)}</td>
                  <td>
                    {country ? (
                      <span className="recipient-table-country">
                        {country.iso ? (
                          <img
                            className="recipient-table-flag"
                            src={countryFlagSrc(country.iso)}
                            alt=""
                            width={18}
                            height={18}
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : null}
                        {country.label}
                      </span>
                    ) : (
                      <span className="recipient-table-muted">N/A</span>
                    )}
                  </td>
                  <td className="recipient-table-muted">{emptyCell(c.loc)}</td>
                </tr>
              );
            })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export { CountrySelect } from "./CountrySelect";

export function LocField({
  label,
  k,
  loc,
  onChange,
  type = "text",
  block = false,
  kind,
  required = false,
  showErrors = false,
}: {
  label: string;
  k: keyof SingleLocation;
  loc: SingleLocation;
  onChange: (key: keyof SingleLocation, value: string) => void;
  type?: string;
  block?: boolean;
  kind?: LocFieldKind;
  required?: boolean;
  showErrors?: boolean;
}) {
  const [touched, setTouched] = useState(false);
  const resolvedKind = kind ?? locFieldKindForKey(k);
  const inputMode =
    resolvedKind === "phone" || resolvedKind === "postal"
      ? "numeric"
      : resolvedKind === "email"
        ? "email"
        : undefined;

  function handleChange(raw: string) {
    const next = resolvedKind ? sanitizeLocField(resolvedKind, raw) : raw;
    onChange(k, next);
  }

  const inputType = resolvedKind === "phone" ? "tel" : type;
  const value = loc[k] || "";
  const error = validateLocField(k, loc);
  const hasValue = value.trim().length > 0;
  const showFieldError = Boolean(error && (showErrors || touched || hasValue));
  const errorId = `${k}-error`;

  return (
    <div className="field" style={block ? undefined : { flex: 1 }}>
      <label className="lbl">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        className={`inp${showFieldError ? " inp--invalid" : ""}`}
        type={inputType}
        inputMode={inputMode}
        maxLength={resolvedKind === "phone" ? 10 : resolvedKind === "postal" ? 10 : undefined}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => setTouched(true)}
        aria-invalid={showFieldError}
        aria-describedby={showFieldError ? errorId : undefined}
      />
      {showFieldError ? (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
