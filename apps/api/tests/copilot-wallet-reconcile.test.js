import { describe, expect, it } from 'vitest';
import {
  enrichWalletArtifacts,
  reconcileWalletFigures,
  sumDepartmentRemaining,
} from '../src/modules/copilot/copilotWalletReconcile.js';

describe('copilotWalletReconcile', () => {
  it('matches wallet outstanding allocation to department remaining sum', () => {
    const departments = [
      { name: 'Marketing', allocatedAmount: 5000, remainingAmount: 4500, walletId: 'w1' },
      { name: 'Sales', allocatedAmount: 3000, remainingAmount: 2500, walletId: 'w1' },
    ];
    const result = reconcileWalletFigures({
      walletAllocated: 7000,
      departmentRemainingSum: sumDepartmentRemaining(departments),
      departmentAllocatedSum: 8000,
    });
    expect(result.ok).toBe(true);
    expect(result.remainingDelta).toBe(0);
    expect(result.warning).toBeNull();
    expect(Math.abs(result.grossDelta)).toBe(1000);
  });

  it('warns when outstanding allocation diverges from remaining sum', () => {
    const result = reconcileWalletFigures({
      walletAllocated: 8000,
      departmentRemainingSum: 7000,
      departmentAllocatedSum: 8000,
    });
    expect(result.ok).toBe(false);
    expect(result.remainingDelta).toBe(1000);
    expect(result.warning).toMatch(/₹1,000/);
  });

  it('enriches wallet_balance artifacts from department_budgets without inventing totals', () => {
    const artifacts = enrichWalletArtifacts([
      {
        kind: 'wallet_balance',
        wallet: {
          id: 'w1',
          name: 'Primary',
          currency: 'INR',
          balance: 20000,
          allocatedAmount: 7000,
          unallocatedAmount: 13000,
        },
      },
      {
        kind: 'department_budgets',
        departments: [
          { name: 'Marketing', allocatedAmount: 5000, remainingAmount: 4500, walletId: 'w1' },
          { name: 'Sales', allocatedAmount: 3000, remainingAmount: 2500, walletId: 'w1' },
        ],
      },
    ]);
    const card = artifacts.find((row) => row.kind === 'wallet_balance');
    expect(card.reconciliation.ok).toBe(true);
    expect(card.departments).toHaveLength(2);
    expect(card.wallet.allocatedAmount).toBe(7000);
  });
});
