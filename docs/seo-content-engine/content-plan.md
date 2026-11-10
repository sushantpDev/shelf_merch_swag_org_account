# Content generation and quality plan

Status: proposed pilot for a global audience, Instagram and Facebook, and the existing ShelfMerch CMS, as confirmed by the owner. Arvow is not set up and is optional future work. The first three full drafts are available for review. All titles remain subject to an existing-content check. Global targeting is an editorial scope, not a shipping promise.

## Editorial sequence

Propose one substantial article per week for six weeks after approval. Publish for usefulness and accuracy; word count is an editorial guide, not a ranking requirement. Do not create a recurring schedule until the owner confirms cadence and time zone.

| Sequence | Article | Distinct question and recommended structure | CTA |
| --- | --- | --- | --- |
| 1 | SM-01: Company swag store | What it is; company and entity budgets; store setup; employee points; order handling; launch checklist | Book a demo to walk through your organizational structure |
| 2 | SM-02: Corporate gifting budget | Define program scope; allocate across entities; separate allocation from redemption; plan kit/store spending; review questions | Discuss the budget model in a demo |
| 3 | SM-03: Welcome kits or store | Compare selection methods; when a curated kit fits; when employee choice fits; planning checklist | See both workflows in a demo |
| 4 | SM-04: Platform evaluation | Must-have business requirements; admin/manager roles; catalog/store/points/kit demonstrations; fulfillment questions; evaluation scorecard | Bring the scorecard to a demo |
| 5 | SM-05: Demo questions | Define the buying problem; show actual role journeys; ask about budget and points rules; confirm service coverage and commercial terms | Book a demo with your requirements |
| 6 | SM-06: Points guide | Define merch points; explain distribution and redemption; list program policy questions; distinguish from general recognition systems | Explore the merch redemption workflow |

SM-07 through SM-12 are a backlog, not an instruction to generate six near-duplicate pages. Reassess after the pilot using query and conversion evidence. Consolidate overlapping store and kit topics when they cannot support a distinct answer. Add practical templates rather than padding articles with repeated definitions.

## Standard article brief

Each brief records its primary query, reader, intent, distinct answer, allowed product claims, excluded claims, evidence references, outline, planned slug, internal links, and conversion goal. Use globally readable English without assumed currencies, legal rules, shipping coverage, or local catalog availability. For future automated generation, provide the owner-confirmed workflow as the approved business knowledge base. Tell Arvow to flag unknowns in the editorial system rather than filling gaps in public copy.

Use one H1 from the CMS title. Body headings use H2 and H3. Begin with a direct answer and a concrete reader problem. Include a decision checklist or worked example only where it helps. A planning example must be labeled illustrative and must not invent currency-to-points rules. Use product names or screenshots only after checking their current state.

The three pilot drafts use no statistics, testimonials, named customers, prices, delivery promises, tax guidance, or competitor comparisons. Advice to decide a policy is not a claim that ShelfMerch implements that policy automatically.

## Internal linking

- Native draft CTA: `/request-demo`. This route exists in the local product and blog navigation; verify it on the production origin before publication.
- Native catalog opportunity: `/apps/catalog`. Verify public access, catalog contents, geography, and product availability before adding it as a public buyer link. Do not assume the reader is authenticated.
- Link SM-02 and SM-03 back to SM-01 after the flagship is live. Link the flagship to those guides once their URLs return the expected articles. These future links are not inserted in the current drafts.
- Check published/draft title inventory and slugs before exporting to production. No public access was available to complete this check.
- Use descriptive anchors tied to the question. Do not link to a future page or invent a feature landing page merely for SEO.

## Optional future generation instructions for Arvow

Business: ShelfMerch, https://shelfmerch.io. Audience: enterprise program owners. Goal: qualified demo bookings. Offers: company and entity budgets, managers, catalog-backed company stores, kits, employee points, employee merch redemption, and ShelfMerch order processing, as described by the owner.

Write direct, practical English. Keep advice within the assigned question and confirmed offer. Distinguish company setup, manager administration, and employee redemption. Describe points as a way to redeem merchandise; do not promise cash value or a fixed conversion. Do not introduce self-serve signup as the primary CTA. Do not imply automatic HRIS triggers, global delivery, certificates, instant setup, savings, or business outcomes. Do not generate or source product images automatically. Use only supplied, verified images after clearance. Produce an editable draft with SEO metadata; publishing remains a separate approved action.

For now, use the existing CMS and the native draft exports. If Arvow is adopted later, send generated articles to the proposed webhook staging step described in `automation.md`. The current source code does not accept arbitrary HTML as native blog content; conversion and validation are necessary.

## Editorial checks before an article can be approved

1. Confirm the business market, current offers, CTA destination, and intended reader.
2. Check existing articles and drafts for duplication and competing primary intent.
3. Check every feature statement against owner confirmation, current UI, and applicable product rules. Record the source and verification date outside public copy.
4. Resolve unknown point rates, expiry, taxes, product availability, shipping, or commercial terms by omission or explicit business confirmation. Never infer them from a competitor.
5. Confirm a single H1, sensible H2/H3 structure, useful opening answer, readable paragraphs, and natural keyword use.
6. Check links, content rendering, canonical, robots directives, metadata, and the actual production CTA form. Verify a completed demo request reaches its intended lead destination using an authorized test.
7. For images, inspect the actual file, rights/provenance, visible product details, alt text, and public delivery URL. Strip private employee details from any real dashboard capture.
8. Record the reviewer and content hash. Any material edit after approval invalidates that approval.

## Social derivation

The pilot captions are based on the three local drafts, not RSS. Once an article is approved and published, the production RSS feed can supply the canonical URL, title, excerpt, and update marker. Fetch the actual article and its approved source record before generating captions. A feed item is a discovery signal, not factual verification.

Offer two variants per platform for editorial choice. Select one variant per article per platform for the first distribution cycle; the alternatives are not automatic duplicate posts. Instagram drafts use a soft conversation prompt and a domain mention; no unverified "link in bio" instruction is included. Facebook blog links are added only after the exact canonical is live and checked. Captions use relevant language; hashtags are not a promise of SEO rankings or reach.

## Measurement

Primary business metric: qualified demo bookings attributable to the content journey. Agree what counts as qualified with sales before reporting it. Secondary metrics: organic landing sessions, relevant Search Console impressions/clicks, CTA interactions, successful demo submissions, and social referral visits.

Record the baseline before publication, then review at approximately 30, 60, and 90 days. Do not promise rankings or a traffic uplift. Search Console was unverified during the initial pilot; subsequent server-side Windsor verification and the actual baseline are documented in `TRACKING-AUDIT-2026-10-29.md`. Treat an absent analytics event as missing instrumentation until investigated, not a zero-conversion result.

Use tagged social links only after the canonical is known: `utm_source` set to the selected platform, `utm_medium=social`, `utm_campaign=enterprise_merch_pilot`, and `utm_content` set to the selected draft ID. Keep these tracking URLs out of canonical tags. Do not append campaign parameters to internal links used to measure organic journeys.
