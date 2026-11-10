import { z } from 'zod';
import { ApiError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { assertEntityAccess } from '../../middleware/abac.middleware.js';
import { writeAudit } from '../../services/audit.service.js';
import { objectId } from '../users/users.validation.js';
import { Entity } from '../entities/entity.model.js';
import { ensureSpendEntity } from '../entities/entities.service.js';
import { Shop } from '../shops/shop.model.js';
import { Wallet } from '../wallets/wallet.model.js';
import { Campaign } from '../campaigns/campaign.model.js';
import { savePointsDraft } from '../campaigns/campaigns.service.js';
import { getContactRead } from '../contacts/contacts.service.js';
import { employeeReaderFromContext } from './employeesRead.js';
import { executeMcpWrite, prepareMcpWrite } from './mcpWriteSafety.js';
import { McpPointsDraftClaim } from './mcpPointsDraftClaim.model.js';

const INCOMPLETE_CAMPAIGN_STATUSES = ['draft', 'recipients_uploaded', 'credits_allocated', 'approved'];
const WRITE_ROLES = new Set(rolesForTenantArea('campaigns', 'write'));

const recipientSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  email: z.string().trim().email().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  contactId: objectId.optional().describe('Contact id from employees_search. The server resolves the work email. Do not look up the email separately.'),
}).superRefine((row, ctx) => {
  if (!row.email && !row.contactId) {
    ctx.addIssue({ code: 'custom', message: 'Recipient email or contactId is required', path: ['contactId'] });
  }
  if (!row.contactId && row.email && !row.name) {
    ctx.addIssue({ code: 'custom', message: 'Recipient name is required', path: ['name'] });
  }
});

const draftSchema = z.object({
  campaignId: objectId.optional(),
  entityId: objectId.optional().describe('Department id. Required when a department manager is spending that department budget. Omit when a company admin is paying from the organization wallet.'),
  walletId: objectId.optional().describe('Organization wallet id from wallet_list_balances. Company admins paying from the organization wallet pass this and omit entityId. Do not choose a department the admin did not name.'),
  shopId: objectId,
  name: z.string().trim().min(1).max(160),
  pointsScope: z.enum(['stadium', 'shop']).optional(),
  creditsPerRecipient: z.number().nonnegative().optional(),
  message: z.object({
    from: z.string().max(160).optional(),
    body: z.string().max(4000).optional(),
  }).optional(),
  schedule: z.object({
    mode: z.enum(['now', 'scheduled', 'self']).optional(),
    sendAt: z.string().datetime().nullable().optional(),
    timezone: z.string().max(80).optional(),
  }).optional(),
  recipients: z.array(recipientSchema).max(500).optional(),
}).superRefine((value, ctx) => {
  if (!value.entityId && !value.walletId) {
    ctx.addIssue({ code: 'custom', message: 'A department or an organization wallet is required', path: ['walletId'] });
  }
});

export const CAMPAIGNS_PREPARE_POINTS_DRAFT_DESCRIPTION = [
  'Prepare a Send Points campaign draft without saving the campaign or its recipients.',
  'Use this for both dashboard entry points: a store already chosen, or a store the user picks from shops_list.',
  'Requires a shop and a campaign name. Recipients are optional until send.',
  'Company admins paying from their side pass walletId and omit entityId. The debit is the organization wallet unallocated balance. It does not reduce any department allocated budget. The campaign is still stored on the wallet spend entity the dashboard already uses (the oldest department on that wallet, or a default department created only when the draft is saved). Never pick Marketing, Sales, or another department to satisfy entityId.',
  'Department managers pass entityId for their own department. Their remaining department budget is what gets spent. walletId alone is not organization funding for a manager.',
  'creditsPerRecipient is INR per person. Points stores show ₹1 = 2 Points; INR stores show ₹1 = 1 Credit. Minimum ₹250 whole rupees is enforced when allocating credits, not while saving an unfinished draft.',
  'Pass people from employees_search as contactId only. The server resolves the work email for that contact in this workspace and does not return the email. Do not invent an email and do not call employees_get only to copy one. A new person the user typed still needs their email and name. This does not create Contacts.',
  'CSV import in the dashboard is parsed in the browser into the same recipient list. Pass those rows here; do not ask the user to paste a binary file.',
  'Schedule mode now, scheduled, or self (manual invite link, no email). For scheduled, sendAt must be the UTC instant for that timezone wall clock. The worker delivers from sendAt and does not reinterpret timezone.',
  'Company admins can draft against the organization wallet. Department managers can draft only for their departments.',
  'Does not launch the campaign, debit a wallet, create Contacts, or send invitations.',
  'Returns a one-use confirmation. Saving requires campaigns_execute_points_draft.',
].join(' ');

export const CAMPAIGNS_EXECUTE_POINTS_DRAFT_DESCRIPTION = [
  'Save the points campaign draft from campaigns_prepare_points_draft.',
  'Requires the confirmation id and an idempotency key.',
  'Rechecks the caller, department, shop, and draft before writing.',
  'The same draft is updated when another request already created it.',
  'Does not return redemption tokens, recipient emails, or phone numbers.',
  'Does not launch the campaign or debit a wallet.',
].join(' ');

const previewSchema = z.object({
  action: z.enum(['create', 'update']),
  campaignId: z.string().optional(),
  name: z.string(),
  entityId: z.string().optional(),
  entityName: z.string().optional(),
  walletId: z.string().optional(),
  fundingSource: z.enum(['organization_unallocated', 'department_budget']),
  departmentBudgetCharged: z.boolean(),
  shopId: z.string(),
  recipientCount: z.number().int(),
  creditsPerRecipient: z.number(),
});

const resultSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  type: z.literal('points'),
  entityId: z.string(),
  shopId: z.string(),
  recipientCount: z.number().int(),
});

export const campaignsPreparePointsDraftInputSchema = draftSchema;
export const campaignsExecutePointsDraftInputSchema = draftSchema.extend({
  confirmationId: z.string().trim().min(20).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
});
export const campaignsPreparePointsDraftOutputSchema = z.object({
  confirmationId: z.string(),
  expiresAt: z.string(),
  preview: previewSchema,
});
export const campaignsExecutePointsDraftOutputSchema = resultSchema;

let claimsReady;

function invalidDetails() {
  return new ApiError(400, 'Campaign draft details are not valid', 'VALIDATION');
}

function duplicateKey(error) {
  return error?.code === 11000 || error?.cause?.code === 11000;
}

function assertDraftWriter(actor) {
  if (!WRITE_ROLES.has(actor?.user?.role)) {
    throw new ForbiddenError('Campaign drafts require a company admin or department manager');
  }
}

function parseDraft(input) {
  const parsed = draftSchema.safeParse(input ?? {});
  if (!parsed.success) throw invalidDetails();
  const recipients = (parsed.data.recipients ?? []).map((row) => ({
    ...(row.contactId ? { contactId: row.contactId } : {}),
    ...(row.email ? { email: row.email.trim().toLowerCase() } : {}),
    ...(row.name ? { name: row.name.trim() } : {}),
    ...(row.phone ? { phone: row.phone.trim() } : {}),
  }));
  return {
    ...(parsed.data.campaignId ? { campaignId: parsed.data.campaignId } : {}),
    ...(parsed.data.entityId ? { entityId: parsed.data.entityId } : {}),
    ...(parsed.data.walletId ? { walletId: parsed.data.walletId } : {}),
    anchor: parsed.data.entityId || `wallet:${parsed.data.walletId}`,
    shopId: parsed.data.shopId,
    name: parsed.data.name.trim(),
    pointsScope: parsed.data.pointsScope ?? 'shop',
    creditsPerRecipient: parsed.data.creditsPerRecipient ?? 0,
    ...(parsed.data.message ? { message: parsed.data.message } : {}),
    ...(parsed.data.schedule ? { schedule: { ...parsed.data.schedule, ...(parsed.data.schedule.sendAt ? { sendAt: new Date(parsed.data.schedule.sendAt) } : {}) } } : {}),
    recipients,
  };
}

async function resolveRecipients(tenantId, user, input) {
  const byEmail = new Map();
  for (const row of input.recipients) {
    let email = row.email;
    let name = row.name;
    let contactId = row.contactId;
    if (contactId) {
      let contact;
      try {
        contact = await getContactRead({ tenantId, user, contactId });
      } catch (error) {
        if (error instanceof NotFoundError) {
          throw new ApiError(404, 'Employee not found', 'RECIPIENT_NOT_FOUND');
        }
        throw error;
      }
      const resolved = String(contact.email || '').trim().toLowerCase();
      if (!resolved) {
        throw new ApiError(422, 'This employee has no email address', 'RECIPIENT_EMAIL_MISSING');
      }
      if (email && email !== resolved) {
        throw new ApiError(422, 'That contact does not use this email address', 'RECIPIENT_MISMATCH');
      }
      email = resolved;
      name = name || contact.name;
    }
    if (!email || !name) throw invalidDetails();
    byEmail.set(email, {
      ...(contactId ? { contactId } : {}),
      email,
      name,
      ...(row.phone ? { phone: row.phone } : {}),
    });
  }
  input.resolvedRecipients = [...byEmail.values()];
}

function nameKey(input) {
  const name = input.name.trim().toLowerCase().replace(/\s+/g, ' ');
  return `points:${input.anchor}:${input.shopId}:${name}`;
}

function isDepartmentManager(user) {
  return user?.scopeType === 'entity' || user?.role === 'entity_manager';
}

function hashDraft(input) {
  const copy = { ...input };
  delete copy.anchor;
  delete copy.resolvedEntityId;
  delete copy.resolvedRecipients;
  delete copy.entityName;
  delete copy.fundingSource;
  delete copy.departmentBudgetCharged;
  delete copy.walletName;
  return copy;
}

async function ensureClaims() {
  claimsReady ??= McpPointsDraftClaim.syncIndexes();
  await claimsReady;
}

async function incompleteCampaign(tenantId, campaignId) {
  if (!campaignId) return null;
  const campaign = await Campaign.findOne({ _id: campaignId, tenantId });
  if (!campaign) return null;
  if (!INCOMPLETE_CAMPAIGN_STATUSES.includes(campaign.status)) return null;
  return campaign;
}

async function linkedDraft(tenantId, input) {
  if (input.campaignId) {
    const campaign = await Campaign.findOne({ _id: input.campaignId, tenantId });
    if (!campaign) throw new NotFoundError('Campaign not found');
    if (!INCOMPLETE_CAMPAIGN_STATUSES.includes(campaign.status)) {
      throw new ApiError(422, 'Only incomplete campaigns can be saved as drafts', 'CAMPAIGN_LOCKED');
    }
    if (campaign.type !== 'points') {
      throw new ApiError(422, 'Only points campaigns support wizard drafts', 'INVALID_CAMPAIGN_TYPE');
    }
    if (String(campaign.shopId) !== String(input.shopId)) throw new ForbiddenError('This draft belongs to a different shop');
    return campaign;
  }
  const claim = await McpPointsDraftClaim.findOne({ tenantId, logicalKey: nameKey(input) });
  return incompleteCampaign(tenantId, claim?.campaignId);
}

async function assertDraftTarget(tenantId, user, input) {
  await resolveRecipients(tenantId, user, input);
  const manager = isDepartmentManager(user);
  let entity = null;
  if (input.entityId) {
    entity = await Entity.findOne({ _id: input.entityId, tenantId });
    if (!entity) throw new NotFoundError('Entity not found');
    if (input.walletId && String(entity.walletId) !== String(input.walletId)) {
      throw new ApiError(422, 'That department is not on the selected wallet', 'ENTITY_WALLET_MISMATCH');
    }
    assertEntityAccess(user, entity._id);
  } else if (manager) {
    throw new ApiError(422, 'Choose the department whose budget should pay for this campaign', 'ENTITY_REQUIRED');
  } else {
    const wallet = await Wallet.findOne({ _id: input.walletId, tenantId });
    if (!wallet) throw new NotFoundError('Wallet not found');
    entity = await Entity.findOne({ tenantId, walletId: wallet._id }).sort({ createdAt: 1 });
    input.walletName = wallet.name;
  }
  input.resolvedEntityId = entity ? String(entity._id) : '';
  input.entityName = entity?.name || input.walletName || '';
  input.fundingSource = manager ? 'department_budget' : 'organization_unallocated';
  input.departmentBudgetCharged = manager;
  const shop = await Shop.findOne({ _id: input.shopId, tenantId });
  if (!shop) throw new NotFoundError('Shop not found');
  const campaign = await linkedDraft(tenantId, input);
  if (campaign) assertEntityAccess(user, campaign.entityId);
  return campaign;
}

function recipientBinding(input) {
  return (input.resolvedRecipients || []).map((row) => ({
    contactId: row.contactId || '',
    email: row.email,
  }));
}

async function resourceVersion(tenantId, input) {
  const recipients = recipientBinding(input);
  if (input.campaignId) {
    const campaign = await Campaign.findOne({ _id: input.campaignId, tenantId });
    if (!campaign) return { campaignId: input.campaignId, missing: true, recipients };
    return {
      campaignId: String(campaign._id),
      status: campaign.status,
      name: campaign.name,
      updatedAt: new Date(campaign.updatedAt).toISOString(),
      recipientCount: campaign.recipientCount ?? 0,
      recipients,
    };
  }
  const claim = await McpPointsDraftClaim.findOne({ tenantId, logicalKey: nameKey(input) });
  const campaign = await incompleteCampaign(tenantId, claim?.campaignId);
  if (!campaign) return { logicalKey: nameKey(input), campaignId: null, recipients };
  return {
    logicalKey: nameKey(input),
    campaignId: String(campaign._id),
    status: campaign.status,
    updatedAt: new Date(campaign.updatedAt).toISOString(),
    recipientCount: campaign.recipientCount ?? 0,
    recipients,
  };
}

function previewFrom(input, campaign) {
  return {
    action: campaign ? 'update' : 'create',
    ...(campaign ? { campaignId: String(campaign._id) } : {}),
    name: input.name,
    ...(input.resolvedEntityId ? { entityId: input.resolvedEntityId } : {}),
    ...(input.entityName ? { entityName: input.entityName } : {}),
    ...(input.walletId ? { walletId: String(input.walletId) } : {}),
    fundingSource: input.fundingSource,
    departmentBudgetCharged: input.departmentBudgetCharged,
    shopId: String(input.shopId),
    recipientCount: (input.resolvedRecipients || input.recipients).length,
    creditsPerRecipient: input.creditsPerRecipient,
  };
}

function safeResult(campaign) {
  return {
    id: String(campaign._id),
    name: campaign.name,
    status: campaign.status,
    type: 'points',
    entityId: String(campaign.entityId),
    shopId: String(campaign.shopId || ''),
    recipientCount: campaign.recipientCount ?? 0,
  };
}

function normalizedDraftName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function matchingDraft(tenantId, input) {
  const wanted = normalizedDraftName(input.name);
  const entityId = input.resolvedEntityId || input.entityId;
  if (!entityId) return null;
  const rows = await Campaign.find({
    tenantId,
    entityId,
    shopId: input.shopId,
    type: 'points',
    status: { $in: INCOMPLETE_CAMPAIGN_STATUSES },
  }).sort({ createdAt: 1 });
  return rows.find((row) => normalizedDraftName(row.name) === wanted) || null;
}

async function linkMatchingDraft(tenantId, logicalKey, input) {
  const claim = await McpPointsDraftClaim.findOne({ tenantId, logicalKey });
  const linked = await incompleteCampaign(tenantId, claim?.campaignId);
  if (linked) return String(linked._id);
  if (claim?.campaignId) {
    const locked = await Campaign.findOne({ _id: claim.campaignId, tenantId });
    if (locked && !INCOMPLETE_CAMPAIGN_STATUSES.includes(locked.status)) {
      throw new ApiError(422, 'Only incomplete campaigns can be saved as drafts', 'CAMPAIGN_LOCKED');
    }
  }
  const match = await matchingDraft(tenantId, input);
  if (!match) return null;
  await McpPointsDraftClaim.updateOne(
    { tenantId, logicalKey },
    { $set: { campaignId: match._id } },
    { upsert: true },
  );
  return String(match._id);
}

async function waitForDraft(tenantId, logicalKey, input) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const campaignId = await linkMatchingDraft(tenantId, logicalKey, input);
    if (campaignId) return campaignId;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new ApiError(409, 'This draft is already being saved', 'DRAFT_IN_PROGRESS');
}

async function spendEntityId(tenantId, actor, input) {
  if (input.resolvedEntityId) return input.resolvedEntityId;
  const entity = await ensureSpendEntity({
    tenantId,
    walletId: input.walletId,
    userId: actor.user.userId,
    user: actor.user,
  });
  input.resolvedEntityId = String(entity._id);
  return input.resolvedEntityId;
}

async function saveLinkedDraft({ tenantId, actor, input }) {
  const entityId = await spendEntityId(tenantId, actor, input);
  const recipients = input.resolvedRecipients || input.recipients;
  let campaignId = input.campaignId;
  let ownsClaim = false;
  const logicalKey = nameKey(input);
  if (!campaignId) {
    const matched = await linkMatchingDraft(tenantId, logicalKey, input);
    if (matched) {
      campaignId = matched;
    } else {
      try {
        await McpPointsDraftClaim.create({ tenantId, logicalKey });
        ownsClaim = true;
      } catch (error) {
        if (!duplicateKey(error)) throw error;
      }
      if (!ownsClaim) campaignId = await waitForDraft(tenantId, logicalKey, input);
    }
  }

  let saved;
  try {
    saved = await savePointsDraft({
    tenantId,
    userId: actor.user.userId,
    user: actor.user,
    data: {
      entityId,
      shopId: input.shopId,
      name: input.name,
      pointsScope: input.pointsScope,
      creditsPerRecipient: input.creditsPerRecipient,
      ...(input.message ? { message: input.message } : {}),
      ...(input.schedule ? { schedule: input.schedule } : {}),
      ...(recipients.length ? { recipients } : {}),
      ...(campaignId ? { campaignId } : {}),
    },
  });
  } catch (error) {
    if (ownsClaim) {
      const existing = await Campaign.findOne({
        tenantId,
        entityId,
        shopId: input.shopId,
        name: input.name,
        type: 'points',
        status: { $in: INCOMPLETE_CAMPAIGN_STATUSES },
      }).sort({ createdAt: -1 });
      if (existing) {
        await McpPointsDraftClaim.updateOne({ tenantId, logicalKey }, { $set: { campaignId: existing._id } });
      } else {
        await McpPointsDraftClaim.deleteOne({ tenantId, logicalKey, campaignId: null });
      }
    }
    throw error;
  }

    await McpPointsDraftClaim.updateOne(
    { tenantId, logicalKey: nameKey({ ...input, name: saved.name }) },
    { $set: { campaignId: saved._id } },
    { upsert: true },
  );
  if (logicalKey !== nameKey({ ...input, name: saved.name })) {
    await McpPointsDraftClaim.updateOne(
      { tenantId, logicalKey },
      { $set: { campaignId: saved._id } },
      { upsert: true },
    );
  }
  await writeAudit({
    tenantId,
    req: { tenantId, user: { userId: actor.user.userId, role: actor.user.role } },
    action: 'campaign.save_points_draft',
    entityType: 'Campaign',
    entityId: saved._id,
    after: { status: saved.status, name: saved.name, recipientCount: saved.recipientCount ?? 0 },
  });
  return safeResult(saved);
}

export async function preparePointsDraft({ tenantId, actorUserId, input, now }) {
  const requested = parseDraft(input);
  const planned = {};
  const prepared = await prepareMcpWrite({
    tenantId,
    actorUserId,
    operation: 'campaigns.points_draft',
    payload: requested,
    now,
    authorize: async (actor) => {
      assertDraftWriter(actor);
      planned.campaign = await assertDraftTarget(tenantId, actor.user, requested);
    },
    validate: async () => hashDraft(requested),
    resourceState: async () => resourceVersion(tenantId, requested),
    summary: async () => ({
      action: planned.campaign ? 'update' : 'create',
      name: requested.name,
      recipientCount: (requested.resolvedRecipients || requested.recipients).length,
    }),
  });
  return {
    confirmationId: prepared.confirmationId,
    expiresAt: prepared.expiresAt,
    preview: previewFrom(requested, planned.campaign),
  };
}

export async function executePointsDraft({
  tenantId,
  actorUserId,
  input,
  confirmationId,
  idempotencyKey,
  now,
}) {
  await ensureClaims();
  const requested = parseDraft(input);
  return executeMcpWrite({
    tenantId,
    actorUserId,
    operation: 'campaigns.points_draft',
    payload: requested,
    confirmationId,
    idempotencyKey,
    now,
    authorize: async (actor) => {
      assertDraftWriter(actor);
      await assertDraftTarget(tenantId, actor.user, requested);
    },
    validate: async () => hashDraft(requested),
    resourceState: async () => resourceVersion(tenantId, requested),
    reconcile: async () => {
      const match = await matchingDraft(tenantId, requested);
      if (match) return { outcome: 'completed', result: safeResult(match) };
      const claim = await McpPointsDraftClaim.findOne({ tenantId, logicalKey: nameKey(requested) });
      if (claim && !claim.campaignId) return { outcome: 'uncertain' };
      return { outcome: 'absent' };
    },
    execute: async (actor) => saveLinkedDraft({ tenantId, actor, input: requested }),
  });
}

function requireCaller(ctx) {
  const caller = employeeReaderFromContext(ctx);
  if (!caller.tenantId || !caller.user.userId) {
    throw new ForbiddenError('Campaign drafts are not available for this account');
  }
  return caller;
}

export async function preparePointsDraftForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return preparePointsDraft({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
  });
}

export async function executePointsDraftForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return executePointsDraft({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
    confirmationId: args?.confirmationId,
    idempotencyKey: args?.idempotencyKey,
  });
}

export function pointsDraftText(output, heading) {
  const subject = output.preview || output;
  const lines = [
    heading,
    `${subject.name}. ${subject.action || subject.status}. Recipients: ${subject.recipientCount}.`,
  ];
  if (subject.fundingSource === 'organization_unallocated') {
    lines.push(subject.entityName
      ? `Organization wallet unallocated balance. Recorded on ${subject.entityName}. That department allocation is not reduced.`
      : 'Organization wallet unallocated balance. No department allocation is reduced.');
  }
  if (subject.fundingSource === 'department_budget' && subject.entityName) {
    lines.push(`Department budget for ${subject.entityName}.`);
  }
  if (output.confirmationId) lines.push('Confirm this preview before it expires.');
  return lines.join('\n');
}

const DRAFT_ERRORS = {
  FORBIDDEN: 'You cannot save this campaign draft.',
  NOT_FOUND: 'Campaign draft details were not found.',
  RECIPIENT_NOT_FOUND: 'Employee not found.',
  RECIPIENT_EMAIL_MISSING: 'This employee has no email address.',
  RECIPIENT_MISMATCH: 'That contact does not use this email address.',
  VALIDATION: 'Campaign draft details are not valid.',
  CAMPAIGN_LOCKED: 'Only an incomplete campaign can be saved as a draft.',
  INVALID_CAMPAIGN_TYPE: 'Only points campaigns can be saved as a draft.',
  CONFIRMATION_STALE: 'This preview is out of date. Prepare the draft again.',
  CONFIRMATION_EXPIRED: 'This confirmation has expired. Prepare the draft again.',
  CONFIRMATION_REUSED: 'This confirmation was already used.',
  CONFIRMATION_INVALID: 'This confirmation is not valid.',
  CONFIRMATION_MISMATCH: 'This confirmation does not match the requested draft.',
  IDEMPOTENCY_PAYLOAD_MISMATCH: 'This idempotency key was used for a different draft.',
  IDEMPOTENT_REPLAY_IN_FLIGHT: 'This draft is already being saved.',
  DRAFT_IN_PROGRESS: 'This draft is already being saved.',
  ACTOR_INACTIVE: 'This account cannot save campaign drafts.',
  TENANT_INACTIVE: 'This workspace cannot save campaign drafts.',
};

export function pointsDraftError(error, fallback) {
  return DRAFT_ERRORS[error?.code] || fallback;
}
