import { z } from 'zod';
import { ApiError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { writeAudit } from '../../services/audit.service.js';
import { env } from '../../config/env.js';
import { Wallet } from '../wallets/wallet.model.js';
import { walletContactFieldsRequired } from '../wallets/walletContact.validation.js';
import {
  assertTenantDocumentUrl,
  setupWallet,
} from '../wallets/wallets.service.js';
import {
  createRazorpayOrder,
  verifyWalletPayment,
} from '../payments/payments.service.js';
import { Payment } from '../payments/payment.model.js';
import { employeeReaderFromContext } from './employeesRead.js';
import { executeMcpWrite, prepareMcpWrite } from './mcpWriteSafety.js';
import { McpWalletClaim } from './mcpWalletClaim.model.js';
import { resolveSetupDocumentUrl } from './walletsDocumentUpload.js';

const WRITE_ROLES = new Set(rolesForTenantArea('wallets', 'write'));

const objectId = z.string().trim().regex(/^[a-fA-F0-9]{24}$/);

const setupRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).describe('Budget name (dashboard Budget name).'),
  currency: z.literal('INR').optional().default('INR').describe('Wallet currency. Dashboard is INR-only.'),
  validFrom: z
    .string()
    .trim()
    .min(4)
    .max(40)
    .optional()
    .nullable()
    .default(null)
    .describe('Period start — dashboard Period start / API validFrom. Prefer YYYY-MM-DD (HTML date input). Optional/nullable like POST /wallets/setup.'),
  validTo: z
    .string()
    .trim()
    .min(4)
    .max(40)
    .optional()
    .nullable()
    .default(null)
    .describe('Period end — dashboard Period end / API validTo. Prefer YYYY-MM-DD. Must be on/after validFrom when both set.'),
  fundingMethod: z
    .enum(['po_upload', 'online'])
    .optional()
    .default('po_upload')
    .describe('po_upload = Upload Agreement / PO; online = Pay Online (Razorpay hosted checkout).'),
  amount: z.coerce.number().nonnegative().optional().default(0).describe('Budget amount in INR.'),
  docType: z.string().trim().max(120).optional().default('').describe('Document type when po_upload (Agreement, Purchase Order, Work Order).'),
  docNumber: z.string().trim().max(120).optional().default('').describe('Document number when po_upload.'),
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
  ...walletContactFieldsRequired,
}).strict();

const paymentOrderSchema = z.object({
  walletId: objectId,
  amount: z.coerce.number().positive(),
}).strict();

const paymentVerifySchema = z.object({
  walletId: objectId,
  razorpayOrderId: z.string().trim().min(1).max(120),
  razorpayPaymentId: z.string().trim().min(1).max(120),
  razorpaySignature: z.string().trim().min(1).max(200),
}).strict();

export const WALLETS_PREPARE_SETUP_DESCRIPTION = [

  'Do NOT use this for Request top-up on an existing funded wallet — use wallets_prepare_topup (PO) or wallets_prepare_payment_order (online).',  'Preview organization budget (wallet) setup — dashboard EmptyBudgetState → Step1Wallet.',
  'Collect every required field before calling: budget name, amount (INR), Period start (validFrom), Period end (validTo), billing address, PIN, mobile, GSTIN, and funding method.',
  'Period start/end match the dashboard date inputs: use YYYY-MM-DD (example 2026-04-01). Same optional/nullable rules as POST /wallets/setup — still ask for them so the preview matches the dashboard Budget summary.',
  'Funding methods: po_upload (Upload Agreement / PO) or online (Pay Online / Razorpay).',
  'If po_upload and amount > 0: FIRST call wallets_prepare_document_upload, have the user open uploadPageUrl in a browser to upload the PDF, poll wallets_get_document_upload, THEN call this tool with documentTicketId.',
  'Do not claim a file pasted into chat was uploaded to ShelfMerch.',
  'Company admins only. Nothing is saved. Applying requires wallets_execute_setup after explicit user confirmation.',
].join(' ');

export const WALLETS_EXECUTE_SETUP_DESCRIPTION = [
  'Create the organization wallet from wallets_prepare_setup using the same backend as POST /wallets/setup.',
  'Requires confirmation id and idempotency key. Call only after the user explicitly confirms the preview.',
  'PO funding stays pending finance approval; balance is not credited.',
  'Online funding returns nextStep payment_required — never collect card details.',
  'A repeated key returns the original result and does not create a duplicate wallet.',
].join(' ');

export const WALLETS_PREPARE_PAYMENT_ORDER_DESCRIPTION = [
  'Preview a Razorpay hosted-checkout order for organization wallet funding.',
  'Works for first-time online wallet setup AND existing-wallet Request top-up (dashboard Add Funds / Pay Online).',
  'Does not collect card details. Applying creates the order via the existing payments service.',
].join(' ');

export const WALLETS_EXECUTE_PAYMENT_ORDER_DESCRIPTION = [
  'Create the Razorpay order from wallets_prepare_payment_order for wallet setup or existing-wallet top-up.',
  'Returns keyId, orderId, and amount for hosted checkout. Card data must never be sent to MCP.',
  'A repeated idempotency key returns the original order and does not charge again.',
].join(' ');

export const WALLETS_PREPARE_PAYMENT_VERIFY_DESCRIPTION = [
  'Preview verification of a completed Razorpay checkout for wallet funding (setup or Request top-up).',
  'Backend HMAC + Razorpay capture checks still run on execute. Finance approval remains pending.',
].join(' ');

export const WALLETS_EXECUTE_PAYMENT_VERIFY_DESCRIPTION = [
  'Verify Razorpay payment from wallets_prepare_payment_verify using the existing verifyWalletPayment service.',
  'Use after hosted checkout for online wallet setup or existing-wallet top-up.',
  'Never marks funding successful without signature verification. Wallet funding stays pending finance approval.',
].join(' ');

export const walletsPrepareSetupInputSchema = setupRequestSchema;
export const walletsExecuteSetupInputSchema = setupRequestSchema.extend({
  confirmationId: z.string().trim().min(20).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
});

export const walletsPreparePaymentOrderInputSchema = paymentOrderSchema;
export const walletsExecutePaymentOrderInputSchema = paymentOrderSchema.extend({
  confirmationId: z.string().trim().min(20).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
});

export const walletsPreparePaymentVerifyInputSchema = paymentVerifySchema;
export const walletsExecutePaymentVerifyInputSchema = paymentVerifySchema.extend({
  confirmationId: z.string().trim().min(20).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
});

const walletStatusSchema = z.object({
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

export const walletsPrepareSetupOutputSchema = z.object({
  confirmationId: z.string(),
  expiresAt: z.string(),
  preview: z.object({
    name: z.string(),
    amount: z.number(),
    currency: z.string(),
    fundingMethod: z.string(),
    validFrom: z.string().nullable(),
    validTo: z.string().nullable(),
    address: z.string(),
    pinCode: z.string(),
    mobileNumber: z.string(),
    gstin: z.string(),
    docType: z.string(),
    docNumber: z.string(),
    documentReady: z.boolean(),
    financeApprovalRequired: z.boolean(),
    existingPendingWalletId: z.string().optional(),
  }),
});

export const walletsExecuteSetupOutputSchema = walletStatusSchema;

export const walletsPreparePaymentOrderOutputSchema = z.object({
  confirmationId: z.string(),
  expiresAt: z.string(),
  preview: z.object({
    walletId: z.string(),
    amount: z.number(),
    currency: z.string(),
    fundingApprovalStatus: z.string(),
    checkoutHosted: z.literal(true),
  }),
});

export const walletsExecutePaymentOrderOutputSchema = z.object({
  walletId: z.string(),
  paymentId: z.string(),
  orderId: z.string(),
  amount: z.number(),
  amountPaise: z.number(),
  currency: z.string(),
  keyId: z.string(),
  checkoutHosted: z.literal(true),
  instructions: z.string(),
});

export const walletsPreparePaymentVerifyOutputSchema = z.object({
  confirmationId: z.string(),
  expiresAt: z.string(),
  preview: z.object({
    walletId: z.string(),
    razorpayOrderId: z.string(),
    amount: z.number().optional(),
    paymentStatus: z.string().optional(),
  }),
});

export const walletsExecutePaymentVerifyOutputSchema = z.object({
  verified: z.boolean(),
  walletId: z.string(),
  paymentId: z.string(),
  amount: z.number(),
  status: z.string(),
  pendingApproval: z.boolean(),
  fundingApprovalStatus: z.string(),
  balance: z.number(),
  idempotent: z.boolean().optional(),
});

function invalidDetails(message = 'Wallet setup details are not valid') {
  return new ApiError(400, message, 'VALIDATION');
}

function businessInput(input) {
  if (!input || typeof input !== 'object') return {};
  const { confirmationId: _c, idempotencyKey: _i, ...rest } = input;
  return rest;
}

function parseSetup(input) {
  const parsed = setupRequestSchema.safeParse(businessInput(input));
  if (!parsed.success) throw invalidDetails();
  const data = parsed.data;
  if (data.validFrom && Number.isNaN(Date.parse(data.validFrom))) {
    throw invalidDetails('Validity start is not a valid date');
  }
  if (data.validTo && Number.isNaN(Date.parse(data.validTo))) {
    throw invalidDetails('Validity end is not a valid date');
  }
  if (data.validFrom && data.validTo && data.validTo < data.validFrom) {
    throw invalidDetails('Validity end must be on or after the start date');
  }
  if (data.fundingMethod === 'po_upload' && data.amount > 0 && !data.documentUrl && !data.documentTicketId) {
    throw new ApiError(422, 'Purchase order document reference is required', 'DOCUMENT_REQUIRED');
  }
  if (data.fundingMethod === 'online' && data.amount < 1) {
    throw new ApiError(422, 'Online funding amount must be at least ₹1', 'INVALID_AMOUNT');
  }
  return data;
}

function parsePaymentOrder(input) {
  const parsed = paymentOrderSchema.safeParse(businessInput(input));
  if (!parsed.success) throw invalidDetails('Payment order details are not valid');
  return parsed.data;
}

function parsePaymentVerify(input) {
  const parsed = paymentVerifySchema.safeParse(businessInput(input));
  if (!parsed.success) throw invalidDetails('Payment verification details are not valid');
  return parsed.data;
}

function assertWriter(actor) {
  if (!WRITE_ROLES.has(actor?.user?.role)) {
    throw new ForbiddenError('Organization wallet setup requires a company admin');
  }
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function nameKey(data) {
  return `wallet:${normalizeName(data.name)}`;
}

function iso(value) {
  if (!value) return null;
  return new Date(value).toISOString();
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

async function findPendingByName(tenantId, name) {
  return Wallet.findOne({
    tenantId,
    name: String(name).trim(),
    'fundingDocument.approvalStatus': 'pending',
    status: { $in: ['draft', 'wallet_created'] },
  });
}

function setupResourceState(wallet, documentUrl) {
  if (!wallet) {
    return {
      exists: false,
      documentUrl: documentUrl || '',
    };
  }
  return {
    exists: true,
    walletId: String(wallet._id),
    status: wallet.status,
    fundingApprovalStatus: String(wallet.fundingDocument?.approvalStatus || ''),
    balance: Number(wallet.balance) || 0,
    documentUrl: documentUrl || wallet.fundingDocument?.fileUrl || '',
    updatedAt: new Date(wallet.updatedAt).toISOString(),
  };
}

let claimsReady;
async function ensureClaims() {
  claimsReady ??= McpWalletClaim.syncIndexes();
  return claimsReady;
}

function duplicateKey(error) {
  return error?.code === 11000;
}

async function linkClaim(tenantId, logicalKey, walletId) {
  await McpWalletClaim.updateOne(
    { tenantId, logicalKey },
    { $set: { walletId } },
    { upsert: true },
  );
}

async function runSetup(actor, requested) {
  await ensureClaims();
  const tenantId = actor.tenant._id;
  const userId = actor.user.userId;
  let documentUrl;
  if (requested.fundingMethod === 'po_upload' && requested.amount > 0) {
    documentUrl = await resolveSetupDocumentUrl({
      tenantId,
      actorUserId: userId,
      documentUrl: requested.documentUrl,
      documentTicketId: requested.documentTicketId,
      consume: true,
    });
    assertTenantDocumentUrl(tenantId, documentUrl);
  }

  const pending = await findPendingByName(tenantId, requested.name);
  if (pending) {
    await linkClaim(tenantId, nameKey(requested), pending._id);
    const snap = walletSnapshot(pending);
    return {
      ...snap,
      nextStep: snap.fundingPending ? 'finance_approval' : undefined,
    };
  }

  const logicalKey = nameKey(requested);
  let ownsClaim = false;
  try {
    await McpWalletClaim.create({ tenantId, logicalKey });
    ownsClaim = true;
  } catch (error) {
    if (!duplicateKey(error)) throw error;
  }
  if (!ownsClaim) {
    const claim = await McpWalletClaim.findOne({ tenantId, logicalKey });
    if (claim?.walletId) {
      const existing = await Wallet.findOne({ _id: claim.walletId, tenantId });
      if (existing) {
        const snap = walletSnapshot(existing);
        return {
          ...snap,
          nextStep: existing.fundingMethod === 'online' && !snap.fundingPending
            ? 'payment_required'
            : snap.fundingPending
              ? 'finance_approval'
              : undefined,
        };
      }
    }
    throw new ApiError(409, 'This wallet is already being created', 'WALLET_EXISTS');
  }

  try {
    const wallet = await setupWallet({
      tenantId,
      userId,
      data: {
        name: requested.name,
        currency: requested.currency,
        validFrom: requested.validFrom,
        validTo: requested.validTo,
        fundingMethod: requested.fundingMethod,
        amount: requested.fundingMethod === 'po_upload' ? requested.amount : 0,
        docType: requested.docType,
        docNumber: requested.docNumber,
        address: requested.address,
        pinCode: requested.pinCode,
        mobileNumber: requested.mobileNumber,
        gstin: requested.gstin,
        documentUrl,
      },
    });
    await linkClaim(tenantId, logicalKey, wallet._id);
    await writeAudit({
      tenantId,
      req: { tenantId, user: { userId, role: actor.user.role } },
      action: 'wallet.setup',
      entityType: 'Wallet',
      entityId: wallet._id,
      after: {
        name: wallet.name,
        fundingMethod: wallet.fundingMethod,
        approvalStatus: wallet.fundingDocument?.approvalStatus || '',
      },
    });
    const snap = walletSnapshot(wallet);
    if (requested.fundingMethod === 'online') {
      return {
        ...snap,
        requestedAmount: requested.amount,
        nextStep: 'payment_required',
      };
    }
    return {
      ...snap,
      nextStep: snap.fundingPending ? 'finance_approval' : undefined,
    };
  } catch (error) {
    const existing = await findPendingByName(tenantId, requested.name);
    if (existing) {
      await linkClaim(tenantId, logicalKey, existing._id);
      throw error;
    }
    await McpWalletClaim.deleteOne({ tenantId, logicalKey, walletId: null });
    throw error;
  }
}

export async function prepareWalletSetup({ tenantId, actorUserId, input, now }) {
  const requested = parseSetup(input);
  const planned = { documentUrl: requested.documentUrl || '' };
  const prepared = await prepareMcpWrite({
    tenantId,
    actorUserId,
    operation: 'wallets.setup',
    payload: {
      ...requested,
      validFrom: iso(requested.validFrom),
      validTo: iso(requested.validTo),
    },
    now,
    authorize: async (actor) => {
      assertWriter(actor);
      if (requested.fundingMethod === 'po_upload' && requested.amount > 0) {
        planned.documentUrl = await resolveSetupDocumentUrl({
          tenantId,
          actorUserId,
          documentUrl: requested.documentUrl,
          documentTicketId: requested.documentTicketId,
          consume: false,
        });
        assertTenantDocumentUrl(tenantId, planned.documentUrl);
      }
      planned.pending = await findPendingByName(tenantId, requested.name);
    },
    validate: async () => ({
      ...requested,
      validFrom: iso(requested.validFrom),
      validTo: iso(requested.validTo),
      documentUrl: planned.documentUrl || requested.documentUrl || '',
    }),
    resourceState: async () => setupResourceState(planned.pending, planned.documentUrl),
    summary: async () => ({
      action: 'preview',
      name: requested.name,
      amount: requested.amount,
      fundingMethod: requested.fundingMethod,
    }),
  });
  return {
    confirmationId: prepared.confirmationId,
    expiresAt: prepared.expiresAt,
    preview: {
      name: requested.name,
      amount: requested.amount,
      currency: requested.currency,
      fundingMethod: requested.fundingMethod,
      validFrom: iso(requested.validFrom),
      validTo: iso(requested.validTo),
      address: requested.address,
      pinCode: requested.pinCode,
      mobileNumber: requested.mobileNumber,
      gstin: requested.gstin,
      docType: requested.docType,
      docNumber: requested.docNumber,
      documentReady: requested.fundingMethod !== 'po_upload' || requested.amount === 0 || Boolean(planned.documentUrl),
      financeApprovalRequired: true,
      existingPendingWalletId: planned.pending ? String(planned.pending._id) : undefined,
    },
  };
}

export async function executeWalletSetup({
  tenantId,
  actorUserId,
  input,
  confirmationId,
  idempotencyKey,
  now,
}) {
  const requested = parseSetup(input);
  // Resolve before executeMcpWrite — validate runs before authorize and must
  // match the prepare payload hash (which includes the stored document URL).
  let resolvedDocumentUrl = requested.documentUrl || '';
  if (requested.fundingMethod === 'po_upload' && requested.amount > 0) {
    resolvedDocumentUrl = await resolveSetupDocumentUrl({
      tenantId,
      actorUserId,
      documentUrl: requested.documentUrl,
      documentTicketId: requested.documentTicketId,
      consume: false,
    });
    assertTenantDocumentUrl(tenantId, resolvedDocumentUrl);
  }
  const setupPayload = {
    ...requested,
    validFrom: iso(requested.validFrom),
    validTo: iso(requested.validTo),
    documentUrl: resolvedDocumentUrl || '',
  };
  return executeMcpWrite({
    tenantId,
    actorUserId,
    operation: 'wallets.setup',
    payload: setupPayload,
    confirmationId,
    idempotencyKey,
    now,
    authorize: async (actor) => {
      assertWriter(actor);
    },
    validate: async () => setupPayload,
    resourceState: async () => setupResourceState(
      await findPendingByName(tenantId, requested.name),
      resolvedDocumentUrl,
    ),
    reconcile: async () => {
      const pending = await findPendingByName(tenantId, requested.name);
      if (pending) {
        const snap = walletSnapshot(pending);
        return {
          outcome: 'completed',
          result: {
            ...snap,
            nextStep: snap.fundingPending ? 'finance_approval' : undefined,
          },
        };
      }
      const claim = await McpWalletClaim.findOne({ tenantId, logicalKey: nameKey(requested) });
      if (claim?.walletId) {
        const wallet = await Wallet.findOne({ _id: claim.walletId, tenantId });
        if (wallet) {
          const snap = walletSnapshot(wallet);
          return {
            outcome: 'completed',
            result: {
              ...snap,
              nextStep: wallet.fundingMethod === 'online' && !snap.fundingPending
                ? 'payment_required'
                : snap.fundingPending
                  ? 'finance_approval'
                  : undefined,
            },
          };
        }
      }
      return { outcome: 'absent' };
    },
    execute: async (actor) => runSetup(actor, {
      ...requested,
      documentUrl: resolvedDocumentUrl || requested.documentUrl,
    }),
  });
}

export async function prepareWalletPaymentOrder({ tenantId, actorUserId, input, now }) {
  const requested = parsePaymentOrder(input);
  const planned = {};
  const prepared = await prepareMcpWrite({
    tenantId,
    actorUserId,
    operation: 'wallets.payment_order',
    payload: requested,
    now,
    authorize: async (actor) => {
      assertWriter(actor);
      planned.wallet = await loadWallet(tenantId, requested.walletId);
      if (planned.wallet.fundingDocument?.approvalStatus === 'pending') {
        throw new ApiError(422, 'A funding request is already pending finance approval', 'FUNDING_PENDING');
      }
    },
    validate: async () => requested,
    resourceState: async () => ({
      walletId: String(planned.wallet._id),
      fundingApprovalStatus: String(planned.wallet.fundingDocument?.approvalStatus || ''),
      balance: Number(planned.wallet.balance) || 0,
      updatedAt: new Date(planned.wallet.updatedAt).toISOString(),
    }),
    summary: async () => ({ action: 'preview', walletId: requested.walletId, amount: requested.amount }),
  });
  return {
    confirmationId: prepared.confirmationId,
    expiresAt: prepared.expiresAt,
    preview: {
      walletId: String(planned.wallet._id),
      amount: requested.amount,
      currency: planned.wallet.currency || 'INR',
      fundingApprovalStatus: String(planned.wallet.fundingDocument?.approvalStatus || ''),
      checkoutHosted: true,
    },
  };
}

export async function executeWalletPaymentOrder({
  tenantId,
  actorUserId,
  input,
  confirmationId,
  idempotencyKey,
  now,
}) {
  const requested = parsePaymentOrder(input);
  return executeMcpWrite({
    tenantId,
    actorUserId,
    operation: 'wallets.payment_order',
    payload: requested,
    confirmationId,
    idempotencyKey,
    now,
    authorize: async (actor) => {
      assertWriter(actor);
      const wallet = await loadWallet(tenantId, requested.walletId);
      if (wallet.fundingDocument?.approvalStatus === 'pending') {
        throw new ApiError(422, 'A funding request is already pending finance approval', 'FUNDING_PENDING');
      }
    },
    validate: async () => requested,
    resourceState: async () => {
      const wallet = await loadWallet(tenantId, requested.walletId);
      return {
        walletId: String(wallet._id),
        fundingApprovalStatus: String(wallet.fundingDocument?.approvalStatus || ''),
        balance: Number(wallet.balance) || 0,
        updatedAt: new Date(wallet.updatedAt).toISOString(),
      };
    },
    reconcile: async () => {
      const payment = await Payment.findOne({
        tenantId,
        relatedType: 'wallet_funding',
        relatedId: requested.walletId,
        amount: requested.amount,
        status: 'pending',
      }).sort({ createdAt: -1 });
      if (!payment?.razorpayOrderId) return { outcome: 'absent' };
      return {
        outcome: 'completed',
        result: {
          walletId: String(requested.walletId),
          paymentId: String(payment._id),
          orderId: payment.razorpayOrderId,
          amount: payment.amount,
          amountPaise: Math.round(payment.amount * 100),
          currency: payment.currency || 'INR',
          keyId: env.RAZORPAY_KEY_ID || '',
          checkoutHosted: true,
          instructions: 'Open Razorpay hosted checkout with keyId and orderId. Do not send card details to MCP.',
        },
      };
    },
    execute: async (actor) => {
      const order = await createRazorpayOrder({
        tenantId,
        userId: actor.user.userId,
        walletId: requested.walletId,
        amountInr: requested.amount,
        purpose: 'wallet_funding',
      });
      return {
        walletId: order.walletId,
        paymentId: order.paymentId,
        orderId: order.orderId,
        amount: order.amount,
        amountPaise: order.amountPaise,
        currency: order.currency,
        keyId: order.keyId,
        checkoutHosted: true,
        instructions: 'Open Razorpay hosted checkout with keyId and orderId. Do not send card details to MCP.',
      };
    },
  });
}

export async function prepareWalletPaymentVerify({ tenantId, actorUserId, input, now }) {
  const requested = parsePaymentVerify(input);
  const planned = {};
  const prepared = await prepareMcpWrite({
    tenantId,
    actorUserId,
    operation: 'wallets.payment_verify',
    payload: requested,
    now,
    authorize: async (actor) => {
      assertWriter(actor);
      planned.wallet = await loadWallet(tenantId, requested.walletId);
      planned.payment = await Payment.findOne({
        tenantId,
        provider: 'razorpay',
        $or: [
          { razorpayOrderId: requested.razorpayOrderId },
          { providerRefId: requested.razorpayOrderId },
        ],
      });
      if (planned.payment && String(planned.payment.relatedId) !== String(requested.walletId)) {
        throw new NotFoundError('Payment not found');
      }
    },
    validate: async () => requested,
    resourceState: async () => ({
      walletId: String(planned.wallet._id),
      paymentStatus: planned.payment?.status || 'missing',
      fundingApprovalStatus: String(planned.wallet.fundingDocument?.approvalStatus || ''),
      updatedAt: new Date(planned.wallet.updatedAt).toISOString(),
    }),
    summary: async () => ({
      action: 'preview',
      walletId: requested.walletId,
      razorpayOrderId: requested.razorpayOrderId,
    }),
  });
  return {
    confirmationId: prepared.confirmationId,
    expiresAt: prepared.expiresAt,
    preview: {
      walletId: String(planned.wallet._id),
      razorpayOrderId: requested.razorpayOrderId,
      amount: planned.payment?.amount,
      paymentStatus: planned.payment?.status,
    },
  };
}

export async function executeWalletPaymentVerify({
  tenantId,
  actorUserId,
  input,
  confirmationId,
  idempotencyKey,
  now,
}) {
  const requested = parsePaymentVerify(input);
  return executeMcpWrite({
    tenantId,
    actorUserId,
    operation: 'wallets.payment_verify',
    payload: requested,
    confirmationId,
    idempotencyKey,
    now,
    authorize: async (actor) => {
      assertWriter(actor);
      await loadWallet(tenantId, requested.walletId);
      const boundPayment = await Payment.findOne({
        tenantId,
        provider: 'razorpay',
        $or: [
          { razorpayOrderId: requested.razorpayOrderId },
          { providerRefId: requested.razorpayOrderId },
          { razorpayPaymentId: requested.razorpayPaymentId },
        ],
      });
      if (!boundPayment || String(boundPayment.relatedId) !== String(requested.walletId)) {
        throw new NotFoundError('Payment not found');
      }
    },
    validate: async () => requested,
    resourceState: async () => {
      const wallet = await loadWallet(tenantId, requested.walletId);
      const payment = await Payment.findOne({
        tenantId,
        provider: 'razorpay',
        relatedId: requested.walletId,
        $or: [
          { razorpayOrderId: requested.razorpayOrderId },
          { providerRefId: requested.razorpayOrderId },
        ],
      });
      return {
        walletId: String(wallet._id),
        paymentStatus: payment?.status || 'missing',
        fundingApprovalStatus: String(wallet.fundingDocument?.approvalStatus || ''),
        updatedAt: new Date(wallet.updatedAt).toISOString(),
      };
    },
    reconcile: async () => {
      const payment = await Payment.findOne({
        tenantId,
        provider: 'razorpay',
        relatedId: requested.walletId,
        $or: [
          { razorpayOrderId: requested.razorpayOrderId },
          { razorpayPaymentId: requested.razorpayPaymentId },
        ],
      });
      if (payment?.status === 'succeeded') {
        const wallet = await loadWallet(tenantId, requested.walletId);
        const snap = walletSnapshot(wallet);
        return {
          outcome: 'completed',
          result: {
            verified: true,
            idempotent: true,
            walletId: snap.walletId,
            paymentId: String(payment._id),
            amount: payment.amount,
            status: snap.fundingPending ? 'pending_approval' : 'succeeded',
            pendingApproval: snap.fundingPending,
            fundingApprovalStatus: snap.fundingApprovalStatus,
            balance: snap.balance,
          },
        };
      }
      if (payment?.status === 'failed') {
        return { outcome: 'uncertain' };
      }
      return { outcome: 'absent' };
    },
    execute: async (actor) => {
      const result = await verifyWalletPayment({
        tenantId,
        userId: actor.user.userId,
        razorpayOrderId: requested.razorpayOrderId,
        razorpayPaymentId: requested.razorpayPaymentId,
        razorpaySignature: requested.razorpaySignature,
      });
      const wallet = await loadWallet(tenantId, requested.walletId);
      const snap = walletSnapshot(wallet);
      return {
        verified: Boolean(result.verified),
        walletId: snap.walletId,
        paymentId: result.paymentId,
        amount: result.amount,
        status: result.status,
        pendingApproval: Boolean(result.pendingApproval),
        fundingApprovalStatus: snap.fundingApprovalStatus,
        balance: snap.balance,
        idempotent: result.idempotent,
      };
    },
  });
}

function requireCaller(ctx) {
  const caller = employeeReaderFromContext(ctx);
  if (!caller.tenantId || !caller.user.userId) {
    throw new ForbiddenError('Organization wallet setup is not available for this account');
  }
  return caller;
}

export async function prepareWalletSetupForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return prepareWalletSetup({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
  });
}

export async function executeWalletSetupForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return executeWalletSetup({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
    confirmationId: args?.confirmationId,
    idempotencyKey: args?.idempotencyKey,
  });
}

export async function prepareWalletPaymentOrderForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return prepareWalletPaymentOrder({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
  });
}

export async function executeWalletPaymentOrderForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return executeWalletPaymentOrder({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
    confirmationId: args?.confirmationId,
    idempotencyKey: args?.idempotencyKey,
  });
}

export async function prepareWalletPaymentVerifyForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return prepareWalletPaymentVerify({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
  });
}

export async function executeWalletPaymentVerifyForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return executeWalletPaymentVerify({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
    confirmationId: args?.confirmationId,
    idempotencyKey: args?.idempotencyKey,
  });
}

export function walletsSetupText(output, heading) {
  if (output.preview) {
    const p = output.preview;
    if (p.fundingMethod) {
        const validity =
          p.validFrom || p.validTo
            ? `Period ${p.validFrom || '—'} → ${p.validTo || '—'}`
            : 'Period dates not set (optional on dashboard)';
        return [
          heading,
          `${p.name} · ${p.amount} ${p.currency} · ${p.fundingMethod}`,
          validity,
          p.documentReady === false
            ? 'PO document missing — use wallets_prepare_document_upload / uploadPageUrl first.'
            : '',
          p.financeApprovalRequired ? 'Finance approval required after setup.' : '',
          'Confirm this preview before it expires.',
        ].filter(Boolean).join('\n');
      }
    if (p.checkoutHosted) {
      return [heading, `Hosted checkout ${p.amount} ${p.currency}`, 'Confirm to create the Razorpay order.'].join('\n');
    }
    return [heading, `Verify order ${p.razorpayOrderId}`, 'Confirm before verifying.'].join('\n');
  }
  if (output.orderId) {
    return [heading, `Order ${output.orderId}`, output.instructions].join('\n');
  }
  if (output.verified != null) {
    return [
      heading,
      `Payment ${output.status}`,
      output.pendingApproval ? 'Finance approval still pending.' : '',
      `Wallet balance ${output.balance}`,
    ].filter(Boolean).join('\n');
  }
  return [
    heading,
    `${output.name || output.walletId} · ${output.status}`,
    `Funding ${output.fundingApprovalStatus || 'none'}`,
    output.nextStep ? `Next: ${output.nextStep}` : '',
  ].filter(Boolean).join('\n');
}

const WRITE_ERRORS = {
  FORBIDDEN: 'You cannot set up the organization wallet.',
  NOT_FOUND: 'That wallet or payment was not found.',
  VALIDATION: 'Wallet setup details are not valid.',
  DOCUMENT_REQUIRED: 'Upload the purchase order first: call wallets_prepare_document_upload, open uploadPageUrl in a browser, then pass documentTicketId here.',
  INVALID_DOCUMENT_URL: 'That document reference is not valid for this workspace.',
  WALLET_EXISTS: 'A wallet with this name is already being created.',
  FUNDING_PENDING: 'A funding request is already pending finance approval.',
  USE_RAZORPAY: 'Online funding must use Razorpay checkout.',
  INVALID_AMOUNT: 'The funding amount is not valid.',
  PAYMENT_FAILED: 'This payment was marked as failed.',
  PAYMENT_NOT_CAPTURED: 'Payment was not captured by Razorpay.',
  PAYMENT_ORDER_MISMATCH: 'Payment does not match the Razorpay order.',
  PAYMENT_AMOUNT_MISMATCH: 'Payment amount does not match the order.',
  INVALID_PAYMENT_SIGNATURE: 'Razorpay payment signature is invalid.',
  RAZORPAY_NOT_CONFIGURED: 'Razorpay is not configured in this environment.',
  CONFIRMATION_STALE: 'This preview is out of date. Prepare the setup again.',
  CONFIRMATION_EXPIRED: 'This confirmation has expired. Prepare the setup again.',
  CONFIRMATION_REUSED: 'This confirmation was already used.',
  CONFIRMATION_INVALID: 'This confirmation is not valid.',
  CONFIRMATION_MISMATCH: 'This confirmation does not match the requested setup.',
  IDEMPOTENCY_PAYLOAD_MISMATCH: 'This idempotency key was used for a different request.',
  IDEMPOTENT_REPLAY_IN_FLIGHT: 'This request is already in progress.',
  IDEMPOTENCY_RECONCILIATION_REQUIRED: 'This request needs to be checked before it can be retried.',
  ACTOR_INACTIVE: 'This account cannot set up wallets.',
  TENANT_INACTIVE: 'This workspace cannot set up wallets.',
};

export function walletsSetupError(error, fallback) {
  return WRITE_ERRORS[error?.code] || fallback;
}
