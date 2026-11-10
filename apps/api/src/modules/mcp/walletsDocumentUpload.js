import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { ApiError, ForbiddenError } from '../../utils/errors.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { uploadFile } from '../../services/storage.service.js';
import { employeeReaderFromContext } from './employeesRead.js';
import { McpWalletDocumentTicket } from './mcpWalletDocumentTicket.model.js';
import { loadMcpActor } from './mcpWriteSafety.js';

const WRITE_ROLES = new Set(rolesForTenantArea('wallets', 'write'));
const TICKET_TTL_MS = 15 * 60 * 1000;
const READY_GRACE_MS = 24 * 60 * 60 * 1000;

let indexesReady;

async function ensureIndexes() {
  indexesReady ??= McpWalletDocumentTicket.syncIndexes();
  return indexesReady;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function tokenMatches(storedHash, uploadToken) {
  const expected = Buffer.from(String(storedHash || ''), 'hex');
  const actual = Buffer.from(sha256(uploadToken), 'hex');
  if (expected.length === 0 || expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

function apiBase() {
  const base = (env.BASE_URL || env.APP_URL || 'http://localhost:8080').replace(/\/$/, '');
  if (env.NODE_ENV === 'production' && !/^https:\/\//i.test(base)) {
    throw new ApiError(500, 'Upload handoff requires HTTPS BASE_URL in production', 'INVALID_CONFIG');
  }
  return base;
}

/** PDF-only allowlist for MCP wallet PO uploads (stricter than shared DOCUMENT_TYPES). */
export const WALLET_PO_UPLOAD_TYPES = {
  mimes: new Set(['application/pdf']),
  exts: new Set(['.pdf']),
};

export function applyUploadSecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; script-src 'unsafe-inline'",
  );
}

export { tokenMatches, sha256 };

function assertWriter(actor) {
  if (!WRITE_ROLES.has(actor?.user?.role)) {
    throw new ForbiddenError('Wallet document upload requires a company admin');
  }
}

function requireCaller(ctx) {
  const caller = employeeReaderFromContext(ctx);
  if (!caller.tenantId || !caller.user.userId) {
    throw new ForbiddenError('Wallet document upload is not available for this account');
  }
  return caller;
}

export const WALLETS_PREPARE_DOCUMENT_UPLOAD_DESCRIPTION = [
  'Start the PO/Agreement upload handoff for organization budget setup (dashboard Step1Wallet Upload Agreement / PO).',
  'ChatGPT and other MCP clients cannot attach binary files to tool calls — do not ask the user to paste a PDF into chat.',
  'Call this tool first when fundingMethod is po_upload and amount > 0.',
  'Then show the user uploadPageUrl as a clickable browser link so they can select and upload the PDF themselves.',
  'After they confirm upload, call wallets_get_document_upload with ticketId until status is ready, then pass documentTicketId into wallets_prepare_setup (new wallet) or wallets_prepare_topup (existing wallet Request top-up).',
  'Company admins only. Does not create or fund a wallet.',
].join(' ');

export const WALLETS_GET_DOCUMENT_UPLOAD_DESCRIPTION = [
  'Check whether the user finished uploading a PO/Agreement via uploadPageUrl.',
  'Poll with ticketId until status is ready, then pass documentTicketId (preferred) or documentUrl into wallets_prepare_setup or wallets_prepare_topup.',
  'If status is still pending, ask the user to open uploadPageUrl and upload the PDF in their browser.',
].join(' ');

export const walletsPrepareDocumentUploadInputSchema = z.object({
  originalName: z.string().trim().min(1).max(200).optional(),
}).strict();

export const walletsPrepareDocumentUploadOutputSchema = z.object({
  ticketId: z.string(),
  uploadUrl: z.string(),
  uploadPageUrl: z.string(),
  uploadToken: z.string(),
  expiresAt: z.string(),
  instructions: z.string(),
});

export const walletsGetDocumentUploadInputSchema = z.object({
  ticketId: z.string().trim().min(8).max(80),
}).strict();

export const walletsGetDocumentUploadOutputSchema = z.object({
  ticketId: z.string(),
  status: z.enum(['pending', 'ready', 'expired', 'consumed']),
  documentUrl: z.string().optional(),
  mimeType: z.string().optional(),
  originalName: z.string().optional(),
  expiresAt: z.string(),
});

export async function prepareWalletDocumentUpload({ tenantId, actorUserId, input = {} }) {
  await ensureIndexes();
  const actor = await loadMcpActor({ tenantId, actorUserId });
  assertWriter(actor);
  const ticketId = randomBytes(16).toString('hex');
  const uploadToken = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + TICKET_TTL_MS);
  await McpWalletDocumentTicket.create({
    tenantId,
    ticketId,
    tokenHash: sha256(uploadToken),
    userId: actorUserId,
    status: 'pending',
    originalName: input.originalName || '',
    expiresAt,
  });
  const uploadUrl = `${apiBase()}/api/v1/mcp/wallet-documents/${ticketId}`;
  const uploadPageUrl = `${uploadUrl}#uploadToken=${encodeURIComponent(uploadToken)}`;
  return {
    ticketId,
    uploadUrl,
    uploadPageUrl,
    uploadToken,
    expiresAt: expiresAt.toISOString(),
    instructions: [
      'Open uploadPageUrl in a browser (clickable link). The secure token is in the URL fragment (after #), not the query string.',
      'Do not paste the file into chat — ChatGPT cannot forward binaries to ShelfMerch.',
      'Allowed type: PDF (application/pdf). Max 25 MB.',
      'When the browser page shows success, call wallets_get_document_upload with this ticketId.',
      'Then pass documentTicketId into wallets_prepare_setup or wallets_prepare_topup.',
      `Programmatic clients may POST multipart field "document" to ${uploadUrl} with header X-Mcp-Upload-Token.`,
    ].join(' '),
  };
}

export async function getWalletDocumentUpload({ tenantId, actorUserId, ticketId }) {
  await ensureIndexes();
  const actor = await loadMcpActor({ tenantId, actorUserId });
  assertWriter(actor);
  const ticket = await McpWalletDocumentTicket.findOne({ tenantId, ticketId, userId: actorUserId });
  if (!ticket) throw new ApiError(404, 'Upload ticket not found', 'NOT_FOUND');
  if (ticket.status === 'pending' && ticket.expiresAt <= new Date()) {
    ticket.status = 'expired';
    await ticket.save();
  }
  return {
    ticketId: ticket.ticketId,
    status: ticket.status,
    documentUrl: ticket.documentUrl || undefined,
    mimeType: ticket.mimeType || undefined,
    originalName: ticket.originalName || undefined,
    expiresAt: new Date(ticket.expiresAt).toISOString(),
  };
}

export async function completeWalletDocumentUpload({ ticketId, uploadToken, file }) {
  await ensureIndexes();
  if (!uploadToken) throw new ApiError(401, 'Upload token required', 'UNAUTHORIZED');
  if (!file) throw new ApiError(400, 'No file uploaded', 'FILE_REQUIRED');
  const ticket = await McpWalletDocumentTicket.findOne({ ticketId }).setOptions({ skipTenantGuard: true });
  if (!ticket) throw new ApiError(404, 'Upload ticket not found', 'NOT_FOUND');
  if (!tokenMatches(ticket.tokenHash, uploadToken)) {
    throw new ApiError(401, 'Upload token is invalid', 'UNAUTHORIZED');
  }

  // Already uploaded: never demote ready/consumed to expired on late retries.
  if (ticket.status === 'ready' && ticket.documentUrl) {
    return {
      ticketId: ticket.ticketId,
      status: ticket.status,
      documentUrl: ticket.documentUrl,
      mimeType: ticket.mimeType,
      originalName: ticket.originalName,
      expiresAt: new Date(ticket.expiresAt).toISOString(),
    };
  }
  if (ticket.status === 'consumed') {
    throw new ApiError(409, 'Upload ticket was already used', 'CONFIRMATION_REUSED');
  }
  if (ticket.status === 'expired' || ticket.expiresAt <= new Date()) {
    if (ticket.status !== 'expired') {
      ticket.status = 'expired';
      await ticket.save();
    }
    throw new ApiError(410, 'Upload ticket has expired', 'CONFIRMATION_EXPIRED');
  }
  if (ticket.status !== 'pending') {
    throw new ApiError(409, 'Upload ticket was already used', 'CONFIRMATION_REUSED');
  }

  const { url } = await uploadFile({ tenantId: ticket.tenantId, kind: 'document', file });
  // Invalidate bearer token after first successful store (replay prevention).
  const deadHash = sha256(`used:${randomBytes(16).toString('hex')}`);
  const updated = await McpWalletDocumentTicket.findOneAndUpdate(
    { _id: ticket._id, status: 'pending', tokenHash: ticket.tokenHash },
    {
      $set: {
        status: 'ready',
        documentUrl: url,
        mimeType: file.mimetype || '',
        originalName: file.originalname || ticket.originalName || '',
        tokenHash: deadHash,
        expiresAt: new Date(Date.now() + READY_GRACE_MS),
      },
    },
    { new: true },
  ).setOptions({ skipTenantGuard: true });
  if (!updated) {
    const again = await McpWalletDocumentTicket.findOne({ ticketId }).setOptions({ skipTenantGuard: true });
    if (again?.status === 'ready' && again.documentUrl) {
      return {
        ticketId: again.ticketId,
        status: again.status,
        documentUrl: again.documentUrl,
        mimeType: again.mimeType,
        originalName: again.originalName,
        expiresAt: new Date(again.expiresAt).toISOString(),
      };
    }
    throw new ApiError(409, 'Upload ticket was already used', 'CONFIRMATION_REUSED');
  }
  return {
    ticketId: updated.ticketId,
    status: updated.status,
    documentUrl: updated.documentUrl,
    mimeType: updated.mimeType,
    originalName: updated.originalName,
    expiresAt: new Date(updated.expiresAt).toISOString(),
  };
}

/** Resolve and optionally consume a ready document URL for wallet setup. */
export async function resolveSetupDocumentUrl({
  tenantId,
  actorUserId,
  documentUrl,
  documentTicketId,
  consume = false,
}) {
  if (documentTicketId) {
    const ticket = await McpWalletDocumentTicket.findOne({
      tenantId,
      ticketId: documentTicketId,
      userId: actorUserId,
    });
    if (!ticket) throw new ApiError(404, 'Upload ticket not found', 'NOT_FOUND');
    if (ticket.expiresAt <= new Date() && ticket.status !== 'ready' && ticket.status !== 'consumed') {
      ticket.status = 'expired';
      await ticket.save();
      throw new ApiError(410, 'Upload ticket has expired', 'CONFIRMATION_EXPIRED');
    }
    if (ticket.status !== 'ready' && ticket.status !== 'consumed') {
      throw new ApiError(422, 'Purchase order document is not ready', 'DOCUMENT_REQUIRED');
    }
    if (!ticket.documentUrl) {
      throw new ApiError(422, 'Purchase order document is not ready', 'DOCUMENT_REQUIRED');
    }
    if (documentUrl && documentUrl !== ticket.documentUrl) {
      throw new ApiError(400, 'Document reference does not match the upload ticket', 'INVALID_DOCUMENT_URL');
    }
    if (consume && ticket.status === 'ready') {
      ticket.status = 'consumed';
      await ticket.save();
    }
    return ticket.documentUrl;
  }
  if (!documentUrl) {
    throw new ApiError(422, 'Purchase order document reference is required', 'DOCUMENT_REQUIRED');
  }
  return documentUrl;
}

export async function prepareWalletDocumentUploadForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return prepareWalletDocumentUpload({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
  });
}

export async function getWalletDocumentUploadForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  const parsed = walletsGetDocumentUploadInputSchema.safeParse(args || {});
  if (!parsed.success) throw new ApiError(400, 'Upload ticket id is not valid', 'VALIDATION');
  return getWalletDocumentUpload({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    ticketId: parsed.data.ticketId,
  });
}

export function walletsDocumentUploadText(output, heading) {
  if (output.uploadPageUrl) {
    return [
      heading,
      'Open this link in your browser to upload the PO/Agreement PDF:',
      output.uploadPageUrl,
      `Expires ${output.expiresAt}`,
      'After upload succeeds, continue with wallets_get_document_upload.',
    ].join('\n');
  }
  if (output.uploadUrl) {
    return [heading, `Upload to ${output.uploadUrl}`, `Expires ${output.expiresAt}`].join('\n');
  }
  return [heading, `Status ${output.status}`, output.documentUrl || 'Waiting for upload.'].join('\n');
}

export function walletsDocumentUploadError(error, fallback) {
  const map = {
    FORBIDDEN: 'You cannot upload wallet funding documents.',
    NOT_FOUND: 'That upload ticket was not found.',
    VALIDATION: 'Upload details are not valid.',
    UNAUTHORIZED: 'Upload authentication failed.',
    FILE_REQUIRED: 'A document file is required.',
    UNSUPPORTED_FILE_TYPE: 'Only PDF documents are accepted for wallet funding.',
    CONFIRMATION_EXPIRED: 'This upload ticket has expired.',
    CONFIRMATION_REUSED: 'This upload ticket was already used.',
    DOCUMENT_REQUIRED: 'Upload the purchase order before continuing.',
    INVALID_DOCUMENT_URL: 'That document reference is not valid.',
    ACTOR_INACTIVE: 'This account cannot upload documents.',
    TENANT_INACTIVE: 'This workspace cannot upload documents.',
  };
  return map[error?.code] || fallback;
}
