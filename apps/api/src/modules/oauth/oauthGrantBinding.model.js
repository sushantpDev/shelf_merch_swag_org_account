import mongoose from 'mongoose';

export const OAUTH_GRANT_ROLES = ['company_admin', 'entity_manager'];

const oauthGrantBindingSchema = new mongoose.Schema(
  {
    grantId: { type: String, required: true, unique: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    clientId: { type: String, required: true },
    resource: { type: String, required: true },
    scopes: { type: [String], required: true },
    sessionVersion: { type: Number, required: true },
  },
  {
    collection: 'oauth_grant_bindings',
    timestamps: { createdAt: true, updatedAt: false },
  },
);

const oauthConsentSubmissionSchema = new mongoose.Schema(
  {
    interactionId: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'oauth_consent_submissions' },
);

oauthConsentSubmissionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 600 });

export const OauthGrantBinding =
  mongoose.models.OauthGrantBinding ||
  mongoose.model('OauthGrantBinding', oauthGrantBindingSchema);

export const OauthConsentSubmission =
  mongoose.models.OauthConsentSubmission ||
  mongoose.model('OauthConsentSubmission', oauthConsentSubmissionSchema);
