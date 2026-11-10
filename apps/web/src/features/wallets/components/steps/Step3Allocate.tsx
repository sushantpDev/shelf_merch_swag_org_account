import { toast } from "sonner";
import { inr } from "@/components/platform/platform-ui";
import {
  allocationFromPool,
  amtInput,
  isAllocateEditFlow,
  parseAmt,
  pctOfWalletTotal,
  remainingWalletBalanceForWizard,
  selectedDepartments,
  wizardCommittedAllocations,
} from "../../types";
import type { StepProps } from "./StepProps";

function pctLabel(value: number, total: number): string {
  if (!total) return "0%";
  const pct = (value / total) * 100;
  return `${pct.toFixed(pct % 1 ? 1 : 0)}%`;
}

export function Step3Allocate({ state, dispatch }: StepProps) {
  const total = state.wallet.amount;
  const isEdit = isAllocateEditFlow(state.flow, state.mode);
  const unallocatedStart = state.unallocatedAtStart ?? total;
  const depts = selectedDepartments(state.departments);
  const fromPool = allocationFromPool(state.departments);
  const deptTotal = wizardCommittedAllocations(state.departments);
  const rem = remainingWalletBalanceForWizard(total, state.departments, {
    flow: state.flow,
    mode: state.mode,
    unallocatedAtStart: state.unallocatedAtStart,
  });
  const over = isEdit ? fromPool > unallocatedStart : deptTotal > total;

  const barTotal = isEdit ? unallocatedStart : total;
  const segments = isEdit
    ? fromPool > 0
      ? [{ id: "from-pool", name: "From wallet", allocated: fromPool, color: "var(--brand)" }]
      : []
    : depts.filter((d) => d.allocated > 0);

  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 18 }}>
        <div className="card stat">
          <div className="k">{isEdit ? "Unallocated wallet" : "Total budget"}</div>
          <div className="v num">{inr(isEdit ? unallocatedStart : total)}</div>
        </div>
        <div className="card stat">
          <div className="k">{isEdit ? "Adding from wallet" : "Allocated"}</div>
          <div className="v num">{inr(isEdit ? fromPool : deptTotal)}</div>
        </div>
        <div className="card stat">
          <div className="k">Remaining</div>
          <div className="v num" style={{ color: rem < 0 ? "var(--danger)" : "var(--brand-d)" }}>
            {inr(rem)}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <div className="alloc-bar">
          {segments.length === 0 && rem <= 0 ? (
            <div className="alloc-seg gap" style={{ width: "100%" }}>
              Unallocated
            </div>
          ) : (
            <>
              {segments.map((d) => {
                const pct = Math.min((d.allocated / barTotal) * 100, 100);
                return (
                  <div
                    key={String(d.id)}
                    className="alloc-seg"
                    style={{ width: `${pct}%`, background: d.color }}
                  >
                    {pct >= 8 ? `${Math.round((d.allocated / barTotal) * 100)}%` : ""}
                  </div>
                );
              })}
              {rem > 0 && (
                <div className="alloc-seg gap" style={{ width: `${(rem / barTotal) * 100}%` }}>
                  {(rem / barTotal) * 100 >= 8 ? "Unallocated" : ""}
                </div>
              )}
            </>
          )}
        </div>
        <div className="alloc-legend">
          {isEdit ? (
            <>
              {fromPool > 0 && (
                <div className="leg">
                  <span className="lc" style={{ background: "var(--brand)" }} />
                  From wallet · {inr(fromPool)}
                </div>
              )}
              <div className="leg">
                <span className="lc" style={{ background: "var(--line)" }} />
                Remaining · {inr(rem)}
              </div>
            </>
          ) : (
            depts.map((d) => (
              <div key={d.id} className="leg">
                <span className="lc" style={{ background: d.color }} />
                {d.name} · {inr(d.allocated)}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card alloc-panel">
        <div className="alloc-panel-head">
          <div>
            <div className="alloc-panel-title">Department allocations</div>
            <div className="alloc-panel-sub">
              {isEdit
                ? "Enter the additional budget for each department."
                : "Enter a budget for each department."}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-soft btn-sm"
            onClick={() => {
              dispatch({ type: "splitEven" });
              toast.success("Budget split evenly");
            }}
            disabled={!depts.length}
          >
            Split evenly
          </button>
        </div>

        {depts.length === 0 ? (
          <p className="muted" style={{ padding: "16px 20px", fontSize: 14 }}>
            No departments selected. Go back and select at least one department.
          </p>
        ) : (
          <div className="alloc-list">
            {depts.map((d) => {
              const pct = pctLabel(d.allocated, total);
              const rowOver = over && d.allocated > 0;
              return (
                <div key={d.id} className="alloc-row">
                  <div className="alloc-row-dept">
                    <div className="alloc-row-swatch" style={{ background: d.color }}>
                      {d.name.charAt(0)}
                    </div>
                    <span className="alloc-row-name">
                      {d.name}
                      {isEdit && (d.seedAllocated ?? 0) > 0 ? (
                        <span className="mut3" style={{ display: "block", fontSize: 14, lineHeight: 1.5 }}>
                          Current budget {inr(d.seedAllocated ?? 0)}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="alloc-row-controls">
                    <div className={`alloc-money${rowOver ? " alloc-money--over" : ""}`}>
                      <span className="alloc-money-prefix">₹</span>
                      <input
                        className="alloc-money-input"
                        inputMode="numeric"
                        aria-label={
                          isEdit
                            ? `Additional allocation for ${d.name}`
                            : `Allocation for ${d.name}`
                        }
                        value={amtInput(d.allocated)}
                        onChange={(e) =>
                          dispatch({ type: "setAlloc", id: d.id, amount: parseAmt(e.target.value) })
                        }
                      />
                    </div>
                    <span className={`alloc-pct${d.allocated > 0 ? " alloc-pct--on" : ""}`}>
                      {pct}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className={`alloc-total${over ? " alloc-total--over" : ""}`}>
          <span className="alloc-total-label">
            {isEdit ? "Adding from wallet" : "Total allocated"}
          </span>
          <span className="alloc-total-amt num">{inr(isEdit ? fromPool : deptTotal)}</span>
          <span className="alloc-total-pct">
            {pctOfWalletTotal(isEdit ? fromPool : deptTotal, isEdit ? unallocatedStart : total)}
          </span>
        </div>
      </div>

      {over && (
        <div
          className="banner"
          role="alert"
          style={{
            marginTop: 16,
            background: "var(--danger-tint,#fdeceb)",
            color: "var(--danger)",
            border: "none",
          }}
        >
          {isEdit
            ? "Amount exceeds unallocated wallet balance. Reduce allocations to continue."
            : "Allocated amount exceeds the wallet value. Reduce allocations to continue."}
        </div>
      )}
    </>
  );
}
