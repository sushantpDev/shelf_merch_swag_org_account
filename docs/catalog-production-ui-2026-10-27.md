# Production catalog UI compatibility

Production's category architecture is authoritative: Apparel, Bags, Drinkware, Office and Technology remain the actual collection names and IDs. This change adapts the existing UI to that structure. No database connection, mutation, migration or category synchronization is used.

The earlier database-sync proposal on `fix/catalog-flat-category-banners` was not applied and is not part of this branch, `fix/catalog-production-ui`.

## Behavior

- Existing Apparel, Bags and Drinkware hero/editorial designs work with flat collection records.
- Office reuses the Stationery design, retaining the name Office and its URL.
- Technology reuses the Electronics design, retaining Technology and its URL.
- Real root routes take precedence over old Accessories aliases. Older Stationery/Electronics URLs still resolve to Office/Technology where those are the actual roots.
- Flat collections get read-only product-type navigation from real public product labels. Nothing is persisted; actual root IDs, names and ordering remain intact. No unrelated department is invented.
- Product requests reuse the complete, cached All Products query and scope each flat collection to its real labels. This supports products stored under either primary collection names or nested labels without backend/data changes.
- The header loads product groups on opening the menu; its query is shared with catalog pages.
- Existing authored nested taxonomy on local/staging is retained.
- Collection banners render even when there are no nested category records. “View all” still opens the scoped product listing.
- Styles, banner artwork, cards, consent and tracking behavior are retained. Production's product classifications, including the current Crew Neck assignment of the oversized shirt, are not changed.

## Verification

- Full web suite: 67 files / 331 tests passed before the final lazy-header adjustment; relevant menu/category tests rerun after it.
- Production-shaped integration tests cover all five banners, correct View all scoping, Office type links, overview root names and no mutation of source taxonomy.
- Existing nested category flows continue to pass.
- Production build passed (3446 modules); output saved outside Git in the temporary directory.
- TypeScript: the same 26 pre-existing errors remain; no new diagnostics in these changes. Existing duplicate bridge fields remain unrelated to the new optional UI-only metadata.
- Headless Edge replayed production's captured public category/product responses against the local frontend at 1440px and 390px. All five heroes rendered; no horizontal overflow, broken hero images or uncaught browser exceptions were found.
- Scoped production counts on both viewport sizes: Apparel 19, Bags 12, Drinkware 31, Office 26, Technology 12. Products can have multiple placements, so collection totals need not sum to All Products.
- Overview labels stayed All Products, Apparel, Bags, Drinkware, Office, Technology, Kits.
- Browser evidence is in the temporary folder (`catalog-production-ui-verification.json`, `catalog-production-office-1440.png`, `catalog-production-technology-390.png`). These are not Git assets.

This is local verification with production public data replayed in a temporary browser profile. The hosted frontend has not been changed; a reviewed code deployment is required. No production MongoDB URI was read or used, and no secret/preview/build output is included in this change.
