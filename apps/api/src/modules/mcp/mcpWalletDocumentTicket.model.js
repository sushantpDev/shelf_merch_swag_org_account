import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';

const STATUSES = ['pending', 'ready', 'expired', 'consumed'];

const mcpWalletDocumentTicketSchema = new mongoose.Schema(
  {
    ticketId: { type: String, required: true },
    tokenHash: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: STATUSES, default: 'pending' },
    documentUrl: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    originalName: { type: String, default: '' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

mcpWalletDocumentTicketSchema.plugin(tenantScopePlugin);
mcpWalletDocumentTicketSchema.index({ tenantId: 1, ticketId: 1 }, { unique: true });
mcpWalletDocumentTicketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const McpWalletDocumentTicket = mongoose.model(
  'McpWalletDocumentTicket',
  mcpWalletDocumentTicketSchema,
);
