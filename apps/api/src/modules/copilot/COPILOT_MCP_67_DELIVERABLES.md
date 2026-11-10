# Embedded Copilot — 67 MCP Tools Integration Report

## Inventory

| Kind | Count | Copilot status |
|---|---|---|
| READ (+ upload status) | 23 | Always on when Copilot enabled |
| PREPARE (+ upload prepare) | 23 | Behind per-domain write flags (default off) |
| EXECUTE | 21 | HTTP confirmation UI only — never model-visible |
| **Total** | **67** | Catalog: `copilotMcpCatalog.js` |

## Architecture

- Session JWT → `buildCopilotToolCtx` → same `*ForCaller` handlers as MCP
- Model sees READ + enabled-domain PREPARE only
- Confirm/Cancel → `POST /copilot/writes/:workflow/{prepare,execute,cancel}`
- Create Store aliases retained: `/copilot/writes/shops/create/*`

## Domain write flags (all default false)

| Flag env | Domain key |
|---|---|
| EMBEDDED_COPILOT_WRITE_STORE_CREATE | storeCreate |
| EMBEDDED_COPILOT_WRITE_STORE_UPDATE | storeUpdate |
| EMBEDDED_COPILOT_WRITE_STORE_PUBLISH | storePublish |
| EMBEDDED_COPILOT_WRITE_COLLECTIONS | collections |
| EMBEDDED_COPILOT_WRITE_SHOP_CATALOG | shopCatalog |
| EMBEDDED_COPILOT_WRITE_SHOP_CATEGORIES | shopCategories |
| EMBEDDED_COPILOT_WRITE_BUDGETS | budgets |
| EMBEDDED_COPILOT_WRITE_WALLET_TOPUP | walletTopup |
| EMBEDDED_COPILOT_WRITE_WALLET_SETUP | walletSetup |
| EMBEDDED_COPILOT_WRITE_PAYMENTS | payments (high-risk; leave off) |
| EMBEDDED_COPILOT_WRITE_SEND_POINTS | sendPoints |
| EMBEDDED_COPILOT_WRITE_SEND_KITS | sendKits |
| EMBEDDED_COPILOT_WRITE_EMPLOYEES | employees |
| EMBEDDED_COPILOT_WRITE_ENTITIES | entities |

## Status API

- `writeToolsEnabled`: any domain flag on
- `writeDomains`: boolean map of every domain key
- Discovery marks write actions available only when tools are active and the domain flag is on

## Tests run (MongoMemory / Vitest)

- copilot-mcp-catalog.test.js
- copilot-writes-registry.test.js
- copilot-writes-domains.test.js
- copilot-reads-complete.test.js
- copilot-store-create.test.js
- copilotDiscovery.test.js
- copilot.test.js
- web: CopilotStoreCreateConfirm.test.tsx

## Local safe-testing

1. Keep all EMBEDDED_COPILOT_WRITE_* flags false while MONGO_URL is Atlas
2. Run Vitest suites above (in-memory only)
3. For manual UI writes: disposable local Mongo, enable one domain flag, never shared tenants
4. Real LLM: Copilot + one write flag on safe DB; model only PREPAREs; Confirm/Cancel; EM denied where applicable

## Explicit non-claims

- Razorpay payment create/verify is wired behind EMBEDDED_COPILOT_WRITE_PAYMENTS but not production-ready
- Do not claim 67 production-ready until each domain flags are ops-reviewed
- No commit / push / deploy performed as part of this work
