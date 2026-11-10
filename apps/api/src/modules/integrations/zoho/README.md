# Zoho People integration

Secure OAuth connection between ShelfMerch tenants and Zoho People (India DC).

## Redirect URI

Vite (`:8080`) proxies `/api` → Express (`:4000`), so local OAuth callbacks must use:

`http://localhost:8080/api/integrations/zoho/callback`

Production:

`https://shelfmerch.io/api/integrations/zoho/callback`

Register **both** in Zoho API Console. `ZOHO_REDIRECT_URI` must match one of them exactly (no trailing slash). Auth and token exchange use that identical string via `URLSearchParams`.

1. Create a Zoho API client in the [Zoho API Console](https://api-console.zoho.in/) (India).
2. Set the authorized redirect URI exactly to:

   `https://shelfmerch.io/api/integrations/zoho/callback`

   For local development use your tunnel/public URL with the same path.
3. Add these variables to the repo-root `.env` (see `.env.example`):

```env
ZOHO_CLIENT_ID=
ZOHO_CLIENT_SECRET=
ZOHO_REDIRECT_URI=https://shelfmerch.io/api/integrations/zoho/callback
ZOHO_ACCOUNTS_URL=https://accounts.zoho.in
TOKEN_ENCRYPTION_KEY=
```

Generate an encryption key:

```bash
openssl rand -hex 32
```

4. Restart the API (`npm run dev` from the monorepo root, or the API app).
5. Sign in as a **company admin** and open **Integrations** (`/app/integrations`).

## Routes

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/integrations/zoho/status` | company admin / entity manager |
| POST | `/api/integrations/zoho/bridge` | company admin (sets HttpOnly bridge cookie) |
| GET | `/api/integrations/zoho/connect` | company admin → Zoho consent |
| GET | `/api/integrations/zoho/callback` | public (state-validated) |
| POST | `/api/integrations/zoho/sync-employees` | company admin |
| DELETE | `/api/integrations/zoho/disconnect` | company admin |

Tokens are encrypted at rest (AES-256-GCM) and never returned to the React app.

People API calls use the **People product host** derived from OAuth `location`
(e.g. `https://people.zoho.in`), not OAuth `api_domain` (`https://www.zohoapis.in`).
`api_domain` is stored for debugging / DC inference only.

Organisation probe: `GET {peopleBaseUrl}/api/v3/organization`

## Test instructions

Unit + integration tests (API):

```bash
cd apps/api
npm test -- zoho-unit.test.js zoho-integration.test.js
```

Manual smoke test:

1. Configure Zoho env vars and restart the API.
2. As company admin, click **Connect Zoho People**.
3. Approve scopes on Zoho; you should land on `/dashboard/integrations?zoho=connected` (redirects to `/app/integrations`).
4. Confirm organisation name and **Connected** badge.
5. Click **Sync Employees** and verify contacts appear with `source: hris`.
6. **Disconnect** revokes the Zoho refresh token (best effort), clears local tokens even if revoke fails, and returns **Not connected**. Imported contacts and orders stay.
