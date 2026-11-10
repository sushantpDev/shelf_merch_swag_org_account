import { Wallet } from "lucide-react";
import { useQueries } from "@tanstack/react-query";
import { inr } from "@/components/platform/platform-ui";
import { fetchEntityTransactionsApi, fetchWalletTransactionsApi, type WalletTransactionRow } from "@/services/mutations-api";

function formatTxnDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function txnLabel(type: string, amount?: number): string {
  if (type === "fund_in") return "Funds added";
  if (type === "allocation_to_entity") {
    return amount != null && amount < 0 ? "Budget returned" : "Budget allocated";
  }
  if (type === "transfer_between_wallets") return "Transfer";
  if (type === "campaign_spend" || type === "order_payment") return "Spend";
  if (type === "refund") return "Refund";
  return type.replace(/_/g, " ");
}

/** Running department budget (allocated − spent) after each row. */
function withEntityBudgetBalance(txns: WalletTransactionRow[], entityIds: string[]) {
  const entitySet = new Set(entityIds.map(String));
  const mine = txns.filter((t) => entitySet.has(String(t.relatedEntityId ?? "")));
  const chronological = [...mine].sort(
    (a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime(),
  );
  let allocated = 0;
  let spent = 0;
  const remainingByKey = new Map<string, number>();

  for (const t of chronological) {
    if (t.type === "allocation_to_entity") {
      allocated += t.amount;
    } else if (t.type === "campaign_spend" || t.type === "order_payment") {
      spent += Math.abs(t.amount);
    }
    const key = t._id ?? `${t.createdAt}-${t.amount}-${t.type}`;
    remainingByKey.set(key, allocated - spent);
  }

  return mine.map((t) => {
    const key = t._id ?? `${t.createdAt}-${t.amount}-${t.type}`;
    return { ...t, availableAfter: remainingByKey.get(key) };
  });
}

function entityTxnAmountDisplay(t: WalletTransactionRow): { text: string; color: string } {
  if (t.type === "allocation_to_entity") {
    if (t.amount < 0) {
      return { text: `-${inr(Math.abs(t.amount))}`, color: "var(--danger)" };
    }
    return { text: `+${inr(t.amount)}`, color: "var(--brand-d)" };
  }
  return {
    text: `-${inr(Math.abs(t.amount))}`,
    color: "var(--ink)",
  };
}

/** Department spend consumes an existing earmark, not the admin's available balance. */
function isEntitySpend(t: WalletTransactionRow): boolean {
  return Boolean(t.relatedEntityId) && (t.type === "campaign_spend" || t.type === "order_payment");
}

function txnAmountDisplay(t: WalletTransactionRow): { text: string; color: string } {
  if (t.type === "allocation_to_entity") {
    // Positive ledger amount = earmark to dept (less unallocated). Negative = return to wallet.
    if (t.amount < 0) {
      return { text: `+${inr(Math.abs(t.amount))}`, color: "var(--brand-d)" };
    }
    return { text: `-${inr(t.amount)}`, color: "var(--danger)" };
  }
  const sign = t.amount >= 0 ? "+" : "-";
  return {
    text: `${sign}${inr(Math.abs(t.amount))}`,
    color: t.amount >= 0 ? "var(--brand-d)" : "var(--ink)",
  };
}

export function WalletHistory({
  walletId,
  walletIds,
  entityId,
  entityIds,
}: {
  walletId?: string;
  walletIds?: string[];
  entityId?: string;
  entityIds?: string[];
}) {
  const ids = walletIds?.length ? walletIds : walletId ? [walletId] : [];
  const entityIdList = entityIds?.length ? entityIds : entityId ? [entityId] : [];
  const entityMode = entityIdList.length > 0;
  const limit = entityMode ? 50 : 20;
  const walletQueries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["wallet-transactions", id, limit],
      queryFn: () => fetchWalletTransactionsApi(id, limit),
      enabled: Boolean(id) && !entityMode,
    })),
  });
  const entityQueries = useQueries({
    queries: entityIdList.map((id) => ({
      queryKey: ["entity-transactions", id, limit],
      queryFn: () => fetchEntityTransactionsApi(id, limit),
      enabled: Boolean(id) && entityMode,
    })),
  });
  const queries = entityMode ? entityQueries : walletQueries;
  const isLoading = queries.some((q) => q.isLoading);
  const txns = queries.flatMap((q) => q.data ?? []);
  const rows = (
    entityMode ? withEntityBudgetBalance(txns, entityIdList) : txns.filter((t) => !isEntitySpend(t))
  ).sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
  const title = entityMode ? "Budget history" : "Funding history";
  const balanceColumn = entityMode ? "Remaining budget" : "Available balance";

  return (
    <div className="card data-list-card wallet-history">
      <div className="data-list-title">{title}</div>

      {isLoading && (
        <p className="muted" style={{ fontSize: "var(--workspace-font-caption, 13px)" }}>
          Loading transactions…
        </p>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="data-list-empty">
          <div className="data-list-empty-icon" aria-hidden="true">
            <Wallet size={28} color="var(--brand)" />
          </div>
          <h4>{entityMode ? "No budget activity yet" : "No funding history yet"}</h4>
          <p className="muted" style={{ fontSize: "var(--workspace-font-caption, 13px)", maxWidth: 360, margin: "0 auto" }}>
            {entityMode
              ? "Allocations and campaign spend for your department will appear here."
              : "Funding events and budget activity will appear here after your first top-up."}
          </p>
        </div>
      )}

      {!isLoading && rows.length > 0 && (
        <table className="tbl data-list-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Type</th>
              <th>Amount</th>
              <th>{balanceColumn}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const amount = entityMode ? entityTxnAmountDisplay(t) : txnAmountDisplay(t);
              return (
                <tr key={t._id ?? `${t.createdAt}-${t.amount}`}>
                  <td className="muted data-list-cell">{formatTxnDate(t.createdAt)}</td>
                  <td className="data-list-cell">{t.description || "—"}</td>
                  <td className="muted data-list-cell">{txnLabel(t.type, t.amount)}</td>
                  <td
                    className="num data-list-cell data-list-amount"
                    style={{ color: amount.color }}
                  >
                    {amount.text}
                  </td>
                  <td className="num muted data-list-cell">
                    {t.availableAfter != null ? inr(t.availableAfter) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
