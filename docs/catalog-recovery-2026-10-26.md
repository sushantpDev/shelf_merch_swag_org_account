# Shelf Merch catalog recovery — 26 October 2026

## Outcome and review status

Recovered the complete latest catalog file set found across the inspected local sources into `recovery/catalog-complete-20261026`, based on fresh `upstream/staging` at `6a3223fc9e03e40de93a6c5d57f42a85536c895e`.

Worktree: `E:\Shelf Merch\SMIO\worktrees\catalog-recovery-20261026`.

Recovered **70 catalog files: 51 additions and 19 modifications**. Also added two local build-output ignore rules and this report/inventory. All 70 recovered files matched their selected source Git blob bytes before staging. Final whitespace validation removed excess trailing blank lines from three recovered asset README files and catalog-navigation.ts; source behavior is unchanged. No dependency or route configuration change was required.

**Ready for staging review, with existing repository check limitations:** all web tests, API Pixel checks and production build pass; TypeScript has 26 identical baseline errors on staging and recovery. Lint cannot run with the installed TypeScript/parser setup. This is a reviewable recovery, not a claim that the repository's entire CI is green.

No push, merge, deployment, database update, stash application, branch deletion or original-checkout source edit was performed.

## Why the pushed catalog branch was incomplete

`feature/catalog-development`, `origin/feature/catalog-development`, and current `upstream/staging` all resolve to `6a3223f`. Their tracked contents are identical. Thus the pushed branch contains an earlier catalog state.

The latest work survived in stash **`75ca89f50d5538321dc2941f5afa65efe6299b7c`**, named `backup-mixed-pixel-catalog-before-staging`, created 26 October 2026 at 16:39:54 +0530. The stash has both tracked edits and a third parent holding untracked components/assets. Recovering just tracked changes or copying the old catalog branch would miss those files.

The stash also contains older consent/Pixel code and 834 generated build deletions. Applying it wholesale would regress staging. Recovery copied catalog blobs selectively instead.

## Investigated sources and initial Git state

| Source | Finding |
| --- | --- |
| Original checkout | Branch staging, HEAD 6a3223f; tracked clean; six untracked cookie preview images/scripts retained |
| Catalog worktree | feature/catalog-development at 6a3223f; tracked clean; nine old editorial preview screenshots retained |
| Pixel worktree | feat/openai-pixel-clean at 1d2101b; clean; retained |
| upstream/staging | Fetched; 6a3223fc9e03e40de93a6c5d57f42a85536c895e |
| upstream/main | Fetched; 1d2101b81778b5137ffce5888476e5c7c40318c9 |
| feat/openai-ads-pixel-disabled | c5881d93eba9cda52c7664b3ffc8020b732d63c3; retained |
| Backup branches | backup/c5881d9-mixed-pixel-catalog, backup/feature-catalog-development-eb75f51, backup/feat-openai-pixel-clean-4a42a71 inspected; retained |
| Other local branches/remotes | Enumerated and compared; no local branch commit absent from all remote refs (count 0) |
| Reflogs/object recovery | Inspected; git fsck --full --no-reflogs --unreachable found no additional unreachable objects |
| All stashes | One stash; inspected by Git object reads, never applied, popped, dropped or edited |
| Older disk backup | E:\Shelf Merch\SMIO\backups\2026-10-25-openai-catalog-split: worktree, later-uncommitted, generated output, patch and repo.bundle inspected |

The disk backup audit compared 107 relevant files in `worktree` and 105 in `later-uncommitted` against staging and the combined stash tree. **No path was missing from both.** Three files in the older worktree differed from both (CatalogCategoryView, its tests and catalog-editorial.css); their stash versions include subsequent category-scoping and editorial improvements. The older bundle's branch refs predate the fresh remote staging state.

Stash parents:
- Base: `c5881d93eba9cda52c7664b3ffc8020b732d63c3`
- Index: `f3f6f6e54cd119fc936e2c1fb69d215a3c6851f5` (identical to stash base)
- Untracked files: `1483317c103cf0cf0577ae0a87df6f982a0452a5`

## Recovered functionality

| Area | Recovered completed implementation |
| --- | --- |
| Header/catalog navigation | Desktop hover mega-menu, category/type links, dynamic category previews, apparel models artwork, mobile toggle, keyboard/outside/Escape dismissal; contextual Catalog link and /app + /apps routes |
| Resources | Three-column library/team/featured layout with existing working resource links and catalog CTA; responsive menu |
| Catalog overview | Shared overview/landing artwork, All Products link, flattened category navigation, Kits entry, Decor hidden, consistent typography/card aspect ratios and spacing |
| Category shopping | Correct Accessories vs Stationery scope; parent/child navigation, breadcrumbs, search, custom sort menu, attribute/price filters and clear behavior |
| Full catalog data | Complete-seed guard prevents accepting a partial All Products snapshot; existing paginated API reader retained |
| Editorial pages | Existing Apparel/Bags/Stationery/Drinkware/Travel pages integrated with latest shared styles and product cards; Electronics, Kitchenware and Home Appliances sections/assets restored; kitchen/appliances remain separate |
| Product cards | Compact text/price spacing, brand/AS LOW AS/minimum layout, stable border and product-image hover; consistent listing/editorial/latest/featured presentation |
| Product detail | Revised layout, title/price typography, retained real product content and selections, mouse-tracking magnifier lens and side preview |
| Carousels | Shared latest-product carousel and both category directions with state/cleanup tests |
| Featured products | “Discover our products” replaces duplicated occasion cards; live product data/links including vacuum cleaner and neck/shoulder massager |
| Sticky sidebar | All Products sidebar sticks below header, scrolls internally when needed, remains bounded by the product section |
| Favicon | Catalog-only SVG favicon and lifecycle hook/tests, restoring the original icon outside catalog |
| Assets/tests | All selected image assets, generation notes, new regression tests and CSS recovered together |

## File inventory and provenance

[Full file-by-file inventory](catalog-recovery-2026-10-26-inventory.csv) includes selected local/staging blob hashes and the disposition of every compared changed/untracked source plus relevant staged catalog files.

Inventory totals:
- 51 recovered additions.
- 19 recovered modifications.
- 104 compared files already present in staging.
- 834 generated-build changes excluded; existing staging build files retained.
- 48 stash preview screenshots/scripts excluded.
- 14 unrelated consent/Pixel/configuration/experiment differences excluded, retaining staging.
- 9 old-tree deletions rejected, retaining newer staging consent files.

### Added catalog files

- `apps/web/assets/catalog/all-products-lifestyle.md`
- `apps/web/assets/catalog/all-products-lifestyle.png`
- `apps/web/assets/catalog/apparel-menu-models.md`
- `apps/web/assets/catalog/apparel-menu-models.png`
- `apps/web/assets/catalog/apparel-sweatshirt-closeup.md`
- `apps/web/assets/catalog/apparel-sweatshirt-closeup.png`
- `apps/web/assets/catalog/backpack-lifestyle.md`
- `apps/web/assets/catalog/backpack-lifestyle.png`
- `apps/web/assets/catalog/drinkware-tumbler-lifestyle.md`
- `apps/web/assets/catalog/drinkware-tumbler-lifestyle.png`
- `apps/web/assets/catalog/electronics-editorial/README.md`
- `apps/web/assets/catalog/electronics-editorial/gadgets.png`
- `apps/web/assets/catalog/electronics-editorial/hero.png`
- `apps/web/assets/catalog/electronics-editorial/kits.png`
- `apps/web/assets/catalog/electronics-editorial/organisers.png`
- `apps/web/assets/catalog/electronics-editorial/workspace.png`
- `apps/web/assets/catalog/electronics-speaker.md`
- `apps/web/assets/catalog/electronics-speaker.png`
- `apps/web/assets/catalog/home-appliances-editorial/README.md`
- `apps/web/assets/catalog/home-appliances-editorial/everyday.png`
- `apps/web/assets/catalog/home-appliances-editorial/hero.png`
- `apps/web/assets/catalog/kitchen-editorial/README.md`
- `apps/web/assets/catalog/kitchen-editorial/hero.png`
- `apps/web/assets/catalog/kitchen-editorial/kits.png`
- `apps/web/assets/catalog/kitchen-editorial/rituals.png`
- `apps/web/assets/catalog/travel-accessories-closeup.md`
- `apps/web/assets/catalog/travel-accessories-closeup.png`
- `apps/web/public/catalog-favicon.svg`
- `apps/web/src/components/landing/CatalogDropdown.test.tsx`
- `apps/web/src/components/landing/CatalogDropdown.tsx`
- `apps/web/src/components/landing/catalog-dropdown.css`
- `apps/web/src/components/resources/ResourceDropdown.test.tsx`
- `apps/web/src/features/catalog/useCatalogFavicon.test.tsx`
- `apps/web/src/features/catalog/useCatalogFavicon.ts`
- `apps/web/src/features/catalog/views/CategoryCarousel.test.tsx`
- `apps/web/src/features/catalog/views/ElectronicsEditorialView.tsx`
- `apps/web/src/features/catalog/views/FeaturedCatalogProducts.test.tsx`
- `apps/web/src/features/catalog/views/FeaturedCatalogProducts.tsx`
- `apps/web/src/features/catalog/views/HomeEditorialView.tsx`
- `apps/web/src/features/catalog/views/LatestProductCarousel.test.tsx`
- `apps/web/src/features/catalog/views/LatestProductCarousel.tsx`
- `apps/web/src/features/catalog/views/ProductImageMagnifier.test.tsx`
- `apps/web/src/features/catalog/views/ProductImageMagnifier.tsx`
- `apps/web/src/features/catalog/views/catalog-navigation.ts`
- `apps/web/src/features/catalog/views/catalog-product-detail.css`
- `apps/web/src/features/catalog/views/featured-catalog-products.css`
- `apps/web/src/features/catalog/views/imageZoomGeometry.test.ts`
- `apps/web/src/features/catalog/views/imageZoomGeometry.ts`
- `apps/web/src/features/catalog/views/latest-product-carousel.css`
- `apps/web/src/features/catalog/views/product-card.css`
- `apps/web/src/features/catalog/views/product-image-magnifier.css`

### Modified catalog files

- `apps/web/src/components/landing-page.css`
- `apps/web/src/components/landing/Header.tsx`
- `apps/web/src/components/resources/ResourceDropdown.tsx`
- `apps/web/src/components/resources/resource-nav.css`
- `apps/web/src/features/catalog/CatalogCategoryPage.tsx`
- `apps/web/src/features/catalog/PublicCatalogPage.tsx`
- `apps/web/src/features/catalog/controllers/useCatalogController.ts`
- `apps/web/src/features/catalog/model.ts`
- `apps/web/src/features/catalog/views/CatalogBrowseView.tsx`
- `apps/web/src/features/catalog/views/CatalogCategoryView.test.tsx`
- `apps/web/src/features/catalog/views/CatalogCategoryView.tsx`
- `apps/web/src/features/catalog/views/CatalogProductListing.tsx`
- `apps/web/src/features/catalog/views/CatalogProductView.tsx`
- `apps/web/src/features/catalog/views/CatalogView.tsx`
- `apps/web/src/features/catalog/views/CategoryCarousel.tsx`
- `apps/web/src/features/catalog/views/ProductCard.tsx`
- `apps/web/src/features/catalog/views/ProductDetail.tsx`
- `apps/web/src/features/catalog/views/catalog-editorial.css`
- `apps/web/src/features/catalog/views/catalog-view.css`

### Already present in staging

These were compared and retained, rather than reintroduced from older versions:
- ApparelEditorialGrid, BagsEditorialGrid, CatalogEditorialGrid, DrinkwareEditorialGrid, TravelEditorialView and their existing images.
- Existing category taxonomy/types, product matching and product/category route definitions.
- `apps/web/src/features/catalog/newestProducts.ts` and its tests.
- `apps/web/src/services/api-bridge.ts` pagination implementation and `catalogPagination.test.ts`.
- Existing landing/editorial assets under catalog-style-spotlight and category image directories.
- The inventory's “already present in staging” rows enumerate all 104 compared identical files.

There were no latest catalog files found only in the catalog branch or current original tracked working tree. The current original untracked files are cookie previews; the catalog worktree's untracked files are old screenshots.

### Excluded deliberately

- 834 deleted files under generated `.catalog-review-build` / `.codex-build` trees; no generated change is committed. The verification build reused an existing tracked output directory in the recovery worktree; only generated files it touched were returned to their staging bytes before commit.
- Stash preview images and temporary QA scripts; original cookie previews; local browser screenshots/profiles/caches; dependency junctions.
- Stash versions of main.tsx, Footer.tsx, services/api.ts, API app/CSP files, RequestDemoForm, privacy/legal pages and MeasurementConsentChoice experiments. Those versions would remove or regress newer consent/lead-tracking behavior.
- Environment/template differences unrelated to catalog; no secret values copied.
- The approved full-width black cookie banner remained a preview in the original checkout. It is **not** implemented by this recovery, as the current task requires consent behavior to remain unchanged.

## Conflict resolution and preservation checks

No whole-stash application or cherry-pick was used. Each selected catalog/shared file was compared against current staging. The shared landing-page.css change is only the catalog desktop header/flush offset rule. Header and Resources changes affect catalog navigation only; Footer, app bootstrap, API client and consent implementation remain staging versions.

Twenty-one protected bootstrap/footer/API/consent/Pixel files were checked against staging and are unchanged. The final commit path audit additionally ensures the only production changes are selected catalog/assets/shared navigation files and .gitignore. Pixel enablement was not changed.

No missing asset or import was found by the production build. Package manifests and lockfile are unchanged. Existing installed dependencies were linked into the isolated worktree solely for verification.

## Verification

| Check | Result |
| --- | --- |
| Complete web suite | **PASS: 65 test files, 321 tests** |
| Catalog/navigation/product regressions | Included in web suite: category flows, menus, filters/sort, featured products, carousels, favicon, zoom geometry/magnifier, pagination/newest sorting |
| Consent/Pixel regressions | Included in web suite: ConsentBanner, consentChoice, googleConsent, leadConversion, measurementConsent, openaiPixel and request-demo checks |
| API Pixel CSP test | **PASS: 1 file, 2 tests**, apps/api/tests/openai-pixel-csp.test.js |
| Staged whitespace/path audit | PASS; only the 73 whitelisted catalog/documentation/.gitignore files |
| Production build | **PASS**, Vite 8.1.5, 3445 transformed modules |
| TypeScript | **BASELINE FAILURE: 26 errors**, identical on original clean staging and recovery; none added by recovered files |
| Lint | **BLOCKED by installed tooling**: default lint cannot resolve TypeScript; making workspace TypeScript available reports typescript-eslint does not support TS 7.0 |
| Desktop browser | PASS: catalog overview, all nine category landings, All Products, product detail, magnifier and landing featured products |
| Mobile browser (390px) | PASS: overview, Stationery and All Products; hamburger and catalog submenu open |
| Browser runtime | No captured uncaught browser exceptions; no broken completed images or horizontal overflow in inspected pages |
| Live data | API returns 100 on page one of two, total 109; UI renders **109 product cards** |
| Sidebar | After document scroll, computed position sticky, top 96px |
| Carousel | After advancing, Previous categories is enabled |
| Magnifier | Hover renders the side preview and lens |
| Desktop menu | Hover opens catalog mega-menu; keyboard/mobile behavior also covered by component tests |

Build warnings: local VITE_GTM_ID unset (tracking snippets remain disabled), and a >500kB chunk warning. No production environment or analytics setting was changed.

TypeScript baseline errors cover KitAcceptPortal, HrisMarketplaceDetailView, kit dialogs/controller/SendKitView, artworkStepModel tests, swag-and-media tests, duplicate API bridge fields, mutations-api inviteStatus, and Vite HTTP server typings. Those unrelated files were not edited during recovery.

The in-app browser Node REPL was unavailable, so headless Edge with a temporary profile inspected localhost:8082. Screenshots and browser JSON were kept outside Git under `C:\Users\codes\AppData\Local\Temp`:
- catalog-recovery-desktop.png
- catalog-recovery-mobile.png
- catalog-recovery-menu.png
- catalog-recovery-zoom.png
- shelfmerch-recovery-browser.json

Early overview screenshots were refreshed after the live data finished loading. The first screenshot attempt timed out; the retry completed successfully with no runtime exceptions. Initial full-suite output included happy-dom iframe-abort stderr in existing integration tests; Vitest still reported 321 passing tests and exit 0.

## Remaining limitations / unrecovered work

No completed catalog file present in the inspected working trees, combined stash or older relevant backup was left unrecovered or overwritten by an older version. This conclusion is bounded to those available sources.

Historical database-only edits (for example oversized category assignment) are not Git source changes. No database mutation or migration was attempted. Data correctness across different deployed databases still needs environment-specific review.

Lint/toolchain and the pre-existing TypeScript errors remain for a separate repair. The black cookie-banner preview remains separate as described above. No hosted staging deployment was tested or changed.

## Next Git commands

The recovery commit is local. Its exact hash is available with the first command; it cannot be embedded in the same commit's own contents.

```powershell
git -C "E:\Shelf Merch\SMIO\worktrees\catalog-recovery-20261026" log -1 --format="%H %s"
git -C "E:\Shelf Merch\SMIO\worktrees\catalog-recovery-20261026" diff --stat upstream/staging...HEAD
git -C "E:\Shelf Merch\SMIO\worktrees\catalog-recovery-20261026" diff upstream/staging...HEAD -- apps/web/src
```

After reviewing and explicitly approving the push:

```powershell
git -C "E:\Shelf Merch\SMIO\worktrees\catalog-recovery-20261026" push -u origin recovery/catalog-complete-20261026
```

Then open a pull request from that origin branch to `shelfmerch-2030/shelf_merch:staging`. Do not merge until the review and check limitations above are addressed. No push command has been executed.
