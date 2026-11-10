import { z } from 'zod';
import { ApiError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { assertEntityAccess } from '../../middleware/abac.middleware.js';
import { writeAudit } from '../../services/audit.service.js';
import { Campaign } from '../campaigns/campaign.model.js';
import { Recipient } from '../campaigns/recipient.model.js';
import { allocateCreditsSchema } from '../campaigns/campaigns.validation.js';
import {
  allocateCredits,
  assertWalletCanSpend,
  launchCampaign,
} from '../campaigns/campaigns.service.js';
import { WalletTransaction } from '../wallets/walletTransaction.model.js';
import * as ledger from '../../services/ledger.service.js';
import { employeeReaderFromContext } from './employeesRead.js';
import { executeMcpWrite, prepareMcpWrite } from './mcpWriteSafety.js';
import { maskWalletImpact, visibleFunds } from './walletVisibility.js';

const SEND_ROLES = new Set(rolesForTenantArea('campaignOps', 'write'));

const creditSchema = z.object({
  campaignId: z.string().trim().regex(/^[a-fA-F0-9]{24}$/),
  creditsPerRecipient: allocateCreditsSchema.shape.creditsPerRecipient,
}).strict();

const launchSchema = z.object({
  campaignId: z.string().trim().regex(/^[a-fA-F0-9]{24}$/),
}).strict();

export const CREDIT_PREPARE_DESCRIPTION = [
  'Preview reward credits for an existing Send Points campaign.',
  'Company admins and the campaign department manager only.',
  'Amount is INR per recipient: whole number, minimum ₹250. Wallet debit is recipient count times that INR amount (shipping is included; no extra fee is charged).',
  'A company admin debit comes from the organization wallet unallocated balance and does not reduce a department allocation. A department manager debit comes from that department remaining budget.',
  'For a department manager, balance and unallocatedAmount in this preview are that department remaining budget. They are not the organization wallet total, organization allocated total, or organization unallocated cash.',
  'Points stores convert at ₹1 = 2 Points. INR stores convert at ₹1 = 1 Credit. Points stay on the selected store.',
  'This step does not debit the wallet, create Contacts, or send invitations.',
].join(' ');

export const CREDIT_EXECUTE_DESCRIPTION = [
  'Apply the reward credits previewed for a points campaign.',
  'Requires the confirmation id and an idempotency key.',
  'Rechecks the campaign, recipients, and wallet before saving.',
  'For a department manager, balance and unallocatedAmount in the result are that department remaining budget, not organization wallet cash.',
  'A repeated key does not change the credits again.',
].join(' ');

export const LAUNCH_PREPARE_DESCRIPTION = [
  'Preview launching an approved Send Points campaign from the organization or department wallet.',
  'Delivery follows the draft schedule: immediately, at sendAt, or manual invite links (self).',
  'UPI and card checkout stay on the ShelfMerch hosted payment page. This tool only launches wallet-funded campaigns.',
  'Nothing is debited or sent by this preview. Ask for explicit confirmation before campaigns_execute_launch.',
  'For a department manager, walletImpact balance and unallocatedAmount are that department remaining budget. They are not organization wallet cash or unallocated cash.',
].join(' ');

export const LAUNCH_EXECUTE_DESCRIPTION = [
  'Launch the approved Send Points campaign from campaigns_prepare_launch after explicit confirmation.',
  'Requires the confirmation id and an idempotency key.',
  'Rechecks the wallet immediately before the debit. A company admin spends organization unallocated balance and does not reduce a department allocation. A department manager spends that department remaining budget. Immediate mode sends invitations once. Scheduled mode waits until sendAt. Self mode opens redemption without emailing invites.',
  'For a department manager, balance and unallocatedAmount in the result are that department remaining budget, not organization wallet cash.',
  'A repeated key does not debit the wallet or send those invitations again.',
].join(' ');

const walletImpactSchema = z.object({
  debitedNow: z.number(),
  balance: z.number(),
  unallocatedAmount: z.number(),
  requiredAtLaunch: z.number().optional(),
  balanceBefore: z.number().optional(),
  balanceAfter: z.number().optional(),
  unallocatedBefore: z.number().optional(),
  unallocatedAfter: z.number().optional(),
});

export const creditPrepareInputSchema = creditSchema;
export const creditExecuteInputSchema = creditSchema.extend({
  confirmationId: z.string().trim().min(20).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
});
export const launchPrepareInputSchema = launchSchema;
export const launchExecuteInputSchema = launchSchema.extend({
  confirmationId: z.string().trim().min(20).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
});

export const creditPrepareOutputSchema = z.object({
  confirmationId: z.string(),
  expiresAt: z.string(),
  preview: z.object({
    campaignId: z.string(),
    status: z.string(),
    recipientCount: z.number(),
    creditsPerRecipient: z.number(),
    totalBudget: z.number(),
    walletImpact: walletImpactSchema,
  }),
});
export const creditExecuteOutputSchema = z.object({
  campaignId: z.string(),
  status: z.string(),
  recipientCount: z.number(),
  creditsPerRecipient: z.number(),
  totalBudget: z.number(),
  balance: z.number(),
  unallocatedAmount: z.number(),
});
export const launchPrepareOutputSchema = z.object({
  confirmationId: z.string(),
  expiresAt: z.string(),
  preview: z.object({
    campaignId: z.string(),
    status: z.string(),
    recipientCount: z.number(),
    creditsPerRecipient: z.number(),
    totalBudget: z.number(),
    invitations: z.number(),
    deliveryMode: z.enum(['now', 'scheduled', 'self']).optional(),
    walletImpact: walletImpactSchema,
  }),
});
export const launchExecuteOutputSchema = z.object({
  campaignId: z.string(),
  status: z.string(),
  recipientCount: z.number(),
  totalBudget: z.number(),
  balance: z.number(),
  unallocatedAmount: z.number(),
  invitationsSent: z.number(),
  invitationsUnresolved: z.boolean(),
});

function invalidDetails() {
  return new ApiError(400, 'Campaign details are not valid', 'VALIDATION');
}

function businessInput(input) {
  if (!input || typeof input !== 'object') return {};
  const { confirmationId: _confirmationId, idempotencyKey: _idempotencyKey, ...rest } = input;
  return rest;
}

function parseCredit(input) {
  const raw = businessInput(input);
  if (typeof raw?.creditsPerRecipient === 'number') {
    if (!Number.isInteger(raw.creditsPerRecipient)) {
      throw new ApiError(400, 'Enter a whole number', 'VALIDATION');
    }
    if (raw.creditsPerRecipient < 250) {
      throw new ApiError(422, 'Minimum of ₹250 must be allocated', 'BUDGET_TOO_LOW');
    }
  }
  const parsed = creditSchema.safeParse(raw);
  if (!parsed.success) throw invalidDetails();
  return parsed.data;
}

function parseLaunch(input) {
  const parsed = launchSchema.safeParse(businessInput(input));
  if (!parsed.success) throw invalidDetails();
  return parsed.data;
}

function assertSender(actor, entityId) {
  if (!SEND_ROLES.has(actor?.user?.role)) {
    throw new ForbiddenError('Campaign sending requires a company admin or department manager');
  }
  assertEntityAccess(actor.user, entityId);
}

async function loadCampaign(tenantId, campaignId) {
  const campaign = await Campaign.findOne({ _id: campaignId, tenantId })
    .select('name type status entityId creditsPerRecipient recipientCount totalBudget paymentMode schedule fulfillmentMode isSample');
  if (!campaign) throw new NotFoundError('Campaign not found');
  return campaign;
}

function deliveryMode(campaign) {
  return campaign.schedule?.mode || 'now';
}

function assertPointsWalletCampaign(campaign) {
  if (campaign.type !== 'points') {
    throw new ApiError(422, 'Only points campaigns can be sent from this tool', 'CAMPAIGN_NOT_POINTS');
  }
  if (campaign.isSample) {
    throw new ApiError(422, 'Sample campaigns cannot be sent from this tool', 'CAMPAIGN_NOT_SENDABLE');
  }
  if (campaign.paymentMode && campaign.paymentMode !== 'wallet') {
    throw new ApiError(422, 'This campaign is not paid from the wallet', 'EXTERNAL_PAY_UNSUPPORTED');
  }
  const mode = deliveryMode(campaign);
  if (!['now', 'scheduled', 'self'].includes(mode)) {
    throw new ApiError(422, 'This delivery schedule is not supported', 'SCHEDULE_UNSUPPORTED');
  }
  if (mode === 'scheduled' && !campaign.schedule?.sendAt) {
    throw new ApiError(422, 'Scheduled campaigns require a send time', 'SCHEDULE_MISSING');
  }
}

function statusAfterLaunch(campaign) {
  return deliveryMode(campaign) === 'scheduled' ? 'launched' : 'redemption_open';
}

async function walletView(tenantId, entityId) {
  const { wallet } = await ledger.resolveSpendWalletForEntity({ tenantId, entityId });
  const balance = Number(wallet.balance) || 0;
  const allocatedAmount = Number(wallet.allocatedAmount) || 0;
  return { wallet, balance, allocatedAmount, unallocatedAmount: balance - allocatedAmount };
}

function spendKey(campaignId) {
  return `campaign_spend:${campaignId}`;
}

async function existingDebit(tenantId, campaignId) {
  return WalletTransaction.findOne({ tenantId, idempotencyKey: spendKey(campaignId) });
}

function projectedImpact(actor, wallet, totalBudget) {
  const debit = Math.round(totalBudget);
  const fromEntity = actor.user.scopeType === 'entity';
  const balanceAfter = wallet.balance - debit;
  const allocatedAfter = fromEntity ? wallet.allocatedAmount - debit : wallet.allocatedAmount;
  return {
    debitedNow: debit,
    balanceBefore: wallet.balance,
    balanceAfter,
    unallocatedBefore: wallet.unallocatedAmount,
    unallocatedAfter: balanceAfter - allocatedAfter,
    balance: wallet.balance,
    unallocatedAmount: wallet.unallocatedAmount,
  };
}

async function presentCredit(tenantId, campaignId, actor) {
  const campaign = await loadCampaign(tenantId, campaignId);
  const wallet = await walletView(tenantId, campaign.entityId);
  const funds = await visibleFunds(actor?.user, tenantId, campaign.entityId, wallet);
  return {
    campaignId: String(campaign._id),
    status: campaign.status,
    recipientCount: campaign.recipientCount,
    creditsPerRecipient: campaign.creditsPerRecipient,
    totalBudget: campaign.totalBudget,
    balance: funds.balance,
    unallocatedAmount: funds.unallocatedAmount,
  };
}

async function presentLaunch(tenantId, campaignId, actor) {
  const campaign = await loadCampaign(tenantId, campaignId);
  const wallet = await walletView(tenantId, campaign.entityId);
  const funds = await visibleFunds(actor?.user, tenantId, campaign.entityId, wallet);
  const invitationsSent = await Recipient.countDocuments({
    tenantId,
    campaignId: campaign._id,
    invitedAt: { $ne: null },
  });
  const claimedUnsent = await Recipient.countDocuments({
    tenantId,
    campaignId: campaign._id,
    invitedAt: null,
    inviteClaimedAt: { $ne: null },
  });
  return {
    campaignId: String(campaign._id),
    status: campaign.status,
    recipientCount: campaign.recipientCount,
    totalBudget: campaign.totalBudget,
    balance: funds.balance,
    unallocatedAmount: funds.unallocatedAmount,
    invitationsSent,
    invitationsUnresolved: Boolean(campaign.schedule?.invitesUnresolved) || claimedUnsent > 0,
  };
}

async function prepareCreditState(tenantId, actor, requested) {
  const campaign = await loadCampaign(tenantId, requested.campaignId);
  assertSender(actor, campaign.entityId);
  assertPointsWalletCampaign(campaign);
  const recipientCount = await Recipient.countDocuments({ tenantId, campaignId: campaign._id });
  if (recipientCount === 0) {
    throw new ApiError(422, 'Upload recipients before allocating credits', 'NO_RECIPIENTS');
  }
  const totalBudget = requested.creditsPerRecipient * recipientCount;
  const same = campaign.creditsPerRecipient === requested.creditsPerRecipient
    && campaign.totalBudget === totalBudget
    && ['credits_allocated', 'approved', 'launched', 'redemption_open'].includes(campaign.status);
  if (!same && campaign.status !== 'recipients_uploaded') {
    throw new ApiError(409, 'Credits can no longer be changed for this campaign', 'CAMPAIGN_LOCKED');
  }
  if (!same) {
    await assertWalletCanSpend({
      tenantId,
      entityId: campaign.entityId,
      amount: totalBudget,
      user: actor.user,
    });
  }
  const wallet = await walletView(tenantId, campaign.entityId);
  return { campaign, recipientCount, totalBudget, wallet, same };
}

export async function prepareCreditAllocation({ tenantId, actorUserId, input, now }) {
  const requested = parseCredit(input);
  const planned = {};
  const prepared = await prepareMcpWrite({
    tenantId,
    actorUserId,
    operation: 'campaigns.allocate_credits',
    payload: requested,
    now,
    authorize: async (actor) => {
      planned.actor = actor;
      planned.state = await prepareCreditState(tenantId, actor, requested);
    },
    validate: async () => requested,
    resourceState: async () => ({
      campaignId: String(planned.state.campaign._id),
      status: planned.state.campaign.status,
      creditsPerRecipient: planned.state.campaign.creditsPerRecipient,
      totalBudget: planned.state.campaign.totalBudget,
      recipientCount: planned.state.recipientCount,
      balance: planned.state.wallet.balance,
      allocatedAmount: planned.state.wallet.allocatedAmount,
    }),
    summary: async () => ({
      action: 'preview',
      campaignId: requested.campaignId,
      recipientCount: planned.state.recipientCount,
      totalBudget: planned.state.totalBudget,
    }),
  });
  const state = planned.state;
  const funds = await visibleFunds(planned.actor?.user, tenantId, state.campaign.entityId, state.wallet);
  return {
    confirmationId: prepared.confirmationId,
    expiresAt: prepared.expiresAt,
    preview: {
      campaignId: String(state.campaign._id),
      status: state.same ? state.campaign.status : 'approved',
      recipientCount: state.recipientCount,
      creditsPerRecipient: requested.creditsPerRecipient,
      totalBudget: state.totalBudget,
      walletImpact: maskWalletImpact(funds, {
        debitedNow: 0,
        requiredAtLaunch: state.totalBudget,
        balance: state.wallet.balance,
        unallocatedAmount: state.wallet.unallocatedAmount,
      }),
    },
  };
}

export async function executeCreditAllocation({
  tenantId,
  actorUserId,
  input,
  confirmationId,
  idempotencyKey,
  now,
}) {
  const requested = parseCredit(input);
  return executeMcpWrite({
    tenantId,
    actorUserId,
    operation: 'campaigns.allocate_credits',
    payload: requested,
    confirmationId,
    idempotencyKey,
    now,
    authorize: async (actor) => {
      const campaign = await loadCampaign(tenantId, requested.campaignId);
      assertSender(actor, campaign.entityId);
      assertPointsWalletCampaign(campaign);
    },
    validate: async () => requested,
    resourceState: async () => creditSnapshot(tenantId, requested.campaignId),
    reconcile: async (actor) => {
      const campaign = await Campaign.findOne({ _id: requested.campaignId, tenantId })
        .select('status creditsPerRecipient totalBudget recipientCount');
      if (!campaign) return { outcome: 'uncertain' };
      const count = await Recipient.countDocuments({ tenantId, campaignId: campaign._id });
      const applied = campaign.creditsPerRecipient === requested.creditsPerRecipient
        && campaign.totalBudget === requested.creditsPerRecipient * count
        && ['credits_allocated', 'approved', 'launched', 'redemption_open'].includes(campaign.status);
      if (applied) return { outcome: 'completed', result: await presentCredit(tenantId, campaign._id, actor) };
      if (campaign.status === 'recipients_uploaded') return { outcome: 'absent' };
      return { outcome: 'uncertain' };
    },
    execute: async (actor) => {
      const state = await prepareCreditState(tenantId, actor, requested);
      if (!state.same) {
        await allocateCredits({
          tenantId,
          campaignId: requested.campaignId,
          user: actor.user,
          creditsPerRecipient: requested.creditsPerRecipient,
          idempotencyKey: `credits:${confirmationId}`,
        });
      }
      const result = await presentCredit(tenantId, requested.campaignId, actor);
      await writeAudit({
        tenantId,
        req: { tenantId, user: { userId: actor.user.userId, role: actor.user.role } },
        action: 'campaign.allocate_credits',
        entityType: 'Campaign',
        entityId: requested.campaignId,
        after: { recipientCount: result.recipientCount, totalBudget: result.totalBudget, status: result.status },
      });
      return result;
    },
  });
}

async function prepareLaunchState(tenantId, actor, requested) {
  const campaign = await loadCampaign(tenantId, requested.campaignId);
  assertSender(actor, campaign.entityId);
  assertPointsWalletCampaign(campaign);
  const launched = ['launched', 'redemption_open'].includes(campaign.status);
  if (!launched && campaign.status !== 'approved') {
    throw new ApiError(422, 'Campaign must be approved before launch', 'CAMPAIGN_NOT_APPROVED');
  }
  if (!campaign.totalBudget || campaign.totalBudget < 250) {
    throw new ApiError(422, 'Minimum of ₹250 must be allocated', 'BUDGET_TOO_LOW');
  }
  const debit = await existingDebit(tenantId, campaign._id);
  if (!launched && !debit) {
    await assertWalletCanSpend({
      tenantId,
      entityId: campaign.entityId,
      amount: campaign.totalBudget,
      user: actor.user,
    });
  }
  const wallet = await walletView(tenantId, campaign.entityId);
  return { campaign, wallet, launched, debit };
}

export async function prepareLaunch({ tenantId, actorUserId, input, now }) {
  const requested = parseLaunch(input);
  const planned = {};
  const prepared = await prepareMcpWrite({
    tenantId,
    actorUserId,
    operation: 'campaigns.launch',
    payload: requested,
    now,
    authorize: async (actor) => {
      planned.actor = actor;
      planned.state = await prepareLaunchState(tenantId, actor, requested);
    },
    validate: async () => requested,
    resourceState: async () => {
      const state = planned.state;
      return {
        campaignId: String(state.campaign._id),
        status: state.campaign.status,
        totalBudget: state.campaign.totalBudget,
        balance: state.wallet.balance,
        allocatedAmount: state.wallet.allocatedAmount,
        debited: Boolean(state.debit),
      };
    },
    summary: async () => ({
      action: 'preview',
      campaignId: requested.campaignId,
      totalBudget: planned.state.campaign.totalBudget,
    }),
  });
  const state = planned.state;
  const funds = await visibleFunds(planned.actor?.user, tenantId, state.campaign.entityId, state.wallet);
  const impact = maskWalletImpact(
    funds,
    state.launched || state.debit
      ? {
        debitedNow: 0,
        balance: state.wallet.balance,
        unallocatedAmount: state.wallet.unallocatedAmount,
        balanceBefore: state.wallet.balance,
        balanceAfter: state.wallet.balance,
        unallocatedBefore: state.wallet.unallocatedAmount,
        unallocatedAfter: state.wallet.unallocatedAmount,
      }
      : projectedImpact(planned.actor, state.wallet, state.campaign.totalBudget),
  );
  return {
    confirmationId: prepared.confirmationId,
    expiresAt: prepared.expiresAt,
    preview: {
      campaignId: String(state.campaign._id),
      status: state.launched ? state.campaign.status : statusAfterLaunch(state.campaign),
      recipientCount: state.campaign.recipientCount,
      creditsPerRecipient: state.campaign.creditsPerRecipient,
      totalBudget: state.campaign.totalBudget,
      deliveryMode: deliveryMode(state.campaign),
      invitations: deliveryMode(state.campaign) === 'now' ? state.campaign.recipientCount : 0,
      walletImpact: impact,
    },
  };
}

export async function executeLaunch({
  tenantId,
  actorUserId,
  input,
  confirmationId,
  idempotencyKey,
  now,
}) {
  const requested = parseLaunch(input);
  return executeMcpWrite({
    tenantId,
    actorUserId,
    operation: 'campaigns.launch',
    payload: requested,
    confirmationId,
    idempotencyKey,
    now,
    authorize: async (actor) => {
      const campaign = await loadCampaign(tenantId, requested.campaignId);
      assertSender(actor, campaign.entityId);
      assertPointsWalletCampaign(campaign);
    },
    validate: async () => requested,
    resourceState: async () => launchSnapshot(tenantId, requested.campaignId),
    reconcile: async (actor) => {
      const campaign = await Campaign.findOne({ _id: requested.campaignId, tenantId }).select('status totalBudget schedule');
      if (!campaign) return { outcome: 'uncertain' };
      const debit = await existingDebit(tenantId, campaign._id);
      const launched = ['launched', 'redemption_open'].includes(campaign.status);
      if (launched && (campaign.totalBudget === 0 || debit)) {
        const mode = campaign.schedule?.mode || 'now';
        if (mode !== 'now') {
          return { outcome: 'completed', result: await presentLaunch(tenantId, campaign._id, actor) };
        }
        const pending = await Recipient.countDocuments({
          tenantId,
          campaignId: campaign._id,
          invitedAt: null,
          inviteClaimedAt: null,
        });
        if (pending === 0) return { outcome: 'completed', result: await presentLaunch(tenantId, campaign._id, actor) };
      }
      return { outcome: 'absent' };
    },
    execute: async (actor) => {
      const state = await prepareLaunchState(tenantId, actor, requested);
      if (!state.launched && !state.debit) {
        await assertWalletCanSpend({
          tenantId,
          entityId: state.campaign.entityId,
          amount: state.campaign.totalBudget,
          user: actor.user,
        });
      }
      await launchCampaign({
        tenantId,
        campaignId: requested.campaignId,
        user: actor.user,
        paymentMode: 'wallet',
      });
      const result = await presentLaunch(tenantId, requested.campaignId, actor);
      await writeAudit({
        tenantId,
        req: { tenantId, user: { userId: actor.user.userId, role: actor.user.role } },
        action: 'campaign.launch',
        entityType: 'Campaign',
        entityId: requested.campaignId,
        after: {
          status: result.status,
          totalBudget: result.totalBudget,
          invitationsSent: result.invitationsSent,
          invitationsUnresolved: result.invitationsUnresolved,
        },
      });
      return result;
    },
  });
}


async function creditSnapshot(tenantId, campaignId) {
  const campaign = await loadCampaign(tenantId, campaignId);
  const recipientCount = await Recipient.countDocuments({ tenantId, campaignId: campaign._id });
  const wallet = await walletView(tenantId, campaign.entityId);
  return {
    campaignId: String(campaign._id),
    status: campaign.status,
    creditsPerRecipient: campaign.creditsPerRecipient,
    totalBudget: campaign.totalBudget,
    recipientCount,
    balance: wallet.balance,
    allocatedAmount: wallet.allocatedAmount,
  };
}

async function launchSnapshot(tenantId, campaignId) {
  const campaign = await loadCampaign(tenantId, campaignId);
  const wallet = await walletView(tenantId, campaign.entityId);
  const debit = await existingDebit(tenantId, campaign._id);
  return {
    campaignId: String(campaign._id),
    status: campaign.status,
    totalBudget: campaign.totalBudget,
    balance: wallet.balance,
    allocatedAmount: wallet.allocatedAmount,
    debited: Boolean(debit),
  };
}

function requireCaller(ctx) {
  const caller = employeeReaderFromContext(ctx);
  if (!caller.tenantId || !caller.user.userId) {
    throw new ForbiddenError('Campaign sending is not available for this account');
  }
  return caller;
}

export async function prepareCreditAllocationForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return prepareCreditAllocation({ tenantId: caller.tenantId, actorUserId: caller.user.userId, input: args });
}

export async function executeCreditAllocationForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return executeCreditAllocation({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
    confirmationId: args?.confirmationId,
    idempotencyKey: args?.idempotencyKey,
  });
}

export async function prepareLaunchForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return prepareLaunch({ tenantId: caller.tenantId, actorUserId: caller.user.userId, input: args });
}

export async function executeLaunchForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return executeLaunch({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
    confirmationId: args?.confirmationId,
    idempotencyKey: args?.idempotencyKey,
  });
}

export function campaignSendText(output, heading) {
  const preview = output.preview;
  if (preview) {
    return [heading, `${preview.recipientCount} recipients, total ${preview.totalBudget} INR`, 'Confirm this preview before it expires.'].join('\n');
  }
  if (output.invitationsUnresolved) {
    return [heading, `Status ${output.status}. ${output.invitationsSent} invitations delivered. Some invitations are unresolved and were not sent again.`].join('\n');
  }
  return [heading, `Status ${output.status}, total ${output.totalBudget} INR`].join('\n');
}

const WRITE_ERRORS = {
  FORBIDDEN: 'You cannot send this campaign.',
  NOT_FOUND: 'That campaign was not found.',
  VALIDATION: 'Campaign details are not valid.',
  BUDGET_TOO_LOW: 'Minimum of 250 INR must be allocated per recipient.',
  NO_RECIPIENTS: 'Add recipients before allocating credits.',
  CAMPAIGN_LOCKED: 'Credits can no longer be changed for this campaign.',
  CAMPAIGN_NOT_POINTS: 'Only points campaigns can be sent from this tool.',
  CAMPAIGN_NOT_SENDABLE: 'This campaign cannot be sent from this tool.',
  CAMPAIGN_NOT_APPROVED: 'Approve the campaign before launch.',
  EXTERNAL_PAY_UNSUPPORTED: 'This campaign is not paid from the wallet.',
  SCHEDULE_UNSUPPORTED: 'Only campaigns that send now are supported.',
  INSUFFICIENT_FUNDS: 'The wallet does not have enough available budget.',
  INSUFFICIENT_ENTITY_BUDGET: 'The department does not have enough remaining budget.',
  LAUNCH_IN_PROGRESS: 'This campaign launch is already in progress.',
  CONFIRMATION_STALE: 'This preview is out of date. Prepare it again.',
  CONFIRMATION_EXPIRED: 'This confirmation has expired. Prepare it again.',
  CONFIRMATION_REUSED: 'This confirmation was already used.',
  CONFIRMATION_INVALID: 'This confirmation is not valid.',
  CONFIRMATION_MISMATCH: 'This confirmation does not match the requested change.',
  IDEMPOTENCY_PAYLOAD_MISMATCH: 'This idempotency key was used for a different change.',
  IDEMPOTENT_REPLAY_IN_FLIGHT: 'This campaign change is already in progress.',
  IDEMPOTENCY_RECONCILIATION_REQUIRED: 'This campaign change needs to be checked before it can be retried.',
  ACTOR_INACTIVE: 'This account cannot send campaigns.',
  TENANT_INACTIVE: 'This workspace cannot send campaigns.',
};

export function campaignSendError(error, fallback) {
  return WRITE_ERRORS[error?.code] || fallback;
}
