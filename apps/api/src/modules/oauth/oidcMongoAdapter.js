import mongoose from 'mongoose';
import { errors } from 'oidc-provider';

/**
 * One collection for every oidc-provider model. The payload is the provider's
 * own document. Codes and refresh tokens are consumed with a conditional
 * update so a second replica cannot consume the same artifact.
 */
const COLLECTION = 'oidc_payloads';

let indexesReady;

function collection() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB is not connected');
  return db.collection(COLLECTION);
}

function ensureIndexes() {
  indexesReady ??= collection().createIndexes([
    { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    { key: { model: 1, id: 1 }, unique: true },
    { key: { model: 1, uid: 1 }, sparse: true },
    { key: { model: 1, userCode: 1 }, sparse: true },
    { key: { model: 1, grantId: 1 }, sparse: true },
  ]).catch((err) => {
    indexesReady = undefined;
    throw err;
  });
  return indexesReady;
}

function visibleQuery(id) {
  return {
    model: undefined,
    id,
    $or: [{ expiresAt: { $gt: new Date() } }, { expiresAt: { $exists: false } }],
  };
}

export class OidcMongoAdapter {
  constructor(name) {
    this.name = name;
  }

  async upsert(id, payload, expiresIn) {
    await ensureIndexes();
    const expiresAt = typeof expiresIn === 'number'
      ? new Date(Date.now() + expiresIn * 1000)
      : undefined;
    const $set = {
      model: this.name,
      id,
      payload,
      ...(payload?.uid ? { uid: payload.uid } : {}),
      ...(payload?.userCode ? { userCode: payload.userCode } : {}),
      ...(payload?.grantId ? { grantId: payload.grantId } : {}),
    };
    const update = expiresAt
      ? { $set: { ...$set, expiresAt } }
      : { $set, $unset: { expiresAt: '' } };
    await collection().updateOne({ model: this.name, id }, update, { upsert: true });
  }

  async find(id) {
    const doc = await collection().findOne({ ...visibleQuery(id), model: this.name });
    return doc?.payload;
  }

  async findByUid(uid) {
    const doc = await collection().findOne({
      model: this.name,
      uid,
      $or: [{ expiresAt: { $gt: new Date() } }, { expiresAt: { $exists: false } }],
    });
    return doc?.payload;
  }

  async findByUserCode(userCode) {
    const doc = await collection().findOne({
      model: this.name,
      userCode,
      $or: [{ expiresAt: { $gt: new Date() } }, { expiresAt: { $exists: false } }],
    });
    return doc?.payload;
  }

  async destroy(id) {
    await collection().deleteOne({ model: this.name, id });
  }

  /**
   * The provider checks `consumed` and then calls this. Two replicas can both
   * pass that check. The update matches only an unconsumed row, and the loser
   * throws invalid_grant before a second token is issued.
   */
  async consume(id) {
    const consumed = Math.floor(Date.now() / 1000);
    const result = await collection().findOneAndUpdate(
      { model: this.name, id, 'payload.consumed': { $exists: false } },
      { $set: { 'payload.consumed': consumed } },
      { returnDocument: 'after' },
    );
    const doc = result?.payload ? result : result?.value;
    if (!doc?.payload) {
      throw new errors.InvalidGrant('grant source already consumed');
    }
  }

  async revokeByGrantId(grantId) {
    await collection().deleteMany({ model: this.name, grantId });
  }
}
