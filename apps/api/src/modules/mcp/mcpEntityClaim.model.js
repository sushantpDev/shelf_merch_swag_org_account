import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';

const mcpEntityClaimSchema = new mongoose.Schema(
  {
    logicalKey: { type: String, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', default: null },
  },
  { timestamps: true },
);

mcpEntityClaimSchema.plugin(tenantScopePlugin);
mcpEntityClaimSchema.index({ tenantId: 1, logicalKey: 1 }, { unique: true });

export const McpEntityClaim = mongoose.model('McpEntityClaim', mcpEntityClaimSchema);
