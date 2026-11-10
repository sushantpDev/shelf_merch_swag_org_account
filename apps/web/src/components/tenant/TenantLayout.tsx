import { useEffect } from "react";
import { Outlet, useLocation, useNavigate, useNavigation, useParams, useSearchParams } from "react-router";
import { CollapsibleSidebar } from "@/components/tenant/CollapsibleSidebar";
import { UserMenu } from "@/components/tenant/UserMenu";
import { WalletBalanceMenu } from "@/components/tenant/WalletBalanceMenu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ShelfMerchLogo } from "@/components/brand/ShelfMerchLogo";
import { LoadingState } from "@/components/LoadingState";
import { CopilotLauncher } from "@/features/copilot/CopilotLauncher";
import { getStoredUser, isAuthenticated } from "@/services/api-bridge";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTenantAccess } from "@/hooks/useTenantAccess";
import { formatWalletAmount, formatWalletsTotal } from "@/lib/walletFormat";
import { tenantPath } from "@/lib/workspaceSlug";
import {
  entityManagerBudgetRemaining,
  entityManagerDepartments,
  type WorkspaceSnapshot,
} from "@/services/workspace-api";
import { normalizeMongoId } from "@/lib/mongoId";

// The workspace navigation now lives in <CollapsibleSidebar/>; this layout only
// renders the topbar + sidebar shell.

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "U"
  );
}

function truncTopbarName(name: string, max = 16) {
  const n = name.trim();
  return n.length > max ? `${n.slice(0, max - 1)}…` : n;
}

function formatWalletBalance(workspace: WorkspaceSnapshot | undefined) {
  if (!workspace) return formatWalletAmount(0, "INR");
  if (workspace.userPatch.role === "entity_manager") {
    return formatWalletAmount(entityManagerBudgetRemaining(workspace), "INR");
  }
  return formatWalletsTotal(workspace.wallets);
}

export default function TenantLayout() {
  const user = getStoredUser();
  const { data: workspace } = useWorkspace();
  const { canWrite } = useTenantAccess();
  const location = useLocation();
  const isCopilotRoute = /\/copilot\/?$/.test(location.pathname);
  const navigate = useNavigate();
  const navigation = useNavigation();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const walletParam =
    location.pathname.endsWith("/wallets")
      ? (searchParams.get("wallet") ?? undefined)
      : undefined;
  const _currentWalletId = walletParam || workspace?.primaryWalletId;

  useEffect(() => {
    if (!isAuthenticated()) {
      window.location.href = "/login";
    }
  }, []);

  useEffect(() => {
    const requestedSlug = params.slug;
    const canonicalSlug = workspace?.slug;
    if (!requestedSlug || !canonicalSlug || requestedSlug === canonicalSlug) return;

    const [, , ...rest] = location.pathname.split("/");
    const subPath = rest.length ? `/${rest.join("/")}` : "";
    navigate(`/${canonicalSlug}${subPath}${location.search}`, { replace: true });
  }, [location.pathname, location.search, navigate, params.slug, workspace?.slug]);

  if (!isAuthenticated()) {
    return null;
  }

  const account = workspace?.account ?? "Workspace";
  const userName = workspace?.userPatch?.name ?? user?.name ?? "User";
  const userEmail = workspace?.userPatch?.email ?? user?.email ?? "";
  const walletBalance = formatWalletBalance(workspace);
  const isEntityManager = workspace?.userPatch.role === "entity_manager";
  const entityManagerWalletIds =
    isEntityManager && workspace
      ? new Set(
          entityManagerDepartments(workspace)
            .map((d) => normalizeMongoId(d.walletId))
            .filter(Boolean),
        )
      : undefined;
  const headerWallets =
    isEntityManager && entityManagerWalletIds
      ? (workspace?.wallets ?? []).filter((w) => entityManagerWalletIds.has(w.id))
      : (workspace?.wallets ?? []);
  const hasBudget = isEntityManager
    ? Boolean(workspace && entityManagerDepartments(workspace).length > 0)
    : (workspace?.wallets?.length ?? 0) > 0;
  const canRequestTopup = canWrite("wallets") && !isEntityManager && hasBudget;
  const budgetTitle = isEntityManager ? "My budget" : "Available budget";
  const balanceCaption = isEntityManager ? "Available for you" : "Available balance";

  return (
    <div className={`tenant-shell tenant-shell--page-scroll${isCopilotRoute ? " tenant-shell--copilot" : ""}`}>
      <header className="topbar">
        <div className="brandmark">
          <ShelfMerchLogo href={tenantPath()} height={32} />
        </div>
        <div className="spacer" />
        <div className="topbar-right">
          <WalletBalanceMenu
            wallets={headerWallets}
            totalLabel={walletBalance}
            hasBudget={hasBudget}
            budgetTitle={budgetTitle}
            balanceCaption={balanceCaption}
            canRequestTopup={canRequestTopup}
          />
          <NotificationBell />
          <UserMenu
            userName={userName}
            userEmail={userEmail}
            workspaceName={account}
            workspaceLogoUrl={workspace?.logoUrl ?? ""}
            initials={initialsOf(userName)}
            truncName={truncTopbarName(userName)}
          />
        </div>
      </header>

      <div className="body">
        {isCopilotRoute ? null : <CollapsibleSidebar />}

        <main className="main scroll">
          <div className="wrap fade-in">
            {navigation.state === "loading" ? (
              <LoadingState message="Loading page..." fullScreen={false} />
            ) : (
              <Outlet />
            )}
          </div>
        </main>
      </div>
      <CopilotLauncher />
    </div>
  );
}
