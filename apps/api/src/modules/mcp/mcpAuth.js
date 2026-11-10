import { ForbiddenError } from '../../utils/errors.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';

const CATALOG_READ_ROLES = rolesForTenantArea('catalog', 'read');

/** company_admin, entity_manager, and platform_super_admin. */
export function requireCatalogRead(req, _res, next) {
  if (!CATALOG_READ_ROLES.includes(req.user?.role)) {
    return next(new ForbiddenError('Catalog search is not available for this role'));
  }
  next();
}

function tokenExpiresAt(token) {
  const segment = token.split('.')[1];
  if (!segment) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Copy the verified access principal onto req.auth so the MCP adapter can
 * forward it. The bearer was already checked by MCP authentication.
 */
export function attachMcpAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  const expiresAt = tokenExpiresAt(token);
  req.auth = {
    token,
    clientId: req.oauthAccess?.clientId || String(req.user.userId),
    scopes: req.oauthAccess?.scopes || ['catalog:read'],
    ...(expiresAt != null ? { expiresAt } : {}),
    extra: {
      userId: req.user.userId ? String(req.user.userId) : null,
      tenantId: req.tenantId ? String(req.tenantId) : null,
      role: req.user.role,
      scopeType: req.user.scopeType ?? null,
      scopeId: req.user.scopeId ? String(req.user.scopeId) : null,
      assignedEntityIds: (req.user.assignedEntityIds ?? []).map(String),
    },
  };
  next();
}
