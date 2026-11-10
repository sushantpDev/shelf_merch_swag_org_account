import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const mcpDir = fileURLToPath(new URL('../src/modules/mcp/', import.meta.url));

function namedImports(source) {
  const found = [];
  const pattern = /import\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/g;
  for (const match of source.matchAll(pattern)) {
    for (const part of match[1].split(',')) {
      const trimmed = part.trim().replace(/\s+/g, ' ');
      if (!trimmed || trimmed.startsWith('type ')) continue;
      const imported = trimmed.split(' as ')[0].trim();
      if (imported) found.push({ imported, spec: match[2] });
    }
  }
  return found;
}

describe('MCP module load', () => {
  it('resolves every relative named import in the MCP modules', async () => {
    const files = (await readdir(mcpDir)).filter((name) => name.endsWith('.js'));
    const missing = [];
    for (const file of files) {
      const source = await readFile(path.join(mcpDir, file), 'utf8');
      for (const { imported, spec } of namedImports(source)) {
        const target = pathToFileURL(path.resolve(mcpDir, spec)).href;
        const loaded = await import(target);
        if (loaded[imported] === undefined) missing.push(`${file} imports ${imported} from ${spec}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('loads the MCP server module used at API startup', async () => {
    const server = await import('../src/modules/mcp/createShelfMerchMcp.js');
    expect(typeof server.handleShelfMerchMcp).toBe('function');
  });
});
