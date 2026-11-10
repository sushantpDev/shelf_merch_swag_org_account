import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeEntity, makeFundedWallet, makeTenant, makeUser } from './helpers.js';
import { Campaign } from '../src/modules/campaigns/campaign.model.js';
import { Recipient } from '../src/modules/campaigns/recipient.model.js';
import { launchCampaign } from '../src/modules/campaigns/campaigns.service.js';
import { McpWriteIdempotency } from '../src/modules/mcp/mcpWriteIdempotency.model.js';
import {
  executeCreditAllocation,
  executeLaunch,
  prepareCreditAllocation,
  prepareLaunch,
} from '../src/modules/mcp/campaignsSendWrite.js';
import {
  executeBudgetAllocation,
  prepareBudgetAllocation,
} from '../src/modules/mcp/budgetsWrite.js';
import { SlackConnection } from '../src/modules/integrations/slack/slackConnection.model.js';
import { SlackNotificationReceipt } from '../src/modules/integrations/slack/slackNotificationReceipt.model.js';
import { flushPendingSlackNotifications } from '../src/modules/integrations/slack/slackNotify.service.js';
import { encryptToken } from '../src/utils/tokenEncryption.js';
import * as envModule from '../src/config/env.js';

vi.mock('../src/modules/notifications/notifications.service.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, notify: vi.fn(async () => ({ queued: true })) };
});

const BOT = 'xoxb-mcp-slack-test';

let tenant;
let admin;
let wallet;
let entity;
let fetchMock;

function mockJson(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

async function connectSlack(overrides = {}) {
  const { notifications, ...rest } = overrides;
  await SlackConnection.create({
    tenantId: tenant._id,
    teamId: 'T_MCP',
    teamName: 'ShelfMerch Slack',
    encryptedBotToken: encryptToken(BOT),
    installedByUserId: admin.user._id,
    status: 'connected',
    connectedAt: new Date(),
    defaultChannelId: 'C_DEFAULT',
    defaultChannelName: 'employee-gifting',
    notifications: {
      walletApproved: true,
      budgetAssigned: true,
      lowBudget: true,
      pointsDistributed: true,
      kitsAssigned: true,
      orderDispatched: true,
      deliveryFailed: true,
      shopLaunched: true,
      ...notifications,
    },
    ...rest,
  });
}

async function postedEvents() {
  await flushPendingSlackNotifications();
  return fetchMock.mock.calls.map((call) => JSON.parse(call[1].body).text);
}

beforeAll(async () => {
  await connectTestDb();
  vi.spyOn(envModule, 'slackConfigured').mockReturnValue(true);
  envModule.env.TOKEN_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  envModule.env.APP_URL = 'https://shelfmerch.io';
});

afterAll(async () => {
  vi.restoreAllMocks();
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  tenant = await makeTenant({ slug: 'mcp-slack' });
  admin = await makeUser(tenant, 'company_admin', 'tenant');
  wallet = await makeFundedWallet(tenant, { name: 'Operating', amount: 10_000 });
  entity = await makeEntity(tenant, wallet, 'Marketing');
  fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockJson({ ok: true, ts: '1' }));
});

afterEach(() => {
  fetchMock.mockRestore();
});

async function approvedPointsCampaign() {
  const campaign = await Campaign.create({
    tenantId: tenant._id,
    entityId: entity._id,
    name: 'Welcome points',
    type: 'points',
    status: 'recipients_uploaded',
    paymentMode: 'wallet',
    schedule: { mode: 'now' },
    createdBy: admin.user._id,
  });
  await Recipient.create({
    tenantId: tenant._id,
    campaignId: campaign._id,
    name: 'Ada',
    email: 'hidden-recipient@test.io',
    redemptionToken: 'super-secret-token',
  });
  const input = { campaignId: String(campaign._id), creditsPerRecipient: 250 };
  const prepared = await prepareCreditAllocation({ tenantId: tenant._id, actorUserId: admin.user._id, input });
  await executeCreditAllocation({
    tenantId: tenant._id,
    actorUserId: admin.user._id,
    input,
    confirmationId: prepared.confirmationId,
    idempotencyKey: 'slack-credits',
  });
  return campaign;
}

describe('MCP Slack notifications', () => {
  it('sends one points message after launch and does not send it again on replay or crash recovery', async () => {
    await connectSlack();
    const campaign = await approvedPointsCampaign();
    const preview = await prepareLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
    });
    expect(await postedEvents()).toEqual([]);

    const launched = await executeLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
      confirmationId: preview.confirmationId,
      idempotencyKey: 'slack-launch',
    });
    const first = await postedEvents();
    expect(first).toHaveLength(1);
    expect(first[0]).toContain('points');
    expect(JSON.stringify(launched)).not.toContain(BOT);
    expect(JSON.stringify(launched)).not.toContain('hidden-recipient@test.io');

    await executeLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
      confirmationId: preview.confirmationId,
      idempotencyKey: 'slack-launch',
    });
    expect(await postedEvents()).toHaveLength(1);

    await McpWriteIdempotency.updateOne(
      { key: 'slack-launch', tenantId: tenant._id },
      { $set: { status: 'pending', result: null, errorCode: '', leaseOwner: 'crashed', leaseExpiresAt: new Date(0) } },
    );
    await executeLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
      confirmationId: preview.confirmationId,
      idempotencyKey: 'slack-launch',
    });
    expect(await postedEvents()).toHaveLength(1);
    expect(await SlackNotificationReceipt.countDocuments({ tenantId: tenant._id, eventType: 'POINTS_DISTRIBUTED' })).toBe(1);
  });

  it('sends the points message when a crashed launch is recovered before the notification was claimed', async () => {
    await connectSlack();
    const campaign = await Campaign.create({
      tenantId: tenant._id,
      entityId: entity._id,
      name: 'Recovered points',
      type: 'points',
      status: 'redemption_open',
      paymentMode: 'wallet',
      totalBudget: 250,
      recipientCount: 1,
      schedule: { mode: 'now', invitesSentAt: new Date() },
      createdBy: admin.user._id,
    });
    const user = { userId: admin.user._id, role: 'company_admin', scopeType: 'tenant', assignedEntityIds: [] };
    await launchCampaign({ tenantId: tenant._id, campaignId: campaign._id, user });
    await launchCampaign({ tenantId: tenant._id, campaignId: campaign._id, user });
    const posts = await postedEvents();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toContain('points');
    expect(await SlackNotificationReceipt.countDocuments({ tenantId: tenant._id, eventKey: `POINTS_DISTRIBUTED:${campaign._id}` })).toBe(1);
  });

  it('sends one kit message when a recovered kit launch had not notified yet', async () => {
    await connectSlack();
    const campaign = await Campaign.create({
      tenantId: tenant._id,
      entityId: entity._id,
      name: 'Recovered kits',
      type: 'kit',
      status: 'redemption_open',
      paymentMode: 'wallet',
      fulfillmentMode: 'surprise',
      totalBudget: 500,
      recipientCount: 1,
      schedule: { mode: 'now', invitesSentAt: new Date() },
      createdBy: admin.user._id,
    });
    const user = { userId: admin.user._id, role: 'company_admin', scopeType: 'tenant', assignedEntityIds: [] };
    await launchCampaign({ tenantId: tenant._id, campaignId: campaign._id, user });
    await launchCampaign({ tenantId: tenant._id, campaignId: campaign._id, user });
    const posts = await postedEvents();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toContain('Kit');
    expect(await SlackNotificationReceipt.countDocuments({ tenantId: tenant._id, eventType: 'KITS_ASSIGNED' })).toBe(1);
  });

  it('sends one budget message after allocation and does not send it on preview or retry', async () => {
    await connectSlack();
    const input = { walletId: String(wallet._id), allocations: [{ entityId: String(entity._id), amount: 500 }] };
    const prepared = await prepareBudgetAllocation({ tenantId: tenant._id, actorUserId: admin.user._id, input });
    expect(await postedEvents()).toEqual([]);
    const allocated = await executeBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'slack-budget',
    });
    const first = await postedEvents();
    expect(first).toHaveLength(1);
    expect(first[0]).toContain('Marketing');
    expect(JSON.stringify(allocated)).not.toContain(BOT);

    await executeBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'slack-budget',
    });
    expect(await postedEvents()).toHaveLength(1);

    await McpWriteIdempotency.updateOne(
      { key: 'slack-budget', tenantId: tenant._id },
      { $set: { status: 'pending', result: null, errorCode: '', leaseOwner: 'crashed', leaseExpiresAt: new Date(0) } },
    );
    await executeBudgetAllocation({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'slack-budget',
    });
    expect(await postedEvents()).toHaveLength(1);
    expect(await SlackNotificationReceipt.countDocuments({ tenantId: tenant._id, eventType: 'BUDGET_ASSIGNED' })).toBe(1);
  });

  it('respects a disabled preference and a disconnected workspace', async () => {
    await connectSlack({ notifications: { pointsDistributed: false } });
    const campaign = await approvedPointsCampaign();
    const preview = await prepareLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
    });
    await executeLaunch({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { campaignId: String(campaign._id) },
      confirmationId: preview.confirmationId,
      idempotencyKey: 'slack-disabled',
    });
    expect(await postedEvents()).toEqual([]);

    await SlackConnection.updateOne({ tenantId: tenant._id }, { $set: { status: 'disconnected', 'notifications.pointsDistributed': true } });
    const second = await Campaign.create({
      tenantId: tenant._id,
      entityId: entity._id,
      name: 'Second points',
      type: 'points',
      status: 'redemption_open',
      paymentMode: 'wallet',
      totalBudget: 250,
      recipientCount: 1,
      schedule: { mode: 'now', invitesSentAt: new Date() },
      createdBy: admin.user._id,
    });
    await launchCampaign({
      tenantId: tenant._id,
      campaignId: second._id,
      user: { userId: admin.user._id, role: 'company_admin', scopeType: 'tenant', assignedEntityIds: [] },
    });
    expect(await postedEvents()).toEqual([]);
    expect(await SlackNotificationReceipt.countDocuments({ tenantId: tenant._id })).toBe(0);
  });
});
