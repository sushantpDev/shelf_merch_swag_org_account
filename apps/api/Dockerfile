# ShelfMerch production image — API (+ optional BullMQ worker) serving the
# Vite SPA from apps/web/dist on the same origin.
#
# Build context is the repo ROOT so the workspace lockfile resolves:
#   docker build -f apps/api/Dockerfile -t shelfmerch/api:latest .
#
# Optional build-args (baked into the SPA at compile time):
#   --build-arg VITE_API_URL=/api/v1
#   --build-arg VITE_SHOP_REDEEM_DOMAIN=store

# ---- deps-build: full workspace install (vite/tsc need devDependencies) ----
FROM node:20-alpine AS deps-build
WORKDIR /app
# Workspace install needs the root manifest + every workspace's package.json.
# .npmrc carries legacy-peer-deps=true (see repo root) so `npm ci` resolves the
# tree the same way CI does.
COPY .npmrc package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --ignore-scripts

# ---- build-web: compile the SPA ----
FROM deps-build AS build-web
COPY apps/web ./apps/web
ARG VITE_API_URL=/api/v1
ARG VITE_USE_MOCKS=false
ARG VITE_SHOP_REDEEM_DOMAIN=store
ENV VITE_API_URL=$VITE_API_URL \
    VITE_USE_MOCKS=$VITE_USE_MOCKS \
    VITE_SHOP_REDEEM_DOMAIN=$VITE_SHOP_REDEEM_DOMAIN
RUN npm run build -w @shelfmerch/web

# ---- deps: production node_modules only ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY .npmrc package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev --ignore-scripts

# ---- runtime: minimal, non-root ----
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps/api ./apps/api
# SEO route catalog is read from source at request time (not bundled into the SPA).
COPY apps/web/src/seo ./apps/web/src/seo
# SPA assets — Express serves these when NODE_ENV=production (see apps/api/src/app.js).
COPY --from=build-web /app/apps/web/dist ./apps/web/dist
# Email preset banners are read from disk at send time (not via the SPA dist).
COPY apps/web/public ./apps/web/public
# Local-storage fallback dir must be writable by the app user.
RUN mkdir -p apps/api/uploads && chown -R app:app /app
USER app
WORKDIR /app/apps/api
EXPOSE 8080
# Container-level healthcheck (Node 20 has global fetch — no curl needed).
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Default: the HTTP API. The worker service overrides this in docker-stack.yml.
CMD ["node", "src/server.js"]
