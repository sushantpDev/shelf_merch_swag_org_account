import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';

const mcpCollectionClaimSchema = new mongoose.Schema(
  {
    logicalKey: { type: String, required: true },
    collectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collection', default: null },
  },
  { timestamps: true },
);

mcpCollectionClaimSchema.plugin(tenantScopePlugin);
mcpCollectionClaimSchema.index({ tenantId: 1, logicalKey: 1 }, { unique: true });

export const McpCollectionClaim = mongoose.model('McpCollectionClaim', mcpCollectionClaimSchema);
