import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';

export const TRANSACTION_TYPES = [
  'fund_in',
  'allocation_to_entity',
  'transfer_between_wallets',
  'campaign_spend',
  'order_payment',
  'refund',
  'adjustment',
];

// §3.3 — the ledger. Append-only: no updates, no deletes, ever.
const walletTransactionSchema = new mongoose.Schema(
  {
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: true,
      index: true,
    },
    type: { type: String, enum: TRANSACTION_TYPES, required: true },
    amount: { type: Number, required: true }, // positive = credit, negative = debit
    balanceAfter: { type: Number, required: true }, // running cash balance snapshot
    relatedEntityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    description: { type: String, default: '' },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    idempotencyKey: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

walletTransactionSchema.plugin(tenantScopePlugin);
walletTransactionSchema.index({ tenantId: 1, walletId: 1, createdAt: -1 });
walletTransactionSchema.index(
  { tenantId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);

const forbid = function () {
  throw new Error('WalletTransaction is append-only — updates/deletes are forbidden');
};
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  walletTransactionSchema.pre(op, forbid);
}

export const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);
