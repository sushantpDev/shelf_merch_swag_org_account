import { describe, expect, it } from 'vitest';
import { COPILOT_WRITE_WORKFLOWS } from '../src/modules/copilot/copilotWrites.service.js';
import { workflowsFromCatalog } from '../src/modules/copilot/copilotMcpCatalog.js';
import { activeCopilotTools, listOpenAiToolsForRole, runCopilotTool } from '../src/modules/copilot/copilotTools.js';
import { env } from '../src/config/env.js';

describe('copilot write registry', () => {
  it('registers every catalog prepare/execute workflow', () => {
    const workflows = workflowsFromCatalog();
    expect(Object.keys(COPILOT_WRITE_WORKFLOWS).sort()).toEqual(
      workflows.map((w) => w.id).sort(),
    );
  });

  it('keeps EXECUTE tools out of the OpenAI tool list even when a write flag is on', () => {
    const prev = env.EMBEDDED_COPILOT_WRITE_STORE_CREATE;
    env.EMBEDDED_COPILOT_WRITE_STORE_CREATE = 'true';
    try {
      const names = listOpenAiToolsForRole('company_admin').map((row) => row.function.name);
      expect(names).toContain('shops_prepare_create');
      expect(names).not.toContain('shops_execute_create');
      expect(activeCopilotTools().map((t) => t.name)).toEqual(
        expect.arrayContaining(['shops_prepare_create', 'shops_execute_create']),
      );
    } finally {
      env.EMBEDDED_COPILOT_WRITE_STORE_CREATE = prev;
    }
  });

  it('rejects model EXECUTE attempts', async () => {
    const prev = env.EMBEDDED_COPILOT_WRITE_STORE_CREATE;
    env.EMBEDDED_COPILOT_WRITE_STORE_CREATE = 'true';
    try {
      await expect(
        runCopilotTool('shops_execute_create', {}, {}, 'company_admin'),
      ).rejects.toMatchObject({ status: 403 });
    } finally {
      env.EMBEDDED_COPILOT_WRITE_STORE_CREATE = prev;
    }
  });
});
