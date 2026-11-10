import { z } from 'zod';
import { ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { CAMPAIGN_STATUSES } from '../campaigns/campaign.model.js';
import { getCampaignRead, searchCampaignsRead } from '../campaigns/campaigns.service.js';

const CAMPAIGN_TYPES = ['points', 'items', 'kit'];

export const CAMPAIGNS_SEARCH_DESCRIPTION = [
  'Search ShelfMerch campaigns for the signed-in workspace.',
  'Company admins see the workspace. Entity managers see campaigns for their assigned entities.',
  'The internal storefront campaign is omitted.',
  'Recipient contact details, redemption tokens, payment ids, and draft state are not returned.',
].join(' ');

export const CAMPAIGNS_GET_DESCRIPTION = [
  'Look up one ShelfMerch campaign by id.',
  'Uses the same workspace and entity rules as campaigns_search.',
  'Recipient contact details, redemption tokens, payment ids, and draft state are not returned.',
].join(' ');

const campaignSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  status: z.string(),
  fulfillmentMode: z.string(),
  recipientCount: z.number().int(),
  creditsPerRecipient: z.number().int(),
  totalBudget: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const campaignsSearchInputSchema = z.object({
  status: z.enum(CAMPAIGN_STATUSES).optional().describe('Campaign status. Omitted statuses are not filtered.'),
  type: z.enum(CAMPAIGN_TYPES).optional().describe('Campaign type: points, items, or kit.'),
  page: z.number().int().min(1).max(10_000).optional().describe('1-based page number. Default 1.'),
  limit: z.number().int().min(1).max(25).optional().describe('Page size. Default 10, maximum 25.'),
});

export const campaignsSearchOutputSchema = z.object({
  items: z.array(campaignSummarySchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export const campaignsGetInputSchema = z.object({
  campaignId: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{24}$/, 'campaignId must be a campaign id')
    .describe('Campaign id from campaigns_search.'),
});

export const campaignsGetOutputSchema = campaignSummarySchema.extend({
  entityId: z.string(),
  catalogMode: z.string(),
  packaging: z.string(),
  pointsScope: z.string(),
  paymentMode: z.string(),
  isSample: z.boolean(),
  brandingEnabled: z.boolean(),
  message: z.object({
    from: z.string(),
    body: z.string(),
  }),
  schedule: z.object({
    mode: z.string(),
    sendAt: z.string(),
    timezone: z.string(),
  }),
});

export function campaignReaderFromContext(ctx) {
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
  const reader = campaignReaderFromContext(ctx);
  if (!reader.tenantId) throw new ForbiddenError('Campaigns are not available for this account');
  return reader;
}

export async function searchCampaignsForCaller(ctx, args) {
  const reader = readerOrThrow(ctx);
  return searchCampaignsRead({ tenantId: reader.tenantId, user: reader.user, query: args ?? {} });
}

export async function getCampaignForCaller(ctx, campaignId) {
  const reader = readerOrThrow(ctx);
  return getCampaignRead({ tenantId: reader.tenantId, user: reader.user, campaignId });
}

export function campaignsSearchText(output) {
  const { items, pagination } = output;
  const header = `Campaigns. Page ${pagination.page} of ${pagination.totalPages} (${pagination.total} total).`;
  if (!items.length) return `${header}\nNo matching campaigns.`;
  const lines = items.map(
    (campaign) =>
      `${campaign.name} [${campaign.type}] ${campaign.status} ${campaign.fulfillmentMode} recipients ${campaign.recipientCount} budget ₹${campaign.totalBudget}`,
  );
  return [header, ...lines].join('\n');
}

export function campaignDetailText(campaign) {
  return [
    'Campaign.',
    `${campaign.name} [${campaign.type}] ${campaign.status} ${campaign.fulfillmentMode}`,
    `recipients ${campaign.recipientCount} credits ₹${campaign.creditsPerRecipient} budget ₹${campaign.totalBudget}`,
  ].join('\n');
}

export function campaignToolError(err, fallback) {
  if (err instanceof NotFoundError) return 'Campaign not found.';
  if (err instanceof ForbiddenError) return err.message;
  return fallback;
}
