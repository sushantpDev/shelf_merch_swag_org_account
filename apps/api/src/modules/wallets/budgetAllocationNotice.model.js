import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';

const budgetAllocationNoticeSchema = new mongoose.Schema(
  {
    transactionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
);

budgetAllocationNoticeSchema.plugin(tenantScopePlugin);
budgetAllocationNoticeSchema.index({ tenantId: 1, transactionId: 1 }, { unique: true });

export const BudgetAllocationNotice = mongoose.model('BudgetAllocationNotice', budgetAllocationNoticeSchema);
