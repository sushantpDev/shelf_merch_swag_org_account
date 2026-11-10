import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';
import { softDeletePlugin } from '../../plugins/softDelete.plugin.js';

export const CAMPAIGN_STATUSES = [
  'draft',
  'recipients_uploaded',
  'credits_allocated',
  'approved',
  'launched',
  'redemption_open',
  'redemption_closed',
  'fulfilled',
];

const campaignSchema = new mongoose.Schema(
  {
    entityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['points', 'items', 'kit'], required: true },
    fulfillmentMode: { type: String, enum: ['redeem', 'surprise', 'single'], default: 'redeem' },
    singleLocation: {
      name: { type: String, default: '' },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
      line1: { type: String, default: '' },
      line2: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      pincode: { type: String, default: '' },
      country: { type: String, default: 'IN' },
    },
    catalogMode: { type: String, enum: ['full_store', 'selected_products'], default: 'full_store' },
    selectedProductIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CatalogProduct' }],
    kitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Kit', default: null },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
    pointsScope: { type: String, enum: ['stadium', 'shop'], default: 'shop' },
    creditsPerRecipient: { type: Number, default: 0 }, // INR
    recipientCount: { type: Number, default: 0 }, // cached
    totalBudget: { type: Number, default: 0 }, // checkout grand total charged at launch
    /** How the send was paid — wallet debit vs Razorpay UPI/card. */
    paymentMode: { type: String, enum: ['wallet', 'upi', 'card'], default: 'wallet' },
    razorpayPaymentId: { type: String, default: '' },
    /** Kit packaging chosen at send checkout — drives order amount breakdown. */
    packaging: { type: String, enum: ['none', 'box', 'wrap'], default: 'none' },
    /** Qty-1 sample order to a single address (distinct pricing: shipping ₹50, curated box ₹35). */
    isSample: { type: Boolean, default: false },
    /** Sample branding choice — logo is free; stored for fulfillment notes. */
    brandingEnabled: { type: Boolean, default: false },
    message: {
      from: { type: String, default: '' },
      body: { type: String, default: '' },
    },
    schedule: {
      mode: { type: String, enum: ['now', 'scheduled', 'self'], default: 'now' },
      sendAt: { type: Date, default: null },
      timezone: { type: String, default: 'Asia/Kolkata' },
      /** Set when deferred invites + point credits have been delivered. */
      invitesSentAt: { type: Date, default: null },
      inviteClaimedAt: { type: Date, default: null },
      invitesUnresolved: { type: Boolean, default: false },
    },
    status: { type: String, enum: CAMPAIGN_STATUSES, default: 'draft' },
    draftState: {
      step: { type: Number, default: 0 },
      selectedWalletId: { type: String, default: '' },
      selRecips: [{ type: String }],
      recips: { type: Number, default: 0 },
      pay: { type: String, enum: ['wallet', 'upi', 'card'], default: 'wallet' },
      preview: { type: String, enum: ['landing', 'email'], default: 'landing' },
      when: { type: String, enum: ['now', 'scheduled', 'self'], default: 'now' },
    },
    launchLease: {
      owner: { type: String, default: '' },
      expiresAt: { type: Date, default: null },
      fence: { type: Number, default: 0 },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

campaignSchema.plugin(tenantScopePlugin);
campaignSchema.plugin(softDeletePlugin);
campaignSchema.index({ tenantId: 1, status: 1 });
campaignSchema.index({ tenantId: 1, entityId: 1 });

export const Campaign = mongoose.model('Campaign', campaignSchema);
