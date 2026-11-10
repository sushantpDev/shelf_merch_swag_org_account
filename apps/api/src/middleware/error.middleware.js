import { ApiError } from '../utils/errors.js';
import { logger, safeRequestPath } from '../config/logger.js';
import { captureException } from '../config/observability.js';

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: { code: err.code ?? 'ERROR', message: err.message, details: err.details },
    });
  }

  if (err?.name === 'CastError') {
    return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Malformed id' } });
  }
  // Multer upload errors (file too large, too many files, unexpected field).
  if (err?.name === 'MulterError') {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? 'Uploaded file is too large' : `Upload error: ${err.message}`;
    return res.status(status).json({ error: { code: err.code ?? 'UPLOAD_ERROR', message } });
  }
  // express.json / body-parser payload cap (default path previously fell through to 500).
  if (err?.type === 'entity.too.large' || err?.status === 413 || err?.statusCode === 413) {
    return res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body is too large — upload images as files instead of embedding them',
      },
    });
  }
  // body-parser sets status 400 on malformed JSON. Leaving it unhandled made
  // POST /mcp (and every other JSON route) answer 500, which MCP clients treat
  // as a transport failure instead of a client error.
  if (
    err?.type === 'entity.parse.failed' ||
    (err instanceof SyntaxError && err.expose === true && (err.status === 400 || err.statusCode === 400))
  ) {
    logger.warn({ path: safeRequestPath(req), code: 'INVALID_JSON' }, 'Rejected invalid JSON body');
    return res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' },
    });
  }
  if (err?.code === 11000) {
    const field =
      (err.keyPattern && Object.keys(err.keyPattern).join(', ')) ||
      (err.keyValue && Object.keys(err.keyValue).join(', ')) ||
      undefined;
    logger.warn({ err, path: safeRequestPath(req), field }, 'Duplicate key conflict');
    return res.status(409).json({
      error: {
        code: 'DUPLICATE',
        message: field
          ? `A record with this ${field} already exists`
          : 'A record with this value already exists',
        details: field ? { field } : undefined,
      },
    });
  }

  const path = safeRequestPath(req);
  logger.error({ err, path }, 'Unhandled error');
  captureException(err, { path, requestId: req.requestId, tenantId: req.tenantId });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
}
