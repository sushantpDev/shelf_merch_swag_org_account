# ShelfMerch SEO growth engine — implementation and launch guide

Implemented locally on 29 October 2026. The initial milestone uses **Google Search Console through Windsor.ai + Claude**. Semrush remains an optional server adapter or reviewed import. Social publishing, RSS, Blotato, and GA4 tracking changes are outside this milestone.

## What is now implemented

- Existing Control Plane → Marketing → **SEO growth**, at `/platform/seo`; no separate application or frontend framework.
- Overview, daily job history and stage failures, provider status, keyword opportunities, URL mapping, article text preview, evidence/QA inspection, feedback/regeneration, approval/rejection, settings, and performance reports.
- Existing sales-manager/super-admin blog write permissions; read-only auditor access; tenant users and impersonated writes blocked by backend middleware. SEO records are platform marketing data, not tenant business records. No employee, customer-budget, or private store data is sent to Claude.
- A persistent SEO worker integrated into `apps/api/src/jobs/index.js`, already used by the PM2 worker process. BullMQ ticks every minute when Redis is available. The Redis-less fallback polls from that worker process and still uses persistent MongoDB jobs and leases.
- Default scheduling: **disabled**, 03:00 Asia/Kolkata, maximum one new draft per local day, manual publication. The schedule remains Asia/Kolkata as explicitly specified in the prompt; the operator's display time zone does not silently change it.
- Unique daily jobs, expiring worker leases, heartbeats, fencing of stale workers, transaction-based draft persistence, unique topic/slug protection, and bounded exponential retry for transient provider errors. Failed final attempts do not remain running indefinitely.
- Seven additive MongoDB models: settings, keywords, jobs, managed-content review/provenance, business knowledge, usage reservations, and performance snapshots. The worker creates required indexes without dropping existing indexes or running destructive migrations.
- Generation uses the existing BlogPost/BlogAsset renderer and editor. Generated articles carry a managed flag. The native publish API independently checks approval of the exact current version; a browser-only control cannot bypass it. Editing invalidates approval. Generated published content must first be unpublished before manual editing; regeneration is limited to never-published drafts.
- Existing manually authored blog posts retain their authoring/publishing behavior. Existing OpenAI, Meta, consent, and tracking code was preserved.

## Data collection and opportunity selection

The Windsor adapter uses fixed provider hosts and a server API key. It discovers actual connector field definitions, requests only the configured ShelfMerch Search Console property, and rejects other-site rows. Query, page, daily/property, and query/page mapping records remain separate. Current and previous nonoverlapping 28-day windows allow for a configurable reporting lag, default three days. Provider dates remain provider dates.

Search Console data includes observed clicks, impressions, calculated CTR, average position, query, page, reporting dates, and source/property/period provenance. It does not supply market keyword volume or difficulty. Those values remain null in GSC mode. Query rows may omit anonymized queries; page-level and query-level totals do not replace property totals. The domain property includes subdomains, which remain visible in page reporting.

Classification covers homepage, commercial landing, solution, integration, category, comparison, case-study, educational-blog, and existing-content refresh opportunities. The ten requested topic clusters are represented. Commercial terms produce recommendations, not forced articles. Existing URL mappings and deterministic title/keyword overlap checks run before generation. A budgeted Claude brief review then assesses semantic overlap and correct page type before the article-generation call. That review cannot turn a commercial candidate into an automatically published article.

The initial scoring formula is configurable in the dashboard:

`priority = weighted average(relevance, conversion intent, inverse difficulty, log-scaled volume)`

Default weights are 45, 25, 20, and 10. Relevance uses documented merch/store/kit/gifting terms; conversion uses intent and buyer-context terms. Difficulty contributes `100 - difficulty` when available, and volume contributes `min(100, log10(volume + 1) * 25)`. Missing metrics contribute zero. The stored explanation includes the actual components and weights. Scores are prioritization rules, not conversion estimates or ranking promises. The default minimum score is 60, with business relevance at least 70 for article candidates.

The worker safely skips when there is no suitable educational topic, approved factual knowledge, or draft capacity. The sparse verified baseline currently contains only five exposed queries; it does not justify manufacturing market demand or generating content for an unrelated query such as "shelf attendant."

## Claude grounding and cost control

Model ID is configurable. Actual Anthropic model discovery returned `claude-opus-5-5` for the owner's chosen Opus 5.5. The initial local environment value `opus 5.5` returned 404 and was corrected to the verified API ID; API keys and other environment settings were preserved. No paid generation call was made during implementation.

Approve factual statements under **Knowledge** with a source/document reference. A statement starts pending. Generation receives only approved facts, approved article/link references, opportunity data, and public-content summaries. Input text is treated as data, with no model tools or publishing capability. Factual paragraphs require approved evidence IDs and exact source statements. Unknown numerical, customer, integration, commercial, and product assertions are blocked or require correction. Planning advice is separate from factual assertions.

Strict Zod schemas validate the brief decision, article JSON, and language review. Article output includes title, slug, metadata, keyword/intent, summary, H2/H3 sections below the CMS-generated H1, internal links, optional FAQs, evidence references, CTA, schema type, and quality notes. The existing safe rich-text renderer escapes text. Arbitrary generated HTML is never injected.

Automated QA checks metadata, evidence references, obvious unsupported claims, repeated paragraphs/headings, allowed links, heading structure, duplicate topics, and the verified demo CTA. A separate Claude language pass flags semantic concerns and filler; it is not independent factual verification. Human review must independently check claims and link destinations. The current implementation does not claim web-wide plagiarism detection or independently verify arbitrary external facts by fetching the internet. Approved external sources must be reviewed by a person.

The worker counts prompt tokens before generation and reserves conservative token/USD capacity before paid calls. Reservations include schema headroom and maximum output; they are intentionally retained after failures or uncertain responses. They represent reserved capacity, not an exact invoice. Brief/QA calls use at most 2,500 output tokens; article generation uses the configured cap. Call events record reservation, response usage, or failure without secrets. Do not add the same reservation twice when reading a call's event history.

Generation is blocked until positive input/output model prices are configured in Settings. Current Anthropic documentation lists standard Opus 5.5 prices as **USD 4 input / USD 20 output per million tokens**, checked 29 October 2026. Review those rates and any account-specific modifiers before setting them. These are configuration reference prices, not approval to run a paid test. [Official Opus 5.5 pricing](https://platform.claude.com/docs/en/models/opus-5-5/overview)

Daily settings default to USD 2, 30,000 reserved tokens, and 1,000 optional Semrush units. All are editable caps. Longer contexts may exhaust a conservative token reservation; the job stops visibly rather than exceeding the configured local cap. Provider billing can differ from estimates, so use provider-side spend limits as well when activating production.

## Verified external access

See `TRACKING-AUDIT-2026-10-29.md` and `gsc-baseline-2026-10-29.json` for the full requested report.

- Chat Windsor MCP discovery still exposed only QuizUp at verification time.
- The provided **server Windsor key** independently returned the ShelfMerch domain property and real Search Console data: 2 clicks and 49 impressions for the requested 1–28 October window, latest returned date 27 October.
- Server field discovery and three real reports succeeded. No real key appears in the saved report.
- Anthropic model-list access succeeded, exposing the chosen model ID. Generation and token-count access have not been exercised against the paid service.
- Semrush worker API access is optional and unconfigured. Chat plugin access does not confer server subscription, credentials, or quota. The connection test makes no paid Semrush report call. API mode reserves at most ten units per requested keyword/database according to the inspected current batch-report contract; results are cached for seven days. An operator must confirm their API subscription and quota before selecting it.
- GA4 sessions and qualified-organic-demo metrics remain unavailable. They are never represented as zero or inferred from Search Console clicks. The new GA4 property and existing published GTM destination differ; tracking changes await the requested audit review and approval.

You do **not** need separate Google Cloud/Search Console credentials for this implementation: Windsor owns the authorized Google connection. A future direct Google connector would require its own appropriate Google authentication; it is not silently enabled by the chat connection.

## Safe activation on staging

No production deployment, MongoDB seed against a live database, automatic publication, GTM change, or tracking-script change was performed.

1. Deploy the reviewed source to an isolated staging environment using the existing build/PM2 process. Use a staging MongoDB **replica set**; draft/approval transactions require it. The existing Atlas/replica-set deployment pattern supports this, but verify the actual target before starting workers.
2. Configure `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, optional `ANTHROPIC_API_VERSION`, and `WINDSOR_API_KEY` only on the server. Never use `VITE_` names for them. Secrets are excluded from provider status responses and queue payloads. The API-specific environment file takes precedence over the root one; restart existing API/worker processes after a credential change.
3. Open `/platform/seo` as an authorized marketing user. Keep scheduling disabled initially. Test configured read access; inspect the actual model and the connected analytics account list. Set the exact ShelfMerch Search Console property.
4. Add the owner-confirmed business brief as individual sourced statements and approve them after review. Do not copy unsupported integrations, customer names, prices, or fulfillment promises from generic marketing copy.
5. Review the model-specific rates and daily limits. Queue a manual research run; the backend worker processes it without the assistant session. The existing PM2 `shelfmerch-worker` entry starts the new worker alongside the existing jobs.
6. Confirm snapshots, source separation, recommendations, job stages, and any skip reason. The verified sparse baseline is expected to skip article creation; that is a valid controlled result, not a reason to bypass relevance checks.
   After correcting setup or supplying a suitable verified opportunity, use **Retry after correction** on a skipped job. It reuses the same daily job and preserves completed stages; clicking Queue research run again only returns the existing daily record. A retry does not guarantee an article if no eligible topic exists.
7. To test a full generation path, explicitly authorize a capped paid staging call and supply a real, relevant, non-duplicate educational opportunity and approved evidence. Do not fabricate data to force it through.
8. Inspect the draft in the native editor and SEO review panel, review claims/links, approve the current version, and explicitly publish only when authorized. Check canonical, crawlable HTML, sitemap, and HTTP behavior on staging.
9. Only then enable the daily schedule and save the existing PM2 configuration through the normal authorized deployment workflow. Production launch remains a separate approval.

## Main files and endpoints

Backend: `apps/api/src/modules/seoGrowth/` and `apps/api/src/jobs/seoGrowth.worker.js`. Frontend: `SeoGrowthPage.tsx` and `services/seo-growth-api.ts`. Existing blog publishing has a managed-draft approval guard.

API prefix `/api/v1/platform/seo-growth` provides overview, settings, read-access test, daily run, bounded job retry, reviewed keyword import, keyword/URL mapping, knowledge review, content review/regeneration, and reviewed snapshot import. All writes use existing platform blog permission and impersonation checks; no public generation or publication endpoint was introduced.

Performance evaluation produces review recommendations for significant impression decline, high-impression low CTR, or near-page-one average position. It never overwrites published content. It does not establish causation for ranking changes. GA4 and qualified-lead enrichment remain explicitly unavailable pending the separate tracking work.

## Verification

The application regression suite verifies scheduling boundaries, concurrency/idempotency, lease recovery/fencing, conservative budgets, provider failures, structured output, evidence, duplicate prevention, edit invalidation, approval authorization, native publication, canonical/sitemap/crawlability, property isolation, snapshot deduplication, and the real verified baseline in an isolated MongoDB replica set. Paid APIs are mocked in automated tests.

Dashboard tests verify read-only permissions, queue behavior, settings payloads without metadata/credentials, explicit factual-review acknowledgement, version-bound approval, and unavailable analytics display. Browser visual verification and a live paid generation/staging deployment have not been performed.

Final command results are recorded in `IMPLEMENTATION-VALIDATION.md`.

## Competitor research knowledge (30 October 2026)

Knowledge now distinguishes `business_fact` from `competitor_research`. Legacy records without a category remain business facts. Generation, article approval and native publication exclude competitor research from ShelfMerch evidence, including research marked reviewed. The dashboard shows separate categories, sources, research dates and counts.

The sourced [competitor report](COMPETITOR-RESEARCH-2026-10-30.md) and JSON dataset contain 12 notes covering six vendors. The pending-only importer preserves existing records and review decisions. On 30 October, all 12 notes were imported and read back from the configured `shelfmerch_test` database; all had sources and research dates, and no business facts were approved. This import does not resolve the worker's requirement for approved ShelfMerch business facts.

Restart any already-running API and worker processes to load the category safeguards before reviewing competitor records. These code changes have not been deployed to production.
