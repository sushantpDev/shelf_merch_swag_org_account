# ShelfMerch SEO content and distribution pilot

Prepared: 29 October 2026. This file describes the original offline content pilot. The subsequently implemented application engine is documented in [RUNTIME.md](RUNTIME.md); its live Search Console and read-only tracking findings are in [TRACKING-AUDIT-2026-10-29.md](TRACKING-AUDIT-2026-10-29.md). No production deployment or publication was performed.

## Business brief

ShelfMerch serves enterprises. The primary conversion is a booked demo. The owner described this workflow in this conversation:

1. A prospect books a demo.
2. ShelfMerch creates a company admin and assigns a company budget.
3. The company creates entity managers and allocates budgets to them.
4. Managers create stores with catalog products or send kits.
5. Managers distribute employee points from their allocated budgets.
6. Employees visit a store and redeem points for merchandise.
7. ShelfMerch's super admin receives and processes orders.

Use customer-facing language such as "ShelfMerch processes orders" instead of internal role names in marketing copy. Use "entity manager" where explaining responsibilities, with a plain-language definition. Do not imply each entity must be a department; the business can confirm its organizational setup.

Recommended readers: HR/People teams, procurement, finance, workplace operations, and enterprise program owners. These personas are a recommendation, not a confirmed customer segmentation study.

Confirmed in this conversation: global SEO audience, Instagram and Facebook, existing custom blog CMS, and no Arvow setup. Arvow is optional future work. Blotato setup, exact connected accounts, and final brand voice remain unconfirmed. Voice is provisionally direct, practical, and enterprise-focused. No retrieved writing was treated as proof of a product capability. Global audience targeting does not establish worldwide service or delivery coverage.

## Files

- `keyword-plan.csv`: 12 prioritized titles, intent, cluster, supporting keywords, and available US estimates.
- `content-plan.md`: publishing sequence, briefs, internal links, quality controls, and measurement.
- `articles/01-company-swag-store.md`: flagship store and points guide.
- `articles/02-corporate-gifting-budget.md`: budget planning and responsibility guide.
- `articles/03-employee-welcome-kits.md`: kits versus employee choice guide.
- `social-drafts.json`: two Instagram and two Facebook captions per drafted article, plus visual briefs.
- `automation.md`: Arvow ingestion, native CMS mapping, RSS, approvals, and Blotato contracts.
- `editorial-manifest.json`: actual draft metadata and explicit release holds.
- `release-queue.json`: empty by design; no unapproved or incomplete posts.
- `regional-keyword-estimates.csv`: US, UK, and India observations for a sample of global English-language demand.
- `build-drafts.mjs`: local, network-free exporter that validates native CMS draft payloads using the current application validator.
- `generated/`: CMS draft payloads and a validation summary produced by the exporter.
- `VALIDATION.md`: passed checks and the exact limits of local verification.

Run the offline exporter from the repository root:

```powershell
node docs/seo-content-engine/build-drafts.mjs
```

It neither calls APIs nor reads credentials. Generated CMS payloads create drafts if later submitted through an authorized session; they do not publish articles. They contain no fabricated image URLs or account IDs.

## Research summary

The initial opportunity is content that explains the complete enterprise operating model: company budget, entity allocation, manager responsibilities, points distribution, employee choice, and order processing. This angle fits the owner-described offer. It is not a claim that competitors lack these capabilities.

### Competitor page review

| Category competitor / inspected page | What the page covers | Page-level opportunity for ShelfMerch |
| --- | --- | --- |
| [SwagUp Shops](https://www.swagup.com/shops) | Branded stores, employee points, redemption, and use cases | Publish an educational implementation guide with responsibilities and a launch checklist. The inspected page is a sales overview; treat this as a content-format opportunity, not a missing-feature claim. |
| [Axomo budget guide](https://axomo.com/using-budgets-to-manage-spending-and-improve-rewards/) | Department budgets, distributors, allocations, and store credit | Compete with a current ShelfMerch-specific walkthrough and clearly labeled planning example. The inspected article uses older interface screenshots; age alone does not establish inaccuracy or ranking weakness. |
| [Swag Pro user-budget guide](https://help-center.swag.com/hc/en-us/articles/360020889013-Setting-and-managing-user-budgets) | User spending limits, defaults, periods, and overrides | Connect buyer questions to the full journey from company setup through redemption and order handling. This support article answers a narrower configuration question. |

These are category competitors selected from relevant public pages. Semrush returned no data for `shelfmerch.io` organic competitors in the US database. No ranking, traffic, or keyword-overlap comparison for ShelfMerch is available from that request. No alternative figures have been substituted.

### Keyword evidence and limits

Semrush's US keyword batch returned the estimates below on 29 October 2026. These are tool estimates, not ShelfMerch traffic or conversion forecasts. The request omitted a historical date; the tool did not expose the underlying observation month.

| Keyword | Estimated monthly US searches | Difficulty / 100 |
| --- | ---: | ---: |
| company swag store | 480 | 37 |
| employee swag store | 170 | 19 |
| swag store for employees | 170 | 26 |
| corporate gifting platform | 320 | 43 |
| swag management platform | 50 | 4 |
| employee welcome kits | 90 | 16 |
| employee rewards points | 10 | 0 |
| corporate gifting budget | 10 | 0 |
| employee merchandise store | 50 | 31 |
| employee recognition platform | 1,000 | 46 |
| company merchandise store | 140 | 50 |
| corporate gifting India | 20 | 0 |

Source: [Semrush keyword overview, US reference market](https://www.semrush.com/analytics/keywordoverview/?db=us&q=company%20swag%20store). The CSV records which primary keywords actually have measurements. Blank measurements mean not measured, not zero. Near-identical keyword variants can overlap; do not add their volumes together. Difficulty 0 does not establish easy ranking or substantial demand.

Following confirmation of global targeting, additional [UK](https://www.semrush.com/analytics/keywordoverview/?db=uk&q=company%20swag%20store) and [India](https://www.semrush.com/analytics/keywordoverview/?db=in&q=company%20swag%20store) batches were run for eight core terms. For example, company swag store returned 70 UK and 20 India monthly searches; employee welcome kits returned 10 UK and 40 India. Full rows are in `regional-keyword-estimates.csv`. Terms omitted from the provider response are labeled not returned, not zero. These three markets are a sample, not worldwide demand. Do not use a country sum as a global search-volume claim.

Avoid targeting broad "employee recognition platform" first: it can suggest capabilities beyond the described merch and points workflow. Prioritization favors offer fit and demo intent over raw volume. Start with globally readable English and no country-specific promises. Create localized content only when the service area and genuine local differences are confirmed; do not clone identical country pages.

### Site and code checks

The homepage yielded a title but no meaningful body text through the web reader. `/blog`, `/request-demo`, `/sitemap.xml`, and `/robots.txt` could not be retrieved through that reader. Direct requests from the sandbox also could not connect to the homepage, blog, blog sitemap, or `/rss.xml`. These access failures do not prove a production outage or missing endpoints.

Current local code verifies:

- `apps/api/src/modules/blog/blog.routes.js`: authenticated create/edit/publish/unpublish and image-upload APIs.
- `apps/api/src/modules/blog/blogPost.model.js`: draft default, publication timestamp, SEO and image metadata.
- `apps/api/src/modules/blog/blogContent.js`: editor-document JSON; only H2/H3 within article content; approved node and link validation.
- `apps/api/src/modules/blog/blogPublic.controller.js`: article title supplies H1; public HTML includes canonical metadata and BlogPosting structured data.
- `apps/api/src/app.js`: blog APIs mounted under `/api/v1/platform/blog-posts`; `/sitemap-blog.xml` route registered.
- `apps/web/src/services/blog-api.ts`: native frontend field and endpoint contracts.

This is local implementation evidence, not proof the deployed site has the same version. No blog RSS endpoint or Arvow/Blotato integration was found in the relevant application routes and modules. Existing article inventory was inaccessible, so proposed gaps remain candidates until an editor checks published and draft titles. Do that before approving new slugs or creating duplicate articles.

## Claim and visual policy

Owner-confirmed workflow statements above may appear in drafts. Product names, catalog availability, point conversion rates, expiry, partial payment, pricing, minimum quantities, shipping coverage, delivery dates, integrations, security certifications, tax treatment, savings, and performance outcomes require separate evidence before use. No such claims are included as promises.

The local wordmark was visually inspected: `apps/web/public/images/logo/shelfmerch-wordmark.png`. It is a supplied brand asset, not evidence of a product offering. Product and dashboard imagery remains on hold until actual assets are inspected and cleared for the intended use. Do not reuse files merely because they are named "kit"; some repository artwork is explicitly named as generated. Competitor images and customer logos are excluded.

## Approval and release status

Three article drafts and twelve captions are prepared. No feed item was consumed; social drafts are derived from the local article drafts. Future live URLs, feed timestamps, account IDs, image URLs, and schedules are deliberately absent. The separate release queue is empty until real values and approvals exist. This package is ready for editorial and implementation review, not live API submission.

The original pilot did not change app behavior. A later implementation added the SEO backend worker, dashboard, and managed-draft approval checks locally; see `RUNTIME.md`. No RSS/social integration or production job was deployed.
