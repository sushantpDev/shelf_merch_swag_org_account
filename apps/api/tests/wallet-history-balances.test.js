import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';
import { Entity } from '../src/modules/entities/entity.model.js';
import { createTransaction } from '../src/services/ledger.service.js';
import { listTransactions } from '../src/modules/wallets/wallets.service.js';

let tenant;
let wallet;
let department;

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  tenant = await Tenant.create({ name: 'History test', slug: 'history-test' });
  wallet = await Wallet.create({ tenantId: tenant._id, name: 'History wallet' });
  department = await Entity.create({ tenantId: tenant._id, walletId: wallet._id, name: 'Marketing' });
});

const record = (type, amount, relatedEntityId = null) => createTransaction({
  tenantId: tenant._id, walletId: wallet._id, type, amount, relatedEntityId,
});
const history = (query = {}) => listTransactions({ tenantId: tenant._id, walletId: wallet._id, query });

describe('wallet history available balance', () => {
  it('includes funding outside the latest 20 rows and preserves balances across pages', async () => {
    await record('fund_in', 100_000);
    for (let i = 0; i < 25; i++) {
      await record('allocation_to_entity', 1_000, department._id);
    }
    const first = await history({ limit: 20 });
    expect(first.items).toHaveLength(20);
    expect(first.items[0].availableAfter).toBe(75_000);
    expect(first.items.at(-1).availableAfter).toBe(94_000);
    const second = await history({ limit: 20, page: 2 });
    expect(second.items).toHaveLength(6);
    expect(second.items[0].availableAfter).toBe(95_000);
    expect(second.items.at(-1).availableAfter).toBe(100_000);
    expect(second.pagination.total).toBe(26);
  });

  it('calculates before type filters and returns the same balance for a filtered row', async () => {
    await record('fund_in', 1_000);
    await record('allocation_to_entity', 600, department._id);
    await record('fund_in', 100);
    const all = await history();
    const filtered = await history({ type: 'fund_in', limit: 1 });
    expect(filtered.items[0].availableAfter).toBe(500);
    expect(filtered.items[0].availableAfter).toBe(all.items[0].availableAfter);
    expect(filtered.pagination.total).toBe(2);
  });

  it('releases department earmarks without double-debiting and accounts for other cash movements', async () => {
    await record('fund_in', 1_000);
    await record('allocation_to_entity', 600, department._id);
    await record('campaign_spend', -200, department._id);
    expect((await history()).items[0].availableAfter).toBe(400);
    await record('order_payment', -100);
    expect((await history()).items[0].availableAfter).toBe(300);
    await record('allocation_to_entity', -100, department._id);
    expect((await history()).items[0].availableAfter).toBe(400);
    await record('refund', 50);
    await record('adjustment', -25);
    await record('transfer_between_wallets', 30);
    expect((await history()).items[0].availableAfter).toBe(455);
  });

  it('keeps a fully allocated balance at zero', async () => {
    await record('fund_in', 100);
    await record('allocation_to_entity', 100, department._id);
    expect((await history()).items[0].availableAfter).toBe(0);
  });

  it('does not expose another tenant wallet', async () => {
    const other = await Tenant.create({ name: 'Other', slug: 'other-history' });
    await expect(listTransactions({ tenantId: other._id, walletId: wallet._id, query: {} }))
      .rejects.toThrow('Wallet not found');
  });
});
