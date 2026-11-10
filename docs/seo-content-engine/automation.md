# Automation design and native CMS handoff

This is the original pilot integration specification. The current application engine uses the existing CMS plus Windsor/Search Console and Claude; see `RUNTIME.md` for what is implemented. Arvow, inbound webhooks, RSS, and social publishing remain future work. No worker was deployed to production.

## Phase 1: use the existing CMS

1. Review the three Markdown article drafts and their SEO metadata in `editorial-manifest.json`.
2. Run `node docs/seo-content-engine/build-drafts.mjs` from the repository root. This uses the actual native content validator and renderer and creates three CMS draft payloads under `generated/`.
3. In an authorized platform session, check current drafts and published articles for duplicates and slug conflicts. Use the existing editor to save the content, or submit the generated JSON to `POST /api/v1/platform/blog-posts`. The body contains only supported article fields; new posts default to draft.
4. Preview and check links, metadata, image decisions, and body rendering. Record editorial approval against the final content version.
5. Publish the approved draft through the existing editor or `POST /api/v1/platform/blog-posts/:id/publish`. This is a separate authorized action, not part of the offline exporter.
6. Verify the actual public page, canonical, single H1, H2/H3 body, robots directives, demo CTA, structured data, and blog sitemap entry. Resolve the article's real canonical URL before social preparation.

Current API behavior and constraints are verified in local code, not in the deployed app:

- `title` and `seoTitle`: up to 180 characters; `excerpt` and `seoDescription`: up to 400; `authorName`: up to 100; `slug`: 3–100 and lowercase hyphenated tokens.
- `content` must be editor-document JSON; arbitrary HTML is not accepted. Body headings are H2/H3, with H1 supplied by the article title.
- Cover and inline images must correspond to `BlogAsset` records created through the blog image uploader. Upload approved images through `POST /api/v1/platform/blog-posts/images` using form field `image`; keep returned media URLs and provide alt text.
- Native API access uses existing platform authorization, including blog write permission and impersonation restrictions. Do not invent an unprotected import endpoint or treat an Arvow secret as a platform user credential.
- The publish action requires an excerpt and body. Publishing locks the slug against later changes. Reserve the correct slug before first publication.

The pilot payloads omit images because no final article/product imagery has been approved. The native CMS allows this. If cover imagery is a business requirement, hold publication until the actual image is inspected and uploaded.

## Phase 2: published-only RSS discovery

No usable live feed was retrieved, and no blog RSS handler was found in the inspected local routes. A proposed endpoint such as `/blog/feed.xml` is not an existing URL and must not be configured as if it already works.

If RSS distribution is implemented, its contract should be:

- Server-generated RSS 2.0 containing only published articles, never drafts or previews.
- Stable article ID as GUID; absolute canonical link; title; excerpt; publication date; update marker; and approved media references only when present.
- Valid XML escaping and the correct RSS content type; register the endpoint before SPA fallbacks and advertise it with a feed link.
- Unpublish removes an item from future feed responses. A distribution worker rechecks published status before sending any already-queued item.
- Support conditional requests where practical. Use a durable cursor and an overlapping fetch window rather than trusting a single last-seen timestamp.

On first connection, establish a baseline. Do not distribute the historical feed automatically. Backfills require a separate selection. Deduplicate on article ID, version, platform, account, Page, and selected variant. Treat edits to a previously distributed article as review events, not automatic reposts.

RSS provides discovery. The worker must fetch the current canonical and match it to the approved article record. A feed title or excerpt alone cannot verify product claims or image provenance. Keep the article source/version alongside each social draft.

The twelve supplied captions are based on local article drafts. They do not demonstrate a working RSS integration. Once live canonicals exist, resolve any article-link additions before final caption approval.

## Phase 3: optional Arvow adapter

Arvow can later feed the same editorial process. Its documented publication webhook sends article fields including `id`, `title`, HTML `content`, Markdown, description, and thumbnail metadata. Validate its `X-SECRET` header and persist the received publication before acknowledging it. A 200 response can omit the optional public URL while the article remains a draft. [Arvow webhook contract](https://docs.arvow.com/en/help/articles/1611728-webhooks)

Proposed adapter mapping:

| Incoming field | Native destination / handling |
| --- | --- |
| `id` | Durable external reference for idempotency; not a native BlogPost ID |
| `title` | `title`; derive a candidate slug and check collisions |
| `content` / `content_markdown` | Parse to a constrained document tree, normalize headings, validate native content, and preserve an editorial source copy |
| `metadescription` | Draft `seoDescription`; review length and accuracy |
| `thumbnail` / alt text | Quarantine for provenance and file checks; upload through the native image workflow only after clearance |
| `keyword_seed`, campaign and batch identifiers | Editorial metadata outside BlogPost's current field contract |

This is a proposed mapping, not an implemented generic importer. The offline Markdown exporter only supports the pilot articles' limited syntax; it must reject arbitrary generator output rather than silently losing tables, images, or unsupported formatting. HTML conversion needs a proper parser, an allowlist, link checks, and native validation. Never pass arbitrary incoming HTML into rendering.

Use transactional persistence or equivalent durable ingestion, unique external references, and observable retry states. Generation completion must not trigger native publication. Store a draft first; approve and publish separately. Disable generated images and unverified product sourcing for this business workflow.

Arvow's [API guide](https://docs.arvow.com/articles/5958995-api) links its live API reference. Retrieve the current generation schema before implementing an API caller; this package does not invent generation endpoints or account identifiers.

Wix is an optional alternative destination, not an extra layer in ShelfMerch's current setup. If a separate Wix site is chosen later, Arvow documents a site ID, Wix Blog API permission, and a draft option. Use drafts and avoid publishing duplicate copies under competing canonicals. [Arvow Wix integration](https://docs.arvow.com/en/help/articles/4662293-wix-integration)

## Phase 4: approved social releases through Blotato

`social-drafts.json` holds editorial alternatives. `release-queue.json` is the separate executable outbox and currently contains no items. Never connect the draft collection directly to publishing.

Before moving a selected variant into the outbox, resolve:

1. The live article's identity, canonical, and approved version.
2. The final caption, including any real article URL and campaign tags.
3. Inspected and approved media bytes, alt text, rights/provenance, and a stable public media URL.
4. The intended Instagram account or Facebook Page from actual connected-account discovery.
5. An approved future schedule with explicit time zone/offset. Global targeting does not justify inventing a single best posting time.
6. A reviewer identity, approval timestamp, and hash of the exact caption, media hashes, destination, source version, and schedule.

Changes to the release material invalidate approval. All verified flags represent logged checks, not fields to auto-set when a feed item arrives. Live page/media checks should be refreshed shortly before submission.

### Current REST contract

Discover destinations using `GET /v2/users/me/accounts`; resolve Facebook Pages through that account's subaccounts. Submit to `POST https://backend.blotato.com/v2/posts` with the `blotato-api-key` header supplied securely at runtime. Credentials do not belong in queue records.

The body uses `post.accountId`, `post.content` (`text`, `mediaUrls`, `platform`), and `post.target`. Match `targetType` to the platform; Facebook also needs `pageId`. Instagram can carry `altText`. Current documentation accepts public media URLs directly; Blotato re-hosting is not always required. Set `scheduledTime` at the root with an explicit offset. Omitting scheduling publishes immediately. Store the returned `postSubmissionId` and reconcile its status. [Blotato REST contract](https://help.blotato.com/rest-api-reference/publish-post.md)

The internal record shape is defined in `release-item.schema.json`. It is an internal contract, not the exact API body. The proposed mapper is:

```javascript
// Run only after schema validation, approval-hash comparison, live checks,
// and account/Page ownership validation. This constructs data; it does not send.
function toBlotatoBody(release) {
  const target = release.platform === 'facebook'
    ? { targetType: 'facebook', pageId: release.pageId }
    : { targetType: 'instagram', altText: release.altText };
  return {
    post: {
      accountId: release.accountId,
      content: {
        text: release.caption,
        mediaUrls: release.mediaUrls,
        platform: release.platform,
      },
      target,
    },
    scheduledTime: release.scheduledTime,
  };
}
```

No example is populated with invented account IDs, public article links, media URLs, or schedules. The empty outbox is intentionally not a publish request.

## Worker state and failure behavior

Proposed editorial states: discovered → fact review → draft → visual review → approved → ready → submitted → scheduled/published, with blocked and failed branches. These are content-operation states outside the existing BlogPost `draft`/`published` field; do not submit them to the current CMS as new enum values.

Use a unique release key and a transactional outbox with a worker lease. Persist the outbound request hash and submission ID. If a request times out after possible acceptance, mark it uncertain and reconcile with provider records before resending. Do not assume the provider accepts an idempotency header. Retry temporary errors with bounded backoff; permission, destination, content, or asset errors return to review. A submission acknowledgement is not proof of a published social post.

At publish time, verify the source is still published and the approval matches. If the blog is withdrawn, stop pending releases and reconcile or cancel any already-scheduled provider item. Withdrawal does not itself authorize deletion of an already-public social post.

Keep secrets server-side and redact headers from logs. Maintain article/source references, reviewer identity, asset provenance, destination, schedule, request hash, submission status, and failure reason. No employee records or private budget screenshots are needed for this content engine.

## Acceptance checks for a future implementation

- Native draft creation leaves the article unpublished; publication requires approved content.
- Duplicate source ingestion creates no duplicate drafts or social releases.
- Unsupported incoming markup and unapproved images fail with a reviewable reason.
- RSS never exposes drafts; an unpublished article blocks an outstanding release.
- First RSS poll baselines old posts without distributing them.
- A real article can be discovered, checked, captioned, visually reviewed, approved, and scheduled to the chosen account.
- Missing media, Page ID, future timestamp, approval, or current source version blocks submission.
- Misplaced/missing scheduling fields cannot trigger accidental immediate publication.
- A provider timeout is reconciled before a retry; completed publication is checked beyond HTTP acceptance.
- Content and media changes after approval invalidate the release.

These end-to-end checks have not run: the necessary live feed, account destinations, media, approvals, and service connections are absent. The delivered verification covers local payload validation and package consistency only.
