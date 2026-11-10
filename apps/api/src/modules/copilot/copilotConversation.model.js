import mongoose from 'mongoose';

const artifactSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['product', 'kit', 'confirmation', 'success', 'wallet_balance', 'department_budgets', 'curation'], required: true },
    curation: { type: mongoose.Schema.Types.Mixed },
    product: { type: mongoose.Schema.Types.Mixed },
    kit: { type: mongoose.Schema.Types.Mixed },
    operation: { type: String },
    confirmationId: { type: String },
    expiresAt: { type: String },
    preview: { type: mongoose.Schema.Types.Mixed },
    request: { type: mongoose.Schema.Types.Mixed },
    status: { type: String },
    shop: { type: mongoose.Schema.Types.Mixed },
    result: { type: mongoose.Schema.Types.Mixed },
    message: { type: String },
    title: { type: String },
    details: { type: [String], default: undefined },
    actions: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false },
);

const attachmentRefSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    kind: { type: String, enum: ['purchase_order', 'artwork', 'banner', 'file'], required: true },
    ticketId: { type: String, default: null },
    originalName: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    sizeBytes: { type: Number, default: 0 },
  },
  { _id: false },
);

const toolCallSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    arguments: { type: String, default: '{}' },
  },
  { _id: false },
);

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant', 'system', 'tool'], required: true },
    content: { type: String, default: '' },
    toolCallId: { type: String, default: null },
    toolName: { type: String, default: null },
    /** Provider-neutral tool calls for multi-turn continuity (OpenAI + Claude). */
    toolCalls: { type: [toolCallSchema], default: [] },
    artifacts: { type: [artifactSchema], default: [] },
    attachments: { type: [attachmentRefSchema], default: [] },
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } },
);

const conversationSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, default: 'New conversation' },
    messages: { type: [messageSchema], default: [] },
    archivedAt: { type: Date, default: null },
    curator: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true },
);

conversationSchema.index({ tenantId: 1, userId: 1, updatedAt: -1 });

export const CopilotConversation = mongoose.model('CopilotConversation', conversationSchema);
