# ShelfMerch Slack Terms: implementation and approval handoff

Prepared 5 November 2026 for Slack app `A0BQ4PKF22H`.

Target: `https://shelfmerch.io/legal/slack-terms-of-service`.
Implemented locally; not deployed, approved or submitted to Slack Marketplace.

## Document and design

The page follows the supplied Zoho workflow reference: a full white navigation
header, pale-blue hero, large black sans-serif/italic-serif headline, pill CTA,
Slack + ShelfMerch brand pairing and a new Slack-specific illustration. The art
is generated for this page and saved at
`apps/web/public/images/integrations/slack-terms-hero-v1.png`; it is not reused
from the Zoho page. A desktop sticky section index becomes a normal-flow index
on mobile. Permissions are shown explicitly, with
13 readable document sections, a support link, skip link, keyboard focus states
and print rules. There is no dependency on remote fonts, images or JavaScript
for the server-delivered legal content.

The custom navigation was removed. `SlackTermsOfServicePage.tsx` imports the
existing `components/landing/Header.tsx`, its shared menus and its existing
styles. The server document embeds the legal content immediately, then loads
the existing built app entry and styles when available so direct browser visits
use that same Header. With JavaScript disabled or a web build absent, the legal
document remains readable; the interactive navbar is supplied by the app.

Single wording source: `apps/api/src/static/slack-terms-content.html`.
Shared scoped styling: `apps/api/src/static/slack-terms.css`.
Both are included by Express and imported by the React page. They already fall
inside the API source directory copied by the existing Docker runtime image;
no Docker or deployment configuration change is needed for these assets.

## Verified implementation facts

These are repository findings, not an audit of Slack's live app configuration,
production security or data stores. The document reflects the current code.

| Document claims | Supporting implementation |
| --- | --- |
| OAuth requests `channels:read`, `chat:write`, `chat:write.public` | `apps/api/src/modules/integrations/slack/slack.constants.js:19`; authorize URL in `slack.service.js:67` |
| Public-channel listing and destination selection | `slack.service.js:155` and `:198`; list uses `types: public_channel` |
| Connection administration requires ShelfMerch integration write permission | `slack.routes.js:43`; tenant-bound one-time OAuth state in `slackOAuthState.service.js` and `slack.controller.js:49` |
| Workspace/enterprise/bot/installer IDs, default channel, preferences, status and timestamps are stored | `slackConnection.model.js:9`; OAuth persistence at `slack.service.js:118` |
| Bot token encrypted at rest in application-managed storage | `slack.service.js:112`; `apps/api/src/utils/tokenEncryption.js:43` uses AES-256-GCM |
| Wallet, budget, low-budget, points, kits, dispatch, delivery-issue and shop notifications | `slack.events.js:6`; actual message builders in `slackNotify.service.js:175–335` |
| Notifications can disclose staff/recipient names, financial amounts, PO/order identifiers, products and tracking details | Message field construction in `slackNotify.service.js:175–335`; actor lookup at `:73`; order enrichment at `:336` |
| Send status, event/resource/connection references, errors and timestamps are recorded | `slackNotificationReceipt.model.js:9`; receipt updates in `slackNotify.service.js:157` |
| Test messages and configurable notification preferences | `slack.service.js:236` and `:276`; frontend `slackDetailUi.ts:18` and `views/SlackMarketplaceDetailView.tsx` |
| Disconnect clears local token/channel; remote revocation is best-effort; metadata remains | `slack.service.js:350–385` |
| Notifications require connected status, token, channel and an enabled preference | `slackNotify.service.js:124` and `:369–386` |

The route inventory, scope list and outbound HTTP calls contain no slash-command,
message-history, private-message import or inbound Slack event handler. No such
functionality is advertised in the draft. No automatic cleanup on Slack uninstall
is promised. An in-flight notification can finish during a disconnect.

Slack's official scope descriptions were checked against the wording:

- [channels:read](https://docs.slack.dev/reference/scopes/channels.read/)
- [chat:write.public](https://docs.slack.dev/reference/scopes/chat.write.public/)

The repository security-hardening plan includes deferred recommendations; it is
not evidence of completed controls. The new page makes no certification,
uptime, deletion-time or comprehensive-security guarantee.

## Legal-owner decisions before publication

The page explicitly says **Draft for owner review**, assigns no effective date,
and uses `noindex, follow`. Those are deliberate review-state markers, not legal
approval. The following decisions remain open:

1. Approve the complete document, operator identity and support contact.
2. Approve acceptance/authorization wording and the mechanism by which final
   terms become binding. No new contract acceptance flow was implemented.
3. Decide the hierarchy between Slack-specific terms, platform terms, customer
   agreements and any separate data-processing agreement. No precedence rule
   or Zoho-specific commercial terms were copied into the draft.
4. Approve acceptable-use and intellectual-property provisions, including the
   rights needed to share customer-provided content through Slack.
5. Confirm data roles, legal bases, notices/consents, sharing destinations,
   retention and deletion handling. No retention duration or deletion deadline
   was invented. Disconnect does not delete metadata, notification records,
   underlying business records or messages already posted in Slack.
6. Review and separately approve Slack-specific privacy coverage. The linked
   existing `apps/api/src/static/privacy-policy.html` focuses on Zoho People,
   does not mention Slack, and contains internal review notes, including the
   retention note at line 395. It was left unchanged. The link alone does not
   resolve that disclosure gap.
7. Approve service availability and warranty wording. No SLA, support response
   time or delivery guarantee is proposed.
8. Decide suspension and termination rights, notices and treatment of existing
   agreements. Section 10 intentionally leaves contractual commitments pending.
9. Approve liability allocation, mandatory-rights carve-outs, any exclusions or
   monetary cap. Section 11 states that these require approval; it invents no cap.
10. Select governing law, dispute forum and any arbitration provision. Existing
    documents disagree about jurisdiction, so neither was copied.
11. Assign an effective date and approve future-change notice/acceptance rules.
12. After approval, authorize final wording and removal of draft markers, and
    decide whether to change the current noindex policy. Confirm the live Slack
    app's scopes and features match this repository before Marketplace submission.

These are outstanding editorial/legal decisions. This work does not constitute
legal review or mark the document suitable for contractual use.

## Routing and preservation

- Express registers the new route before SPA classification, with full HTML,
  title, description, canonical URL and draft robots metadata. GET and implicit
  Express HEAD need no authentication and perform no database or Slack calls.
- Missing document assets cause an error rather than a misleading minimal 200.
- React has a lazy public route and matching SEO metadata for client navigation.
- Existing `/terms`, `/terms-condition`, `/terms/index.html` redirects remain
  pointed at `/legal/terms-of-service`. No existing Zoho Terms content changed.
- No Slack implementation, OAuth scope, database, environment, Nginx,
  Cloudflare or Marketplace settings changed. No PR or deployment was created.
- The new draft is intentionally not added to the public sitemap or global footer
  before owner approval. Its exact target URL is available for local review.

## File inventory

Created:

- `apps/api/src/modules/legal/slackTerms.controller.js`
- `apps/api/src/static/slack-terms-content.html`
- `apps/api/src/static/slack-terms.css`
- `apps/web/src/features/legal/SlackTermsOfServicePage.tsx`
- `docs/slack-terms-review.md`
- `previews/slack-terms-server.mjs`
- `previews/verify-slack-terms.mjs`
- Five PNG screenshots listed in the verification section below.

Modified:

- `apps/api/src/app.js`: imports and mounts the public server handler.
- `apps/web/src/app/router.tsx`: adds the lazy public React route.
- `apps/web/src/seo/publicPages.json`: adds matching title, description,
  canonical URL and draft robots metadata.
- `apps/api/tests/public-terms-routing.test.js`: tests the new route for both
  methods and User-Agents and adds it to public-route regression coverage.
- `apps/api/tests/spa-document.test.js`: verifies public classification,
  canonical URL and draft robots metadata for client navigation.

## Verification

Focused command, from `apps/api`:

```text
node ../../node_modules/vitest/vitest.mjs run --config vitest.docs.config.js tests/public-terms-routing.test.js tests/terms-of-service.test.js tests/spa-document.test.js
```

Result: **43 tests passed** across three files. Tests cover unauthenticated GET
and HEAD for the new route with browser and Slackbot-like User-Agents, complete
HTML content and metadata, existing Terms redirects, existing canonical Zoho
Terms, homepage, privacy, existing workspace root/child routes, missing
workspaces and genuine unknown-route 404s. Tenant existence, unrelated OAuth
initialization and rate limiting use isolated test mocks; no live database is
queried or modified by this suite.

Production web build passed. The existing bundle-size warning remains.

Local browser checks:

```text
node previews/slack-terms-server.mjs
node previews/verify-slack-terms.mjs
```

The preview server is isolated from API startup, credentials, databases and
workers. It serves the actual new controller and built assets. The preview-only
`?spa=1` switch serves the built shell to exercise the actual React route as well.
It is not a production application setting.

Headless Edge verified both render paths at 1440, 1024, 768, 390 and 320 pixels:
all 13 sections match the authored content, images load, metadata is correct,
anchors exist and there is no horizontal overflow. Section navigation was
checked on desktop. With page JavaScript disabled, all 13 server document
sections remain present and rendered. App scripts enhance navigation but are
not needed to display the legal text. Exactly one shared Header is verified
after app startup, and its existing mobile drawer opens and closes correctly.

The existing app-wide cookie-preferences dialog appears on a fresh app visit;
the browser check closes it without storing a consent choice. The direct static
legal response now loads the same app entry after delivering its content. No
cookie-preference implementation or saved choice was changed.

Screenshots are retained in `previews/slack-terms-server-1440.png`,
`slack-terms-server-390.png`, `slack-terms-react-1440.png`,
`slack-terms-react-390.png` and `slack-terms-permissions-1440.png`.

## Remaining deployment checks

Obtain legal-owner decisions above before publishing final Terms. Then, after a
separately authorized deployment, repeat GET and HEAD on apex/www, inspect final
URLs, verify full content without JavaScript, and retest representative tenant
and existing legal routes. Confirm canonical metadata and actual live Slack
configuration. Changing Slack Marketplace's Terms URL and submitting app
`A0BQ4PKF22H` for review remain separate, explicitly authorized steps.
