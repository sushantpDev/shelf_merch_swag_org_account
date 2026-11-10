import mongoose from 'mongoose';
import { Wallet } from '../modules/wallets/wallet.model.js';
import { WalletTransaction } from '../modules/wallets/walletTransaction.model.js';
import { Entity } from '../modules/entities/entity.model.js';
import { ApiError, InsufficientFundsError, NotFoundError } from '../utils/errors.js';

/**
 * §3.3 / §7.4 — THE CORE LEDGER.
 *
 * Semantics:
 * - Cash-moving types (fund_in, transfer_between_wallets, campaign_spend,
 *   order_payment, refund, adjustment) move `wallet.balance`.
 * - `allocation_to_entity` is an earmark, not a cash movement: it moves
 *   `wallet.allocatedAmount` (and the entity's allocatedAmount) while the cash
 *   stays in the wallet. Invariant: allocatedAmount <= balance at all times.
 * - `campaign_spend` / `order_payment` with `relatedEntityId` debit cash and
 *   release that share of the department earmark (`wallet.allocatedAmount`) so
 *   org unallocated is not double-consumed. Entity `spentAmount` tracks usage;
 *   remaining = allocatedAmount - spentAmount.
 * - Spends without `relatedEntityId` debit cash only (admin unallocated spend).
 * - Every movement is an append-only WalletTransaction with a balanceAfter
 *   snapshot, so `balance` is always recomputable/auditable from the log.
 *
 * All multi-document writes run inside a MongoDB session (replica set required).
 */

const CASH_TYPES = new Set([
  'fund_in',
  'transfer_between_wallets',
  'campaign_spend',
  'order_payment',
  'refund',
  'adjustment',
]);

async function withSession(session, fn) {
  if (session) return fn(session);
  const own = await mongoose.startSession();
  try {
    let result;
    await own.withTransaction(async () => {
      result = await fn(own);
    });
    return result;
  } finally {
    await own.endSession();
  }
}

function duplicateKey(err) {
  return err?.code === 11000 || err?.cause?.code === 11000 || err?.errorResponse?.code === 11000;
}

let ledgerIndexesReady;

export async function createTransaction(
  { tenantId, walletId, type, amount, relatedEntityId = null, description = '', performedBy = null, idempotencyKey = null },
  session = null,
) {
  if (!Number.isFinite(amount) || amount === 0) {
    throw new ApiError(422, 'Transaction amount must be a non-zero number', 'INVALID_AMOUNT');
  }
  if (idempotencyKey != null && typeof idempotencyKey !== 'string') {
    throw new ApiError(422, 'Ledger idempotency key must be a string', 'INVALID_IDEMPOTENCY_KEY');
  }
  if (idempotencyKey) {
    ledgerIndexesReady ??= WalletTransaction.syncIndexes();
    await ledgerIndexesReady;
  }

  try {
    return await withSession(session, async (s) => {
    if (idempotencyKey) {
      const existing = await WalletTransaction.findOne({ tenantId, idempotencyKey }).session(s);
      if (existing) return existing;
    }
    const wallet = await Wallet.findOne({ _id: walletId, tenantId })
      .setOptions({ includeDeleted: true })
      .session(s);
    if (!wallet) throw new NotFoundError('Wallet not found');

    const isCash = CASH_TYPES.has(type);
    let newBalance = wallet.balance;
    let newAllocated = wallet.allocatedAmount;

    if (isCash) {
      newBalance = wallet.balance + amount;
      if (newBalance < 0) {
        throw new InsufficientFundsError(
          `Insufficient funds: balance ₹${wallet.balance}, attempted debit ₹${Math.abs(amount)}`,
        );
      }
      if (type === 'fund_in') wallet.totalAmount += amount;
      // Department spend: release earmark so admin unallocated is not also reduced.
      if (
        relatedEntityId &&
        (type === 'campaign_spend' || type === 'order_payment') &&
        amount < 0
      ) {
        newAllocated = wallet.allocatedAmount - Math.abs(amount);
        if (newAllocated < 0) {
          throw new ApiError(
            422,
            'Cannot spend more than the department earmark remaining on this wallet',
            'INVALID_ALLOCATION',
          );
        }
      }
    } else if (type === 'allocation_to_entity') {
      newAllocated = wallet.allocatedAmount + amount;
      if (newAllocated < 0) {
        throw new ApiError(422, 'Cannot deallocate more than is allocated', 'INVALID_ALLOCATION');
      }
      if (newAllocated > wallet.balance) {
        throw new InsufficientFundsError(
          `Allocation exceeds wallet balance: balance ₹${wallet.balance}, total allocation would be ₹${newAllocated}`,
        );
      }
    } else {
      throw new ApiError(422, `Unknown transaction type "${type}"`, 'INVALID_TRANSACTION_TYPE');
    }

    if (newAllocated > newBalance) {
      throw new InsufficientFundsError(
        `Allocation exceeds wallet balance: balance ₹${newBalance}, total allocation would be ₹${newAllocated}`,
      );
    }

    const [txn] = await WalletTransaction.create(
      [
        {
          tenantId,
          walletId: wallet._id,
          type,
          amount,
          balanceAfter: newBalance,
          relatedEntityId,
          description,
          performedBy,
          ...(idempotencyKey ? { idempotencyKey } : {}),
        },
      ],
      { session: s },
    );

    wallet.balance = newBalance;
    wallet.allocatedAmount = newAllocated;
    await wallet.save({ session: s });

    // Keep the entity's cached figures in sync.
    if (relatedEntityId) {
      if (type === 'allocation_to_entity') {
        await Entity.updateOne(
          { _id: relatedEntityId, tenantId },
          { $inc: { allocatedAmount: amount } },
          { session: s },
        );
      } else if (type === 'campaign_spend' || type === 'order_payment') {
        await Entity.updateOne(
          { _id: relatedEntityId, tenantId },
          { $inc: { spentAmount: Math.abs(amount) } },
          { session: s },
        );
      }
    }

    return txn;
    });
  } catch (err) {
    if (idempotencyKey && duplicateKey(err)) {
      const existing = await WalletTransaction.findOne({ tenantId, idempotencyKey });
      if (existing) return existing;
    }
    throw err;
  }
}

/** Resolve which wallet backs an entity-tied spend (handles removed source wallets). */
export async function resolveSpendWalletForEntity({ tenantId, entityId }) {
  const entity = await Entity.findOne({ _id: entityId, tenantId });
  if (!entity) throw new NotFoundError('Entity not found');

  const linked = await Wallet.findOne({ _id: entity.walletId, tenantId }).setOptions({
    includeDeleted: true,
  });
  if (linked) return { entity, wallet: linked };

  const fallback = await Wallet.findOne({ tenantId }).sort({ balance: -1 });
  if (!fallback) throw new NotFoundError('Wallet not found');
  return { entity, wallet: fallback };
}

function sameAllocation(existing, { walletId, entityId, amount }) {
  return existing
    && existing.type === 'allocation_to_entity'
    && String(existing.walletId) === String(walletId)
    && String(existing.relatedEntityId) === String(entityId)
    && Number(existing.amount) === Number(amount);
}

/** Allocate budget to multiple entities atomically (§7.4 /allocate). */
export async function allocateToEntities({ tenantId, walletId, allocations, performedBy }) {
  const session = await mongoose.startSession();
  try {
    let txns;
    await session.withTransaction(async () => {
      txns = [];
      for (const { entityId, amount, idempotencyKey = null } of allocations) {
        const entity = await Entity.findOne({ _id: entityId, tenantId }).session(session);
        if (!entity) throw new NotFoundError(`Entity ${entityId} not found`);
        if (idempotencyKey) {
          const existing = await WalletTransaction.findOne({ tenantId, idempotencyKey }).session(session);
          if (existing) {
            if (!sameAllocation(existing, { walletId, entityId, amount })) {
              throw new ApiError(409, 'This allocation key was used for a different movement', 'ALLOCATION_KEY_CONFLICT');
            }
            txns.push(existing);
            continue;
          }
        }
        if (amount < 0) {
          const remaining = Number(entity.allocatedAmount || 0) - Number(entity.spentAmount || 0);
          if (Math.abs(amount) > remaining) {
            throw new ApiError(422, 'Cannot withdraw budget that has already been spent', 'ALLOCATION_EXCEEDS_UNSPENT');
          }
        }
        const txn = await createTransaction(
          {
            tenantId,
            walletId,
            type: 'allocation_to_entity',
            amount,
            relatedEntityId: entity._id,
            description:
              amount >= 0
                ? `Budget allocation to ${entity.name}`
                : `Budget returned from ${entity.name}`,
            performedBy,
            idempotencyKey,
          },
          session,
        );
        txns.push(txn);
      }
    });
    return txns;
  } finally {
    await session.endSession();
  }
}

/** Transfer cash between two wallets of the same tenant atomically. */
export async function transferBetweenWallets({ tenantId, fromWalletId, toWalletId, amount, performedBy }) {
  if (amount <= 0) throw new ApiError(422, 'Transfer amount must be positive', 'INVALID_AMOUNT');
  if (String(fromWalletId) === String(toWalletId)) {
    throw new ApiError(422, 'Cannot transfer a wallet to itself', 'INVALID_TRANSFER');
  }
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const debit = await createTransaction(
        {
          tenantId,
          walletId: fromWalletId,
          type: 'transfer_between_wallets',
          amount: -amount,
          description: `Transfer to wallet ${toWalletId}`,
          performedBy,
        },
        session,
      );
      const fromWallet = await Wallet.findOne({ _id: fromWalletId, tenantId }).session(session);
      if (fromWallet.allocatedAmount > fromWallet.balance) {
        throw new InsufficientFundsError(
          'Transfer would leave the wallet with less cash than its entity allocations',
        );
      }
      const credit = await createTransaction(
        {
          tenantId,
          walletId: toWalletId,
          type: 'transfer_between_wallets',
          amount,
          description: `Transfer from wallet ${fromWalletId}`,
          performedBy,
        },
        session,
      );
      result = { debit, credit };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/** Recompute a wallet's cash balance from the ledger (validation/repair tool). */
export async function recomputeBalance({ tenantId, walletId }) {
  const rows = await WalletTransaction.aggregate([
    {
      $match: {
        tenantId: new mongoose.Types.ObjectId(String(tenantId)),
        walletId: new mongoose.Types.ObjectId(String(walletId)),
        type: { $in: [...CASH_TYPES] },
      },
    },
    { $group: { _id: null, balance: { $sum: '$amount' } } },
  ]);
  return rows[0]?.balance ?? 0;
}

/**
 * Outstanding earmarks = allocations minus department-tied spends that released them.
 * Unrelated cash spends (no relatedEntityId) do not change this figure.
 */
export async function recomputeAllocatedAmount({ tenantId, walletId }) {
  const tid = new mongoose.Types.ObjectId(String(tenantId));
  const wid = new mongoose.Types.ObjectId(String(walletId));
  const [allocRows, spendRows] = await Promise.all([
    WalletTransaction.aggregate([
      { $match: { tenantId: tid, walletId: wid, type: 'allocation_to_entity' } },
      { $group: { _id: null, allocated: { $sum: '$amount' } } },
    ]),
    WalletTransaction.aggregate([
      {
        $match: {
          tenantId: tid,
          walletId: wid,
          relatedEntityId: { $ne: null },
          type: { $in: ['campaign_spend', 'order_payment'] },
        },
      },
      { $group: { _id: null, spent: { $sum: { $abs: '$amount' } } } },
    ]),
  ]);
  return Math.max(0, (allocRows[0]?.allocated ?? 0) - (spendRows[0]?.spent ?? 0));
}

/** Ledger totals for one entity. Read-only — does not persist cache repairs. */
export async function readEntityLedgerTotals({ tenantId, entityId }) {
  const tid = new mongoose.Types.ObjectId(String(tenantId));
  const eid = new mongoose.Types.ObjectId(String(entityId));
  const [allocRows, spentRows] = await Promise.all([
    WalletTransaction.aggregate([
      {
        $match: {
          tenantId: tid,
          relatedEntityId: eid,
          type: 'allocation_to_entity',
        },
      },
      { $group: { _id: null, allocated: { $sum: '$amount' } } },
    ]),
    WalletTransaction.aggregate([
      {
        $match: {
          tenantId: tid,
          relatedEntityId: eid,
          type: { $in: ['campaign_spend', 'order_payment'] },
        },
      },
      { $group: { _id: null, spent: { $sum: { $abs: '$amount' } } } },
    ]),
  ]);
  return {
    allocatedAmount: allocRows[0]?.allocated ?? 0,
    spentAmount: spentRows[0]?.spent ?? 0,
  };
}

/**
 * Wallet cash + earmarked totals from the ledger.
 * Read-only view for MCP PREPARE (no cache writes).
 */
export async function readWalletLedgerView({ tenantId, walletId }) {
  const wallet = await Wallet.findOne({ _id: walletId, tenantId });
  if (!wallet) return null;
  const [balance, allocatedAmount] = await Promise.all([
    recomputeBalance({ tenantId, walletId }),
    recomputeAllocatedAmount({ tenantId, walletId }),
  ]);
  return {
    _id: wallet._id,
    name: wallet.name,
    currency: wallet.currency,
    status: wallet.status,
    balance,
    allocatedAmount,
  };
}

export async function repairEntityCache({ tenantId, entityId }) {
  const entity = await Entity.findOne({ _id: entityId, tenantId });
  if (!entity) return null;

  const { allocatedAmount, spentAmount } = await readEntityLedgerTotals({ tenantId, entityId });
  let dirty = false;
  if (entity.allocatedAmount !== allocatedAmount) {
    entity.allocatedAmount = allocatedAmount;
    dirty = true;
  }
  if (entity.spentAmount !== spentAmount) {
    entity.spentAmount = spentAmount;
    dirty = true;
  }
  if (dirty) await entity.save();
  return entity;
}

/** Repair cached wallet/entity figures from the append-only ledger. */
export async function repairWalletCaches({ tenantId, walletId }) {
  const wallet = await Wallet.findOne({ _id: walletId, tenantId }).setOptions({
    includeDeleted: true,
  });
  if (!wallet) return null;

  const [balance, allocated] = await Promise.all([
    recomputeBalance({ tenantId, walletId }),
    recomputeAllocatedAmount({ tenantId, walletId }),
  ]);

  let walletDirty = false;
  if (wallet.balance !== balance) {
    wallet.balance = balance;
    walletDirty = true;
  }
  if (wallet.allocatedAmount !== allocated) {
    wallet.allocatedAmount = allocated;
    walletDirty = true;
  }
  if (walletDirty) await wallet.save();

  const walletEntityIds = await Entity.find({ tenantId, walletId }).distinct('_id');
  const ledgerEntityIds = await WalletTransaction.find({
    tenantId,
    walletId,
    relatedEntityId: { $ne: null },
  }).distinct('relatedEntityId');
  const entityIds = [...new Set([...walletEntityIds, ...ledgerEntityIds].map(String))];
  await Promise.all(entityIds.map((entityId) => repairEntityCache({ tenantId, entityId })));

  return wallet;
}
