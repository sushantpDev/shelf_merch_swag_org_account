import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';

const mcpWriteIdempotencySchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fingerprint: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending',
      required: true,
    },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    errorCode: { type: String, default: '' },
    leaseOwner: { type: String, default: '' },
    leaseExpiresAt: { type: Date, default: null },
    fence: { type: Number, default: 0 },
  },
  { timestamps: true },
);

mcpWriteIdempotencySchema.plugin(tenantScopePlugin);
mcpWriteIdempotencySchema.index({ key: 1, tenantId: 1, actorUserId: 1 }, { unique: true });

export const McpWriteIdempotency = mongoose.model('McpWriteIdempotency', mcpWriteIdempotencySchema);
