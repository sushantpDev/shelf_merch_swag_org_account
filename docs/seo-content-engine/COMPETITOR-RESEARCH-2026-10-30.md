# ShelfMerch competitor research

Research date: 30 October 2026. Scope: enterprise company stores, merchandise budgets, employee redemption and gifting. Sources are the vendors' own public pages. These are attributed descriptions, not independent product tests. No search volume, keyword difficulty, traffic, pricing or comparative performance figures were verified.

## Competitor shortlist

| Company    | Relevance to ShelfMerch                                                   | Observed page coverage                                                          | Official source                                           |
| ---------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------- |
| AXOMO      | Direct; strongest overlap with the confirmed store and budget workflow    | Company stores, user budgets, credits and centralized purchasing                | [Company Store](https://axomo.com/company-store/)         |
| Stadium    | Direct; strong overlap with recipient choice                              | Branded shops, points or budget, occasions and redemption reporting             | [Shops](https://www.bystadium.com/shops)                  |
| SwagUp     | Direct; merchandise stores and employee rewards                           | Inventory or pre-orders, employee points, shop credit and payment choices       | [Swag Shops](https://www.swagup.com/shops)                |
| Merchology | Direct for company merchandise stores                                     | Product and logo setup, storefront branding, ordering and setup guides          | [MerchStore](https://www.merchology.com/pages/merchstore) |
| Swageazy   | Direct for corporate merchandise and kits; particularly relevant to India | Employee/client hampers, festive gifts, recipient redemption and order workflow | [Homepage](https://swageazy.com/)                         |
| Sendoso    | Adjacent; broader prospect/customer gifting and direct mail               | Campaigns, gifting choices and fulfillment operations                           | [Homepage](https://www.sendoso.com/)                      |

AXOMO, Stadium and SwagUp are the most relevant starting comparison set. This is an editorial assessment of workflow overlap, not a market-share or SEO ranking claim. Swageazy adds a regional reference; it does not change ShelfMerch's global audience.

## Content opportunities

The reviewed pages explain storefronts, recipient choice and gifting use cases. A useful ShelfMerch content angle is to explain its owner-confirmed workflow in practical detail: company budget → entity-manager allocation → store or kit → employee points → redemption → order processing.

This is a proposed differentiation in explanation, not a claim that competitors lack hierarchical budgets. No full-site content-gap audit or SERP weakness measurement was performed. Validate these topics against actual GSC queries, existing articles and search results before placing them in the automated keyword queue.

| Priority | Proposed article                                              | Primary keyword               | Supporting keywords                                 | Intent                   |
| -------- | ------------------------------------------------------------- | ----------------------------- | --------------------------------------------------- | ------------------------ |
| 1        | How to Allocate a Company Merch Budget Across Teams           | company merch budget          | departmental swag budgets; employee merch allowance | Informational            |
| 2        | Employee Merch Points vs Preselected Kits: How to Choose      | employee merch points         | merch redemption; employee gift kits                | Commercial investigation |
| 3        | How to Set Up an Employee Merch Store with Points             | employee merch store          | company swag store; points redemption               | Informational            |
| 4        | How to Plan Onboarding Kits Across Multiple Teams             | employee onboarding kits      | new hire merch; team gifting budget                 | Informational            |
| 5        | Company Merch Store Checklist for HR and Procurement          | company merch store checklist | employee swag store; merch procurement              | Commercial investigation |
| 6        | From Employee Points to Merch Orders: A Program Owner's Guide | employee merch redemption     | points allocation; company merchandise ordering     | Informational            |

Priorities reflect fit with ShelfMerch's confirmed offering and demo goal. They are not measured demand scores. All titles need duplicate/intent checks before drafting. Use a natural demo CTA; avoid promises about delivery coverage, integrations, tax treatment, ROI or employee-retention improvements.

## Knowledge records and safeguards

The accompanying [JSON dataset](competitor-knowledge-2026-10-30.json) contains 12 attributed notes, two per company. Each note has a competitor name, source URL, research date and stable import key. The date records the research day, not an exact page-fetch timestamp.

Imported notes start **pending** in **SEO growth → Knowledge → Competitor research**. A human can mark a note reviewed or retire it. Re-importing preserves existing records, edits and review decisions. These notes are reference material for research and editorial planning; generation, article review and native publication accept only approved **ShelfMerch business facts** as product evidence. Competitor notes cannot satisfy the worker's approved-business-knowledge requirement.

Validate the batch without accessing the database:

```powershell
node apps/api/src/scripts/import-seo-competitor-knowledge.js
```

Import pending notes into the database configured by the existing API/root environment:

```powershell
node apps/api/src/scripts/import-seo-competitor-knowledge.js --apply
```

The importer does not approve records, enqueue jobs or publish content. It records a system-import audit event. Repeat the source check before using any note in public comparative content; vendor pages can change.
