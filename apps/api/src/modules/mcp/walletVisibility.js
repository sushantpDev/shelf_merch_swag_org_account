import { Entity } from '../entities/entity.model.js';

export function hidesOrganizationWallet(user) {
  return user?.scopeType === 'entity' || user?.role === 'entity_manager';
}

export async function departmentRemaining(tenantId, entityId) {
  const entity = await Entity.findOne({ _id: entityId, tenantId })
    .select('allocatedAmount spentAmount')
    .lean();
  const allocated = Number(entity?.allocatedAmount) || 0;
  const spent = Number(entity?.spentAmount) || 0;
  return Math.max(0, allocated - spent);
}

export async function visibleFunds(user, tenantId, entityId, walletView) {
  if (!hidesOrganizationWallet(user)) {
    return {
      balance: walletView.balance,
      unallocatedAmount: walletView.unallocatedAmount,
      department: false,
    };
  }
  const remaining = await departmentRemaining(tenantId, entityId);
  return {
    balance: remaining,
    unallocatedAmount: remaining,
    department: true,
  };
}

export function maskWalletImpact(funds, impact) {
  if (!funds?.department) return impact;
  const debit = Math.round(Number(impact.debitedNow) || 0);
  const before = funds.balance;
  const after = before - debit;
  const masked = { ...impact, balance: before, unallocatedAmount: before };
  if (impact.balanceBefore != null) masked.balanceBefore = before;
  if (impact.balanceAfter != null) masked.balanceAfter = debit ? after : before;
  if (impact.unallocatedBefore != null) masked.unallocatedBefore = before;
  if (impact.unallocatedAfter != null) masked.unallocatedAfter = debit ? after : before;
  return masked;
}