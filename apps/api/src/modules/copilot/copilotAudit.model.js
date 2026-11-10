import mongoose from 'mongoose';

/** Tool-call audit without secrets or full PII dumps. */
const auditSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'CopilotConversation', default: null },
    toolName: { type: String, required: true },
    ok: { type: Boolean, required: true },
    latencyMs: { type: Number, default: 0 },
    errorCode: { type: String, default: null },
    metrics: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditSchema.index({ tenantId: 1, createdAt: -1 });

export const CopilotAudit = mongoose.model('CopilotAudit', auditSchema);
