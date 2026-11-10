import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  COPILOT_MCP_CATALOG,
  COPILOT_MCP_TOOL_NAMES,
  catalogCounts,
  workflowsFromCatalog,
} from '../src/modules/copilot/copilotMcpCatalog.js';

describe('copilot MCP catalog', () => {
  it('covers exactly 67 tools matching createShelfMerchMcp registration', () => {
    const mcpSource = readFileSync(
      new URL('../src/modules/mcp/createShelfMerchMcp.js', import.meta.url),
      'utf8',
    );
    expect(COPILOT_MCP_CATALOG).toHaveLength(67);
    expect(new Set(COPILOT_MCP_TOOL_NAMES).size).toBe(67);

    for (const name of COPILOT_MCP_TOOL_NAMES) {
      expect(mcpSource, `missing MCP registration for ${name}`).toContain(`'${name}'`);
    }

    const counts = catalogCounts();
    // READ + upload_status = 23; PREPARE + upload_prepare = 23; EXECUTE = 21
    expect(counts.read + counts.upload_status).toBe(23);
    expect(counts.prepare + counts.upload_prepare).toBe(23);
    expect(counts.execute).toBe(21);
    expect(counts.total).toBe(67);
  });

  it('never marks EXECUTE tools as model-visible', () => {
    for (const row of COPILOT_MCP_CATALOG.filter((t) => t.kind === 'execute')) {
      expect(row.modelVisible, row.name).toBe(false);
    }
  });

  it('pairs prepare/execute workflows with matching write flags and operations', () => {
    const workflows = workflowsFromCatalog();
    expect(workflows.length).toBeGreaterThanOrEqual(21);
    for (const wf of workflows) {
      expect(wf.prepareTool, wf.id).toBeTruthy();
      expect(wf.executeTool, wf.id).toBeTruthy();
      expect(wf.writeFlag, wf.id).toBeTruthy();
      expect(wf.mcpOperation, wf.id).toBeTruthy();
    }
  });
});
