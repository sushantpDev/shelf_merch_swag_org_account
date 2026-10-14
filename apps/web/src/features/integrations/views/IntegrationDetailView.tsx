import { Link } from "react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  CircleHelp,
  Clock,
  Loader2,
  RefreshCw,
  Unplug,
  Users,
} from "lucide-react";
import type { Tile } from "../data";
import type { IntegrationsVm } from "../controllers/useIntegrationsController";
import { isMergeHrisIntegration } from "@/services/merge-api";
import type { MergeConnectionPublic, MergeSyncStatusPublic } from "@/services/merge-api";
import { deriveHrisSyncView, usesHrisAutomaticSyncUi } from "../hrisSyncUi";
import { HrisSyncPanel } from "./HrisSyncPanel";
import {
  canSaveSlackChannel,
  canSendSlackTestMessage,
  formatSlackChannelLabel,
  SLACK_DETAIL_LEAD,
  SLACK_NOTIFICATIONS_DESCRIPTION,
  SLACK_NOTIFICATIONS_TITLE,
  slackChannelOptionLabel,
} from "../slackDetailUi";
import { SlackNotificationPrefsList } from "../components/SlackNotificationPrefsList";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { SlackMarketplaceDetailView } from "./SlackMarketplaceDetailView";
import { HrisMarketplaceDetailView } from "./HrisMarketplaceDetailView";
import { isHrisMarketplaceTile } from "../hrisMarketplaceCopy";

export function IntegrationMark({
  tile,
  size = "normal",
}: {
  tile: Tile;
  size?: "normal" | "large";
}) {
  return (
    <span className={`bonus-integ-logo bonus-integ-logo--${size}`} aria-hidden="true">
      {tile.icon ? (
        <img src={tile.icon} alt="" />
      ) : (
        <span style={{ background: tile.tone }}>{tile.mark}</span>
      )}
    </span>
  );
}

function detailCopy(tile: Tile) {
  if (tile.requiresSetup) {
    return `${tile.name} requires additional setup in Merge before it can be connected from ShelfMerch.`;
  }
  if (tile.id === "slack") {
    return SLACK_DETAIL_LEAD;
  }
  if (tile.id === "google-workspace") {
    return "Provision recipients and sync org directory from Google.";
  }
  if (tile.id === "microsoft-teams") {
    return "Install our Microsoft Teams app to announce gifting activity and keep employee moments visible in team channels.";
  }
  if (tile.id === "google-chat") {
    return "Connect Google Chat to share gifting updates with the right spaces automatically.";
  }
  return (
    tile.desc ??
    `Connect ${tile.name} to ShelfMerch and automate this part of your gifting workflow.`
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "N/A";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "N/A";
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

function mergeSyncFailureCopy(connection: MergeConnectionPublic) {
  const isDirectory = connection.category === "directory";
  const isGoogleWorkspace = connection.provider === "google-workspace";
  if (connection.lastError === "MERGE_SCOPES_DISABLED") {
    if (isGoogleWorkspace) {
      return "Required Google Workspace permissions are not enabled.";
    }
    return isDirectory
      ? "This directory connection is valid, but required Merge data scopes are disabled."
      : "This HRIS connection is valid, but required Merge data scopes are disabled.";
  }
  if (connection.lastSyncStatus === "failed") {
    if (isGoogleWorkspace) {
      return "Google Workspace sync could not be completed. Try again.";
    }
    return isDirectory
      ? "Directory sync could not be completed. Try again."
      : "Last sync failed. You can retry without reconnecting.";
  }
  return null;
}

function mergeDisconnectCopy(tileName: string, isDirectory: boolean) {
  if (isDirectory) {
    return `ShelfMerch will unlink this ${tileName} Linked Account. Imported directory users and Workspace Contacts are kept. Other providers stay connected. You can reconnect later.`;
  }
  return `ShelfMerch will unlink this ${tileName} Linked Account. Imported HRIS employees and Workspace Contacts are kept. Other HRIS providers stay connected. You can reconnect later.`;
}

function StatusPill({
  tone,
  label,
}: {
  tone: "success" | "warning" | "danger" | "neutral";
  label: string;
}) {
  return (
    <span className={`bonus-integ-status-pill bonus-integ-status-pill--${tone}`} role="status">
      <span className="bonus-integ-status-pill__dot" aria-hidden="true" />
      {label}
    </span>
  );
}

function MetaPanel({ children }: { children: ReactNode }) {
  return <div className="bonus-integ-meta-panel">{children}</div>;
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bonus-integ-meta-row">
      <span className="bonus-integ-meta-row__label">{label}</span>
      <span className="bonus-integ-meta-row__value">{value}</span>
    </div>
  );
}

function MetaStats({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="bonus-integ-meta-stats">
      {items.map((item) => {
        const ok = item.label === "Status" && item.value === "Connected";
        return (
          <div key={item.label} className="bonus-integ-meta-stat">
            <span className="bonus-integ-meta-stat__label">{item.label}</span>
            <span className={`bonus-integ-meta-stat__value${ok ? " is-ok" : ""}`}>
              {ok ? <i aria-hidden="true" /> : null}
              {item.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Callout({
  tone = "warning",
  children,
}: {
  tone?: "warning" | "danger" | "info";
  children: ReactNode;
}) {
  return (
    <div className={`bonus-integ-callout bonus-integ-callout--${tone}`} role="status">
      <CircleAlert size={16} aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

function DisconnectConfirm({
  title,
  description,
  disabled,
  label = "Disconnect",
  onConfirm,
}: {
  title: string;
  description: string;
  disabled?: boolean;
  label?: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className="bonus-integ-btn bonus-integ-btn--danger"
          disabled={disabled}
        >
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

function SlackDetailBody({
  slack,
  busy,
}: {
  slack: NonNullable<IntegrationsVm["slack"]>;
  busy: boolean;
}) {
  const connection = slack.connection;
  const active =
    connection &&
    (connection.status === "connected" || connection.status === "needs_attention");
  const [channelDraft, setChannelDraft] = useState(connection?.defaultChannelId || "");

  useEffect(() => {
    setChannelDraft(connection?.defaultChannelId || "");
  }, [connection?.defaultChannelId]);

  if (slack.loading && !connection) {
    return (
      <div className="bonus-integ-slack">
        <p className="bonus-integ-meta-note">Checking Slack connection…</p>
      </div>
    );
  }

  if (!active) {
    return (
      <div className="bonus-integ-detail-actions">
        {slack.canManage ? (
          <button
            type="button"
            className="bonus-integ-btn bonus-integ-btn--primary"
            disabled={busy || slack.connecting}
            onClick={slack.onConnect}
          >
            {slack.connecting ? (
              <>
                <Loader2 size={15} className="auth-spin" aria-hidden="true" />
                <span>Redirecting to Slack…</span>
              </>
            ) : (
              <span>Connect Slack</span>
            )}
          </button>
        ) : (
          <Callout tone="info">Ask a company admin to connect Slack for this workspace.</Callout>
        )}
      </div>
    );
  }

  const selectedId = channelDraft || connection.defaultChannelId || "";
  const saveEnabled = canSaveSlackChannel({
    draftId: selectedId,
    defaultChannelId: connection.defaultChannelId,
  });
  const testEnabled = canSendSlackTestMessage(connection.defaultChannelId);
  const statusTone = connection.status === "needs_attention" ? "warning" : "success";
  const statusLabel =
    connection.status === "needs_attention" ? "Needs attention" : "Connected";

  return (
    <div className="bonus-integ-slack">
      <div className="bonus-integ-slack-summary" aria-label="Slack connection summary">
        <div className="bonus-integ-slack-summary__item">
          <span className="bonus-integ-slack-summary__label">Status</span>
          <StatusPill tone={statusTone} label={statusLabel} />
        </div>
        <div className="bonus-integ-slack-summary__item">
          <span className="bonus-integ-slack-summary__label">Workspace</span>
          <span className="bonus-integ-slack-summary__value">
            {connection.teamName || "Slack workspace"}
          </span>
        </div>
        <div className="bonus-integ-slack-summary__item">
          <span className="bonus-integ-slack-summary__label">Default channel</span>
          <span className="bonus-integ-slack-summary__value">
            {formatSlackChannelLabel(connection.defaultChannelName)}
          </span>
        </div>
      </div>

      {connection.status === "needs_attention" ? (
        <Callout tone="warning">
          Slack needs to be re-authorized. Disconnect and connect again if messages fail.
        </Callout>
      ) : null}

      <section className="bonus-integ-slack-notifications" aria-labelledby="slack-notifications-heading">
        <div className="bonus-integ-slack-channel__copy">
          <h3 id="slack-notifications-heading">{SLACK_NOTIFICATIONS_TITLE}</h3>
          <p>{SLACK_NOTIFICATIONS_DESCRIPTION}</p>
        </div>
        {slack.notificationsError ? <Callout tone="warning">{slack.notificationsError}</Callout> : null}
        <SlackNotificationPrefsList
          connection={connection}
          disabled={!slack.canManage || slack.disconnecting}
          onUpdate={slack.onUpdateNotifications}
        />
        {slack.savingNotifications ? (
          <p className="bonus-integ-meta-note" aria-live="polite">
            Saving notification preferences…
          </p>
        ) : null}
      </section>

      {slack.canManage ? (
        <section className="bonus-integ-slack-channel" aria-labelledby="slack-default-channel-heading">
          <div className="bonus-integ-slack-channel__copy">
            <h3 id="slack-default-channel-heading">Default channel</h3>
            <p>Choose where ShelfMerch should send Slack updates.</p>
          </div>

          {slack.channelsError ? <Callout tone="warning">{slack.channelsError}</Callout> : null}

          {slack.channelsLoading && slack.channels.length === 0 ? (
            <p className="bonus-integ-meta-note" aria-live="polite">
              Loading channels…
            </p>
          ) : !slack.channelsLoading && slack.channels.length === 0 && !slack.channelsError ? (
            <p className="bonus-integ-meta-note">No public channels available</p>
          ) : (
            <Select
              value={selectedId || undefined}
              onValueChange={setChannelDraft}
              disabled={slack.savingChannel || (slack.channelsLoading && slack.channels.length === 0)}
            >
              <SelectTrigger
                className="bonus-integ-slack-select"
                aria-label="Default Slack channel"
              >
                <SelectValue placeholder="Choose a channel" />
              </SelectTrigger>
              <SelectContent className="bonus-integ-slack-select-content">
                {slack.channels.map((ch) => (
                  <SelectItem key={ch.id} value={ch.id}>
                    {slackChannelOptionLabel(ch)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="bonus-integ-slack-channel__actions">
            <button
              type="button"
              className="bonus-integ-btn bonus-integ-btn--secondary"
              disabled={!saveEnabled || slack.savingChannel || slack.sendingTest}
              onClick={() => slack.onSaveChannel(selectedId)}
            >
              {slack.savingChannel ? (
                <>
                  <Loader2 size={15} className="auth-spin" aria-hidden="true" />
                  <span>Saving…</span>
                </>
              ) : (
                <span>Save channel</span>
              )}
            </button>
            <button
              type="button"
              className="bonus-integ-btn bonus-integ-btn--ghost"
              disabled={slack.channelsLoading || slack.savingChannel}
              onClick={slack.onLoadChannels}
            >
              {slack.channelsLoading ? (
                <>
                  <Loader2 size={15} className="auth-spin" aria-hidden="true" />
                  <span>Refreshing…</span>
                </>
              ) : (
                <>
                  <RefreshCw size={15} aria-hidden="true" />
                  <span>Refresh</span>
                </>
              )}
            </button>
          </div>
        </section>
      ) : null}

      <div className="bonus-integ-detail-actions bonus-integ-slack-footer-actions">
        {slack.canManage ? (
          <button
            type="button"
            className="bonus-integ-btn bonus-integ-btn--primary"
            disabled={!testEnabled || slack.sendingTest || slack.savingChannel || slack.disconnecting}
            onClick={slack.onSendTest}
          >
            {slack.sendingTest ? (
              <>
                <Loader2 size={15} className="auth-spin" aria-hidden="true" />
                <span>Sending…</span>
              </>
            ) : (
              <span>Send test message</span>
            )}
          </button>
        ) : null}
        {slack.canManage ? (
          <DisconnectConfirm
            title="Disconnect Slack?"
            description="ShelfMerch will remove access to this Slack workspace. Other company integrations are not affected. You can reconnect later."
            disabled={slack.disconnecting || slack.sendingTest || slack.savingChannel}
            label={slack.disconnecting ? "Disconnecting…" : "Disconnect"}
            onConfirm={slack.onDisconnect}
          />
        ) : null}
      </div>
    </div>
  );
}

export function IntegrationDetailView({
  tile,
  onBack,
  onInstall,
  onSelect,
  onSupport,
  connection,
  busy = false,
  syncing = false,
  disconnecting = false,
  onSync,
  onDisconnect,
  syncStatus = null,
  syncStatusLoading = false,
  syncStatusError = false,
  canManage = false,
  zoho = null,
  slack = null,
}: {
  tile: Tile;
  onBack: () => void;
  onInstall: (tile: Tile) => void;
  onSelect?: (tile: Tile) => void;
  onSupport: () => void;
  connection?: MergeConnectionPublic | null;
  busy?: boolean;
  syncing?: boolean;
  disconnecting?: boolean;
  onSync?: (connectionId: string) => void;
  onDisconnect?: (connectionId: string) => void;
  syncStatus?: MergeSyncStatusPublic | null;
  syncStatusLoading?: boolean;
  syncStatusError?: boolean;
  canManage?: boolean;
  zoho?: IntegrationsVm["zoho"] | null;
  slack?: IntegrationsVm["slack"] | null;
}) {
  const isMergeProvider = isMergeHrisIntegration(tile.id);
  const hrisAuto = usesHrisAutomaticSyncUi(tile.id, connection?.category);
  const hrisView =
    hrisAuto && connection
      ? deriveHrisSyncView({
          providerName: tile.name,
          connection,
          syncStatus,
          enqueuePending: syncing,
        })
      : null;
  const mergeHealthy = Boolean(connection && connection.status === "connected");
  const mergeNeedsReconnect = Boolean(connection && connection.status === "needs_attention");
  const syncFailed = connection?.lastSyncStatus === "failed";
  const syncPhase =
    connection?.lastSyncStatus === "syncing"
      ? "syncing"
      : connection?.lastSyncStatus === "queued" || syncing
        ? "queued"
        : null;
  const syncFailureMessage = connection ? mergeSyncFailureCopy(connection) : null;
  const zohoConnected = Boolean(
    zoho &&
      (zoho.status === "connected" ||
        zoho.status === "needs_attention" ||
        zoho.status === "expired" ||
        zoho.status === "error"),
  );
  const showMergeDisconnect =
    isMergeProvider &&
    canManage &&
    onDisconnect &&
    connection &&
    (mergeHealthy || mergeNeedsReconnect);

  if (tile.id === "slack" && slack) {
    return (
      <SlackMarketplaceDetailView
        tile={tile}
        slack={slack}
        busy={busy || slack.connecting}
        onBack={onBack}
        onSelectRelated={(related) => {
          if (related.id === tile.id) return;
          (onSelect ?? onInstall)(related);
        }}
      />
    );
  }

  if (isHrisMarketplaceTile(tile.id)) {
    return (
      <HrisMarketplaceDetailView
        tile={tile}
        onBack={onBack}
        onInstall={onInstall}
        onSelectRelated={(related) => {
          if (related.id === tile.id) return;
          (onSelect ?? onInstall)(related);
        }}
        connection={connection}
        busy={busy}
        syncing={syncing}
        disconnecting={disconnecting}
        onSync={onSync}
        onDisconnect={onDisconnect}
        canManage={canManage}
        zoho={tile.id === "zoho-people" ? zoho : null}
        hrisView={hrisView}
      />
    );
  }

  const detailKicker =
    tile.id === "google-workspace"
      ? "Directory integration"
      : isMergeProvider || tile.id === "zoho-people"
        ? "HRIS integration"
        : "Integration";

  let body: ReactNode = null;

  if (isMergeProvider && tile.requiresSetup && !connection) {
    body = (
      <>
        <MetaPanel>
          <div className="bonus-integ-meta-panel__top">
            <StatusPill tone="neutral" label="Requires setup" />
          </div>
          <p className="bonus-integ-meta-note">
            Connection is unavailable until Merge/org setup is complete for {tile.name}.
          </p>
        </MetaPanel>
      </>
    );
  } else if (hrisView && connection) {
    body = (
      <>
        <HrisSyncPanel
          view={hrisView}
          providerName={tile.name}
          canManage={canManage}
          busy={busy}
          disconnecting={disconnecting}
          syncStatusLoading={syncStatusLoading}
          syncStatusError={syncStatusError}
          onSync={onSync ? () => onSync(connection.id) : undefined}
          onReconnect={() => onInstall(tile)}
          onDisconnect={onDisconnect ? () => onDisconnect(connection.id) : undefined}
        />
        {connection.status === "connected" ? (
          <section className="bonus-integ-quick-links" aria-label="Employee directory">
            <Link to={`/app/integrations/hris-employees?provider=${encodeURIComponent(tile.id)}`} className="bonus-integ-directory-link">
              <span className="bonus-integ-directory-icon bonus-integ-directory-icon--people" aria-hidden="true">
                <Users size={16} />
              </span>
              <span className="bonus-integ-directory-copy">
                <strong>Employee directory</strong>
                <span>See people synced from {tile.name}</span>
              </span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </section>
        ) : null}
      </>
    );
  } else if (isMergeProvider && mergeHealthy && connection) {
    body = (
      <>
        {syncFailureMessage ? <Callout tone="warning">{syncFailureMessage}</Callout> : null}

        <div className="bonus-integ-detail-actions bonus-integ-detail-actions--split">
          {canManage && onSync ? (
            <button
              type="button"
              className="bonus-integ-btn bonus-integ-btn--primary"
              disabled={Boolean(syncPhase) || busy || disconnecting}
              onClick={() => onSync(connection.id)}
            >
              {syncPhase ? (
                <>
                  <Loader2 size={15} className="auth-spin" aria-hidden="true" />
                  <span>{syncPhase === "syncing" ? "Syncing…" : "Queued"}</span>
                </>
              ) : (
                <>
                  <RefreshCw size={15} aria-hidden="true" />
                  <span>{syncFailed ? "Retry sync" : "Sync now"}</span>
                </>
              )}
            </button>
          ) : null}
          {showMergeDisconnect ? (
            <DisconnectConfirm
              title={`Disconnect ${tile.name}?`}
              description={mergeDisconnectCopy(tile.name, connection.category === "directory")}
              disabled={disconnecting || Boolean(syncPhase) || busy}
              label={disconnecting ? "Disconnecting…" : "Disconnect"}
              onConfirm={() => onDisconnect?.(connection.id)}
            />
          ) : null}
        </div>

        <section className="bonus-integ-quick-links" aria-label="Employee directory">
          <Link to={`/app/integrations/hris-employees?provider=${encodeURIComponent(tile.id)}`} className="bonus-integ-directory-link">
            <span className="bonus-integ-directory-icon bonus-integ-directory-icon--people" aria-hidden="true">
              <Users size={16} />
            </span>
            <span className="bonus-integ-directory-copy">
              <strong>Employee directory</strong>
              <span>See people synced from {tile.name}</span>
            </span>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </section>
      </>
    );
  } else if (isMergeProvider && mergeNeedsReconnect && connection) {
    body = (
      <>
        <MetaStats
          items={[
            { label: "Status", value: "Needs reconnect" },
            { label: "Last synced", value: formatDate(connection.lastSyncAt) },
            { label: "Provider", value: connection.integrationName || tile.name },
          ]}
        />
        <Callout tone="warning">
          {tile.id === "google-workspace"
            ? "Google Workspace needs to be reconnected."
            : "This Linked Account needs to be re-authorized with Merge before syncing can continue."}
        </Callout>
        <div className="bonus-integ-detail-actions">
          <button
            type="button"
            className="bonus-integ-btn bonus-integ-btn--primary"
            disabled={busy || disconnecting}
            onClick={() => onInstall(tile)}
          >
            <RefreshCw size={15} aria-hidden="true" />
            <span>{busy ? "Working…" : `Reconnect ${tile.name}`}</span>
          </button>
          {showMergeDisconnect ? (
            <DisconnectConfirm
              title={`Disconnect ${tile.name}?`}
              description={mergeDisconnectCopy(tile.name, connection.category === "directory")}
              disabled={disconnecting || busy}
              label={disconnecting ? "Disconnecting…" : "Disconnect"}
              onConfirm={() => onDisconnect?.(connection.id)}
            />
          ) : null}
        </div>
      </>
    );
  } else if (zohoConnected && zoho) {
    const zohoTone =
      zoho.status === "connected"
        ? "success"
        : zoho.status === "expired" || zoho.status === "needs_attention"
          ? "warning"
          : "danger";
    const zohoLabel =
      zoho.status === "connected"
        ? "Connected"
        : zoho.status === "expired"
          ? "Connection expired"
          : zoho.status === "needs_attention"
            ? "Needs attention"
            : "Error";
    body = (
      <>
        <MetaPanel>
          <div className="bonus-integ-meta-panel__top">
            <StatusPill tone={zohoTone} label={zohoLabel} />
          </div>
          <MetaRow label="Last synced" value={formatDate(zoho.integration?.lastSyncedAt)} />
        </MetaPanel>
        <div className="bonus-integ-detail-actions">
          {canManage ? (
            <button
              type="button"
              className="bonus-integ-btn bonus-integ-btn--primary"
              disabled={zoho.syncing || zoho.status === "expired"}
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
                  <span>Sync employees</span>
                </>
              )}
            </button>
          ) : null}
          {zoho.status === "expired" && canManage ? (
            <button
              type="button"
              className="bonus-integ-btn bonus-integ-btn--secondary"
              disabled={zoho.connecting}
              onClick={zoho.onConnect}
            >
              Reconnect
            </button>
          ) : null}
          {canManage ? (
            <DisconnectConfirm
              title="Disconnect Zoho People?"
              description="ShelfMerch will stop syncing employees from Zoho People. Existing contacts and orders are kept. You can reconnect later."
              disabled={zoho.disconnecting}
              onConfirm={zoho.onDisconnect}
            />
          ) : null}
        </div>
      </>
    );
  } else if (tile.requiresSetup) {
    body = (
      <MetaPanel>
        <div className="bonus-integ-meta-panel__top">
          <StatusPill tone="neutral" label="Requires setup" />
        </div>
        <p className="bonus-integ-meta-note">
          Connection is unavailable until setup is complete.
        </p>
      </MetaPanel>
    );
  } else {
    body = (
      <div className="bonus-integ-detail-actions">
        <button
          type="button"
          className="bonus-integ-btn bonus-integ-btn--primary"
          disabled={busy}
          onClick={() => onInstall(tile)}
        >
          {tile.mark && !tile.icon ? <IntegrationMark tile={tile} /> : null}
          <span>{busy ? "Working…" : `Connect ${tile.name}`}</span>
        </button>
      </div>
    );
  }

  const headerStatus =
    hrisView
      ? ({
          tone: hrisView.connectionWord === "Connected" ? "success" : hrisView.connectionWord === "Disconnected" ? "neutral" : "warning",
          label: `${hrisView.connectionMark} ${hrisView.connectionWord}`,
        } as const)
      : isMergeProvider && mergeHealthy && connection
      ? syncFailed
        ? ({ tone: "warning", label: "Sync failed" } as const)
        : ({ tone: "success", label: "Connected" } as const)
      : isMergeProvider && mergeNeedsReconnect
        ? ({ tone: "warning", label: "Needs reconnect" } as const)
        : zohoConnected && zoho
          ? zoho.status === "connected"
            ? ({ tone: "success", label: "Connected" } as const)
            : ({ tone: "warning", label: "Needs attention" } as const)
          : null;

  return (
    <div className="bonus-integ-detail-page">
      <button type="button" className="bonus-integ-back" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        <span>Back to integrations</span>
      </button>

      <div className="bonus-integ-detail-card">
        <header className="bonus-integ-detail-header">
          {(tile.icon || tile.mark) && (
            <div className="bonus-integ-detail-brand">
              <IntegrationMark tile={tile} size="large" />
            </div>
          )}
          <div className="bonus-integ-detail-heading">
            <div className="bonus-integ-detail-title-row">
              <p className="bonus-integ-detail-kicker">{detailKicker}</p>
              {headerStatus ? (
                <StatusPill tone={headerStatus.tone} label={headerStatus.label} />
              ) : null}
            </div>
            <h1>{tile.name}</h1>
            <p className="bonus-integ-detail-lead">{hrisView ? hrisView.lead : detailCopy(tile)}</p>
            {isMergeProvider && mergeHealthy && connection?.lastSyncAt && !hrisView ? (
              <p className="bonus-integ-detail-meta">
                <Clock size={13} aria-hidden="true" />
                Last synced {formatDate(connection.lastSyncAt)}
              </p>
            ) : null}
          </div>
        </header>

        <div className="bonus-integ-detail-body">{body}</div>

        <footer className="bonus-integ-help">
          <CircleHelp size={14} aria-hidden="true" />
          <span>Need help?</span>
          <button type="button" onClick={onSupport}>
            Drop us a line
          </button>
        </footer>
      </div>
    </div>
  );
}
