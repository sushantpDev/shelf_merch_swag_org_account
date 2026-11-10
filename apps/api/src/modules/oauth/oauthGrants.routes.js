import mongoose from 'mongoose';
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { ApiError } from '../../utils/errors.js';
import { revokeOauthGrantsForUser } from './oauthRevoke.js';

const router = Router();

router.post(
  '/disconnect',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenantId = req.body?.tenantId;
    if (tenantId !== undefined && tenantId !== null && tenantId !== '' && !mongoose.isValidObjectId(String(tenantId))) {
      throw new ApiError(400, 'Choose a workspace', 'WORKSPACE_REQUIRED');
    }
    await revokeOauthGrantsForUser(req.user.userId, {
      tenantId: tenantId ? String(tenantId) : undefined,
    });
    res.json({ success: true });
  }),
);

export default router;
