import { z } from 'zod';
import { ApiError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { writeAudit } from '../../services/audit.service.js';
import { Wallet } from '../wallets/wallet.model.js';
import {
  assertTenantDocumentUrl,
  fundWallet,
  getWallet,
} from '../wallets/wallets.service.js';
import { employeeReaderFromContext } from './employeesRead.js';
import { executeMcpWrite, prepareMcpWrite } from './mcpWriteSafety.js';
import { resolveSetupDocumentUrl } from './walletsDocumentUpload.js';
import { McpWalletDocumentTicket } from './mcpWalletDocumentTicket.model.js';

const WRITE_ROLES = new Set(rolesForTenantArea('wallets', 'write'));

const objectId = z.string().trim().regex(/^[a-fA-F0-9]{24}$/);

const DOC_TYPES = ['Agreement', 'Purchase Order', 'Work Order'];

const topupRequestSchema = z.object({
  walletId: objectId.describe('Existing organization wallet to top up (from wallet_list_balances).'),
  amount: z.coerce.number().positive().describe('Top-up amount in INR (dashboard Request top-up amount).'),
  fundingMethod: z
    .enum(['po_upload', 'online'])
    .optional()
    .default('po_upload')
    .describe('po_upload = Purchase Order / Agreement; online = Razorpay hosted checkout (use payment tools).'),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .default('')
    .describe('Optional reference note shown on the funding request.'),
  docType: z
    .string()
    .trim()
    .max(120)
    .optional()
    .default('Purchase Order')
    .describe(`Document type when po_upload: ${DOC_TYPES.join(', ')}.`),
  docNumber: z
    .string()
    .trim()
    .max(120)
    .optional()
    .default('')
    .describe('Document number when po_upload (required by dashboard before submit).'),
  documentUrl: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .optional()
    .describe('Tenant document URL after upload. Prefer documentTicketId from wallets_prepare_document_upload.'),
  documentTicketId: z
    .string()
    .trim()
    .min(8)
    .max(80)
    .optional()
    .describe('ticketId from wallets_prepare_document_upload after the user uploads via uploadPageUrl.'),
}).strict();

export const WALLETS_PREPARE_TOPUP_DESCRIPTION = [
  'Preview an organization wallet top-up — dashboard Budget → Request top-up (Add Funds).',
  'Use this for an EXISTING funded wallet. Do NOT use wallets_prepare_setup (that creates a new wallet).',
  'Collect amount, funding method, and optional reference note.',
  'For po_upload: FIRST call wallets_prepare_document_upload, have the user open uploadPageUrl to upload the PDF, poll wallets_get_document_upload, THEN call this tool with documentTicketId, docType, and docNumber.',
  'For online: do not call this tool — use wallets_prepare_payment_order / wallets_execute_payment_order then hosted checkout and wallets_*_payment_verify.',
  'Dashboard may mention up to 5% PO bonus after finance approval; MCP never applies bonus funds.',
  'Company admins only. Nothing is saved. Applying requires wallets_execute_topup after explicit user confirmation.',
].join(' ');

export const WALLETS_EXECUTE_TOPUP_DESCRIPTION = [
  'Submit the organization wallet top-up from wallets_prepare_topup using the same backend as POST /wallets/:id/fund (+ funding-document attach).',
  'Requires confirmationId and idempotencyKey. Call only after the user explicitly confirms the preview.',
  'Pass the same walletId, amount, fundingMethod, docType, docNumber, and optional description as prepare. documentTicketId and documentUrl are interchangeable once the PO is uploaded — confirmation matches the resolved document, not which handle you pass.',
  'PO funding stays pending finance approval; balance is not credited on submit.',
  'Online funding must use Razorpay payment tools, not this tool.',
  'A repeated key returns the original result and does not create a duplicate funding request.',
].join(' ');

export const walletsPrepareTopupInputSchema = topupRequestSchema;
export const walletsExecuteTopupInputSchema = topupRequestSchema.extend({
  confirmationId: z.string().trim().min(20).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
});

export const walletsPrepareTopupOutputSchema = z.object({
  confirmationId: z.string(),
  expiresAt: z.string(),
  preview: z.object({
    walletId: z.string(),
    walletName: z.string(),
    amount: z.number(),
    currency: z.string(),
    fundingMethod: z.string(),
    description: z.string(),
    docType: z.string(),
    docNumber: z.string(),
    documentReady: z.boolean(),
    currentBalance: z.number(),
    unallocatedAmount: z.number(),
    financeApprovalRequired: z.boolean(),
    balanceUnchangedUntilFinanceApproval: z.boolean(),
  }),
});

export const walletsExecuteTopupOutputSchema = z.object({
  walletId: z.string(),
  name: z.string(),
  status: z.string(),
  currency: z.string(),
  balance: z.number(),
  allocatedAmount: z.number(),
  unallocatedAmount: z.number(),
  fundingMethod: z.string(),
  fundingApprovalStatus: z.string(),
  fundingPending: z.boolean(),
  requestedAmount: z.number().optional(),
  documentAttached: z.boolean().optional(),
  nextStep: z.string().optional(),
});

function invalidDetails(message = 'Top-up details are not valid') {
  return new ApiError(400, message, 'VALIDATION');
}

function businessInput(input) {
  if (!input || typeof input !== 'object') return {};
  const { confirmationId: _c, idempotencyKey: _i, ...rest } = input;
  return rest;
}

function parseTopup(input) {
  const parsed = topupRequestSchema.safeParse(businessInput(input));
  if (!parsed.success) throw invalidDetails();
  const data = parsed.data;
  if (data.fundingMethod === 'online') {
    throw new ApiError(
      422,
      'Online wallet top-up must use Razorpay checkout via wallets_prepare_payment_order',
      'USE_RAZORPAY',
    );
  }
  if (data.amount < 1) {
    throw new ApiError(422, 'Top-up amount must be at least ₹1', 'INVALID_AMOUNT');
  }
  if (!data.documentUrl && !data.documentTicketId) {
    throw new ApiError(422, 'Purchase order document reference is required', 'DOCUMENT_REQUIRED');
  }
  if (!String(data.docNumber || '').trim()) {
    throw new ApiError(422, 'Document number is required for PO top-up', 'DOC_NUMBER_REQUIRED');
  }
  return data;
}

function assertWriter(actor) {
  if (!WRITE_ROLES.has(actor?.user?.role)) {
    throw new ForbiddenError('Organization wallet top-up requires a company admin');
  }
}

function walletSnapshot(wallet) {
  const approval = String(wallet.fundingDocument?.approvalStatus || '');
  const balance = Number(wallet.balance) || 0;
  const allocated = Number(wallet.allocatedAmount) || 0;
  return {
    walletId: String(wallet._id),
    name: wallet.name,
    status: wallet.status,
    currency: wallet.currency || 'INR',
    balance,
    allocatedAmount: allocated,
    unallocatedAmount: balance - allocated,
    fundingMethod: wallet.fundingMethod || '',
    fundingApprovalStatus: approval,
    fundingPending: approval === 'pending',
    requestedAmount: Number(wallet.fundingDocument?.requestedAmount) || undefined,
    documentAttached: Boolean(wallet.fundingDocument?.fileUrl),
  };
}

async function loadWallet(tenantId, walletId) {
  const wallet = await Wallet.findOne({ _id: walletId, tenantId });
  if (!wallet) throw new NotFoundError('Wallet not found');
  return wallet;
}

function topupResourceState(wallet, documentUrl) {
  return {
    walletId: String(wallet._id),
    fundingApprovalStatus: String(wallet.fundingDocument?.approvalStatus || ''),
    balance: Number(wallet.balance) || 0,
    documentUrl: documentUrl || wallet.fundingDocument?.fileUrl || '',
    updatedAt: new Date(wallet.updatedAt).toISOString(),
  };
}

async function consumeTopupDocument({ tenantId, actorUserId, documentTicketId, documentUrl }) {
  if (documentTicketId) {
    await resolveSetupDocumentUrl({
      tenantId,
      actorUserId,
      documentUrl,
      documentTicketId,
      consume: true,
    });
    return;
  }
  if (!documentUrl) return;
  const ticket = await McpWalletDocumentTicket.findOne({
    tenantId,
    userId: actorUserId,
    documentUrl,
    status: 'ready',
  });
  if (!ticket) return;
  ticket.status = 'consumed';
  await ticket.save();
}

function topupConfirmationPayload(requested, documentUrl) {
  // Hash the business identity of the top-up, not the transport handle used to resolve the PO.
  // ChatGPT often prepares with documentTicketId and executes with documentUrl (or vice versa);
  // both must confirm the same resolved document.
  return {
    walletId: String(requested.walletId),
    amount: Number(requested.amount),
    fundingMethod: requested.fundingMethod || 'po_upload',
    description: String(requested.description || '').trim(),
    docType: String(requested.docType || 'Purchase Order').trim(),
    docNumber: String(requested.docNumber || '').trim(),
    documentUrl: String(documentUrl || ''),
  };
}

function buildDescription(requested, walletName) {
  const note = String(requested.description || '').trim();
  const joined = [note || undefined, walletName].filter(Boolean).join(' · ');
  return joined || 'Top-up to organization budget';
}

async function attachDocumentUrl({ tenantId, walletId, documentUrl }) {
  const wallet = await getWallet({ tenantId, walletId });
  wallet.fundingDocument.fileUrl = assertTenantDocumentUrl(tenantId, documentUrl);
  await wallet.save();
}

async function runTopup(actor, requested, documentUrl) {
  const tenantId = actor.tenant._id;
  const userId = actor.user.userId;
  assertTenantDocumentUrl(tenantId, documentUrl);

  const before = await loadWallet(tenantId, requested.walletId);
  if (before.fundingDocument?.approvalStatus === 'pending') {
    throw new ApiError(422, 'A funding request is already pending finance approval', 'FUNDING_PENDING');
  }

  // Attach document before submitting the funding request (same order as setupWallet
  // for documentUrl). If attachment fails, no pending finance request is created.
  await attachDocumentUrl({
    tenantId,
    walletId: requested.walletId,
    documentUrl,
  });

  await fundWallet({
    tenantId,
    walletId: requested.walletId,
    userId,
    amount: requested.amount,
    description: buildDescription(requested, before.name),
    fundingMethod: 'po_upload',
    docType: requested.docType,
    docNumber: requested.docNumber,
  });

  const wallet = await getWallet({ tenantId, walletId: requested.walletId });
  await writeAudit({
    tenantId,
    req: { tenantId, user: { userId, role: actor.user.role } },
    action: 'wallet.fund',
    entityType: 'Wallet',
    entityId: requested.walletId,
    after: {
      amount: requested.amount,
      fundingMethod: 'po_upload',
      approvalStatus: wallet.fundingDocument?.approvalStatus || '',
      kind: 'topup',
    },
  });

  const snap = walletSnapshot(wallet);
  return {
    ...snap,
    nextStep: snap.fundingPending ? 'finance_approval' : undefined,
  };
}

export async function prepareWalletTopup({ tenantId, actorUserId, input, now }) {
  const requested = parseTopup(input);
  const planned = { documentUrl: requested.documentUrl || '' };
  const prepared = await prepareMcpWrite({
    tenantId,
    actorUserId,
    operation: 'wallets.topup',
    payload: requested,
    now,
    authorize: async (actor) => {
      assertWriter(actor);
      planned.wallet = await loadWallet(tenantId, requested.walletId);
      if (planned.wallet.fundingDocument?.approvalStatus === 'pending') {
        throw new ApiError(422, 'A funding request is already pending finance approval', 'FUNDING_PENDING');
      }
      planned.documentUrl = await resolveSetupDocumentUrl({
        tenantId,
        actorUserId,
        documentUrl: requested.documentUrl,
        documentTicketId: requested.documentTicketId,
        consume: false,
      });
      assertTenantDocumentUrl(tenantId, planned.documentUrl);
    },
    validate: async () => topupConfirmationPayload(requested, planned.documentUrl || requested.documentUrl || ''),
    resourceState: async () => topupResourceState(planned.wallet, planned.documentUrl),
    summary: async () => ({
      action: 'preview',
      walletId: requested.walletId,
      amount: requested.amount,
      fundingMethod: requested.fundingMethod,
    }),
  });

  const balance = Number(planned.wallet.balance) || 0;
  const allocated = Number(planned.wallet.allocatedAmount) || 0;
  return {
    confirmationId: prepared.confirmationId,
    expiresAt: prepared.expiresAt,
    preview: {
      walletId: String(planned.wallet._id),
      walletName: planned.wallet.name,
      amount: requested.amount,
      currency: planned.wallet.currency || 'INR',
      fundingMethod: requested.fundingMethod,
      description: buildDescription(requested, planned.wallet.name),
      docType: requested.docType,
      docNumber: requested.docNumber,
      documentReady: Boolean(planned.documentUrl),
      currentBalance: balance,
      unallocatedAmount: balance - allocated,
      financeApprovalRequired: true,
      balanceUnchangedUntilFinanceApproval: true,
    },
  };
}

export async function executeWalletTopup({
  tenantId,
  actorUserId,
  input,
  confirmationId,
  idempotencyKey,
  now,
}) {
  const requested = parseTopup(input);
  let resolvedDocumentUrl = requested.documentUrl || '';
  resolvedDocumentUrl = await resolveSetupDocumentUrl({
    tenantId,
    actorUserId,
    documentUrl: requested.documentUrl,
    documentTicketId: requested.documentTicketId,
    consume: false,
  });
  assertTenantDocumentUrl(tenantId, resolvedDocumentUrl);

  const payload = topupConfirmationPayload(requested, resolvedDocumentUrl);

  return executeMcpWrite({
    tenantId,
    actorUserId,
    operation: 'wallets.topup',
    payload,
    confirmationId,
    idempotencyKey,
    now,
    authorize: async (actor) => {
      assertWriter(actor);
      await loadWallet(tenantId, requested.walletId);
    },
    validate: async () => payload,
    resourceState: async () => {
      const wallet = await loadWallet(tenantId, requested.walletId);
      return topupResourceState(wallet, resolvedDocumentUrl);
    },
    reconcile: async () => {
      const wallet = await Wallet.findOne({ _id: requested.walletId, tenantId });
      if (!wallet) return { outcome: 'uncertain' };
      if (
        wallet.fundingDocument?.approvalStatus === 'pending'
        && Number(wallet.fundingDocument?.requestedAmount) === Number(requested.amount)
        && Boolean(wallet.fundingDocument?.fileUrl)
      ) {
        const snap = walletSnapshot(wallet);
        return {
          outcome: 'completed',
          result: {
            ...snap,
            nextStep: snap.fundingPending ? 'finance_approval' : undefined,
          },
        };
      }
      return { outcome: 'absent' };
    },
    execute: async (actor) => {
      // Resolve without consuming first so a failed attach/fund can retry the same ticket.
      const documentUrl = await resolveSetupDocumentUrl({
        tenantId,
        actorUserId,
        documentUrl: requested.documentUrl,
        documentTicketId: requested.documentTicketId,
        consume: false,
      });
      const result = await runTopup(actor, requested, documentUrl);
      await consumeTopupDocument({
        tenantId,
        actorUserId,
        documentTicketId: requested.documentTicketId,
        documentUrl,
      });
      return result;
    },
  });
}

function requireCaller(ctx) {
  const caller = employeeReaderFromContext(ctx);
  if (!caller.tenantId || !caller.user.userId) {
    throw new ForbiddenError('Organization wallet top-up is not available for this account');
  }
  return caller;
}

export async function prepareWalletTopupForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return prepareWalletTopup({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
  });
}

export async function executeWalletTopupForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return executeWalletTopup({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
    confirmationId: args?.confirmationId,
    idempotencyKey: args?.idempotencyKey,
  });
}

export function walletsTopupText(output, heading) {
  if (output.preview) {
    const p = output.preview;
    return [
      heading,
      `${p.walletName} · add ${p.amount} ${p.currency} via ${p.fundingMethod}`,
      `Current balance ${p.currentBalance} ${p.currency} (unchanged until finance approval)`,
      p.documentReady ? '' : 'PO document missing — use wallets_prepare_document_upload / uploadPageUrl first.',
      'Confirm this preview before it expires.',
    ].filter(Boolean).join('\n');
  }
  return [
    heading,
    `${output.name || output.walletId} · ${output.fundingApprovalStatus || 'none'}`,
    output.nextStep ? `Next: ${output.nextStep}` : '',
    `Wallet balance ${output.balance}`,
  ].filter(Boolean).join('\n');
}

const WRITE_ERRORS = {
  FORBIDDEN: 'You cannot request a wallet top-up.',
  NOT_FOUND: 'That wallet was not found.',
  VALIDATION: 'Top-up details are not valid.',
  DOCUMENT_REQUIRED: 'Upload the purchase order first: call wallets_prepare_document_upload, open uploadPageUrl in a browser, then pass documentTicketId here.',
  DOC_NUMBER_REQUIRED: 'Document number is required for PO top-up.',
  INVALID_DOCUMENT_URL: 'That document reference is not valid for this workspace.',
  FUNDING_PENDING: 'A funding request is already pending finance approval.',
  USE_RAZORPAY: 'Online top-up must use Razorpay checkout via wallets_prepare_payment_order.',
  INVALID_AMOUNT: 'The top-up amount is not valid.',
  CONFIRMATION_STALE: 'This preview is out of date. Prepare the top-up again.',
  CONFIRMATION_EXPIRED: 'This confirmation has expired. Prepare the top-up again.',
  CONFIRMATION_REUSED: 'This confirmation was already used.',
  CONFIRMATION_INVALID: 'This confirmation is not valid.',
  CONFIRMATION_MISMATCH: 'This confirmation does not match the requested top-up.',
  IDEMPOTENCY_PAYLOAD_MISMATCH: 'This idempotency key was used for a different request.',
  IDEMPOTENT_REPLAY_IN_FLIGHT: 'This request is already in progress.',
  IDEMPOTENCY_RECONCILIATION_REQUIRED: 'This request needs to be checked before it can be retried.',
  ACTOR_INACTIVE: 'This account cannot top up wallets.',
  TENANT_INACTIVE: 'This workspace cannot top up wallets.',
};

export function walletsTopupError(error, fallback) {
  return WRITE_ERRORS[error?.code] || fallback;
}
