import { inr } from "@/components/platform/platform-ui";
import {
  fmtDate,
  allocationFromPool,
  isAllocateEditFlow,
  remainingWalletBalanceForWizard,
  selectedDepartments,
  wizardTargetAllocation,
} from "../../types";
import { Donut } from "../Donut";
import type { StepProps } from "./StepProps";

export function Step5Review({ state, dispatch, account }: StepProps & { account: string }) {
  const o = state.wallet;
  const total = o.amount;
  const depts = selectedDepartments(state.departments);
  const selectedAllocation = depts.reduce((sum, d) => sum + wizardTargetAllocation(d), 0);
  const otherBudget = Math.max(0, total - selectedAllocation);
  const distribution = [
    ...depts.map((d) => ({ id: String(d.id), name: d.name, color: d.color, allocated: wizardTargetAllocation(d) })),
    ...(otherBudget > 0 ? [{ id: "other-budget", name: "Other budget", color: "#e5e7eb", allocated: otherBudget }] : []),
  ];
  const isEdit = isAllocateEditFlow(state.flow, state.mode);
  const fromPool = allocationFromPool(state.departments);
  const rem = remainingWalletBalanceForWizard(total, state.departments, {
    flow: state.flow,
    mode: state.mode,
    unallocatedAtStart: state.unallocatedAtStart,
  });

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 18 }}>Review allocation</h3>
        <p className="muted" style={{ fontSize: 14, marginTop: 2 }}>
          Confirm departments, budgets and managers before finishing.
        </p>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 18 }}>
        <div className="card stat">
          <div className="k">{isEdit ? "Unallocated wallet" : "Total budget"}</div>
          <div className="v num">{inr(isEdit ? (state.unallocatedAtStart ?? total) : total)}</div>
        </div>
        <div className="card stat">
          <div className="k">{isEdit ? "Adding from wallet" : "Allocated"}</div>
          <div className="v num">
            {inr(isEdit ? fromPool : depts.reduce((s, d) => s + wizardTargetAllocation(d), 0))}
          </div>
        </div>
        <div className="card stat">
          <div className="k">Remaining</div>
          <div className="v num" style={{ color: rem < 0 ? "var(--danger)" : "var(--brand-d)" }}>
            {inr(rem)}
          </div>
        </div>
      </div>

      <div className="allocation-review-grid">
        <div>
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
              <b style={{ fontSize: 18 }}>Wallet</b>
            </div>
            <ReviewRow label="Organization" value={account} />
            <ReviewRow label="Wallet" value={o.name} />
            <ReviewRow label="Total budget" value={inr(total)} accent last={false} />
            <ReviewRow label="Validity" value={`${fmtDate(o.start)} → ${fmtDate(o.end)}`} last />
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
              <b style={{ fontSize: 18 }}>Departments &amp; managers</b>
              <span
                className="lnk"
                style={{ fontSize: 16 }}
                role="button"
                tabIndex={0}
                onClick={() => dispatch({ type: "goto", step: 2 })}
              >
                Edit
              </span>
            </div>
            {depts.map((d) => (
              <div key={d.id} className="rev-dept">
                <span className="sw" style={{ background: d.color }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: "var(--font-weight-semibold)", fontSize: 16 }}>{d.name}</div>
                  <div className="mut3" style={{ fontSize: 14, lineHeight: 1.5, overflowWrap: "anywhere" }}>
                    {d.mgr.name
                      ? `${d.mgr.name}${d.mgr.email ? ` · ${d.mgr.email}` : ""}`
                      : "No manager assigned"}
                    {d.mgr.inviteStatus === "active"
                      ? " · Active account — extra budget only, no new password"
                      : d.mgr.email
                        ? d.mgr.invite !== false
                          ? " · Invitation will be sent"
                          : " · Assigned without invite"
                        : ""}
                  </div>
                </div>
                <span className="num" style={{ fontWeight: "var(--font-weight-bold)", fontSize: 16 }}>
                  {inr(wizardTargetAllocation(d))}
                </span>
                <span className="pct-pill" style={{ fontSize: 14 }}>
                  {total ? Math.round((wizardTargetAllocation(d) / total) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>

        <aside className="card allocation-distribution" aria-labelledby="allocation-distribution-title">
          <h3 id="allocation-distribution-title">Budget distribution</h3>
          <p className="allocation-distribution-summary">
            {inr(selectedAllocation)} across {depts.length} {depts.length === 1 ? "department" : "departments"}
          </p>
          <div className="allocation-distribution-content">
            <Donut
              segments={distribution}
              centerValue={depts.length}
              centerLabel={depts.length === 1 ? "Department" : "Departments"}
              size={140}
              centerFontSize={30}
              centerLabelFontSize={13}
            />
            <ul className="allocation-distribution-legend">
              {distribution.map((d) => (
                <li key={d.id}>
                  <span className="allocation-distribution-dot" style={{ background: d.color }} />
                  <span className="allocation-distribution-name">{d.name}</span>
                  <span className="allocation-distribution-amount">
                    <strong>{inr(d.allocated)}</strong>
                    <span>{total ? Math.round((d.allocated / total) * 100) : 0}%</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="allocation-distribution-total"><span>Total budget</span><strong>{inr(total)}</strong></div>
        </aside>
      </div>
    </>
  );
}

function ReviewRow({
  label,
  value,
  accent,
  last,
}: {
  label: string;
  value: string;
  accent?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className="row"
      style={{
        justifyContent: "space-between",
        padding: "10px 0",
        gap: 16,
        flexWrap: "wrap",
        borderBottom: last ? "none" : "1px solid var(--line)",
      }}
    >
      <span className="muted" style={{ fontSize: 16 }}>
        {label}
      </span>
      <span
        style={{
          fontWeight: accent ? "var(--font-weight-bold)" : "var(--font-weight-semibold)",
          fontSize: 16,
          color: accent ? "var(--brand-d)" : undefined,
        }}
      >
        {value}
      </span>
    </div>
  );
}
