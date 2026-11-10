import { createRequire } from 'node:module';
import { randomBytes, generateKeyPairSync, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, openSync, fsyncSync, closeSync, unlinkSync, renameSync, copyFileSync, mkdirSync, statSync, chmodSync, chownSync, rmSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

let parseEnvFile;
function dotenvParse() {
  if (parseEnvFile) return parseEnvFile;
  const bases = [process.env.SHELFMERCH_DOTENV_BASE, '/var/www/shelfmerch-staging/apps/api/package.json'].filter(Boolean);
  for (const base of bases) {
    try {
      parseEnvFile = createRequire(base)('dotenv').parse;
      return parseEnvFile;
    } catch {
      parseEnvFile = undefined;
    }
  }
  throw new Error('dotenv is not installed for the staging API');
}

export const KEYS = ['MCP_OAUTH_ISSUER', 'MCP_OIDC_JWKS', 'MCP_OIDC_COOKIE_SECRET'];
export const ISSUER = 'https://staging.shelfmerch.io';
export const DEV_COOKIE = 'dev-only-oidc-cookie-secret-change-me';
export const STAGING_ROOT = '/var/www/shelfmerch-staging';
export const PRODUCTION_ROOT = '/root/shelf_merch';
export const ROOT_ENV = `${STAGING_ROOT}/.env`;
export const API_ENV = `${STAGING_ROOT}/apps/api/.env`;

const ASSIGNMENT = /^(?:\s*(?:export\s+)?)(MCP_OAUTH_ISSUER|MCP_OIDC_JWKS|MCP_OIDC_COOKIE_SECRET)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]*)?\s*(?:#.*)?$/;

export function assertOauthIssuer(value, nodeEnv) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('MCP_OAUTH_ISSUER must be an absolute URL');
  }
  if (url.username || url.password) throw new Error('MCP_OAUTH_ISSUER must not contain userinfo');
  if (url.search || url.hash) throw new Error('MCP_OAUTH_ISSUER must not contain a query or fragment');
  if (url.pathname !== '/' && url.pathname !== '') throw new Error('MCP_OAUTH_ISSUER must not contain a path');
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('MCP_OAUTH_ISSUER must be http or https');
  if (nodeEnv === 'production' && url.protocol !== 'https:') throw new Error('MCP_OAUTH_ISSUER must use https in production');
  return url.origin;
}

export function parsePrivateJwks(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('MCP_OIDC_JWKS must be JSON');
  }
  const keys = Array.isArray(parsed) ? parsed : parsed?.keys;
  if (!Array.isArray(keys) || keys.length === 0) throw new Error('MCP_OIDC_JWKS must contain keys');
  for (const key of keys) {
    if (!key || typeof key !== 'object' || typeof key.d !== 'string' || typeof key.kty !== 'string') {
      throw new Error('MCP_OIDC_JWKS keys must include string d and kty');
    }
  }
  return { keys };
}

export function classify(key, value) {
  if (value == null) return 'absent';
  const trimmed = String(value).trim();
  if (!trimmed) return 'empty';
  try {
    if (key === 'MCP_OAUTH_ISSUER') {
      return assertOauthIssuer(trimmed.replace(/\/+$/, ''), 'production') === ISSUER ? 'valid' : 'invalid';
    }
    if (key === 'MCP_OIDC_COOKIE_SECRET') {
      return trimmed.length >= 32 && trimmed !== DEV_COOKIE ? 'valid' : 'invalid';
    }
    parsePrivateJwks(trimmed);
    return 'valid';
  } catch {
    return 'invalid';
  }
}

function identity(key, value) {
  const state = classify(key, value);
  if (state !== 'valid') return `invalid:${state}`;
  if (key === 'MCP_OAUTH_ISSUER') return assertOauthIssuer(String(value).trim().replace(/\/+$/, ''), 'production');
  if (key === 'MCP_OIDC_COOKIE_SECRET') return String(value).trim();
  const { keys } = parsePrivateJwks(String(value).trim());
  return keys.map((item) => `${item.kty}\n${item.n}\n${item.e}\n${item.d}`).join('\n---\n');
}

function splitLines(text) {
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const parts = text.split(/\r?\n/);
  if (text.endsWith('\n')) parts.pop();
  return { newline, parts };
}

function joinLines(parts, newline) {
  return `${parts.join(newline)}${newline}`;
}

function assignmentOnLine(line) {
  const match = ASSIGNMENT.exec(line);
  if (!match) return null;
  const parsed = dotenvParse()(line);
  const key = match[1];
  if (!Object.prototype.hasOwnProperty.call(parsed, key)) return { error: `unparsed-${key}` };
  return { key, value: parsed[key] };
}

function scan(text) {
  if (text == null) return { byKey: Object.fromEntries(KEYS.map((key) => [key, []])) };
  const { parts } = splitLines(text);
  const byKey = Object.fromEntries(KEYS.map((key) => [key, []]));
  for (const line of parts) {
    const found = assignmentOnLine(line);
    if (!found) continue;
    if (found.error) return { error: found.error };
    byKey[found.key].push(found.value);
  }
  return { byKey };
}

function rewriteFile(text, { dropKeys, dedupeKeys, appendLines }) {
  const source = text ?? '';
  const { newline, parts } = splitLines(source);
  const seen = new Set();
  const kept = [];
  for (const line of parts) {
    const found = assignmentOnLine(line);
    if (!found || found.error) {
      kept.push(line);
      continue;
    }
    if (dropKeys.has(found.key)) continue;
    if (dedupeKeys.has(found.key)) {
      if (classify(found.key, found.value) === 'empty') continue;
      if (seen.has(found.key)) continue;
      seen.add(found.key);
    }
    kept.push(line);
  }
  if (appendLines.length === 0 && kept.length === parts.length && kept.every((line, index) => line === parts[index])) {
    return source;
  }
  kept.push(...appendLines);
  return joinLines(kept, newline);
}

export function planOauthEnv({ apiText = null, rootText = '', pm2 = {} }) {
  const apiScan = scan(apiText);
  const rootScan = scan(rootText);
  if (apiScan.error) return { status: 'conflict', conflicts: [apiScan.error], apiText, rootText, actions: [] };
  if (rootScan.error) return { status: 'conflict', conflicts: [rootScan.error], apiText, rootText, actions: [] };

  const conflicts = [];
  const actions = [];
  const apiDrop = new Set();
  const rootDrop = new Set();
  const apiDedupe = new Set();
  const rootDedupe = new Set();
  const append = [];
  const generated = {};

  for (const key of KEYS) {
    const sources = [];
    if (Object.prototype.hasOwnProperty.call(pm2, key)) sources.push({ source: 'pm2', value: pm2[key] ?? '' });
    for (const value of apiScan.byKey[key]) sources.push({ source: 'api', value });
    for (const value of rootScan.byKey[key]) sources.push({ source: 'root', value });

    const nonempty = sources.filter((item) => classify(key, item.value) !== 'empty');
    const invalid = nonempty.filter((item) => classify(key, item.value) === 'invalid');
    if (invalid.length) conflicts.push(`invalid-${key}`);

    const ids = new Set(nonempty.map((item) => (
      classify(key, item.value) === 'valid' ? identity(key, item.value) : `raw:${String(item.value).trim()}`
    )));
    if (ids.size > 1) conflicts.push(`conflict-${key}`);
    if (invalid.length || ids.size > 1) continue;

    const apiNonempty = apiScan.byKey[key].filter((value) => classify(key, value) !== 'empty').length;
    const rootNonempty = rootScan.byKey[key].filter((value) => classify(key, value) !== 'empty').length;
    const pm2Set = Object.prototype.hasOwnProperty.call(pm2, key);
    const pm2Empty = pm2Set && classify(key, pm2[key] ?? '') === 'empty';

    if (ids.size === 0) {
      if (pm2Set) {
        conflicts.push(`pm2-empty-${key}`);
        continue;
      }
      generated[key] = true;
      actions.push(`generate-${key}`);
      apiDrop.add(key);
      rootDrop.add(key);
      continue;
    }

    if (pm2Empty) {
      conflicts.push(`pm2-empty-${key}`);
      continue;
    }

    if (apiNonempty > 1) {
      apiDedupe.add(key);
      actions.push(`dedupe-api-${key}`);
    }
    if (rootNonempty > 1) {
      rootDedupe.add(key);
      actions.push(`dedupe-root-${key}`);
    }
    if (apiNonempty > 0 && rootNonempty > 0) {
      rootDrop.add(key);
      actions.push(`drop-lower-root-${key}`);
    }
    if (apiScan.byKey[key].some((value) => classify(key, value) === 'empty')) {
      apiDedupe.add(key);
      actions.push(`strip-empty-api-${key}`);
    }
    if (rootScan.byKey[key].some((value) => classify(key, value) === 'empty')) {
      rootDedupe.add(key);
      actions.push(`strip-empty-root-${key}`);
    }
  }

  if (conflicts.length) return { status: 'conflict', conflicts, apiText, rootText, actions: [] };

  if (generated.MCP_OAUTH_ISSUER) append.push(`MCP_OAUTH_ISSUER=${ISSUER}`);
  if (generated.MCP_OIDC_COOKIE_SECRET) append.push(`MCP_OIDC_COOKIE_SECRET=${shellQuote(generatedCookie())}`);
  if (generated.MCP_OIDC_JWKS) append.push(`MCP_OIDC_JWKS=${shellQuote(generatedJwks())}`);

  const nextApi = apiText == null ? null : rewriteFile(apiText, { dropKeys: apiDrop, dedupeKeys: apiDedupe, appendLines: [] });
  const nextRoot = rewriteFile(rootText, { dropKeys: rootDrop, dedupeKeys: rootDedupe, appendLines: append });
  const changed = nextApi !== apiText || nextRoot !== rootText;
  return {
    status: changed ? 'update' : 'already-valid',
    conflicts: [],
    apiText: nextApi,
    rootText: nextRoot,
    actions,
  };
}

function shellQuote(value) {
  if (value.includes("'") || value.includes('\n') || value.includes('\r')) {
    throw new Error('generated value cannot be encoded on one line');
  }
  return `'${value}'`;
}

function generatedCookie() {
  const value = randomBytes(32).toString('base64url');
  if (classify('MCP_OIDC_COOKIE_SECRET', value) !== 'valid') throw new Error('generated cookie secret failed validation');
  return value;
}

function generatedJwks() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = privateKey.export({ format: 'jwk' });
  jwk.kid = 'shelfmerch-mcp-staging-1';
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  const raw = JSON.stringify({ keys: [jwk] });
  const parsed = parsePrivateJwks(raw);
  const key = createPrivateKey({ key: parsed.keys[0], format: 'jwk' });
  const payload = Buffer.from('shelfmerch-staging-oauth');
  const signature = sign('sha256', payload, key);
  if (!verify('sha256', payload, createPublicKey(key), signature)) throw new Error('generated JWKS failed verification');
  return raw;
}

export function effectiveEnv({ pm2 = {}, apiText = null, rootText = '' }) {
  const parse = dotenvParse();
  const merged = { ...pm2 };
  const apiParsed = apiText == null ? {} : parse(apiText);
  const rootParsed = rootText == null ? {} : parse(rootText);
  for (const parsed of [apiParsed, rootParsed]) {
    for (const key of Object.keys(parsed)) {
      if (!Object.prototype.hasOwnProperty.call(merged, key)) merged[key] = parsed[key];
    }
  }
  return merged;
}

export function assertSingleEffective(plan, pm2 = {}) {
  const merged = effectiveEnv({ pm2, apiText: plan.apiText, rootText: plan.rootText });
  const api = scan(plan.apiText);
  const root = scan(plan.rootText);
  for (const key of KEYS) {
    const lines = [...api.byKey[key], ...root.byKey[key]];
    if (lines.some((value) => classify(key, value) === 'empty')) throw new Error(`empty-remains-${key}`);
    if (api.byKey[key].length > 1 || root.byKey[key].length > 1) throw new Error(`duplicate-line-${key}`);
    const fileCount = (api.byKey[key].length ? 1 : 0) + (root.byKey[key].length ? 1 : 0);
    if (fileCount > 1) throw new Error(`duplicate-file-${key}`);
    if (classify(key, merged[key]) !== 'valid') throw new Error(`effective-invalid-${key}`);
    if (!Object.prototype.hasOwnProperty.call(pm2, key) && fileCount !== 1) throw new Error(`effective-count-${key}`);
  }
}

export function pathIsStaging(real, production, staging) {
  if (real === production || real.startsWith(`${production}${sep}`)) return false;
  return real === staging || real.startsWith(`${staging}${sep}`);
}

function existingRealPath(file) {
  const resolved = resolve(file);
  const missing = [];
  let current = resolved;
  while (!existsSync(current)) {
    const base = basename(current);
    if (!base || base === '.' || base === '..') throw new Error('refusing path outside staging');
    missing.push(base);
    const parent = dirname(current);
    if (parent === current) throw new Error('refusing path outside staging');
    current = parent;
  }
  let real = realpathSync(current);
  for (const part of missing.reverse()) real = `${real}${sep}${part}`;
  return real;
}

function assertInsideStaging(file) {
  const real = existingRealPath(file);
  const production = existsSync(PRODUCTION_ROOT) ? realpathSync(resolve(PRODUCTION_ROOT)) : resolve(PRODUCTION_ROOT);
  const staging = existsSync(STAGING_ROOT) ? realpathSync(resolve(STAGING_ROOT)) : resolve(STAGING_ROOT);
  if (!pathIsStaging(real, production, staging)) {
    throw new Error(real === production || real.startsWith(`${production}${sep}`) ? 'refusing production path' : 'refusing path outside staging');
  }
  return real;
}

function assertEnvTarget(file) {
  const real = assertInsideStaging(file);
  const allowed = new Set([existingRealPath(ROOT_ENV)]);
  if (existsSync(API_ENV)) allowed.add(existingRealPath(API_ENV));
  if (!allowed.has(real)) throw new Error('refusing unexpected env path');
  return real;
}

export function atomicWrite(file, data, { uid, gid, mode }) {
  const real = assertInsideStaging(file);
  const temp = `${real}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  const flags = existsSync(real) ? 'w' : 'wx';
  const fd = openSync(temp, 'wx', 0o600);
  try {
    writeFileSync(fd, data);
    fsyncSync(fd);
  } catch (error) {
    closeSync(fd);
    unlinkSync(temp);
    throw error;
  }
  closeSync(fd);
  try {
    if (uid != null && gid != null && process.platform !== 'win32') chownSync(temp, uid, gid);
    chmodSync(temp, mode);
    renameSync(temp, real);
  } catch (error) {
    if (existsSync(temp)) unlinkSync(temp);
    throw error;
  }
  if (flags === 'w' && !existsSync(real)) throw new Error('atomic replace failed');
}

export function backupFiles(stampDir, files) {
  const realDir = assertInsideStaging(stampDir);
  if (existsSync(realDir)) throw new Error('backup directory already exists');
  mkdirSync(realDir, { recursive: true, mode: 0o700 });
  chmodSync(realDir, 0o700);
  chmodSync(dirname(realDir), 0o700);
  const manifest = [];
  for (const file of files) {
    if (!existsSync(file)) continue;
    const real = assertInsideStaging(file);
    const stat = statSync(real);
    const backup = `${realDir}${sep}${real.endsWith(`${sep}.env`) && real.includes(`${sep}apps${sep}api${sep}`) ? 'api.env' : 'root.env'}`;
    const bytes = readFileSync(real);
    atomicWrite(backup, bytes, { uid: stat.uid, gid: stat.gid, mode: 0o600 });
    manifest.push({ path: real, backup, uid: stat.uid, gid: stat.gid, mode: stat.mode & 0o777 });
  }
  atomicWrite(`${realDir}${sep}manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, { uid: manifest[0]?.uid, gid: manifest[0]?.gid, mode: 0o600 });
  return manifest;
}

export function restoreAll(manifest) {
  for (const entry of manifest) {
    assertEnvTarget(entry.path);
    const backup = assertInsideStaging(entry.backup);
    const backups = `${existingRealPath(STAGING_ROOT)}${sep}.oauth-env-backups${sep}`;
    if (!backup.startsWith(backups)) throw new Error('refusing backup path');
    const bytes = readFileSync(backup);
    atomicWrite(entry.path, bytes, { uid: entry.uid, gid: entry.gid, mode: entry.mode });
  }
}

function pm2Env() {
  let list;
  try {
    const raw = execFileSync('pm2', ['jlist'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    list = JSON.parse(raw);
  } catch {
    throw new Error('pm2 jlist could not be read');
  }
  const app = list.find((item) => item?.name === 'shelfmerch-staging');
  if (!app) throw new Error('shelfmerch-staging process is missing');
  const env = app.pm2_env || {};
  const picked = {};
  for (const key of KEYS) {
    if (Object.prototype.hasOwnProperty.call(env, key)) picked[key] = env[key] == null ? '' : String(env[key]);
  }
  return picked;
}

function readOptional(file) {
  if (!existsSync(file)) return null;
  return readFileSync(assertInsideStaging(file), 'utf8');
}

function publicError(error) {
  const message = error instanceof Error ? error.message : '';
  return /^[A-Za-z0-9_.:/ -]{1,160}$/.test(message) ? message : 'write failed';
}

export function runStagingWriter() {
  assertInsideStaging(STAGING_ROOT);
  if (!existsSync(ROOT_ENV)) throw new Error('staging root .env is missing');
  assertInsideStaging(ROOT_ENV);
  if (existsSync(API_ENV)) assertInsideStaging(API_ENV);
  const pm2 = pm2Env();
  const apiText = readOptional(API_ENV);
  const rootText = readFileSync(assertInsideStaging(ROOT_ENV), 'utf8');
  const plan = planOauthEnv({ apiText, rootText, pm2 });
  if (plan.status === 'conflict') {
    console.log('status conflict');
    for (const code of plan.conflicts) console.log(`conflict ${code}`);
    process.exitCode = 2;
    return;
  }
  if (plan.status === 'already-valid') {
    console.log('status already-valid');
    console.log('issuer ok');
    console.log('jwks ok');
    console.log('cookie ok');
    return;
  }
  assertSingleEffective(plan, pm2);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const stampDir = `${STAGING_ROOT}/.oauth-env-backups/${stamp}`;
  const files = [ROOT_ENV, API_ENV].filter((file) => existsSync(file));
  const manifest = backupFiles(stampDir, files);
  try {
    const rootStat = statSync(ROOT_ENV);
    if (apiText != null && plan.apiText !== apiText) {
      const apiStat = statSync(API_ENV);
      atomicWrite(API_ENV, plan.apiText, { uid: apiStat.uid, gid: apiStat.gid, mode: 0o600 });
    }
    atomicWrite(ROOT_ENV, plan.rootText, { uid: rootStat.uid, gid: rootStat.gid, mode: 0o600 });
    const written = planOauthEnv({
      apiText: existsSync(API_ENV) ? readFileSync(API_ENV, 'utf8') : null,
      rootText: readFileSync(ROOT_ENV, 'utf8'),
      pm2,
    });
    if (written.status !== 'already-valid') throw new Error('post-write validation failed');
    assertSingleEffective(written, pm2);
  } catch (error) {
    restoreAll(manifest);
    console.log('status rolled-back');
    console.log(`backup ${stampDir}`);
    console.log(publicError(error));
    process.exitCode = 1;
    return;
  }
  console.log('status updated');
  console.log(`backup ${stampDir}`);
  console.log('issuer ok');
  console.log('jwks ok');
  console.log('cookie ok');
  console.log('mode 600');
}

function quoteSafe(value) {
  return !value.includes("'") && !value.includes('\n') && !value.includes('\r');
}

function fixtureSecret(label) {
  return `${label}-${'a'.repeat(32)}`.slice(0, 43);
}

function fixtureJwks(seed) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = privateKey.export({ format: 'jwk' });
  jwk.kid = seed;
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  return JSON.stringify({ keys: [jwk] });
}

function countKey(text, key) {
  return splitLines(text ?? '').parts.filter((line) => assignmentOnLine(line)?.key === key).length;
}

function assertOutputSafe(chunks, secrets) {
  const output = chunks.join('\n');
  for (const secret of secrets) {
    if (secret && output.includes(secret)) throw new Error('secret appeared in output');
  }
  if (/"d"\s*:/.test(output)) throw new Error('private jwk field appeared in output');
}

export function selfTest() {
  const logs = [];
  const original = console.log;
  console.log = (...args) => logs.push(args.map(String).join(' '));
  const secrets = [];
  try {
    const cookieA = fixtureSecret('cookie-a');
    const cookieB = fixtureSecret('cookie-b');
    const jwksA = fixtureJwks('a');
    const jwksB = fixtureJwks('b');
    secrets.push(cookieA, cookieB, jwksA, jwksB);

    const missing = planOauthEnv({ apiText: 'MONGO_URL=mongodb://example/staging\n', rootText: 'APP_URL=https://staging.shelfmerch.io\n', pm2: {} });
    if (missing.status !== 'update') throw new Error('missing-status');
    assertSingleEffective(missing, {});
    if (!missing.rootText.includes('APP_URL=https://staging.shelfmerch.io')) throw new Error('missing-preserved');
    if (countKey(missing.apiText, 'MCP_OIDC_JWKS') !== 0) throw new Error('missing-api-jwks');
    secrets.push(...KEYS.flatMap((key) => scan(missing.rootText).byKey[key]));

    const emptyRoot = planOauthEnv({
      apiText: null,
      rootText: 'MCP_OAUTH_ISSUER=\nMCP_OIDC_JWKS=\nMCP_OIDC_COOKIE_SECRET=\n',
      pm2: {},
    });
    if (emptyRoot.status !== 'update') throw new Error('empty-status');
    assertSingleEffective(emptyRoot, {});
    for (const key of KEYS) if (countKey(emptyRoot.rootText, key) !== 1) throw new Error(`empty-count-${key}`);
    secrets.push(...KEYS.flatMap((key) => scan(emptyRoot.rootText).byKey[key]));

    const duplicateEmpty = planOauthEnv({
      apiText: '',
      rootText: 'MCP_OAUTH_ISSUER=\nMCP_OAUTH_ISSUER=""\nMCP_OIDC_JWKS=\'\'\nMCP_OIDC_COOKIE_SECRET=\r\nMCP_OIDC_COOKIE_SECRET=\r\n',
      pm2: {},
    });
    assertSingleEffective(duplicateEmpty, {});
    if (!duplicateEmpty.rootText.includes('\r\n')) throw new Error('crlf-lost');

    const hiddenValid = planOauthEnv({
      apiText: 'MCP_OAUTH_ISSUER=\n',
      rootText: `MCP_OAUTH_ISSUER=${ISSUER}\nMCP_OIDC_COOKIE_SECRET='${cookieA}'\nMCP_OIDC_JWKS='${jwksA}'\n`,
      pm2: {},
    });
    if (hiddenValid.status !== 'update') throw new Error('hidden-status');
    assertSingleEffective(hiddenValid, {});
    if (scan(hiddenValid.rootText).byKey.MCP_OIDC_COOKIE_SECRET[0] !== cookieA) throw new Error('hidden-cookie-replaced');
    if (scan(hiddenValid.rootText).byKey.MCP_OIDC_JWKS[0] !== jwksA) throw new Error('hidden-jwks-replaced');
    if (countKey(hiddenValid.apiText, 'MCP_OAUTH_ISSUER') !== 0) throw new Error('hidden-api-empty-remains');

    const emptyAfterValid = planOauthEnv({
      apiText: null,
      rootText: `MCP_OIDC_COOKIE_SECRET='${cookieA}'\nMCP_OIDC_COOKIE_SECRET=\nMCP_OAUTH_ISSUER=${ISSUER}\nMCP_OIDC_JWKS='${jwksA}'\n`,
      pm2: {},
    });
    assertSingleEffective(emptyAfterValid, {});
    if (effectiveEnv(emptyAfterValid).MCP_OIDC_COOKIE_SECRET !== cookieA) throw new Error('last-empty-wins');

    const sameDuplicate = planOauthEnv({
      apiText: `MCP_OAUTH_ISSUER=${ISSUER}\nMCP_OAUTH_ISSUER=${ISSUER}/\n`,
      rootText: `MCP_OIDC_COOKIE_SECRET='${cookieA}'\nMCP_OIDC_JWKS='${jwksA}'\n`,
      pm2: {},
    });
    assertSingleEffective(sameDuplicate, {});
    if (countKey(sameDuplicate.apiText, 'MCP_OAUTH_ISSUER') !== 1) throw new Error('same-duplicate-count');

    const conflictOriginal = `MCP_OAUTH_ISSUER=${ISSUER}\nMCP_OAUTH_ISSUER=https://evil.example\nMCP_OIDC_COOKIE_SECRET='${cookieA}'\nMCP_OIDC_JWKS='${jwksA}'\n`;
    const conflictIssuer = planOauthEnv({
      apiText: null,
      rootText: conflictOriginal,
      pm2: {},
    });
    if (conflictIssuer.status !== 'conflict' || !conflictIssuer.conflicts.includes('conflict-MCP_OAUTH_ISSUER')) throw new Error('conflict-issuer');
    if (conflictIssuer.rootText !== conflictOriginal || conflictIssuer.apiText !== null) throw new Error('conflict-mutated');

    const conflictAcross = planOauthEnv({
      apiText: `MCP_OIDC_COOKIE_SECRET='${cookieA}'\n`,
      rootText: `MCP_OIDC_COOKIE_SECRET='${cookieB}'\nMCP_OAUTH_ISSUER=${ISSUER}\nMCP_OIDC_JWKS='${jwksA}'\n`,
      pm2: {},
    });
    if (conflictAcross.status !== 'conflict' || !conflictAcross.conflicts.includes('conflict-MCP_OIDC_COOKIE_SECRET')) throw new Error('conflict-across');

    const conflictJwks = planOauthEnv({
      apiText: `MCP_OIDC_JWKS='${jwksA}'\n`,
      rootText: `MCP_OIDC_JWKS='${jwksB}'\nMCP_OAUTH_ISSUER=${ISSUER}\nMCP_OIDC_COOKIE_SECRET='${cookieA}'\n`,
      pm2: {},
    });
    if (conflictJwks.status !== 'conflict') throw new Error('conflict-jwks');

    const invalid = planOauthEnv({
      apiText: null,
      rootText: 'MCP_OIDC_JWKS={"keys":[{"kty":"RSA"}]}\nMCP_OAUTH_ISSUER=http://staging.shelfmerch.io\nMCP_OIDC_COOKIE_SECRET=short\n',
      pm2: {},
    });
    if (invalid.status !== 'conflict') throw new Error('invalid-status');
    for (const key of KEYS) if (!invalid.conflicts.includes(`invalid-${key}`)) throw new Error(`invalid-missing-${key}`);

    const already = planOauthEnv({
      apiText: `MCP_OAUTH_ISSUER=${ISSUER}\nMCP_OIDC_COOKIE_SECRET='${cookieA}'\nMCP_OIDC_JWKS='${jwksA}'\n`,
      rootText: 'APP_URL=https://staging.shelfmerch.io\n',
      pm2: {},
    });
    if (already.status !== 'already-valid') throw new Error('already-status');

    const pm2Wins = planOauthEnv({
      apiText: `MCP_OAUTH_ISSUER=\nMCP_OIDC_COOKIE_SECRET='${cookieA}'\nMCP_OIDC_JWKS='${jwksA}'\n`,
      rootText: `MCP_OIDC_COOKIE_SECRET=\n`,
      pm2: { MCP_OAUTH_ISSUER: ISSUER },
    });
    if (pm2Wins.status !== 'update') throw new Error('pm2-status');
    assertSingleEffective(pm2Wins, { MCP_OAUTH_ISSUER: ISSUER });
    if (countKey(pm2Wins.apiText, 'MCP_OAUTH_ISSUER') !== 0) throw new Error('pm2-empty-api-remains');
    if (countKey(pm2Wins.rootText, 'MCP_OIDC_COOKIE_SECRET') !== 0) throw new Error('pm2-lower-empty-remains');
    if (scan(pm2Wins.apiText).byKey.MCP_OIDC_JWKS[0] !== jwksA) throw new Error('pm2-jwks-replaced');

    const pm2Conflict = planOauthEnv({
      apiText: null,
      rootText: `MCP_OAUTH_ISSUER=${ISSUER}\nMCP_OIDC_COOKIE_SECRET='${cookieA}'\nMCP_OIDC_JWKS='${jwksA}'\n`,
      pm2: { MCP_OAUTH_ISSUER: 'https://shelfmerch.io' },
    });
    if (pm2Conflict.status !== 'conflict') throw new Error('pm2-conflict');

    const pm2Empty = planOauthEnv({
      apiText: null,
      rootText: `MCP_OAUTH_ISSUER=${ISSUER}\nMCP_OIDC_COOKIE_SECRET='${cookieA}'\nMCP_OIDC_JWKS='${jwksA}'\n`,
      pm2: { MCP_OIDC_JWKS: '' },
    });
    if (pm2Empty.status !== 'conflict' || !pm2Empty.conflicts.includes('pm2-empty-MCP_OIDC_JWKS')) throw new Error('pm2-empty');

    const lowerDuplicate = planOauthEnv({
      apiText: `MCP_OIDC_COOKIE_SECRET='${cookieA}'\n`,
      rootText: `MCP_OIDC_COOKIE_SECRET='${cookieA}'\nMCP_OAUTH_ISSUER=${ISSUER}\nMCP_OIDC_JWKS='${jwksA}'\n`,
      pm2: {},
    });
    assertSingleEffective(lowerDuplicate, {});
    if (countKey(lowerDuplicate.rootText, 'MCP_OIDC_COOKIE_SECRET') !== 0) throw new Error('lower-duplicate-remains');
    if (scan(lowerDuplicate.apiText).byKey.MCP_OIDC_COOKIE_SECRET[0] !== cookieA) throw new Error('lower-duplicate-value');

    const emptyBeforeValid = planOauthEnv({
      apiText: 'export MCP_OIDC_JWKS=\n',
      rootText: `MCP_OIDC_COOKIE_SECRET=\nMCP_OIDC_COOKIE_SECRET='${cookieA}'\nMCP_OAUTH_ISSUER=${ISSUER}\nMCP_OIDC_JWKS='${jwksA}'\n`,
      pm2: {},
    });
    assertSingleEffective(emptyBeforeValid, {});
    if (scan(emptyBeforeValid.rootText).byKey.MCP_OIDC_COOKIE_SECRET[0] !== cookieA) throw new Error('empty-before-cookie');
    if (scan(emptyBeforeValid.rootText).byKey.MCP_OIDC_JWKS[0] !== jwksA) throw new Error('empty-before-jwks');
    if (countKey(emptyBeforeValid.apiText, 'MCP_OIDC_JWKS') !== 0) throw new Error('export-empty-remains');
    if (emptyBeforeValid.actions.some((action) => action.startsWith('generate-'))) throw new Error('empty-before-generated');

    const partial = planOauthEnv({
      apiText: null,
      rootText: `MCP_OAUTH_ISSUER=${ISSUER}\nMCP_OAUTH_ISSUER=https://evil.example\n`,
      pm2: {},
    });
    if (partial.status !== 'conflict' || partial.rootText.includes('MCP_OIDC_')) throw new Error('partial-generated');

    const staging = `D:${sep}var${sep}www${sep}shelfmerch-staging`;
    const production = `D:${sep}root${sep}shelf_merch`;
    if (!pathIsStaging(`${staging}${sep}.env`, production, staging)) throw new Error('path-staging');
    if (pathIsStaging(`${production}${sep}.env`, production, staging)) throw new Error('path-production');
    if (pathIsStaging(`${staging}-evil${sep}.env`, production, staging)) throw new Error('path-prefix');

    const dir = `${tmpdir()}/shelfmerch-oauth-writer-${process.pid}`;
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(`${dir}/apps/api`, { recursive: true });
    const rootFile = `${dir}/.env`;
    const apiFile = `${dir}/apps/api/.env`;
    writeFileSync(rootFile, `MCP_OAUTH_ISSUER=\nMCP_OIDC_COOKIE_SECRET=\nKEEP=1\n`, { mode: 0o600 });
    writeFileSync(apiFile, `MCP_OIDC_JWKS=\nOTHER=1\n`, { mode: 0o600 });
    const staged = planOauthEnv({ apiText: readFileSync(apiFile, 'utf8'), rootText: readFileSync(rootFile, 'utf8'), pm2: {} });
    const rootBefore = readFileSync(rootFile);
    const apiBefore = readFileSync(apiFile);
    const manifest = [
      { path: rootFile, backup: `${dir}/root.env`, uid: statSync(rootFile).uid, gid: statSync(rootFile).gid, mode: 0o600 },
      { path: apiFile, backup: `${dir}/api.env`, uid: statSync(apiFile).uid, gid: statSync(apiFile).gid, mode: 0o600 },
    ];
    copyFileSync(rootFile, manifest[0].backup);
    copyFileSync(apiFile, manifest[1].backup);
    writeFileSync(rootFile, staged.rootText);
    writeFileSync(apiFile, 'partial-failure');
    restoreAllUnsafe(manifest);
    if (!readFileSync(rootFile).equals(rootBefore) || !readFileSync(apiFile).equals(apiBefore)) throw new Error('rollback-mismatch');
    if (!quoteSafe(cookieA) || !quoteSafe(jwksA)) throw new Error('fixture-encoding');
    rmSync(dir, { recursive: true, force: true });

    console.log = original;
    assertOutputSafe(logs, secrets);
    original('self-test ok');
    original('cases missing empty duplicate-empty hidden-valid empty-after-valid same-duplicate conflict-issuer conflict-across conflict-jwks invalid already-valid pm2-match pm2-conflict pm2-empty lower-duplicate empty-before-valid no-partial-generate path-guard rollback');
  } catch (error) {
    console.log = original;
    throw error;
  }
}

function restoreAllUnsafe(manifest) {
  for (const entry of manifest) {
    const bytes = readFileSync(entry.backup);
    const temp = `${entry.path}.tmp-restore`;
    writeFileSync(temp, bytes, { mode: entry.mode });
    renameSync(temp, entry.path);
  }
}

function rollback(dir) {
  if (!dir || dir.includes('STAMP')) throw new Error('backup directory is required');
  const real = assertInsideStaging(dir);
  const backups = `${existingRealPath(STAGING_ROOT)}${sep}.oauth-env-backups${sep}`;
  if (!real.startsWith(backups)) throw new Error('refusing backup path');
  const manifestPath = `${real}${sep}manifest.json`;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(manifest) || manifest.length === 0) throw new Error('backup manifest is empty');
  restoreAll(manifest);
  console.log('status restored');
  console.log(`backup ${real}`);
}

const command = process.argv[2];
if (command === '--self-test') selfTest();
else if (command === '--apply') runStagingWriter();
else if (command === '--rollback') rollback(process.argv[3]);
else {
  console.log('usage: node staging-oauth-env.mjs --self-test|--apply|--rollback <backup-dir>');
  process.exitCode = 2;
}
