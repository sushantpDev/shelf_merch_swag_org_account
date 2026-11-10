# Terms routing and legal-owner review

Prepared 5 November 2026. Slack app: `A0BQ4PKF22H`.

Selected canonical URL: `https://shelfmerch.io/legal/terms-of-service`.
This is the existing public document, not a newly approved legal document.
No legal text was removed, rewritten, approved, or published by this change.

## Internal notes requiring approval

The static HTML and React legal page duplicate the document. Each row identifies
the start of the internal note in both files; approve the underlying clause and
replacement wording before removing its note from either copy.

Static source: `apps/api/src/static/terms-of-service.html`.
React source: `apps/web/src/features/legal/TermsOfServicePage.tsx`.

| Section / issue explicitly marked in the document | Static line | React line |
| --- | ---: | ---: |
| 1: Contract hierarchy and incorporation of privacy terms | 285 | 56 |
| 6: Data processing / DPA wording | 354 | 149 |
| 10: GST, invoicing and late-payment interest | 391 | 209 |
| 11: Risk of loss and international Incoterms | 400 | 221 |
| 12: Statutory consumer rights | 411 | 235 |
| 14: IP assignment and licence scope | 431 | 257 |
| 17: Notice periods and data export on exit | 459 | 286 |
| 18: Warranty exclusions | 468 | 296 |
| 19: Liability cap and exclusions (marked essential) | 481 | 312 |
| 20: Mutual versus one-way indemnity and procedure | 491 | 325 |
| 21: Forum, exclusive jurisdiction and arbitration (marked essential) | 499 | 335 |
| Closing disclaimer: product-facing template; qualified Indian lawyer review before publication / contracting | 519 | 366 |

The separate marketing source, `apps/web/src/features/marketing/pages/terms.html:36`,
also calls itself a practical business draft/template requiring counsel review.
It is retained unchanged, but the routing repair redirects its former public
route to the canonical document.

No literal TODO, TBD, FIXME, insertion prompts, or bracketed text placeholders
were found in the three document sources. The review instructions and template
disclaimers above remain unresolved editorial content.

## Decisions for the legal owner

- Confirm the canonical document is the policy intended for ShelfMerch's Slack app.
  The introduction and integration clauses explicitly mention Zoho People, and
  there is no Slack-specific section. Decide whether the general integration
  wording is sufficient; do not infer approval from a successful HTTP response.
- Reconcile the retained marketing draft with the canonical document. The draft
  names Hyderabad courts (marketing source line 31), while the canonical text
  names Bengaluru courts (static line 497 / React line 332). Their liability
  limits also differ: affected-order payments in the marketing draft (line 30)
  versus 12 months of service payments, or INR 1,000 if none, in the canonical
  document (static lines 476–478 / React lines 306–308).
- Confirm the intended effective date. The canonical document says 30 July 2026;
  the marketing draft says 17 August 2026. The routing repair does not change dates.
- Approve final wording for every flagged clause, the company/contact details,
  and removal or replacement of both closing draft disclaimers. Synchronize the
  static and React documents only after explicit approval.

## Routing changes and release boundaries

- Express permanently redirects `/terms`, `/terms-condition` and
  `/terms/index.html` to the canonical path, including trailing-slash aliases.
  Existing redirect middleware preserves query strings.
- `terms-condition` is reserved from backend workspace-slug detection. Other
  tenant classification and unknown-route handling are unchanged.
- React aliases and the public footer use the canonical path. SEO metadata now
  explicitly recognizes the canonical legal route during client navigation.
- No database, environment, Nginx, Cloudflare or Slack settings were changed.
  No deployment or PR was created.

## Validation and remaining release work

The dedicated Express regression suite uses a fixture SPA shell, a mocked tenant
existence query, and mocks for unrelated OAuth initialization and API rate limiting.
It does not connect to MongoDB or Redis. It checks unauthenticated GET and HEAD
requests with browser and Slackbot-like User-Agents, redirects and query strings,
static canonical content, homepage/privacy responses, existing workspace root
and child routes, missing workspaces, and genuine unknown-route 404s.

Run the focused checks from `apps/api`:

```text
npx.cmd vitest run --config vitest.docs.config.js tests/public-terms-routing.test.js tests/terms-of-service.test.js tests/spa-document.test.js
```

These are local HTTP handler tests, not verification of deployed proxy behavior,
real tenant data, browser rendering, or Slack's actual checker infrastructure.
After legal approval and a separately authorized deployment, repeat public GET
and HEAD checks on both apex and www hostnames, verify redirect chains and actual
Terms content without JavaScript, then update/resubmit the Slack listing only
with authorization. A 301 can be cached by clients, so keep the destination stable.

Validation on 5 November 2026: all 39 focused tests passed; the production web
build passed (warnings about an unset VITE_GTM_ID and bundle size). The web
typecheck failed in unchanged kit, swag, API service and Vite configuration files;
none of its reported diagnostics identified a file edited by this routing patch.

Packaging risk: `apps/api/src/modules/legal/termsOfService.controller.js:20`
returns only a minimal fallback document with status 200 if the static HTML is
missing. Verify the deployed artifact contains the full document and section text;
checking HTTP status alone would not detect that failure.

The routing patch makes the already-public draft document easier to reach. Legal
approval remains required before publishing revised Terms or treating the current
document as reviewed for Marketplace use.
