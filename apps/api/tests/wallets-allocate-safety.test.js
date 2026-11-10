import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';
import { WalletTransaction } from '../src/modules/wallets/walletTransaction.model.js';
import { Entity } from '../src/modules/entities/entity.model.js';
import { allocate, allocationLedgerKey } from '../src/modules/wallets/wallets.service.js';
import { allocate as allocateHttp } from '../src/modules/wallets/wallets.controller.js';
import { makeEntity, makeFundedWallet, makeTenant, makeUser } from './helpers.js';

let tenant;
let admin;
let wallet;
let marketing;
let sales;

beforeAll(connectTestDb);
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  tenant = await makeTenant({ slug: 'allocate-safety' });
  admin = await makeUser(tenant, 'company_admin', 'tenant');
  wallet = await makeFundedWallet(tenant, { name: 'Operating', amount: 1_000 });
  marketing = await makeEntity(tenant, wallet, 'Marketing');
  sales = await makeEntity(tenant, wallet, 'Sales');
});

function request(lines, key) {
  const res = {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  const req = {
    tenantId: tenant._id,
    params: { id: String(wallet._id) },
    user: { userId: admin.user._id },
    body: { allocations: lines.map((line) => ({ entityId: String(line.entityId), amount: line.amount })) },
    get(name) {
      return name.toLowerCase() === 'idempotency-key' ? key : undefined;
    },
  };
  return allocateHttp(req, res).then(() => res);
}

describe('shared allocation safety', () => {
  it('keeps one multi-line batch when the same idempotency key is applied twice', async () => {
    const lines = [
      { entityId: marketing._id, amount: 300 },
      { entityId: sales._id, amount: 200 },
    ];
    const first = await request(lines, 'batch-crash-1');
    const second = await request(lines, 'batch-crash-1');
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    const saved = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    expect(saved.allocatedAmount).toBe(500);
    expect(saved.balance).toBe(1_000);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'allocation_to_entity' })).toBe(2);
    expect((await Entity.findOne({ _id: marketing._id, tenantId: tenant._id })).allocatedAmount).toBe(300);
    expect((await Entity.findOne({ _id: sales._id, tenantId: tenant._id })).allocatedAmount).toBe(200);
    const storedKey = allocationLedgerKey(wallet._id, marketing._id, 'batch-crash-1');
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, idempotencyKey: storedKey })).toBe(1);
  });

  it('lets only one overlapping multi-line batch commit', async () => {
    const lines = [
      { entityId: marketing._id, amount: 600, idempotencyKey: allocationLedgerKey(wallet._id, marketing._id, 'race-a') },
      { entityId: sales._id, amount: 200, idempotencyKey: allocationLedgerKey(wallet._id, sales._id, 'race-a') },
    ];
    const other = [
      { entityId: marketing._id, amount: 600, idempotencyKey: allocationLedgerKey(wallet._id, marketing._id, 'race-b') },
      { entityId: sales._id, amount: 200, idempotencyKey: allocationLedgerKey(wallet._id, sales._id, 'race-b') },
    ];
    const raced = await Promise.allSettled([
      allocate({ tenantId: tenant._id, walletId: wallet._id, userId: admin.user._id, allocations: lines }),
      allocate({ tenantId: tenant._id, walletId: wallet._id, userId: admin.user._id, allocations: other }),
    ]);
    expect(raced.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
    const saved = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    expect(saved.allocatedAmount).toBe(800);
    expect(saved.balance).toBe(1_000);
    expect((await Entity.findOne({ _id: marketing._id, tenantId: tenant._id })).allocatedAmount).toBe(600);
    expect((await Entity.findOne({ _id: sales._id, tenantId: tenant._id })).allocatedAmount).toBe(200);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'allocation_to_entity' })).toBe(2);
  });

  it('still treats a request without an idempotency key as a new allocation', async () => {
    await request([{ entityId: marketing._id, amount: 100 }]);
    await request([{ entityId: marketing._id, amount: 100 }]);
    expect((await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id })).allocatedAmount).toBe(200);
  });
});
