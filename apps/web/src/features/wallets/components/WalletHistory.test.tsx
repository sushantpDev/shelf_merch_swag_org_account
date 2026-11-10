/** @vitest-environment happy-dom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { WalletTransactionRow } from "@/services/mutations-api";
import { WalletHistory } from "./WalletHistory";

const state = vi.hoisted(() => ({ rows: [] as WalletTransactionRow[] }));
vi.mock("@tanstack/react-query", () => ({
  useQueries: ({ queries }: { queries: unknown[] }) => queries.map(() => ({ isLoading: false, data: state.rows })),
}));
vi.mock("@/services/mutations-api", () => ({
  fetchWalletTransactionsApi: vi.fn(), fetchEntityTransactionsApi: vi.fn(),
}));
afterEach(cleanup);

function balanceCells() {
  return screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell").at(-1)?.textContent);
}

it("uses server balances even when the page does not contain the original funding", () => {
  state.rows = [{ _id: "allocation", type: "allocation_to_entity", amount: 1000, availableAfter: 75000 }];
  render(<WalletHistory walletId="wallet" />);
  expect(balanceCells()).toEqual(["₹75,000"]);
  expect(screen.getByText("-₹1,000")).toBeTruthy();
});

it("preserves zero and genuine negative balances rather than hiding their signs", () => {
  state.rows = [
    { _id: "zero", type: "allocation_to_entity", amount: 100, availableAfter: 0 },
    { _id: "negative", type: "adjustment", amount: -100, availableAfter: -50 },
  ];
  render(<WalletHistory walletId="wallet" />);
  expect(balanceCells()).toEqual(["₹0", "-₹50"]);
});

it("keeps admin spends visible and omits department spends from funding history", () => {
  state.rows = [
    { _id: "admin", type: "order_payment", amount: -100, availableAfter: 300, description: "Admin order" },
    { _id: "dept", type: "campaign_spend", amount: -200, availableAfter: 400, relatedEntityId: "department", description: "Department send" },
  ];
  render(<WalletHistory walletId="wallet" />);
  expect(screen.getByText("Admin order")).toBeTruthy();
  expect(screen.queryByText("Department send")).toBeNull();
  expect(balanceCells()).toEqual(["₹300"]);
});

it("does not fabricate a balance when a server row has no balance", () => {
  state.rows = [{ _id: "missing", type: "allocation_to_entity", amount: 100 }];
  render(<WalletHistory walletId="wallet" />);
  expect(balanceCells()).toEqual(["—"]);
});
