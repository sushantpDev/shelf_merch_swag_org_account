import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';

const mcpWriteConfirmationSchema = new mongoose.Schema(
  {
    confirmationId: { type: String, required: true, unique: true },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    operation: { type: String, required: true },
    payloadHash: { type: String, required: true },
    resourceHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ['pending', 'consumed', 'rejected'],
      default: 'pending',
      required: true,
    },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

mcpWriteConfirmationSchema.plugin(tenantScopePlugin);
mcpWriteConfirmationSchema.index({ tenantId: 1, actorUserId: 1, status: 1 });

export const McpWriteConfirmation = mongoose.model('McpWriteConfirmation', mcpWriteConfirmationSchema);
