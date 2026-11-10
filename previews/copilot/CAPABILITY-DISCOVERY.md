# ShelfMerch Copilot capability discovery

Implemented the supplied capability-discovery brief locally. The existing blue history sidebar, approved icon, typography, workspace shell, mobile header, composer and streaming implementation remain in place. No writes were enabled, no MCP/financial operations were changed, and nothing was committed, pushed, merged or deployed.

## Experience

- Six server-authorized categories replace the narrow prompt shortcuts: Products & Kits, Budgets & Wallet, Stores & Collections, Gifting & Rewards, Employees & Teams, Campaigns & Orders.
- Desktop uses two columns and three equal-height rows. Mobile uses one column with readable descriptions and touch targets.
- Choosing a category opens its task view within the welcome area. It never calls the model or creates a conversation.
- Available tasks fill and focus the existing composer. Users can edit before sending. No invented amounts, recipients, store names or payment details are inserted.
- “All capabilities” returns to the categories. New Chat resets category selection without deleting saved conversations. Existing conversation selection/search and streamed responses remain intact.
- Pending actions are disabled, labeled “Coming to Copilot”, and explained in ordinary customer language. They have no executable prompt in the response.
- Provider-disabled environments still support browsing and drafting. Sending remains disabled and no fake AI response is generated.
- Keyboard focus follows category navigation; pending actions are distinguished in text, not only color. Existing focus rings, contrast and reduced-motion behavior remain.

## Authoritative availability

The existing authenticated `GET /api/v1/copilot/status` response now includes an additive `discovery.categories` field. Existing fields, including legacy `capabilities` and `writeToolsEnabled: false`, remain compatible.

`copilotDiscovery.js` resolves the signed-in server identity against:

1. Existing `rolesForTenantArea` authorization utilities, using read or write access for each operation.
2. Existing `hidesOrganizationWallet` rules, including entity-scoped identities.
3. The actual embedded `COPILOT_TOOLS` allowlist, which currently contains 17 read tools.
4. An explicit write rollout gate, which remains off. Future writes require both connected embedded tools and this gate; merely existing in MCP is insufficient.

The frontend renders the returned categories/actions and never decides permissions from the user's role. It does not receive tool names or authorization logic through discovery metadata. Existing tool handlers continue to enforce tenant/entity scope when a user eventually sends a request.

Pending-operation metadata references exact tools inspected in `createShelfMerchMcp.js`. Tests verify those tool names still exist. This is evidence that an operation is implemented elsewhere, not evidence that it is connected to embedded Copilot.

Company Admins currently receive 23 available task suggestions and 11 pending suggestions across six categories, with at most six tasks in any category. Entity Managers receive 22 available and four pending suggestions, with organization-wallet/funding/allocation and store-write actions omitted. Generic employee/member roles are not newly granted Copilot access.

## Currently usable tasks

| Category | Available in embedded Copilot |
| --- | --- |
| Products & Kits | Explore products; find products within a user-specified budget; curated kits; customized kits; kit contents; product recommendations grounded in catalog inventory |
| Budgets & Wallet | Authorized department budget summaries; Admin organization-wallet balance/transactions; Entity Managers see their authorized department budgets without a separate personal wallet |
| Stores & Collections | List accessible stores; review store details and publishing readiness |
| Gifting & Rewards | Plan gifts; find inventory within a user-specified budget; review previous sends |
| Employees & Teams | Search authorized employees/contacts; view permitted employee details; view departments and their managers |
| Campaigns & Orders | Recent campaigns; campaign status/details; track an order; recent orders |

Selecting these tasks prepares a request; actual data retrieval still needs the configured provider and the user's explicit Send action.

## Awaiting embedded integration

- Department budget allocation and top-ups; organization-wallet funding: Company Admin only.
- Store creation, updates, publication, and collection drafting/publication: Company Admin only.
- Send Points, Send Kits and gifting-campaign previews: only roles permitted by existing campaign-operation authorization.
- Employee record management: only roles permitted by existing contact-write authorization, with existing entity rules still authoritative.

No write tool was added to the embedded allowlist. Prepare/execute financial and campaign code is unchanged.

Unsupported reads such as individual campaign-recipient details and a dedicated store-collection listing are not advertised as available. Existing embedded campaign reads intentionally omit recipient contact information. The UI does not imply that those data can be fetched.

## Screenshots

All are real Edge renders of `http://localhost:8080/husain/copilot`. The isolated browser harness supplies metadata from the actual server resolver, with API-shaped fixture responses for history/streaming. They are UI verification, not screenshots of live tenant data or actual model replies.

1. [Main welcome screen](welcome.png)
2. [Products & Kits selected](products-kits.png)
3. [Budgets & Wallet selected](budgets-wallet.png)
4. [Stores & Collections selected](stores-collections.png)
5. [Company Admin capabilities](company-admin-capabilities.png)
6. [Entity Manager budget capabilities](entity-manager-capabilities.png) and [store capabilities](entity-manager-stores.png)
7. [Mobile category selection](mobile-category-selection.png) and [mobile welcome](mobile-welcome.png)
8. [Provider-disabled discovery and draft](provider-disabled-discovery.png)

## Validation

- Production frontend build: passed. [Build log](frontend-build.txt). Existing warnings concern `VITE_GTM_ID` and a shared bundle exceeding 500 kB.
- Focused frontend Copilot tests: 16 passed across four files.
- Backend discovery and authenticated Copilot integration tests: 16 passed across two files, using isolated in-memory MongoDB and `--pool=threads`. This covers the real authenticated status endpoint, disabled provider, conversation scope, current read-only tool enforcement, role/scope filtering and pending-write behavior. [API test log](discovery-api-tests.txt). The default fork worker exited unexpectedly on the first attempt; the isolated thread-pool run completed successfully.
- Full existing frontend suite: 425 passed, one unrelated failure in `SeoGrowthPage.test.tsx`, which expects “Approve current version” while the existing component renders “Approve”. [Full test log](frontend-tests.txt).
- Typechecking still reports existing errors outside Copilot, in kit/swag code, shared services and Vite configuration. No Copilot diagnostics were introduced. [Typecheck log](frontend-typecheck.txt).
- Edge browser verified six categories, Products/Budget/Stores task views, pending disabled actions, editable focused drafts without automatic POST requests, role changes, restricted manager operations, category reset, mobile selection, sidebar/drawer/search behavior, Enter/Shift+Enter, streamed messages, errors/retry, deletion and provider-disabled drafting. No uncaught runtime exceptions or desktop/mobile horizontal overflow. [Browser evidence](browser-results.json).

No OpenAI inference or billable API request was used for implementation or verification.

## Files changed for this brief

- `apps/api/src/modules/copilot/copilotDiscovery.js`: new category/action metadata and server-side permission/rollout resolution.
- `apps/api/src/modules/copilot/copilot.controller.js`: additive authenticated discovery field.
- `apps/api/tests/copilotDiscovery.test.js`: resolver, MCP registry evidence, scope, authorization and future-rollout tests.
- `apps/api/tests/copilot.test.js`: status-endpoint assertions for Admin and Entity Manager discovery.
- `apps/web/src/features/copilot/api.ts`: typed discovery response, preserving the existing API client.
- `apps/web/src/features/copilot/CopilotWelcome.tsx`: category and task views, back navigation, focus and pending-state presentation.
- `apps/web/src/features/copilot/CopilotPage.tsx`: selected-category state, reset behavior and composer draft handoff.
- `apps/web/src/features/copilot/CopilotComposer.tsx`: provider-unavailable drafts remain editable; sending stays disabled.
- `apps/web/src/features/copilot/copilot.css`: scoped category/action styling and responsive behavior.
- `apps/web/src/features/copilot/CopilotWelcome.test.tsx`, `CopilotPage.test.tsx`, `discovery.testFixtures.ts`: interaction and contract examples.
- `previews/copilot-browser.mjs` and `previews/copilot/`: reproducible browser checks, screenshots and verification artifacts.

The dashboard header/sidebar, tenant layout, authentication, MCP tool implementations, financial calculations, write execution paths and database schemas were not edited for this brief. Earlier unrelated working-tree changes were preserved.

## Remaining gaps

- The clean browser redirects the live route to login. Browser role scenarios use isolated fixtures; authenticated API/RBAC behavior is separately verified with real request handlers and an in-memory database. Production data and live model/tool execution were not exercised.
- Pending writes cannot execute until their safe embedded integration is implemented. The discovery resolver already supports an explicit future rollout gate, but this change does not turn it on.
- Existing backend reads do not expose every suggested operation from the brief. Those unsupported tasks remain absent instead of being represented as working.
- If the running API process does not watch source changes, it must be restarted to serve the new status metadata. The frontend shows a useful reload state rather than inventing capabilities if it receives an old response.
- Physical-device keyboard behavior has not been tested; the existing mobile layout and composer were checked in Edge device emulation.
