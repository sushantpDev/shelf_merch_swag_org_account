import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { resolveTenant, requireTenantContext } from '../../middleware/tenant.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { rateLimit } from '../../middleware/rateLimit.middleware.js';
import { uploader } from '../../middleware/upload.middleware.js';
import { ApiError } from '../../utils/errors.js';
import { attachmentUploadConfig } from './copilotAttachments.service.js';
import {
  shopsPrepareCreateInputSchema,
  shopsExecuteCreateInputSchema,
} from '../mcp/shopsWrite.js';
import * as controller from './copilot.controller.js';

const router = Router();

router.use(authenticate, resolveTenant, requireTenantContext);

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/);
const attachmentKind = z.enum(['purchase_order', 'artwork', 'banner', 'file']);

const copilotUserLimit = rateLimit([
  {
    prefix: 'copilot:user',
    limit: 60,
    windowSec: 60 * 60,
    key: (req) => String(req.user?.userId || req.ip),
    critical: true,
  },
  {
    prefix: 'copilot:tenant',
    limit: 300,
    windowSec: 60 * 60,
    key: (req) => String(req.tenantId || req.ip),
    critical: true,
  },
]);

const uploadLimit = rateLimit([
  {
    prefix: 'copilot:upload',
    limit: 30,
    windowSec: 60 * 60,
    key: (req) => String(req.user?.userId || req.ip),
    critical: true,
  },
]);

function parseAttachmentKind(req, _res, next) {
  const parsed = attachmentKind.safeParse(String(req.query.kind || req.body?.kind || ''));
  if (!parsed.success) {
    return next(new ApiError(400, 'kind must be purchase_order, artwork, banner, or file', 'VALIDATION'));
  }
  req.attachmentKind = parsed.data;
  next();
}

function attachmentMulter(req, res, next) {
  const cfg = attachmentUploadConfig(req.attachmentKind);
  if (!cfg) return next(new ApiError(400, 'Unsupported attachment kind', 'VALIDATION'));
  return uploader({
    allow: cfg.allow,
    maxSizeMb: Math.ceil(cfg.maxBytes / (1024 * 1024)),
  }).single('file')(req, res, next);
}

router.get('/status', asyncHandler(controller.status));

/** Back-compat Create Store aliases. */
router.post(
  '/writes/shops/create/prepare',
  copilotUserLimit,
  validate({ body: shopsPrepareCreateInputSchema }),
  asyncHandler(controller.prepareStoreCreate),
);

router.post(
  '/writes/shops/create/execute',
  copilotUserLimit,
  validate({ body: shopsExecuteCreateInputSchema }),
  asyncHandler(controller.executeStoreCreate),
);

router.post(
  '/writes/shops/create/cancel',
  copilotUserLimit,
  validate({
    body: z.object({
      confirmationId: z.string().trim().min(20).max(200),
    }),
  }),
  asyncHandler(controller.cancelStoreCreate),
);

/** Generic PREPARE → confirm UI → EXECUTE / cancel. workflow uses dotted ids (shops.create). */
const workflowParam = z.object({
  workflow: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-z][a-z0-9_.-]+$/i),
});

router.post(
  '/writes/:workflow/prepare',
  copilotUserLimit,
  validate({ params: workflowParam }),
  asyncHandler(controller.prepareWrite),
);

router.post(
  '/writes/:workflow/execute',
  copilotUserLimit,
  validate({ params: workflowParam }),
  asyncHandler(controller.executeWrite),
);

router.post(
  '/writes/:workflow/cancel',
  copilotUserLimit,
  validate({
    params: workflowParam,
    body: z.object({
      confirmationId: z.string().trim().min(20).max(200),
    }),
  }),
  asyncHandler(controller.cancelWrite),
);

router.post(
  '/writes/:workflow/resolve',
  copilotUserLimit,
  validate({ params: workflowParam }),
  asyncHandler(controller.resolveWrite),
);

router.post(
  '/attachments',
  uploadLimit,
  parseAttachmentKind,
  attachmentMulter,
  validate({
    query: z.object({
      kind: attachmentKind,
      conversationId: objectId.optional(),
    }),
  }),
  asyncHandler(controller.uploadAttachment),
);

router.delete(
  '/attachments/:id',
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(controller.removeAttachment),
);

router.post(
  '/conversations',
  copilotUserLimit,
  validate({
    body: z.object({ title: z.string().trim().max(120).optional() }).optional(),
  }),
  asyncHandler(controller.create),
);

router.get('/conversations', asyncHandler(controller.list));

router.get(
  '/conversations/:id',
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(controller.getOne),
);

router.delete(
  '/conversations/:id',
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(controller.remove),
);

router.patch(
  '/conversations/:id/write-artifacts',
  copilotUserLimit,
  validate({
    params: z.object({ id: objectId }),
    body: z.object({
      confirmationId: z.string().trim().min(20).max(200),
      artifact: z.record(z.unknown()),
    }),
  }),
  asyncHandler(controller.persistWriteArtifact),
);

router.post(
  '/conversations/:id/messages',
  copilotUserLimit,
  validate({
    params: z.object({ id: objectId }),
    body: z.object({
      content: z.string().max(20_000).optional().default(''),
      attachmentIds: z.array(objectId).max(5).optional().default([]),
      mode: z.enum(['chat', 'curator']).optional(),
    }),
  }),
  asyncHandler(controller.postMessage),
);

export default router;
