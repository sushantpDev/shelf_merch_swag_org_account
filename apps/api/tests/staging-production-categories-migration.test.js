import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BSON, MongoClient, ObjectId } from 'mongodb';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildPlan, collectionBytes, createBackup, loadBackup, migrate, parseArgs,
  rollback, unresolvedReferences, validateCategories,
} from '../src/scripts/migrateStagingToProductionCategories.js';

const sha = (doc) => createHash('sha256').update(BSON.serialize(doc)).digest('hex');
const oid = () => new ObjectId();
function category(patch = {}) {
  const _id = oid();
  return { _id, parentId: null, depth: 0, sortOrder: 0, status: 'active', name: `Category ${_id}`, slug: `category-${_id}`, ...patch };
}
function approve(doc, action, extra = {}) {
  return { id: String(doc._id), action, expectedSha256: sha(doc), reason: 'Reviewed by operator', ...extra };
}

describe('category migration planning', () => {
  it('defaults to dry-run and lets explicit dry-run override confirmation, including rollback', () => {
    expect(parseArgs([]).dryRun).toBe(true);
    expect(parseArgs(['--confirm']).dryRun).toBe(false);
    expect(parseArgs(['--confirm', '--dry-run']).dryRun).toBe(true);
    expect(parseArgs(['--rollback', 'backup']).dryRun).toBe(true);
    expect(() => parseArgs(['--confirm-staging-to-production'])).toThrow('Unknown');
    expect(() => parseArgs(['--resolutions'])).toThrow('Missing');
    expect(() => parseArgs(['--rollback', 'backup', '--resolutions', 'file'])).toThrow('cannot');
  });

  it('projects 86 staging records plus five unrelated production records without changing inputs', () => {
    const staging = Array.from({ length: 86 }, (_, index) => category({ status: index < 48 ? 'active' : 'archived' }));
    const production = Array.from({ length: 5 }, () => category());
    const products = Array.from({ length: 179 }, (_, index) => ({ _id: oid(), categoryIds: [staging[index % 86]._id] }));
    const original = collectionBytes([...staging, ...production, ...products]);
    const plan = buildPlan(staging, production, products);
    expect(plan.report.readyToApply).toBe(true);
    expect(plan.inserts).toHaveLength(86);
    expect(plan.updates).toHaveLength(0);
    expect(plan.report.unresolvedReferencesBefore).toHaveLength(179);
    expect(plan.report.unresolvedReferences).toHaveLength(0);
    expect(plan.report.projectedFinalCounts).toMatchObject({ total: 91, active: 53, archived: 38 });
    expect(collectionBytes([...staging, ...production, ...products])).toEqual(original);
  });

  it('blocks shared ID field differences until explicitly approved, keeping extra production fields', () => {
    const production = category({ description: 'Keep me', custom: { value: 42 } });
    const staging = { ...production, status: 'archived', sortOrder: 6, description: 'Staging text' };
    const blocked = buildPlan([staging], [production], []);
    expect(blocked.report.readyToApply).toBe(false);
    expect(blocked.report.conflicts[0]).toMatchObject({ type: 'SHARED_ID_DIFFERENCES', resolved: false });
    const allowed = buildPlan([staging], [production], [], [approve(production, 'use-staging')]);
    expect(allowed.report.readyToApply).toBe(true);
    expect(allowed.projected[0]).toMatchObject({ status: 'archived', sortOrder: 6, description: 'Keep me', custom: { value: 42 } });
  });

  it('blocks root duplicates even when archived; accepts an explicit legacy rename/archive', () => {
    const legacy = category({ name: 'Apparel', slug: 'apparel' });
    const staging = category({ name: 'Apparel', slug: 'apparel' });
    expect(buildPlan([staging], [legacy], []).report.readyToApply).toBe(false);
    expect(buildPlan([staging], [{ ...legacy, status: 'archived' }], []).report.readyToApply).toBe(false);
    const resolution = approve(legacy, 'archive-legacy', { name: 'Apparel legacy', slug: 'apparel-legacy' });
    const plan = buildPlan([staging], [legacy], [{ _id: oid(), categoryIds: [legacy._id, staging._id] }], [resolution]);
    expect(plan.report.readyToApply).toBe(true);
    expect(plan.report.projectedFinalCounts).toMatchObject({ total: 2, active: 1, archived: 1, activeRoots: 1 });
    expect(plan.projected.find((row) => row._id.equals(legacy._id)).status).toBe('archived');
  });

  it('rejects stale, unknown, duplicate, and unused resolutions', () => {
    const production = category();
    const staging = { ...production, sortOrder: 1 };
    const stale = { ...approve(production, 'use-staging'), expectedSha256: '0'.repeat(64) };
    expect(buildPlan([staging], [production], [], [stale]).report.readyToApply).toBe(false);
    expect(buildPlan([production], [production], [], [approve(production, 'use-staging')]).report.readyToApply).toBe(false);
    const unknown = approve(category(), 'archive-legacy');
    expect(buildPlan([production], [production], [], [unknown]).report.readyToApply).toBe(false);
    expect(() => buildPlan([staging], [production], [], [stale, stale])).toThrow('duplicate');
  });

  it('detects missing parents, cycles, incorrect depths, duplicate IDs, and invalid statuses', () => {
    const first = category({ parentId: oid(), depth: 1 });
    expect(validateCategories([first]).map((row) => row.type)).toContain('MISSING_PARENT');
    const second = category({ parentId: first._id, depth: 2 });
    first.parentId = second._id;
    expect(validateCategories([first, second]).map((row) => row.type)).toContain('CIRCULAR_HIERARCHY');
    expect(validateCategories([category({ depth: 7 })]).map((row) => row.type)).toContain('INCORRECT_DEPTH');
    const bad = category({ status: 'deleted' });
    expect(validateCategories([bad, bad]).map((row) => row.type)).toEqual(expect.arrayContaining(['DUPLICATE_ID', 'INVALID_STATUS']));
  });

  it('checks sibling names/slugs case insensitively, allowing repeated labels in different parents', () => {
    const a = category(); const b = category();
    const child = category({ name: 'Others', slug: 'others', parentId: a._id, depth: 1 });
    const other = category({ name: ' others ', slug: 'OTHERS', parentId: a._id, depth: 1 });
    expect(validateCategories([a, b, child, other]).map((row) => row.type)).toEqual(expect.arrayContaining(['DUPLICATE_NAME', 'DUPLICATE_SLUG']));
    expect(validateCategories([a, b, child, { ...other, parentId: b._id }])).toHaveLength(0);
  });

  it('rejects broken references, malformed categoryIds, invalid source data, and empty sources', () => {
    const doc = category();
    const products = [{ _id: oid(), categoryIds: [doc._id, oid(), 'invalid', String(doc._id).toUpperCase()] }, { _id: oid(), categoryIds: 'bad' }];
    expect(unresolvedReferences(products, [doc])).toHaveLength(3);
    expect(buildPlan([doc], [], products).report.readyToApply).toBe(false);
    expect(buildPlan([{ ...doc, sortOrder: undefined }], [], []).report.readyToApply).toBe(false);
    expect(buildPlan([], [doc], []).report.readyToApply).toBe(false);
  });

  it('reports obsolete global unique indexes that would reject repeated child labels', () => {
    const a = category(); const b = category();
    const children = [a, b, category({ parentId: a._id, depth: 1, name: 'Others' }), category({ parentId: b._id, depth: 1, name: 'Others' })];
    const plan = buildPlan(children, [], [], [], [{ name: 'name_1', key: { name: 1 }, unique: true }]);
    expect(plan.report.readyToApply).toBe(false);
    expect(plan.report.validationIssues.map((row) => row.type)).toContain('UNIQUE_INDEX_COLLISION');
  });
});

describe('category migration transactions and durable rollback (isolated test replica set)', () => {
  let client; let backupRoot; let log;
  let source; let target;
  beforeAll(async () => {
    client = new MongoClient(process.env.MONGODB_TEST_URI);
    if (client.options.hosts.some((host) => !['127.0.0.1', 'localhost', '[::1]'].includes(host.host))) throw new Error('Migration tests require a local isolated replica set');
    await client.connect();
    source = client.db('shelfmerch_test'); target = client.db('shelfmerch');
    backupRoot = await mkdtemp(path.join(os.tmpdir(), 'shelfmerch-category-migration-'));
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  beforeEach(async () => {
    await source.dropDatabase(); await target.dropDatabase();
    await source.createCollection('categories'); await target.createCollection('categories');
    await target.collection('categories').createIndex({ parentId: 1, name: 1 }, { unique: true });
    await target.collection('categories').createIndex({ parentId: 1, slug: 1 }, { unique: true });
  });
  afterAll(async () => {
    if (client) { await source?.dropDatabase(); await target?.dropDatabase(); await client.close(); }
    if (backupRoot) await rm(backupRoot, { recursive: true, force: true });
    log?.mockRestore();
  });
  async function state(db, collection) {
    const docs = await db.collection(collection).find({}, { raw: true }).toArray();
    return Buffer.concat(docs.sort(Buffer.compare));
  }
  async function fixture() {
    const root = category({ name: 'Apparel', slug: 'apparel' });
    const legacy = category({ name: 'Apparel', slug: 'apparel', createdAt: new Date('2020-01-01'), number: new BSON.Double(5), extra: { keep: true } });
    const child = category({ parentId: root._id, depth: 1, status: 'archived' });
    await source.collection('categories').insertMany([root, child]);
    await target.collection('categories').insertOne(legacy);
    await target.collection('catalogproducts').insertMany([{ _id: oid(), categoryIds: [child._id] }, { _id: oid(), categoryIds: [legacy._id] }]);
    await target.collection('unrelated').insertOne({ untouched: true });
    return { root, legacy, child, resolutions: [approve(legacy, 'archive-legacy', { name: 'Apparel legacy', slug: 'apparel-legacy' })] };
  }

  it('dry-run and explicit dry-run plus confirm issue zero write commands and create no backup', async () => {
    await fixture();
    const monitored = new MongoClient(process.env.MONGODB_TEST_URI, { monitorCommands: true });
    await monitored.connect();
    const writes = [];
    monitored.on('commandStarted', (event) => {
      if (['insert', 'update', 'delete', 'create', 'createIndexes', 'drop', 'dropDatabase', 'findAndModify', 'bulkWrite'].includes(event.commandName)) writes.push(event);
    });
    try {
      expect((await migrate(monitored)).applied).toBe(false);
      expect((await migrate(monitored, { confirm: true, dryRun: true })).applied).toBe(false);
      expect(writes).toHaveLength(0);
    } finally { await monitored.close(); }
  });

  it('blocks confirmation before backup/writes when conflicts or broken references remain', async () => {
    await fixture();
    const before = await state(target, 'categories');
    await expect(migrate(client, { confirm: true, backupDir: backupRoot })).rejects.toThrow('Confirmation refused');
    expect(await state(target, 'categories')).toEqual(before);
  });

  it('migrates approved legacy conflicts, preserves statuses/products, then restores exact BSON', async () => {
    const { root, legacy, child, resolutions } = await fixture();
    const before = await state(target, 'categories');
    const products = await state(target, 'catalogproducts');
    const unrelated = await state(target, 'unrelated');
    const staging = await state(source, 'categories');
    const result = await migrate(client, { confirm: true, backupDir: backupRoot, resolutions });
    expect(result.applied).toBe(true);
    const rows = await target.collection('categories').find().toArray();
    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row._id.equals(root._id)).status).toBe('active');
    expect(rows.find((row) => row._id.equals(child._id)).status).toBe('archived');
    expect(rows.find((row) => row._id.equals(legacy._id))).toMatchObject({ name: 'Apparel legacy', status: 'archived', extra: { keep: true } });
    expect(await state(target, 'catalogproducts')).toEqual(products);
    expect(await state(target, 'unrelated')).toEqual(unrelated);
    expect(await state(source, 'categories')).toEqual(staging);
    const after = await state(target, 'categories');
    expect((await rollback(client, result.backupDirectory)).applied).toBe(false);
    expect(await state(target, 'categories')).toEqual(after);
    expect((await rollback(client, result.backupDirectory, { confirm: true })).applied).toBe(true);
    expect(await state(target, 'categories')).toEqual(before);
    expect(await state(target, 'catalogproducts')).toEqual(products);
    expect((await rollback(client, result.backupDirectory, { confirm: true })).applied).toBe(false);
  });

  it('applies a reviewed shared-ID parent move, writing only production categories', async () => {
    const parent = category({ name: 'Accessories', slug: 'accessories' });
    const original = category({ name: 'Bags', slug: 'bags', custom: 'Production field' });
    const moved = { ...original, parentId: parent._id, depth: 1, status: 'archived', sortOrder: 4, custom: 'Staging field' };
    await source.collection('categories').insertMany([parent, moved]);
    await target.collection('categories').insertOne(original);
    await target.collection('catalogproducts').insertOne({ _id: oid(), categoryIds: [original._id, parent._id] });
    const before = await state(target, 'categories');
    const monitored = new MongoClient(process.env.MONGODB_TEST_URI, { monitorCommands: true });
    await monitored.connect();
    const writes = [];
    monitored.on('commandStarted', (event) => {
      if (['insert', 'update', 'delete', 'create', 'createIndexes', 'drop', 'dropDatabase', 'findAndModify', 'bulkWrite'].includes(event.commandName)) {
        writes.push({ db: event.databaseName, collection: event.command[event.commandName] });
      }
    });
    try {
      const result = await migrate(monitored, { confirm: true, backupDir: backupRoot, resolutions: [approve(original, 'use-staging')] });
      expect(result.applied).toBe(true);
      expect(await target.collection('categories').findOne({ _id: original._id })).toMatchObject({ parentId: parent._id, depth: 1, status: 'archived', sortOrder: 4, custom: 'Production field' });
      await rollback(monitored, result.backupDirectory, { confirm: true });
      expect(await state(target, 'categories')).toEqual(before);
      expect(writes.length).toBeGreaterThan(0);
      expect(writes.every((row) => row.db === 'shelfmerch' && row.collection === 'categories')).toBe(true);
    } finally { await monitored.close(); }
  });

  it('is idempotent and refuses rollback after a later category edit', async () => {
    const original = category(); const addition = category({ status: 'archived' });
    await source.collection('categories').insertMany([original, addition]);
    await target.collection('categories').insertOne(original);
    const result = await migrate(client, { confirm: true, backupDir: backupRoot });
    expect((await migrate(client, { confirm: true, backupDir: backupRoot })).applied).toBe(false);
    await target.collection('categories').updateOne({ _id: original._id }, { $set: { description: 'Later edit' } });
    await expect(rollback(client, result.backupDirectory, { confirm: true })).rejects.toThrow('later edits');
    expect(await target.collection('categories').countDocuments()).toBe(2);
  });

  it('aborts the whole transaction on a database validator error after backup', async () => {
    const original = category(); const addition = category({ name: 'Rejected' });
    await source.collection('categories').insertMany([{ ...original, sortOrder: 1 }, addition]);
    await target.collection('categories').insertOne(original);
    await target.command({ collMod: 'categories', validator: { name: { $ne: 'Rejected' } }, validationLevel: 'strict' });
    const before = await state(target, 'categories');
    await expect(migrate(client, { confirm: true, backupDir: backupRoot, resolutions: [approve(original, 'use-staging')] })).rejects.toThrow();
    expect(await state(target, 'categories')).toEqual(before);
  });

  it('refuses rollback when the backup cluster identity or production indexes differ', async () => {
    const original = category(); const addition = category();
    await source.collection('categories').insertMany([original, addition]);
    await target.collection('categories').insertOne(original);
    const result = await migrate(client, { confirm: true, backupDir: backupRoot });
    const manifestFile = path.join(result.backupDirectory, 'manifest.json');
    const manifestText = await readFile(manifestFile, 'utf8');
    const manifest = JSON.parse(manifestText);
    manifest.clusterSha256 = '0'.repeat(64);
    await writeFile(manifestFile, JSON.stringify(manifest));
    await expect(rollback(client, result.backupDirectory, { confirm: true })).rejects.toThrow('different cluster');
    await writeFile(manifestFile, manifestText);
    await target.collection('categories').createIndex({ status: 1 });
    await expect(rollback(client, result.backupDirectory, { confirm: true })).rejects.toThrow('indexes changed');
    expect(await target.collection('categories').countDocuments()).toBe(2);
  });

  it('aborts before any category writes when backup cannot be created', async () => {
    const original = category(); const addition = category();
    await source.collection('categories').insertMany([original, addition]);
    await target.collection('categories').insertOne(original);
    const filename = path.join(backupRoot, 'not-a-directory');
    await writeFile(filename, 'occupied');
    const before = await state(target, 'categories');
    await expect(migrate(client, { confirm: true, backupDir: filename })).rejects.toThrow();
    expect(await state(target, 'categories')).toEqual(before);
  });

  it('detects corrupted backup bytes and wrong backup database metadata', async () => {
    const metadata = { expectedAfterSha256: '0'.repeat(64), clusterSha256: '1'.repeat(64), indexSha256: '2'.repeat(64) };
    const directory = await createBackup(backupRoot, [category()], metadata);
    const file = path.join(directory, 'categories.bson');
    const bytes = await readFile(file); bytes[bytes.length - 2] ^= 1;
    await writeFile(file, bytes);
    await expect(loadBackup(directory)).rejects.toThrow('checksum');
    const other = await createBackup(backupRoot, [category()], metadata);
    const manifestFile = path.join(other, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
    manifest.database = 'shelfmerch_test';
    await writeFile(manifestFile, JSON.stringify(manifest));
    await expect(loadBackup(other)).rejects.toThrow('metadata');
  });
});
