import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { inr } from "@/components/platform/platform-ui";
import { deptPaletteColor, totalAllocatedAmount, type OrgSnapshot } from "../../types";
import { Donut } from "../Donut";

type Dept = OrgSnapshot["departments"][number];

function ManagerInviteBadge({ status }: { status: "unassigned" | "pending" | "active" }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Active
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Invite pending
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-md border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      Not assigned
    </span>
  );
}

type Props = {
  departments: Dept[];
  budgetTotal: number;
  canAllocate?: boolean;
  onAllocate?: () => void;
};

export function BudgetAllocationTable({
  departments,
  budgetTotal,
  canAllocate,
  onAllocate,
}: Props) {
  const alloc = totalAllocatedAmount(departments);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">Department allocation</CardTitle>
          {canAllocate && onAllocate ? (
            <Button variant="outline" size="sm" onClick={onAllocate}>
              {departments.length ? "Edit allocation" : "Allocate budget"}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {departments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No departments configured yet.
              {canAllocate ? " Allocate budget to split funds across teams." : ""}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Department</TableHead>
                    <TableHead>Manager</TableHead>
                    <TableHead className="text-right">Allocated</TableHead>
                    <TableHead className="text-right">Spent</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departments.map((d, i) => {
                    const remaining = Math.max(0, (d.allocated ?? 0) - (d.spent ?? 0));
                    return (
                      <TableRow key={d.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-sm"
                              style={{ background: deptPaletteColor(i) }}
                              aria-hidden="true"
                            />
                            <span className="font-medium">{d.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {d.mgr.name || d.mgr.email ? (
                            <div>
                              <div className="text-sm font-medium">
                                {d.mgr.name || d.mgr.email.split("@")[0]}
                              </div>
                              {d.mgr.email ? (
                                <div className="text-xs text-muted-foreground">{d.mgr.email}</div>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{inr(d.allocated)}</TableCell>
                        <TableCell className="text-right tabular-nums">{inr(d.spent ?? 0)}</TableCell>
                        <TableCell className="text-right tabular-nums">{inr(remaining)}</TableCell>
                        <TableCell>
                          <ManagerInviteBadge status={d.mgr.inviteStatus ?? "unassigned"} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Allocation overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
            <Donut
              segments={departments.map((d, i) => ({
                color: deptPaletteColor(i),
                allocated: d.allocated,
              }))}
              centerValue={departments.length}
              centerLabel="Depts"
            />
            <div className="w-full flex-1 space-y-2">
              {departments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Allocate portions of your organization budget to departments like Marketing, HR,
                  Engineering, and Sales.
                </p>
              ) : (
                departments.map((d, i) => (
                  <div key={d.id} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-sm"
                        style={{ background: deptPaletteColor(i) }}
                        aria-hidden="true"
                      />
                      {d.name}
                    </span>
                    <span className="font-medium tabular-nums">
                      {budgetTotal ? Math.round((d.allocated / budgetTotal) * 100) : 0}%
                    </span>
                  </div>
                ))
              )}
              <div className="mt-4 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Total allocated: </span>
                <span className="font-semibold tabular-nums">{inr(alloc)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
