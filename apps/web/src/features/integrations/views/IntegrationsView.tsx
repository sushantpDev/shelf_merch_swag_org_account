import { Link } from "react-router";
import { ArrowRight, LockKeyhole } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/tenant/PageHeader";
import {
  COLLABORATION_TOOLS,
  USER_MANAGEMENT_TOOLS,
  asTile,
  type Integration,
  type Tile,
} from "../data";
import type { IntegrationsVm } from "../controllers/useIntegrationsController";
import { MergeLinkSession } from "../components/MergeLinkSession";
import { IntegrationDetailView } from "./IntegrationDetailView";
import { isMergeHrisIntegration } from "@/services/merge-api";
import "../integrations-page.css";

function IntegrationTile({
  item,
  onSelect,
  connected = false,
  disabled = false,
}: {
  item: Tile | Integration;
  onSelect: (tile: Tile) => void;
  connected?: boolean;
  disabled?: boolean;
}) {
  const tile = asTile(item);

  return (
    <button
      type="button"
      className={`bonus-integ-tile${disabled ? " bonus-integ-tile--disabled" : ""}`}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onSelect(tile);
      }}
    >
      {(tile.icon || tile.mark) && (
        <span className="bonus-integ-logo" aria-hidden="true">
          {tile.icon ? (
            <img src={tile.icon} alt="" />
          ) : (
            <span style={{ background: tile.tone }}>{tile.mark}</span>
          )}
        </span>
      )}
      <span className="bonus-integ-copy">
        <span className="bonus-integ-name">
          {tile.name}
          {connected ? <span className="bonus-integ-recommended">Connected</span> : null}
          {disabled ? <span className="bonus-integ-soon">Coming soon</span> : null}
        </span>
        {tile.recommended && !connected && !disabled ? (
          <span className="bonus-integ-recommended">Recommended</span>
        ) : null}
      </span>
    </button>
  );
}

function isZohoConnected(status: IntegrationsVm["zoho"]["status"]) {
  return (
    status === "connected" ||
    status === "needs_attention" ||
    status === "expired" ||
    status === "error"
  );
}

/**
 * Logo-centered HRIS card.
 * Unconnected Merge/Zoho → start connect immediately.
 * Connected → open management detail.
 * Optional requiresSetup tiles → open detail only (no Link launch).
 */
function HrisLogoCard({
  item,
  onSelect,
  onConnect,
  connected = false,
  needsAttention = false,
  flowBusy = false,
}: {
  item: Tile | Integration;
  onSelect: (tile: Tile) => void;
  onConnect: (tile: Tile) => void;
  connected?: boolean;
  needsAttention?: boolean;
  flowBusy?: boolean;
}) {
  const tile = asTile(item);
  const requiresSetup = Boolean(tile.requiresSetup);
  const startsConnectDirectly =
    !requiresSetup &&
    (isMergeHrisIntegration(tile.id) || tile.id === "zoho-people") &&
    !connected;

  const statusLabel = requiresSetup
    ? "Requires setup"
    : needsAttention
      ? "Needs attention"
      : connected
        ? "Connected"
        : null;

  return (
    <button
      type="button"
      className={`bonus-integ-logo-card${connected || needsAttention ? " bonus-integ-logo-card--connected" : ""}${requiresSetup ? " bonus-integ-logo-card--setup" : ""}`}
      disabled={flowBusy}
      onClick={() => {
        if (startsConnectDirectly) {
          onConnect(tile);
          return;
        }
        onSelect(tile);
      }}
      aria-label={
        requiresSetup
          ? `${tile.name}, requires setup`
          : needsAttention
            ? `${tile.name}, needs attention. Manage`
            : connected
              ? `${tile.name}, connected. Manage`
              : `Connect ${tile.name}`
      }
    >
      <span className="bonus-integ-logo-card__mark" aria-hidden="true">
        {tile.icon ? (
          <img src={tile.icon} alt="" />
        ) : (
          <span className="bonus-integ-logo-card__fallback" style={{ background: tile.tone }}>
            {tile.mark || tile.name.slice(0, 1)}
          </span>
        )}
      </span>
      <span className="bonus-integ-logo-card__label">
        {tile.name}
        {statusLabel ? (
          <span
            className={`bonus-integ-logo-card__status${needsAttention ? " bonus-integ-logo-card__status--attention" : ""}${requiresSetup ? " bonus-integ-logo-card__status--setup" : ""}`}
          >
            {statusLabel}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function Section({
  title,
  desc,
  badge,
  action,
  children,
}: {
  title: string;
  desc: string;
  badge?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="bonus-integ-section">
      <div className="bonus-integ-section__head">
        <div className="bonus-integ-section__copy">
          <h2>
            {title}
            {badge ? <span className="bonus-integ-section-badge">{badge}</span> : null}
          </h2>
          <p>{desc}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Integrations screen: tile grids, or a selected tile management detail. */
export function IntegrationsView(vm: IntegrationsVm) {
  const mergeLink =
    vm.mergeLinkToken != null ? (
      <MergeLinkSession
        key={`${vm.mergeLinkProvider ?? "hris"}:${vm.mergeLinkToken}`}
        linkToken={vm.mergeLinkToken}
        provider={vm.mergeLinkProvider}
        onSuccess={vm.onMergeLinkSuccess}
        onExit={vm.onMergeLinkExit}
      />
    ) : null;

  if (vm.selected) {
    const connection = isMergeHrisIntegration(vm.selected.id)
      ? vm.mergeConnectionsByProvider[vm.selected.id] || null
      : null;
    return (
      <>
        {mergeLink}
        <IntegrationDetailView
          tile={vm.selected}
          onBack={vm.onBack}
          onInstall={vm.onInstall}
          onSelect={vm.onSelect}
          onSupport={vm.onSupport}
          connection={connection}
          syncStatus={vm.mergeSyncStatus}
          syncStatusLoading={vm.mergeSyncStatusLoading}
          syncStatusError={vm.mergeSyncStatusError}
          busy={vm.mergeLinking || vm.mergeExchanging || vm.zoho.connecting || vm.slack.connecting}
          syncing={Boolean(connection && vm.mergeSyncingId === connection.id)}
          disconnecting={Boolean(connection && vm.mergeDisconnectingId === connection.id)}
          onSync={vm.onMergeSync}
          onDisconnect={vm.onMergeDisconnect}
          canManage={vm.zoho.canManage}
          zoho={vm.selected.id === "zoho-people" ? vm.zoho : null}
          slack={vm.selected.id === "slack" ? vm.slack : null}
        />
      </>
    );
  }

  const zohoConnected = isZohoConnected(vm.zoho.status);
  const hasMergeConnection = Object.keys(vm.mergeConnectionsByProvider).length > 0;

  return (
    <div className="bonus-integ-page">
      {mergeLink}
      <PageHeader
        title="Integrations"
        subtitle="Connect HRIS, chat, and SSO so Shelf Merch stays in sync with your stack."
      />

      <Section
        title="User management"
        desc="Connect your HRIS, HRMS, or company directory so Shelf Merch can use employee names, emails, and directory data."
        action={
          hasMergeConnection ? (
            <Link to="/app/integrations/hris-employees" className="bonus-integ-section__action">
              <span>View employee directory</span>
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          ) : null
        }
      >
        <div className="bonus-integ-logo-grid">
          {USER_MANAGEMENT_TOOLS.map((item) => {
            const tile = asTile(item);
            const mergeConn = isMergeHrisIntegration(tile.id)
              ? vm.mergeConnectionsByProvider[tile.id]
              : undefined;
            const zohoNeedsAttention =
              tile.id === "zoho-people" &&
              (vm.zoho.status === "needs_attention" ||
                vm.zoho.status === "expired" ||
                vm.zoho.status === "error");
            const needsAttention = mergeConn?.status === "needs_attention" || zohoNeedsAttention;
            const connected =
              mergeConn?.status === "connected" ||
              (tile.id === "zoho-people" && zohoConnected);
            return (
              <HrisLogoCard
                item={item}
                key={item.id}
                onSelect={vm.onSelect}
                onConnect={vm.onInstall}
                connected={connected && !needsAttention}
                needsAttention={needsAttention}
                flowBusy={vm.mergeLinking || vm.mergeExchanging || vm.zoho.connecting}
              />
            );
          })}
        </div>
      </Section>

      <Section
        title="Collaboration tools"
        desc="Connect Shelf Merch to Slack to post updates in your workspace. Other chat tools are coming soon."
      >
        <div className="bonus-integ-grid bonus-integ-grid--compact">
          {COLLABORATION_TOOLS.map((item) => {
            const isSlack = item.id === "slack";
            const slackConn = vm.slack.connection;
            const slackConnected = Boolean(
              isSlack &&
                slackConn &&
                (slackConn.status === "connected" || slackConn.status === "needs_attention"),
            );
            return (
              <IntegrationTile
                item={item}
                key={item.id}
                onSelect={vm.onSelect}
                disabled={!isSlack}
                connected={slackConnected}
              />
            );
          })}
        </div>
      </Section>

      <Section
        title="Single sign-on"
        desc="Enable SSO to protect your company's account information with your identity provider."
      >
        <div className="bonus-integ-plan">
          <div className="bonus-integ-plan-h">
            <span className="bonus-integ-plan-h__icon" aria-hidden="true">
              <LockKeyhole size={18} />
            </span>
            <h3>Single Sign-On (SSO)</h3>
          </div>
          <div className="bonus-integ-plan__body">
            <p>
              Configure SAML-based SSO so your team can sign in to Shelf Merch with Okta, Azure AD,
              or another IdP.
            </p>
            <strong>Available on the Enterprise plan</strong>
          </div>
          <button type="button" onClick={vm.onViewPlans}>
            View plans
          </button>
        </div>
      </Section>
    </div>
  );
}
