import { Link } from "react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  ExternalLink,
  Loader2,
  RefreshCw,
  Unplug,
  Users,
} from "lucide-react";
import type { Tile } from "../data";
import { USER_MANAGEMENT_TOOLS } from "../data";
import type { IntegrationsVm } from "../controllers/useIntegrationsController";
import type { MergeConnectionPublic } from "@/services/merge-api";
import type { HrisSyncView } from "../hrisSyncUi";
import { IntegrationOverview } from "../components/IntegrationOverview";
import {
  SYNC_NOW_HELPER,
  ZOHO_MANUAL_SYNC_HELPER,
  directoryConnectionStatus,
} from "../integrationOverviewCopy";
import { getHrisMarketplaceProfile } from "../hrisMarketplaceCopy";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import "../slack-marketplace.css";

type TabId = "overview" | "configure" | "appinfo";

function formatDate(value: string | null | undefined) {
  if (!value) return "Not synced yet";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Not synced yet";
  const date = d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} at ${time}`;
}

function mergeSyncFailureCopy(connection: MergeConnectionPublic, tileName: string) {
  const isDirectory = connection.category === "directory";
  const isGoogleWorkspace = connection.provider === "google-workspace";
  if (connection.lastError === "MERGE_SCOPES_DISABLED") {
    if (isGoogleWorkspace) return "Required Google Workspace permissions are not enabled.";
    return isDirectory
      ? "This directory connection is valid, but required data scopes are disabled."
      : "This HRIS connection is valid, but required data scopes are disabled.";
  }
  if (connection.lastSyncStatus === "failed") {
    if (isGoogleWorkspace) return "Google Workspace sync could not be completed. Try again.";
    return isDirectory
      ? "Directory sync could not be completed. Try again."
      : `${tileName} sync could not be completed. You can retry without reconnecting.`;
  }
  return null;
}

function disconnectCopy(tileName: string, isDirectory: boolean) {
  if (isDirectory) {
    return `Shelf Merch will unlink this ${tileName} account. Imported directory users and Workspace Contacts are kept. Other providers stay connected. You can reconnect later.`;
  }
  return `Shelf Merch will unlink this ${tileName} account. Imported employees and Workspace Contacts are kept. Other HR platforms stay connected. You can reconnect later.`;
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="bonus-integ-callout bonus-integ-callout--warning" role="status">
      <CircleAlert size={16} aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

function DisconnectButton({
  title,
  description,
  disabled,
  label,
  onConfirm,
}: {
  title: string;
  description: string;
  disabled?: boolean;
  label: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button type="button" className="bonus-integ-btn bonus-integ-btn--danger" disabled={disabled}>
          <Unplug size={15} aria-hidden="true" />
          <span>{label}</span>
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Disconnect</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PeopleLinks({ tileName, providerId }: { tileName: string; providerId: string }) {
  const directoryHref = `/app/integrations/hris-employees?provider=${encodeURIComponent(providerId)}`;
  return (
    <div className="sm-mkt-hris-links">
      <Link to={directoryHref} className="sm-mkt-hris-link">
        <span className="sm-mkt-hris-link__icon" aria-hidden="true">
          <Users size={16} />
        </span>
        <span className="sm-mkt-hris-link__copy">
          <strong>Employee directory</strong>
          <span>See people synced from {tileName}</span>
        </span>
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}

function SyncCard({
  tileName,
  statusTone,
  statusLabel,
  lastSynced,
  automaticSync,
  syncModeLabel = "Automatic sync",
  syncHelper = SYNC_NOW_HELPER,
  summary,
  statusMessage,
  statusKind,
  showSyncHelper = false,
  notice,
  actions,
}: {
  tileName: string;
  statusTone: "success" | "warning" | "danger";
  statusLabel: string;
  lastSynced: string;
  automaticSync: string;
  syncModeLabel?: string;
  syncHelper?: string;
  summary?: string;
  statusMessage?: string | null;
  statusKind?: "connected" | "syncing" | "disconnected" | "attention";
  showSyncHelper?: boolean;
  notice?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="sm-mkt-hris-card" aria-label={`${tileName} sync`}>
      <div className="sm-mkt-hris-card__head">
        <h3>Sync</h3>
        <p>{summary ?? `Employee data from ${tileName} stays current for gifting.`}</p>
      </div>
      {statusMessage ? (
        <p className={`sm-mkt-hris-status-copy is-${statusKind ?? "connected"}`}>{statusMessage}</p>
      ) : null}
      <div className="sm-mkt-hris-stats">
        <div className="sm-mkt-hris-stat">
          <span className="sm-mkt-hris-stat__label">Status</span>
          <span className={`sm-mkt-hris-pill sm-mkt-hris-pill--${statusTone}`}>
            <i aria-hidden="true" />
            {statusLabel}
          </span>
        </div>
        <div className="sm-mkt-hris-stat">
          <span className="sm-mkt-hris-stat__label">Last synced</span>
          <span className="sm-mkt-hris-stat__value">{lastSynced}</span>
        </div>
        <div className="sm-mkt-hris-stat">
          <span className="sm-mkt-hris-stat__label">{syncModeLabel}</span>
          <span className="sm-mkt-hris-stat__value">{automaticSync}</span>
        </div>
      </div>
      {notice}
      {actions ? (
        <div className="sm-mkt-hris-actions">
          <div className="sm-mkt-hris-actions__row">{actions}</div>
          {showSyncHelper ? <p className="sm-mkt-hris-sync-help">{syncHelper}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function HrisConfigurePanel({
  tile,
  connection,
  zoho,
  busy,
  syncing,
  disconnecting,
  canManage,
  onInstall,
  onSync,
  onDisconnect,
  hrisView = null,
}: {
  tile: Tile;
  connection?: MergeConnectionPublic | null;
  zoho?: IntegrationsVm["zoho"] | null;
  busy: boolean;
  syncing: boolean;
  disconnecting: boolean;
  canManage: boolean;
  onInstall: (tile: Tile) => void;
  onSync?: (connectionId: string) => void;
  onDisconnect?: (connectionId: string) => void;
  hrisView?: HrisSyncView | null;
}) {
  if (tile.id === "zoho-people" && zoho) {
    const zohoActive =
      zoho.status === "connected" ||
      zoho.status === "needs_attention" ||
      zoho.status === "expired" ||
      zoho.status === "error";
    if (!zohoActive) return null;
    const statusLabel =
      zoho.status === "connected"
        ? "Connected"
        : zoho.status === "expired"
          ? "Connection expired"
          : zoho.status === "needs_attention"
            ? "Needs attention"
            : "Error";
    const tone =
      zoho.status === "connected" ? "success" : zoho.status === "error" ? "danger" : "warning";
    const needsReconnect = zoho.status !== "connected";
    return (
      <div className="sm-mkt-hris">
        {zoho.status === "connected" ? <PeopleLinks tileName={tile.name} providerId={tile.id} /> : null}
        <SyncCard
          tileName={tile.name}
          statusTone={tone}
          statusLabel={statusLabel}
          lastSynced={formatDate(zoho.integration?.lastSyncedAt)}
          syncModeLabel="Employee sync"
          automaticSync={zoho.status === "connected" ? "Manual" : "Paused"}
          summary="Run Sync now to import or update Zoho People employees. Sync does not run on a schedule."
          {...(() => {
            const status = directoryConnectionStatus(
              {
                needsAttention: zoho.status !== "connected",
                syncing: zoho.syncing,
                disconnected: false,
                connected: zoho.status === "connected",
              },
              "manual",
            );
            return {
              statusMessage: status?.message,
              statusKind: status?.kind,
            };
          })()}
          showSyncHelper={zoho.status === "connected"}
          syncHelper={ZOHO_MANUAL_SYNC_HELPER}
          notice={
            zoho.status !== "connected" ? (
              <Callout>
                {zoho.status === "expired"
                  ? "Zoho People authorization expired. Reconnect before syncing again."
                  : "Zoho People needs attention. Reconnect before syncing again."}
              </Callout>
            ) : null
          }
          actions={
            canManage ? (
              <>
                <button
                  type="button"
                  className="bonus-integ-btn bonus-integ-btn--secondary"
                  disabled={zoho.syncing || needsReconnect || zoho.disconnecting}
                  onClick={zoho.onSync}
                >
                  {zoho.syncing ? (
                    <>
                      <Loader2 size={15} className="auth-spin" aria-hidden="true" />
                      <span>Syncing…</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw size={15} aria-hidden="true" />
                      <span>Sync now</span>
                    </>
                  )}
                </button>
                {needsReconnect ? (
                  <button
                    type="button"
                    className="bonus-integ-btn bonus-integ-btn--secondary"
                    disabled={zoho.connecting}
                    onClick={zoho.onConnect}
                  >
                    Reconnect
                  </button>
                ) : null}
                <DisconnectButton
                  title="Disconnect Zoho People?"
                  description="Shelf Merch will revoke the Zoho authorization for this workspace and stop syncing. Existing contacts are kept. You can reconnect later."
                  disabled={zoho.disconnecting}
                  label={zoho.disconnecting ? "Disconnecting…" : "Disconnect"}
                  onConfirm={zoho.onDisconnect}
                />
              </>
            ) : null
          }
        />
      </div>
    );
  }

  if (!connection) return null;

  const healthy = connection.status === "connected";
  const needsReconnect = connection.status === "needs_attention";
  const syncFailed = connection.lastSyncStatus === "failed";
  const failure = mergeSyncFailureCopy(connection, tile.name);
  const isDirectory = connection.category === "directory";

  return (
    <div className="sm-mkt-hris">
      {connection.status === "connected" ? <PeopleLinks tileName={tile.name} providerId={tile.id} /> : null}
      <SyncCard
        tileName={tile.name}
        statusTone={
          hrisView
            ? hrisView.bannerTone === "warning" || hrisView.connectionWord !== "Connected"
              ? "warning"
              : "success"
            : needsReconnect || syncFailed
              ? "warning"
              : "success"
        }
        statusLabel={
          hrisView?.connectionWord ??
          (needsReconnect ? "Needs reconnect" : syncFailed ? "Sync failed" : "Connected")
        }
        lastSynced={hrisView?.lastSyncedLabel ?? formatDate(connection.lastSyncAt)}
        automaticSync={
          hrisView
            ? hrisView.automaticEnabled
              ? "Enabled"
              : "Paused"
            : healthy && !syncFailed
              ? "Enabled"
              : "Paused"
        }
        summary={
          tile.id === "google-workspace"
            ? `Directory data from ${tile.name} stays current for gifting.`
            : undefined
        }
        {...(() => {
          const status = directoryConnectionStatus({
            needsAttention: Boolean(
              hrisView
                ? hrisView.showReconnect || hrisView.connectionWord === "Needs attention"
                : needsReconnect,
            ),
            syncing: Boolean(
              hrisView
                ? hrisView.syncButtonDisabled
                : syncing ||
                    connection.lastSyncStatus === "syncing" ||
                    connection.lastSyncStatus === "queued",
            ),
            disconnected: Boolean(
              hrisView
                ? hrisView.connectionWord === "Disconnected"
                : connection.status === "disconnected",
            ),
            connected: Boolean(hrisView ? hrisView.connectionWord === "Connected" : healthy),
          });
          return {
            statusMessage: status?.message,
            statusKind: status?.kind,
          };
        })()}
        showSyncHelper={Boolean(
          hrisView ? hrisView.automaticEnabled && hrisView.showSyncButton : healthy,
        )}
        notice={
          <>
            {hrisView?.banner ? <Callout>{hrisView.banner}</Callout> : null}
            {!hrisView && failure ? <Callout>{failure}</Callout> : null}
            {!hrisView && needsReconnect ? (
              <Callout>
                {tile.id === "google-workspace"
                  ? "Google Workspace needs to be reconnected."
                  : "This account needs to be re-authorized before syncing can continue."}
              </Callout>
            ) : null}
            {hrisView && hrisView.progressLines.length > 0 ? (
              <ul className="sm-mkt-hris-progress">
                {hrisView.progressLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </>
        }
        actions={
          canManage ? (
            <>
              {(hrisView ? hrisView.showSyncButton : healthy) && onSync ? (
                <button
                  type="button"
                  className="bonus-integ-btn bonus-integ-btn--secondary"
                  disabled={
                    hrisView
                      ? hrisView.syncButtonDisabled || busy || disconnecting
                      : syncing || busy || disconnecting
                  }
                  onClick={() => onSync(connection.id)}
                >
                  {(hrisView ? hrisView.syncButtonDisabled : syncing) ? (
                    <>
                      <Loader2 size={15} className="auth-spin" aria-hidden="true" />
                      <span>{hrisView?.syncButtonLabel ?? "Syncing…"}</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw size={15} aria-hidden="true" />
                      <span>{hrisView?.syncButtonLabel ?? (syncFailed ? "Retry sync" : "Sync now")}</span>
                    </>
                  )}
                </button>
              ) : null}
              {(hrisView ? hrisView.showReconnect : needsReconnect) ? (
                <button
                  type="button"
                  className="bonus-integ-btn bonus-integ-btn--primary"
                  disabled={busy || disconnecting}
                  onClick={() => onInstall(tile)}
                >
                  <RefreshCw size={15} aria-hidden="true" />
                  <span>{busy ? "Working…" : `Reconnect ${tile.name}`}</span>
                </button>
              ) : null}
              {onDisconnect && (hrisView ? hrisView.connectionWord !== "Disconnected" : healthy || needsReconnect) ? (
                <DisconnectButton
                  title={hrisView?.disconnectTitle ?? `Disconnect ${tile.name}?`}
                  description={hrisView?.disconnectDescription ?? disconnectCopy(tile.name, isDirectory)}
                  disabled={disconnecting || syncing || busy}
                  label={disconnecting ? "Disconnecting…" : "Disconnect"}
                  onConfirm={() => onDisconnect(connection.id)}
                />
              ) : null}
            </>
          ) : null
        }
      />
      {hrisView && hrisView.history.length > 0 ? (
        <section className="sm-mkt-hris-card" aria-labelledby="hris-history-heading">
          <div className="sm-mkt-hris-card__head">
            <h3 id="hris-history-heading">Recent syncs</h3>
          </div>
          <ul className="sm-mkt-hris-history">
            {hrisView.history.map((row) => (
              <li key={row.id}>
                <span>{row.when}</span>
                <span>{row.reasonLabel}</span>
                <span>{row.statusLabel}</span>
                {row.recordsLabel ? <span>{row.recordsLabel}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Marketplace detail for HRIS and directory platforms, matched to the Slack integration page. */
export function HrisMarketplaceDetailView({
  tile,
  onBack,
  onInstall,
  onSelectRelated,
  connection = null,
  busy = false,
  syncing = false,
  disconnecting = false,
  onSync,
  onDisconnect,
  canManage = false,
  zoho = null,
  hrisView = null,
}: {
  tile: Tile;
  onBack: () => void;
  onInstall: (tile: Tile) => void;
  onSelectRelated: (tile: Tile) => void;
  connection?: MergeConnectionPublic | null;
  busy?: boolean;
  syncing?: boolean;
  disconnecting?: boolean;
  onSync?: (connectionId: string) => void;
  onDisconnect?: (connectionId: string) => void;
  canManage?: boolean;
  zoho?: IntegrationsVm["zoho"] | null;
  hrisView?: HrisSyncView | null;
}) {
  const profile = getHrisMarketplaceProfile(tile.id);
  const zohoActive = Boolean(
    zoho &&
      (zoho.status === "connected" ||
        zoho.status === "needs_attention" ||
        zoho.status === "expired" ||
        zoho.status === "error"),
  );
  const mergeActive = Boolean(
    connection && (connection.status === "connected" || connection.status === "needs_attention"),
  );
  const active = tile.id === "zoho-people" ? zohoActive : mergeActive;
  const [tab, setTab] = useState<TabId>("overview");

  useEffect(() => {
    if (!active && tab === "configure") setTab("overview");
  }, [active, tab]);

  useEffect(() => {
    document.querySelector("main.main")?.scrollTo({ top: 0, left: 0 });
  }, [tile.id]);

  const related = USER_MANAGEMENT_TOOLS.filter((item) => item.id !== tile.id).slice(0, 4);
  const heroStatus = hrisView
    ? hrisView.connectionWord
    : tile.id === "zoho-people"
      ? zoho?.status === "connected"
        ? "Connected"
        : "Needs attention"
      : connection?.status === "needs_attention"
        ? "Needs reconnect"
        : "Connected";

  const connecting = busy || (tile.id === "zoho-people" && Boolean(zoho?.connecting));

  return (
    <div className="sm-mkt">
      <button type="button" className="sm-mkt__back" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        Back
      </button>

      <header className="sm-mkt-hero">
        <div className="sm-mkt-hero__main">
          <div className="sm-mkt-hero__logo sm-mkt-hero__logo--wordmark" aria-hidden="true">
            {tile.icon ? <img src={tile.icon} alt="" /> : <span>{tile.name.slice(0, 1)}</span>}
          </div>
          <div className="sm-mkt-hero__copy">
            <h1 className="sm-mkt-hero__title">{tile.name}</h1>
            <p className="sm-mkt-hero__meta">
              <span>{profile?.categories[0] ?? "HRIS"}</span>
              <span className="sm-mkt-hero__sep" aria-hidden="true">
                •
              </span>
              <span>{profile?.categories[1] ?? "People management"}</span>
              {profile ? (
                <>
                  <span className="sm-mkt-hero__sep" aria-hidden="true">
                    •
                  </span>
                  <a href={profile.websiteUrl} target="_blank" rel="noreferrer">
                    {profile.websiteLabel} <ExternalLink size={12} aria-hidden="true" />
                  </a>
                </>
              ) : null}
            </p>
            <p className="sm-mkt-hero__tagline">{profile?.tagline ?? tile.desc}</p>
            <div className="sm-mkt-hero__by">
              <span className="sm-mkt-hero__by-label">Integration By</span>
              <span>Shelf Merch</span>
            </div>
          </div>
        </div>

        <div className="sm-mkt-hero__actions">
          {tile.requiresSetup && !active ? (
            <span className="sm-mkt-hero__status">Requires setup</span>
          ) : active ? (
            <>
              <span className="sm-mkt-hero__status">{heroStatus}</span>
              <button
                type="button"
                className="sm-mkt-hero__cta sm-mkt-hero__cta--ghost"
                onClick={() => setTab("configure")}
              >
                Configure
              </button>
            </>
          ) : canManage ? (
            <button
              type="button"
              className="sm-mkt-hero__cta"
              disabled={connecting}
              onClick={() => (tile.id === "zoho-people" && zoho ? zoho.onConnect() : onInstall(tile))}
            >
              {connecting ? (
                <>
                  <Loader2 size={16} className="auth-spin" aria-hidden="true" />
                  Connecting…
                </>
              ) : (
                "Connect"
              )}
            </button>
          ) : (
            <span className="sm-mkt-hero__status">Ask an admin to connect</span>
          )}
        </div>
      </header>

      <div className="sm-mkt-tabs" role="tablist" aria-label={`${tile.name} integration sections`}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "overview"}
          className={`sm-mkt-tabs__btn${tab === "overview" ? " is-active" : ""}`}
          onClick={() => setTab("overview")}
        >
          Integration overview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "appinfo"}
          className={`sm-mkt-tabs__btn${tab === "appinfo" ? " is-active" : ""}`}
          onClick={() => setTab("appinfo")}
        >
          App information
        </button>
        {active ? (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "configure"}
            className={`sm-mkt-tabs__btn${tab === "configure" ? " is-active" : ""}`}
            onClick={() => setTab("configure")}
          >
            Configuration
          </button>
        ) : null}
      </div>

      <div className="sm-mkt-panel">
        {tab === "overview" ? (
          <>
            <div className="sm-mkt-body">
              <div className="sm-mkt-split">
                <div className="sm-mkt-about">
                  <h3>How to set it up</h3>
                  <p>
                    {tile.requiresSetup
                      ? `${tile.name} requires additional setup before it can be connected from Shelf Merch.`
                      : (profile?.setup ??
                        `Click Connect and authorize ShelfMerch with ${tile.name}. Syncing starts automatically. Sync now is optional.`)}
                  </p>
                  <h4>Integration overview</h4>
                  <IntegrationOverview providerId={tile.id} providerName={tile.name} />
                </div>

                <aside className="sm-mkt-highlights" aria-label="Highlights">
                  <h3>Highlights</h3>
                  <ul>
                    {(profile?.highlights ?? []).map((item) => (
                      <li key={item}>
                        <span className="sm-mkt-highlights__icon" aria-hidden="true">
                          <Check size={11} strokeWidth={3} />
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </aside>
              </div>
            </div>

            <section className="sm-mkt-related" aria-labelledby="hris-related-heading">
              <h3 id="hris-related-heading" className="sm-mkt-related__title">
                You may also like
              </h3>
              <p className="sm-mkt-related__sub">Other HR platforms with the same directory sync</p>
              <div className="sm-mkt-related__grid">
                {related.map((item) => {
                  const itemProfile = getHrisMarketplaceProfile(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="sm-mkt-related__card"
                      onClick={() => onSelectRelated(item)}
                    >
                      <div className="sm-mkt-related__top">
                        <span className="sm-mkt-related__logo" aria-hidden="true">
                          {item.icon ? (
                            <img src={item.icon} alt="" />
                          ) : (
                            <span style={{ background: item.tone || "#242424" }}>
                              {item.mark || item.name.slice(0, 1)}
                            </span>
                          )}
                        </span>
                        <span className="sm-mkt-related__cat">
                          {itemProfile?.categories[0] ?? "HRIS"}
                        </span>
                      </div>
                      <span className="sm-mkt-related__name">{item.name}</span>
                      <span className="sm-mkt-related__desc">
                        {item.desc || itemProfile?.tagline || "Sync people into Shelf Merch."}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        ) : null}

        {tab === "configure" && active ? (
          <HrisConfigurePanel
            tile={tile}
            connection={connection}
            zoho={zoho}
            busy={busy}
            syncing={syncing}
            disconnecting={disconnecting}
            canManage={canManage}
            onInstall={onInstall}
            onSync={onSync}
            onDisconnect={onDisconnect}
            hrisView={hrisView}
          />
        ) : null}

        {tab === "appinfo" ? (
          <div className="sm-mkt-body sm-mkt-appinfo">
            <h3 className="sm-mkt-related__title">App information</h3>
            <p>
              {tile.id === "zoho-people"
                ? "ShelfMerch connects to Zoho People with OAuth. An administrator runs Sync now to import employees. Zoho People does not sync automatically. You can disconnect anytime; imported contacts stay in this workspace."
                : `ShelfMerch connects to ${tile.name} and keeps supported ${
                    tile.id === "google-workspace" ? "directory details" : "employee details"
                  } up to date automatically. Sync now is optional, and you can disconnect anytime.`}
            </p>
            <dl>
              <div>
                <dt>Publisher</dt>
                <dd>Shelf Merch</dd>
              </div>
              <div>
                <dt>Category</dt>
                <dd>
                  {profile
                    ? `${profile.categories[0]} · ${profile.categories[1]}`
                    : "HRIS · People management"}
                </dd>
              </div>
              {profile ? (
                <div>
                  <dt>Website</dt>
                  <dd>
                    <a href={profile.websiteUrl} target="_blank" rel="noreferrer">
                      {profile.websiteLabel}
                    </a>
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>Permissions</dt>
                <dd>{profile?.permissions ?? `Read people data you authorize from ${tile.name}.`}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </div>
    </div>
  );
}
