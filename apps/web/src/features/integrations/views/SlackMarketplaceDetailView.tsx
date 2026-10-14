import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Loader2,
  RefreshCw,
  Unplug,
} from "lucide-react";
import type { Tile } from "../data";
import { COLLABORATION_TOOLS, DISPLAY_TOOLS } from "../data";
import type { IntegrationsVm } from "../controllers/useIntegrationsController";
import {
  canSaveSlackChannel,
  canSendSlackTestMessage,
  formatSlackChannelLabel,
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
import "../slack-marketplace.css";

type TabId = "overview" | "configure" | "appinfo";

const HIGHLIGHTS = [
  "Receive alerts for gift sends, kit assignments, and recognition moments in Slack.",
  "Automate essential updates for wallet funding, budgets, points, and shipping.",
  "Choose which Shelf Merch events post to your default channel and change them anytime.",
];

const OVERVIEW_BULLETS = [
  "Post gifting and recognition updates to channels your team already uses.",
  "Get notified on wallet funding, budget changes, kits, and order shipping.",
  "Send a test message after connecting to confirm channel delivery.",
  "Disconnect anytime. Other Shelf Merch integrations stay intact.",
];

const RELATED = [
  ...COLLABORATION_TOOLS.filter((t) => t.id !== "slack").slice(0, 3),
  ...DISPLAY_TOOLS.slice(0, 1),
].slice(0, 4);

function isSlackActive(slack: NonNullable<IntegrationsVm["slack"]>) {
  const connection = slack.connection;
  return Boolean(
    connection &&
      (connection.status === "connected" || connection.status === "needs_attention"),
  );
}

function SlackConfigurePanel({
  slack,
}: {
  slack: NonNullable<IntegrationsVm["slack"]>;
}) {
  const connection = slack.connection!;
  const [channelDraft, setChannelDraft] = useState(connection.defaultChannelId || "");

  useEffect(() => {
    setChannelDraft(connection.defaultChannelId || "");
  }, [connection.defaultChannelId]);

  const selectedId = channelDraft || connection.defaultChannelId || "";
  const saveEnabled = canSaveSlackChannel({
    draftId: selectedId,
    defaultChannelId: connection.defaultChannelId,
  });
  const testEnabled = canSendSlackTestMessage(connection.defaultChannelId);

  return (
    <div className="sm-mkt-config bonus-integ-slack">
      <div className="bonus-integ-slack-summary" aria-label="Slack connection summary">
        <div className="bonus-integ-slack-summary__item">
          <span className="bonus-integ-slack-summary__label">Status</span>
          <span
            className={`bonus-integ-status-pill bonus-integ-status-pill--${connection.status === "needs_attention" ? "warning" : "success"}`}
            role="status"
          >
            <span className="bonus-integ-status-pill__dot" aria-hidden="true" />
            {connection.status === "needs_attention" ? "Needs attention" : "Connected"}
          </span>
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
        <div className="bonus-integ-callout bonus-integ-callout--warning" role="status">
          <p>Slack needs to be re-authorized. Disconnect and connect again if messages fail.</p>
        </div>
      ) : null}

      <section className="bonus-integ-slack-notifications" aria-labelledby="slack-notifications-heading">
        <div className="bonus-integ-slack-channel__copy">
          <h3 id="slack-notifications-heading">{SLACK_NOTIFICATIONS_TITLE}</h3>
          <p>{SLACK_NOTIFICATIONS_DESCRIPTION}</p>
        </div>
        {slack.notificationsError ? (
          <div className="bonus-integ-callout bonus-integ-callout--warning" role="status">
            <p>{slack.notificationsError}</p>
          </div>
        ) : null}
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
            <p>Choose where Shelf Merch should send Slack updates.</p>
          </div>

          {slack.channelsError ? (
            <div className="bonus-integ-callout bonus-integ-callout--warning" role="status">
              <p>{slack.channelsError}</p>
            </div>
          ) : null}

          {slack.channelsLoading && slack.channels.length === 0 ? (
            <p className="bonus-integ-meta-note">Loading channels…</p>
          ) : !slack.channelsLoading && slack.channels.length === 0 && !slack.channelsError ? (
            <p className="bonus-integ-meta-note">No public channels available</p>
          ) : (
            <Select
              value={selectedId || undefined}
              onValueChange={setChannelDraft}
              disabled={slack.savingChannel || (slack.channelsLoading && slack.channels.length === 0)}
            >
              <SelectTrigger className="bonus-integ-slack-select" aria-label="Default Slack channel">
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
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="bonus-integ-btn bonus-integ-btn--danger"
                disabled={slack.disconnecting || slack.sendingTest || slack.savingChannel}
              >
                <Unplug size={15} aria-hidden="true" />
                <span>{slack.disconnecting ? "Disconnecting…" : "Disconnect"}</span>
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect Slack?</AlertDialogTitle>
                <AlertDialogDescription>
                  Shelf Merch will remove access to this Slack workspace. Other company integrations
                  are not affected. You can reconnect later.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={slack.onDisconnect}>Disconnect</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
    </div>
  );
}

/** Deel-style marketplace detail for Slack. */
export function SlackMarketplaceDetailView({
  tile,
  slack,
  busy,
  onBack,
  onSelectRelated,
}: {
  tile: Tile;
  slack: NonNullable<IntegrationsVm["slack"]>;
  busy: boolean;
  onBack: () => void;
  onSelectRelated: (tile: Tile) => void;
}) {
  const active = isSlackActive(slack);
  const [tab, setTab] = useState<TabId>("overview");

  useEffect(() => {
    if (!active && tab === "configure") setTab("overview");
  }, [active, tab]);

  const relatedMeta: Record<string, { cat: string; desc: string }> = {
    "microsoft-teams": { cat: "Team chat", desc: "Announce gifting activity in team channels" },
    "google-chat": { cat: "Team chat", desc: "Share updates in Google Chat spaces" },
    zapier: { cat: "Automation", desc: "Connect Shelf Merch to thousands of apps" },
    jostle: { cat: "Intranet", desc: "Surface recognition across your intranet" },
    "google-workspace": { cat: "App provisioning & SSO", desc: "Sync recipients from Google Workspace" },
  };

  return (
    <div className="sm-mkt">
      <button type="button" className="sm-mkt__back" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        Back
      </button>

      <header className="sm-mkt-hero">
        <div className="sm-mkt-hero__main">
          <div className="sm-mkt-hero__logo" aria-hidden="true">
            {tile.icon ? <img src={tile.icon} alt="" /> : <span>S</span>}
          </div>
          <div className="sm-mkt-hero__copy">
            <h1 className="sm-mkt-hero__title">Slack</h1>
            <p className="sm-mkt-hero__meta">
              <span>Collaboration</span>
              <span className="sm-mkt-hero__sep" aria-hidden="true">
                •
              </span>
              <span>Automation &amp; Productivity</span>
              <span className="sm-mkt-hero__sep" aria-hidden="true">
                •
              </span>
              <a href="https://slack.com" target="_blank" rel="noreferrer">
                slack.com <ExternalLink size={12} aria-hidden="true" />
              </a>
            </p>
            <p className="sm-mkt-hero__tagline">Your productivity platform</p>
            <div className="sm-mkt-hero__by">
              <span className="sm-mkt-hero__by-label">Integration By</span>
              <span>Shelf Merch</span>
            </div>
          </div>
        </div>

        <div className="sm-mkt-hero__actions">
          {active ? (
            <>
              <span className="sm-mkt-hero__status">Connected</span>
              <button
                type="button"
                className="sm-mkt-hero__cta sm-mkt-hero__cta--ghost"
                onClick={() => setTab("configure")}
              >
                Configure
              </button>
            </>
          ) : slack.canManage ? (
            <button
              type="button"
              className="sm-mkt-hero__cta"
              disabled={busy || slack.connecting || slack.loading}
              onClick={slack.onConnect}
            >
              {slack.connecting || slack.loading ? (
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

      <div className="sm-mkt-tabs" role="tablist" aria-label="Slack integration sections">
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
                  <h3>About</h3>
                  <p>
                    Use Slack with Shelf Merch to celebrate gifts and keep budget, kit, and order
                    activity visible where your team already works.
                  </p>
                  <h4>Integration overview</h4>
                  <ul>
                    {OVERVIEW_BULLETS.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <h4>How to set it up</h4>
                  <p>
                    Click Connect, authorize Shelf Merch in Slack, then choose a default channel and
                    notification preferences. You can send a test message anytime to confirm
                    delivery.
                  </p>
                </div>

                <aside className="sm-mkt-highlights" aria-label="Highlights">
                  <h3>Highlights</h3>
                  <ul>
                    {HIGHLIGHTS.map((item) => (
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

            <section className="sm-mkt-related" aria-labelledby="slack-related-heading">
              <h3 id="slack-related-heading" className="sm-mkt-related__title">
                You may also like
              </h3>
              <p className="sm-mkt-related__sub">Other apps that share similar functionalities</p>
              <div className="sm-mkt-related__grid">
                {RELATED.map((item) => {
                  const comingSoon = ["microsoft-teams", "google-chat", "zapier", "jostle"].includes(
                    item.id,
                  );
                  const meta = relatedMeta[item.id] || {
                    cat: "Integration",
                    desc: item.desc || "Connect this app to extend your workflow.",
                  };
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="sm-mkt-related__card"
                      disabled={comingSoon}
                      onClick={() => {
                        if (!comingSoon) onSelectRelated(item);
                      }}
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
                        <span className="sm-mkt-related__cat">{meta.cat}</span>
                      </div>
                      <span className="sm-mkt-related__name">{item.name}</span>
                      <span className="sm-mkt-related__desc">{meta.desc}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        ) : null}

        {tab === "configure" && active ? <SlackConfigurePanel slack={slack} /> : null}

        {tab === "appinfo" ? (
          <div className="sm-mkt-body sm-mkt-appinfo">
            <h3 className="sm-mkt-related__title">App information</h3>
            <p>
              Shelf Merch uses Slack OAuth to post workspace notifications. You control the default
              channel and which event types are shared.
            </p>
            <dl>
              <div>
                <dt>Publisher</dt>
                <dd>Shelf Merch</dd>
              </div>
              <div>
                <dt>Category</dt>
                <dd>Collaboration · Automation &amp; Productivity</dd>
              </div>
              <div>
                <dt>Website</dt>
                <dd>
                  <a href="https://slack.com" target="_blank" rel="noreferrer">
                    slack.com
                  </a>
                </dd>
              </div>
              <div>
                <dt>Permissions</dt>
                <dd>Post messages to channels you select after authorizing the app.</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </div>
    </div>
  );
}
