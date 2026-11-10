# ShelfMerch Copilot UI review

The latest capability-discovery implementation, role-aware action inventory, verification results, screenshots and files changed are documented in [CAPABILITY-DISCOVERY.md](CAPABILITY-DISCOVERY.md). The UI evolution below is retained as prior review context.

Implemented a frontend-only redesign inside the existing tenant dashboard. Tenant routing, authentication, the Copilot API client, status hook and backend files were not changed by this redesign. Following the user's updated direction, dashboard navigation is omitted while Copilot is open. On mobile, the crowded dashboard budget/profile bar is also hidden on the Copilot route and replaced with a dedicated ShelfMerch Copilot header; closing Copilot restores the normal dashboard header. Desktop dashboard chrome retains its existing behavior. No dependencies were added. Nothing was committed, pushed or deployed.

## Rounded panel update

Mobile header update: the dashboard budget/notification/profile bar no longer takes space or truncates the account name while Copilot is open. A 56px Copilot header provides the approved icon, ShelfMerch Copilot title, history toggle and close control. On very narrow screens the extra icon is hidden so the full title and controls fit. The view uses dynamic viewport height. Real Edge checks verify that the dashboard bar is hidden inside mobile Copilot and restored after closing, with no horizontal overflow. All 14 focused Copilot tests and the production build pass.

Sidebar follow-up: conversation history now uses a full-height navigation sidebar with a Copilot identity, plain New Chat and Search Chats actions, a scrollable conversation list and a dashboard return action. Toggling animates the desktop column to a 64px icon rail instead of removing it. The rail retains working expand, new-chat, search, recent-history and back actions. Search filters the already-loaded conversation titles locally; it introduces no API endpoint or pinned-chat feature. Mobile retains the accessible history drawer. [Expanded sidebar](welcome.png), [Collapsed rail](history-collapsed.png), [Saved chat search](history-search.png).

Current focused validation: all 14 Copilot tests pass, including local title filtering, restoring search results, working rail actions and search focus after expanding. The production build passes. Real Edge checks also verify the 64px collapsed width, search from the rail, Escape closing search without closing Copilot, and desktop/mobile overflow.

Typography now matches the supplied recognition-section reference: `var(--font-family-public-sans)` (Arial, Helvetica, sans-serif), 19px main conversation/welcome/composer text on desktop and 18px on mobile, with 1.65 conversation line height. Controls use 16px, supporting labels and metadata 14px, and footnotes 12px. This replaces the former 8–13px mobile text. The family also applies to the history drawer and deletion dialog. Browser checks assert Arial and the 19px/18px computed body sizes, and confirm the compact composer still grows for multiline input.

Spacing follow-up: outer padding is now 12px on desktop (previously up to 28px) and 6px on mobile. Header height is reduced from 72px to 64px, history inset spacing from 16px to 10px, and composer padding is tighter so more space is available for the conversation.

Implemented the approved Deel-inspired opening style within ShelfMerch's main content area. The panel now has 22px rounded corners, comfortable outer spacing, a full-width workspace header, compact inset conversation history, smaller suggestions and a persistent composer. The existing dashboard header and approved black launcher remain in place. The dashboard sidebar and its portaled toggle are hidden on the Copilot route; closing Copilot restores the sidebar using its saved expanded/collapsed preference. Edge browser checks explicitly verified both its absence in Copilot and restoration on the dashboard.

The panel opens with a 220ms upward slide and fade. Reduced-motion preferences disable the animation. The top-right close button returns to the workspace page that launched Copilot, preserving its query string; direct visits fall back to the dashboard. Escape closes Copilot, while Escape inside the mobile drawer or a confirmation dialog closes only that dialog.

The clipped welcome heading in the supplied ShelfMerch screenshot was caused by conversation auto-scroll also running on the welcome screen. Empty/new chats now start at scroll position zero, including on resize, while conversation replies continue to follow the latest message only when the user is near the bottom. Browser verification at 1440×768 confirms the heading remains visible and the welcome scroll position is zero.

Compared with the user's screenshot, the two sidebars no longer meet edge to edge: history is a smaller inset surface inside a distinct rounded panel. The screenshot's clipped greeting is visible, the suggestion cards are shorter, and the panel has an explicit close action. The Deel reference informed the panel framing and opening behavior; the interior retains the ShelfMerch chat workflow.

Updated previews: [Desktop panel](welcome.png), [Short desktop window](welcome-short-desktop.png), [Mobile panel](mobile-welcome.png), [Chat](chat-composer.png).

## What improved

Compared with the original components inspected before editing:

| Original UI | Implemented UI |
| --- | --- |
| Separate toolbar and two heavily bordered panels | Rounded, inset workspace panel with compact internal history and a full-width header |
| Grouped text-only capability buttons | Centered greeting and six compact icon suggestions, filtered exclusively from server capabilities |
| History titles without context | Titles, saved dates, selected state, loading/error/empty states, desktop collapse and an accessible mobile drawer |
| Fixed textarea with a separate Send button | Auto-growing multiline composer, arrow send button, keyboard support, focus treatment and responsive bottom anchoring |
| Boxed assistant responses | Readable centered transcript, distinct user bubbles, assistant identity, basic bold formatting and subtle streaming/tool indicators |
| Unhandled selection/deletion errors | Recoverable errors, editable retry drafts, duplicate-send prevention and deletion confirmation |
| Launcher visible in Copilot | Fully circular black launcher with the approved white Copilot mark and hover/focus tooltip, hidden throughout the Copilot route |
| Hardcoded light surfaces | Scoped light and dark tokens, respecting the existing `.dark` convention |

The initial comparison above is against the original components inspected. The rounded-panel update additionally follows the subsequently supplied Deel screenshots and ShelfMerch screenshot, as described above. A clean screenshot of the original implementation was not captured successfully before the initial redesign.

## Screenshots

Screenshots are real Edge renders at `http://localhost:8080/husain/copilot`, using the actual app components and dashboard shell. API responses and the authenticated session are isolated browser-only test fixtures; these are not evidence of live tenant data or live OpenAI replies. Fixture content is confined to `previews/copilot-browser.mjs` and component tests, never application runtime code.

- [Welcome](welcome.png)
- [Conversation history and selected conversation](history.png)
- [Chat and focused composer](chat-composer.png)
- [Mobile conversation](mobile.png)
- [Floating launcher on the dashboard](dashboard-launcher.png)
- [Mobile welcome](mobile-welcome.png)
- [Mobile history drawer](mobile-history.png)
- [Collapsed desktop history](history-collapsed.png)
- [Multiline composer](composer-expanded.png)
- [Streaming/tool activity](streaming.png)
- [Dark appearance](dark.png)
- [Recoverable error](error.png)
- [Deletion confirmation](delete-confirmation.png)
- [Provider unavailable](provider-disabled.png)
- [Actual unauthenticated route boundary](authentication-boundary.png)

## Verification

- `npm run build:web`: passed. Existing warnings concern an unset `VITE_GTM_ID` and a shared bundle exceeding 500 kB. [Build log](frontend-build.txt).
- `npm run test:web`: 420 passed, 1 failed, across 82 test files. The unrelated failure is `SeoGrowthPage.test.tsx`, which expects an “Approve current version” button while the component renders “Approve”. [Full test log](frontend-tests.txt).
- `npm run test -w @shelfmerch/web -- src/features/copilot`: all 11 Copilot tests passed. Coverage includes capability gating, keyboard/IME behavior, original stream integration, conversation creation/selection/reset, load errors, retry draft recovery, locking during streaming, abort on unmount, provider-disabled behavior and closing back to the page that launched Copilot.
- `npm run typecheck -w @shelfmerch/web`: fails on existing errors in kit/swag code, shared service types and Vite configuration; no diagnostics reference Copilot source files. [Typecheck log](frontend-typecheck.txt).
- Scoped ESLint execution is blocked by the existing installation: `typescript-eslint` cannot resolve `typescript`. No dependencies were changed to work around this. [Lint log](frontend-lint.txt).
- Real Edge browser: desktop 1440×960 and mobile 390×844, no horizontal overflow, no uncaught runtime exceptions. Verified desktop collapse/expand, history selection, Enter send, Shift+Enter newline, streamed reply/tool state, mobile drawer/Escape, error recovery, conversation deletion, new chat, dashboard navigation, launcher entry/hiding and disabled composer. [Browser results](browser-results.json).
- Reproduce browser checks: start the Vite frontend on port 8080, then run `node previews/copilot-browser.mjs` from the repository root. The script uses installed Microsoft Edge and a separate temporary browser profile; it does not change the app’s authentication implementation or call the AI provider.

## Files changed

Application changes are in `apps/web/src/features/copilot/` and the tenant layout:

- `apps/web/src/components/tenant/TenantLayout.tsx`: omit the dashboard sidebar only on the Copilot route, restoring it on other pages without changing its saved preference.

- `CopilotPage.tsx`: workspace composition, stream UI state, selection/deletion recovery, scroll handling and mobile drawer.
- `CopilotHistory.tsx`: new reusable history panel.
- `CopilotComposer.tsx`: new reusable auto-growing keyboard-accessible composer.
- `CopilotWelcome.tsx`: compact server-permitted suggestions and welcome hierarchy.
- `CopilotProductCards.tsx`: compact result presentation, real-image/missing-image states, price fallback and tenant-aware product links.
- `CopilotLauncher.tsx`: route-aware visibility and accessible hover/focus tooltip.
- `CopilotIcon.tsx` and `assets/copilot-black.png`: shared approved black circular icon, replacing the sparkle mark in the launcher, welcome screen, header and assistant messages.
- `copilot.css`: scoped responsive design, light/dark surfaces, focus states and reduced-motion support.
- `CopilotWelcome.test.tsx`: updated welcome/capability tests.
- `CopilotPage.test.tsx`: new interaction/integration tests.
- `CopilotComposer.test.tsx`: new keyboard/disabled-state tests.

Review artifacts are `previews/copilot-browser.mjs` and this `previews/copilot/` directory. Other modifications already present in the working tree were left intact.

## Remaining limitations

- The actual route redirects to `/login` in a clean browser profile. No authenticated live session or running API is available here, so live persistence, authorization and OpenAI/tool execution were not verified. Those backend implementations and contracts are unchanged.
- Conversation search is a local filter over the already-loaded list. There is no server-side search endpoint, full-history search, pinning, or additional navigation module.
- No voice, upload or attachment controls were introduced. Assistant formatting preserves text, line breaks and bold emphasis; it is not a full Markdown renderer.
- Dark appearance was checked by applying the existing `.dark` class. The surrounding dashboard shell retains its existing appearance.
- Native mobile keyboard behavior on a physical device has not been tested.
