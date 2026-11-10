import pino from 'pino';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';
import { getRequestContext } from './requestContext.js';

/** Absolute path of this module — used in startup logs so ops can verify the active config. */
export const LOGGER_CONFIG_FILE = fileURLToPath(import.meta.url);

/**
 * Safe pathname only — never includes query string (OAuth code/state live there).
 */
export function safeRequestPath(req) {
  try {
    return new URL(req?.originalUrl || req?.url || '/', 'http://localhost').pathname;
  } catch {
    return '/';
  }
}

/**
 * Minimal request serializer for pino / pino-http.
 * Must not include url, originalUrl, query, params, headers, or body.
 */
export function serializeHttpRequest(req) {
  if (!req || typeof req !== 'object') return {};
  return {
    id: req.id ?? req.requestId ?? undefined,
    method: req.method ?? undefined,
    path: safeRequestPath(req),
    remoteAddress:
      req.remoteAddress ||
      req.ip ||
      req.socket?.remoteAddress ||
      req.connection?.remoteAddress ||
      undefined,
  };
}

/**
 * Minimal response serializer — status only (never Location / Set-Cookie / headers).
 */
export function serializeHttpResponse(res) {
  if (!res || typeof res !== 'object') return {};
  return {
    statusCode: res.statusCode ?? undefined,
  };
}

export const httpSerializers = {
  req: serializeHttpRequest,
  res: serializeHttpResponse,
};

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.query.code',
  'req.query.state',
  'req.body.code',
  'req.body.state',
  'res.headers["set-cookie"]',
  'res.headers.location',
  'res.headers["location"]',
  'authorization',
  '*.authorization',
  '*.password',
  '*.passwordHash',
  '*.newPassword',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.access_token',
  '*.refresh_token',
  '*.id_token',
  '*.client_assertion',
  '*.client_secret',
  '*.clientSecret',
  '*.otp',
  '*.otpHash',
  '*.code',
  '*.code_verifier',
  '*.code_challenge',
  '*.state',
  '*.secret',
];

/**
 * §Gap F — structured logging with:
 *  - secret redaction (auth headers, cookies, tokens, OAuth codes/state),
 *  - minimal HTTP serializers (no query string / Location / raw headers),
 *  - a mixin that stamps the current requestId/tenantId/userId onto every line
 *    (from AsyncLocalStorage), so logs across a request correlate.
 */
export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  serializers: httpSerializers,
  redact: {
    paths: REDACT_PATHS,
    censor: '[redacted]',
  },
  mixin() {
    const ctx = getRequestContext();
    if (!ctx) return {};
    const out = {};
    if (ctx.requestId) out.requestId = ctx.requestId;
    if (ctx.tenantId) out.tenantId = String(ctx.tenantId);
    if (ctx.userId) out.userId = String(ctx.userId);
    return out;
  },
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
      : undefined,
});

/** Options shared by the sole pino-http middleware in createApp(). */
export function createPinoHttpOptions() {
  return {
    logger,
    serializers: httpSerializers,
    genReqId: (req) => req.requestId,
    customProps: (req) => ({
      tenantId: req.tenantId ?? undefined,
      userId: req.user?.userId ?? undefined,
    }),
    autoLogging: {
      ignore: (req) => {
        const path = safeRequestPath(req);
        return path.includes('/health');
      },
    },
    // Never attach raw headers / body to the log line beyond serializers.
    quietReqLogger: true,
    customAttributeKeys: {
      req: 'req',
      res: 'res',
      err: 'err',
      responseTime: 'responseTime',
    },
  };
}

/** One-line startup marker so production logs prove which logger file is active. */
export function logActiveLoggerConfig() {
  logger.info(
    {
      loggerConfigFile: LOGGER_CONFIG_FILE,
      httpLogger: 'pino-http',
      serializers: 'minimal-req-res',
    },
    'Active HTTP logger configuration loaded',
  );
}
