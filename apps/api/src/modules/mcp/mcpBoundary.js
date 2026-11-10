import { env, corsOrigins } from '../../config/env.js';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];

/** Hostname from a Host header or an absolute URL. Ports are ignored. */
export function hostnameFromHeader(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.split(',')[0].trim();
  if (!trimmed) return '';
  try {
    if (trimmed.includes('://')) return new URL(trimmed).hostname.toLowerCase();
  } catch {
    return '';
  }
  const host = trimmed.toLowerCase();
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    return end > 1 ? host.slice(1, end) : '';
  }
  const colon = host.lastIndexOf(':');
  if (colon > 0 && /^\d+$/.test(host.slice(colon + 1))) return host.slice(0, colon);
  return host;
}

/**
 * Host allowlist for /mcp. Production accepts only configured public hosts
 * (APP_URL, BASE_URL, CLIENT_URL, CORS_ORIGINS). Other environments also
 * accept loopback so local clients and tests can connect. A missing Origin
 * is allowed; a present Origin must use an allowlisted host.
 */
export function evaluateMcpBoundary({ hostHeader, origin, nodeEnv, urls }) {
  const allowed = new Set();
  for (const raw of urls || []) {
    const name = hostnameFromHeader(raw);
    if (name) allowed.add(name);
  }
  if (nodeEnv !== 'production') {
    for (const name of LOCAL_HOSTS) allowed.add(name);
  }
  const host = hostnameFromHeader(hostHeader);
  if (!host || !allowed.has(host)) {
    return { ok: false, code: 'FORBIDDEN_HOST', message: 'Host is not allowed' };
  }
  if (origin) {
    let originHost = '';
    try {
      originHost = new URL(origin).hostname.toLowerCase();
    } catch {
      originHost = '';
    }
    if (!originHost || !allowed.has(originHost)) {
      return { ok: false, code: 'FORBIDDEN_ORIGIN', message: 'Origin is not allowed' };
    }
  }
  return { ok: true };
}

export function mcpRequestBoundary(req, res, next) {
  const decision = evaluateMcpBoundary({
    hostHeader: req.headers.host,
    origin: typeof req.headers.origin === 'string' ? req.headers.origin : '',
    nodeEnv: env.NODE_ENV,
    urls: [env.APP_URL, env.BASE_URL, env.CLIENT_URL, ...corsOrigins()],
  });
  if (!decision.ok) {
    return res.status(403).json({
      error: { code: decision.code, message: decision.message },
    });
  }
  next();
}
