import { readFileSync } from 'node:fs';
import { presentZohoDocs } from './zohoDocsPresentation.js';
const zohoOnboardingStyles = readFileSync(new URL('../../static/zoho-onboarding.css', import.meta.url), 'utf8');
const zohoPresentationStyles = readFileSync(new URL('../../static/zoho-docs-presentation.css', import.meta.url), 'utf8');

/** Shared CSS for ShelfMerch public documentation HTML pages. */
export const DOCS_SHARED_STYLES = `
:root {
  --ink: #101014;
  --ink-2: #4b5563;
  --ink-3: #6b7280;
  --line: #e5e7eb;
  --bg: #f7f8fa;
  --card: #ffffff;
  --brand: #3D5FD9;
  --brand-d: #2743B8;
  --brand-50: #EDF1FC;
  --sans: "Hanken Grotesk", system-ui, sans-serif;
  --disp: "Bricolage Grotesque", Georgia, serif;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: var(--sans);
  background: var(--bg);
  color: var(--ink);
  font-size: 15px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}
a { color: var(--brand); text-decoration: none; }
a:hover { text-decoration: underline; }
.docs-shell { min-height: 100vh; display: flex; flex-direction: column; }
.docs-top {
  position: sticky; top: 0; z-index: 40;
  background: var(--card);
  border-bottom: 1px solid var(--line);
  padding: 12px 20px;
}
.docs-top-inner {
  max-width: 1120px; margin: 0 auto;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
}
.docs-logo {
  font-family: var(--disp); font-weight: 700; font-size: 18px;
  color: var(--ink); letter-spacing: -0.02em; text-decoration: none;
}
.docs-logo:hover { text-decoration: none; }
.docs-top-nav { display: flex; gap: 14px; flex-wrap: wrap; font-size: 13px; font-weight: 600; }
.docs-layout {
  max-width: 1120px; margin: 0 auto; width: 100%;
  display: grid; grid-template-columns: 240px 1fr; gap: 28px;
  padding: 28px 20px 64px; flex: 1;
}
.docs-side {
  position: sticky; top: 72px; align-self: start;
  background: var(--card); border: 1px solid var(--line); border-radius: 12px;
  padding: 16px;
}
.docs-side h2 {
  margin: 0 0 10px; font-size: 11px; letter-spacing: .08em;
  text-transform: uppercase; color: var(--ink-3);
}
.docs-side a {
  display: block; padding: 8px 10px; border-radius: 8px;
  color: var(--ink-2); font-size: 13.5px; font-weight: 500; text-decoration: none;
}
.docs-side a:hover, .docs-side a[aria-current="page"] {
  background: var(--brand-50); color: var(--brand-d); text-decoration: none;
}
.docs-main {
  background: var(--card); border: 1px solid var(--line); border-radius: 12px;
  padding: 36px 40px; min-width: 0;
}
.docs-crumbs {
  font-size: 13px; color: var(--ink-3); margin: 0 0 18px; display: flex; flex-wrap: wrap; gap: 6px;
}
.docs-crumbs a { color: var(--ink-2); }
h1 {
  font-family: var(--disp); font-size: clamp(1.6rem, 3.5vw, 2.1rem);
  line-height: 1.2; letter-spacing: -0.02em; margin: 0 0 10px;
}
.docs-sub { margin: 0 0 28px; color: var(--ink-2); font-size: 16px; }
.docs-badge {
  display: inline-block; margin-bottom: 12px; padding: 4px 10px; border-radius: 999px;
  background: var(--brand-50); color: var(--brand-d); font-size: 12px; font-weight: 700;
}
h2 {
  font-family: var(--disp); font-size: 1.2rem; margin: 34px 0 10px;
  scroll-margin-top: 88px; letter-spacing: -0.01em;
}
h3 { font-size: 1rem; margin: 20px 0 8px; }
p, ul, ol { margin: 0 0 14px; color: var(--ink-2); }
ul, ol { padding-left: 1.25rem; }
li { margin-bottom: 6px; }
strong { color: var(--ink); font-weight: 600; }
.docs-cards {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin: 18px 0 28px;
}
.docs-card {
  display: block; border: 1px solid var(--line); border-radius: 12px; padding: 16px;
  background: #fff; color: inherit; text-decoration: none;
}
.docs-card:hover { border-color: var(--brand); box-shadow: 0 0 0 1px var(--brand-50); text-decoration: none; }
.docs-card strong { display: block; margin-bottom: 4px; color: var(--ink); }
.docs-card span { font-size: 13px; color: var(--ink-2); }
.docs-cta {
  display: inline-flex; align-items: center; justify-content: center;
  margin: 6px 8px 6px 0; padding: 10px 16px; border-radius: 10px;
  background: var(--brand); color: #fff !important; font-weight: 700; font-size: 14px;
  text-decoration: none !important;
}
.docs-cta:hover { background: var(--brand-d); }
.docs-cta--ghost {
  background: #fff; color: var(--ink) !important; border: 1px solid var(--line);
}
.docs-cta--ghost:hover { border-color: var(--brand); color: var(--brand-d) !important; }
.docs-callout {
  border: 1px solid var(--line); border-left: 4px solid var(--brand);
  background: var(--brand-50); border-radius: 10px; padding: 14px 16px; margin: 16px 0 22px;
  color: var(--ink-2);
}
.docs-table-wrap { overflow-x: auto; margin: 0 0 18px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--ink); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
.docs-footer {
  border-top: 1px solid var(--line); background: var(--card);
  padding: 22px 20px; text-align: center; font-size: 13px; color: var(--ink-3);
}
.docs-footer-links { display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; margin-bottom: 10px; }
.docs-mobile-nav { display: none; margin-bottom: 16px; }
.docs-mobile-nav details {
  border: 1px solid var(--line); border-radius: 10px; background: #fff; padding: 10px 12px;
}
.docs-mobile-nav summary { cursor: pointer; font-weight: 700; color: var(--ink); }
.docs-mobile-nav a { display: block; padding: 8px 4px; color: var(--ink-2); }
@media (max-width: 900px) {
  .docs-layout { grid-template-columns: 1fr; padding-top: 16px; }
  .docs-side { display: none; }
  .docs-mobile-nav { display: block; }
  .docs-main { padding: 24px 18px; }
}
`;

export function docsHtmlShell({
  title,
  description,
  canonical,
  ogTitle,
  ogDescription,
  activePath,
  breadcrumbsHtml,
  bodyHtml,
}) {
  const nav = [
    ['/docs/zoho-people', 'Overview'],
    ['/docs/zoho-people/user-guide', 'User Guide'],
    ['/docs/zoho-people/admin-guide', 'Administrator Guide'],
    ['/case-studies/zoho-people', 'Example Workflow'],
  ];
  const sideLinks = nav
    .map(([href, label]) => {
      const current = href === activePath ? ' aria-current="page"' : '';
      return `<a href="${href}"${current}>${label}</a>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta name="robots" content="index,follow" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${ogTitle}" />
  <meta property="og:description" content="${ogDescription}" />
  <meta property="og:url" content="${canonical}" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" />
  <style>${DOCS_SHARED_STYLES}${zohoPresentationStyles}${activePath === '/docs/zoho-people' ? zohoOnboardingStyles : ''}</style>
</head>
<body>
  <div class="docs-shell zoho-admin-guide${activePath === '/docs/zoho-people' ? ' zoho-docs-overview' : activePath.endsWith('/user-guide') ? ' zoho-user-guide' : activePath.startsWith('/case-studies/') ? ' zoho-workflow-guide' : ''}">
    <header class="docs-top">
      <div class="docs-top-inner">
        <a class="docs-logo" href="/" aria-label="Shelf Merch home"><img src="/images/logo/shelfmerch-wordmark.png" alt="Shelf Merch" height="32" style="display:block;max-width:100%;width:auto" /></a>
        <nav class="docs-top-nav" aria-label="Site">
          <a href="/docs/zoho-people">Docs</a>
          <a href="/legal/privacy-policy">Privacy</a>
          <a href="/legal/terms-of-service">Terms</a>
          <a href="mailto:support@shelfmerch.com">Support</a>
        </nav>
      </div>
    </header>
    <div class="docs-layout">
      <aside class="docs-side" aria-label="Documentation">
        <h2>Zoho People</h2>
        ${sideLinks}
      </aside>
      <div>
        <div class="docs-mobile-nav">
          <details>
            <summary>Documentation menu</summary>
            ${sideLinks}
          </details>
        </div>
        <main class="docs-main">
          <nav class="docs-crumbs" aria-label="Breadcrumb">${breadcrumbsHtml}</nav>
          ${presentZohoDocs(bodyHtml, activePath)}
        </main>
      </div>
    </div>
    <footer class="docs-footer">
      <div class="docs-footer-links">
        <a href="/docs/zoho-people">Documentation</a>
        <a href="/legal/privacy-policy">Privacy Policy</a>
        <a href="/legal/terms-of-service">Terms of Service</a>
        <a href="mailto:support@shelfmerch.com">Contact Support</a>
      </div>
      <div>© 2026 Chitlu Innovations Private Limited · ShelfMerch · <a href="https://shelfmerch.io">shelfmerch.io</a></div>
    </footer>
  </div>
</body>
</html>`;
}
