import { existsSync, readFileSync } from 'node:fs';

// The React route imports these same authored assets. Keep the legal wording
// in one place; both assets ship with apps/api in the existing runtime image.
export function getSlackTermsHtml() {
  const content = readFileSync(new URL('../../static/slack-terms-content.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../static/slack-terms.css', import.meta.url), 'utf8');
  const indexPath = new URL('../../../../web/dist/index.html', import.meta.url);
  // Bootstrap the existing app so browser visits use the shared React Header,
  // including its real menus. Legal content is already in the response and
  // remains readable with JavaScript disabled or before a web build exists.
  const shell = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : '';
  const assets = (shell.match(/<script\b[^>]*>[\s\S]*?<\/script>|<link\b[^>]*>/g) || [])
    .filter(tag => /^<script\b[^>]*type="module"[^>]*src=/.test(tag)
      || /^<link\b[^>]*rel="(?:stylesheet|modulepreload)"/.test(tag)).join('\n');
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Slack Integration Terms of Service | ShelfMerch</title>
<meta name="description" content="Terms of Service for the ShelfMerch Slack integration: workspace authorization, permissions, notifications, privacy and disconnection." />
<meta name="robots" content="noindex, follow" />
<link rel="canonical" href="https://shelfmerch.io/legal/slack-terms-of-service" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
${assets}
<style>html,body{margin:0;padding:0}${css}</style>
</head><body><div id="root">${content}</div></body></html>`;
}

export function sendSlackTerms(_req, res) {
  // Missing legal assets must fail rather than return a misleading empty 200.
  res.status(200).type('html').set('Cache-Control', 'private, no-store')
    .set('X-Robots-Tag', 'noindex, follow').send(getSlackTermsHtml());
}
