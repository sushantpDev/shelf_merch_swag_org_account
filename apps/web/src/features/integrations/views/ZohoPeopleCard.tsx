import { Loader2 } from "lucide-react";
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
import type { IntegrationsVm } from "../controllers/useIntegrationsController";
import zohoPeopleIcon from "../../../../assets/integrations/zoho-people.png";

function statusLabel(status: IntegrationsVm["zoho"]["status"]) {
  switch (status) {
    case "connected":
      return "Connected";
    case "needs_attention":
      return "Needs attention";
    case "expired":
      return "Connection expired";
    case "error":
      return "Error";
    default:
      return "Not connected";
  }
}

function statusClass(status: IntegrationsVm["zoho"]["status"]) {
  switch (status) {
    case "connected":
      return "zoho-status zoho-status--connected";
    case "needs_attention":
      return "zoho-status zoho-status--expired";
    case "expired":
      return "zoho-status zoho-status--expired";
    case "error":
      return "zoho-status zoho-status--error";
    default:
      return "zoho-status zoho-status--idle";
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return "N/A";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type ZohoCardProps = {
  zoho: IntegrationsVm["zoho"];
};

/** Production Zoho People integration card on the integrations page. */
export function ZohoPeopleCard({ zoho }: ZohoCardProps) {
  const connected =
    zoho.status === "connected" ||
    zoho.status === "needs_attention" ||
    zoho.status === "expired" ||
    zoho.status === "error";

  return (
    <section className="zoho-integ-card" aria-labelledby="zoho-people-heading">
      <div className="zoho-integ-card-head">
        <img
          src={zohoPeopleIcon}
          alt=""
          className="zoho-integ-brand-logo"
          aria-hidden="true"
        />
        <div className="zoho-integ-card-title">
          <div className="zoho-integ-card-title-row">
            <h2 id="zoho-people-heading" className="zoho-integ-card-heading-sr">
              Zoho People
            </h2>
            <span className={statusClass(zoho.status)} role="status">
              {zoho.loading ? "Checking…" : statusLabel(zoho.status)}
            </span>
          </div>
          <p>
            Connect your Zoho People account to import employees and manage onboarding kit
            orders.
          </p>
        </div>
      </div>

      {connected && zoho.integration && (
        <dl className="zoho-integ-meta">
          <div>
            <dt>Organisation</dt>
            <dd>
              {zoho.integration.zohoOrganizationName ||
                zoho.integration.zohoOrganizationId ||
                "N/A"}
            </dd>
          </div>
          <div>
            <dt>Connected</dt>
            <dd>{formatDate(zoho.integration.connectedAt)}</dd>
          </div>
          <div>
            <dt>Last synced</dt>
            <dd>{formatDate(zoho.integration.lastSyncedAt)}</dd>
          </div>
        </dl>
      )}

      <div className="zoho-integ-actions">
        {!connected && (
          <button
            type="button"
            className="zoho-integ-btn zoho-integ-btn--primary"
            onClick={zoho.onConnect}
            disabled={!zoho.canManage || zoho.connecting || zoho.loading}
            aria-busy={zoho.connecting}
          >
            {zoho.connecting ? (
              <>
                <Loader2 className="zoho-integ-spin" size={16} aria-hidden="true" />
                Connecting…
              </>
            ) : (
              "Connect Zoho People"
            )}
          </button>
        )}

        {connected && (
          <>
            <button
              type="button"
              className="zoho-integ-btn zoho-integ-btn--primary"
              onClick={zoho.onSync}
              disabled={!zoho.canManage || zoho.syncing || zoho.status === "expired"}
              aria-busy={zoho.syncing}
            >
              {zoho.syncing ? (
                <>
                  <Loader2 className="zoho-integ-spin" size={16} aria-hidden="true" />
                  Syncing…
                </>
              ) : (
                "Sync Employees"
              )}
            </button>

            {zoho.status === "expired" && (
              <button
                type="button"
                className="zoho-integ-btn"
                onClick={zoho.onConnect}
                disabled={!zoho.canManage || zoho.connecting}
              >
                Reconnect
              </button>
            )}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  className="zoho-integ-btn zoho-integ-btn--danger"
                  disabled={!zoho.canManage || zoho.disconnecting}
                >
                  Disconnect
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnect Zoho People?</AlertDialogTitle>
                  <AlertDialogDescription>
                    ShelfMerch will stop syncing employees from Zoho People. Existing contacts and
                    orders are kept. You can reconnect later.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={zoho.onDisconnect}>Disconnect</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>

      {!zoho.configured && !zoho.loading && (
        <p className="zoho-integ-hint" role="note">
          Zoho People is not configured on this server. Ask your administrator to set the Zoho
          environment variables.
        </p>
      )}
    </section>
  );
}
