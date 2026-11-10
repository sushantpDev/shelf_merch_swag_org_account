import { AuditLog } from '../modules/auditLogs/auditLog.model.js';
import { logger } from '../config/logger.js';

/**
 * §3.6 — fire-and-forget audit write. Never let audit failures break the
 * request that triggered them.
 */
export function writeAudit({
  req,
  action,
  entityType,
  entityId = null,
  before = null,
  after = null,
  tenantId,
}) {
  const doc = {
    tenantId: tenantId ?? req?.tenantId ?? null,
    actorUserId: req?.user?.userId ?? null,
    actorRole: req?.user?.role ?? '',
    action,
    entityType,
    entityId,
    before,
    after,
    ip: req?.ip ?? '',
    userAgent: req?.headers?.['user-agent'] ?? '',
    impersonation: {
      isImpersonating: req?.impersonation?.isImpersonating ?? false,
      originalUserId: req?.impersonation?.originalUserId ?? null,
    },
  };
  return AuditLog.create(doc).catch((err) => logger.error({ err, action }, 'Audit log write failed'));
}
