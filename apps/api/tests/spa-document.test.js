import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applySpaSeo, resolveSpaSeo } from '../src/modules/seo/resolvePublicSeo.js';
import { loadPublicSeoCatalog, renderSpaDocument, spaDocumentHeaders, documentKind, publicRedirectTarget } from '../src/modules/seo/spaDocument.js';

const catalog = loadPublicSeoCatalog();
const shell = readFileSync(new URL('../../web/index.html', import.meta.url), 'utf8');

describe('SPA document SEO', () => {
  it('gives the homepage a canonical, social tags, and organization data without removing the app shell', () => {
    const html = applySpaSeo(shell, resolveSpaSeo(catalog, '/'));
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('%VITE_GTM_ID%');
    expect(html).toContain('<link rel="canonical" href="https://shelfmerch.io/" />');
    expect(html).toContain('name="robots" content="index, follow"');
    expect(html).toContain('"@type":"Organization"');
    expect(html).toContain('shelfmerch: Recognition &amp; Swag Platform');
    expect(html).not.toContain('seo-snapshot');
    expect((html.match(/%VITE_GTM_ID%/g) || []).length).toBe((shell.match(/%VITE_GTM_ID%/g) || []).length);
  });

  it('uses a unique title and canonical for public marketing pages', () => {
    const html = applySpaSeo(shell, resolveSpaSeo(catalog, '/about'));
    expect(html).toContain('<title>About Shelf Merch - Built to Make Brand Moments Real</title>');
    expect(html).toContain('<link rel="canonical" href="https://shelfmerch.io/about" />');
    expect(html).not.toContain('id="seo-jsonld"');
  });

  it('keeps /platform public and /platform/* private, including trailing slashes', () => {
    const marketing = resolveSpaSeo(catalog, '/platform');
    const marketingSlash = resolveSpaSeo(catalog, '/platform/');
    const dashboard = resolveSpaSeo(catalog, '/platform/dashboard');
    const dashboardSlash = resolveSpaSeo(catalog, '/platform/dashboard/');
    const unknown = resolveSpaSeo(catalog, '/platform/not-a-page');
    expect(marketing.mode).toBe('public');
    expect(marketing.robots).toBe('index, follow');
    expect(marketing.canonical).toBe('https://shelfmerch.io/platform');
    expect(marketingSlash.canonical).toBe('https://shelfmerch.io/platform');
    expect(marketingSlash.robots).toBe('index, follow');
    expect(dashboard.mode).toBe('private');
    expect(dashboard.robots).toBe('noindex, nofollow');
    expect(dashboardSlash.mode).toBe('private');
    expect(unknown.mode).toBe('private');

    const html = renderSpaDocument(shell, '/platform/dashboard');
    expect(html).toContain('noindex, nofollow');
    expect(html).toContain('<title>shelfmerch: Recognition &amp; Swag Platform</title>');
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain('id="seo-jsonld"');
    expect(renderSpaDocument(shell, '/shop/store-1')).toBe(shell);
    expect(renderSpaDocument(shell, '/s/acme')).toBe(shell);
    expect(spaDocumentHeaders('/about')['Cache-Control']).toBe('private, no-store');
    expect(spaDocumentHeaders('/platform/dashboard')['X-Robots-Tag']).toBe('noindex, nofollow');
    expect(spaDocumentHeaders('/shop/store-1')['X-Robots-Tag']).toBeUndefined();
  });

  it('does not treat /support as a store path', () => {
    const support = resolveSpaSeo(catalog, '/support');
    expect(support.robots).toBe('index, follow');
    expect(support.canonical).toBe('https://shelfmerch.io/support');
    expect(resolveSpaSeo(catalog, '/s/acme').mode).toBe('preserve');
    expect(resolveSpaSeo(catalog, '/shop/abc').mode).toBe('preserve');
    expect(resolveSpaSeo(catalog, '/app/orders').mode).toBe('private');
    expect(resolveSpaSeo(catalog, '/wipro').mode).toBe('private');
    expect(resolveSpaSeo(catalog, '/wipro/shops').mode).toBe('private');
    expect(resolveSpaSeo(catalog, '/not/a-real-page').mode).toBe('unknown');
  });

  it('points duplicate legal routes at the server-rendered canonical', () => {
    const privacy = resolveSpaSeo(catalog, '/privacy');
    expect(privacy.robots).toBe('noindex, follow');
    expect(privacy.canonical).toBe('https://shelfmerch.io/legal/privacy-policy');
    expect(resolveSpaSeo(catalog, '/terms-condition').canonical).toBe('https://shelfmerch.io/legal/terms-of-service');
    expect(resolveSpaSeo(catalog, '/legal/terms-of-service').mode).toBe('public');
    expect(resolveSpaSeo(catalog, '/legal/terms-of-service').canonical).toBe('https://shelfmerch.io/legal/terms-of-service');
    const slack = resolveSpaSeo(catalog, '/legal/slack-terms-of-service');
    expect(slack.mode).toBe('public');
    expect(slack.canonical).toBe('https://shelfmerch.io/legal/slack-terms-of-service');
    expect(slack.robots).toBe('noindex, follow');
    expect(documentKind('/legal/slack-terms-of-service')).toBe('shell');
    expect(documentKind('/terms-condition')).toBe('shell');
    expect(documentKind('/terms-condition/shops')).toBe('not-found');
    for (const alias of ['/terms', '/terms-condition', '/terms/index.html']) {
      expect(publicRedirectTarget(alias)).toBe('/legal/terms-of-service');
      expect(publicRedirectTarget(`${alias}/`)).toBe('/legal/terms-of-service');
    }
  });

  it('escapes metadata inserted into the shell', () => {
    const html = applySpaSeo(shell, {
      title: 'A & B <script>',
      description: 'Quotes "here"',
      robots: 'noindex, follow',
      canonical: 'https://shelfmerch.io/about',
      image: null,
      ogType: 'website',
      jsonLd: null,
    });
    expect(html).toContain('<title>A &amp; B &lt;script&gt;</title>');
    expect(html).toContain('content="Quotes &quot;here&quot;"');
    expect(html).not.toContain('<script>here');
  });

  it('keeps app deep links on the shell and 404s unknown public urls', () => {
    expect(documentKind('/app/orders/42')).toBe('shell');
    expect(documentKind('/platform/dashboard')).toBe('shell');
    expect(documentKind('/oauth/consent')).toBe('shell');
    expect(documentKind('/reset-password?token=reset-token')).toBe('shell');
    expect(resolveSpaSeo(catalog, '/reset-password?token=reset-token').mode).toBe('private');
    expect(renderSpaDocument(shell, '/reset-password?token=reset-token')).toContain('<div id="root"></div>');
    expect(documentKind('/shop/acme')).toBe('shell');
    expect(documentKind('/about')).toBe('shell');
    expect(documentKind('/docs/zoho-people')).toBe('shell');
    expect(documentKind('/case-studies/zoho-people')).toBe('shell');
    expect(documentKind('/apps/catalog/category/apparel')).toBe('shell');
    expect(documentKind('/wipro')).toBe('workspace');
    expect(documentKind('/wipro/shops')).toBe('workspace');
    expect(documentKind('/wipro/campaigns/send-points')).toBe('workspace');
    expect(documentKind('/wipro/not-a-workspace-route')).toBe('not-found');
    expect(documentKind('/legal/privacy-policy')).toBe('not-found');
    expect(documentKind('/no/such-marketing-page')).toBe('not-found');
    expect(publicRedirectTarget('/about/')).toBe('/about');
    expect(publicRedirectTarget('/platform/')).toBe('/platform');
    expect(publicRedirectTarget('/platform/dashboard/')).toBeNull();
    expect(publicRedirectTarget('/contact')).toBe('/contact-us');
    expect(renderSpaDocument(shell, '/platform/dashboard')).not.toContain('seo-snapshot');
    expect(renderSpaDocument(shell, '/')).not.toContain('seo-snapshot');
  });
});
