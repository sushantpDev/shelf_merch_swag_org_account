import { ApiError } from '../utils/errors.js';
import { beginIdempotency, completeIdempotency, releaseIdempotency } from '../services/idempotency.service.js';

/**
 * §3.5 — replayed Idempotency-Key returns the cached response instead of
 * re-executing. Keys are scoped per tenant+user. A concurrent duplicate
 * request (key reserved but response not yet stored) gets a 409.
 */
export function idempotency({ required = false, recover = false } = {}) {
  return async (req, res, next) => {
    const key = req.headers['idempotency-key'];
    if (!key) {
      if (required) {
        return next(new ApiError(400, 'Idempotency-Key header is required', 'IDEMPOTENCY_KEY_REQUIRED'));
      }
      return next();
    }

    const scope = { key, tenantId: req.tenantId ?? null, userId: req.user?.userId ?? null };

    try {
      const result = await beginIdempotency(scope, {
        method: req.method,
        path: req.originalUrl,
        recover,
      });

      if (result.action === 'replay') {
        res.set('Idempotent-Replay', 'true');
        return res.status(result.statusCode).json(result.response);
      }
      if (result.action === 'in_flight') {
        return next(
          new ApiError(409, 'Request with this Idempotency-Key is still in progress', 'IDEMPOTENT_REPLAY_IN_FLIGHT'),
        );
      }
    } catch (err) {
      return next(err);
    }

    const originalJson = res.json.bind(res);
    res.json = (payload) => {
      // Persist (or release) the idempotency record BEFORE flushing the
      // response, so a replay that arrives the instant the caller receives
      // this response reliably sees a completed key instead of a pending one.
      const persist =
        res.statusCode < 400
          ? completeIdempotency(scope, { statusCode: res.statusCode, response: payload })
          : releaseIdempotency(scope);
      persist.catch(() => {}).finally(() => originalJson(payload));
      return res;
    };
    next();
  };
}
