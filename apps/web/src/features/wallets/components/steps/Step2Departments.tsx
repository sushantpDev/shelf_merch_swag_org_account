import { useState, type CSSProperties } from "react";
import { BarChart3, Check, Code2, Coins, Headphones, LayoutGrid, Megaphone, Plus, Settings, Users } from "lucide-react";
import { toast } from "sonner";
import { inr } from "@/components/platform/platform-ui";
import {
  deptPaletteColor,
  isDeptSelected,
  ORG_SUGG,
  selectedDepartments,
  type WizardDept,
} from "../../types";
import { DepartmentModal } from "../DepartmentModal";
import type { StepProps } from "./StepProps";

const DEPARTMENT_ICONS = {
  Marketing: Megaphone, Sales: BarChart3, HR: Users, Admin: Settings,
  "Customer Success": Headphones, Engineering: Code2, Finance: Coins, Operations: LayoutGrid,
};

export function Step2Departments({ state, dispatch }: StepProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const isEdit = state.flow === "allocate";

  const selectedCount = selectedDepartments(state.departments).length;
  const allSelected = state.departments.length > 0 && selectedCount === state.departments.length;

  function openAdd() {
    setModalOpen(true);
  }
  function handleToggleSelect(d: WizardDept) {
    dispatch({ type: "toggleDeptSelect", id: d.id });
  }
  function handleSave(values: { name: string; desc: string; users: number }) {
    dispatch({ type: "addDept", ...values });
  }

  return (
    <div className="dept-picker">
      <section className="dept-picker-card" aria-labelledby="dept-picker-title">
        <header className="dept-picker-head">
          <div className="dept-picker-head__icon" aria-hidden="true"><Users size={22} strokeWidth={1.75} /></div>
          <div className="dept-picker-head__copy">
            <h3 id="dept-picker-title">Select departments</h3>
          </div>
          <span className="dept-picker-head__badge">{state.departments.length} departments</span>
        </header>
        <div className="dept-picker-suggest">
          <span className="dept-picker-suggest__label">Suggestions</span>
          <div className="dept-picker-suggest__grid">
            {ORG_SUGG.map((name) => {
              const index = state.departments.findIndex((d) => d.name.toLowerCase() === name.toLowerCase());
              const department = state.departments[index];
              const selected = department ? isDeptSelected(department) : false;
              const Icon = DEPARTMENT_ICONS[name];
              return (
                <button
                  key={name}
                  type="button"
                  className={`dept-picker-suggest__card${selected ? " is-selected" : ""}`}
                  style={{ "--dept-accent": deptPaletteColor(index >= 0 ? index : state.departments.length) } as CSSProperties}
                  aria-label={department ? `${selected ? "Deselect" : "Select"} ${name} department` : `Add ${name}`}
                  aria-pressed={selected}
                  onClick={() => {
                    if (department) handleToggleSelect(department);
                    else {
                      dispatch({ type: "quickAddDept", name });
                      toast.success(`${name} added`);
                    }
                  }}
                >
                  <span className="dept-picker-suggest__icon" aria-hidden="true"><Icon size={18} strokeWidth={1.75} /></span>
                  <span className="dept-picker-suggest__name">{name}</span>
                  <span className="dept-picker-suggest__status" aria-hidden="true">
                    {selected ? <Check size={15} strokeWidth={2} /> : <Plus size={15} strokeWidth={1.75} />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
      <div className="dept-picker-shell">
        <div className="dept-picker-toolbar">
          <div className="dept-picker-list-heading">
            <span className="dept-picker-count">
              {selectedCount} of {state.departments.length} selected
            </span>
          </div>
          <div className="dept-picker-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={state.departments.length === 0}
              onClick={() => dispatch({ type: "setAllDeptSelected", selected: !allSelected })}
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
            <button type="button" className="btn btn-brand btn-sm" onClick={openAdd}>
              Add department
            </button>
          </div>
        </div>

        <div className="dept-picker-table-wrap">
          <table className="dept-picker-table" aria-label="Departments">
            <thead>
              <tr>
                <th className="dept-picker-th-check" aria-label="Select" />
                <th className="dept-picker-th-name">Department</th>
                <th className="dept-picker-th-users">Users</th>
                {isEdit ? <th className="dept-picker-th-num">Current budget</th> : null}
              </tr>
            </thead>
            <tbody>
              {state.departments.length === 0 && (
                <tr><td colSpan={isEdit ? 4 : 3} className="dept-picker-empty">No departments yet. Add a department to get started.</td></tr>
              )}
              {state.departments.map((d, i) => {
                const selected = isDeptSelected(d);
                const color = deptPaletteColor(i);
                const currentBudget = isEdit ? (d.seedAllocated ?? 0) : d.allocated;
                return (
                  <tr
                    key={d.id}
                    className={`dept-picker-row${selected ? " is-selected" : ""}`}
                    onClick={() => handleToggleSelect(d)}
                  >
                    <td className="dept-picker-td-check" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="dept-picker-check"
                        checked={selected}
                        aria-label={`Select ${d.name}`}
                        onChange={() => handleToggleSelect(d)}
                      />
                    </td>
                    <td className="dept-picker-td-name">
                      <div className="dept-picker-name">
                        <span
                          className="dept-dot dept-dot--lg"
                          style={{ background: color }}
                          aria-hidden
                        />
                        <div className="dept-picker-name__text">
                          <span className="dept-picker-title">{d.name}</span>
                        </div>
                      </div>
                    </td>
                    <td className="dept-picker-td-users dept-picker-td-muted">{d.users}</td>
                    {isEdit ? (
                      <td
                        className={`dept-picker-td-num num${currentBudget > 0 ? "" : " dept-picker-td-muted"}`}
                      >
                        {currentBudget > 0 ? inr(currentBudget) : "Not yet assigned"}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {selectedCount === 0 ? (
          <p className="dept-picker-hint muted">Select at least one department to continue.</p>
        ) : null}
      </div>

      <DepartmentModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSave={handleSave}
      />
    </div>
  );
}
