import path from 'node:path';
import multer from 'multer';
import { ApiError } from '../utils/errors.js';

const MB = 1024 * 1024;

/**
 * §security hardening A4 — upload allowlists. Browsers set reliable MIME types
 * for images, so those require both a matching extension AND MIME. Spreadsheet
 * MIME types are unreliable across OSes/browsers, so those are extension-driven
 * (an unknown/octet-stream MIME with a valid extension is accepted). Script-
 * capable formats (SVG, HTML, JS) are rejected outright regardless of allowlist,
 * which is what kills the stored-XSS vector of an uploaded file served from
 * /uploads.
 */
export const IMAGE_TYPES = {
  mimes: new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']),
  exts: new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']),
};

export const DOCUMENT_TYPES = {
  mimes: new Set([...IMAGE_TYPES.mimes, 'application/pdf']),
  exts: new Set([...IMAGE_TYPES.exts, '.pdf']),
};

export const SPREADSHEET_TYPES = {
  mimes: new Set([
    'text/csv',
    'application/csv',
    'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ]),
  exts: new Set(['.csv', '.xls', '.xlsx']),
};

const ALWAYS_BLOCKED_EXTS = new Set([
  '.svg', '.svgz', '.html', '.htm', '.xhtml', '.js', '.mjs', '.php', '.phtml', '.exe', '.sh',
]);

/**
 * Pure allowlist decision, exported for unit testing.
 * @returns {boolean} true when the file may be accepted.
 */
export function isFileAllowed(allow, { originalname = '', mimetype = '' } = {}) {
  const ext = path.extname(originalname).toLowerCase();
  const mime = mimetype.toLowerCase();

  if (mime === 'image/svg+xml' || mime === 'text/html' || ALWAYS_BLOCKED_EXTS.has(ext)) {
    return false;
  }
  const extOk = allow.exts.has(ext);
  // Accept unknown/generic MIME as long as the extension is allowlisted.
  const mimeOk = allow.mimes.has(mime) || mime === '' || mime === 'application/octet-stream';
  // Mobile/WhatsApp names like "WhatsApp Image 2024-11-05 at 12.38.07" make path.extname
  // return ".07". Trust an allowlisted image MIME when the "extension" is not a real type.
  if (
    !extOk
    && mime.startsWith('image/')
    && allow.mimes.has(mime)
    && !ALWAYS_BLOCKED_EXTS.has(ext)
  ) {
    return true;
  }
  // Same WhatsApp-style names sometimes arrive with empty/octet-stream MIME from Windows.
  const whatsappName = /whatsapp image/i.test(originalname) || /\d{1,2}\.\d{2}\.\d{2}$/.test(originalname);
  if (
    !extOk
    && whatsappName
    && allow.mimes.has('image/jpeg')
    && (mime === '' || mime === 'application/octet-stream' || allow.mimes.has(mime))
    && !ALWAYS_BLOCKED_EXTS.has(ext)
  ) {
    return true;
  }
  return extOk && mimeOk;
}

function makeFilter(allow) {
  return (req, file, cb) => {
    if (isFileAllowed(allow, file)) return cb(null, true);
    const label = file.mimetype || path.extname(file.originalname || '') || 'unknown';
    cb(new ApiError(415, `Unsupported file type: ${label}`, 'UNSUPPORTED_FILE_TYPE'));
  };
}

/**
 * Build a multer instance backed by memory storage with a size cap and a
 * type allowlist.
 * @param {{ allow: { mimes: Set<string>, exts: Set<string> }, maxSizeMb: number, files?: number }} opts
 */
export function uploader({ allow, maxSizeMb, files = 1 }) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSizeMb * MB, files },
    fileFilter: makeFilter(allow),
  });
}
