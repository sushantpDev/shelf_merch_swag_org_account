# ShelfMerch tracking audit — read-only

No tracking code, Google Tag Manager configuration, consent behavior, pixel setup, or production deployment was changed.

## Live Search Console verification

Authenticated server-side Windsor REST requests using the key provided in the local environment returned `sc-domain:shelfmerch.io`. The chat MCP connector, separately, still returned only the QuizUp property. These are distinct access contexts; the worker must use its own server credential.

Requested period: **1–28 October 2026**, inclusive, the last 28 complete calendar dates at request time. Latest returned reporting date: **27 October 2026**. The missing 28 October row is not treated as zero. Reporting dates are provider dates, not converted into the operator's local time zone.

| Property-level daily aggregation | Returned value |
| --- | ---: |
| Clicks | 2 |
| Impressions | 49 |
| CTR calculated from those totals | 4.08% |
| Returned daily rows | 27 |

The property is a domain property and includes subdomains such as app.shelfmerch.io. Page-level and query-level aggregates must not be added together or substituted for property totals.

| Returned query | Classification | Clicks | Impressions | Average position |
| --- | --- | ---: | ---: | ---: |
| shelfmerch | Branded | 0 | 4 | 5.75 |
| shelf merch | Branded | 0 | 2 | 7.00 |
| shelf attendant | Non-branded; weak fit for the confirmed offer | 0 | 9 | 76.22 |
| bamboo bookshelf speaker | Non-branded; product intent, availability needs confirmation | 0 | 3 | 10.00 |
| bamboo card holder | Non-branded; product intent, availability needs confirmation | 0 | 2 | 75.50 |

Only five query rows were exposed. Their zero clicks do not contradict the two property-level clicks: query reports can omit anonymized queries. No keyword market search volume or difficulty is inferred from these impressions.

Top returned pages by impressions:

| Page | Clicks | Impressions |
| --- | ---: | ---: |
| /careers | 0 | 15 |
| / | 1 | 13 |
| /blog | 0 | 8 |
| /legal/privacy-policy | 0 | 8 |
| https://app.shelfmerch.io/ | 0 | 6 |
| /resources/hr | 0 | 4 |
| /support | 1 | 2 |

The complete returned page report contains 35 rows in `gsc-baseline-2026-10-29.json`. "High impressions, low CTR" was defined explicitly as at least 100 impressions and CTR below 1%; no query met it. The largest exposed query has nine impressions. This sample does not support generating articles purely from perceived high-demand queries.

## GTM initialization

- `apps/web/index.html`: initializes `dataLayer` and a `gtag` queue, sets Consent Mode defaults, restores stored choice, and loads GTM after analytics or advertising is allowed. A window flag prevents repeated container injection.
- `apps/web/src/lib/googleConsent.ts`: the runtime helper preserves the same consent signals and loading guard.
- `apps/web/vite.config.ts`: removes the GTM block when `VITE_GTM_ID` is empty; a configured ID is injected at build time, not simply by restarting a built server.
- `.env.example`: documents production `VITE_GTM_ID=GTM-T344HWXR`.
- Live homepage HTTP response contained **GTM-T344HWXR**. No direct GA4 Measurement ID was found in that HTML.

## Existing GA4 destination

The publicly served `gtm.js?id=GTM-T344HWXR` returned HTTP 200 and contained **G-R7NH28YHF0**. It did not expose the newly supplied **G-NLQZ10MD11** in the inspected Measurement ID strings. It also contained `shelfmerch_lead_created`, `generate_lead`, and `page_view` references.

This establishes a deployed container/destination mismatch worth investigating. It does not prove actual event delivery, correct firing conditions, destination ownership, or the state of an unpublished GTM workspace. The authenticated GTM UI was not available for inspecting draft tags and permissions. A browser Preview/DebugView session remains necessary.

No hardcoded GA4 Measurement ID or direct `gtag('config', ...)` initialization was found in the relevant source bootstrap/tracking modules. The deployed GA4 configuration appears to be managed through GTM rather than this repository.

## Consent and lead events

- Default `analytics_storage`, `ad_storage`, `ad_user_data`, and `ad_personalization` are denied. Essential functionality/security storage are granted.
- `shelfmerch.consent` stores independent analytics and advertising choices. The older advertising-only value has a compatibility path.
- GTM loads when either optional category is allowed. Because that can be analytics-only, Meta tags inside GTM need their own advertising-consent checks; GTM loading alone does not establish permission to run every tag.
- Advertising withdrawal attempts `fbq('consent', 'revoke')` when Meta is present. No Meta tag was removed or changed.
- `main.tsx` prepares the existing OpenAI pixel. Its module uses advertising consent and the existing pixel configuration. Analytics consent alone does not enable it.
- `RequestDemoForm.tsx` emits `shelfmerch_lead_created` through `leadConversion.ts` only after the API returns **201** and a safe lead ID. The event includes a deduplication ID and consent-category flags, with no name, email, phone, or message.
- The signal requires analytics or advertising consent at that time. It is not replayed after a later grant. A Google Analytics event tag should additionally require analytics permission; an advertising-only visitor must not become an analytics conversion merely because the shared event exists.
- This event means a demo request was saved. It does **not** establish that sales qualified the lead or that the visitor booked/attended a demo. Do not label it a qualified-demo conversion without an approved downstream definition.

## Separate blog rendering gap

`apps/api/src/modules/blog/blogPublic.controller.js` renders standalone public HTML. Its current document template has no SPA bootstrap, consent banner, or GTM loader. Therefore the root SPA's tracking code is not automatically present on those server-rendered blog pages. This is a local-code finding; no tracking was added. Any shared tracking change for blog HTML needs separate approval and must preserve consent semantics.

## Safest proposed connection

Keep GTM as the single owner of the Google tag. Inspect the existing Google tag and event tags in GTM first. Decide whether G-NLQZ10MD11 is a replacement destination or an intentionally additional property. For a replacement, update the intended Google tag destination and related event tags together in a draft workspace. Do not add a second hardcoded gtag.js script or a second automatic page-view tag in React.

Use one SPA page-view strategy: either enhanced measurement/history-based views or an explicitly managed route event strategy. Do not combine both without suppressing the duplicate sender. Google's [page-view guidance](https://developers.google.com/analytics/devguides/collection/ga4/views?technology=websites) warns about duplicate manual and automatic events; its [SPA guide](https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications) explains route-level validation.

Map the existing saved-lead signal to one GA4 `generate_lead` event, using the intended Google tag and an analytics-consent condition. Preserve existing Meta and OpenAI events. Confirm any deduplication/retry behavior with the actual published trigger configuration before changing it. Do not send user-entered form fields or count form views/button clicks as saved leads.

## Verification steps before any GTM publication

1. Open GTM-T344HWXR, inspect all Google tags/GA4 event tags and their destination IDs, and save the proposed change only in the draft workspace.
2. Start **Preview** for https://shelfmerch.io and connect Tag Assistant. Check default denied consent and each separate consent choice. [Google Preview instructions](https://support.google.com/tagmanager/answer/6107056?hl=en)
3. After allowing analytics, verify the intended Google tag fires once. Inspect network collection requests for the intended `tid=G-NLQZ10MD11` destination; confirm the older ID is retained only if that is intentional.
4. Load the homepage, navigate to another public SPA route and `/request-demo`, and use Back/Forward. Check exactly one expected `page_view` for each navigation and correct page location/referrer.
5. In the new GA4 property's DebugView, select the test device and verify page views arrive. [Google DebugView instructions](https://support.google.com/analytics/answer/7201382?hl=en)
6. With an explicitly authorized test lead, submit the demo form. Confirm API 201, one `shelfmerch_lead_created` dataLayer signal, one intended `generate_lead` tag firing, and one DebugView event. An API failure, invalid form, or WhatsApp click must not be counted as a saved demo request.
7. Repeat with analytics denied, advertising-only, and all optional tracking denied. Check both Google and advertising destinations, including withdrawal. Respect the chosen Consent Mode strategy when assessing any denied-consent network pings.
8. Inspect direct `/blog` and article loads separately; do not assume the SPA checks cover standalone HTML.
9. Review the results, then obtain approval before publishing GTM or changing application tracking.

No Preview session, GA4 DebugView check, test lead submission, or GTM publication was performed in this audit.
