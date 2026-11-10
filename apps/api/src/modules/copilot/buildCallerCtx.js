/**
 * Build the MCP-compatible caller context from a dashboard session request.
 * Reuses the same authInfo.extra shape attachMcpAuth produces for /mcp tools.
 */
export function buildCopilotToolCtx(req) {
  return {
    authInfo: {
      extra: {
        userId: req.user?.userId ? String(req.user.userId) : null,
        tenantId: req.tenantId ? String(req.tenantId) : null,
        role: req.user?.role,
        scopeType: req.user?.scopeType ?? null,
        scopeId: req.user?.scopeId ? String(req.user.scopeId) : null,
        assignedEntityIds: (req.user?.assignedEntityIds ?? []).map(String),
      },
    },
  };
}
