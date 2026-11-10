import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { resolveTenant, requireTenantContext } from '../../middleware/tenant.middleware.js';
import { tenantArea } from '../../middleware/tenantAccess.middleware.js';
import { requireScope } from '../../middleware/abac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { idempotency } from '../../middleware/idempotency.middleware.js';
import * as controller from './campaigns.controller.js';
import {
  createCampaignSchema,
  updateCampaignSchema,
  importRecipientsSchema,
  allocateCreditsSchema,
  launchCampaignSchema,
  campaignIdParams,
  savePointsDraftSchema,
} from './campaigns.validation.js';
import { Campaign } from './campaign.model.js';

const router = Router();
router.use(authenticate, resolveTenant, requireTenantContext);

const canRead = tenantArea('campaigns', 'read');
const canWrite = tenantArea('campaigns', 'write');
const canOperate = tenantArea('campaignOps', 'write');
const entityScope = requireScope(async (req) => {
  const c = await Campaign.findOne({ _id: req.params.id, tenantId: req.tenantId }).select('entityId');
  return c?.entityId ?? null;
});

router.get('/', canRead, asyncHandler(controller.list));
router.post('/', canWrite, validate({ body: createCampaignSchema }), asyncHandler(controller.create));
router.post(
  '/points-draft',
  canWrite,
  validate({ body: savePointsDraftSchema }),
  asyncHandler(controller.savePointsDraft),
);
router.get('/:id', canRead, entityScope, validate({ params: campaignIdParams }), asyncHandler(controller.getOne));
router.patch(
  '/:id',
  canWrite,
  entityScope,
  validate({ params: campaignIdParams, body: updateCampaignSchema }),
  asyncHandler(controller.update),
);
router.post(
  '/:id/recipients/import',
  canOperate,
  entityScope,
  validate({ params: campaignIdParams, body: importRecipientsSchema }),
  asyncHandler(controller.importRecipients),
);
router.post(
  '/:id/allocate-credits',
  canOperate,
  entityScope,
  validate({ params: campaignIdParams, body: allocateCreditsSchema }),
  asyncHandler(controller.allocateCredits),
);
router.post(
  '/:id/launch',
  canOperate,
  entityScope,
  idempotency({ required: true, recover: true }),
  validate({ params: campaignIdParams, body: launchCampaignSchema }),
  asyncHandler(controller.launch),
);
router.post(
  '/:id/close',
  canOperate,
  entityScope,
  validate({ params: campaignIdParams }),
  asyncHandler(controller.close),
);
router.get(
  '/:id/report',
  canRead,
  entityScope,
  validate({ params: campaignIdParams }),
  asyncHandler(controller.report),
);
router.delete(
  '/:id',
  canWrite,
  entityScope,
  validate({ params: campaignIdParams }),
  asyncHandler(controller.remove),
);

export default router;
