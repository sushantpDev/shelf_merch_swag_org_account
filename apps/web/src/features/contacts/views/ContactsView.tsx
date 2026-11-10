import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  Check,
  ChevronDown,
  HelpCircle,
  MoreHorizontal,
  Plus,
  Plug,
  Search,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { COUNTRY_OPTIONS } from "@/data/countries";
import { LoadingState } from "@/components/LoadingState";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NextStepDialog } from "@/components/NextStepDialog";
import { ContactFormDialog } from "../ContactFormDialog";
import { ROLES, contactWorkerStatus } from "../types";
import type { UiContact } from "../model";
import {
  type ContactsVm,
  type SortDir,
  type SortKey,
  type WorkerStatusFilter,
} from "../controllers/useContactsController";
import contactsAddArt from "../../../../assets/contacts-hris-rounded.png";
import "../contacts-page.css";

function contactsAddedDescription(count: number) {
  if (count <= 0) return "Your contacts have been successfully added.";
  const formatted = count.toLocaleString("en-IN");
  return count === 1
    ? "1 contact has been added."
    : `${formatted} contacts have been added.`;
}

const CONTACTS_ADDED_DETAIL =
  "You can now create a campaign and send points or kits to your team.";

const WORKER_TYPE_OPTIONS: [string, string][] = [
  ["all", "All worker types"],
  ["Owner", "Owner"],
  ["Admin", "Admin"],
  ["Sender", "Sender"],
  ["Member", "Member"],
  ["Non-Member", "Non-Member"],
];

const STATUS_OPTIONS: [WorkerStatusFilter, string][] = [
  ["all", "All statuses"],
  ["active", "Active"],
  ["invited", "Invited"],
  ["inactive", "No active contracts"],
];

const SORT_OPTIONS: [SortDir, string][] = [
  ["asc", "A–Z"],
  ["desc", "Z–A"],
];

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function permissionLabel(role: string) {
  if (role === "Owner") return "Owner";
  if (role === "Admin") return "Admin";
  if (role === "Sender") return "Sender";
  if (role === "Member") return "Member";
  return "Non-Member";
}

function avatarTone(seed: string) {
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

function initials(contact: UiContact) {
  const name = (contact.name || "").trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
  }
  return (contact.email[0] ?? "?").toUpperCase();
}

function emptyCell(value?: string) {
  const v = (value ?? "").trim();
  return v ? v : "—";
}

function personSubtitle(contact: UiContact) {
  const title = (contact.designation || "").trim();
  return title || "Not specified";
}

function DeleteContactDialog({
  contact,
  pending,
  onOpenChange,
  onConfirm,
}: {
  contact: UiContact | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const [ack, setAck] = useState(false);
  useEffect(() => {
    if (contact) setAck(false);
  }, [contact]);
  const label = contact?.name || contact?.email || "this contact";
  return (
    <AlertDialog open={contact !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent className="ct-del">
        <div className="ct-del__icon" aria-hidden="true">
          <AlertTriangle size={28} />
        </div>
        <AlertDialogTitle className="ct-del__title">Delete {label}&apos;s contact?</AlertDialogTitle>
        <AlertDialogDescription className="ct-del__copy">
          This person will be removed from Contacts. This cannot be undone.
          Use this mainly for contacts added by mistake.
        </AlertDialogDescription>
        <label className="ct-del__ack">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
          />
          <span>I understand and acknowledge the implications of deleting this contact</span>
        </label>
        <div className="ct-del__actions">
          <AlertDialogCancel className="ct-del__cancel">Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="ct-del__danger"
            disabled={!ack || pending}
            onClick={(e) => {
              if (!ack) {
                e.preventDefault();
                return;
              }
              onConfirm();
            }}
          >
            Delete contact
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function WorkerTypeCell({
  contact,
  canEdit,
  disabled,
  onChange,
}: {
  contact: UiContact;
  canEdit: boolean;
  disabled: boolean;
  onChange: (role: string) => void;
}) {
  if (contact.role === "Owner" || !canEdit) {
    return <span className="ct-worker-type">{permissionLabel(contact.role)}</span>;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="ct-role-trigger"
          disabled={disabled}
          aria-label={`Worker type for ${contact.name || contact.email}`}
        >
          {permissionLabel(contact.role)}
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="ct-role-menu">
        {ROLES.filter((role) => role !== "Owner").map((role) => (
          <DropdownMenuItem
            key={role}
            className={contact.role === role ? "ct-role-menu__on" : undefined}
            onSelect={() => onChange(role)}
          >
            {role}
            {contact.role === role ? (
              <Check size={14} className="ct-role-check" aria-hidden="true" />
            ) : (
              <span className="ct-role-check-spacer" aria-hidden="true" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const COUNTRY_ALIASES: Record<string, string> = {
  IND: "IN",
  USA: "US",
  UK: "GB",
  UAE: "AE",
};

function countryDisplay(code?: string) {
  const raw = (code || "").trim();
  if (!raw) return null;
  const upper = COUNTRY_ALIASES[raw.toUpperCase()] || raw.toUpperCase();
  const byCode = COUNTRY_OPTIONS.find((c) => c.value === upper);
  const byLabel = COUNTRY_OPTIONS.find((c) => c.label.toLowerCase() === raw.toLowerCase());
  const match = byCode || byLabel;
  if (match) return { iso: match.value.toLowerCase(), label: match.label };
  if (/^[A-Z]{2}$/.test(upper)) return { iso: upper.toLowerCase(), label: raw };
  return { iso: "", label: raw };
}

function countryFlagSrc(iso: string) {
  return `https://cdn.jsdelivr.net/gh/HatScripts/circle-flags@2.7.0/flags/${iso}.svg`;
}

function ordinalDay(day: number) {
  const v = day % 100;
  if (v >= 11 && v <= 13) return `${day}th`;
  if (day % 10 === 1) return `${day}st`;
  if (day % 10 === 2) return `${day}nd`;
  if (day % 10 === 3) return `${day}rd`;
  return `${day}th`;
}

function formatStartDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const dateOnly = /^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?Z)?$/.test(value);
  const year = dateOnly ? d.getUTCFullYear() : d.getFullYear();
  const month = dateOnly ? d.getUTCMonth() : d.getMonth();
  const day = dateOnly ? d.getUTCDate() : d.getDate();
  return `${MONTHS[month]} ${ordinalDay(day)} ${year}`;
}

function SortHead({
  label,
  col,
  className,
  hint,
  sortKey,
  sortDir,
  onToggleSort,
}: {
  label: string;
  col?: SortKey;
  className?: string;
  hint?: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onToggleSort: (key: SortKey) => void;
}) {
  const active = col && sortKey === col;
  return (
    <th className={className}>
      <span className="ct-th-label">
        {col ? (
          <button
            type="button"
            className={`ct-th-sort${active ? " is-on" : ""}`}
            onClick={() => onToggleSort(col)}
            aria-label={`Sort by ${label} ${active && sortDir === "asc" ? "descending" : "ascending"}`}
          >
            {label}
            <ArrowUpDown size={14} aria-hidden="true" />
          </button>
        ) : (
          label
        )}
        {hint ? (
          <span className="ct-th-info" title={hint} aria-label={hint}>
            <HelpCircle size={13} aria-hidden="true" />
          </span>
        ) : null}
      </span>
    </th>
  );
}

/** Contacts screen: Deel Directory columns mapped onto Contact fields. */
export function ContactsView(vm: ContactsVm) {
  const hasActiveFilters =
    Boolean(vm.query) ||
    vm.roleFilter !== "all" ||
    vm.departmentFilter !== "all" ||
    vm.statusFilter !== "all";
  const totalLabel = vm.filtered.length === 1 ? "item" : "items";

  useEffect(() => {
    if (!vm.filterOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest(".ct-filter-btn, .ct-filter-menu")) return;
      vm.onFilterOpenChange(null);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [vm.filterOpen, vm.onFilterOpenChange]);

  return (
    <>
      <div className="contacts-page">
        <header className="ct-hero">
          <h1>Contacts</h1>
          <div className="ct-hero__actions">
            {vm.canManageContacts ? (
              <>
                <button
                  type="button"
                  className="ct-hero__ghost"
                  onClick={() => vm.onAddOpen("csv")}
                >
                  <Upload size={15} aria-hidden="true" />
                  Import
                </button>
                <button type="button" className="ct-hero__cta" onClick={() => vm.onAddOpen("manual")}>
                  <Plus size={15} aria-hidden="true" />
                  Add people
                </button>
              </>
            ) : null}
          </div>
        </header>

        {vm.isLoading ? (
          <LoadingState message="Loading contacts…" fullScreen={false} variant="list" />
        ) : vm.errorMessage ? (
          <div className="card" style={{ padding: 16, color: "var(--danger)" }}>
            {vm.errorMessage}
          </div>
        ) : !vm.hasContacts ? (
          <div className="contacts-empty">
            <div className="contacts-empty__hero">
              <img
                src={contactsAddArt}
                alt=""
                aria-hidden="true"
                className="contacts-empty__art"
              />
              <h3>Add your contacts</h3>
              <p>
                Add recipients to send points or kits to your team.
                <br />
                Sync automatically using your HR software or add them manually.
              </p>
            </div>
            {vm.canManageContacts && (
              <div className="contacts-empty__actions">
                <button type="button" className="ct-hero__cta" onClick={() => vm.onAddOpen("manual")}>
                  <Plus size={16} aria-hidden="true" /> Add people manually
                </button>
                <button type="button" className="ct-hero__ghost" onClick={vm.onConnectIntegration}>
                  <Plug size={16} aria-hidden="true" /> Connect HRIS
                </button>
              </div>
            )}
          </div>
        ) : (
          <section className="ct-panel">
            <div className="ct-panel__toolbar">
              <div className="ct-toolbar-pills">
                {vm.filterOpen ? (
                  <button
                    type="button"
                    className="menu-dismiss-scrim"
                    aria-label="Close menu"
                    onClick={() => vm.onFilterOpenChange(null)}
                  />
                ) : null}
                <label className="ct-search">
                  <Search size={15} aria-hidden="true" />
                  <input
                    aria-label="Search contacts"
                    placeholder="Search"
                    value={vm.query}
                    onChange={(e) => vm.onQuery(e.target.value)}
                  />
                </label>

                <div className="ct-filter-wrap">
                  <button
                    type="button"
                    className={`ct-filter-btn${vm.sortKey !== "name" || vm.sortDir !== "asc" ? " is-on" : ""}`}
                    aria-expanded={vm.filterOpen === "sort"}
                    onClick={() =>
                      vm.onFilterOpenChange(vm.filterOpen === "sort" ? null : "sort")
                    }
                  >
                    <SlidersHorizontal size={14} aria-hidden="true" />
                    Sort
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                  {vm.filterOpen === "sort" && (
                    <div className="ct-filter-menu" role="menu">
                      {SORT_OPTIONS.map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          role="menuitem"
                          className={vm.sortKey === "name" && vm.sortDir === value ? "on" : ""}
                          onClick={() => vm.onSortDir(value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="ct-filter-wrap">
                  <button
                    type="button"
                    className={`ct-filter-btn${vm.departmentFilter !== "all" ? " is-on" : ""}`}
                    aria-expanded={vm.filterOpen === "dept"}
                    onClick={() =>
                      vm.onFilterOpenChange(vm.filterOpen === "dept" ? null : "dept")
                    }
                  >
                    Group
                    {vm.departmentFilter !== "all" ? <span className="ct-pill-count">1</span> : null}
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                  {vm.filterOpen === "dept" && (
                    <div className="ct-filter-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        className={vm.departmentFilter === "all" ? "on" : ""}
                        onClick={() => vm.onDepartmentFilter("all")}
                      >
                        All groups
                      </button>
                      {vm.departmentOptions.map((dept) => (
                        <button
                          key={dept}
                          type="button"
                          role="menuitem"
                          className={vm.departmentFilter === dept ? "on" : ""}
                          onClick={() => vm.onDepartmentFilter(dept)}
                        >
                          {dept}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="ct-filter-wrap">
                  <button
                    type="button"
                    className={`ct-filter-btn${vm.roleFilter !== "all" ? " is-on" : ""}`}
                    aria-expanded={vm.filterOpen === "role"}
                    onClick={() =>
                      vm.onFilterOpenChange(vm.filterOpen === "role" ? null : "role")
                    }
                  >
                    Worker type
                    {vm.roleFilter !== "all" ? <span className="ct-pill-count">1</span> : null}
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                  {vm.filterOpen === "role" && (
                    <div className="ct-filter-menu" role="menu">
                      {WORKER_TYPE_OPTIONS.map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          role="menuitem"
                          className={vm.roleFilter === value ? "on" : ""}
                          onClick={() => vm.onRoleFilter(value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="ct-filter-wrap">
                  <button
                    type="button"
                    className={`ct-filter-btn${vm.statusFilter !== "all" ? " is-on" : ""}`}
                    aria-expanded={vm.filterOpen === "status"}
                    onClick={() =>
                      vm.onFilterOpenChange(vm.filterOpen === "status" ? null : "status")
                    }
                  >
                    Worker status
                    {vm.statusFilter !== "all" ? <span className="ct-pill-count">1</span> : null}
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                  {vm.filterOpen === "status" && (
                    <div className="ct-filter-menu" role="menu">
                      {STATUS_OPTIONS.map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          role="menuitem"
                          className={vm.statusFilter === value ? "on" : ""}
                          onClick={() => vm.onStatusFilter(value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="ct-table-card">
            <p className="ct-total">
              Total {vm.filtered.length} {totalLabel}
            </p>

            {vm.filtered.length === 0 ? (
              <div className="ct-empty">
                <h3>{hasActiveFilters ? "No matching contacts" : "No contacts yet"}</h3>
                <p>
                  {hasActiveFilters
                    ? "Try a different search or filter."
                    : "Add people to start sending gifts and points."}
                </p>
              </div>
            ) : (
              <div className="ct-table-wrap">
                <table className="ct-table">
                  <colgroup>
                    <col className="ct-col-person" />
                    <col className="ct-col-country" />
                    <col className="ct-col-group" />
                    <col className="ct-col-type" />
                    <col className="ct-col-status" />
                    <col className="ct-col-date" />
                    <col className="ct-col-actions" />
                  </colgroup>
                  <thead>
                    <tr>
                      <SortHead
                        label="Person"
                        col="name"
                        sortKey={vm.sortKey}
                        sortDir={vm.sortDir}
                        onToggleSort={vm.onToggleSort}
                      />
                      <th>Country</th>
                      <th>Group</th>
                      <th>Worker type</th>
                      <SortHead
                        label="Worker status"
                        hint="Employment status from HRIS when available"
                        sortKey={vm.sortKey}
                        sortDir={vm.sortDir}
                        onToggleSort={vm.onToggleSort}
                      />
                      <SortHead
                        label="Start date"
                        hint="Date of joining"
                        sortKey={vm.sortKey}
                        sortDir={vm.sortDir}
                        onToggleSort={vm.onToggleSort}
                      />
                      <th className="ct-th-actions" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {vm.filtered.map((c: UiContact) => {
                      const tone = avatarTone(c.id || c.email || c.name);
                      const country = countryDisplay(c.country);
                      const status = contactWorkerStatus(c);
                      return (
                        <tr key={c.id}>
                          <td>
                            <div className="ct-person">
                              <span
                                className="ct-avatar"
                                style={{ backgroundColor: tone.bg, color: tone.fg }}
                                aria-hidden="true"
                              >
                                {initials(c)}
                              </span>
                              <span className="ct-person-copy">
                                <span className="ct-name">{emptyCell(c.name)}</span>
                                <span className="ct-sub">{personSubtitle(c)}</span>
                              </span>
                            </div>
                          </td>
                          <td>
                            {country ? (
                              <span className="ct-country">
                                {country.iso ? (
                                  <img
                                    className="ct-flag"
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
                              <span className="ct-muted">—</span>
                            )}
                          </td>
                          <td className="ct-muted">{emptyCell(c.department)}</td>
                          <td>
                            <WorkerTypeCell
                              contact={c}
                              canEdit={vm.canManageContactRoles}
                              disabled={vm.isRolePending}
                              onChange={(role) => vm.onRoleChange(c, role)}
                            />
                          </td>
                          <td>
                            <span className={`ct-status ct-status--${status.key}`}>
                              <i aria-hidden="true" />
                              {status.label}
                            </span>
                          </td>
                          <td>
                            <span className="ct-date">{formatStartDate(c.dateOfJoining)}</span>
                          </td>
                          <td className="ct-td-actions">
                            {vm.canManageContacts ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    className="ct-kebab"
                                    aria-label={`Actions for ${c.name || c.email}`}
                                  >
                                    <MoreHorizontal size={16} aria-hidden="true" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="ct-row-menu">
                                  <DropdownMenuItem onSelect={() => vm.onEdit(c)}>
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={c.role === "Owner"}
                                    onSelect={() => {
                                      if (c.role === "Owner") return;
                                      vm.onRestrict();
                                    }}
                                  >
                                    Restrict
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={c.role === "Owner" || vm.isDeletePending}
                                    className="ct-row-menu__danger"
                                    onSelect={() => {
                                      if (c.role === "Owner") return;
                                      vm.onDelete(c);
                                    }}
                                  >
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            </div>
          </section>
        )}
      </div>

      <ContactFormDialog
        open={vm.adding}
        onOpenChange={vm.onAddOpenChange}
        mode="add"
        canImportContacts
        canManageContactRoles={vm.canManageContactRoles}
        initialTab={vm.addInitialTab}
        onAddedSuccess={vm.onContactsAddedSuccess}
      />
      <ContactFormDialog
        open={vm.editing !== null}
        onOpenChange={vm.onEditOpenChange}
        mode="edit"
        contact={vm.editing ?? undefined}
        canManageContactRoles={vm.canManageContactRoles}
      />
      <DeleteContactDialog
        contact={vm.deleting}
        pending={vm.isDeletePending}
        onOpenChange={vm.onDeleteOpenChange}
        onConfirm={vm.onDeleteConfirm}
      />
      <NextStepDialog
        open={vm.contactsAddedOpen}
        title="Contacts added"
        description={contactsAddedDescription(vm.contactsAddedCount)}
        detail={CONTACTS_ADDED_DETAIL}
        primaryLabel="Create a campaign"
        onPrimary={vm.onContactsAddedPrimary}
        onSecondary={vm.onContactsAddedLater}
      />
    </>
  );
}
