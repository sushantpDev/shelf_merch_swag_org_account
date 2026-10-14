import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { pinoHttp } from 'pino-http';
import { createPinoHttpOptions } from './config/logger.js';
import { existsSync, readFileSync } from 'node:fs';
import { env, corsOrigins } from './config/env.js';
import { ensureRedisReady } from './config/redis.js';
import { LOCAL_UPLOAD_DIR } from './services/storage.service.js';
import { asyncHandler } from './utils/asyncHandler.js';
import { notFoundHandler, errorHandler } from './middleware/error.middleware.js';
import { sanitizeMongoInput } from './middleware/sanitize.middleware.js';
import { requestContextMiddleware } from './middleware/requestContext.middleware.js';
import { globalHttpRateLimit } from './middleware/globalRateLimit.middleware.js';
import { razorpayWebhook } from './modules/payments/payments.controller.js';
import { mergeWebhook } from './modules/integrations/merge/merge.controller.js';

import authRoutes from './modules/auth/auth.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import {
  tenantsRouter,
  platformTenantsRouter,
} from './modules/tenants/tenants.routes.js';
import walletsRoutes from './modules/wallets/wallets.routes.js';
import entitiesRoutes from './modules/entities/entities.routes.js';
import shopsRoutes from './modules/shops/shops.routes.js';
import catalogRoutes from './modules/catalog/catalog.routes.js';
import collectionsRoutes from './modules/collections/collections.routes.js';
import kitsRoutes from './modules/kits/kits.routes.js';
import contactsRoutes from './modules/contacts/contacts.routes.js';
import demoLeadsRoutes, { platformDemoLeadsRouter } from './modules/demoLeads/demoLeads.routes.js';
import campaignsRoutes from './modules/campaigns/campaigns.routes.js';
import redemptionsRoutes from './modules/redemptions/redemptions.routes.js';
import storefrontRoutes from './modules/storefront/storefront.routes.js';
import shopAuthRoutes, { claimRedeemRouter } from './modules/storefront/shopAuth.routes.js';
import notificationsRoutes from './modules/notifications/notifications.routes.js';
import paymentsRoutes from './modules/payments/payments.routes.js';
import invoicesRoutes from './modules/invoices/invoices.routes.js';
import ordersRoutes from './modules/orders/orders.routes.js';
import orderInvoiceRoutes from './modules/orderInvoices/orderInvoice.routes.js';
import vendorsRoutes from './modules/vendors/vendors.routes.js';
import shipmentsRoutes from './modules/shipments/shipments.routes.js';
import { tenantSupportRouter, platformSupportRouter } from './modules/support/support.routes.js';
import {
  platformDashboardRouter,
  platformOrdersRouter,
  platformProductionRouter,
  platformAuditRouter,
  platformImpersonateRouter,
  platformTeamRouter,
  platformSettingsRouter,
} from './modules/platform/platform.routes.js';
import platformFinanceRoutes from './modules/platform/finance.routes.js';
import {
  platformProductsRouter,
  platformCategoriesRouter,
  platformInventoryRouter,
} from './modules/catalog/platformCatalog.routes.js';
import { platformKitsRouter } from './modules/kits/platformKits.routes.js';
import mediaRoutes from './modules/media/media.routes.js';
import { platformReportsRouter } from './modules/reports/reports.routes.js';
import zohoIntegrationsRoutes from './modules/integrations/zoho/zoho.routes.js';
import mergeIntegrationsRoutes from './modules/integrations/merge/merge.routes.js';
import slackIntegrationsRoutes from './modules/integrations/slack/slack.routes.js';
import {
  applyZohoPeopleEmbedHeaders,
  applyZohoPeopleCoopHeaders,
  zohoPeopleEmbedHeaderMiddleware,
  defaultShelfmerchCoopMiddleware,
} from './middleware/zohoPeopleEmbed.middleware.js';
import { sendPrivacyPolicy } from './modules/legal/privacyPolicy.controller.js';
import { sendTermsOfService } from './modules/legal/termsOfService.controller.js';
import { sendDocsPage, DOCS_PUBLIC_ROUTES } from './modules/docs/docs.controller.js';
import blogRoutes from './modules/blog/blog.routes.js';
import { sendBlogArticle, sendBlogIndex, sendBlogMedia } from './modules/blog/blogPublic.controller.js';
import {
  sendBlogSitemap,
  sendCatalogSitemap,
  sendSeoPublicFile,
} from './modules/seo/sitemap.controller.js';
import { renderSpaDocument, spaDocumentHeaders, documentKind, publicRedirectTarget, seoNotFoundHtml } from './modules/seo/spaDocument.js';
import { sendContentArticle, sendContentIndex, sendContentSitemap } from './modules/seo/contentPublic.controller.js';
import { sendCatalogProductSeo } from './modules/seo/catalogProductSeo.controller.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(__dirname, '../../web/dist');

/** Minimal HTML for Connected App routes when the SPA build is absent (tests / misconfig). */
const ZOHO_CONNECTED_APP_HTML_FALLBACK = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ShelfMerch · Zoho People</title>
</head>
<body>
  <div id="root" data-page="zoho-people-connected-app"></div>
</body>
</html>
`;

function isSameHostOrigin(origin, hostHeader) {
  if (!origin || !hostHeader) return false;
  try {
    return new URL(origin).host === hostHeader.split(',')[0].trim();
  } catch {
    return false;
  }
}

function resolveCorsOptions(req) {
  if (env.NODE_ENV !== 'production') {
    return { origin: true, credentials: true };
  }
  // Fail closed: an unset CORS_ORIGINS must NOT mean "allow every origin with
  // credentials". Same-origin (unified server) and non-browser requests send no
  // Origin header and are still allowed; cross-origin requests are only allowed
  // when explicitly listed or when the Origin matches the request Host.
  const origins = corsOrigins();
  return {
    origin(origin, callback) {
      if (!origin || origins.includes(origin)) return callback(null, true);
      // Vite emits crossorigin on /assets/*; browsers send Origin even for same-host
      // document loads. Allow when Origin matches the request Host (e.g. shelfmerch.io).
      if (req && isSameHostOrigin(origin, req.headers.host)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  };
}

/**
 * §security hardening A4 — production Content-Security-Policy. The SPA is served
 * same-origin as the API, so 'self' covers scripts/XHR; images may come from
 * R2/S3/data URIs. Defaults to report-only (env.CSP_MODE) so a wrong directive
 * can't white-screen the app on first deploy — flip CSP_MODE=enforce once
 * validated in staging.
 */
function helmetOptions() {
  const coopDisabled = { crossOriginOpenerPolicy: false };
  if (env.NODE_ENV !== 'production') return coopDisabled;
  if (env.CSP_MODE === 'off') return { contentSecurityPolicy: false, ...coopDisabled };

  return {
    contentSecurityPolicy: {
      useDefaults: true,
      reportOnly: env.CSP_MODE === 'report-only',
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // Vite/React inject hashed style tags at runtime; allow inline styles.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'https:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  };
}

export function createApp() {
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY);
  // Seed request-scoped context (requestId) first so every downstream log correlates.
  app.use(requestContextMiddleware);
  app.use(helmet(helmetOptions()));
  // Zoho Connected App pages only — must run after helmet so we can override frame headers.
  app.use(zohoPeopleEmbedHeaderMiddleware);
  // COOP same-origin everywhere except Zoho embed routes (Helmet COOP is disabled above).
  app.use(defaultShelfmerchCoopMiddleware);
  app.use((req, res, next) => cors(resolveCorsOptions(req))(req, res, next));

  // §9.3 — Razorpay webhook must verify signature against the raw body.
  app.post(
    '/api/v1/payments/razorpay/webhook',
    express.raw({ type: 'application/json' }),
    asyncHandler(razorpayWebhook),
  );

  // Merge signs the raw body. Verify before JSON parsing, and do not import HRIS here.
  app.post(
    '/api/integrations/merge/webhook',
    express.raw({ type: 'application/json', limit: '1mb' }),
    asyncHandler(mergeWebhook),
  );

  app.use(express.json({ limit: '1mb' }));
  // Defence-in-depth against NoSQL operator injection on every parsed request.
  app.use(sanitizeMongoInput);
  // Sole HTTP access logger — serializers from config/logger.js omit query/Location/tokens.
  if (env.NODE_ENV !== 'test') {
    app.use(pinoHttp(createPinoHttpOptions()));
  }

  // Serve user uploads defused: never sniff the content type, sandbox any
  // markup, and force download for non-image types so an uploaded file can't
  // execute script on the app origin (stored XSS).
  app.use(
    '/uploads',
    express.static(LOCAL_UPLOAD_DIR, {
      setHeaders(res, filePath) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        const ext = path.extname(filePath).toLowerCase();
        if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
          res.setHeader('Content-Disposition', 'attachment');
        }
      },
    }),
  );

  // Brand images for transactional emails (also copied to apps/web/public/email-assets).
  // Served here so production can expose them even before a web rebuild lands in WEB_DIST.
  const emailAssetsDir = path.resolve(__dirname, 'services/email-assets');
  if (existsSync(emailAssetsDir)) {
    app.use(
      '/email-assets',
      express.static(emailAssetsDir, {
        setHeaders(res) {
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          // Allow Gmail / email clients to load images cross-origin.
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        },
      }),
    );
  }

  const api = express.Router();

  // Liveness: the process is up and the event loop responds. Used by the
  // orchestrator to decide whether to restart the container — must NOT depend on
  // Mongo/Redis, or a data blip would kill otherwise-healthy replicas.
  api.get('/health/live', (_req, res) => {
    res.status(200).json({ status: 'live', uptimeSec: Math.round(process.uptime()) });
  });

  // Readiness: this replica can serve traffic. The load balancer gates on this —
  // 503 pulls the replica out of rotation until Mongo AND Redis are reachable.
  api.get('/health/ready', async (_req, res) => {
    const mongoOk = mongoose.connection.readyState === 1;
    const redisOk = await ensureRedisReady(2_000);
    const ready = mongoOk && redisOk;
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not-ready',
      mongo: mongoOk ? 'up' : 'down',
      redis: redisOk ? 'up' : 'down',
      uptimeSec: Math.round(process.uptime()),
    });
  });

  // Back-compat combined health check.
  api.get('/health', async (_req, res) => {
    const mongoOk = mongoose.connection.readyState === 1;
    const redisOk = await ensureRedisReady(2_000);
    res.status(mongoOk ? 200 : 503).json({
      status: mongoOk && redisOk ? 'ok' : mongoOk ? 'degraded' : 'down',
      mongo: mongoOk ? 'up' : 'down',
      redis: redisOk ? 'up' : 'down',
      uptimeSec: Math.round(process.uptime()),
    });
  });

  // Coarse per-IP ceiling across the whole API (health excluded above), as
  // defence-in-depth in front of the fine-grained per-identity limits layered on
  // auth/OTP routes. Backed by Redis so the ceiling is shared across replicas.
  api.use(globalHttpRateLimit);

  api.use('/auth', authRoutes);
  api.use('/media', mediaRoutes);
  api.use('/users', usersRoutes);
  api.use('/tenants', tenantsRouter);
  api.use('/platform/tenants', platformTenantsRouter);
  api.use('/wallets', walletsRoutes);
  api.use('/entities', entitiesRoutes);
  api.use('/shops', shopsRoutes);
  api.use('/catalog', catalogRoutes);
  api.use('/collections', collectionsRoutes);
  api.use('/kits', kitsRoutes);
  api.use('/contacts', contactsRoutes);
  api.use('/demo-leads', demoLeadsRoutes);
  api.use('/campaigns', campaignsRoutes);
  api.use('/redemptions', redemptionsRoutes);
  api.use('/storefront', storefrontRoutes);
  api.use('/storefront/:shopId/auth', shopAuthRoutes);
  api.use('/storefront/auth', claimRedeemRouter);
  api.use('/notifications', notificationsRoutes);
  api.use('/payments', paymentsRoutes);
  api.use('/invoices', invoicesRoutes);
  api.use('/orders', ordersRoutes);
  api.use('/order-invoices', orderInvoiceRoutes);
  api.use('/support-tickets', tenantSupportRouter);
  // Platform control plane (SUPER_ADMIN_FLOW) — /api/v1/platform/*
  api.use('/platform/dashboard', platformDashboardRouter);
  api.use('/platform/products', platformProductsRouter);
  api.use('/platform/categories', platformCategoriesRouter);
  api.use('/platform/inventory', platformInventoryRouter);
  api.use('/platform/kits', platformKitsRouter);
  api.use('/platform/vendors', vendorsRoutes);
  api.use('/platform/shipments', shipmentsRoutes);
  api.use('/platform/orders', platformOrdersRouter);
  api.use('/platform/production', platformProductionRouter);
  api.use('/platform/finance', platformFinanceRoutes);
  api.use('/platform/demo-leads', platformDemoLeadsRouter);
  api.use('/platform/blog-posts', blogRoutes);
  api.use('/platform/audit-logs', platformAuditRouter);
  api.use('/platform/reports', platformReportsRouter);
  api.use('/platform/support-tickets', platformSupportRouter);
  api.use('/platform/team', platformTeamRouter);
  api.use('/platform/settings', platformSettingsRouter);
  api.use('/platform/impersonate', platformImpersonateRouter);

  app.use('/api/v1', api);

  /**
   * Zoho People OAuth + sync — mounted at /api/integrations/zoho/* so the
   * registered redirect URI can be https://shelfmerch.io/api/integrations/zoho/callback
   * (outside the /api/v1 versioned surface, matching Zoho console config).
   */
  app.use('/api/integrations/zoho', globalHttpRateLimit, zohoIntegrationsRoutes);

  /**
   * Merge.dev HRIS Link — link_token issuance only (Phase 1).
   * Mounted at /api/integrations/merge/* alongside Zoho (outside /api/v1).
   */
  app.use('/api/integrations/merge', globalHttpRateLimit, mergeIntegrationsRoutes);

  /**
   * Slack OAuth + workspace APIs (Phase 1).
   * Mounted at /api/integrations/slack/* so redirect URI can be
   * http://localhost:8080/api/integrations/slack/callback (Vite proxy) or
   * https://shelfmerch.io/api/integrations/slack/callback.
   */
  app.use('/api/integrations/slack', globalHttpRateLimit, slackIntegrationsRoutes);

  /**
   * Zoho People Connected App (externally hosted inside Zoho People / Sigma).
   * Always registered so embed headers are applied and routes return 200 even
   * before/without a full SPA build (tests). Production prefers web/dist/index.html.
   */
  const sendSpaIndex = (req, res) => {
    const indexPath = path.join(WEB_DIST, 'index.html');
    const headers = spaDocumentHeaders(req.path);
    res.set(headers);
    if (!existsSync(indexPath)) return false;
    const html = renderSpaDocument(readFileSync(indexPath, 'utf8'), req.path);
    res.status(200).type('html').send(html);
    return true;
  };
  const sendZohoConnectedAppPage = (req, res) => {
    applyZohoPeopleEmbedHeaders(res);
    if (sendSpaIndex(req, res)) return;
    return res.status(200).type('html').send(ZOHO_CONNECTED_APP_HTML_FALLBACK);
  };
  const sendZohoEmbedPopupPage = (req, res) => {
    applyZohoPeopleCoopHeaders(res);
    if (sendSpaIndex(req, res)) return;
    return res.status(200).type('html').send(ZOHO_CONNECTED_APP_HTML_FALLBACK);
  };
  app.get('/zoho/people', sendZohoConnectedAppPage);
  app.get('/zoho/people/sandbox', sendZohoConnectedAppPage);
  app.get('/zoho/people/embed-auth', sendZohoEmbedPopupPage);
  app.get('/zoho/people/oauth-bridge', sendZohoEmbedPopupPage);
  app.get('/zoho/people/oauth-done', sendZohoEmbedPopupPage);

  /** Public legal pages — full HTML (indexable without SPA bootstrap). */
  app.get('/legal/privacy-policy', sendPrivacyPolicy);
  app.get('/legal/terms-of-service', sendTermsOfService);

  /** Public Zoho People documentation — full HTML for Marketplace reviewers & customers. */
  for (const routePath of DOCS_PUBLIC_ROUTES) {
    app.get(routePath, sendDocsPage(routePath));
  }

  app.get('/blog', asyncHandler(sendBlogIndex));
  app.get('/blog/media/:id', asyncHandler(sendBlogMedia));
  app.get('/blog/:slug', asyncHandler(sendBlogArticle));

  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.length > 1 && req.path.endsWith('/') && /^\/(compare|solutions)(\/|$)/.test(req.path)) {
      const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      return res.redirect(301, `${req.path.slice(0, -1)}${query}`);
    }
    return next();
  });

  /** Published compare/solution pages only. Empty hubs stay noindex until a page is published. */
  app.get('/compare', asyncHandler(sendContentIndex('compare')));
  app.get('/compare/:slug', asyncHandler(sendContentArticle('compare')));
  app.get('/solutions', asyncHandler(sendContentIndex('solution')));
  app.get('/solutions/:slug', asyncHandler(sendContentArticle('solution')));

  /**
   * SEO: robots + sitemap index/static from apps/web/public (also copied into
   * web/dist by Vite). Catalog child sitemap is runtime from Mongo.
   * Registered before the SPA catch-all in every environment so tests and
   * production never serve index.html for these paths.
   */
  app.get('/robots.txt', sendSeoPublicFile('robots.txt'));
  app.get('/sitemap.xml', sendSeoPublicFile('sitemap.xml'));
  app.get('/sitemap-static.xml', sendSeoPublicFile('sitemap-static.xml'));
  app.get('/sitemap-catalog.xml', asyncHandler(sendCatalogSitemap));
  app.get('/sitemap-blog.xml', asyncHandler(sendBlogSitemap));
  app.get('/sitemap-compare.xml', asyncHandler(sendContentSitemap('compare')));
  app.get('/sitemap-solutions.xml', asyncHandler(sendContentSitemap('solution')));

  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
    const target = publicRedirectTarget(req.path);
    if (!target || target === req.path) return next();
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    return res.redirect(301, `${target}${query}`);
  });

  app.get('/apps/catalog/:id', asyncHandler(sendCatalogProductSeo(WEB_DIST)));

  const sendDocument = (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/') || req.path.startsWith('/email-assets/')) return next();
    if (
      req.path === '/robots.txt' ||
      req.path === '/sitemap.xml' ||
      req.path === '/sitemap-static.xml' ||
      req.path === '/sitemap-catalog.xml' ||
      req.path === '/sitemap-blog.xml' ||
      req.path === '/sitemap-compare.xml' ||
      req.path === '/sitemap-solutions.xml'
    ) {
      return next();
    }
    if (documentKind(req.path) === 'not-found') {
      return res
        .status(404)
        .type('html')
        .set('Cache-Control', 'private, no-store')
        .set('X-Robots-Tag', 'noindex, follow')
        .send(seoNotFoundHtml());
    }
    if (env.NODE_ENV === 'production' && existsSync(WEB_DIST)) {
      if (sendSpaIndex(req, res)) return;
    }
    return next();
  };

  if (env.NODE_ENV === 'production' && existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST, {
      index: false,
      maxAge: '1d',
      setHeaders(res, filePath) {
        if (filePath.endsWith(`${path.sep}index.html`)) {
          res.setHeader('Cache-Control', 'private, no-store');
        }
      },
    }));
  }
  app.get('/{*path}', sendDocument);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
