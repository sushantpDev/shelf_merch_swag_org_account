/**
 * One-time category migration. Run from any directory; defaults to DRY RUN.
 *
 * node apps/api/src/scripts/migrateStagingToProductionCategories.js --dry-run
 * node apps/api/src/scripts/migrateStagingToProductionCategories.js --confirm --resolutions resolutions.json
 * node apps/api/src/scripts/migrateStagingToProductionCategories.js --rollback BACKUP_DIRECTORY --dry-run
 * node apps/api/src/scripts/migrateStagingToProductionCategories.js --rollback BACKUP_DIRECTORY --confirm
 *
 * MONGO_URL (or MONGODB_URI) supplies ONE cluster. Database targets are fixed.
 * Stop category/product editing during apply/rollback. Transactions require a
 * replica set or mongos; there is deliberately no nontransactional fallback.
 * Backups default to apps/api/uploads/migration-backups (gitignored). Copy the
 * printed backup directory to durable storage before retiring this machine.
 * Only production.categories is ever written. No models/hooks are imported.
 *
 * Conflicts are BLOCKED by default. Supply a JSON file of this form, using
 * productionSha256 values printed in the report (not staging fingerprints):
 * { "resolutions": [
 *   { "id": "24-hex-id", "action": "use-staging", "expectedSha256": "...",
 *     "reason": "Reviewed: same category, staging hierarchy is authoritative" },
 *   { "id": "different-legacy-id", "action": "archive-legacy",
 *     "expectedSha256": "...", "name": "Apparel (legacy 24-hex-id)",
 *     "slug": "apparel-legacy-24-hex-id", "reason": "Retain legacy ID, retire duplicate root" }
 * ] }
 * use-staging approves required-field changes on a shared ID. All other
 * production fields survive. archive-legacy explicitly renames/archives a
 * production-only record; its ID, parent, and descendants are retained. It
 * cannot alter staging statuses. Renaming is needed because unique indexes
 * apply to archived categories too. Unknown/stale/unused resolutions abort.
 *
 * Backup: concatenated raw BSON documents + checksummed manifest. Rollback
 * restores every original field and BSON type, including old broken links.
 * It intentionally does not demand healthy references in the ORIGINAL data.
 * Rollback refuses later category changes or a different cluster/index set.
 */
import { BSON, MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_DB = 'shelfmerch_test';
const TARGET_DB = 'shelfmerch';
const COLLECTION = 'categories';
const FIELDS = ['parentId', 'depth', 'sortOrder', 'status', 'name', 'slug'];
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DECODE = { promoteValues: false, promoteLongs: false, bsonRegExp: true };
const TX_OPTIONS = { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, readPreference: 'primary' };
const sha = (data) => createHash('sha256').update(data).digest('hex');
const rawDocuments = new WeakMap();
const encoded = (doc) => rawDocuments.get(doc) ?? BSON.serialize(doc);
const id = (value) => value?.toHexString?.() ?? String(value);
const isId = (value) => value?._bsontype === 'ObjectId';
const normalized = (value) => String(value ?? '').trim().toLowerCase();
const sameValue = (a, b) => encoded({ value: a }).equals(encoded({ value: b }));
const docSha = (doc) => sha(encoded(doc));
const sorted = (docs) => [...docs].sort((a, b) => id(a._id).localeCompare(id(b._id)));
export const collectionBytes = (docs) => Buffer.concat(sorted(docs).map(encoded));
const collectionSha = (docs) => sha(collectionBytes(docs));

export function parseArgs(args) {
  const options = { confirm: false, dryRun: true };
  let explicitDryRun = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--confirm') options.confirm = true;
    else if (arg === '--dry-run') explicitDryRun = true;
    else if (arg === '--help') options.help = true;
    else if (['--rollback', '--backup-dir', '--resolutions'].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      const key = { '--rollback': 'rollback', '--backup-dir': 'backupDir', '--resolutions': 'resolutionsFile' }[arg];
      if (options[key]) throw new Error(`Repeated option ${arg}`);
      options[key] = path.resolve(value);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.rollback && options.resolutionsFile) throw new Error('--rollback cannot use --resolutions');
  options.dryRun = explicitDryRun || !options.confirm;
  return options;
}

function summary(doc) {
  return { _id: doc._id, ...Object.fromEntries(FIELDS.map((field) => [field, doc[field]])), productionSha256: docSha(doc) };
}

export function validateCategories(docs, scope = 'projected') {
  const issues = [];
  const byId = new Map();
  const names = new Map();
  const slugs = new Map();
  const issue = (type, details) => issues.push({ scope, type, ...details });
  for (const doc of docs) {
    const key = id(doc._id);
    if (!isId(doc._id)) issue('INVALID_ID', { id: key });
    if (byId.has(key)) issue('DUPLICATE_ID', { id: key });
    byId.set(key, doc);
    if (!Object.hasOwn(doc, 'parentId') || (doc.parentId !== null && !isId(doc.parentId))) issue('INVALID_PARENT_ID', { id: key });
    if (!['active', 'archived'].includes(doc.status)) issue('INVALID_STATUS', { id: key, status: doc.status });
    for (const field of ['name', 'slug']) {
      if (typeof doc[field] !== 'string' || !doc[field].trim()) issue('INVALID_TEXT', { id: key, field });
      const values = field === 'name' ? names : slugs;
      const identity = JSON.stringify([doc.parentId == null ? null : id(doc.parentId), normalized(doc[field])]);
      if (values.has(identity)) issue(`DUPLICATE_${field.toUpperCase()}`, { ids: [values.get(identity), key], parentId: doc.parentId, value: doc[field] });
      else values.set(identity, key);
    }
    for (const field of ['depth', 'sortOrder']) {
      const value = doc[field]?.valueOf();
      if (!Number.isInteger(value) || value < 0) issue('INVALID_NUMBER', { id: key, field });
    }
  }
  const depths = new Map();
  for (const doc of docs) {
    const chain = [];
    const visiting = new Set();
    let current = doc;
    let base = -1;
    let valid = true;
    while (current) {
      const key = id(current._id);
      if (depths.has(key)) { base = depths.get(key); break; }
      if (visiting.has(key)) {
        issue('CIRCULAR_HIERARCHY', { ids: [...visiting, key] }); valid = false; break;
      }
      visiting.add(key);
      chain.push(current);
      if (current.parentId == null) break;
      const parent = byId.get(id(current.parentId));
      if (!parent) {
        issue('MISSING_PARENT', { id: key, parentId: id(current.parentId) }); valid = false; break;
      }
      current = parent;
    }
    if (!valid) continue;
    for (const row of chain.reverse()) {
      base += 1;
      depths.set(id(row._id), base);
      if (Number(row.depth) !== base) issue('INCORRECT_DEPTH', { id: id(row._id), expected: base, actual: row.depth });
    }
  }
  return issues;
}

export function unresolvedReferences(products, categories) {
  const available = new Set(categories.map((doc) => id(doc._id)));
  const broken = [];
  for (const product of products) {
    if (product.categoryIds == null) continue;
    if (!Array.isArray(product.categoryIds)) {
      broken.push({ productId: id(product._id), type: 'INVALID_CATEGORY_IDS' }); continue;
    }
    for (const value of product.categoryIds) {
      const key = id(value);
      if (!isId(value) && !(typeof value === 'string' && /^[a-f\d]{24}$/i.test(value))) {
        broken.push({ productId: id(product._id), categoryId: key, type: 'INVALID_CATEGORY_REFERENCE' });
      } else if (!available.has(key.toLowerCase())) {
        broken.push({ productId: id(product._id), categoryId: key, type: 'MISSING_CATEGORY_REFERENCE' });
      }
    }
  }
  return broken;
}

function counts(docs) {
  return {
    total: docs.length,
    active: docs.filter((doc) => doc.status === 'active').length,
    archived: docs.filter((doc) => doc.status === 'archived').length,
    activeRoots: docs.filter((doc) => doc.status === 'active' && doc.parentId == null).length,
  };
}

// Conservative preflight for actual server indexes, including obsolete global
// name/slug uniqueness. Unsupported unique indexes are blocked for review.
function indexConflicts(docs, indexes) {
  const conflicts = [];
  for (const index of indexes.filter((row) => row.unique || row.name === '_id_')) {
    if (index.partialFilterExpression || index.sparse || (index.collation && index.collation.locale !== 'simple') ||
        Object.keys(index.key).some((key) => !['_id', ...FIELDS].includes(key))) {
      conflicts.push({ type: 'UNSUPPORTED_UNIQUE_INDEX', index }); continue;
    }
    const seen = new Map();
    for (const doc of docs) {
      const values = Object.keys(index.key).map((key) => doc[key] ?? null);
      const key = BSON.EJSON.stringify(values, { relaxed: true });
      if (seen.has(key)) conflicts.push({ type: 'UNIQUE_INDEX_COLLISION', index: index.name, ids: [seen.get(key), id(doc._id)] });
      else seen.set(key, id(doc._id));
    }
  }
  return conflicts;
}

export function buildPlan(staging, production, products, resolutions = [], indexes = []) {
  const conflicts = [];
  const approvals = new Map();
  const used = new Set();
  if (!Array.isArray(resolutions)) throw new Error('resolutions must be an array');
  for (const row of resolutions) {
    if (!row || !/^[a-f\d]{24}$/.test(row.id ?? '') || approvals.has(row.id) ||
        !['use-staging', 'archive-legacy'].includes(row.action) ||
        !/^[a-f\d]{64}$/.test(row.expectedSha256 ?? '') || typeof row.reason !== 'string' || !row.reason.trim()) {
      throw new Error('Invalid/duplicate resolution: require lowercase id, action, expectedSha256 and reason');
    }
    approvals.set(row.id, row);
  }
  const byId = new Map(production.map((doc) => [id(doc._id), doc]));
  const stagedIds = new Set(staging.map((doc) => id(doc._id)));
  const projected = new Map(byId);
  const inserts = [];
  const updates = [];
  const approve = (doc, action) => {
    const row = approvals.get(id(doc._id));
    if (!row || row.action !== action || row.expectedSha256 !== docSha(doc)) return null;
    used.add(row.id);
    return row;
  };
  for (const source of staging) {
    const key = id(source._id);
    const existing = byId.get(key);
    if (!existing) { inserts.push(source); projected.set(key, source); continue; }
    const changed = FIELDS.filter((field) => !sameValue(existing[field], source[field]));
    if (!changed.length) continue;
    const resolution = approve(existing, 'use-staging');
    conflicts.push({ type: 'SHARED_ID_DIFFERENCES', id: key, production: summary(existing), staging: summary(source), fields: changed, resolved: Boolean(resolution) });
    if (!resolution) continue;
    const after = { ...existing, ...Object.fromEntries(FIELDS.map((field) => [field, source[field]])) };
    updates.push({ before: existing, after, reason: resolution.reason });
    projected.set(key, after);
  }
  for (const existing of production) {
    const key = id(existing._id);
    if (stagedIds.has(key) || !approvals.has(key)) continue;
    const resolution = approve(existing, 'archive-legacy');
    if (!resolution || typeof resolution.name !== 'string' || !resolution.name.trim() ||
        typeof resolution.slug !== 'string' || !resolution.slug.trim() ||
        resolution.name !== resolution.name.trim() || resolution.slug !== normalized(resolution.slug)) {
      conflicts.push({ type: 'INVALID_LEGACY_RESOLUTION', id: key, resolved: false }); continue;
    }
    const after = { ...existing, name: resolution.name, slug: resolution.slug, status: 'archived' };
    updates.push({ before: existing, after, reason: resolution.reason });
    projected.set(key, after);
    conflicts.push({ type: 'LEGACY_ARCHIVED_AND_RENAMED', id: key, production: summary(existing), resolved: true, reason: resolution.reason });
  }
  for (const [key] of approvals) {
    if (!used.has(key)) conflicts.push({ type: 'UNUSED_OR_STALE_RESOLUTION', id: key, resolved: false });
  }
  const final = [...projected.values()];
  const issues = [...validateCategories(staging, 'staging'), ...validateCategories(final), ...indexConflicts(final, indexes)];
  const missing = unresolvedReferences(products, final);
  const report = {
    source: `${SOURCE_DB}.${COLLECTION}`, destination: `${TARGET_DB}.${COLLECTION}`,
    sourceCounts: counts(staging), productionCounts: counts(production), productCount: products.length,
    productionRecords: production.map(summary),
    inserts: inserts.map(summary),
    updates: updates.map(({ before, after, reason }) => ({ id: id(before._id), reason, before: summary(before), after: summary(after) })),
    unchangedProductionIds: production.filter((doc) => !updates.some((row) => id(row.before._id) === id(doc._id))).map((doc) => id(doc._id)),
    conflicts, validationIssues: issues, indexes,
    unresolvedReferencesBefore: unresolvedReferences(products, production), unresolvedReferences: missing,
    projectedFinalCounts: counts(final),
    readyToApply: staging.length > 0 && !conflicts.some((row) => !row.resolved) && !issues.length && !missing.length,
  };
  if (!staging.length) report.validationIssues.push({ type: 'EMPTY_SOURCE' });
  return { report, inserts, updates, projected: final };
}

function assertScope(client) {
  const source = client.db(SOURCE_DB);
  const target = client.db(TARGET_DB);
  if (source.databaseName !== SOURCE_DB || target.databaseName !== TARGET_DB || source.databaseName === target.databaseName) throw new Error('Database scope verification failed');
  const categories = target.collection(COLLECTION);
  if (categories.dbName !== TARGET_DB || categories.collectionName !== COLLECTION) throw new Error('Collection scope verification failed');
  return { source, target, categories };
}

function clusterSha(client) {
  const hosts = client.options.srvHost ?? client.options.hosts.map((host) => host.toString()).sort().join(',');
  return sha(hosts.toLowerCase());
}

async function readDocuments(collection, session) {
  // raw BSON prevents numeric promotion from losing original BSON types.
  const buffers = await collection.find({}, { raw: true, session }).toArray();
  return buffers.map(decodeDocument);
}

function decodeDocument(buffer) {
  const document = BSON.deserialize(buffer, DECODE);
  rawDocuments.set(document, buffer);
  return document;
}

function indexSha(indexes) {
  return sha(BSON.EJSON.stringify([...indexes].sort((a, b) => a.name.localeCompare(b.name)), { relaxed: false }));
}

async function readIndexes(collection, session) {
  return collection.listIndexes({ session }).toArray();
}

async function durableFile(filename, bytes) {
  const handle = await open(filename, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}

export async function createBackup(root, documents, metadata) {
  await mkdir(root, { recursive: true });
  const directory = path.join(root, `categories-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`);
  await mkdir(directory, { mode: 0o700 });
  const bytes = collectionBytes(documents);
  const manifest = { ...metadata, format: 'shelfmerch-categories-bson-v1', database: TARGET_DB, collection: COLLECTION, sourceDatabase: SOURCE_DB, createdAt: new Date().toISOString(), count: documents.length, sha256: sha(bytes) };
  await durableFile(path.join(directory, 'categories.bson'), bytes);
  await durableFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
  // Persist directory entries on platforms supporting directory fsync.
  if (process.platform !== 'win32') {
    for (const folder of [directory, root]) {
      const handle = await open(folder, 'r');
      try { await handle.sync(); } finally { await handle.close(); }
    }
  }
  const checked = await loadBackup(directory);
  if (checked.manifest.sha256 !== manifest.sha256) throw new Error('Backup read-back verification failed');
  return directory;
}

export async function loadBackup(directory) {
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  const bytes = await readFile(path.join(directory, 'categories.bson'));
  if (manifest.format !== 'shelfmerch-categories-bson-v1' || manifest.database !== TARGET_DB ||
      manifest.collection !== COLLECTION || manifest.sourceDatabase !== SOURCE_DB || sha(bytes) !== manifest.sha256 ||
      !/^[a-f\d]{64}$/.test(manifest.expectedAfterSha256 ?? '') || !/^[a-f\d]{64}$/.test(manifest.clusterSha256 ?? '') ||
      !/^[a-f\d]{64}$/.test(manifest.indexSha256 ?? '')) throw new Error('Invalid backup metadata or checksum');
  const documents = [];
  for (let offset = 0; offset < bytes.length;) {
    if (offset + 4 > bytes.length) throw new Error('Truncated backup BSON');
    const size = bytes.readInt32LE(offset);
    if (size < 5 || offset + size > bytes.length) throw new Error('Invalid backup BSON length');
    documents.push(decodeDocument(bytes.subarray(offset, offset + size)));
    offset += size;
  }
  if (documents.length !== manifest.count || collectionSha(documents) !== manifest.sha256) throw new Error('Backup document count/content mismatch');
  return { manifest, documents };
}

const print = (value) => console.log(BSON.EJSON.stringify(value, { relaxed: true }, 2));

async function transaction(client, action) {
  const session = client.startSession();
  try {
    session.startTransaction(TX_OPTIONS);
    const result = await action(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction().catch(() => {});
    throw error;
  } finally { await session.endSession(); }
}

export async function migrate(client, options = {}) {
  const { source, target, categories } = assertScope(client);
  const staging = await readDocuments(source.collection(COLLECTION));
  const resolutions = options.resolutions ?? [];
  const production = await readDocuments(categories);
  const products = await readDocuments(target.collection('catalogproducts'));
  const indexes = await readIndexes(categories);
  const plan = buildPlan(staging, production, products, resolutions, indexes);
  print({ mode: options.confirm && !options.dryRun ? 'apply' : 'dry-run', ...plan.report });
  if (!options.confirm || options.dryRun) return { ...plan, applied: false };
  if (!plan.report.readyToApply) throw new Error('Confirmation refused: unresolved conflicts, invalid hierarchy, or broken product references');
  if (!plan.inserts.length && !plan.updates.length) {
    console.log('Already synchronized. No writes needed.'); return { ...plan, applied: false };
  }
  let backupDirectory;
  await transaction(client, async (session) => {
    assertScope(client);
    const before = await readDocuments(categories, session);
    const currentProducts = await readDocuments(target.collection('catalogproducts'), session);
    // MongoDB does not allow listIndexes inside a transaction.
    const currentIndexes = await readIndexes(categories);
    if (collectionSha(before) !== collectionSha(production) || collectionSha(currentProducts) !== collectionSha(products) || indexSha(currentIndexes) !== indexSha(indexes)) {
      throw new Error('Production changed after planning; rerun dry-run');
    }
    // The snapshot used by writes is exactly the snapshot saved to disk.
    backupDirectory = await createBackup(options.backupDir ?? path.resolve(HERE, '../../uploads/migration-backups'), before, {
      clusterSha256: clusterSha(client), indexSha256: indexSha(indexes), expectedAfterSha256: collectionSha(plan.projected),
    });
    console.log(`Durable, verified backup: ${backupDirectory}`);
    // Free unique name/slug keys for parent moves and approved legacy renames.
    // Intermediate values are invisible outside the transaction.
    const prefix = `__category_migration_${randomUUID()}_`;
    for (const row of plan.updates) {
      const temporary = `${prefix}${id(row.before._id)}`;
      await categories.updateOne({ _id: row.before._id }, { $set: { name: temporary, slug: temporary } }, { session });
    }
    for (const row of plan.updates) {
      const result = await categories.replaceOne({ _id: row.before._id }, row.after, { session });
      if (result.matchedCount !== 1) throw new Error('Production category disappeared during update');
    }
    if (plan.inserts.length) await categories.insertMany(plan.inserts, { session, ordered: true });
    const after = await readDocuments(categories, session);
    const afterProducts = await readDocuments(target.collection('catalogproducts'), session);
    if (collectionSha(after) !== collectionSha(plan.projected) || unresolvedReferences(afterProducts, after).length ||
        validateCategories(after).length || collectionSha(afterProducts) !== collectionSha(products)) {
      throw new Error('Post-write verification failed; transaction will be aborted');
    }
  });
  console.log(`Migration committed. Backup/rollback directory: ${backupDirectory}`);
  return { ...plan, applied: true, backupDirectory };
}

export async function rollback(client, directory, options = {}) {
  const { target, categories } = assertScope(client);
  const { manifest, documents } = await loadBackup(directory);
  if (manifest.clusterSha256 !== clusterSha(client)) throw new Error('Backup belongs to a different cluster');
  const current = await readDocuments(categories);
  const indexes = await readIndexes(categories);
  if (manifest.indexSha256 !== indexSha(indexes)) throw new Error('Category indexes changed since backup; rollback refused');
  const currentSha = collectionSha(current);
  if (![manifest.sha256, manifest.expectedAfterSha256].includes(currentSha)) throw new Error('Categories changed after migration; rollback would discard later edits and is refused');
  const products = await readDocuments(target.collection('catalogproducts'));
  print({ mode: options.confirm && !options.dryRun ? 'rollback' : 'rollback-dry-run', backup: directory,
    currentCounts: counts(current), restoredCounts: counts(documents),
    wouldRemoveIds: current.filter((doc) => !documents.some((old) => id(old._id) === id(doc._id))).map((doc) => id(doc._id)),
    restoredDocuments: documents.map(summary),
    referencesAfterRestore: unresolvedReferences(products, documents),
    note: 'Exact restore intentionally restores the original category state, including original broken references.' });
  if (!options.confirm || options.dryRun) return { applied: false };
  if (currentSha === manifest.sha256) { console.log('Original category collection is already restored.'); return { applied: false }; }
  await transaction(client, async (session) => {
    assertScope(client);
    const before = await readDocuments(categories, session);
    const beforeProducts = await readDocuments(target.collection('catalogproducts'), session);
    if (collectionSha(before) !== currentSha || collectionSha(beforeProducts) !== collectionSha(products) ||
        indexSha(await readIndexes(categories)) !== manifest.indexSha256) throw new Error('Production changed after rollback planning');
    // Only rollback deletes categories; never drops the collection/indexes.
    await categories.deleteMany({}, { session });
    if (documents.length) await categories.insertMany(documents, { session, ordered: true });
    if (collectionSha(await readDocuments(categories, session)) !== manifest.sha256 ||
        collectionSha(await readDocuments(target.collection('catalogproducts'), session)) !== collectionSha(products)) {
      throw new Error('Exact rollback verification failed; transaction will be aborted');
    }
  });
  console.log('Rollback committed. Original categories restored exactly; catalog products unchanged.');
  return { applied: true };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Default: --dry-run. Apply: --confirm [--resolutions FILE] [--backup-dir DIRECTORY]. Restore: --rollback BACKUP_DIRECTORY [--confirm]. --dry-run always overrides --confirm. Uses MONGO_URL or MONGODB_URI; only shelfmerch.categories can be written.');
    return;
  }
  dotenv.config({ path: path.resolve(HERE, '../../.env'), quiet: true });
  dotenv.config({ path: path.resolve(HERE, '../../../../.env'), quiet: true });
  const uri = process.env.MONGO_URL || process.env.MONGODB_URI;
  if (!uri) throw new Error('Missing MONGO_URL or MONGODB_URI');
  if (options.resolutionsFile) {
    const input = JSON.parse(await readFile(options.resolutionsFile, 'utf8'));
    if (!Array.isArray(input.resolutions)) throw new Error('Resolution file must contain a resolutions array');
    options.resolutions = input.resolutions;
  }
  // URI database is deliberately ignored; both names are explicit and checked.
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000, readPreference: 'primary', readConcern: { level: 'majority' }, retryWrites: false });
  try {
    await client.connect();
    const { source, target } = assertScope(client);
    await source.command({ ping: 1 });
    await target.command({ ping: 1 });
    console.log(`Verified database targets: ${SOURCE_DB} -> ${TARGET_DB}; writes limited to ${TARGET_DB}.${COLLECTION}`);
    if (options.rollback) await rollback(client, options.rollback, options);
    else await migrate(client, options);
  } finally { await client.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // Do not log connection strings, credentials, or raw server error objects.
    const message = String(error.message).replace(/mongodb(?:\+srv)?:\/\/[^\s'"\)]+/gi, 'mongodb://[redacted]');
    console.error(`Category migration failed: ${message}`);
    console.error('Any uncommitted category writes were aborted. If commit outcome is uncertain, rerun dry-run and inspect the printed backup directory.');
    process.exitCode = 1;
  });
}
