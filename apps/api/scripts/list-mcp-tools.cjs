const fs = require('fs');
const src = fs.readFileSync('src/modules/mcp/createShelfMerchMcp.js', 'utf8');

const fromTuples = [...src.matchAll(/\['([a-z0-9_]+)',\s*'/g)].map((m) => m[1]);
const fromRegister = [...src.matchAll(/server\.registerTool\(\s*\n?\s*'([a-z0-9_]+)'/g)].map((m) => m[1]);
const unique = [...new Set([...fromTuples, ...fromRegister])].sort();

function kind(name) {
  if (name.includes('prepare')) return 'PREPARE';
  if (name.includes('execute')) return 'EXECUTE';
  return 'READ';
}

const byKind = { READ: [], PREPARE: [], EXECUTE: [] };
for (const name of unique) byKind[kind(name)].push(name);

console.log(JSON.stringify({
  total: unique.length,
  counts: {
    READ: byKind.READ.length,
    PREPARE: byKind.PREPARE.length,
    EXECUTE: byKind.EXECUTE.length,
  },
  ...byKind,
}, null, 2));
