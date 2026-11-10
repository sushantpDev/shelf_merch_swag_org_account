import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';

const mcpShopClaimSchema = new mongoose.Schema(
  {
    logicalKey: { type: String, required: true },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
  },
  { timestamps: true },
);

mcpShopClaimSchema.plugin(tenantScopePlugin);
mcpShopClaimSchema.index({ tenantId: 1, logicalKey: 1 }, { unique: true });

export const McpShopClaim = mongoose.model('McpShopClaim', mcpShopClaimSchema);
