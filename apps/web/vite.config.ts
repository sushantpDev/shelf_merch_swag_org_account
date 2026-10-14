import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { createReadStream, existsSync, statSync } from "node:fs";
import { loadEnv, type Plugin } from "vite";
import catalog from "./src/seo/publicPages.json";
import { applySpaSeo, resolveSpaSeo } from "../api/src/modules/seo/resolvePublicSeo.js";

const REPO_ROOT = path.resolve(__dirname, "../..");
const API_UPLOADS_DIR = path.resolve(__dirname, "../api/uploads");
const UPLOAD_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

/** Serve uploaded artwork from the API disk store in dev (no API proxy hop). */
function devUploadsPlugin(): Plugin {
  return {
    name: "dev-api-uploads",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/uploads/")) return next();

        const rel = decodeURIComponent(url.slice("/uploads/".length));
        const file = path.normalize(path.join(API_UPLOADS_DIR, rel));
        if (!file.startsWith(API_UPLOADS_DIR)) return next();
        if (!existsSync(file) || !statSync(file).isFile()) return next();

        const ext = path.extname(file).slice(1).toLowerCase();
        res.setHeader("Content-Type", UPLOAD_MIME[ext] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
  };
}

/**
 * Strip GTM snippets from index.html when VITE_GTM_ID is unset/empty so local
 * and non-production builds do not load Tag Manager. When the ID is set, Vite's
 * built-in %VITE_GTM_ID% HTML replacement injects the container ID.
 */
function conditionalGtmPlugin(envDir: string): Plugin {
  let gtmId = "";
  return {
    name: "conditional-gtm",
    configResolved(config) {
      const env = loadEnv(config.mode, envDir, "VITE_");
      gtmId = (env.VITE_GTM_ID || "").trim();
    },
    transformIndexHtml(html) {
      if (gtmId) return html;
      return html
        .replace(/<!-- Google Tag Manager -->[\s\S]*?<!-- End Google Tag Manager -->\s*/g, "")
        .replace(
          /<!-- Google Tag Manager \(noscript\) -->[\s\S]*?<!-- End Google Tag Manager \(noscript\) -->\s*/g,
          "",
        );
    },
  };
}

/** Per-request head tags in dev. Production Express rewrites the same shell per path. */
function spaSeoPlugin(): Plugin {
  return {
    name: "spa-seo",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        const requestPath = ctx.originalUrl || ctx.path || "/";
        return applySpaSeo(html, resolveSpaSeo(catalog, requestPath));
      },
    },
  };
}

/** Allow long-running proxied API calls (Shopify import) without idle socket cuts. */
function longRunningProxyPlugin(): Plugin {
  return {
    name: "long-running-proxy",
    configureServer(server) {
      server.httpServer?.once("listening", () => {
        const httpServer = server.httpServer;
        if (!httpServer) return;
        httpServer.requestTimeout = 0;
        httpServer.headersTimeout = 0;
        httpServer.timeout = 0;
      });
    },
  };
}

// Plain Vite SPA — builds to static assets (dist/) for static hosting.
// The router plugin must run before the React plugin.
export default defineConfig({
  envDir: REPO_ROOT,
  plugins: [
    react(),
    tailwindcss(),
    devUploadsPlugin(),
    conditionalGtmPlugin(REPO_ROOT),
    spaSeoPlugin(),
    longRunningProxyPlugin(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 8080,
    // Shopify catalog import can run many minutes (per-product Admin + storefront calls).
    // Node's default request/socket timeouts (~2–5 min) otherwise close the proxied
    // connection and the browser reports net::ERR_EMPTY_RESPONSE.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
        configure: (proxy) => {
          proxy.on("proxyReq", (_proxyReq, req) => {
            req.setTimeout(0);
          });
        },
      },
      "/uploads": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
        configure: (proxy) => {
          proxy.on("proxyReq", (_proxyReq, req) => {
            req.setTimeout(0);
          });
        },
      },
      "/compare": { target: "http://127.0.0.1:3001", changeOrigin: true },
      "/solutions": { target: "http://127.0.0.1:3001", changeOrigin: true },
      "/sitemap-compare.xml": { target: "http://127.0.0.1:3001", changeOrigin: true },
      "/sitemap-solutions.xml": { target: "http://127.0.0.1:3001", changeOrigin: true },
    },
  },
  test: {
    // Node, not jsdom: jsdom 30 pulls undici, which throws
    // `webidl.util.markAsUncloneable is not a function` on Node 20 (GitHub Actions).
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    css: false,
    pool: "forks",
    maxWorkers: 1,
  },
});
