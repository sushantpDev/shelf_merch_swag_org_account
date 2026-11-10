import mongoose from 'mongoose';

// §3.5 Idempotency — replayed keys return the cached response. 24h TTL.
const idempotencyKeySchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, default: null },
    method: String,
    path: String,
    statusCode: { type: Number, default: null },
    response: { type: Object, default: null },
    leaseExpiresAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now, expires: 86400 },
  },
  { versionKey: false },
);

idempotencyKeySchema.index({ key: 1, tenantId: 1, userId: 1 }, { unique: true });

export const IdempotencyKey = mongoose.model('IdempotencyKey', idempotencyKeySchema);
