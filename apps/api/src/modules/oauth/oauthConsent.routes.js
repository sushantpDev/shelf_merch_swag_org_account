import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { globalHttpRateLimit } from '../../middleware/globalRateLimit.middleware.js';
import { readConsent, submitDecision } from './oauthConsent.service.js';

const router = Router();

router.use(globalHttpRateLimit);

router.get(
  '/session',
  authenticate,
  asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await readConsent(req, res));
  }),
);

router.post(
  '/decision',
  authenticate,
  asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await submitDecision(req, res));
  }),
);

export default router;
