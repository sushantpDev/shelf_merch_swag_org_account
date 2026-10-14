import { readFileSync } from 'node:fs';
import { applyPrivateShell, applySpaSeo, resolveSpaSeo } from './resolvePublicSeo.js';

const catalogUrl = new URL('../../../../web/src/seo/publicPages.json', import.meta.url);

export function loadPublicSeoCatalog() {
  return JSON.parse(readFileSync(catalogUrl, 'utf8'));
}

let catalog;

function getCatalog() {
  if (!catalog) catalog = loadPublicSeoCatalog();
  return catalog;
}

export function seoForPath(pathname) {
  return resolveSpaSeo(getCatalog(), pathname);
}

const snapshotBlock = /<main id="seo-snapshot">[\s\S]*?<\/main><script>document\.getElementById\("seo-snapshot"\)\?\.remove\(\)<\/script>/;

export function renderSpaDocument(html, pathname) {
  const clean = html.replace(snapshotBlock, '');
  const seo = seoForPath(pathname);
  if (seo.mode === 'preserve') return clean;
  if (seo.mode === 'private') return applyPrivateShell(html);
  return applySpaSeo(html, seo);
}

export function spaDocumentHeaders(pathname) {
  const seo = seoForPath(pathname);
  const headers = { 'Cache-Control': 'private, no-store' };
  if (seo.robots) headers['X-Robots-Tag'] = seo.robots;
  return headers;
}

const PUBLIC_REDIRECTS = {
  '/contact': '/contact-us',
  '/contacts': '/contact-us',
  '/catalog': '/apps/catalog',
  '/about/index.html': '/about',
  '/careers/index.html': '/careers',
  '/privacy/index.html': '/privacy',
  '/terms/index.html': '/terms',
};

/** 301 target for aliases and trailing slashes on public marketing pages. */
export function publicRedirectTarget(pathname) {
  const raw = String(pathname || '/').split('?')[0].split('#')[0];
  if (PUBLIC_REDIRECTS[raw]) return PUBLIC_REDIRECTS[raw];
  const productSlash = raw.match(/^(\/apps\/catalog\/[a-f0-9]{24})\/$/i);
  if (productSlash) return productSlash[1];
  if (raw.length > 1 && raw.endsWith('/')) {
    const stripped = raw.slice(0, -1);
    if (PUBLIC_REDIRECTS[stripped]) return PUBLIC_REDIRECTS[stripped];
    if (seoForPath(stripped).mode === 'public') return stripped;
  }
  return null;
}

/** shell = React document. not-found = unknown public URL. catalog-product = product handler. */
export function documentKind(pathname) {
  const path = String(pathname || '/').split('?')[0];
  if (/^\/apps\/catalog\/[a-f0-9]{24}\/?$/i.test(path)) return 'catalog-product';
  if (seoForPath(path).mode === 'unknown') return 'not-found';
  return 'shell';
}

export function seoNotFoundHtml() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>Page not found | ShelfMerch</title><meta name="robots" content="noindex, follow" /></head><body><h1>Page not found</h1></body></html>`;
}
