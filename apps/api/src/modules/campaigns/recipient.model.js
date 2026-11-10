import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';
import { softDeletePlugin } from '../../plugins/softDelete.plugin.js';

export const REDEMPTION_STATUSES = [
  'invited',
  'opened',
  'verified',
  'redeemed',
  'order_created',
  'expired',
];

const recipientSchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    phone: { type: String, default: '' },
    creditAmount: { type: Number, default: 0 },
    redemptionToken: { type: String, unique: true, index: true },
    // NOTE: named redemptionStatus (not status) intentionally — driven by the
    // "redemption" state machine via the service layer.
    redemptionStatus: { type: String, enum: REDEMPTION_STATUSES, default: 'invited' },
    invitedAt: { type: Date, default: null },
    inviteClaimedAt: { type: Date, default: null },
    openedAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    redeemedAt: { type: Date, default: null },
    otpHash: { type: String, default: null, select: false },
    otpExpiresAt: { type: Date, default: null },
    otpAttempts: { type: Number, default: 0 },
    variants: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true },
);

recipientSchema.plugin(tenantScopePlugin);
recipientSchema.plugin(softDeletePlugin);
recipientSchema.index({ tenantId: 1, campaignId: 1, email: 1 }, { unique: true });

export const Recipient = mongoose.model('Recipient', recipientSchema);
