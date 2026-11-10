import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';

const mcpMerchandiseClaimSchema = new mongoose.Schema(
  {
    logicalKey: { type: String, required: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', default: null },
  },
  { timestamps: true },
);

mcpMerchandiseClaimSchema.plugin(tenantScopePlugin);
mcpMerchandiseClaimSchema.index({ tenantId: 1, logicalKey: 1 }, { unique: true });

export const McpMerchandiseClaim = mongoose.model('McpMerchandiseClaim', mcpMerchandiseClaimSchema);
