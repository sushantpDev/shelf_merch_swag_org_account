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
import zohoPeopleIcon from "../../../../assets/integrations/zoho-people.png";
import {
  useZohoPeopleConnectedAppController,
  type ZohoPeopleConnectedAppVm,
} from "./useZohoPeopleConnectedAppController";
import {
  isZohoPeopleIntegrationActive,
  zohoPeopleConnectionSubtitle,
  zohoPeopleStatusClass,
  zohoPeopleStatusLabel,
} from "./zoho-people-status";

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

function ZohoPeopleConnectedAppView({ vm }: { vm: ZohoPeopleConnectedAppVm }) {
  const connected = isZohoPeopleIntegrationActive(vm.status, vm.integration);

  const showSignedOut =
    vm.authPhase === "signed_out" ||
    vm.authPhase === "waiting_popup" ||
    vm.authPhase === "exchanging";

  return (
    <main className="zoho-connected-app" data-sandbox={vm.sandbox ? "true" : "false"}>
      <header className="zoho-connected-app-header">
        <div className="zoho-connected-app-brand">
          <span className="zoho-connected-app-brand-name">ShelfMerch</span>
          {vm.sandbox ? (
            <span className="zoho-connected-app-sandbox-badge" role="status">
              Sandbox
            </span>
          ) : null}
        </div>
        <p className="zoho-connected-app-tagline">Zoho People Connected App</p>
      </header>

      {showSignedOut ? (
        <section className="zoho-connected-app-signin" aria-labelledby="zoho-signin-heading">
          <h1 id="zoho-signin-heading">Sign in required</h1>
          {vm.authPhase === "waiting_popup" || vm.authPhase === "exchanging" ? (
            <p className="zoho-embed-auth-wait">
              <Loader2 className="zoho-integ-spin" size={18} aria-hidden="true" />
              Waiting for ShelfMerch sign-in…
            </p>
          ) : (
            <p>Sign in to ShelfMerch to connect your Zoho People account.</p>
          )}
          {vm.popupBlocked ? (
            <p className="zoho-embed-auth-error" role="alert">
              Allow popups and try again.
            </p>
          ) : null}
          <button
            type="button"
            className="zoho-integ-btn zoho-integ-btn--primary"
            onClick={vm.onSignIn}
            disabled={vm.authPhase === "waiting_popup" || vm.authPhase === "exchanging"}
          >
            Sign in to ShelfMerch
          </button>
        </section>
      ) : (
        <section className="zoho-integ-card zoho-connected-app-card" aria-labelledby="zoho-people-heading">
          <div className="zoho-integ-card-head">
            <img
              src={zohoPeopleIcon}
              alt=""
              className="zoho-integ-brand-logo"
              aria-hidden="true"
            />
            <div className="zoho-integ-card-title">
              <div className="zoho-integ-card-title-row">
                <h1 id="zoho-people-heading" className="zoho-integ-card-heading-sr">
                  Zoho People
                </h1>
                <span className={zohoPeopleStatusClass(vm.status)} role="status">
                  {vm.loading ? "Checking…" : zohoPeopleStatusLabel(vm.status)}
                </span>
              </div>
              <p>{zohoPeopleConnectionSubtitle(vm.status)}</p>
            </div>
          </div>

          {connected && vm.integration && (
            <dl className="zoho-integ-meta">
              <div>
                <dt>Organisation</dt>
                <dd>
                  {vm.integration.zohoOrganizationName ||
                    vm.integration.zohoOrganizationId ||
                    "N/A"}
                </dd>
              </div>
              <div>
                <dt>Last synced</dt>
                <dd>{formatDate(vm.integration.lastSyncedAt)}</dd>
              </div>
            </dl>
          )}

          <div className="zoho-integ-actions">
            {vm.waitingForZohoAuth ? (
              <p className="zoho-embed-auth-wait" role="status">
                <Loader2 className="zoho-integ-spin" size={18} aria-hidden="true" />
                Waiting for Zoho authorization…
              </p>
            ) : null}
            {!connected && (
              <button
                type="button"
                className="zoho-integ-btn zoho-integ-btn--primary"
                onClick={vm.onConnect}
                disabled={!vm.canManage || vm.connecting || vm.loading}
                aria-busy={vm.connecting}
              >
                {vm.connecting ? (
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
                  onClick={vm.onSync}
                  disabled={!vm.canManage || vm.syncing || vm.status === "expired" || vm.status === "needs_attention"}
                  aria-busy={vm.syncing}
                >
                  {vm.syncing ? (
                    <>
                      <Loader2 className="zoho-integ-spin" size={16} aria-hidden="true" />
                      Syncing…
                    </>
                  ) : (
                    "Sync Employees"
                  )}
                </button>

                {(vm.status === "needs_attention" || vm.status === "expired") && (
                  <button
                    type="button"
                    className="zoho-integ-btn"
                    onClick={vm.onConnect}
                    disabled={!vm.canManage || vm.connecting}
                  >
                    Reconnect
                  </button>
                )}

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="zoho-integ-btn zoho-integ-btn--danger"
                      disabled={!vm.canManage || vm.disconnecting}
                    >
                      Disconnect
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Disconnect Zoho People?</AlertDialogTitle>
                      <AlertDialogDescription>
                        ShelfMerch will stop syncing employees from Zoho People. Existing contacts
                        and orders are kept. You can reconnect later.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={vm.onDisconnect}>Disconnect</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>

          {!vm.configured && !vm.loading && (
            <p className="zoho-integ-hint" role="note">
              Zoho People is not configured on this server.
            </p>
          )}
        </section>
      )}
    </main>
  );
}

export function ZohoPeopleConnectedAppPage() {
  const vm = useZohoPeopleConnectedAppController(false);
  return <ZohoPeopleConnectedAppView vm={vm} />;
}

export function ZohoPeopleConnectedAppSandboxPage() {
  const vm = useZohoPeopleConnectedAppController(true);
  return <ZohoPeopleConnectedAppView vm={vm} />;
}
