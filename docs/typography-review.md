# ShelfMerch typography review

Local implementation, 21 October 2026. No deployment, push, or commit was performed.

## Changes

Hanken Grotesk is the primary family for application UI, authentication, storefronts, public and marketing pages, publishing panels, success screens, tables, forms, charts, modals, and navigation. Existing CSS family overrides and inline style objects now use the shared tokens. Legacy design-system aliases resolve to the same family. Decorative dashboard monospace and chart values use the primary family with existing tabular numeral behavior.

Weights are normalized to Regular (400), Medium (500), Semibold (600), and Bold (700). Existing heavier UI weights map to Bold, avoiding synthetic 800/900 styling. Italic emphasis uses the real Hanken italic face.

The task-start snapshot comparison found **zero changes outside font-family and font-weight declarations** across the existing application source, excluding the explicitly reviewed typography imports, theme mappings, and font-loading links. All previously approved font sizes, line heights, dimensions, padding, margins, spacing, colors, radii, and non-typography functionality are preserved. Earlier uncommitted application changes were retained.

## Central configuration

[apps/web/public/fonts/typography.css](../apps/web/public/fonts/typography.css) contains the font faces, primary family, technical fallback stacks, and weight tokens:

| Token | Value |
| --- | --- |
| --font-family-primary | 'Hanken Grotesk', system-ui, sans-serif |
| --font-weight-regular | 400 |
| --font-weight-medium | 500 |
| --font-weight-semibold | 600 |
| --font-weight-bold | 700 |
| --sans / --disp | Aliases of --font-family-primary |

[apps/web/src/styles/typography.css](../apps/web/src/styles/typography.css) imports that configuration through the existing CSS base layer. The standalone Merge host loads the same configuration directly. Tailwind font utilities point to the shared family and weight tokens.

The eight WOFF2 files are variable-font subsets for normal/italic Latin, extended Latin, Vietnamese, and extended Cyrillic. Each style/subset serves the entire 400?700 range; they are not four duplicated weight files. Only the normal Latin face is preloaded. Other subsets and italics load when needed. The CSS uses font-display:block to avoid a late visible font swap. The old Google Fonts stylesheet and its Bricolage/Inter requests were removed.

Sources: [Google Fonts Hanken Grotesk](https://fonts.google.com/specimen/Hanken+Grotesk), [upstream font license](https://raw.githubusercontent.com/google/fonts/main/ofl/hankengrotesk/OFL.txt). A license copy ships beside the font assets.

## Preserved exceptions

- Code, JSON editors, error references, production identifiers, and other technical code displays use --font-family-code (system monospace).
- Partner wordmarks retain their original lettering and weights: Catalog brand/team logo selectors, including Google, JPMorgan, Columbia, and Polo. Their exception is separate from application headings and body text.
- Existing logo images, SVG artwork, and icon assets were not edited.
- Emoji and unsupported characters use the platform's glyph fallback. In particular, upstream Hanken Grotesk does not contain **?**. This was confirmed by inspecting the upstream full font's cmap and Chrome's platform-font results. Currency digits use Hanken; the rupee glyph uses the system fallback (Segoe UI in this Windows check).
- Embedded third-party provider interfaces control their own internal typography. ShelfMerch's own integration host text uses the shared font.

## Validation

| Check | Result |
| --- | --- |
| Production build | Passed |
| Existing web tests | 38 files, 208 tests passed |
| Responsive browser checks | 36 cases passed: 12 representative views ? 1440px, 768px, 390px |
| Unexpected application families/weights | 0 family mismatches, 0 unsupported UI weights |
| Document overflow | None detected in the representative previews |
| Clipping review | Automated leaf checks passed; visual review found an existing Dashboard label clipped by an ancestor card (see below) |
| Actual font rendering | Chrome confirmed bundled Hanken Grotesk for headings and currency digits |
| Source scope comparison | No changes to approved sizes or other style/layout properties |
| TypeScript | 27 existing errors remain; no new typography diagnostics |
| Existing lint command | Cannot start: typescript-eslint cannot resolve the installed typescript module |

Browser checks used server-rendered production components with fixture data and production CSS: login, signup, Dashboard with expanded sidebar, all four allocation steps, Catalog, kit publishing success, funding success, a modal/code sample, and marketing content inside shadow DOM. They verify typography and responsive rendering; they do not claim authenticated end-to-end coverage of every page or third-party provider.

Each requested font URL was fetched once per browser session and then cached. The cold local load and subsequent renders used the bundled font with no late font changes observed. The production build retains the existing undefined VITE_GTM_ID warning. The web tests retain existing Merge/happy-dom abort console messages while passing.

[Browser check data](../previews/typography-review/browser-checks.json) ? [Source scope check](../previews/typography-review/source-scope-check.json)

### Screenshots

- [Desktop Dashboard](../previews/typography-review/dashboard-1440.png)
- [Desktop allocation review](../previews/typography-review/allocation-step-4-1440.png)
- [Mobile login](../previews/typography-review/login-390.png)
- [Mobile manager assignment](../previews/typography-review/allocation-step-3-390.png)
- [Mobile publishing success](../previews/typography-review/kit-published-390.png)

## Remaining inconsistencies and limits

No unintended font-family differences were found in application source or the representative rendered views.

**Existing layout limitation:** At 1440px with the sidebar expanded, the Dashboard budget card can clip ?Allocated to departments.? Its existing nowrap rule and ancestor clipping are unchanged, and this label already used Hanken Grotesk at the same size and weight before the task. The initial automated check only examined leaf overflow and missed ancestor clipping; visual review caught it. It is documented rather than changing layout, wrapping, dimensions, or approved font sizes. The mobile allocation stepper also retains its existing intentional horizontal scrolling. The technical/branding/glyph exceptions above are intentional. Legacy public/preview-*.html design experiments are not application routes and were left unchanged. Lint and existing TypeScript failures remain repository/tooling issues outside this typography task.

## Modified existing application files (93)

- [apps/web/index.html](../apps/web/index.html)
- [apps/web/public/merge-link-host.html](../apps/web/public/merge-link-host.html)
- [apps/web/src/components/KitAcceptPortal.tsx](../apps/web/src/components/KitAcceptPortal.tsx)
- [apps/web/src/components/StoreBanner.tsx](../apps/web/src/components/StoreBanner.tsx)
- [apps/web/src/components/contacts-page.css](../apps/web/src/components/contacts-page.css)
- [apps/web/src/components/landing-mobile.css](../apps/web/src/components/landing-mobile.css)
- [apps/web/src/components/landing-page.css](../apps/web/src/components/landing-page.css)
- [apps/web/src/components/landing/Testimonials.tsx](../apps/web/src/components/landing/Testimonials.tsx)
- [apps/web/src/components/landing/_extracted/style.css](../apps/web/src/components/landing/_extracted/style.css)
- [apps/web/src/components/platform/PlatformLayout.tsx](../apps/web/src/components/platform/PlatformLayout.tsx)
- [apps/web/src/components/platform/PrintAreaEditor.tsx](../apps/web/src/components/platform/PrintAreaEditor.tsx)
- [apps/web/src/components/platform/blog-admin.css](../apps/web/src/components/platform/blog-admin.css)
- [apps/web/src/components/platform/pages/catalog/views/CatalogView.tsx](../apps/web/src/components/platform/pages/catalog/views/CatalogView.tsx)
- [apps/web/src/components/platform/pages/kit-wizard/views/KitWizardView.tsx](../apps/web/src/components/platform/pages/kit-wizard/views/KitWizardView.tsx)
- [apps/web/src/components/platform/pages/orders/views/OrderFulfillmentActionsView.tsx](../apps/web/src/components/platform/pages/orders/views/OrderFulfillmentActionsView.tsx)
- [apps/web/src/components/platform/pages/orders/views/OrderFulfillmentView.tsx](../apps/web/src/components/platform/pages/orders/views/OrderFulfillmentView.tsx)
- [apps/web/src/components/platform/pages/orders/views/OrdersView.tsx](../apps/web/src/components/platform/pages/orders/views/OrdersView.tsx)
- [apps/web/src/components/platform/pages/orders/views/fulfillment-parts.tsx](../apps/web/src/components/platform/pages/orders/views/fulfillment-parts.tsx)
- [apps/web/src/components/platform/pages/product-wizard/views/ProductWizardView.tsx](../apps/web/src/components/platform/pages/product-wizard/views/ProductWizardView.tsx)
- [apps/web/src/components/platform/pages/product-wizard/views/product-wizard-upload.tsx](../apps/web/src/components/platform/pages/product-wizard/views/product-wizard-upload.tsx)
- [apps/web/src/components/platform/pages/settings/views/SettingEditModalView.tsx](../apps/web/src/components/platform/pages/settings/views/SettingEditModalView.tsx)
- [apps/web/src/components/platform/pages/shopify-import/views/ImportGroup.tsx](../apps/web/src/components/platform/pages/shopify-import/views/ImportGroup.tsx)
- [apps/web/src/components/platform/pages/tenants/TenantDetailPage.tsx](../apps/web/src/components/platform/pages/tenants/TenantDetailPage.tsx)
- [apps/web/src/components/platform/pages/tenants/views/TenantsView.tsx](../apps/web/src/components/platform/pages/tenants/views/TenantsView.tsx)
- [apps/web/src/components/resources/resource-nav.css](../apps/web/src/components/resources/resource-nav.css)
- [apps/web/src/components/resources/resources.css](../apps/web/src/components/resources/resources.css)
- [apps/web/src/components/store/StoreShell.tsx](../apps/web/src/components/store/StoreShell.tsx)
- [apps/web/src/components/tenant/collapsible-sidebar.css](../apps/web/src/components/tenant/collapsible-sidebar.css)
- [apps/web/src/components/ui/chart.tsx](../apps/web/src/components/ui/chart.tsx)
- [apps/web/src/features/campaigns/campaigns-page.css](../apps/web/src/features/campaigns/campaigns-page.css)
- [apps/web/src/features/campaigns/views/SendGiftDialogView.tsx](../apps/web/src/features/campaigns/views/SendGiftDialogView.tsx)
- [apps/web/src/features/campaigns/views/SendPointsView.tsx](../apps/web/src/features/campaigns/views/SendPointsView.tsx)
- [apps/web/src/features/catalog/views/CatalogKitsGrid.tsx](../apps/web/src/features/catalog/views/CatalogKitsGrid.tsx)
- [apps/web/src/features/catalog/views/catalog-view.css](../apps/web/src/features/catalog/views/catalog-view.css)
- [apps/web/src/features/contacts/contacts-page.css](../apps/web/src/features/contacts/contacts-page.css)
- [apps/web/src/features/dashboard/dashboard.css](../apps/web/src/features/dashboard/dashboard.css)
- [apps/web/src/features/docs/docs.css](../apps/web/src/features/docs/docs.css)
- [apps/web/src/features/home/home.css](../apps/web/src/features/home/home.css)
- [apps/web/src/features/integrations/integrations-page.css](../apps/web/src/features/integrations/integrations-page.css)
- [apps/web/src/features/integrations/slack-landing/slack-integration-landing.css](../apps/web/src/features/integrations/slack-landing/slack-integration-landing.css)
- [apps/web/src/features/integrations/slack-marketplace.css](../apps/web/src/features/integrations/slack-marketplace.css)
- [apps/web/src/features/kits/KitDetailDialog.tsx](../apps/web/src/features/kits/KitDetailDialog.tsx)
- [apps/web/src/features/kits/KitPreviewDialog.tsx](../apps/web/src/features/kits/KitPreviewDialog.tsx)
- [apps/web/src/features/kits/curatedKitCardStyles.ts](../apps/web/src/features/kits/curatedKitCardStyles.ts)
- [apps/web/src/features/kits/kits-page.css](../apps/web/src/features/kits/kits-page.css)
- [apps/web/src/features/kits/views/EditKitView.tsx](../apps/web/src/features/kits/views/EditKitView.tsx)
- [apps/web/src/features/kits/views/KitDetailView.tsx](../apps/web/src/features/kits/views/KitDetailView.tsx)
- [apps/web/src/features/kits/views/KitReviewPricingStep.tsx](../apps/web/src/features/kits/views/KitReviewPricingStep.tsx)
- [apps/web/src/features/kits/views/KitWizardView.tsx](../apps/web/src/features/kits/views/KitWizardView.tsx)
- [apps/web/src/features/kits/views/KitsEmptyState.tsx](../apps/web/src/features/kits/views/KitsEmptyState.tsx)
- [apps/web/src/features/kits/views/KitsView.tsx](../apps/web/src/features/kits/views/KitsView.tsx)
- [apps/web/src/features/kits/views/PreDesignedKits.tsx](../apps/web/src/features/kits/views/PreDesignedKits.tsx)
- [apps/web/src/features/kits/views/RequestSampleView.tsx](../apps/web/src/features/kits/views/RequestSampleView.tsx)
- [apps/web/src/features/kits/views/SendKitView.tsx](../apps/web/src/features/kits/views/SendKitView.tsx)
- [apps/web/src/features/kits/views/kit-published-success.css](../apps/web/src/features/kits/views/kit-published-success.css)
- [apps/web/src/features/kits/views/request-sample.css](../apps/web/src/features/kits/views/request-sample.css)
- [apps/web/src/features/legal/legal.css](../apps/web/src/features/legal/legal.css)
- [apps/web/src/features/marketing/MarketingHtmlPage.tsx](../apps/web/src/features/marketing/MarketingHtmlPage.tsx)
- [apps/web/src/features/marketing/pages/about.html](../apps/web/src/features/marketing/pages/about.html)
- [apps/web/src/features/marketing/pages/careers.html](../apps/web/src/features/marketing/pages/careers.html)
- [apps/web/src/features/marketing/pages/platform.html](../apps/web/src/features/marketing/pages/platform.html)
- [apps/web/src/features/marketing/pages/privacy.html](../apps/web/src/features/marketing/pages/privacy.html)
- [apps/web/src/features/marketing/pages/terms.html](../apps/web/src/features/marketing/pages/terms.html)
- [apps/web/src/features/marketing/public-support.css](../apps/web/src/features/marketing/public-support.css)
- [apps/web/src/features/orders/views/OrderDetailDialogView.tsx](../apps/web/src/features/orders/views/OrderDetailDialogView.tsx)
- [apps/web/src/features/request-demo/request-demo.css](../apps/web/src/features/request-demo/request-demo.css)
- [apps/web/src/features/send/PaymentPanel.tsx](../apps/web/src/features/send/PaymentPanel.tsx)
- [apps/web/src/features/send/RecipientExperience.tsx](../apps/web/src/features/send/RecipientExperience.tsx)
- [apps/web/src/features/settings/settings-page.css](../apps/web/src/features/settings/settings-page.css)
- [apps/web/src/features/settings/views/TransferOwnershipDialogView.tsx](../apps/web/src/features/settings/views/TransferOwnershipDialogView.tsx)
- [apps/web/src/features/shops/BannerCustomUpload.tsx](../apps/web/src/features/shops/BannerCustomUpload.tsx)
- [apps/web/src/features/shops/BannerEditorDialog.tsx](../apps/web/src/features/shops/BannerEditorDialog.tsx)
- [apps/web/src/features/shops/ShopBuilderStep.tsx](../apps/web/src/features/shops/ShopBuilderStep.tsx)
- [apps/web/src/features/shops/ShopCard.tsx](../apps/web/src/features/shops/ShopCard.tsx)
- [apps/web/src/features/shops/tabs/GeneralSettingsTab.tsx](../apps/web/src/features/shops/tabs/GeneralSettingsTab.tsx)
- [apps/web/src/features/shops/tabs/ReportsTab.tsx](../apps/web/src/features/shops/tabs/ReportsTab.tsx)
- [apps/web/src/features/shops/tabs/SentGiftsTab.tsx](../apps/web/src/features/shops/tabs/SentGiftsTab.tsx)
- [apps/web/src/features/shops/views/CreateShopView.tsx](../apps/web/src/features/shops/views/CreateShopView.tsx)
- [apps/web/src/features/support/support-page.css](../apps/web/src/features/support/support-page.css)
- [apps/web/src/features/swag/views/SwagWizardView.tsx](../apps/web/src/features/swag/views/SwagWizardView.tsx)
- [apps/web/src/features/swag/wizard/CatalogStep.tsx](../apps/web/src/features/swag/wizard/CatalogStep.tsx)
- [apps/web/src/features/wallets/components/DepartmentModal.tsx](../apps/web/src/features/wallets/components/DepartmentModal.tsx)
- [apps/web/src/features/wallets/components/Donut.tsx](../apps/web/src/features/wallets/components/Donut.tsx)
- [apps/web/src/features/wallets/components/OrgDashboard.tsx](../apps/web/src/features/wallets/components/OrgDashboard.tsx)
- [apps/web/src/features/wallets/components/OrgDoneScreen.tsx](../apps/web/src/features/wallets/components/OrgDoneScreen.tsx)
- [apps/web/src/features/wallets/components/OrgWizard.tsx](../apps/web/src/features/wallets/components/OrgWizard.tsx)
- [apps/web/src/features/wallets/components/WalletDetailsDialog.tsx](../apps/web/src/features/wallets/components/WalletDetailsDialog.tsx)
- [apps/web/src/features/wallets/components/steps/Step1Wallet.tsx](../apps/web/src/features/wallets/components/steps/Step1Wallet.tsx)
- [apps/web/src/features/wallets/components/steps/Step4Managers.tsx](../apps/web/src/features/wallets/components/steps/Step4Managers.tsx)
- [apps/web/src/features/wallets/components/steps/Step5Review.tsx](../apps/web/src/features/wallets/components/steps/Step5Review.tsx)
- [apps/web/src/styles.css](../apps/web/src/styles.css)
- [apps/web/src/styles/auth.css](../apps/web/src/styles/auth.css)
- [apps/web/src/styles/shelf-merch.css](../apps/web/src/styles/shelf-merch.css)

## Added typography configuration and assets

- [apps/web/public/fonts/typography.css](../apps/web/public/fonts/typography.css)
- [apps/web/src/styles/typography.css](../apps/web/src/styles/typography.css)
- [apps/web/public/fonts/hanken-grotesk/italic-cyrillic-ext.woff2](../apps/web/public/fonts/hanken-grotesk/italic-cyrillic-ext.woff2)
- [apps/web/public/fonts/hanken-grotesk/italic-latin-ext.woff2](../apps/web/public/fonts/hanken-grotesk/italic-latin-ext.woff2)
- [apps/web/public/fonts/hanken-grotesk/italic-latin.woff2](../apps/web/public/fonts/hanken-grotesk/italic-latin.woff2)
- [apps/web/public/fonts/hanken-grotesk/italic-vietnamese.woff2](../apps/web/public/fonts/hanken-grotesk/italic-vietnamese.woff2)
- [apps/web/public/fonts/hanken-grotesk/normal-cyrillic-ext.woff2](../apps/web/public/fonts/hanken-grotesk/normal-cyrillic-ext.woff2)
- [apps/web/public/fonts/hanken-grotesk/normal-latin-ext.woff2](../apps/web/public/fonts/hanken-grotesk/normal-latin-ext.woff2)
- [apps/web/public/fonts/hanken-grotesk/normal-latin.woff2](../apps/web/public/fonts/hanken-grotesk/normal-latin.woff2)
- [apps/web/public/fonts/hanken-grotesk/normal-vietnamese.woff2](../apps/web/public/fonts/hanken-grotesk/normal-vietnamese.woff2)
- [apps/web/public/fonts/hanken-grotesk/OFL.txt](../apps/web/public/fonts/hanken-grotesk/OFL.txt)

Review artifacts are under previews/typography-review; this report is docs/typography-review.md.
