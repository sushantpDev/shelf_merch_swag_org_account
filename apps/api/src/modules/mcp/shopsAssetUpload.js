import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { ApiError, ForbiddenError } from '../../utils/errors.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { uploadFile } from '../../services/storage.service.js';
import { validateArtworkBytes } from '../../utils/artworkValidation.js';
import { employeeReaderFromContext } from './employeesRead.js';
import { McpShopAssetTicket } from './mcpShopAssetTicket.model.js';
import { loadMcpActor } from './mcpWriteSafety.js';

const WRITE_ROLES = new Set(rolesForTenantArea('shops', 'write'));
const TICKET_TTL_MS = 15 * 60 * 1000;
const READY_GRACE_MS = 24 * 60 * 60 * 1000;

/** Logo uploads match dashboard artwork rules: PNG only, 300 DPI, max 5 MB. */
export const SHOP_LOGO_UPLOAD_TYPES = {
  mimes: new Set(['image/png']),
  exts: new Set(['.png']),
};

/** Custom banner images match dashboard accept list (png/webp/jpeg, max 10 MB). */
export const SHOP_BANNER_UPLOAD_TYPES = {
  mimes: new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']),
  exts: new Set(['.png', '.jpg', '.jpeg', '.webp']),
};

let indexesReady;

async function ensureIndexes() {
  indexesReady ??= McpShopAssetTicket.syncIndexes();
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

export function applyShopAssetUploadSecurityHeaders(res) {
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
    throw new ForbiddenError('Store asset upload requires a company admin');
  }
}

function requireCaller(ctx) {
  const caller = employeeReaderFromContext(ctx);
  if (!caller.tenantId || !caller.user.userId) {
    throw new ForbiddenError('Store asset upload is not available for this account');
  }
  return caller;
}

export const SHOPS_PREPARE_ASSET_UPLOAD_DESCRIPTION = [
  'Start a secure browser upload handoff for an optional store logo or custom banner image.',
  'ChatGPT and other MCP clients cannot attach binary files to tool calls — do not ask the user to paste image bytes into chat.',
  'Pass kind=logo for PNG logos (300 DPI on both axes, max 5 MB) or kind=banner for custom banner images (png/webp/jpeg, max 10 MB).',
  'Show uploadPageUrl as a clickable browser link. After upload succeeds, call shops_get_asset_upload until status is ready,',
  'then pass logoTicketId or bannerTicketId into shops_prepare_create or shops_prepare_update.',
  'Skip this tool when the user keeps the default banner and does not want a logo.',
  'Company admins only. Does not create or publish a store.',
].join(' ');

export const SHOPS_GET_ASSET_UPLOAD_DESCRIPTION = [
  'Check whether the user finished uploading a store logo or banner via uploadPageUrl.',
  'Poll with ticketId until status is ready, then pass logoTicketId or bannerTicketId into shops_prepare_create or shops_prepare_update.',
  'If status is still pending, ask the user to open uploadPageUrl and upload the image in their browser.',
].join(' ');

export const shopsPrepareAssetUploadInputSchema = z.object({
  kind: z.enum(['logo', 'banner']),
  originalName: z.string().trim().min(1).max(200).optional(),
}).strict();

export const shopsPrepareAssetUploadOutputSchema = z.object({
  ticketId: z.string(),
  kind: z.enum(['logo', 'banner']),
  uploadUrl: z.string(),
  uploadPageUrl: z.string(),
  uploadToken: z.string(),
  expiresAt: z.string(),
  instructions: z.string(),
});

export const shopsGetAssetUploadInputSchema = z.object({
  ticketId: z.string().trim().min(8).max(80),
}).strict();

export const shopsGetAssetUploadOutputSchema = z.object({
  ticketId: z.string(),
  kind: z.enum(['logo', 'banner']),
  status: z.enum(['pending', 'ready', 'expired', 'consumed']),
  assetUrl: z.string().optional(),
  mimeType: z.string().optional(),
  originalName: z.string().optional(),
  expiresAt: z.string(),
});

export async function prepareShopAssetUpload({ tenantId, actorUserId, input }) {
  await ensureIndexes();
  const actor = await loadMcpActor({ tenantId, actorUserId });
  assertWriter(actor);
  const parsed = shopsPrepareAssetUploadInputSchema.safeParse(input || {});
  if (!parsed.success) {
    throw new ApiError(400, 'Store asset upload details are not valid', 'VALIDATION');
  }
  const ticketId = randomBytes(16).toString('hex');
  const uploadToken = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + TICKET_TTL_MS);
  await McpShopAssetTicket.create({
    tenantId,
    ticketId,
    tokenHash: sha256(uploadToken),
    userId: actorUserId,
    kind: parsed.data.kind,
    status: 'pending',
    originalName: parsed.data.originalName || '',
    expiresAt,
  });
  const uploadUrl = `${apiBase()}/api/v1/mcp/shop-assets/${ticketId}`;
  const uploadPageUrl = `${uploadUrl}#uploadToken=${encodeURIComponent(uploadToken)}`;
  const kindLabel = parsed.data.kind === 'logo'
    ? 'PNG logo (300 DPI both axes, max 5 MB)'
    : 'banner image (png/webp/jpeg, max 10 MB)';
  return {
    ticketId,
    kind: parsed.data.kind,
    uploadUrl,
    uploadPageUrl,
    uploadToken,
    expiresAt: expiresAt.toISOString(),
    instructions: [
      'Open uploadPageUrl in a browser (clickable link). The secure token is in the URL fragment (after #), not the query string.',
      'Do not paste the file into chat — ChatGPT cannot forward binaries to ShelfMerch.',
      `Allowed type: ${kindLabel}.`,
      'When the browser page shows success, call shops_get_asset_upload with this ticketId.',
      `Then pass ${parsed.data.kind === 'logo' ? 'logoTicketId' : 'bannerTicketId'} into shops_prepare_create or shops_prepare_update.`,
    ].join(' '),
  };
}

export async function getShopAssetUpload({ tenantId, actorUserId, ticketId }) {
  await ensureIndexes();
  const actor = await loadMcpActor({ tenantId, actorUserId });
  assertWriter(actor);
  const ticket = await McpShopAssetTicket.findOne({ tenantId, ticketId, userId: actorUserId });
  if (!ticket) throw new ApiError(404, 'Upload ticket not found', 'NOT_FOUND');
  if (ticket.status === 'pending' && ticket.expiresAt <= new Date()) {
    ticket.status = 'expired';
    await ticket.save();
  }
  return {
    ticketId: ticket.ticketId,
    kind: ticket.kind,
    status: ticket.status,
    assetUrl: ticket.assetUrl || undefined,
    mimeType: ticket.mimeType || undefined,
    originalName: ticket.originalName || undefined,
    expiresAt: new Date(ticket.expiresAt).toISOString(),
  };
}

function validateLogoFile(file) {
  if (!/\.png$/i.test(file.originalname || '')
    || !['image/png', '', 'application/octet-stream'].includes(file.mimetype || '')) {
    throw new ApiError(422, 'Upload a PNG artwork file', 'INVALID_ARTWORK');
  }
  try {
    validateArtworkBytes(file.buffer);
  } catch (error) {
    throw new ApiError(422, error.message, 'INVALID_ARTWORK');
  }
}

function validateBannerFile(file) {
  const name = String(file.originalname || '').toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();
  const okExt = ['.png', '.jpg', '.jpeg', '.webp'].some((ext) => name.endsWith(ext));
  const okMime = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', '', 'application/octet-stream']
    .includes(mime);
  if (!okExt || !okMime) {
    throw new ApiError(415, 'Banner must be a PNG, JPEG, or WebP image', 'UNSUPPORTED_FILE_TYPE');
  }
  if ((file.buffer?.length || 0) > 10 * 1024 * 1024) {
    throw new ApiError(413, 'Banner image must be 10 MB or smaller', 'FILE_TOO_LARGE');
  }
}

export async function completeShopAssetUpload({ ticketId, uploadToken, file }) {
  await ensureIndexes();
  if (!uploadToken) throw new ApiError(401, 'Upload token required', 'UNAUTHORIZED');
  if (!file) throw new ApiError(400, 'No file uploaded', 'FILE_REQUIRED');
  const ticket = await McpShopAssetTicket.findOne({ ticketId }).setOptions({ skipTenantGuard: true });
  if (!ticket) throw new ApiError(404, 'Upload ticket not found', 'NOT_FOUND');
  if (!tokenMatches(ticket.tokenHash, uploadToken)) {
    throw new ApiError(401, 'Upload token is invalid', 'UNAUTHORIZED');
  }

  if (ticket.status === 'ready' && ticket.assetUrl) {
    return {
      ticketId: ticket.ticketId,
      kind: ticket.kind,
      status: ticket.status,
      assetUrl: ticket.assetUrl,
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

  if (ticket.kind === 'logo') validateLogoFile(file);
  else validateBannerFile(file);

  const storageKind = ticket.kind === 'banner' ? 'mockup' : 'logo';
  const { url } = await uploadFile({ tenantId: ticket.tenantId, kind: storageKind, file });
  const deadHash = sha256(`used:${randomBytes(16).toString('hex')}`);
  const updated = await McpShopAssetTicket.findOneAndUpdate(
    { _id: ticket._id, status: 'pending', tokenHash: ticket.tokenHash },
    {
      $set: {
        status: 'ready',
        assetUrl: url,
        mimeType: file.mimetype || '',
        originalName: file.originalname || ticket.originalName || '',
        tokenHash: deadHash,
        expiresAt: new Date(Date.now() + READY_GRACE_MS),
      },
    },
    { new: true },
  ).setOptions({ skipTenantGuard: true });
  if (!updated) {
    const again = await McpShopAssetTicket.findOne({ ticketId }).setOptions({ skipTenantGuard: true });
    if (again?.status === 'ready' && again.assetUrl) {
      return {
        ticketId: again.ticketId,
        kind: again.kind,
        status: again.status,
        assetUrl: again.assetUrl,
        mimeType: again.mimeType,
        originalName: again.originalName,
        expiresAt: new Date(again.expiresAt).toISOString(),
      };
    }
    throw new ApiError(409, 'Upload ticket was already used', 'CONFIRMATION_REUSED');
  }
  return {
    ticketId: updated.ticketId,
    kind: updated.kind,
    status: updated.status,
    assetUrl: updated.assetUrl,
    mimeType: updated.mimeType,
    originalName: updated.originalName,
    expiresAt: new Date(updated.expiresAt).toISOString(),
  };
}

/**
 * Resolve a ready shop asset ticket into a storage URL for store create/update.
 * Confirmation hashing must use the resolved URL, not the ticket id.
 */
export async function resolveShopAssetUrl({
  tenantId,
  actorUserId,
  ticketId,
  expectedKind,
  assetUrl,
  consume = false,
}) {
  if (ticketId) {
    const ticket = await McpShopAssetTicket.findOne({
      tenantId,
      ticketId,
      userId: actorUserId,
    });
    if (!ticket) throw new ApiError(404, 'Upload ticket not found', 'NOT_FOUND');
    if (ticket.expiresAt <= new Date() && ticket.status !== 'ready' && ticket.status !== 'consumed') {
      ticket.status = 'expired';
      await ticket.save();
      throw new ApiError(410, 'Upload ticket has expired', 'CONFIRMATION_EXPIRED');
    }
    if (ticket.status !== 'ready' && ticket.status !== 'consumed') {
      throw new ApiError(422, 'Store asset upload is not ready', 'ASSET_REQUIRED');
    }
    if (!ticket.assetUrl) {
      throw new ApiError(422, 'Store asset upload is not ready', 'ASSET_REQUIRED');
    }
    if (expectedKind && ticket.kind !== expectedKind) {
      throw new ApiError(400, `Expected a ${expectedKind} upload ticket`, 'VALIDATION');
    }
    if (assetUrl && assetUrl !== ticket.assetUrl) {
      throw new ApiError(400, 'Asset reference does not match the upload ticket', 'INVALID_ASSET_URL');
    }
    if (consume && ticket.status === 'ready') {
      ticket.status = 'consumed';
      await ticket.save();
    }
    return ticket.assetUrl;
  }
  if (!assetUrl) {
    throw new ApiError(422, 'Store asset upload is not ready', 'ASSET_REQUIRED');
  }
  return assetUrl;
}

export async function consumeShopAsset({ tenantId, actorUserId, ticketId, assetUrl }) {
  if (ticketId) {
    await resolveShopAssetUrl({
      tenantId,
      actorUserId,
      ticketId,
      assetUrl,
      consume: true,
    });
    return;
  }
  if (!assetUrl) return;
  const ticket = await McpShopAssetTicket.findOne({
    tenantId,
    userId: actorUserId,
    status: 'ready',
    assetUrl,
  });
  if (ticket) {
    ticket.status = 'consumed';
    await ticket.save();
  }
}

export async function prepareShopAssetUploadForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return prepareShopAssetUpload({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
  });
}

export async function getShopAssetUploadForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  const parsed = shopsGetAssetUploadInputSchema.safeParse(args || {});
  if (!parsed.success) throw new ApiError(400, 'Upload ticket id is not valid', 'VALIDATION');
  return getShopAssetUpload({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    ticketId: parsed.data.ticketId,
  });
}

export function shopAssetUploadText(output, heading) {
  if (output.uploadPageUrl) {
    return [
      heading,
      `Kind: ${output.kind}`,
      'Open this link in your browser to upload the image:',
      output.uploadPageUrl,
      `Expires ${output.expiresAt}`,
      'After upload succeeds, continue with shops_get_asset_upload.',
    ].join('\n');
  }
  if (output.uploadUrl) {
    return [heading, `Upload to ${output.uploadUrl}`, `Expires ${output.expiresAt}`].join('\n');
  }
  return [heading, `Status ${output.status}`, output.assetUrl || 'Waiting for upload.'].join('\n');
}

export function shopAssetUploadError(error, fallback) {
  const map = {
    FORBIDDEN: 'You cannot upload store assets.',
    NOT_FOUND: 'That upload ticket was not found.',
    VALIDATION: 'Upload details are not valid.',
    UNAUTHORIZED: 'Upload authentication failed.',
    FILE_REQUIRED: 'An image file is required.',
    UNSUPPORTED_FILE_TYPE: 'That image type is not accepted for this upload.',
    INVALID_ARTWORK: 'Logo must be a PNG at 300 DPI or higher (max 5 MB).',
    FILE_TOO_LARGE: 'That image is too large.',
    CONFIRMATION_EXPIRED: 'This upload ticket has expired.',
    CONFIRMATION_REUSED: 'This upload ticket was already used.',
    ASSET_REQUIRED: 'Upload the store image before continuing.',
    INVALID_ASSET_URL: 'That asset reference is not valid.',
    ACTOR_INACTIVE: 'This account cannot upload store assets.',
    TENANT_INACTIVE: 'This workspace cannot upload store assets.',
  };
  return map[error?.code] || fallback;
}
