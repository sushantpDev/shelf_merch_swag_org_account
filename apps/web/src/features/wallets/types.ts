import type { WorkspaceSnapshot } from "@/services/workspace-api";

/** A department (cost center) as edited inside the wizard. */
export type WizardDept = {
  id: string | number;
  name: string;
  desc: string;
  users: number;
  allocated: number;
  spent?: number;
  color: string;
  mgr: {
    name: string;
    email: string;
    mobile: string;
    role: string;
    invite: boolean;
    inviteStatus?: "unassigned" | "pending" | "active";
  };
  /** Included in budget setup when true (default). */
  selected?: boolean;
  /** Allocated amount when the edit wizard opened (edit / allocate flow). */
  seedAllocated?: number;
  /** @deprecated Edit allocations are always top-ups from the unallocated pool. */
  allocBaselineReset?: boolean;
};

/** A funding document selected in the wallet wizard. */
export type WalletUploadFile = {
  name: string;
  size: number;
  source: "device" | "cloud";
  file?: File;
};

/** The merchandise-budget wallet as edited inside the wizard. */
export type WizardWallet = {
  id?: string;
  name: string;
  amount: number;
  /** Cash not yet earmarked to departments (balance − allocated). */
  unallocated?: number;
  status?: string;
  start: string;
  end: string;
  address: string;
  pinCode: string;
  mobileNumber: string;
  gstin: string;
  funding: string;
  docType: string;
  docNumber: string;
  uploaded: boolean;
  uploadFile: WalletUploadFile | null;
  pay: string;
};

/** Invite link returned by the API after finishing setup. */
export type SentInvite = {
  email: string;
  name: string;
  entityName: string;
  inviteToken?: string;
};

/** Ephemeral organization-setup wizard state (was the legacy mutable `S.org`). */
export type WizardMode = "create" | "edit";

/** `wallet` = step 1 only (create + PO). `allocate` = departments → budget → managers → review. */
export type WizardFlow = "wallet" | "allocate";

export type WizardState = {
  flow: WizardFlow;
  /** `create` = brand-new wallet; `edit` = change existing wallet / departments. */
  mode: WizardMode;
  step: number;
  done: boolean;
  /** Distinguishes new-wallet vs top-up on the funding-request done screen. */
  successSource?: "create" | "topup";
  wallet: WizardWallet;
  departments: WizardDept[];
  seq: number;
  colorIdx: number;
  sentInvites: SentInvite[];
  /** Unallocated wallet cash when the allocate wizard opened. */
  unallocatedAtStart?: number;
};

export type OrgSnapshot = WorkspaceSnapshot["org"];

export const ORG_ROLES = [
  "Marketing Manager",
  "Sales Manager",
  "HR Manager",
  "Admin Manager",
  "Customer Success Manager",
  "Operations Manager",
] as const;

export const ORG_SUGG = [
  "Marketing",
  "Sales",
  "HR",
  "Admin",
  "Customer Success",
  "Engineering",
  "Finance",
  "Operations",
] as const;

export const ORG_FALLBACK = [
  "#35B5E5", // sky blue
  "#DF4545", // red
  "#FFC329", // yellow
  "#30B87A", // green
  "#7657D6", // purple
  "#1677FF", // electric blue
] as const;

/** Distinct chart color per department index (wallets dashboard donut / legend). */
export function deptPaletteColor(index: number): string {
  return ORG_FALLBACK[index % ORG_FALLBACK.length];
}

export const ALLOC_STEPS = [
  "Departments",
  "Allocate Budget",
  "Assign Managers",
  "Review & Finish",
] as const;

export const ALLOC_STEP_MIN = 2;
export const ALLOC_STEP_MAX = 5;

export const QUICK_ADD_DESCRIPTIONS: Record<string, string> = {
  Engineering: "Team merchandise, hackathon kits and dev swag.",
  Finance: "Audit, compliance and finance team merchandise.",
  Operations: "Operational supplies and field team kits.",
};

/** Parse a money string ("₹12,000") into a number. */
export const parseAmt = (s: string | number): number =>
  parseInt(String(s).replace(/[^\d]/g, "") || "0", 10);

/** Format an ISO date ("2026-04-01") into "01 Apr 2026". */
export const fmtDate = (iso: string): string => {
  if (!iso) return "N/A";
  return new Date(`${iso}T00:00`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

/** Departments included in the current setup flow. */
export const isDeptSelected = (d: WizardDept): boolean => d.selected === true;

export const selectedDepartments = (departments: WizardDept[]): WizardDept[] =>
  departments.filter(isDeptSelected);

const MONGO_ID = /^[a-f0-9]{24}$/i;

/** Department already stored on the API (vs a temporary wizard id). */
export const isPersistedDept = (d: WizardDept): boolean => MONGO_ID.test(String(d.id));

/** Collapse duplicate rows (same mongo id or same name). Selected row wins. */
export function dedupeWizardDepartments(departments: WizardDept[]): WizardDept[] {
  const byId = new Map<string, WizardDept>();
  const byName = new Map<string, WizardDept>();

  for (const d of departments) {
    const nameKey = d.name.trim().toLowerCase();
    const idKey = isPersistedDept(d) ? String(d.id) : "";
    const prev = (idKey && byId.get(idKey)) || byName.get(nameKey);
    if (!prev) {
      if (idKey) byId.set(idKey, d);
      byName.set(nameKey, d);
      continue;
    }
    const take =
      isDeptSelected(d) && !isDeptSelected(prev)
        ? d
        : !isDeptSelected(d) && isDeptSelected(prev)
          ? prev
          : (d.allocated || 0) >= (prev.allocated || 0)
            ? d
            : prev;
    if (idKey) byId.set(idKey, take);
    byName.set(nameKey, take);
    if (isPersistedDept(take)) byId.set(String(take.id), take);
  }

  const seen = new Set<WizardDept>();
  const out: WizardDept[] = [];
  for (const d of byName.values()) {
    if (seen.has(d)) continue;
    seen.add(d);
    out.push(d);
  }
  return out;
}

/** Rows to persist: selected top-ups only; existing unselected departments stay unchanged. */
export function departmentsForSync(departments: WizardDept[]): WizardDept[] {
  const selected = selectedDepartments(departments);
  return dedupeWizardDepartments([
    ...selected.map((d) => ({
      ...d,
      selected: true as const,
      allocated: wizardTargetAllocation(d),
    })),
  ]);
}

/** Departments that should be created/updated when finishing setup. */
export const departmentsToSync = (departments: WizardDept[]): WizardDept[] =>
  selectedDepartments(departments);

/** Sum of active allocations for selected departments in the wizard. */
export const totalAlloc = (departments: WizardDept[]): number =>
  selectedDepartments(departments).reduce((sum, d) => sum + (d.allocated || 0), 0);

/** Sum of all persisted department allocations (dashboard view). */
export const totalAllocatedAmount = (departments: WizardDept[]): number =>
  departments.reduce((sum, d) => sum + (d.allocated || 0), 0);

/**
 * Departments that completed allocation (have budget and/or a manager).
 * Stub rows left by a failed allocate/invite run are excluded from the dashboard.
 */
export function committedDepartments<T extends {
  allocated?: number;
  mgr?: { email?: string; name?: string; inviteStatus?: string };
}>(departments: T[]): T[] {
  return departments.filter((d) => {
    if ((d.allocated ?? 0) > 0) return true;
    if (d.mgr?.email?.trim() || d.mgr?.name?.trim()) return true;
    if (d.mgr?.inviteStatus === "pending" || d.mgr?.inviteStatus === "active") return true;
    return false;
  });
}

/** Allocations that count against the wallet total inside the wizard (selected depts only). */
export const wizardCommittedAllocations = (departments: WizardDept[]): number =>
  totalAlloc(departments);

/** Extra amount drawn from the unallocated pool in edit / allocate flow. */
export function allocationDeltaFromPool(d: WizardDept): number {
  return d.allocated || 0;
}

/** Target allocation persisted on save (API compares to current entity budget). */
export function wizardTargetAllocation(d: WizardDept): number {
  const seed = d.seedAllocated ?? 0;
  const amount = d.allocated || 0;
  return seed + amount;
}

export function allocationFromPool(departments: WizardDept[]): number {
  return selectedDepartments(departments).reduce((sum, d) => sum + allocationDeltaFromPool(d), 0);
}

export function isAllocateEditFlow(flow: WizardFlow, mode: WizardMode): boolean {
  return flow === "allocate" || mode === "edit";
}

/** Remaining unallocated cash while editing allocations. */
export function remainingWalletBalanceForWizard(
  walletTotal: number,
  departments: WizardDept[],
  options?: { flow?: WizardFlow; mode?: WizardMode; unallocatedAtStart?: number },
): number {
  const { flow, mode, unallocatedAtStart } = options ?? {};
  if (isAllocateEditFlow(flow ?? "wallet", mode ?? "create") && unallocatedAtStart != null) {
    return unallocatedAtStart - allocationFromPool(departments);
  }
  return walletTotal - wizardCommittedAllocations(departments);
}

/** Unallocated balance on the dashboard: total − all department allocations. */
export const remainingWalletBalance = (walletTotal: number, departments: WizardDept[]): number =>
  walletTotal - totalAllocatedAmount(departments);

/** Percentage of wallet total, capped for display when over budget. */
export const pctOfWalletTotal = (part: number, total: number): string => {
  if (!total || part <= 0) return "0%";
  const pct = (part / total) * 100;
  if (pct > 999) return "999%+";
  return `${Math.round(pct)}%`;
};

/** Format an amount as a localized "en-IN" integer for an editable input. */
export const amtInput = (n: number): string => (n ? n.toLocaleString("en-IN") : "");
