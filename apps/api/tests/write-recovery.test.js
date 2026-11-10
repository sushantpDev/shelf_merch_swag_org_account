import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeEntity, makeFundedWallet, makeShop, makeTenant, makeUser } from './helpers.js';
import { executeMcpWrite, prepareMcpWrite } from '../src/modules/mcp/mcpWriteSafety.js';
import { McpWriteIdempotency } from '../src/modules/mcp/mcpWriteIdempotency.model.js';
import { executePointsDraft, preparePointsDraft } from '../src/modules/mcp/campaignsDraftWrite.js';
import { McpPointsDraftClaim } from '../src/modules/mcp/mcpPointsDraftClaim.model.js';
import { Campaign } from '../src/modules/campaigns/campaign.model.js';
import { Recipient } from '../src/modules/campaigns/recipient.model.js';
import { allocateCredits, importRecipients, launchCampaign } from '../src/modules/campaigns/campaigns.service.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';
import { WalletTransaction } from '../src/modules/wallets/walletTransaction.model.js';
import { Notification } from '../src/modules/notifications/notification.model.js';
import { Order } from '../src/modules/orders/order.model.js';
import { Contact } from '../src/modules/contacts/contact.model.js';
import { Kit } from '../src/modules/kits/kit.model.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { Entity } from '../src/modules/entities/entity.model.js';
import * as ledger from '../src/services/ledger.service.js';

let tenant;
let actor;

beforeAll(connectTestDb);
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  tenant = await makeTenant({ slug: 'write-recovery' });
  actor = await makeUser(tenant, 'company_admin', 'tenant');
});

function actorUser() {
  return {
    userId: actor.user._id,
    role: 'company_admin',
    scopeType: 'tenant',
    assignedEntityIds: [],
  };
}

async function prepareNote() {
  return prepareMcpWrite({
    tenantId: tenant._id,
    actorUserId: actor.user._id,
    operation: 'fixture.recover',
    payload: { amount: 10 },
    validate: async (payload) => ({ amount: payload.amount }),
    resourceState: async () => ({ ready: true }),
    summary: async () => ({ amount: 10 }),
  });
}

async function runNote(prepared, { execute, reconcile, idempotencyKey = 'recover-1' }) {
  return executeMcpWrite({
    tenantId: tenant._id,
    actorUserId: actor.user._id,
    operation: 'fixture.recover',
    confirmationId: prepared.confirmationId,
    payload: { amount: 10 },
    idempotencyKey,
    validate: async (payload) => ({ amount: payload.amount }),
    resourceState: async () => ({ ready: true }),
    execute,
    reconcile,
  });
}

async function expireLease(key) {
  await McpWriteIdempotency.updateOne(
    { key, tenantId: tenant._id, actorUserId: actor.user._id },
    {
      $set: {
        status: 'pending',
        result: null,
        errorCode: '',
        leaseOwner: 'replica-a',
        leaseExpiresAt: new Date(0),
      },
    },
  );
}

describe('idempotency lease recovery', () => {
  it('reconciles an expired in-progress operation without running it again', async () => {
    const prepared = await prepareNote();
    await runNote(prepared, { execute: async () => ({ applied: true }) });
    await expireLease('recover-1');
    let ran = false;
    const recovered = await runNote(prepared, {
      reconcile: async () => ({ outcome: 'completed', result: { applied: true, recovered: true } }),
      execute: async () => {
        ran = true;
        return { applied: true, recovered: false };
      },
    });
    expect(ran).toBe(false);
    expect(recovered).toMatchObject({ applied: true, recovered: true });
    const stored = await McpWriteIdempotency.findOne({ key: 'recover-1', tenantId: tenant._id });
    expect(stored.status).toBe('completed');
  });

  it('runs an expired operation once when reconciliation finds no side effect', async () => {
    const prepared = await prepareNote();
    await runNote(prepared, { execute: async () => ({ applied: false }) });
    await expireLease('recover-1');
    let runs = 0;
    const recovered = await runNote(prepared, {
      reconcile: async () => ({ outcome: 'absent' }),
      execute: async () => {
        runs += 1;
        return { applied: true };
      },
    });
    expect(runs).toBe(1);
    expect(recovered.applied).toBe(true);
  });

  it('does not rerun an expired operation when the side effect is uncertain', async () => {
    const prepared = await prepareNote();
    await runNote(prepared, { execute: async () => ({ applied: false }) });
    await expireLease('recover-1');
    let runs = 0;
    await expect(runNote(prepared, {
      reconcile: async () => ({ outcome: 'uncertain' }),
      execute: async () => {
        runs += 1;
        return { applied: true };
      },
    })).rejects.toMatchObject({ code: 'IDEMPOTENCY_RECONCILIATION_REQUIRED' });
    expect(runs).toBe(0);
  });

  it('keeps a live lease owned by another replica in flight', async () => {
    const prepared = await prepareNote();
    await runNote(prepared, { execute: async () => ({ applied: true }) });
    await McpWriteIdempotency.updateOne(
      { key: 'recover-1', tenantId: tenant._id },
      {
        $set: {
          status: 'pending',
          result: null,
          leaseOwner: 'replica-b',
          leaseExpiresAt: new Date(Date.now() + 60_000),
        },
      },
    );
    let runs = 0;
    await expect(runNote(prepared, {
      reconcile: async () => ({ outcome: 'absent' }),
      execute: async () => {
        runs += 1;
        return { applied: true };
      },
    })).rejects.toMatchObject({ code: 'IDEMPOTENT_REPLAY_IN_FLIGHT' });
    expect(runs).toBe(0);
  });

  it('lets two replicas recover one expired lease with a single execution', async () => {
    const prepared = await prepareNote();
    await runNote(prepared, { execute: async () => ({ applied: false }) });
    await expireLease('recover-1');
    let runs = 0;
    const attempts = await Promise.allSettled(Array.from({ length: 4 }, () => runNote(prepared, {
      reconcile: async () => ({ outcome: 'absent' }),
      execute: async () => {
        runs += 1;
        await new Promise((resolve) => setTimeout(resolve, 40));
        return { applied: true, runs };
      },
    })));
    const fulfilled = attempts.filter((attempt) => attempt.status === 'fulfilled');
    expect(runs).toBe(1);
    expect(fulfilled.length).toBeGreaterThan(0);
    expect(new Set(fulfilled.map((attempt) => attempt.value.applied)).size).toBe(1);
  });
});

describe('points draft claim recovery', () => {
  it('links a campaign that was created before the claim was finalized', async () => {
    const wallet = await makeFundedWallet(tenant);
    const entity = await makeEntity(tenant, wallet);
    const shop = await makeShop(tenant, { name: 'Recovery shop' });
    const input = {
      entityId: String(entity._id),
      shopId: String(shop._id),
      name: 'Welcome points',
      creditsPerRecipient: 0,
      recipients: [{ name: 'Ada', email: 'ada@recovery.test' }],
    };
    const prepared = await preparePointsDraft({
      tenantId: tenant._id,
      actorUserId: actor.user._id,
      input,
    });
    const created = await executePointsDraft({
      tenantId: tenant._id,
      actorUserId: actor.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'draft-claim-1',
    });
    await McpPointsDraftClaim.updateOne(
      { tenantId: tenant._id, campaignId: created.id },
      { $set: { campaignId: null } },
    );
    const again = await preparePointsDraft({
      tenantId: tenant._id,
      actorUserId: actor.user._id,
      input,
    });
    const linked = await executePointsDraft({
      tenantId: tenant._id,
      actorUserId: actor.user._id,
      input,
      confirmationId: again.confirmationId,
      idempotencyKey: 'draft-claim-2',
    });
    expect(linked.id).toBe(created.id);
    expect(await Campaign.countDocuments({ tenantId: tenant._id, type: 'points' })).toBe(1);
    expect(await Recipient.countDocuments({ tenantId: tenant._id, email: 'ada@recovery.test' })).toBe(1);
    const claim = await McpPointsDraftClaim.findOne({ tenantId: tenant._id, logicalKey: { $regex: /welcome points/ } });
    expect(String(claim.campaignId)).toBe(created.id);
  });
});

async function approvedPointsCampaign() {
  const wallet = await makeFundedWallet(tenant, { amount: 20_000 });
  const entity = await makeEntity(tenant, wallet);
  entity.managerUserId = actor.user._id;
  await entity.save();
  const shop = await makeShop(tenant);
  const campaign = await Campaign.create({
    tenantId: tenant._id,
    entityId: entity._id,
    shopId: shop._id,
    name: 'Launch once',
    type: 'points',
    status: 'approved',
    creditsPerRecipient: 1000,
    recipientCount: 1,
    totalBudget: 1000,
    schedule: { mode: 'now' },
    createdBy: actor.user._id,
  });
  const recipient = await Recipient.create({
    tenantId: tenant._id,
    campaignId: campaign._id,
    name: 'Ada',
    email: 'ada-launch@recovery.test',
    creditAmount: 1000,
    redemptionToken: `token-${campaign._id}`,
  });
  return { wallet, entity, campaign, recipient };
}

describe('campaign launch recovery', () => {
  it('launches once when several replicas start together', async () => {
    const { wallet, campaign } = await approvedPointsCampaign();
    const attempts = await Promise.allSettled(Array.from({ length: 4 }, () => launchCampaign({
      tenantId: tenant._id,
      campaignId: campaign._id,
      user: actorUser(),
    })));
    expect(attempts.some((attempt) => attempt.status === 'fulfilled')).toBe(true);
    const spend = await WalletTransaction.find({
      tenantId: tenant._id,
      idempotencyKey: `campaign_spend:${campaign._id}`,
    });
    expect(spend).toHaveLength(1);
    const freshWallet = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    expect(freshWallet.balance).toBe(19_000);
    const recipient = await Recipient.findOne({ tenantId: tenant._id, campaignId: campaign._id });
    expect(recipient.invitedAt).toBeTruthy();
    const notices = await Notification.countDocuments({ tenantId: tenant._id, type: 'campaign_launched' });
    expect(notices).toBe(1);
    const refunds = await WalletTransaction.countDocuments({
      tenantId: tenant._id,
      type: { $in: ['fund_in', 'refund'] },
      description: /refund|reversal/i,
    });
    expect(refunds).toBe(0);
  });

  it('sends missing invites after a debit without debiting or refunding again', async () => {
    const { wallet, campaign, recipient } = await approvedPointsCampaign();
    await ledger.createTransaction({
      tenantId: tenant._id,
      walletId: wallet._id,
      type: 'campaign_spend',
      amount: -1000,
      description: 'Campaign launch: Launch once',
      idempotencyKey: `campaign_spend:${campaign._id}`,
      performedBy: actor.user._id,
    });
    campaign.status = 'redemption_open';
    await campaign.save();
    const launched = await launchCampaign({
      tenantId: tenant._id,
      campaignId: campaign._id,
      user: actorUser(),
    });
    expect(launched.status).toBe('redemption_open');
    const invited = await Recipient.findOne({ _id: recipient._id, tenantId: tenant._id });
    expect(invited.invitedAt).toBeTruthy();
    const spend = await WalletTransaction.find({ tenantId: tenant._id, type: 'campaign_spend' });
    expect(spend).toHaveLength(1);
    const again = await launchCampaign({
      tenantId: tenant._id,
      campaignId: campaign._id,
      user: actorUser(),
    });
    expect(again.status).toBe('redemption_open');
    const still = await Recipient.findOne({ _id: recipient._id, tenantId: tenant._id });
    expect(new Date(still.invitedAt).toISOString()).toBe(new Date(invited.invitedAt).toISOString());
    expect(await Notification.countDocuments({ tenantId: tenant._id, type: 'campaign_launched' })).toBe(1);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'campaign_spend' })).toBe(1);
  });

  it('does not resend an invite whose delivery is already uncertain and does not refund', async () => {
    const { wallet, campaign, recipient } = await approvedPointsCampaign();
    await ledger.createTransaction({
      tenantId: tenant._id,
      walletId: wallet._id,
      type: 'campaign_spend',
      amount: -1000,
      description: 'Campaign launch: Launch once',
      idempotencyKey: `campaign_spend:${campaign._id}`,
    });
    campaign.status = 'redemption_open';
    await campaign.save();
    await Recipient.updateOne(
      { _id: recipient._id, tenantId: tenant._id },
      { $set: { inviteClaimedAt: new Date(Date.now() - 60_000) } },
    );
    const launched = await launchCampaign({
      tenantId: tenant._id,
      campaignId: campaign._id,
      user: actorUser(),
    });
    expect(launched.status).toBe('redemption_open');
    const stored = await Campaign.findOne({ _id: campaign._id, tenantId: tenant._id });
    expect(stored.schedule.invitesUnresolved).toBe(true);
    const invited = await Recipient.findOne({ _id: recipient._id, tenantId: tenant._id });
    expect(invited.invitedAt).toBeFalsy();
    expect(await Notification.countDocuments({ tenantId: tenant._id, type: 'campaign_launched' })).toBe(0);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'campaign_spend' })).toBe(1);
  });

  it('creates one fulfillment order when surprise launches race', async () => {
    const wallet = await makeFundedWallet(tenant, { amount: 50_000 });
    const entity = await makeEntity(tenant, wallet);
    const product = await CatalogProduct.create({
      sku: `SM-TEE-${Date.now()}`,
      name: 'Test Tee',
      category: 'Apparel',
      group: 'tee',
      basePriceInr: 500,
    });
    const kit = await Kit.create({
      tenantId: tenant._id,
      name: 'Surprise Kit',
      productRefs: [{ catalogProductId: product._id, name: 'Test Tee', brand: '', group: 'tee' }],
      status: 'live',
    });
    const contact = await Contact.create({
      tenantId: tenant._id,
      name: 'Ada',
      email: 'ada-surprise@recovery.test',
      address: { line1: '123 Street', city: 'Hyderabad', state: 'Telangana', pincode: '500001', country: 'IN' },
    });
    const campaign = await Campaign.create({
      tenantId: tenant._id,
      entityId: entity._id,
      name: 'Surprise once',
      type: 'kit',
      fulfillmentMode: 'surprise',
      kitId: kit._id,
      status: 'approved',
      recipientCount: 1,
      totalBudget: 500,
      schedule: { mode: 'now' },
      createdBy: actor.user._id,
    });
    await Recipient.create({
      tenantId: tenant._id,
      campaignId: campaign._id,
      contactId: contact._id,
      name: contact.name,
      email: contact.email,
      redemptionToken: `surprise-${campaign._id}`,
    });
    await Promise.allSettled(Array.from({ length: 3 }, () => launchCampaign({
      tenantId: tenant._id,
      campaignId: campaign._id,
      user: actorUser(),
    })));
    expect(await Order.countDocuments({ tenantId: tenant._id, campaignId: campaign._id })).toBe(1);
    expect(await WalletTransaction.countDocuments({
      tenantId: tenant._id,
      idempotencyKey: `campaign_spend:${campaign._id}`,
    })).toBe(1);
  });
});

describe('allocation and import idempotency', () => {
  it('replays credit allocation without rewriting recipients', async () => {
    const wallet = await makeFundedWallet(tenant);
    const entity = await makeEntity(tenant, wallet);
    const campaign = await Campaign.create({
      tenantId: tenant._id,
      entityId: entity._id,
      name: 'Allocate once',
      type: 'points',
      status: 'recipients_uploaded',
      recipientCount: 1,
      createdBy: actor.user._id,
    });
    const recipient = await Recipient.create({
      tenantId: tenant._id,
      campaignId: campaign._id,
      name: 'Ada',
      email: 'ada-alloc@recovery.test',
      redemptionToken: `alloc-${campaign._id}`,
    });
    await allocateCredits({
      tenantId: tenant._id,
      campaignId: campaign._id,
      user: actorUser(),
      creditsPerRecipient: 250,
      idempotencyKey: 'alloc-1',
    });
    const stamped = await Recipient.findOne({ _id: recipient._id, tenantId: tenant._id });
    const operation = mongoose.models.CampaignOperation;
    if (operation) {
      await operation.updateOne(
        { tenantId: tenant._id, key: 'alloc-1' },
        { $set: { status: 'pending', leaseOwner: 'replica-a', leaseExpiresAt: new Date(0), result: null } },
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
    await allocateCredits({
      tenantId: tenant._id,
      campaignId: campaign._id,
      user: actorUser(),
      creditsPerRecipient: 250,
      idempotencyKey: 'alloc-1',
    });
    const after = await Recipient.findOne({ _id: recipient._id, tenantId: tenant._id });
    expect(after.creditAmount).toBe(250);
    expect(new Date(after.updatedAt).toISOString()).toBe(new Date(stamped.updatedAt).toISOString());
  });

  it('keeps one recipient token when the same import is retried or raced', async () => {
    const wallet = await makeFundedWallet(tenant);
    const entity = await makeEntity(tenant, wallet);
    const campaign = await Campaign.create({
      tenantId: tenant._id,
      entityId: entity._id,
      name: 'Import once',
      type: 'points',
      status: 'draft',
      createdBy: actor.user._id,
    });
    const recipients = [{ name: 'Ada', email: 'ada-import@recovery.test' }];
    await importRecipients({
      tenantId: tenant._id,
      campaignId: campaign._id,
      user: actorUser(),
      recipients,
      idempotencyKey: 'import-1',
    });
    const first = await Recipient.findOne({ tenantId: tenant._id, campaignId: campaign._id });
    const operation = mongoose.models.CampaignOperation;
    if (operation) {
      await operation.updateOne(
        { tenantId: tenant._id, key: 'import-1' },
        { $set: { status: 'pending', leaseOwner: 'replica-a', leaseExpiresAt: new Date(0), result: null } },
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
    await importRecipients({
      tenantId: tenant._id,
      campaignId: campaign._id,
      user: actorUser(),
      recipients,
      idempotencyKey: 'import-1',
    });
    const replayed = await Recipient.findOne({ tenantId: tenant._id, campaignId: campaign._id });
    expect(replayed.redemptionToken).toBe(first.redemptionToken);
    expect(new Date(replayed.updatedAt).toISOString()).toBe(new Date(first.updatedAt).toISOString());
    await Promise.all(Array.from({ length: 3 }, (_, index) => importRecipients({
      tenantId: tenant._id,
      campaignId: campaign._id,
      user: actorUser(),
      recipients,
      idempotencyKey: `import-race-${index}`,
    })));
    expect(await Recipient.countDocuments({ tenantId: tenant._id, campaignId: campaign._id })).toBe(1);
    await expect(importRecipients({
      tenantId: tenant._id,
      campaignId: campaign._id,
      user: actorUser(),
      recipients: [{ name: 'Bea', email: 'bea-import@recovery.test' }],
      idempotencyKey: 'import-1',
    })).rejects.toMatchObject({ code: 'IDEMPOTENCY_PAYLOAD_MISMATCH' });
    expect(await Recipient.countDocuments({ tenantId: tenant._id, email: 'bea-import@recovery.test' })).toBe(0);
  });
});
