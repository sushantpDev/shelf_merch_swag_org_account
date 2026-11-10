import { Router } from 'express';
import { uploader, DOCUMENT_TYPES } from '../../middleware/upload.middleware.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { resolveTenant, requireTenantContext, blockDuringImpersonation } from '../../middleware/tenant.middleware.js';
import { tenantArea } from '../../middleware/tenantAccess.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { idempotency } from '../../middleware/idempotency.middleware.js';
import * as controller from './wallets.controller.js';
import {
  createWalletSchema,
  setupWalletSchema,
  updateWalletSchema,
  fundWalletSchema,
  allocateSchema,
  transferSchema,
  transactionsQuerySchema,
  walletIdParams,
} from './wallets.validation.js';

const router = Router();
const upload = uploader({ allow: DOCUMENT_TYPES, maxSizeMb: 25 });

router.use(authenticate, resolveTenant, requireTenantContext);

const canWrite = tenantArea('wallets', 'write');
const canRead = tenantArea('wallets', 'read');

router.get('/', canRead, asyncHandler(controller.list));
router.post('/', canWrite, validate({ body: createWalletSchema }), asyncHandler(controller.create));
router.post(
  '/setup',
  canWrite,
  upload.single('document'),
  validate({ body: setupWalletSchema }),
  asyncHandler(controller.setup),
);
router.get('/:id', canRead, validate({ params: walletIdParams }), asyncHandler(controller.getOne));
router.patch('/:id', canWrite, validate({ params: walletIdParams, body: updateWalletSchema }), asyncHandler(controller.update));
router.delete('/:id', canWrite, validate({ params: walletIdParams }), asyncHandler(controller.remove));
router.post(
  '/:id/funding-document',
  canWrite,
  validate({ params: walletIdParams }),
  upload.single('document'),
  asyncHandler(controller.uploadFundingDocument),
);

// §6.4 — wallet adjustments are blocked during impersonation.
router.post(
  '/:id/fund',
  canWrite,
  blockDuringImpersonation,
  idempotency(),
  validate({ params: walletIdParams, body: fundWalletSchema }),
  asyncHandler(controller.fund),
);
router.post(
  '/:id/allocate',
  canWrite,
  blockDuringImpersonation,
  idempotency({ recover: true }),
  validate({ params: walletIdParams, body: allocateSchema }),
  asyncHandler(controller.allocate),
);
router.post(
  '/:id/transfer',
  canWrite,
  blockDuringImpersonation,
  idempotency(),
  validate({ params: walletIdParams, body: transferSchema }),
  asyncHandler(controller.transfer),
);
router.get(
  '/:id/transactions',
  canRead,
  validate({ params: walletIdParams, query: transactionsQuerySchema }),
  asyncHandler(controller.transactions),
);
router.post(
  '/:id/activate',
  canWrite,
  blockDuringImpersonation,
  validate({ params: walletIdParams }),
  asyncHandler(controller.activate),
);
router.post(
  '/:id/ensure-spend-entity',
  canWrite,
  validate({ params: walletIdParams }),
  asyncHandler(controller.ensureSpendEntity),
);

export default router;
