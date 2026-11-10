import { z } from 'zod';
import { ApiError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { assertEntityAccess } from '../../middleware/abac.middleware.js';
import { writeAudit } from '../../services/audit.service.js';
import { objectId } from '../users/users.validation.js';
import { Entity } from '../entities/entity.model.js';
import { Shop } from '../shops/shop.model.js';
import { Kit } from '../kits/kit.model.js';
import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { Contact } from '../contacts/contact.model.js';
import { Campaign } from '../campaigns/campaign.model.js';
import { Recipient } from '../campaigns/recipient.model.js';
import { Order } from '../orders/order.model.js';
import { WalletTransaction } from '../wallets/walletTransaction.model.js';
import { createCampaign, importRecipients, launchCampaign, assertWalletCanSpend } from '../campaigns/campaigns.service.js';
import { customisedKitSendTotals, curatedKitSendTotals } from '../kits/kitPricing.js';
import { isCuratedKitMeta, parseCuratedKitMeta, resolveCuratedApproxValueInr } from '../kits/curatedKitMeta.js';
import * as ledger from '../../services/ledger.service.js';
import { employeeReaderFromContext } from './employeesRead.js';
import { executeMcpWrite, prepareMcpWrite } from './mcpWriteSafety.js';
import { maskWalletImpact, visibleFunds } from './walletVisibility.js';
import { McpMerchandiseClaim } from './mcpMerchandiseClaim.model.js';

const ROLES = new Set(rolesForTenantArea('campaignOps', 'write'));
const SUPPORTED_FULFILLMENT = ['surprise', 'single', 'redeem'];

const recipientSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(200),
  contactId: objectId.optional(),
  variants: z.record(z.string(), z.object({
    size: z.string().max(80).optional(),
    color: z.string().max(80).optional(),
  })).optional(),
});

const locationSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().min(1).max(80),
  pincode: z.string().trim().min(1).max(12),
  country: z.string().trim().min(2).max(8).optional(),
});

const draftSchema = z.object({
  entityId: objectId,
  shopId: objectId,
  kitId: objectId,
  name: z.string().trim().min(1).max(160),
  fulfillmentMode: z.enum(['surprise', 'single', 'redeem']),
  packaging: z.enum(['none', 'box']).optional(),
  recipients: z.array(recipientSchema).min(1).max(500),
  singleLocation: locationSchema.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.fulfillmentMode === 'single' && !value.singleLocation) {
    ctx.addIssue({ code: 'custom', message: 'Single-location delivery details are required', path: ['singleLocation'] });
  }
  if (value.fulfillmentMode !== 'single' && value.singleLocation) {
    ctx.addIssue({ code: 'custom', message: 'Delivery details are only used for a single location', path: ['singleLocation'] });
  }
});

const launchSchema = z.object({
  campaignId: z.string().trim().regex(/^[a-f\d]{24}$/i),
}).strict();

export const MERCHANDISE_PREPARE_DRAFT_DESCRIPTION = [
  'Preview a kit campaign without saving it, debiting a wallet, or creating orders.',
  'Supports surprise delivery, one shared delivery location, and a private link where the recipient chooses the variant and address.',
  'A private link does not create a fulfillment order until the recipient submits it.',
  'Company admins and the campaign department manager can prepare it.',
  'Shows item quantities, the recipient count, the server-priced total, and the wallet impact.',
  'For a department manager, balance and unallocatedAmount are that department remaining budget, not organization wallet cash.',
  'Redeem-later, sample, and card or UPI sends are not available here.',
].join(' ');

export const MERCHANDISE_EXECUTE_DRAFT_DESCRIPTION = [
  'Save the kit campaign previewed by campaigns_prepare_merchandise_draft.',
  'Requires the confirmation id and an idempotency key.',
  'Rechecks the kit, recipients, and wallet before saving.',
  'Approves the campaign for launch and does not debit the wallet or send invitations.',
  'A repeated key returns the same campaign.',
  'For a department manager, balance and unallocatedAmount are that department remaining budget, not organization wallet cash.',
].join(' ');

export const MERCHANDISE_PREPARE_LAUNCH_DESCRIPTION = [
  'Preview launching an approved kit campaign.',
  'Shows the order behavior, recipient count, total, and wallet debit.',
  'For a department manager, balance and unallocatedAmount are that department remaining budget, not organization wallet cash.',
  'Nothing is debited or sent by this preview.',
].join(' ');

export const MERCHANDISE_EXECUTE_LAUNCH_DESCRIPTION = [
  'Launch the kit campaign from campaigns_prepare_merchandise_launch.',
  'Requires the confirmation id and an idempotency key.',
  'Creates fulfillment orders, debits the wallet once, and delivers invitations through the existing campaign service.',
  'A retry does not debit again, create another order, or resend an invitation that was already delivered.',
  'For a department manager, balance and unallocatedAmount are that department remaining budget, not organization wallet cash.',
].join(' ');

const itemSchema = z.object({ name: z.string(), quantity: z.number().int() });
const impactSchema = z.object({
  debitedNow: z.number(),
  balance: z.number(),
  unallocatedAmount: z.number(),
  requiredAtLaunch: z.number().optional(),
  balanceBefore: z.number().optional(),
  balanceAfter: z.number().optional(),
});

export const merchandisePrepareDraftInputSchema = draftSchema;
export const merchandiseExecuteDraftInputSchema = draftSchema.extend({
  confirmationId: z.string().trim().min(20).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
});
export const merchandisePrepareDraftOutputSchema = z.object({
  confirmationId: z.string(),
  expiresAt: z.string(),
  preview: z.object({
    name: z.string(),
    type: z.literal('kit'),
    fulfillmentMode: z.enum(['surprise', 'single', 'redeem']),
    fulfillment: z.string(),
    recipientCount: z.number().int(),
    packaging: z.string(),
    items: z.array(itemSchema),
    totalBudget: z.number(),
    tax: z.number(),
    walletImpact: impactSchema,
  }),
});
export const merchandiseExecuteDraftOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  type: z.literal('kit'),
  fulfillmentMode: z.string(),
  recipientCount: z.number().int(),
  totalBudget: z.number(),
  balance: z.number(),
  unallocatedAmount: z.number(),
});
export const merchandisePrepareLaunchInputSchema = launchSchema;
export const merchandiseExecuteLaunchInputSchema = launchSchema.extend({
  confirmationId: z.string().trim().min(20).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
});
export const merchandisePrepareLaunchOutputSchema = z.object({
  confirmationId: z.string(),
  expiresAt: z.string(),
  preview: z.object({
    campaignId: z.string(),
    status: z.string(),
    fulfillment: z.string(),
    recipientCount: z.number().int(),
    orderCount: z.number().int(),
    items: z.array(itemSchema),
    totalBudget: z.number(),
    walletImpact: impactSchema,
  }),
});
export const merchandiseExecuteLaunchOutputSchema = z.object({
  campaignId: z.string(),
  status: z.string(),
  recipientCount: z.number().int(),
  orderCount: z.number().int(),
  totalBudget: z.number(),
  balance: z.number(),
  unallocatedAmount: z.number(),
  invitationsSent: z.number().int(),
  invitationsUnresolved: z.boolean(),
});

function invalid(message = 'Kit campaign details are not valid') {
  return new ApiError(400, message, 'VALIDATION');
}

function businessInput(input) {
  if (!input || typeof input !== 'object') return {};
  const { confirmationId: _confirmationId, idempotencyKey: _idempotencyKey, ...rest } = input;
  return rest;
}

function assertRole(actor, entityId) {
  if (!ROLES.has(actor?.user?.role)) {
    throw new ForbiddenError('Kit campaigns require a company admin or department manager');
  }
  assertEntityAccess(actor.user, entityId);
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function logicalKey(input) {
  return `merch:${input.entityId}:${input.kitId}:${normalizeName(input.name)}:${input.fulfillmentMode}`;
}

function fulfillmentLabel(mode) {
  if (mode === 'single') return 'single_location';
  if (mode === 'redeem') return 'recipient_chooses_later';
  return 'one_order_per_recipient';
}

function expectedOrderCount(mode, recipientCount) {
  if (mode === 'single') return 1;
  if (mode === 'redeem') return 0;
  return recipientCount;
}

let claimsReady;
function ensureClaims() {
  claimsReady ??= McpMerchandiseClaim.syncIndexes();
  return claimsReady;
}

async function walletView(tenantId, entityId) {
  const { wallet } = await ledger.resolveSpendWalletForEntity({ tenantId, entityId });
  const balance = Number(wallet.balance) || 0;
  const allocatedAmount = Number(wallet.allocatedAmount) || 0;
  return { wallet, balance, allocatedAmount, unallocatedAmount: balance - allocatedAmount };
}

async function loadKit(tenantId, kitId) {
  const kit = await Kit.findOne({ _id: kitId, tenantId });
  if (!kit) throw new NotFoundError('Kit not found');
  if (kit.status === 'archived') throw new ApiError(422, 'This kit is archived', 'KIT_ARCHIVED');
  if (!kit.productRefs?.length && !isCuratedKitMeta(parseCuratedKitMeta(kit.designNotes))) {
    throw new ApiError(422, 'This kit has no products', 'KIT_EMPTY');
  }
  return kit;
}

async function loadProducts(kit) {
  const ids = (kit.productRefs || []).map((ref) => ref.catalogProductId).filter(Boolean);
  const products = ids.length
    ? await CatalogProduct.find({ _id: { $in: ids } }).select('name basePriceInr category variants status').lean()
    : [];
  if (products.length !== ids.length) throw new NotFoundError('A kit product was not found');
  if (products.some((product) => product.status && product.status !== 'active')) {
    throw new ApiError(422, 'A kit product is not available', 'PRODUCT_UNAVAILABLE');
  }
  return products;
}

async function quoteKit(kit, products, recipientCount, packaging) {
  const pkg = packaging === 'box' ? 'box' : 'none';
  const meta = parseCuratedKitMeta(kit.designNotes);
  let computed;
  if (!isCuratedKitMeta(meta) && kit.productRefs?.length) {
    computed = customisedKitSendTotals(recipientCount, pkg, products);
  } else {
    const pricePerKit = isCuratedKitMeta(meta)
      ? await resolveCuratedApproxValueInr(kit, meta)
      : Math.round(Number(kit.kitPrice) || 0);
    computed = curatedKitSendTotals(recipientCount, pricePerKit, pkg);
  }
  return {
    packaging: pkg,
    totalBudget: Math.round(computed.total),
    tax: Math.round(computed.tax || 0),
    items: (kit.productRefs || []).map((ref) => ({
      name: ref.name || products.find((product) => String(product._id) === String(ref.catalogProductId))?.name || 'Item',
      quantity: recipientCount,
    })),
  };
}

async function assertRecipients(tenantId, kit, input) {
  const emails = input.recipients.map((row) => row.email.toLowerCase());
  if (new Set(emails).size !== emails.length) throw invalid('Each recipient email must be unique');
  const productIds = new Set((kit.productRefs || []).map((ref) => String(ref.catalogProductId)));
  for (const row of input.recipients) {
    for (const productId of Object.keys(row.variants || {})) {
      if (!productIds.has(productId)) throw invalid('A variant does not belong to this kit');
    }
  }
  if (input.fulfillmentMode === 'surprise') {
    for (const row of input.recipients) {
      const contact = row.contactId
        ? await Contact.findOne({ _id: row.contactId, tenantId })
        : await Contact.findOne({ tenantId, email: row.email.toLowerCase() });
      const address = contact?.address;
      if (!address?.line1 || !address.city || !address.state || !address.pincode) {
        throw new ApiError(422, 'Every surprise recipient needs a shipping address on file', 'SURPRISE_ADDRESS_REQUIRED');
      }
    }
  }
}

async function prepareDraftState(tenantId, actor, input) {
  const entity = await Entity.findOne({ _id: input.entityId, tenantId });
  if (!entity) throw new NotFoundError('Entity not found');
  assertRole(actor, entity._id);
  const shop = await Shop.findOne({ _id: input.shopId, tenantId });
  if (!shop) throw new NotFoundError('Shop not found');
  const kit = await loadKit(tenantId, input.kitId);
  const products = await loadProducts(kit);
  await assertRecipients(tenantId, kit, input);
  const quote = await quoteKit(kit, products, input.recipients.length, input.packaging || kit.packaging);
  if (quote.totalBudget <= 0) throw new ApiError(422, 'This kit does not have a price', 'BUDGET_TOO_LOW');
  await assertWalletCanSpend({
    tenantId,
    entityId: entity._id,
    amount: quote.totalBudget,
    user: actor.user,
  });
  const wallet = await walletView(tenantId, entity._id);
  return { entity, shop, kit, products, quote, wallet };
}

function draftSnapshot(state) {
  return {
    kitId: String(state.kit._id),
    prices: state.products.map((product) => ({
      id: String(product._id),
      price: product.basePriceInr,
      category: product.category,
    })),
    recipientCount: state.quote.items[0]?.quantity || 0,
    totalBudget: state.quote.totalBudget,
    balance: state.wallet.balance,
    allocatedAmount: state.wallet.allocatedAmount,
  };
}

async function findClaimed(tenantId, input) {
  const claim = await McpMerchandiseClaim.findOne({ tenantId, logicalKey: logicalKey(input) });
  if (!claim?.campaignId) return null;
  return Campaign.findOne({ _id: claim.campaignId, tenantId });
}

function sameDraft(campaign, input, quote) {
  return campaign
    && campaign.type === 'kit'
    && String(campaign.kitId) === String(input.kitId)
    && campaign.fulfillmentMode === input.fulfillmentMode
    && campaign.recipientCount === input.recipients.length
    && campaign.totalBudget === quote.totalBudget
    && ['approved', 'launched', 'redemption_open'].includes(campaign.status);
}

async function presentDraft(tenantId, campaignId, actor) {
  const campaign = await Campaign.findOne({ _id: campaignId, tenantId });
  const wallet = await walletView(tenantId, campaign.entityId);
  const funds = await visibleFunds(actor?.user, tenantId, campaign.entityId, wallet);
  return {
    id: String(campaign._id),
    name: campaign.name,
    status: campaign.status,
    type: 'kit',
    fulfillmentMode: campaign.fulfillmentMode,
    recipientCount: campaign.recipientCount,
    totalBudget: campaign.totalBudget,
    balance: funds.balance,
    unallocatedAmount: funds.unallocatedAmount,
  };
}

async function saveDraft(actor, input) {
  await ensureClaims();
  const tenantId = actor.tenant._id;
  const state = await prepareDraftState(tenantId, actor, input);
  const existing = await findClaimed(tenantId, input);
  if (sameDraft(existing, input, state.quote)) return presentDraft(tenantId, existing._id, actor);
  if (existing && !['draft', 'recipients_uploaded'].includes(existing.status)) {
    throw new ApiError(409, 'A kit campaign with this name already exists', 'CAMPAIGN_EXISTS');
  }
  let campaign = existing;
  if (!campaign) {
    const created = await createCampaign({
      tenantId,
      userId: actor.user.userId,
      user: actor.user,
      data: {
        entityId: input.entityId,
        shopId: input.shopId,
        kitId: input.kitId,
        name: input.name.trim(),
        type: 'kit',
        fulfillmentMode: input.fulfillmentMode,
        singleLocation: input.singleLocation,
        catalogMode: 'selected_products',
        selectedProductIds: state.products.map((product) => product._id),
        schedule: { mode: 'now' },
        isSample: false,
      },
    });
    campaign = await Campaign.findOne({ _id: created._id || created.id, tenantId });
    await McpMerchandiseClaim.updateOne(
      { tenantId, logicalKey: logicalKey(input) },
      { $setOnInsert: { campaignId: campaign._id } },
      { upsert: true },
    );
  }
  await importRecipients({
    tenantId,
    campaignId: campaign._id,
    user: actor.user,
    recipients: input.recipients,
    packaging: state.quote.packaging,
    paymentMode: 'wallet',
    idempotencyKey: `merch-import:${campaign._id}`,
  });
  const saved = await Campaign.findOne({ _id: campaign._id, tenantId });
  if (saved.totalBudget !== state.quote.totalBudget) {
    throw new ApiError(409, 'The kit total changed before it could be saved', 'CONFIRMATION_STALE');
  }
  await writeAudit({
    tenantId,
    req: { tenantId, user: { userId: actor.user.userId, role: actor.user.role } },
    action: 'campaign.merchandise_draft',
    entityType: 'Campaign',
    entityId: saved._id,
    after: { status: saved.status, recipientCount: saved.recipientCount, totalBudget: saved.totalBudget },
  });
  return presentDraft(tenantId, saved._id, actor);
}

export async function prepareMerchandiseDraft({ tenantId, actorUserId, input, now }) {
  const requested = draftSchema.safeParse(businessInput(input));
  if (!requested.success) throw invalid();
  const planned = {};
  const prepared = await prepareMcpWrite({
    tenantId,
    actorUserId,
    operation: 'campaigns.merchandise_draft',
    payload: requested.data,
    now,
    authorize: async (actor) => {
      planned.actor = actor;
      planned.state = await prepareDraftState(tenantId, actor, requested.data);
    },
    validate: async () => requested.data,
    resourceState: async () => draftSnapshot(planned.state),
    summary: async () => ({
      action: 'preview',
      name: requested.data.name,
      recipientCount: requested.data.recipients.length,
      totalBudget: planned.state.quote.totalBudget,
    }),
  });
  const state = planned.state;
  const funds = await visibleFunds(planned.actor?.user, tenantId, state.entity._id, state.wallet);
  return {
    confirmationId: prepared.confirmationId,
    expiresAt: prepared.expiresAt,
    preview: {
      name: requested.data.name.trim(),
      type: 'kit',
      fulfillmentMode: requested.data.fulfillmentMode,
      fulfillment: fulfillmentLabel(requested.data.fulfillmentMode),
      recipientCount: requested.data.recipients.length,
      packaging: state.quote.packaging,
      items: state.quote.items,
      totalBudget: state.quote.totalBudget,
      tax: state.quote.tax,
      walletImpact: maskWalletImpact(funds, {
        debitedNow: 0,
        requiredAtLaunch: state.quote.totalBudget,
        balance: state.wallet.balance,
        unallocatedAmount: state.wallet.unallocatedAmount,
      }),
    },
  };
}

export async function executeMerchandiseDraft({
  tenantId, actorUserId, input, confirmationId, idempotencyKey, now,
}) {
  const requested = draftSchema.safeParse(businessInput(input));
  if (!requested.success) throw invalid();
  return executeMcpWrite({
    tenantId,
    actorUserId,
    operation: 'campaigns.merchandise_draft',
    payload: requested.data,
    confirmationId,
    idempotencyKey,
    now,
    authorize: async (actor) => {
      const entity = await Entity.findOne({ _id: requested.data.entityId, tenantId });
      if (!entity) throw new NotFoundError('Entity not found');
      assertRole(actor, entity._id);
    },
    validate: async () => requested.data,
    resourceState: async () => readDraftSnapshot(tenantId, requested.data),
    reconcile: async (actor) => {
      const campaign = await findClaimed(tenantId, requested.data);
      if (!campaign) return { outcome: 'absent' };
      const kit = await loadKit(tenantId, requested.data.kitId);
      const products = await loadProducts(kit);
      const quote = await quoteKit(kit, products, requested.data.recipients.length, requested.data.packaging || kit.packaging);
      if (sameDraft(campaign, requested.data, quote)) {
        return { outcome: 'completed', result: await presentDraft(tenantId, campaign._id, actor) };
      }
      if (['draft', 'recipients_uploaded'].includes(campaign.status)) return { outcome: 'absent' };
      return { outcome: 'uncertain' };
    },
    execute: async (actor) => saveDraft(actor, requested.data),
  });
}

async function readDraftSnapshot(tenantId, input) {
  const kit = await loadKit(tenantId, input.kitId);
  const products = await loadProducts(kit);
  const quote = await quoteKit(kit, products, input.recipients.length, input.packaging || kit.packaging);
  const wallet = await walletView(tenantId, input.entityId);
  return draftSnapshot({ kit, products, quote, wallet });
}

async function loadLaunchCampaign(tenantId, campaignId) {
  const campaign = await Campaign.findOne({ _id: campaignId, tenantId })
    .select('name type status entityId shopId kitId fulfillmentMode recipientCount totalBudget paymentMode schedule packaging isSample');
  if (!campaign) throw new NotFoundError('Campaign not found');
  return campaign;
}

function assertLaunchable(campaign) {
  if (campaign.type !== 'kit') throw new ApiError(422, 'Only kit campaigns can be launched from this tool', 'CAMPAIGN_NOT_KIT');
  if (campaign.isSample) throw new ApiError(422, 'Sample campaigns cannot be launched from this tool', 'CAMPAIGN_NOT_SENDABLE');
  if (!SUPPORTED_FULFILLMENT.includes(campaign.fulfillmentMode)) {
    throw new ApiError(422, 'This kit delivery mode is not supported', 'FULFILLMENT_UNSUPPORTED');
  }
  if (campaign.paymentMode && campaign.paymentMode !== 'wallet') {
    throw new ApiError(422, 'This campaign is not paid from the wallet', 'EXTERNAL_PAY_UNSUPPORTED');
  }
  if ((campaign.schedule?.mode ?? 'now') !== 'now') {
    throw new ApiError(422, 'Only campaigns that send now are supported', 'SCHEDULE_UNSUPPORTED');
  }
}

async function launchSnapshot(tenantId, campaign) {
  const wallet = await walletView(tenantId, campaign.entityId);
  const debit = await WalletTransaction.findOne({ tenantId, idempotencyKey: `campaign_spend:${campaign._id}` });
  return {
    campaignId: String(campaign._id),
    status: campaign.status,
    totalBudget: campaign.totalBudget,
    balance: wallet.balance,
    allocatedAmount: wallet.allocatedAmount,
    debited: Boolean(debit),
  };
}

async function presentLaunch(tenantId, campaignId, actor) {
  const campaign = await loadLaunchCampaign(tenantId, campaignId);
  const wallet = await walletView(tenantId, campaign.entityId);
  const funds = await visibleFunds(actor?.user, tenantId, campaign.entityId, wallet);
  const orderCount = await Order.countDocuments({ tenantId, campaignId: campaign._id });
  const singleClaimed = campaign.fulfillmentMode === 'single' && campaign.schedule?.inviteClaimedAt && !campaign.schedule?.invitesSentAt;
  const claimedUnsent = campaign.fulfillmentMode === 'single'
    ? 0
    : await Recipient.countDocuments({ tenantId, campaignId: campaign._id, invitedAt: null, inviteClaimedAt: { $ne: null } });
  const invitationsSent = campaign.fulfillmentMode === 'single'
    ? (campaign.schedule?.invitesSentAt ? 1 : 0)
    : await Recipient.countDocuments({ tenantId, campaignId: campaign._id, invitedAt: { $ne: null } });
  return {
    campaignId: String(campaign._id),
    status: campaign.status,
    recipientCount: campaign.recipientCount,
    orderCount,
    totalBudget: campaign.totalBudget,
    balance: funds.balance,
    unallocatedAmount: funds.unallocatedAmount,
    invitationsSent,
    invitationsUnresolved: Boolean(campaign.schedule?.invitesUnresolved) || Boolean(singleClaimed) || claimedUnsent > 0,
  };
}

async function prepareLaunchState(tenantId, actor, campaignId) {
  const campaign = await loadLaunchCampaign(tenantId, campaignId);
  assertRole(actor, campaign.entityId);
  assertLaunchable(campaign);
  const launched = ['launched', 'redemption_open'].includes(campaign.status);
  if (!launched && campaign.status !== 'approved') {
    throw new ApiError(422, 'Approve the kit campaign before launch', 'CAMPAIGN_NOT_APPROVED');
  }
  if (!campaign.totalBudget || campaign.totalBudget <= 0) {
    throw new ApiError(422, 'This kit does not have a price', 'BUDGET_TOO_LOW');
  }
  const debit = await WalletTransaction.findOne({ tenantId, idempotencyKey: `campaign_spend:${campaign._id}` });
  if (!launched && !debit) {
    await assertWalletCanSpend({
      tenantId,
      entityId: campaign.entityId,
      amount: campaign.totalBudget,
      user: actor.user,
    });
  }
  const kit = await loadKit(tenantId, campaign.kitId);
  const products = await loadProducts(kit);
  const quote = await quoteKit(kit, products, campaign.recipientCount, campaign.packaging);
  const wallet = await walletView(tenantId, campaign.entityId);
  return { campaign, quote, wallet, launched, debit };
}

export async function prepareMerchandiseLaunch({ tenantId, actorUserId, input, now }) {
  const requested = launchSchema.safeParse(businessInput(input));
  if (!requested.success) throw invalid();
  const planned = {};
  const prepared = await prepareMcpWrite({
    tenantId,
    actorUserId,
    operation: 'campaigns.merchandise_launch',
    payload: requested.data,
    now,
    authorize: async (actor) => {
      planned.actor = actor;
      planned.state = await prepareLaunchState(tenantId, actor, requested.data.campaignId);
    },
    validate: async () => requested.data,
    resourceState: async () => launchSnapshot(tenantId, planned.state.campaign),
    summary: async () => ({
      action: 'preview',
      campaignId: requested.data.campaignId,
      totalBudget: planned.state.campaign.totalBudget,
    }),
  });
  const state = planned.state;
  const debit = Math.round(state.campaign.totalBudget);
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
      }
      : {
        debitedNow: debit,
        balance: state.wallet.balance,
        unallocatedAmount: state.wallet.unallocatedAmount,
        balanceBefore: state.wallet.balance,
        balanceAfter: state.wallet.balance - debit,
        requiredAtLaunch: debit,
      },
  );
  return {
    confirmationId: prepared.confirmationId,
    expiresAt: prepared.expiresAt,
    preview: {
      campaignId: String(state.campaign._id),
      status: state.launched ? state.campaign.status : 'redemption_open',
      fulfillment: fulfillmentLabel(state.campaign.fulfillmentMode),
      recipientCount: state.campaign.recipientCount,
      orderCount: expectedOrderCount(state.campaign.fulfillmentMode, state.campaign.recipientCount),
      items: state.quote.items,
      totalBudget: state.campaign.totalBudget,
      walletImpact: impact,
    },
  };
}

export async function executeMerchandiseLaunch({
  tenantId, actorUserId, input, confirmationId, idempotencyKey, now,
}) {
  const requested = launchSchema.safeParse(businessInput(input));
  if (!requested.success) throw invalid();
  return executeMcpWrite({
    tenantId,
    actorUserId,
    operation: 'campaigns.merchandise_launch',
    payload: requested.data,
    confirmationId,
    idempotencyKey,
    now,
    authorize: async (actor) => {
      const campaign = await loadLaunchCampaign(tenantId, requested.data.campaignId);
      assertRole(actor, campaign.entityId);
      assertLaunchable(campaign);
    },
    validate: async () => requested.data,
    resourceState: async () => launchSnapshot(tenantId, await loadLaunchCampaign(tenantId, requested.data.campaignId)),
    reconcile: async (actor) => {
      const campaign = await Campaign.findOne({ _id: requested.data.campaignId, tenantId }).select('status totalBudget fulfillmentMode recipientCount schedule');
      if (!campaign) return { outcome: 'uncertain' };
      const launched = ['launched', 'redemption_open'].includes(campaign.status);
      const debit = await WalletTransaction.findOne({ tenantId, idempotencyKey: `campaign_spend:${campaign._id}` });
      const orders = await Order.countDocuments({ tenantId, campaignId: campaign._id });
      const expectedOrders = expectedOrderCount(campaign.fulfillmentMode, campaign.recipientCount);
      if (!launched || !debit || orders < expectedOrders) {
        if (!launched) return { outcome: 'absent' };
        return { outcome: 'uncertain' };
      }
      const unclaimed = campaign.fulfillmentMode === 'single'
        ? ((campaign.schedule?.invitesSentAt || campaign.schedule?.inviteClaimedAt || campaign.schedule?.invitesUnresolved) ? 0 : 1)
        : await Recipient.countDocuments({ tenantId, campaignId: campaign._id, invitedAt: null, inviteClaimedAt: null });
      if (unclaimed === 0) return { outcome: 'completed', result: await presentLaunch(tenantId, campaign._id, actor) };
      return { outcome: 'absent' };
    },
    execute: async (actor) => {
      const state = await prepareLaunchState(tenantId, actor, requested.data.campaignId);
      await launchCampaign({
        tenantId,
        campaignId: requested.data.campaignId,
        user: actor.user,
        paymentMode: 'wallet',
      });
      const result = await presentLaunch(tenantId, requested.data.campaignId, actor);
      await writeAudit({
        tenantId,
        req: { tenantId, user: { userId: actor.user.userId, role: actor.user.role } },
        action: 'campaign.merchandise_launch',
        entityType: 'Campaign',
        entityId: requested.data.campaignId,
        after: {
          status: result.status,
          totalBudget: result.totalBudget,
          orderCount: result.orderCount,
          invitationsSent: result.invitationsSent,
        },
      });
      return result;
    },
  });
}

function requireCaller(ctx) {
  const caller = employeeReaderFromContext(ctx);
  if (!caller.tenantId || !caller.user?.userId) {
    throw new ForbiddenError('Kit campaigns are not available for this account');
  }
  return caller;
}

export async function prepareMerchandiseDraftForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return prepareMerchandiseDraft({ tenantId: caller.tenantId, actorUserId: caller.user.userId, input: args });
}
export async function executeMerchandiseDraftForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return executeMerchandiseDraft({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
    confirmationId: args?.confirmationId,
    idempotencyKey: args?.idempotencyKey,
  });
}
export async function prepareMerchandiseLaunchForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return prepareMerchandiseLaunch({ tenantId: caller.tenantId, actorUserId: caller.user.userId, input: args });
}
export async function executeMerchandiseLaunchForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return executeMerchandiseLaunch({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
    confirmationId: args?.confirmationId,
    idempotencyKey: args?.idempotencyKey,
  });
}

export function merchandiseText(output, heading) {
  const preview = output.preview;
  if (preview) {
    const timing = preview.fulfillment === 'recipient_chooses_later'
      ? 'No fulfillment order is created until a recipient submits the private link.'
      : 'Fulfillment orders are created when the campaign is launched.';
    return [heading, `${preview.recipientCount} recipients, total ${preview.totalBudget} INR`, timing, 'Confirm this preview before it expires.'].join('\n');
  }
  if (output.invitationsUnresolved) {
    return [heading, `Status ${output.status}. ${output.invitationsSent} invitations delivered. Some invitations are unresolved and were not sent again.`].join('\n');
  }
  return [heading, `Status ${output.status}, total ${output.totalBudget} INR`].join('\n');
}

const WRITE_ERRORS = {
  FORBIDDEN: 'You cannot send this kit campaign.',
  NOT_FOUND: 'That kit campaign was not found.',
  VALIDATION: 'Kit campaign details are not valid.',
  BUDGET_TOO_LOW: 'This kit does not have a price.',
  KIT_EMPTY: 'This kit has no products.',
  KIT_ARCHIVED: 'This kit is archived.',
  PRODUCT_UNAVAILABLE: 'A kit product is not available.',
  SURPRISE_ADDRESS_REQUIRED: 'Every surprise recipient needs a shipping address on file.',
  CAMPAIGN_NOT_KIT: 'Only kit campaigns can be launched from this tool.',
  CAMPAIGN_NOT_SENDABLE: 'This campaign cannot be sent from this tool.',
  FULFILLMENT_UNSUPPORTED: 'This kit delivery mode is not supported.',
  EXTERNAL_PAY_UNSUPPORTED: 'This campaign is not paid from the wallet.',
  SCHEDULE_UNSUPPORTED: 'Only campaigns that send now are supported.',
  CAMPAIGN_NOT_APPROVED: 'Approve the kit campaign before launch.',
  CAMPAIGN_EXISTS: 'A kit campaign with this name already exists.',
  INSUFFICIENT_FUNDS: 'The wallet does not have enough available budget.',
  INSUFFICIENT_ENTITY_BUDGET: 'The department does not have enough remaining budget.',
  LAUNCH_IN_PROGRESS: 'This campaign launch is already in progress.',
  CONFIRMATION_STALE: 'This preview is out of date. Prepare it again.',
  CONFIRMATION_EXPIRED: 'This confirmation has expired. Prepare it again.',
  CONFIRMATION_REUSED: 'This confirmation was already used.',
  CONFIRMATION_INVALID: 'This confirmation is not valid.',
  CONFIRMATION_MISMATCH: 'This confirmation does not match the requested change.',
  IDEMPOTENCY_PAYLOAD_MISMATCH: 'This idempotency key was used for a different change.',
  IDEMPOTENT_REPLAY_IN_FLIGHT: 'This kit campaign change is already in progress.',
  IDEMPOTENCY_RECONCILIATION_REQUIRED: 'This kit campaign change needs to be checked before it can be retried.',
  ACTOR_INACTIVE: 'This account cannot send kit campaigns.',
  TENANT_INACTIVE: 'This workspace cannot send kit campaigns.',
};

export function merchandiseError(error, fallback) {
  return WRITE_ERRORS[error?.code] || fallback;
}
