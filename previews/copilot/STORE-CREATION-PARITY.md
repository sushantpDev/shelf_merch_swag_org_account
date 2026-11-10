# Store creation parity correction — 10 November 2026

The discrepancy was verified before implementation with an isolated MongoDB replica-set fixture and real authenticated dashboard API calls, plus the shared MCP handler used by Copilot. No existing tenant database was inspected or changed.

## Evidence and authoritative behavior

`apps/web/src/features/shops/controllers/useCreateShopController.ts` calls `createShopFlow` in `apps/web/src/services/api-bridge.ts`. That flow sends `POST /shops`, then immediately sends `POST /shops/:id/publish`, returning the publish response. The dashboard therefore finishes creation as Live, despite the intermediate Draft record.

The baseline fixture passed with these actual response/database assertions:

| Path | Create response / persisted status | Final response / persisted status |
| --- | --- | --- |
| Dashboard | draft | live after the publish endpoint |
| MCP / Copilot, before correction | draft | draft |
| MCP / Copilot, after correction | draft internally | live after existing publish service |

`createShop` uses the Shop model's Draft default. `publishShop` owns the Live transition, enforces at least one category and schedules the existing shop-launch notification. The MCP handler previously stopped after `createShop`, asserted Draft, described a separate publish confirmation, and the frontend hardcoded “saved as a draft.” This was a real execution discrepancy, not just hidden dashboard status.

## Correction

- Confirmed MCP/Copilot creation now calls `createShop` followed by `publishShop`, using the same services as dashboard creation. No direct Live assignment, model-default change, publishing-rule change, schema migration or bulk update.
- Prepare is side-effect free and previews the final Live outcome. The confirmation card explicitly discloses creation and publishing before Confirm. The model cannot execute directly; existing user confirmation and company-admin RBAC remain.
- Default and custom categories, currency, logo URLs/upload tickets and banner configuration remain intact. Empty categories fail before creation using the existing publishing requirement/error.
- Existing stores (Draft or Live) are rejected by creation, instead of automatically updating/resuming an existing Draft. Same-key execution replay still returns its original result without a duplicate store.
- Reconciliation only accepts a matching Live result linked to the creation claim; an incomplete Draft is not silently published by recovery.
- A server-internal creation-behavior marker participates in the existing confirmation hash. A confirmation prepared under the old Draft-only behavior cannot authorize publishing; prepare it again. Public tool names/input contracts remain unchanged.
- Removed Draft-only creation descriptions and success copy. New Live results offer View Store and Manage Store without a second Publish prompt. Genuine publishing of an explicitly selected existing Draft remains supported separately.

## Files changed for this correction

Production:
- `apps/api/src/modules/mcp/shopsWrite.js` — orchestration, descriptions, confirmation effect binding, safe duplicate/recovery behavior.
- `apps/api/src/modules/copilot/copilotChat.service.js` — correct model guidance for dashboard-equivalent creation.
- `apps/web/src/features/copilot/CopilotPage.tsx` — confirmation handoff wording.
- `apps/web/src/features/copilot/CopilotConfirmationCard.tsx` — disclose publish effect before confirmation.
- `apps/web/src/features/copilot/writeSuccess.ts` — status-driven success copy and View Store action.

Tests/documentation:
- `apps/api/tests/shop-create-parity.test.js` (new) — API/database parity for Points and INR, preserved configuration, empty-category rule, unchanged existing records, legacy confirmation rejection.
- `apps/api/tests/copilot-store-create.test.js` — authenticated Copilot creation expects Live.
- `apps/api/tests/mcp-shops-write.test.js` — MCP Live outcome, replay, duplicate prevention.
- `apps/api/tests/mcp-shops-create-lifecycle.test.js` — Live creation with optional branding and secure upload behavior; removed redundant create-then-publish sequence from creation tests.
- `apps/web/src/features/copilot/CopilotStoreCreateConfirm.test.tsx` — current Live response fixtures.
- `apps/web/src/features/copilot/CopilotStoreUx.test.tsx` — Live creation success, View Store, no extra workflow.
- `apps/api/src/modules/copilot/README.md` — document shared MCP/Copilot behavior.
- This report and verification logs in `previews/copilot/`.

Dashboard source, Shop model/service, publishing endpoint, logo artwork, currency calculations, MCP write-safety implementation and unrelated working-tree changes were preserved.

## Verification

- Baseline evidence test: 1 passed before production edits, demonstrating dashboard final Live versus MCP final Draft.
- API suite: **49 passed / 6 files**. Includes parity, authenticated Copilot creation, MCP write/lifecycle, existing-store update/publish, and publish-rule tests. `STORAGE_DRIVER=local` was set for the test process; MongoDB uses the isolated test replica set. No model calls.
- Copilot frontend suite: **48 passed / 9 files**.
- Final confirmation/store-UX recheck after disclosure wording: **7 passed / 2 files**.
- Frontend build: passed. Existing GTM placeholder and shared-bundle-size warnings remain.
- `git diff --check`: passed; only existing line-ending notices outside this correction.

Logs: [API](store-parity-tests.txt), [Copilot UI](store-parity-web-tests.txt), [final confirmation checks](store-parity-confirmation-tests.txt), [build](store-parity-build.txt).

## Limits

Like the dashboard, creation and publishing are sequential operations. If publishing fails after persistence, the operation reports failure and may leave a Draft. Recovery does not automatically publish that record; an administrator must explicitly review it. No existing Drafts were migrated. This correction is verified against isolated fixtures, not production records or a live AI provider.

Nothing committed, pushed or deployed.

