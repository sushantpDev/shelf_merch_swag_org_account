import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';

const STATUSES = ['pending', 'ready', 'expired', 'consumed'];
const KINDS = ['logo', 'banner'];

const mcpShopAssetTicketSchema = new mongoose.Schema(
  {
    ticketId: { type: String, required: true },
    tokenHash: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: KINDS, required: true },
    status: { type: String, enum: STATUSES, default: 'pending' },
    assetUrl: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    originalName: { type: String, default: '' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

mcpShopAssetTicketSchema.plugin(tenantScopePlugin);
mcpShopAssetTicketSchema.index({ tenantId: 1, ticketId: 1 }, { unique: true });
mcpShopAssetTicketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const McpShopAssetTicket = mongoose.model(
  'McpShopAssetTicket',
  mcpShopAssetTicketSchema,
);
