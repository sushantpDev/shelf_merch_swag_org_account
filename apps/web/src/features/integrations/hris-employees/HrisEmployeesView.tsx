import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, ChevronDown, HelpCircle, Search, Users } from "lucide-react";
import { COUNTRY_OPTIONS } from "@/data/countries";
import { LoadingState } from "@/components/LoadingState";
import type { MergeHrisEmployeePublic } from "@/services/merge-api";
import { hrisDirectoryBannerText } from "./hrisDirectoryBanner";
import type { HrisEmployeesVm } from "./useHrisEmployeesController";

const COUNTRY_ALIASES: Record<string, string> = {
  IND: "IN",
  USA: "US",
  UK: "GB",
  UAE: "AE",
};

function emptyCell(value?: string | null) {
  const v = (value ?? "").trim();
  return v ? v : "N/A";
}

function titleCaseWords(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      if (/^[A-Z]{2,3}$/.test(part)) return part;
      if (/^\d/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

function countryIso(country?: string | null) {
  const raw = (country || "").trim();
  if (!raw) return "";
  const upper = COUNTRY_ALIASES[raw.toUpperCase()] || raw.toUpperCase();
  const byCode = COUNTRY_OPTIONS.find((c) => c.value === upper);
  if (byCode) return byCode.value.toLowerCase();
  const byLabel = COUNTRY_OPTIONS.find((c) => c.label.toLowerCase() === raw.toLowerCase());
  if (byLabel) return byLabel.value.toLowerCase();
  if (/^[A-Z]{2}$/.test(upper)) return upper.toLowerCase();
  return "";
}

function formatLocationLabel(locationName?: string | null, country?: string | null) {
  const name = (locationName || "").trim();
  const c = (country || "").trim();
  const iso = countryIso(c || name);
  if (iso === "aq") return "Antarctica";
  const match = iso ? COUNTRY_OPTIONS.find((opt) => opt.value === iso.toUpperCase()) : undefined;
  if (match) return match.label;
  if (name) return titleCaseWords(name);
  if (!c) return "";
  if (c.length <= 3) return c.toUpperCase();
  return titleCaseWords(c);
}

function countryFlagSrc(iso: string) {
  return `https://cdn.jsdelivr.net/gh/HatScripts/circle-flags@2.7.0/flags/${iso}.svg`;
}

function initials(employee: MergeHrisEmployeePublic) {
  const first = (employee.firstName || "").trim();
  const last = (employee.lastName || "").trim();
  if (first || last) {
    return `${first.slice(0, 1)}${last.slice(0, 1)}`.toUpperCase() || "?";
  }
  const name = (employee.displayName || "?").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
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

function statusMeta(status?: string | null) {
  const raw = (status || "").trim().toUpperCase();
  if (raw === "ACTIVE") return { label: "Active", tone: "active" };
  if (raw === "SUSPENDED") return { label: "Suspended", tone: "inactive" };
  if (raw === "INACTIVE") return { label: "Inactive", tone: "inactive" };
  if (raw === "PENDING") return { label: "Pending", tone: "pending" };
  if (!raw) return { label: "Unknown", tone: "unknown" };
  return {
    label: raw.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
    tone: "unknown",
  };
}

function providerLabel(slug: string) {
  const map: Record<string, string> = {
    deel: "Deel",
    workday: "Workday",
    bamboohr: "BambooHR",
    gusto: "Gusto",
    keka: "Keka",
    "ukg-pro": "UKG Pro",
    hibob: "HiBob",
    "google-workspace": "Google Workspace",
    "zoho-people": "Zoho People",
  };
  return map[slug] || slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function tidyName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/** HRIS people directory — MergeHrisEmployee list; also mirrored into Workspace Contacts on sync. */
export function HrisEmployeesView(vm: HrisEmployeesVm) {
  const directoryIsCurrent =
    vm.directory.state === "connected" ||
    vm.directory.state === "syncing" ||
    vm.directory.state === "error";
  const hasConnection =
    directoryIsCurrent ||
    vm.connections.some(
      (connection) => connection.status === "connected" || connection.status === "needs_attention",
    );
  const filtered = vm.employees.length;
  const [providerOpen, setProviderOpen] = useState(false);
  const totalLabel = filtered === 1 ? "item" : "items";

  useEffect(() => {
    if (!providerOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest(".hris-dir-filter-btn, .hris-dir-filter-menu")) return;
      setProviderOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [providerOpen]);
  const bannerText = hrisDirectoryBannerText(vm.directory);
  const bannerDisconnected = vm.directory.state === "disconnected";

  return (
    <div className="hris-dir-page">
      <Link to="/app/integrations" className="hris-dir-back">
        <ArrowLeft size={14} aria-hidden="true" />
        Back to integrations
      </Link>

      <div className="hris-dir-top">
        <div className="hris-dir-top-copy">
          <h1>Employee directory</h1>
          <p>Synced people from connected directory providers. Also added to Workspace Contacts.</p>
        </div>
        <div className="hris-dir-stats" aria-label="Directory summary">
          <span>
            <b>People</b> {vm.totalCount}
          </span>
          <span>
            <b>Active</b> {vm.activeCount}
          </span>
          <span>
            <b>Providers</b> {vm.connectedProviderCount}
          </span>
          <button
            type="button"
            className="hris-dir-stats-help"
            title="These records come from connected directory sync, including Zoho People and Merge, and are also mirrored into Workspace Contacts. They do not create ShelfMerch logins."
            aria-label="About Employee directory"
          >
            <HelpCircle size={15} />
          </button>
        </div>
      </div>

      {!vm.loading && vm.directory.state === "empty" ? (
        <div className="hris-dir-banner" role="status">
          <Users size={16} aria-hidden="true" />
          <p>
            No active directory connection.{" "}
            <Link to="/app/integrations">Connect a provider</Link>. Employee data syncs automatically.
          </p>
        </div>
      ) : null}

      {vm.loading ? (
        <div className="hris-dir-loading">
          <LoadingState message="Loading directory people…" fullScreen={false} variant="list" />
        </div>
      ) : null}

      {vm.error ? (
        <p className="hris-dir-error" role="alert">
          {vm.error}
        </p>
      ) : null}

      {!vm.loading && !vm.error ? (
        <div className="hris-dir-table-card">
          <div className="hris-dir-table-head">
            <div className="hris-dir-table-meta">
              <p className="hris-dir-total">
                Total {filtered} {totalLabel}
              </p>
              {bannerText ? (
                <p
                  className={`hris-dir-sync${bannerDisconnected ? " is-disconnected" : ""}`}
                  role="status"
                >
                  {bannerText}
                </p>
              ) : null}
            </div>
            <div className="hris-dir-toolbar">
              <label className="hris-dir-search">
                <Search size={15} aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Search"
                  aria-label="Search directory"
                  value={vm.search}
                  onChange={(e) => vm.onSearch(e.target.value)}
                />
              </label>
              {vm.providerOptions.length > 0 ? (
                <div className="hris-dir-filter-wrap">
                  <button
                    type="button"
                    className={`hris-dir-filter-btn${vm.providerFilter !== "all" ? " is-on" : ""}`}
                    aria-expanded={providerOpen}
                    onClick={() => setProviderOpen((open) => !open)}
                  >
                    Provider
                    {vm.providerFilter !== "all" ? <span className="hris-dir-pill-count">1</span> : null}
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                  {providerOpen ? (
                    <>
                    <button
                      type="button"
                      className="menu-dismiss-scrim"
                      aria-label="Close provider menu"
                      onClick={() => setProviderOpen(false)}
                    />
                    <div className="hris-dir-filter-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        className={vm.providerFilter === "all" ? "on" : ""}
                        onClick={() => {
                          vm.onProviderFilter("all");
                          setProviderOpen(false);
                        }}
                      >
                        All providers
                      </button>
                      {vm.providerOptions.map((p) => (
                        <button
                          key={p}
                          type="button"
                          role="menuitem"
                          className={vm.providerFilter === p ? "on" : ""}
                          onClick={() => {
                            vm.onProviderFilter(p);
                            setProviderOpen(false);
                          }}
                        >
                          {providerLabel(p)}
                        </button>
                      ))}
                    </div>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          {vm.employees.length === 0 ? (
            <div className="hris-dir-empty">
              <h3>No people to show</h3>
              <p>
                {hasConnection
                  ? "Try a different search or filter."
                  : "Connect an HRIS provider to import employees."}
              </p>
            </div>
          ) : (
            <div className="hris-dir-table-wrap">
              <table className="hris-dir-table">
                <colgroup>
                  <col className="hris-dir-col-person" />
                  <col className="hris-dir-col-email" />
                  <col className="hris-dir-col-address" />
                  <col className="hris-dir-col-location" />
                  <col className="hris-dir-col-status" />
                  <col className="hris-dir-col-provider" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Work email</th>
                    <th>Address</th>
                    <th>Location</th>
                    <th>Status</th>
                    <th>Provider</th>
                  </tr>
                </thead>
                <tbody>
                  {vm.employees.map((e) => {
                    const name = tidyName(e.displayName || `${e.firstName} ${e.lastName}`);
                    const status = statusMeta(e.effectiveEmploymentStatus || e.employmentStatus);
                    const locationLabel = formatLocationLabel(e.locationName, e.country);
                    const locationIso = countryIso(e.country);
                    const address = emptyCell(e.address);
                    const title = (e.jobTitle || "").trim() || "Not specified";
                    const tone = avatarTone(e.id || name);
                    return (
                      <tr key={e.id}>
                        <td>
                          <div className="hris-dir-person">
                            <span
                              className="hris-dir-avatar"
                              style={{ background: tone.bg, color: tone.fg }}
                              aria-hidden="true"
                            >
                              {initials(e)}
                            </span>
                            <span className="hris-dir-person-copy">
                              <span className="hris-dir-person-name">{emptyCell(name)}</span>
                              <span className="hris-dir-person-title">{title}</span>
                            </span>
                          </div>
                        </td>
                        <td className="hris-dir-td-muted">{emptyCell(e.workEmail)}</td>
                        <td className="hris-dir-td-muted">{address}</td>
                        <td>
                          {locationLabel ? (
                            <span className="hris-dir-location">
                              {locationIso ? (
                                <img
                                  className="hris-dir-flag"
                                  src={countryFlagSrc(locationIso)}
                                  alt=""
                                  width={18}
                                  height={18}
                                  onError={(ev) => {
                                    ev.currentTarget.style.display = "none";
                                  }}
                                />
                              ) : null}
                              {locationLabel}
                            </span>
                          ) : (
                            <span className="hris-dir-td-muted">—</span>
                          )}
                        </td>
                        <td>
                          <span className={`hris-dir-status hris-dir-status--${status.tone}`}>
                            <i aria-hidden="true" />
                            {status.label}
                          </span>
                        </td>
                        <td>
                          <span className="hris-dir-provider-cell">
                            <span className="hris-dir-provider">{providerLabel(e.provider)}</span>
                            {e.connectionStatus === "disconnected" ? (
                              <span className="hris-dir-status hris-dir-status--disconnected">
                                <i aria-hidden="true" />
                                Disconnected
                              </span>
                            ) : null}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {!vm.loading && !vm.error && filtered > 0 ? (
        <div className="hris-dir-footer">
          <span>© Powered by Shelf Merch</span>
          <Link to="/app/integrations" className="hris-dir-footer-link">
            Manage integrations
          </Link>
        </div>
      ) : null}
    </div>
  );
}
