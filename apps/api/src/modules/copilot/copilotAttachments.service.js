import path from 'node:path';
import { ApiError, ForbiddenError } from '../../utils/errors.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { isFileAllowed, DOCUMENT_TYPES } from '../../middleware/upload.middleware.js';
import { readStoredFile, uploadFile } from '../../services/storage.service.js';
import {
  prepareWalletDocumentUpload,
  completeWalletDocumentUpload,
  WALLET_PO_UPLOAD_TYPES,
} from '../mcp/walletsDocumentUpload.js';
import {
  prepareShopAssetUpload,
  completeShopAssetUpload,
  SHOP_LOGO_UPLOAD_TYPES,
  SHOP_BANNER_UPLOAD_TYPES,
} from '../mcp/shopsAssetUpload.js';
import { CopilotAttachment } from './copilotAttachment.model.js';

const READY_TTL_MS = 24 * 60 * 60 * 1000;
const WALLET_WRITE = new Set(rolesForTenantArea('wallets', 'write'));
const SHOPS_WRITE = new Set(rolesForTenantArea('shops', 'write'));

const KIND_LIMITS = {
  purchase_order: { allow: WALLET_PO_UPLOAD_TYPES, maxBytes: 25 * 1024 * 1024, field: 'file' },
  artwork: { allow: SHOP_LOGO_UPLOAD_TYPES, maxBytes: 5 * 1024 * 1024, field: 'file' },
  banner: { allow: SHOP_BANNER_UPLOAD_TYPES, maxBytes: 10 * 1024 * 1024, field: 'file' },
  file: { allow: DOCUMENT_TYPES, maxBytes: 25 * 1024 * 1024, field: 'file' },
};

export function attachmentUploadConfig(kind) {
  return KIND_LIMITS[kind] || null;
}

function safeOriginalName(name) {
  const base = path.basename(String(name || 'upload').replace(/[\u0000-\u001f\u007f]/g, '')).slice(0, 200);
  return base || 'upload';
}

function ensureImageExtension(name, mimeType) {
  const ext = path.extname(name).toLowerCase();
  const known = new Set(['.png', '.jpg', '.jpeg', '.jfif', '.webp', '.gif', '.pdf']);
  if (known.has(ext)) return name;
  let mime = String(mimeType || '').toLowerCase();
  // WhatsApp timestamp tails often arrive with empty MIME — default to JPEG.
  if (
    !mime
    && (/whatsapp image/i.test(name) || /\d{1,2}\.\d{2}\.\d{2}$/.test(name))
  ) {
    mime = 'image/jpeg';
  }
  const map = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
  };
  // Replace bogus timestamp "extensions" (e.g. ".07") or append when missing.
  const base = known.has(ext) ? name : name.slice(0, name.length - ext.length) || name;
  return map[mime] ? `${base}${map[mime]}` : name;
}

function assertKindRole(kind, role) {
  if (kind === 'purchase_order' && !WALLET_WRITE.has(role)) {
    throw new ForbiddenError('Purchase order upload requires a company admin');
  }
  if ((kind === 'artwork' || kind === 'banner') && !SHOPS_WRITE.has(role)) {
    throw new ForbiddenError('Store artwork upload requires a company admin');
  }
}

function toPublic(doc) {
  return {
    id: String(doc._id),
    kind: doc.kind,
    status: doc.status,
    ticketId: doc.ticketId || undefined,
    originalName: doc.originalName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    conversationId: doc.conversationId ? String(doc.conversationId) : null,
    expiresAt: doc.expiresAt?.toISOString?.() || doc.expiresAt,
    createdAt: doc.createdAt?.toISOString?.() || doc.createdAt,
    /** Private storage path — never a public CDN URL; clients must not treat as authoritative. */
    previewHint: doc.mimeType?.startsWith('image/') ? 'image' : 'document',
  };
}

/**
 * Upload an attachment using existing ShelfMerch storage / MCP ticket workflows.
 * Does not fund wallets, publish shops, or approve financial actions.
 */
export async function uploadCopilotAttachment({
  tenantId,
  userId,
  role,
  kind,
  file,
  conversationId = null,
}) {
  if (!KIND_LIMITS[kind]) {
    throw new ApiError(400, 'Unsupported attachment kind', 'VALIDATION');
  }
  if (!file) throw new ApiError(400, 'No file uploaded', 'FILE_REQUIRED');
  assertKindRole(kind, role);

  const originalName = ensureImageExtension(safeOriginalName(file.originalname), file.mimetype);
  file.originalname = originalName;
  if (
    !file.mimetype
    && (/whatsapp image/i.test(originalName) || /\.jpe?g$/i.test(originalName))
  ) {
    file.mimetype = 'image/jpeg';
  }

  const cfg = KIND_LIMITS[kind];
  if (!isFileAllowed(cfg.allow, file)) {
    throw new ApiError(415, `Unsupported file type: ${file.mimetype || path.extname(originalName)}`, 'UNSUPPORTED_FILE_TYPE');
  }
  if ((file.buffer?.length || file.size || 0) > cfg.maxBytes) {
    throw new ApiError(413, 'File is too large', 'FILE_TOO_LARGE');
  }

  let ticketId = null;
  let fileUrl;
  let storageKey = null;
  let storageDriver = null;
  let mimeType = file.mimetype || '';

  if (kind === 'purchase_order') {
    const prepared = await prepareWalletDocumentUpload({
      tenantId,
      actorUserId: userId,
      input: { originalName },
    });
    const completed = await completeWalletDocumentUpload({
      ticketId: prepared.ticketId,
      uploadToken: prepared.uploadToken,
      file,
    });
    ticketId = completed.ticketId;
    fileUrl = completed.documentUrl;
    mimeType = completed.mimeType || mimeType;
  } else if (kind === 'artwork' || kind === 'banner') {
    const prepared = await prepareShopAssetUpload({
      tenantId,
      actorUserId: userId,
      input: { kind: kind === 'banner' ? 'banner' : 'logo', originalName },
    });
    const completed = await completeShopAssetUpload({
      ticketId: prepared.ticketId,
      uploadToken: prepared.uploadToken,
      file,
    });
    ticketId = completed.ticketId;
    fileUrl = completed.assetUrl;
    mimeType = completed.mimeType || mimeType;
  } else {
    // General Copilot files (including reference product images) use the attachment
    // allowlist — images + PDF. kind:'document' only accepts Office/PDF and rejects JPG/PNG.
    const stored = await uploadFile({ tenantId, kind: 'attachment', file });
    fileUrl = stored.url;
    storageKey = stored.key || null;
    storageDriver = stored.driver || null;
  }

  const doc = await CopilotAttachment.create({
    tenantId,
    userId,
    conversationId: conversationId || null,
    kind,
    status: 'uploaded',
    ticketId,
    fileUrl,
    storageKey,
    storageDriver,
    mimeType,
    originalName,
    sizeBytes: file.buffer?.length || file.size || 0,
    expiresAt: new Date(Date.now() + READY_TTL_MS),
  });

  return toPublic(doc);
}

export async function removeCopilotAttachment({ tenantId, userId, attachmentId }) {
  const doc = await CopilotAttachment.findOne({
    _id: attachmentId,
    tenantId,
    userId,
    status: 'uploaded',
  });
  if (!doc) throw new ApiError(404, 'Attachment not found', 'NOT_FOUND');
  doc.status = 'removed';
  doc.expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await doc.save();
  return { ok: true, id: String(doc._id) };
}

/**
 * Resolve attachment refs for a message. Rejects cross-tenant / foreign-user ids.
 * Does not trust client-supplied storage URLs.
 */
export async function resolveAttachmentsForMessage({
  tenantId,
  userId,
  conversationId,
  attachmentIds = [],
}) {
  const ids = [...new Set((attachmentIds || []).map(String).filter(Boolean))];
  if (!ids.length) return [];
  if (ids.length > 5) {
    throw new ApiError(400, 'Too many attachments on one message', 'VALIDATION');
  }

  const rows = await CopilotAttachment.find({
    _id: { $in: ids },
    tenantId,
    userId,
    status: 'uploaded',
  });

  if (rows.length !== ids.length) {
    throw new ApiError(403, 'One or more attachments are not accessible', 'ATTACHMENT_FORBIDDEN');
  }

  const byId = new Map(rows.map((row) => [String(row._id), row]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);

  await CopilotAttachment.updateMany(
    { _id: { $in: ordered.map((row) => row._id) }, conversationId: null },
    { $set: { conversationId, expiresAt: new Date(Date.now() + READY_TTL_MS) } },
  );

  return ordered.map((row) => ({
    id: String(row._id),
    kind: row.kind,
    ticketId: row.ticketId || undefined,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    fileUrl: row.fileUrl,
    storageKey: row.storageKey || null,
    storageDriver: row.storageDriver || null,
  }));
}

/** Human-readable note for the model — references only, never raw bytes. */
export function attachmentPromptSuffix(attachments) {
  if (!attachments?.length) return '';
  const lines = attachments.map((row) => {
    if (row.kind === 'purchase_order') {
      return `- Purchase order "${row.originalName}" (documentTicketId=${row.ticketId}). Uploaded only — does not fund or approve a wallet.`;
    }
    if (row.kind === 'artwork') {
      return `- Store-logo artwork "${row.originalName}" (logoTicketId=${row.ticketId}). Uploaded only — does not create or publish a store. Pass logoTicketId into shops_prepare_create or shops_prepare_update. Not a product reference image.`;
    }
    if (row.kind === 'banner') {
      return `- Store banner artwork "${row.originalName}" (bannerTicketId=${row.ticketId}). Uploaded only — does not create or publish a store. Pass bannerTicketId into shops_prepare_create or shops_prepare_update. Not a product reference image.`;
    }
    if (String(row.mimeType || '').startsWith('image/')) {
      return `- Reference product image "${row.originalName}" (${row.mimeType}). Stored for this conversation. Image bytes may be provided separately to the model; never invent private storage URLs.`;
    }
    return `- File "${row.originalName}" (${row.mimeType || 'document'}). Reference only; do not claim content was analyzed unless image bytes were provided.`;
  });
  return `\n\n[Attachments]\n${lines.join('\n')}`;
}

const VISION_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);
const MAX_VISION_BYTES = 4.5 * 1024 * 1024;

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/**
 * Build Anthropic image content blocks from authorized attachment rows.
 * Reads private storage server-side — never exposes storage URLs to the model or client.
 */
export async function buildAnthropicImageBlocks(attachments = []) {
  const blocks = [];
  for (const row of attachments) {
    const mime = String(row.mimeType || '').toLowerCase();
    if (!VISION_MIME.has(mime)) continue;
    if (row.kind === 'purchase_order' || row.kind === 'artwork') continue;
    if (!row.storageKey || !row.storageDriver) continue;
    if ((Number(row.sizeBytes) || 0) > MAX_VISION_BYTES) {
      blocks.push({
        type: 'text',
        text: `[Reference image "${row.originalName}" is stored but too large to analyze in-chat (max ~4.5 MB).]`,
      });
      continue;
    }
    try {
      const stream = await readStoredFile({ key: row.storageKey, driver: row.storageDriver });
      const buffer = await streamToBuffer(stream);
      if (!buffer.length || buffer.length > MAX_VISION_BYTES) continue;
      const mediaType = mime === 'image/jpg' ? 'image/jpeg' : mime;
      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: buffer.toString('base64'),
        },
      });
    } catch {
      blocks.push({
        type: 'text',
        text: `[Reference image "${row.originalName}" is stored but could not be loaded for analysis.]`,
      });
    }
  }
  return blocks;
}
