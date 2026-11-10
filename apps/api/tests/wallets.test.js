import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import {
  makeTenant,
  makeUser,
  makeFundedWallet,
  makeEntity,
  authHeader,
} from './helpers.js';
import { createApp } from '../src/app.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';
import { WalletTransaction } from '../src/modules/wallets/walletTransaction.model.js';
import { Entity } from '../src/modules/entities/entity.model.js';
import * as ledger from '../src/services/ledger.service.js';
import { InsufficientFundsError } from '../src/utils/errors.js';

let app;
let tenant;
let adminToken;
let managerToken;
let wallet;
let entity;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  tenant = await makeTenant({ slug: 'wallet-suite', name: 'Wallet Co' });
  ({ token: adminToken } = await makeUser(tenant, 'company_admin', 'tenant'));
  wallet = await makeFundedWallet(tenant, { name: 'Org Wallet', amount: 500_000 });
  entity = await makeEntity(tenant, wallet, 'Marketing');
  ({ token: managerToken } = await makeUser(tenant, 'entity_manager', 'entity', {
    scopeId: entity._id,
    assignedEntityIds: [entity._id],
  }));
});

describe('wallets API — CRUD & balance', () => {
  it('creates a wallet and returns schema with balance metadata', async () => {
    const res = await request(app)
      .post('/api/v1/wallets')
      .set(authHeader(adminToken))
      .send({ name: 'Secondary', fundingMethod: 'po_upload' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Secondary');
    expect(res.body.balance).toBe(0);
    expect(res.body.allocatedAmount).toBe(0);
    expect(res.body).toHaveProperty('unallocatedAmount');
    expect(res.body).toHaveProperty('validNextStatuses');
    expect(String(res.body.tenantId)).toBe(String(tenant._id));
  });

  it('lists wallets for the tenant with repaired balances', async () => {
    const res = await request(app).get('/api/v1/wallets').set(authHeader(adminToken));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].balance).toBe(500_000);
    expect(res.body[0].unallocatedAmount).toBe(500_000);
  });

  it('gets a single wallet by id', async () => {
    const res = await request(app)
      .get(`/api/v1/wallets/${wallet._id}`)
      .set(authHeader(adminToken));
    expect(res.status).toBe(200);
    expect(res.body._id).toBe(String(wallet._id));
    expect(res.body.balance).toBe(500_000);
  });

  it('returns 404 for unknown wallet id', async () => {
    const id = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/v1/wallets/${id}`).set(authHeader(adminToken));
    expect(res.status).toBe(404);
  });

  it('returns 400 for malformed wallet id', async () => {
    const res = await request(app).get('/api/v1/wallets/not-an-id').set(authHeader(adminToken));
    expect(res.status).toBe(400);
  });

  it('patches wallet contact fields', async () => {
    const res = await request(app)
      .patch(`/api/v1/wallets/${wallet._id}`)
      .set(authHeader(adminToken))
      .send({
        address: '12 MG Road',
        pinCode: '560001',
        mobileNumber: '9876543210',
        gstin: '29ABCDE1234F1Z5',
      });
    expect(res.status).toBe(200);
    expect(res.body.pinCode).toBe('560001');
    expect(res.body.gstin).toBe('29ABCDE1234F1Z5');
  });

  it('rejects invalid GSTIN on patch', async () => {
    const res = await request(app)
      .patch(`/api/v1/wallets/${wallet._id}`)
      .set(authHeader(adminToken))
      .send({ gstin: 'BAD' });
    expect(res.status).toBe(400);
  });

  it('deletes only incomplete draft wallets', async () => {
    const draft = await Wallet.create({
      tenantId: tenant._id,
      name: 'Draft Only',
      status: 'draft',
    });
    const ok = await request(app)
      .delete(`/api/v1/wallets/${draft._id}`)
      .set(authHeader(adminToken));
    expect(ok.status).toBe(200);

    const funded = await request(app)
      .delete(`/api/v1/wallets/${wallet._id}`)
      .set(authHeader(adminToken));
    expect(funded.status).toBe(422);
    expect(funded.body.error.code).toBe('WALLET_NOT_DELETABLE');
  });
});

describe('wallets API — authz', () => {
  it('requires authentication (401)', async () => {
    const res = await request(app).get('/api/v1/wallets');
    expect(res.status).toBe(401);
  });

  it('forbids entity managers from wallet writes (403)', async () => {
    const res = await request(app)
      .post('/api/v1/wallets')
      .set(authHeader(managerToken))
      .send({ name: 'Nope' });
    expect(res.status).toBe(403);
  });

  it('hides organization cash from an entity manager on wallet reads', async () => {
    const reserve = await makeFundedWallet(tenant, { name: 'Reserve', amount: 80_000 });
    const sales = await makeEntity(tenant, wallet, 'Sales');
    await ledger.createTransaction({
      tenantId: tenant._id,
      walletId: wallet._id,
      type: 'allocation_to_entity',
      amount: 12_000,
      relatedEntityId: sales._id,
    });
    await ledger.createTransaction({
      tenantId: tenant._id,
      walletId: wallet._id,
      type: 'allocation_to_entity',
      amount: 7_000,
      relatedEntityId: entity._id,
    });

    const list = await request(app).get('/api/v1/wallets').set(authHeader(managerToken));
    expect(list.status).toBe(200);
    expect(list.body.map((row) => row.name)).toEqual(['Org Wallet']);
    expect(JSON.stringify(list.body)).not.toContain('500000');
    expect(JSON.stringify(list.body)).not.toContain('80000');
    expect(list.body[0]).not.toHaveProperty('balance');
    expect(list.body[0]).not.toHaveProperty('allocatedAmount');
    expect(list.body[0]).not.toHaveProperty('unallocatedAmount');

    const adminList = await request(app).get('/api/v1/wallets').set(authHeader(adminToken));
    expect(adminList.body.map((row) => row.name).sort()).toEqual(['Org Wallet', 'Reserve']);
    expect(adminList.body.find((row) => row.name === 'Org Wallet').balance).toBe(500_000);

    const hidden = await request(app).get(`/api/v1/wallets/${reserve._id}`).set(authHeader(managerToken));
    expect(hidden.status).toBe(404);

    const history = await request(app)
      .get(`/api/v1/wallets/${wallet._id}/transactions`)
      .set(authHeader(managerToken));
    expect(history.status).toBe(200);
    expect(history.body.items.map((row) => row.type)).toEqual(['allocation_to_entity']);
    expect(history.body.items[0]).toMatchObject({ amount: 7_000, availableAfter: 7_000 });
    expect(history.body.items[0]).not.toHaveProperty('balanceAfter');
    expect(JSON.stringify(history.body)).not.toContain('fund_in');
    expect(JSON.stringify(history.body)).not.toContain('12000');
    expect(JSON.stringify(history.body)).not.toContain('500000');

    const departmentHistory = await request(app)
      .get(`/api/v1/entities/${entity._id}/transactions`)
      .set(authHeader(managerToken));
    expect(departmentHistory.status).toBe(200);
    expect(departmentHistory.body.items[0]).not.toHaveProperty('balanceAfter');
    expect(departmentHistory.body.items[0].amount).toBe(7_000);

    const adminDepartmentHistory = await request(app)
      .get(`/api/v1/entities/${entity._id}/transactions`)
      .set(authHeader(adminToken));
    expect(adminDepartmentHistory.status).toBe(200);
    expect(adminDepartmentHistory.body.items[0]).toHaveProperty('balanceAfter');
    const adminWalletHistory = await request(app)
      .get(`/api/v1/wallets/${wallet._id}/transactions`)
      .set(authHeader(adminToken));
    expect(adminWalletHistory.body.items.some((row) => row.type === 'fund_in' && row.balanceAfter === 500_000)).toBe(true);
  });

  it('isolates wallets across tenants (404 / empty list)', async () => {
    const other = await makeTenant({ slug: 'wallet-other' });
    const { token: otherToken } = await makeUser(other, 'company_admin', 'tenant');

    const get = await request(app)
      .get(`/api/v1/wallets/${wallet._id}`)
      .set(authHeader(otherToken));
    expect(get.status).toBe(404);

    const list = await request(app).get('/api/v1/wallets').set(authHeader(otherToken));
    expect(list.body).toHaveLength(0);
  });
});

describe('wallets API — fund / allocate / transfer', () => {
  it('PO fund creates a pending finance request without crediting balance', async () => {
    const draft = await Wallet.create({
      tenantId: tenant._id,
      name: 'Pending Fund',
      fundingMethod: 'po_upload',
      status: 'draft',
    });
    const res = await request(app)
      .post(`/api/v1/wallets/${draft._id}/fund`)
      .set(authHeader(adminToken))
      .send({ amount: 10_000, docType: 'PO', docNumber: 'PO-1' });
    expect(res.status).toBe(201);
    expect(res.body.pending).toBe(true);
    expect(res.body.wallet.balance).toBe(0);
    expect(res.body.wallet.fundingDocument.approvalStatus).toBe('pending');
    expect(res.body.wallet.fundingDocument.requestedAmount).toBe(10_000);
  });

  it('rejects online funding via /fund (must use Razorpay)', async () => {
    const res = await request(app)
      .post(`/api/v1/wallets/${wallet._id}/fund`)
      .set(authHeader(adminToken))
      .send({ amount: 1000, fundingMethod: 'online' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('USE_RAZORPAY');
  });

  it('rejects duplicate pending funding requests', async () => {
    const draft = await Wallet.create({
      tenantId: tenant._id,
      name: 'Dup Fund',
      fundingMethod: 'po_upload',
      status: 'draft',
    });
    await request(app)
      .post(`/api/v1/wallets/${draft._id}/fund`)
      .set(authHeader(adminToken))
      .send({ amount: 5000 })
      .expect(201);
    const again = await request(app)
      .post(`/api/v1/wallets/${draft._id}/fund`)
      .set(authHeader(adminToken))
      .send({ amount: 5000 });
    expect(again.status).toBe(422);
    expect(again.body.error.code).toBe('FUNDING_PENDING');
  });

  it('allocates budget to an entity and updates wallet + entity caches', async () => {
    // Entity creation may move wallet toward entities_added; force status for allocate transition.
    await Wallet.updateOne(
      { _id: wallet._id, tenantId: tenant._id },
      { status: 'entities_added' },
    );

    const res = await request(app)
      .post(`/api/v1/wallets/${wallet._id}/allocate`)
      .set(authHeader(adminToken))
      .send({ allocations: [{ entityId: String(entity._id), amount: 200_000 }] });
    expect(res.status).toBe(201);
    expect(res.body.wallet.allocatedAmount).toBe(200_000);
    expect(res.body.wallet.balance).toBe(500_000);
    expect(res.body.wallet.unallocatedAmount).toBe(300_000);

    const e = await Entity.findOne({ _id: entity._id, tenantId: tenant._id });
    expect(e.allocatedAmount).toBe(200_000);
  });

  it('rejects allocation that exceeds unallocated balance', async () => {
    const res = await request(app)
      .post(`/api/v1/wallets/${wallet._id}/allocate`)
      .set(authHeader(adminToken))
      .send({ allocations: [{ entityId: String(entity._id), amount: 900_000 }] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ALLOCATION_EXCEEDS_BALANCE');
  });

  it('transfers cash between wallets in the same tenant', async () => {
    const other = await makeFundedWallet(tenant, { name: 'Sink', amount: 0 });
    const res = await request(app)
      .post(`/api/v1/wallets/${wallet._id}/transfer`)
      .set(authHeader(adminToken))
      .send({ toWalletId: String(other._id), amount: 50_000 });
    expect(res.status).toBe(201);
    expect(res.body.wallet.balance).toBe(450_000);

    const sink = await Wallet.findOne({ _id: other._id, tenantId: tenant._id });
    expect(sink.balance).toBe(50_000);
  });

  it('cannot transfer to another tenant wallet', async () => {
    const otherTenant = await makeTenant({ slug: 'xfer-other' });
    const foreign = await makeFundedWallet(otherTenant, { name: 'Foreign', amount: 0 });
    const res = await request(app)
      .post(`/api/v1/wallets/${wallet._id}/transfer`)
      .set(authHeader(adminToken))
      .send({ toWalletId: String(foreign._id), amount: 1000 });
    expect(res.status).toBe(404);
  });

  it('lists wallet transactions with pagination and type filter', async () => {
    await ledger.createTransaction({
      tenantId: tenant._id,
      walletId: wallet._id,
      type: 'allocation_to_entity',
      amount: 25_000,
      relatedEntityId: entity._id,
    });
    const res = await request(app)
      .get(`/api/v1/wallets/${wallet._id}/transactions`)
      .query({ page: 1, limit: 10, type: 'fund_in' })
      .set(authHeader(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.items.every((t) => t.type === 'fund_in')).toBe(true);
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(1);
    expect(res.body.items[0]).toHaveProperty('balanceAfter');
  });

  it('ensure-spend-entity maps a spend entity for the wallet', async () => {
    const res = await request(app)
      .post(`/api/v1/wallets/${wallet._id}/ensure-spend-entity`)
      .set(authHeader(adminToken));
    expect([200, 201]).toContain(res.status);
    expect(res.body._id || res.body.entityId || res.body.name).toBeTruthy();
  });
});

describe('wallets — debit / insufficient / concurrent / rollback', () => {
  it('rejects campaign_spend that exceeds balance (insufficient funds)', async () => {
    await expect(
      ledger.createTransaction({
        tenantId: tenant._id,
        walletId: wallet._id,
        type: 'campaign_spend',
        amount: -999_999,
        relatedEntityId: entity._id,
      }),
    ).rejects.toThrow(InsufficientFundsError);

    const w = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    expect(w.balance).toBe(500_000);
    expect(
      await WalletTransaction.countDocuments({
        tenantId: tenant._id,
        walletId: wallet._id,
        type: 'campaign_spend',
      }),
    ).toBe(0);
  });

  it('debits cash via campaign_spend and releases entity earmark', async () => {
    await ledger.createTransaction({
      tenantId: tenant._id,
      walletId: wallet._id,
      type: 'allocation_to_entity',
      amount: 100_000,
      relatedEntityId: entity._id,
    });
    await ledger.createTransaction({
      tenantId: tenant._id,
      walletId: wallet._id,
      type: 'campaign_spend',
      amount: -40_000,
      relatedEntityId: entity._id,
    });
    const w = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    expect(w.balance).toBe(460_000);
    expect(w.allocatedAmount).toBe(60_000);
  });

  it('concurrent spends serialize — only one overdraft attempt fails, balance stays consistent', async () => {
    // Leave only ₹10k cash so two concurrent ₹8k spends race.
    await ledger.createTransaction({
      tenantId: tenant._id,
      walletId: wallet._id,
      type: 'campaign_spend',
      amount: -490_000,
    });

    const results = await Promise.allSettled([
      ledger.createTransaction({
        tenantId: tenant._id,
        walletId: wallet._id,
        type: 'campaign_spend',
        amount: -8_000,
      }),
      ledger.createTransaction({
        tenantId: tenant._id,
        walletId: wallet._id,
        type: 'campaign_spend',
        amount: -8_000,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length + rejected.length).toBe(2);
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const w = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    expect(w.balance).toBeGreaterThanOrEqual(0);
    expect(w.balance).toBeLessThanOrEqual(10_000);
    // At most one spend of 8k can succeed from 10k if the other also tries 8k;
    // if both somehow serialized with enough cash they would leave -6k which is impossible.
    expect(w.balance === 2_000 || w.balance === 10_000 || w.balance === 0).toBe(true);
    if (rejected.length) {
      expect(rejected[0].reason).toBeInstanceOf(InsufficientFundsError);
    }
    const recomputed = await ledger.recomputeBalance({
      tenantId: tenant._id,
      walletId: wallet._id,
    });
    expect(recomputed).toBe(w.balance);
  });

  it('multi-entity allocate rolls back entirely on over-allocation', async () => {
    const sales = await makeEntity(tenant, wallet, 'Sales');
    await expect(
      ledger.allocateToEntities({
        tenantId: tenant._id,
        walletId: wallet._id,
        allocations: [
          { entityId: entity._id, amount: 400_000 },
          { entityId: sales._id, amount: 400_000 },
        ],
      }),
    ).rejects.toThrow(InsufficientFundsError);

    const w = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    expect(w.allocatedAmount).toBe(0);
    expect(
      await WalletTransaction.countDocuments({
        tenantId: tenant._id,
        walletId: wallet._id,
        type: 'allocation_to_entity',
      }),
    ).toBe(0);
  });
});
