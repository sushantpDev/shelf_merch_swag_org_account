# Staging MCP OAuth rollout

This is the first-connection procedure for `https://staging.shelfmerch.io`. It does not deploy production. Do not run it against `https://shelfmerch.io` or `http://72.62.76.198:8080`. On 30 October 2026 those two URLs were the same Node process. Staging was a different process behind Cloudflare.

No live ChatGPT session has been run.

## Prerequisites

- The staging checkout is the process whose `GET /api/v1/health` uptime does not match `https://shelfmerch.io/api/v1/health`.
- `NODE_ENV=production` on that process, which is how `ecosystem.config.cjs` starts it.
- Staging MongoDB is a different database name from production. The API logs that name at startup and does not log the connection string.
- Staging Redis is up. Both public health checks reported `redis: up` on 30 October 2026. Confirm the staging process still does.
- The server can open outbound HTTPS to `https://chatgpt.com/oauth/client.json` and `https://chatgpt.com/oauth/jwks.json`.
- Port 8080 on `72.62.76.198` is reachable from the public internet today. Firewall the staging origin so only Cloudflare can reach the Node port before the ChatGPT test.
- `deploy/docker-stack.yml` and `deploy/haproxy.cfg` use placeholder addresses. They are not the live topology. The live launcher in this repo is PM2 via `deploy/setup.sh` and `ecosystem.config.cjs` (one fork per process).

## Environment names

Set these on the staging process only. Values stay in the server `.env`. Do not commit them and do not paste them into chat.

| Name | Staging value |
| --- | --- |
| `MCP_OAUTH_ISSUER` | `https://staging.shelfmerch.io` |
| MCP resource | Derived as `https://staging.shelfmerch.io/mcp`. There is no `MCP_RESOURCE_URL` variable. |
| `MCP_OIDC_JWKS` | Private JWKS JSON shared by every staging replica |
| `MCP_OIDC_COOKIE_SECRET` | Unique secret, 32 characters or more |
| `MCP_ALLOW_LEGACY_JWT` | `false` |
| `APP_URL`, `BASE_URL`, `CLIENT_URL` | `https://staging.shelfmerch.io` |
| `CORS_ORIGINS` | `https://staging.shelfmerch.io` |
| `TRUST_PROXY` | `1` while Cloudflare connects directly to Node |

`NODE_ENV=production` ignores `MCP_ALLOW_LEGACY_JWT`, so a ShelfMerch application JWT cannot call `/mcp`.

## Secret provisioning

Run on the staging server. Do not print the files.

```bash
openssl rand -base64 48 > mcp-oidc-cookie-secret.txt
chmod 600 mcp-oidc-cookie-secret.txt

node --input-type=module <<'EOF'
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = privateKey.export({ format: 'jwk' });
jwk.kid = 'shelfmerch-mcp-staging-1';
jwk.alg = 'RS256';
jwk.use = 'sig';
writeFileSync('mcp-oidc-jwks.json', JSON.stringify({ keys: [jwk] }), { mode: 0o600 });
EOF
```

Put the cookie file contents into `MCP_OIDC_COOKIE_SECRET`. Put the JWKS file contents into `MCP_OIDC_JWKS` as one line. Store both in the same secret manager used for staging JWT secrets, separate from production. Delete the shell history entry if the shell recorded the file contents. The files are gitignored.

Generate new `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` the same way when the current staging values were copied from production. Compare only SHA-256 prefixes of the two servers. Do not print the secrets.

```bash
node -e "const c=require('crypto'); const v=process.env.JWT_ACCESS_SECRET||''; console.log(c.createHash('sha256').update(v).digest('hex').slice(0,12), v.length)"
```

## Database

Do not point staging `MONGO_URL` at the production database. After boot, the log line `MongoDB connected` includes `db`. Confirm that name differs from production.

OAuth indexes are created by the application, not by a migration against production:

- `oidc_payloads`: unique `{model,id}`, sparse `{model,uid}`, `{model,userCode}`, `{model,grantId}`, and a TTL index on `expiresAt`. Created on the first adapter write.
- `oauth_grant_bindings`: unique `grantId`, indexes on `userId` and `tenantId`. Mongoose builds these on connect (`autoIndex` stays on).
- `oauth_consent_submissions`: TTL on `createdAt`.

Do not run `apps/api/src/scripts/clear-test-database.js` as part of this rollout. It deletes every document in `shelfmerch_test`.

## Build and deploy

From the staging checkout only:

```bash
git status
node -e "const u=process.env.MONGO_URL||process.env.MONGODB_URI||''; const parts=u.split('/'); console.log((parts[3]||'').split('?')[0]||'(none)')"

export VITE_API_URL=/api/v1
npm ci
npm run build

pm2 start ecosystem.config.cjs
pm2 save
```

Use `pm2 reload ecosystem.config.cjs --update-env` when the staging process is already running. Reload one app name that you have confirmed is staging, not `shelfmerch-api` on the production checkout.

Boot calls `getOidcProvider()`. A missing HTTPS issuer, a JWKS without a private key, or a short cookie secret exits before the process listens.

Startup logs `oauthIssuer` and `mcpResource`. They must be `https://staging.shelfmerch.io` and `https://staging.shelfmerch.io/mcp`.

## Public checks

```bash
curl -sS -D - -o /dev/null https://staging.shelfmerch.io/.well-known/oauth-protected-resource/mcp
curl -sS https://staging.shelfmerch.io/.well-known/oauth-authorization-server
curl -sS https://staging.shelfmerch.io/.well-known/openid-configuration
curl -sS -o /dev/null -D - https://staging.shelfmerch.io/jwks
curl -sS -o /dev/null -D - -X POST https://staging.shelfmerch.io/token
curl -sS -o /dev/null -D - -X POST https://staging.shelfmerch.io/token/revocation
curl -sS -o /dev/null -D - https://staging.shelfmerch.io/oauth/consent
curl -sS -o /dev/null -D - -X POST https://staging.shelfmerch.io/mcp
```

Expect:

- Protected-resource metadata `resource` is `https://staging.shelfmerch.io/mcp` and `scopes_supported` is `catalog:read`.
- Authorization metadata has `issuer` `https://staging.shelfmerch.io`, `client_id_metadata_document_supported` true, `authorization_response_iss_parameter_supported` true, `code_challenge_methods_supported` `["S256"]`, `token_endpoint_auth_methods_supported` `["none","private_key_jwt"]`, scopes containing `catalog:read` and `openid`, and no `registration_endpoint`.
- `/jwks` returns a public key with `kid` `shelfmerch-mcp-staging-1` and no private `d` field.
- `POST /token` and `POST /token/revocation` are not HTML.
- `POST /mcp` without a token is 401 and includes `WWW-Authenticate` with `resource_metadata="https://staging.shelfmerch.io/.well-known/oauth-protected-resource/mcp"`.
- `GET /oauth/consent` is the SPA shell (`id="root"`), not the SEO 404 page and not a 401.
- `cf-cache-status` is `DYNAMIC` or `BYPASS` on every OAuth and MCP response.

Add a Cloudflare cache rule for `staging.shelfmerch.io` paths `/.well-known/*`, `/auth`, `/token`, `/jwks`, `/mcp`, and `/oauth/*`: Cache eligibility Bypass. The repo nginx file is not on this HTTPS path. On 30 October 2026, port 80 on `72.62.76.198` returned nginx 404 and did not proxy to Node.

## Browser consent

1. Open `https://staging.shelfmerch.io/oauth/consent` while logged out. The page must load and send the browser to `/login?return=/oauth/consent`.
2. Sign in with a staging user. The consent screen must show the workspace list and `catalog:read`.
3. In the browser devtools, the interaction cookies `sm_oauth_interaction` and `sm_oauth_session` must be `Secure`, `HttpOnly`, `SameSite=Lax`, and path `/oauth/consent`.
4. Allow one staging workspace. The redirect back to the client must include `iss=https://staging.shelfmerch.io`.
5. Disconnect from the product grants API, then call `/mcp` again. The call must fail because the grant is gone.

Use a staging user in a staging workspace. Do not use a production customer account.

## Signing keys

Backup `MCP_OIDC_JWKS` and `MCP_OIDC_COOKIE_SECRET` with the other staging secrets before the first token is issued.

Rotation:

1. Generate a second private JWK with `kid` `shelfmerch-mcp-staging-2`.
2. Set `MCP_OIDC_JWKS` to `{"keys":[<new key>,<old key>]}`.
3. Reload the staging process. New access tokens use the first key. Old access tokens still verify until they expire (15 minutes).
4. After 15 minutes, remove the old key and reload.
5. Refresh tokens are stored in MongoDB. They keep working and mint new access tokens with the current key.
6. Rotating `MCP_OIDC_COOKIE_SECRET` drops in-progress consent cookies. It does not revoke grants.

Recovery: restore the previous `MCP_OIDC_JWKS`. If the private key is lost, outstanding access tokens fail verification. Users reconnect. Do not generate a replacement and leave the old `kid` in place with a new key.

## Rollback

On the staging checkout:

```bash
git checkout --detach <previous-staging-sha>
export VITE_API_URL=/api/v1
npm ci
npm run build
pm2 reload <staging-app-name> --update-env
```

Restore the previous staging `.env` from the secret-manager copy taken before this change. Reload again. Confirm `https://staging.shelfmerch.io/api/v1/health` is ok and `https://shelfmerch.io/api/v1/health` uptime was not reset.

If boot fails after the OAuth env is added, the process exits before listen. Fix the env or restore the previous `.env` and reload. Do not point the issuer at localhost to force a boot.

## Live ChatGPT checklist

Do this only after the public checks pass.

1. In ChatGPT, add the MCP server URL `https://staging.shelfmerch.io/mcp`.
2. Confirm the connector shows the stable client `https://chatgpt.com/oauth/client.json` and redirect `https://chatgpt.com/connector_platform_oauth_redirect`. If it shows a callback id, that path is already accepted when the metadata document lists it.
3. Connect. Sign in with the staging user and allow one staging workspace.
4. Run `catalog_search` from ChatGPT.
5. Disconnect inside ShelfMerch and confirm the next ChatGPT tool call fails.
6. Record the result. A passing local test is not this step.
