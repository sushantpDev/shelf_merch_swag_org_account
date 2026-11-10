# SEO growth engine: audit and implementation log

Current implementation and launch instructions: `RUNTIME.md`. Final checks: `IMPLEMENTATION-VALIDATION.md`. The audit below records the initial state before the owner supplied server credentials and selected Search Console/Windsor + Claude.

## Phase 0 audit — 29 October 2026

| Capability | Current implementation | Gap / modification | Risk |
| --- | --- | --- | --- |
| Blog authoring and publication | BlogPost/BlogAsset, Tiptap editor, authenticated platform API | Reuse; add approval enforcement only for engine-generated drafts | Existing manually authored articles must retain their workflow |
| Public SEO | Server-rendered blog HTML, canonical, BlogPosting, published-only sitemap | Reuse and regression-test | Local code is not evidence of deployed behavior |
| Background processing | BullMQ 5, Redis, separate `npm run worker` process | Add scheduled SEO worker to the same entry point | Multiple PM2 instances and restarts require database fencing and idempotency |
| Research/generation models | No seoContent/seoKeyword/seoGenerationJob/seoAutomationSetting equivalents found | Add platform-owned marketing models | Never ingest tenant budgets or employee data |
| OpenAI | Measurement-pixel/CSP functionality exists | Preserve unchanged; use a separate Anthropic adapter | Do not migrate unrelated OpenAI behavior |
| Semrush | Chat plugin exposes discovery, schemas, and reports; earlier keyword research files exist | Add server API adapter, cached metrics, unit cap, and reviewed import | Chat OAuth does not supply worker credentials; subscription/quota unknown |
| Windsor | Discovery returned one Search Console property for quizup.site and no connected GA4 account; plan reported Trial | Add property-specific API adapter and snapshot import | Wrong-site metrics must never populate ShelfMerch reports |
| Claude | No existing provider integration or configured credentials found | Add configurable Messages API adapter with strict output validation | Live model access and prices must be configured; no model ID guessed |
| Admin | Existing Control Plane marketing/blog navigation and sales/super-admin access | Extend in place with SEO management | Enforce permissions on every backend mutation |
| Social | No existing integration in relevant modules | Leave extension metadata only | Explicitly outside initial milestone |

Credential checks inspected names/presence only: ANTHROPIC_API_KEY, SEMRUSH_API_KEY, WINDSOR_API_KEY were absent from the root environment and process. No credential values were logged. The API-specific environment file must also be checked by the operator before launch.

## Implementation sequence

1. Add scoped models, deterministic scheduling/scoring/QA, and persistent usage/lease records.
2. Add fixed-host server provider adapters and provenance-preserving CSV/JSON imports. Surface missing connections explicitly.
3. Add resumable jobs, grounded Claude briefs, strict output checks, duplicate protection, and native BlogPost drafts.
4. Add SEO management to the existing platform UI, using the existing blog editor for content editing; approve/reject/version-check generated articles.
5. Reuse publishing and public SEO with an approval guard for generated content.
6. Add source-separated snapshots and reviewable refresh recommendations. Never silently convert unavailable analytics to zero.
7. Run isolated MongoDB tests with mocked paid providers, build checks, and document deployment/configuration. Live staging remains blocked until credentials, the correct analytics properties, approved rates, and a controlled call budget are supplied. No automatic production deployment.

## Scope and launch policy

Marketing data belongs to the platform, not a customer tenant. Routes use existing platform blog permissions; tenant users cannot access it. Scheduling defaults to disabled, 03:00 Asia/Kolkata, one draft per local day, and manual publication. The operator must enable research after configuring providers and approving business facts. Commercial opportunities produce recommendations instead of blog articles.

The prior content-package files remain editorial artifacts. They do not represent engine-generated, approved, or published production records.

## Implemented follow-up

The owner chose Google Search Console through Windsor plus Claude, with Semrush optional. Server Windsor authentication and real ShelfMerch data were verified independently of the chat MCP connection. The requested tracking audit was completed read-only; GTM/GA4 changes were not made. The persistent worker, scoped models, provider adapters, deterministic and Claude-assisted classification/QA, native managed drafts, version-specific review guard, Control Plane dashboard, and performance snapshots/recommendations are now implemented locally. No production deployment or live paid generation was performed. Scheduling remains disabled until the operator completes the documented setup.
