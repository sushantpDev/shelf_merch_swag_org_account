import type {
  CopilotDepartmentBudgetsArtifact,
  CopilotWalletBalanceArtifact,
} from "./api";

function formatInr(value: unknown) {
  if (value == null || value === "") return "";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function DepartmentRows({
  departments,
}: {
  departments: CopilotDepartmentBudgetsArtifact["departments"];
}) {
  if (!departments?.length) return null;
  return (
    <div className="sm-copilot-md__table-wrap">
      <table className="sm-copilot-balance__table" aria-label="Department budget rows">
        <thead>
          <tr>
            <th>Department</th>
            <th>Allocated</th>
            <th>Remaining</th>
          </tr>
        </thead>
        <tbody>
          {departments.map((row) => (
            <tr key={row.entityId || row.name}>
              <td>{row.name}</td>
              <td>{formatInr(row.allocatedAmount)}</td>
              <td>{formatInr(row.remainingAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CopilotWalletBalanceCard({
  artifact,
}: {
  artifact: CopilotWalletBalanceArtifact;
}) {
  const wallet = artifact.wallet;
  const available = formatInr(wallet.unallocatedAmount);
  return (
    <div className="sm-copilot-balance" aria-label="Wallet balance">
      <div className="sm-copilot-balance__head">
        <strong>{wallet.name || "Organization wallet"}</strong>
        <span className="sm-copilot-balance__available">Available {available}</span>
      </div>
      <dl className="sm-copilot-balance__grid">
        <div>
          <dt>Total balance</dt>
          <dd>{formatInr(wallet.balance)}</dd>
        </div>
        <div>
          <dt>Allocated (outstanding)</dt>
          <dd>{formatInr(wallet.allocatedAmount)}</dd>
        </div>
        <div>
          <dt>Unallocated</dt>
          <dd>{formatInr(wallet.unallocatedAmount)}</dd>
        </div>
      </dl>
      {wallet.fundingPending ? (
        <p className="sm-copilot-balance__note">Funding request pending approval.</p>
      ) : null}
      {artifact.departments?.length ? <DepartmentRows departments={artifact.departments} /> : null}
      {artifact.reconciliation?.warning ? (
        <p className="sm-copilot-balance__warn" role="status">
          {artifact.reconciliation.warning}
        </p>
      ) : artifact.reconciliation?.note && artifact.reconciliation.ok ? (
        <p className="sm-copilot-balance__note">{artifact.reconciliation.note}</p>
      ) : null}
    </div>
  );
}

export function CopilotDepartmentBudgetsCard({
  artifact,
}: {
  artifact: CopilotDepartmentBudgetsArtifact;
}) {
  const totalRemaining = artifact.departments.reduce(
    (sum, row) => sum + (Number(row.remainingAmount) || 0),
    0,
  );
  return (
    <div className="sm-copilot-balance" aria-label="Department budgets">
      <div className="sm-copilot-balance__head">
        <strong>Department budgets</strong>
        <span className="sm-copilot-balance__available">
          Available {formatInr(totalRemaining)}
        </span>
      </div>
      <DepartmentRows departments={artifact.departments} />
    </div>
  );
}
