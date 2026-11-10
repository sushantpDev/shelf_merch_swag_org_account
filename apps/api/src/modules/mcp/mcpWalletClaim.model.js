import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';

const mcpWalletClaimSchema = new mongoose.Schema(
  {
    logicalKey: { type: String, required: true },
    walletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', default: null },
  },
  { timestamps: true },
);

mcpWalletClaimSchema.plugin(tenantScopePlugin);
mcpWalletClaimSchema.index({ tenantId: 1, logicalKey: 1 }, { unique: true });

export const McpWalletClaim = mongoose.model('McpWalletClaim', mcpWalletClaimSchema);
