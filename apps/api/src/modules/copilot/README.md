# Embedded AI Copilot

Dashboard-native assistant that reuses MCP READ handlers under the existing session JWT. It does **not** call public `/mcp` or OAuth.

## Enable (staging / local)

```env
EMBEDDED_COPILOT_ENABLED=true
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-mini
```

Leave `EMBEDDED_COPILOT_ENABLED=false` in production until product approval. Without `OPENAI_API_KEY`, the UI loads but chat returns `PROVIDER_DISABLED` (no fake AI answers).

## Auth / RBAC

- Routes: `authenticate` → `resolveTenant` → `requireTenantContext`
- Tool ctx built via `buildCopilotToolCtx(req)` (same `authInfo.extra` shape as MCP)
- Allowlisted READ tools only; WRITE/PREPARE/EXECUTE are not registered
- Entity managers still hit `hidesOrganizationWallet` / department scoping inside existing handlers

## Usage & cost

- Per-user and per-tenant daily token counters (`CopilotUsage`)
- Rough USD estimate logged for ops visibility (not billing)
- HTTP rate limits on conversation create / message send
- `CopilotAudit` records tool name, latency, ok/fail (no secrets)

## Inline attachments

`POST /copilot/attachments?kind=purchase_order|artwork|file` uploads via the authenticated session and reuses existing MCP wallet/shop ticket + storage validation.

- Purchase orders: PDF only (same as MCP PO handoff). Creates a ready `documentTicketId` without funding a wallet.
- Artwork: PNG logo rules (300 DPI, 5 MB) via shop asset tickets. Does not publish a store.
- General files: PDF/images stored as tenant documents for conversation reference only (no content analysis claim).
- Message send accepts `attachmentIds`; server resolves tenant/user ownership and never trusts client storage URLs.
- Uploads work without `OPENAI_API_KEY`; AI continuation still requires the provider.

## Create Store WRITE (local gate)

```env
EMBEDDED_COPILOT_WRITE_STORE_CREATE=true
```

Flow: PREPARE → confirmation UI → EXECUTE (reuses MCP `prepareShopCreateForCaller` / `executeShopCreateForCaller`).

- `POST /copilot/writes/shops/create/prepare`
- `POST /copilot/writes/shops/create/execute` (confirmationId + idempotencyKey)
- `POST /copilot/writes/shops/create/cancel` (rejects pending confirmation)
- Model may call `shops_prepare_create` only; execute is confirmation-UI gated
- Company admins only; entity managers are rejected by existing MCP RBAC
- Confirmed creation runs the existing create and publish services, matching the dashboard's `createShopFlow`. The final status is `live`; no second publish confirmation is required for a newly created store. The existing category requirement still applies.
- Existing stores are never resumed, reconfigured, or published by create. Same-key replay returns its original result. Confirmations prepared under the old draft-only behavior must be prepared again.
- Default `false` — do not enable against shared production data

## Compatibility

The shared `/mcp` store-create handlers use the same corrected creation behavior. No tool names, input contracts, or RBAC rules were changed.
