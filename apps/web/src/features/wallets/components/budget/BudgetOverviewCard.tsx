import { Calendar, FileText, Landmark, Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { inr } from "@/components/platform/platform-ui";
import { fmtDate } from "../../types";
import { BudgetStatusBadge } from "./BudgetStatusBadge";

type Props = {
  account: string;
  budgetBalance: number;
  allocatedBudget: number;
  availableBudget: number;
  spentBudget: number;
  approvalStatus?: string;
  budgetStatus?: string;
  validFrom: string;
  validTo: string;
  fundingMethod: string;
  docType: string;
  docNumber: string;
  fundingPending?: boolean;
  requestedAmount?: number;
};

function MetaRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
        <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

export function BudgetOverviewCard({
  account,
  budgetBalance,
  allocatedBudget,
  availableBudget,
  spentBudget,
  approvalStatus,
  budgetStatus,
  validFrom,
  validTo,
  fundingMethod,
  docType,
  docNumber,
  fundingPending,
  requestedAmount,
}: Props) {
  const utilizationBase = allocatedBudget > 0 ? allocatedBudget : budgetBalance;
  const spentPct =
    utilizationBase > 0 ? Math.min(100, Math.round((spentBudget / utilizationBase) * 100)) : 0;
  const allocatedPct =
    budgetBalance > 0 ? Math.min(100, Math.round((allocatedBudget / budgetBalance) * 100)) : 0;

  const fundingLabel =
    fundingMethod === "upload" || fundingMethod === "po_upload"
      ? `${docType}${docNumber ? ` · ${docNumber}` : ""}`
      : "Online payment";

  const fundingSource =
    fundingMethod === "upload" || fundingMethod === "po_upload" ? docType || "Purchase Order" : "Razorpay";

  return (
    <Card className="overflow-hidden border-border/60 shadow-sm">
      <CardHeader className="border-b bg-muted/20 pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Organization budget
            </p>
            <CardTitle className="mt-1 text-xl">{account}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Single merchandise budget for campaigns, orders, and gift kits
            </p>
          </div>
          <BudgetStatusBadge approvalStatus={approvalStatus} budgetStatus={budgetStatus} />
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="grid grid-cols-1 divide-y lg:grid-cols-[1.4fr_1fr] lg:divide-x lg:divide-y-0">
          <div className="space-y-6 p-6">
            <div>
              <p className="text-sm text-muted-foreground">Budget balance</p>
              <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">{inr(budgetBalance)}</p>
              {fundingPending && requestedAmount ? (
                <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                  {inr(requestedAmount)} pending approval
                </p>
              ) : null}
            </div>

            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium text-muted-foreground">Budget utilization</span>
                  <span className="tabular-nums text-muted-foreground">{spentPct}% spent</span>
                </div>
                <Progress value={spentPct} className="h-2" />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium text-muted-foreground">Department allocation</span>
                  <span className="tabular-nums text-muted-foreground">{allocatedPct}% allocated</span>
                </div>
                <Progress value={allocatedPct} className="h-2 bg-muted/40 [&>div]:bg-primary/70" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/20 p-4 text-center sm:text-left">
              <div>
                <p className="text-xs text-muted-foreground">Allocated</p>
                <p className="mt-1 text-sm font-semibold tabular-nums">{inr(allocatedBudget)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Available</p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-primary">{inr(availableBudget)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Spent</p>
                <p className="mt-1 text-sm font-semibold tabular-nums">{inr(spentBudget)}</p>
              </div>
            </div>
          </div>

          <div className="space-y-5 p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Budget details
            </p>
            <MetaRow icon={Landmark} label="Funding source" value={fundingSource} />
            <MetaRow icon={Receipt} label="Purchase order" value={docNumber || "N/A"} />
            <MetaRow icon={FileText} label="Funding method" value={fundingLabel} />
            <MetaRow
              icon={Calendar}
              label="Budget validity"
              value={`${fmtDate(validFrom)} → ${fmtDate(validTo)}`}
            />
          </div>
        </div>

        <Separator />
        <div className="px-6 py-3 text-xs text-muted-foreground">
          {inr(allocatedBudget)} allocated + {inr(availableBudget)} available = {inr(budgetBalance)} remaining
          balance
        </div>
      </CardContent>
    </Card>
  );
}
