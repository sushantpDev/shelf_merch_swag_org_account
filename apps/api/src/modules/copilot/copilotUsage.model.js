import mongoose from 'mongoose';

/** Daily token counters per user and tenant for embedded copilot quotas. */
const usageSchema = new mongoose.Schema(
  {
    day: { type: String, required: true }, // YYYY-MM-DD UTC
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    requestCount: { type: Number, default: 0 },
    estimatedCostUsd: { type: Number, default: 0 },
    toolCallCount: { type: Number, default: 0 },
    lastProvider: { type: String, default: null },
    lastModel: { type: String, default: null },
    lastLatencyMs: { type: Number, default: 0 },
  },
  { timestamps: true },
);

usageSchema.index({ day: 1, tenantId: 1, userId: 1 }, { unique: true });
usageSchema.index({ day: 1, tenantId: 1 });

export const CopilotUsage = mongoose.model('CopilotUsage', usageSchema);
