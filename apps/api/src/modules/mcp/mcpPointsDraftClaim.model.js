import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';

const mcpPointsDraftClaimSchema = new mongoose.Schema(
  {
    logicalKey: { type: String, required: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', default: null },
  },
  { timestamps: true },
);

mcpPointsDraftClaimSchema.plugin(tenantScopePlugin);
mcpPointsDraftClaimSchema.index({ tenantId: 1, logicalKey: 1 }, { unique: true });

export const McpPointsDraftClaim = mongoose.model('McpPointsDraftClaim', mcpPointsDraftClaimSchema);
