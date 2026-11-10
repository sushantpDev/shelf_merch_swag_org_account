import mongoose from 'mongoose';

const ATTACHMENT_KINDS = ['purchase_order', 'artwork', 'banner', 'file'];
const ATTACHMENT_STATUSES = ['uploaded', 'removed', 'expired'];

const copilotAttachmentSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CopilotConversation',
      default: null,
      index: true,
    },
    kind: { type: String, enum: ATTACHMENT_KINDS, required: true },
    status: { type: String, enum: ATTACHMENT_STATUSES, default: 'uploaded', index: true },
    /** MCP wallet/shop upload ticket id when kind is purchase_order, artwork, or banner. */
    ticketId: { type: String, default: null, index: true },
    fileUrl: { type: String, required: true },
    /** Private storage coordinates for authorized server-side reads (never returned to clients). */
    storageKey: { type: String, default: null },
    storageDriver: { type: String, enum: ['local', 's3', 'r2'], default: null },
    mimeType: { type: String, default: '' },
    originalName: { type: String, default: '' },
    sizeBytes: { type: Number, default: 0 },
    /** Abandoned uploads expire; TTL removes the Mongo row (storage GC is separate). */
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

copilotAttachmentSchema.index({ tenantId: 1, userId: 1, status: 1, createdAt: -1 });
copilotAttachmentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const CopilotAttachment = mongoose.model('CopilotAttachment', copilotAttachmentSchema);
export { ATTACHMENT_KINDS, ATTACHMENT_STATUSES };
