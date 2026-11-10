import { Wallet } from "lucide-react";
import { inr } from "@/components/platform/platform-ui";
import { PageHeader } from "@/components/tenant/PageHeader";
import { entityManagerDepartments } from "@/services/workspace-api";
import type { WorkspaceSnapshot } from "@/services/workspace-api";
import { WalletHistory } from "./WalletHistory";

/** Department-budget view shown to an entity (department) manager. */
export function EntityManagerDashboard({
  account,
  workspace,
}: {
  account: string;
  workspace: WorkspaceSnapshot;
}) {
  const departments = entityManagerDepartments(workspace);
  const dept = departments[0];

  if (!dept) {
    return (
      <>
        <PageHeader title="My department budget" subtitle={account} />
        <div className="card empty" style={{ padding: 50 }}>
          <div className="ic" aria-hidden="true">
            <Wallet size={34} color="var(--gray-300)" />
          </div>
          <h3>Budget not available yet</h3>
          <p>
            Your company admin must finish <b>budget allocation</b> (departments, budget split, and
            manager invites) before you can launch campaigns. If you were invited by email, accept
            the invite link first.
          </p>
        </div>
      </>
    );
  }

  const alloc = departments.reduce((sum, d) => sum + (d.allocated || 0), 0);
  const spent = departments.reduce((sum, d) => sum + (d.spent || 0), 0);
  const rem = departments.reduce(
    (sum, d) => sum + Math.max(0, (d.allocated || 0) - (d.spent || 0)),
    0,
  );
  const subtitle =
    departments.length === 1
      ? `${account}: ${dept.name}`
      : `${account}: ${departments.length} assigned budgets`;

  return (
    <>
      <PageHeader title="My department budget" subtitle={subtitle} />

      {!alloc && (
        <div
          className="banner"
          style={{
            marginBottom: 18,
            background: "var(--warn-tint,#fff8e6)",
            color: "var(--ink-2)",
            border: "none",
          }}
        >
          <b>Budget not allocated yet.</b> Your admin assigned you as manager, but the department
          budget has not been saved. Ask them to open <b>Budget → Allocate budget</b> and finish
          setup.
        </div>
      )}

      <div className="card wallet-balance-strip" style={{ padding: 0, marginBottom: 18 }}>
        <div className="row" style={{ alignItems: "stretch" }}>
          <div className="stat" style={{ flex: 1, padding: "18px 22px" }}>
            <div className="k">Total allocated</div>
            <div className="v num" style={{ fontSize: 26 }}>
              {inr(alloc)}
            </div>
            <div className="mut3" style={{ fontSize: "var(--workspace-font-caption, 11px)", marginTop: 6, lineHeight: 1.4 }}>
              Budget assigned to your department
            </div>
          </div>
          <div style={{ width: 1, background: "var(--line)" }} />
          <div className="stat" style={{ flex: 1, padding: "18px 22px" }}>
            <div className="k">Spent</div>
            <div className="v num" style={{ fontSize: 26 }}>
              {inr(spent)}
            </div>
            <div className="mut3" style={{ fontSize: "var(--workspace-font-caption, 11px)", marginTop: 6, lineHeight: 1.4 }}>
              Used on campaigns and orders
            </div>
          </div>
          <div style={{ width: 1, background: "var(--line)" }} />
          <div className="stat" style={{ flex: 1, padding: "18px 22px" }}>
            <div className="k">Available to spend</div>
            <div className="v num" style={{ fontSize: 26, color: "var(--brand-d)" }}>
              {inr(rem)}
            </div>
            <div className="mut3" style={{ fontSize: "var(--workspace-font-caption, 11px)", marginTop: 6, lineHeight: 1.4 }}>
              Remaining department budget
            </div>
          </div>
        </div>
        {alloc > 0 && (
          <div className="muted" style={{ fontSize: "var(--workspace-font-caption, 12.5px)", padding: "10px 22px 14px" }}>
            {inr(spent)} spent + {inr(rem)} available = {inr(alloc)} total allocated
          </div>
        )}
      </div>

      <div className="card" style={{ padding: "18px 22px", marginBottom: 18 }}>
        <div className="mut3" style={{ fontSize: "var(--workspace-font-caption, 12px)" }}>
          You can create campaigns and send gifts from this budget. Organization-wide budget
          settings are managed by your admin.
        </div>
      </div>

      <WalletHistory entityIds={departments.map((d) => String(d.id))} />
    </>
  );
}
