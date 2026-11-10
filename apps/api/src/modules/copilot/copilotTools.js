import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { ForbiddenError } from '../../utils/errors.js';
import { CATALOG_INVENTORY_RULE } from '../mcp/catalogSearch.js';
import { COPILOT_MCP_CATALOG, catalogByName } from './copilotMcpCatalog.js';
import { buildCopilotToolDefinitions } from './copilotToolBindings.js';
import { isWriteFlagEnabled } from './copilotWriteFlags.js';

const ALL_TOOL_DEFS = buildCopilotToolDefinitions();
const DEF_BY_NAME = new Map(ALL_TOOL_DEFS.map((tool) => [tool.name, tool]));

function isCatalogEntryActive(entry) {
  if (!entry) return false;
  if (entry.kind === 'read' || entry.kind === 'upload_status') return true;
  if (!entry.writeFlag) return false;
  // Logo/banner upload handoff is needed for create and update branding.
  if (entry.name === 'shops_prepare_asset_upload') {
    return isWriteFlagEnabled('storeCreate') || isWriteFlagEnabled('storeUpdate');
  }
  return isWriteFlagEnabled(entry.writeFlag);
}

/**
 * Active Copilot tools = all READs (+ upload status) always,
 * plus PREPARE/EXECUTE/upload_prepare only when their domain write flag is on.
 */
export function activeCopilotTools() {
  return COPILOT_MCP_CATALOG.filter(isCatalogEntryActive)
    .map((entry) => {
      const def = DEF_BY_NAME.get(entry.name);
      if (!def) return null;
      return {
        ...def,
        writeFlag: entry.writeFlag,
        mcpOperation: entry.mcpOperation,
        workflow: entry.workflow,
        modelVisible: entry.modelVisible !== false && def.modelVisible !== false,
      };
    })
    .filter(Boolean);
}

/** @deprecated Prefer activeCopilotTools(); kept for discovery read-baseline tests. */
export const COPILOT_TOOLS = ALL_TOOL_DEFS.filter((tool) => {
  const entry = catalogByName(tool.name);
  return entry && (entry.kind === 'read' || entry.kind === 'upload_status');
});

export const COPILOT_STORE_CREATE_TOOLS = ALL_TOOL_DEFS.filter((tool) =>
  ['shops_prepare_create', 'shops_execute_create'].includes(tool.name),
);

function toolsByName() {
  return new Map(activeCopilotTools().map((tool) => [tool.name, tool]));
}

function requireArea(role, area, action = 'read') {
  if (!rolesForTenantArea(area, action).includes(role)) {
    throw new ForbiddenError(`${area} ${action} is not available for this role`);
  }
}

export function listOpenAiToolsForRole(role) {
  return activeCopilotTools()
    .filter((tool) => tool.modelVisible !== false)
    .filter((tool) => rolesForTenantArea(tool.area, tool.action || 'read').includes(role))
    .map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
}

export function registeredToolNames() {
  return activeCopilotTools().map((tool) => tool.name);
}

export async function runCopilotTool(name, ctx, args, role) {
  const meta = catalogByName(name);
  if (meta?.kind === 'execute') {
    throw new ForbiddenError(
      `Tool "${name}" is confirmation-UI only and cannot be invoked by the model`,
    );
  }
  const tool = toolsByName().get(name);
  if (!tool) {
    throw new ForbiddenError(`Tool "${name}" is not available in the embedded copilot`);
  }
  requireArea(role, tool.area, tool.action || 'read');
  const result = await tool.run(ctx, args);
  const artifacts = typeof tool.artifacts === 'function' ? tool.artifacts(result) : [];
  return { result, artifacts };
}

export { CATALOG_INVENTORY_RULE };
