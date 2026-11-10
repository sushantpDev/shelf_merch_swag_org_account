# Pilot validation

Historical checks for the original offline content pilot. Current application implementation checks are in `IMPLEMENTATION-VALIDATION.md`.

Checked locally on 29 October 2026.

## Passed

- `node --check docs/seo-content-engine/build-drafts.mjs`.
- `node docs/seo-content-engine/build-drafts.mjs`: all three native CMS payloads passed the application's actual `validateBlogContent` validation and rendered through `renderBlogContent`.
- Article titles match their manifest entries; body documents contain H2/H3 headings, no body H1, and a native `/request-demo` CTA.
- Draft source lengths: SM-01 1,287 words; SM-02 1,208; SM-03 1,194. Counts include Markdown titles and syntax, so they are approximate editorial lengths.
- Twelve unique social drafts: two distinct variants for each of two platforms for each article, with valid source and visual references.
- Eight JSON files parsed successfully, including native exports, editorial metadata, social drafts, the release schema, and the empty release queue.
- Twelve prioritized CSV rows with sequential priorities and expected columns.
- Twenty-four regional keyword observations with unique keyword/database pairs; unavailable measurements stay blank.
- Text package whitespace check.
- Local API mount and public blog route contracts checked. Current frontend route confirms `request-demo`.
- Release queue contains zero items. No calls to generation, CMS write, publishing, scheduling, or social APIs were made.

The generated summary records article and payload SHA-256 values for later version comparison. These hashes identify the draft material; they do not constitute editorial approval.

## Not verified

- Production blog/draft inventory and slug availability.
- Live CTA form completion, canonical pages, crawler output, or production sitemap behavior.
- Live blog RSS feed or an implemented RSS worker.
- Actual product/kit photos, final social graphics, media URLs, or rendering on social platforms.
- Blotato account and Facebook Page ownership, credentials, or an approved schedule.
- JSON Schema validation against real release items; no release items exist yet. The schema's JSON syntax was parsed, but a future worker must implement schema-format and business-rule validation.
- End-to-end CMS import/publication and social release.

No application source files were changed, so no application-wide build or test suite was run. Validation here is scoped to the content package and native document compatibility.
