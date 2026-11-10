import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { WizardDept } from "../types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dept?: WizardDept;
  onSave: (values: { name: string; desc: string; users: number }) => void;
};

/** Add / edit a department (cost center). */
export function DepartmentModal({ open, onOpenChange, dept, onSave }: Props) {
  const editing = Boolean(dept);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [users, setUsers] = useState(10);

  useEffect(() => {
    if (!open) return;
    setName(dept?.name ?? "");
    setDesc(dept?.desc === "Department merchandise and campaigns." ? "" : (dept?.desc ?? ""));
    setUsers(dept?.users ?? 10);
  }, [open, dept]);

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a department name");
      return;
    }
    onSave({
      name: trimmed,
      desc: desc.trim() || "Department merchandise and campaigns.",
      users: users || 1,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm-modal allocation-dept-modal">
        <div className="modal-pad">
          <DialogHeader>
            <div className="eyebrow">Cost center</div>
            <DialogTitle style={{ fontSize: 22, fontFamily: "var(--font-family-primary)" }}>
              {editing ? "Edit department" : "Add department"}
            </DialogTitle>
            <DialogDescription className="muted" style={{ fontSize: 14, margin: "4px 0 18px" }}>
              Create a cost center that will consume merchandise budget.
            </DialogDescription>
          </DialogHeader>

          <div className="field">
            <label className="lbl" htmlFor="dept-name">
              Department name
            </label>
            <input
              className="inp"
              id="dept-name"
              value={name}
              placeholder="e.g. Product"
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="dept-desc">
              Description
            </label>
            <input
              className="inp"
              id="dept-desc"
              value={desc}
              placeholder="What this team uses merchandise for"
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="dept-users">
              Expected users
            </label>
            <input
              className="inp num"
              id="dept-users"
              type="number"
              min={1}
              value={users}
              onChange={(e) => setUsers(parseInt(e.target.value, 10) || 0)}
            />
          </div>

          <div
            className="row"
            style={{ marginTop: 20, borderTop: "1px solid var(--line)", paddingTop: 16 }}
          >
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <button type="button" className="btn btn-brand btn-block" onClick={handleSave}>
              {editing ? "Save changes" : "Add department"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
