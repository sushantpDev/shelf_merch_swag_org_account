import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../../plugins/tenantScope.plugin.js';

/**
 * One Zoho People connection per ShelfMerch tenant (company).
 * Tokens are stored encrypted at rest (AES-256-GCM); never expose them to clients.
 */
const zohoIntegrationSchema = new mongoose.Schema(
  {
    /** ShelfMerch company / workspace — alias of tenantId from tenantScopePlugin. */
    connectedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    zohoOrganizationId: { type: String, default: '' },
    zohoOrganizationName: { type: String, default: '' },
    encryptedAccessToken: { type: String, default: '' },
    encryptedRefreshToken: { type: String, default: '' },
    accessTokenExpiresAt: { type: Date, default: null },
    apiDomain: { type: String, default: '' },
    zohoLocation: { type: String, default: '' },
    status: {
      type: String,
      enum: ['connected', 'expired', 'error', 'disconnected', 'needs_attention'],
      default: 'disconnected',
      index: true,
    },
    connectedAt: { type: Date, default: null },
    lastSyncedAt: { type: Date, default: null },
    lastError: { type: String, default: '' },
    /**
     * Remote grant state after disconnect.
     * revoked: Zoho confirmed revocation or the token was already invalid.
     * unresolved: local sync is stopped, but Zoho did not confirm revocation.
     * The refresh token stays encrypted for a later retry and is not used.
     */
    remoteAuthorization: {
      type: String,
      enum: ['', 'revoked', 'unresolved'],
      default: '',
    },
  },
  { timestamps: true },
);

zohoIntegrationSchema.plugin(tenantScopePlugin);

/** Exactly one integration document per company (tenant). Unique overrides plugin index. */
zohoIntegrationSchema.index({ tenantId: 1 }, { unique: true });

/** Safe JSON for API responses — never includes tokens. */
zohoIntegrationSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: String(this._id),
    companyId: String(this.tenantId),
    status: this.status,
    zohoOrganizationId: this.zohoOrganizationId || null,
    zohoOrganizationName: this.zohoOrganizationName || null,
    zohoLocation: this.zohoLocation || null,
    connectedAt: this.connectedAt,
    lastSyncedAt: this.lastSyncedAt,
    connectedByUserId: this.connectedByUserId ? String(this.connectedByUserId) : null,
    remoteAuthorization: this.remoteAuthorization || null,
    updatedAt: this.updatedAt,
  };
};

export const ZohoIntegration = mongoose.model('ZohoIntegration', zohoIntegrationSchema);

export const ZOHO_PUBLIC_STATUSES = {
  not_connected: 'not_connected',
  connected: 'connected',
  expired: 'expired',
  error: 'error',
  needs_attention: 'needs_attention',
};
