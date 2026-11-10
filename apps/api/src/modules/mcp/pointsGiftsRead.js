import { z } from 'zod';
import { ForbiddenError } from '../../utils/errors.js';
import { getPagination, paginatedResponse } from '../../utils/pagination.js';
import { Campaign } from '../campaigns/campaign.model.js';
import { HIDDEN_CAMPAIGN_NAME } from '../campaigns/campaigns.service.js';
import { REDEMPTION_STATUSES, Recipient } from '../campaigns/recipient.model.js';
import { Entity } from '../entities/entity.model.js';
import { Order } from '../orders/order.model.js';

export const POINTS_SUMMARY_DESCRIPTION = [
  'Summarize rupee credits on points campaigns for the signed-in workspace.',
  'Recipient.creditAmount is denominated in INR. It is not a converted loyalty-point balance.',
  'Company admins see the workspace. Entity managers see their assigned departments only.',
  'Recipient names and contact details are not returned.',
].join(' ');

export const GIFTS_SEARCH_DESCRIPTION = [
  'List gift recipients for campaigns the caller can see.',
  'Includes campaign name, recipient name, INR credit amount, redemption status, opened and redeemed times, and an order number when one exists.',
  'Redemption tokens, email, phone, and delivery addresses are not returned.',
].join(' ');

const PAGE = { defaultLimit: 10, maxLimit: 25 };
const OUTSTANDING = new Set(['invited', 'opened', 'verified']);
const REDEEMED = new Set(['redeemed', 'order_created']);

const campaignTotalSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  entityId: z.string(),
  recipientCount: z.number().int(),
  issuedCreditInr: z.number().int(),
  outstandingCreditInr: z.number().int(),
  redeemedCreditInr: z.number().int(),
  expiredCreditInr: z.number().int(),
});

const entityAllocationSchema = z.object({
  id: z.string(),
  name: z.string(),
  allocatedAmountInr: z.number().int(),
  spentAmountInr: z.number().int(),
  availableAllocationInr: z.number().int(),
});

export const pointsSummaryInputSchema = z.object({});

export const pointsSummaryOutputSchema = z.object({
  currency: z.literal('INR'),
  amountBasis: z.string(),
  recipientCount: z.number().int(),
  issuedCreditInr: z.number().int(),
  outstandingCreditInr: z.number().int(),
  redeemedCreditInr: z.number().int(),
  expiredCreditInr: z.number().int(),
  campaigns: z.array(campaignTotalSchema),
  entities: z.array(entityAllocationSchema),
});

export const giftsSearchInputSchema = z.object({
  campaignId: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{24}$/, 'campaignId must be a campaign id')
    .optional()
    .describe('Limit gifts to one campaign. A campaign outside this workspace is omitted.'),
  redemptionStatus: z.enum(REDEMPTION_STATUSES).optional().describe('Redemption status. Omitted statuses are not filtered.'),
  page: z.number().int().min(1).max(10_000).optional().describe('1-based page number. Default 1.'),
  limit: z.number().int().min(1).max(25).optional().describe('Page size. Default 10, maximum 25.'),
});

const giftSchema = z.object({
  campaignName: z.string(),
  recipientName: z.string(),
  creditAmountInr: z.number().int(),
  redemptionStatus: z.string(),
  openedAt: z.string(),
  redeemedAt: z.string(),
  orderNumber: z.string(),
});

export const giftsSearchOutputSchema = z.object({
  items: z.array(giftSchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

function inr(value) {
  return Math.round(Number(value) || 0);
}

function stamp(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function readerFromContext(ctx) {
  const authInfo = ctx?.http?.authInfo ?? ctx?.authInfo;
  const extra = authInfo?.extra ?? {};
  return {
    tenantId: extra.tenantId || null,
    user: {
      userId: extra.userId || null,
      role: extra.role,
      scopeType: extra.scopeType ?? null,
      scopeId: extra.scopeId ?? null,
      assignedEntityIds: Array.isArray(extra.assignedEntityIds) ? extra.assignedEntityIds.map(String) : [],
    },
  };
}

function readerOrThrow(ctx) {
  const reader = readerFromContext(ctx);
  if (!reader.tenantId) throw new ForbiddenError('This summary is not available for this account');
  return reader;
}

function emptyTotals() {
  return {
    recipientCount: 0,
    issuedCreditInr: 0,
    outstandingCreditInr: 0,
    redeemedCreditInr: 0,
    expiredCreditInr: 0,
  };
}

function addCredit(bucket, status, amount) {
  bucket.recipientCount += 1;
  bucket.issuedCreditInr += amount;
  if (REDEEMED.has(status)) bucket.redeemedCreditInr += amount;
  else if (status === 'expired') bucket.expiredCreditInr += amount;
  else if (OUTSTANDING.has(status)) bucket.outstandingCreditInr += amount;
}

function campaignFilter({ tenantId, user, campaignId, type }) {
  const filter = {
    tenantId,
    name: { $ne: HIDDEN_CAMPAIGN_NAME },
  };
  if (type) filter.type = type;
  if (campaignId) filter._id = campaignId;
  if (user.scopeType === 'entity') {
    const ids = user.assignedEntityIds ?? [];
    if (!ids.length) return null;
    filter.entityId = { $in: ids };
  }
  return filter;
}

async function visibleCampaigns({ tenantId, user, campaignId, type }) {
  const filter = campaignFilter({ tenantId, user, campaignId, type });
  if (!filter) return [];
  return Campaign.find(filter)
    .select('name status entityId type createdAt')
    .sort({ createdAt: -1 })
    .lean();
}

export async function summarizePointsForCaller(ctx) {
  const reader = readerOrThrow(ctx);
  const { tenantId, user } = reader;
  const campaigns = await visibleCampaigns({ tenantId, user, type: 'points' });
  const totals = emptyTotals();
  const byCampaign = new Map(campaigns.map((campaign) => [String(campaign._id), { campaign, ...emptyTotals() }]));

  if (campaigns.length) {
    const rows = await Recipient.find({
      tenantId,
      campaignId: { $in: campaigns.map((campaign) => campaign._id) },
    })
      .select('campaignId creditAmount redemptionStatus')
      .lean();
    for (const row of rows) {
      const amount = inr(row.creditAmount);
      const bucket = byCampaign.get(String(row.campaignId));
      if (!bucket) continue;
      addCredit(bucket, row.redemptionStatus, amount);
      addCredit(totals, row.redemptionStatus, amount);
    }
  }

  const entityFilter = { tenantId };
  if (user.scopeType === 'entity') {
    const ids = user.assignedEntityIds ?? [];
    entityFilter._id = ids.length ? { $in: ids } : { $in: [] };
  }
  const entities = await Entity.find(entityFilter).select('name allocatedAmount spentAmount').sort({ name: 1 }).lean();

  return {
    currency: 'INR',
    amountBasis: 'Recipient.creditAmount is denominated in INR. There is no loyalty-point conversion.',
    ...totals,
    campaigns: [...byCampaign.values()].map(({ campaign, ...bucket }) => ({
      id: String(campaign._id),
      name: String(campaign.name ?? ''),
      status: String(campaign.status ?? ''),
      entityId: campaign.entityId ? String(campaign.entityId) : '',
      ...bucket,
    })),
    entities: entities.map((entity) => {
      const allocatedAmountInr = inr(entity.allocatedAmount);
      const spentAmountInr = inr(entity.spentAmount);
      return {
        id: String(entity._id),
        name: String(entity.name ?? ''),
        allocatedAmountInr,
        spentAmountInr,
        availableAllocationInr: Math.max(0, allocatedAmountInr - spentAmountInr),
      };
    }),
  };
}

export async function searchGiftsForCaller(ctx, args = {}) {
  const reader = readerOrThrow(ctx);
  const { tenantId, user } = reader;
  const { page, limit, skip } = getPagination(args, PAGE);
  const campaigns = await visibleCampaigns({ tenantId, user, campaignId: args.campaignId });
  if (!campaigns.length) return paginatedResponse([], 0, { page, limit });

  const names = new Map(campaigns.map((campaign) => [String(campaign._id), String(campaign.name ?? '')]));
  const filter = {
    tenantId,
    campaignId: { $in: campaigns.map((campaign) => campaign._id) },
  };
  if (args.redemptionStatus) filter.redemptionStatus = args.redemptionStatus;
  const [rows, total] = await Promise.all([
    Recipient.find(filter)
      .select('campaignId name creditAmount redemptionStatus openedAt redeemedAt createdAt')
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Recipient.countDocuments(filter),
  ]);
  const orders = rows.length
    ? await Order.find({
        tenantId,
        recipientId: { $in: rows.map((row) => row._id) },
      })
        .select('recipientId orderNumber createdAt')
        .sort({ createdAt: -1, _id: -1 })
        .lean()
    : [];
  const orderNumberByRecipient = new Map();
  for (const order of orders) {
    const key = String(order.recipientId);
    if (!orderNumberByRecipient.has(key)) orderNumberByRecipient.set(key, String(order.orderNumber ?? ''));
  }

  return paginatedResponse(
    rows.map((row) => ({
      campaignName: names.get(String(row.campaignId)) ?? '',
      recipientName: String(row.name ?? ''),
      creditAmountInr: inr(row.creditAmount),
      redemptionStatus: String(row.redemptionStatus ?? ''),
      openedAt: stamp(row.openedAt),
      redeemedAt: stamp(row.redeemedAt),
      orderNumber: orderNumberByRecipient.get(String(row._id)) ?? '',
    })),
    total,
    { page, limit },
  );
}

export function pointsSummaryText(output) {
  return [
    `Points credits in ${output.currency}.`,
    output.amountBasis,
    `Recipients ${output.recipientCount}. Issued ₹${output.issuedCreditInr}. Outstanding ₹${output.outstandingCreditInr}. Redeemed ₹${output.redeemedCreditInr}. Expired ₹${output.expiredCreditInr}.`,
  ].join('\n');
}

export function giftsSearchText(output) {
  const { items, pagination } = output;
  const header = `Gifts. Page ${pagination.page} of ${pagination.totalPages} (${pagination.total} total).`;
  if (!items.length) return `${header}\nNo matching gifts.`;
  const lines = items.map(
    (gift) =>
      `${gift.campaignName}: ${gift.recipientName} ₹${gift.creditAmountInr} ${gift.redemptionStatus} ${gift.orderNumber}`,
  );
  return [header, ...lines].join('\n');
}

export function pointsGiftsToolError(err, fallback) {
  if (err instanceof ForbiddenError) return err.message;
  return fallback;
}
