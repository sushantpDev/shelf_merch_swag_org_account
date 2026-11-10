import { env, validateMergeEnvironment } from './config/env.js';
import { logger, logActiveLoggerConfig } from './config/logger.js';
import { connectDb, disconnectDb } from './config/db.js';
import { initObservability } from './config/observability.js';
import { createApp } from './app.js';
import { getOidcProvider } from './modules/oauth/createOidcProvider.js';
import { mcpResourceUrl, oauthIssuer } from './modules/oauth/oauth.config.js';
import { startScheduledCampaignWorker } from './jobs/scheduledCampaign.worker.js';
import { startNotificationWorker } from './jobs/notification.worker.js';
import { ensureRedisReady } from './config/redis.js';
import { ensureBuiltInPlatformTeam } from './modules/platform/team.service.js';

async function main() {
  const mergeEnv = validateMergeEnvironment();
  if (mergeEnv.missing?.length) {
    logger.warn(
      { missing: mergeEnv.missing },
      'Merge is enabled without webhook configuration. Webhooks stay disabled until these keys are set.',
    );
  }
  await initObservability();
  // Prove which logger module production is running (no secrets / env dumps).
  logActiveLoggerConfig();
  await connectDb();
  await ensureBuiltInPlatformTeam();

  // Ensure overdue scheduled sends are recovered even when the dedicated
  // worker process is not running (common in local / single-node deploys).
  const scheduleWorker = await startScheduledCampaignWorker();
  const notificationWorker = (await ensureRedisReady()) ? startNotificationWorker() : null;

  getOidcProvider();
  const app = createApp();
  const server = app.listen(env.PORT, env.HOST, () => {
    const addr = server.address();
    if (!addr) {
      logger.fatal({ port: env.PORT, host: env.HOST }, 'HTTP server failed to bind');
      process.exit(1);
    }
    const base = env.APP_URL.replace(/\/$/, '') || `http://${env.HOST}:${env.PORT}`;
    logger.info(
      {
        host: env.HOST,
        port: env.PORT,
        nodeEnv: env.NODE_ENV,
        appUrl: base,
        oauthIssuer: oauthIssuer(),
        mcpResource: mcpResourceUrl(),
      },
      `ShelfMerch listening on ${base}`,
    );
    if (env.ZOHO_REDIRECT_URI) {
      // Safe: redirect URI only — never Client ID, secret, codes, or tokens.
      logger.info(`Zoho OAuth redirect URI: ${env.ZOHO_REDIRECT_URI}`);
    }
  });
  // Shopify import (and similar bulk Admin pulls) can exceed Node's default
  // requestTimeout (5m). Closing mid-response surfaces as ERR_EMPTY_RESPONSE
  // through the Vite proxy.
  server.requestTimeout = 0;
  server.headersTimeout = 0;
  server.timeout = 0;
  server.on('error', (err) => {
    if (err.code === 'EACCES') {
      logger.fatal(
        { port: env.PORT, err: err.message },
        `Cannot bind to port ${env.PORT} (permission denied). On Windows, Hyper-V/Docker often reserves port ranges — set PORT to a free port (e.g. 3001) in .env`,
      );
    } else if (err.code === 'EADDRINUSE') {
      logger.fatal({ port: env.PORT, err: err.message }, `Port ${env.PORT} is already in use`);
    } else {
      logger.fatal({ err: err.message }, 'HTTP server failed to start');
    }
    process.exit(1);
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down');
    server.close(async () => {
      await scheduleWorker.close();
      if (notificationWorker) await notificationWorker.close();
      await disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
