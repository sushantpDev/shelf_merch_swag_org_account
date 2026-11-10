import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';
import { WalletTransaction } from '../src/modules/wallets/walletTransaction.model.js';
import { Entity } from '../src/modules/entities/entity.model.js';
import * as ledger from '../src/services/ledger.service.js';
import { InsufficientFundsError } from '../src/utils/errors.js';

let tenant;
let wallet;
let entity;

beforeAll(connectTestDb);
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  tenant = await Tenant.create({ name: 'Rubix', slug: 'rubix' });
  wallet = await Wallet.create({ tenantId: tenant._id, name: 'Test Wallet' });
  entity = await Entity.create({ tenantId: tenant._id, walletId: wallet._id, name: 'Marketing' });
});

const reload = () => Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });

describe('ledger.service', () => {
  it('fund_in credits balance, totalAmount, and snapshots balanceAfter', async () => {
    const txn = await ledger.createTransaction({
      tenantId: tenant._id,
      walletId: wallet._id,
      type: 'fund_in',
      amount: 1_000_000,
    });
    expect(txn.balanceAfter).toBe(1_000_000);
    const w = await reload();
    expect(w.balance).toBe(1_000_000);
    expect(w.totalAmount).toBe(1_000_000);
  });

  it('rejects cash debits that overdraw the wallet (must-have §11.1)', async () => {
    await ledger.createTransaction({ tenantId: tenant._id, walletId: wallet._id, type: 'fund_in', amount: 1000 });
    await expect(
      ledger.createTransaction({
        tenantId: tenant._id,
        walletId: wallet._id,
        type: 'campaign_spend',
        amount: -5000,
        relatedEntityId: entity._id,
      }),
    ).rejects.toThrow(InsufficientFundsError);
    // Failed transaction must leave no trace (atomicity).
    const w = await reload();
    expect(w.balance).toBe(1000);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, walletId: wallet._id })).toBe(1);
  });

  it('allocation cannot exceed wallet balance (must-have §11.1)', async () => {
    await ledger.createTransaction({ tenantId: tenant._id, walletId: wallet._id, type: 'fund_in', amount: 100_000 });
    await expect(
      ledger.createTransaction({
        tenantId: tenant._id,
        walletId: wallet._id,
        type: 'allocation_to_entity',
        amount: 150_000,
        relatedEntityId: entity._id,
      }),
    ).rejects.toThrow(InsufficientFundsError);
  });

  it('allocation earmarks without moving cash, and syncs entity.allocatedAmount', async () => {
    await ledger.createTransaction({ tenantId: tenant._id, walletId: wallet._id, type: 'fund_in', amount: 500_000 });
    await ledger.createTransaction({
      tenantId: tenant._id,
      walletId: wallet._id,
      type: 'allocation_to_entity',
      amount: 300_000,
      relatedEntityId: entity._id,
    });
    const w = await reload();
    expect(w.balance).toBe(500_000); // cash untouched
    expect(w.allocatedAmount).toBe(300_000);
    const e = await Entity.findOne({ _id: entity._id, tenantId: tenant._id });
    expect(e.allocatedAmount).toBe(300_000);
  });

  it('campaign_spend against a department debits cash and releases that earmark', async () => {
    await ledger.createTransaction({ tenantId: tenant._id, walletId: wallet._id, type: 'fund_in', amount: 500_000 });
    await ledger.createTransaction({
      tenantId: tenant._id, walletId: wallet._id, type: 'allocation_to_entity', amount: 300_000, relatedEntityId: entity._id,
    });
    await ledger.createTransaction({
      tenantId: tenant._id, walletId: wallet._id, type: 'campaign_spend', amount: -120_000, relatedEntityId: entity._id,
    });
    const w = await reload();
    expect(w.balance).toBe(380_000);
    // Earmark released so org unallocated stays at (500k - 300k) = 200k
    expect(w.allocatedAmount).toBe(180_000);
    expect(w.balance - w.allocatedAmount).toBe(200_000);
    const e = await Entity.findOne({ _id: entity._id, tenantId: tenant._id });
    expect(e.spentAmount).toBe(120_000);
    expect(e.allocatedAmount).toBe(300_000);
    expect(e.allocatedAmount - e.spentAmount).toBe(180_000);
  });

  it('campaign_spend without relatedEntityId leaves department earmarks intact', async () => {
    await ledger.createTransaction({ tenantId: tenant._id, walletId: wallet._id, type: 'fund_in', amount: 500_000 });
    await ledger.createTransaction({
      tenantId: tenant._id, walletId: wallet._id, type: 'allocation_to_entity', amount: 100_000, relatedEntityId: entity._id,
    });
    // Unallocated cash spend (admin path)
    await ledger.createTransaction({
      tenantId: tenant._id, walletId: wallet._id, type: 'campaign_spend', amount: -50_000,
    });
    const w = await reload();
    expect(w.balance).toBe(450_000);
    expect(w.allocatedAmount).toBe(100_000);
    expect(w.balance - w.allocatedAmount).toBe(350_000);
  });

  it('allocateToEntities is all-or-nothing across multiple entities', async () => {
    const entity2 = await Entity.create({ tenantId: tenant._id, walletId: wallet._id, name: 'Sales' });
    await ledger.createTransaction({ tenantId: tenant._id, walletId: wallet._id, type: 'fund_in', amount: 100_000 });
    await expect(
      ledger.allocateToEntities({
        tenantId: tenant._id,
        walletId: wallet._id,
        allocations: [
          { entityId: entity._id, amount: 80_000 },
          { entityId: entity2._id, amount: 80_000 }, // pushes total over balance
        ],
      }),
    ).rejects.toThrow(InsufficientFundsError);
    const w = await reload();
    expect(w.allocatedAmount).toBe(0); // first allocation rolled back too
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, walletId: wallet._id, type: 'allocation_to_entity' })).toBe(0);
  });

  it('transfers move cash atomically between wallets', async () => {
    const wallet2 = await Wallet.create({ tenantId: tenant._id, name: 'Second Wallet' });
    await ledger.createTransaction({ tenantId: tenant._id, walletId: wallet._id, type: 'fund_in', amount: 50_000 });
    await ledger.transferBetweenWallets({
      tenantId: tenant._id, fromWalletId: wallet._id, toWalletId: wallet2._id, amount: 20_000,
    });
    expect((await reload()).balance).toBe(30_000);
    expect((await Wallet.findOne({ _id: wallet2._id, tenantId: tenant._id })).balance).toBe(20_000);
  });

  it('transfer cannot strand entity earmarks without cash backing', async () => {
    const wallet2 = await Wallet.create({ tenantId: tenant._id, name: 'Second Wallet' });
    await ledger.createTransaction({ tenantId: tenant._id, walletId: wallet._id, type: 'fund_in', amount: 100_000 });
    await ledger.createTransaction({
      tenantId: tenant._id, walletId: wallet._id, type: 'allocation_to_entity', amount: 90_000, relatedEntityId: entity._id,
    });
    await expect(
      ledger.transferBetweenWallets({
        tenantId: tenant._id, fromWalletId: wallet._id, toWalletId: wallet2._id, amount: 50_000,
      }),
    ).rejects.toThrow(InsufficientFundsError);
    expect((await reload()).balance).toBe(100_000); // rolled back
  });

  it('balance is recomputable from the ledger', async () => {
    await ledger.createTransaction({ tenantId: tenant._id, walletId: wallet._id, type: 'fund_in', amount: 500_000 });
    await ledger.createTransaction({
      tenantId: tenant._id, walletId: wallet._id, type: 'allocation_to_entity', amount: 200_000, relatedEntityId: entity._id,
    });
    await ledger.createTransaction({
      tenantId: tenant._id, walletId: wallet._id, type: 'campaign_spend', amount: -75_000, relatedEntityId: entity._id,
    });
    await ledger.createTransaction({ tenantId: tenant._id, walletId: wallet._id, type: 'refund', amount: 5_000 });
    const recomputed = await ledger.recomputeBalance({ tenantId: tenant._id, walletId: wallet._id });
    expect(recomputed).toBe((await reload()).balance);
    expect(recomputed).toBe(430_000);
  });

  it('the ledger is append-only', async () => {
    await ledger.createTransaction({ tenantId: tenant._id, walletId: wallet._id, type: 'fund_in', amount: 1000 });
    await expect(
      WalletTransaction.updateOne({ tenantId: tenant._id, walletId: wallet._id }, { amount: 9999 }),
    ).rejects.toThrow(/append-only/);
    await expect(
      WalletTransaction.deleteMany({ tenantId: tenant._id, walletId: wallet._id }),
    ).rejects.toThrow(/append-only/);
  });

  it('tenant-scoped queries without tenantId are rejected by the guard plugin', async () => {
    await expect(Wallet.findOne({ _id: wallet._id })).rejects.toThrow(/tenantId/);
    await expect(Wallet.find({})).rejects.toThrow(/tenantId/);
    // Platform opt-out works.
    const all = await Wallet.find({}).setOptions({ skipTenantGuard: true });
    expect(all.length).toBeGreaterThan(0);
  });

  it('never leaks another tenant\'s wallet even with a valid _id', async () => {
    const otherTenant = await Tenant.create({ name: 'Acme', slug: 'acme' });
    const found = await Wallet.findOne({ _id: wallet._id, tenantId: otherTenant._id });
    expect(found).toBeNull();
  });

  it('rejects withdrawing department budget that was already spent', async () => {
    await ledger.createTransaction({ tenantId: tenant._id, walletId: wallet._id, type: 'fund_in', amount: 500_000 });
    await ledger.allocateToEntities({
      tenantId: tenant._id,
      walletId: wallet._id,
      allocations: [{ entityId: entity._id, amount: 200_000 }],
    });
    await ledger.createTransaction({
      tenantId: tenant._id,
      walletId: wallet._id,
      type: 'campaign_spend',
      amount: -150_000,
      relatedEntityId: entity._id,
    });
    await expect(ledger.allocateToEntities({
      tenantId: tenant._id,
      walletId: wallet._id,
      allocations: [{ entityId: entity._id, amount: -100_000 }],
    })).rejects.toMatchObject({ code: 'ALLOCATION_EXCEEDS_UNSPENT' });
    const current = await Entity.findOne({ _id: entity._id, tenantId: tenant._id });
    expect(current.allocatedAmount).toBe(200_000);
    expect(current.spentAmount).toBe(150_000);
  });

  it('keeps an existing allocation line when a later batch repeats its ledger key', async () => {
    const sales = await Entity.create({ tenantId: tenant._id, walletId: wallet._id, name: 'Sales' });
    await ledger.createTransaction({ tenantId: tenant._id, walletId: wallet._id, type: 'fund_in', amount: 500_000 });
    const firstKey = 'allocation-line-a';
    await ledger.allocateToEntities({
      tenantId: tenant._id,
      walletId: wallet._id,
      allocations: [{ entityId: entity._id, amount: 80_000, idempotencyKey: firstKey }],
    });
    await ledger.allocateToEntities({
      tenantId: tenant._id,
      walletId: wallet._id,
      allocations: [
        { entityId: entity._id, amount: 80_000, idempotencyKey: firstKey },
        { entityId: sales._id, amount: 20_000, idempotencyKey: 'allocation-line-b' },
      ],
    });
    expect((await reload()).allocatedAmount).toBe(100_000);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, idempotencyKey: firstKey })).toBe(1);
    expect((await Entity.findOne({ _id: entity._id, tenantId: tenant._id })).allocatedAmount).toBe(80_000);
    expect((await Entity.findOne({ _id: sales._id, tenantId: tenant._id })).allocatedAmount).toBe(20_000);
  });
});
