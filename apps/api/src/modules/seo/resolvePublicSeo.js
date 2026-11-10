/** Pure SEO resolver shared by the API HTML shell and the web client. No I/O. */

export function normalizePath(input) {
  const raw = String(input || '/').split('?')[0].split('#')[0];
  if (raw === '' || raw === '/index.html') return '/';
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  if (withSlash.length > 1 && withSlash.endsWith('/')) return withSlash.slice(0, -1);
  return withSlash;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function isNoindexPath(catalog, path) {
  return (catalog.noindex || []).some((rule) => {
    if (rule.endsWith('/')) return path.startsWith(rule);
    return path === rule || path.startsWith(`${rule}/`);
  });
}

const RESERVED_TOP_LEVEL_PATHS = new Set([
  'about',
  'accept-invite',
  'app',
  'apps',
  'auth',
  'blog',
  'careers',
  'case-studies',
  'catalog',
  'compare',
  'contact',
  'contact-us',
  'contacts',
  'dashboard',
  'docs',
  'email-assets',
  'forgot-password',
  'integrations',
  'legal',
  'jwks',
  'login',
  'mcp',
  'oauth',
  'platform',
  'token',
  'privacy',
  'redeem',
  'request-demo',
  'reset-password',
  'resources',
  's',
  'shop',
  'signup',
  'sitemap-blog.xml',
  'sitemap-catalog.xml',
  'sitemap-compare.xml',
  'sitemap-solutions.xml',
  'sitemap-static.xml',
  'sitemap.xml',
  'solutions',
  'support',
  'terms',
  'terms-condition',
  'uploads',
  'zoho',
]);

const WORKSPACE_CHILD_PATHS = new Set([
  'orders',
  'wallets',
  'shops',
  'swag',
  'kits',
  'campaigns',
  'contacts',
  'support',
  'integrations',
  'settings',
  'billing',
  'catalog',
]);

function isSlugSegment(value) {
  return /^[a-z0-9][a-z0-9-]{1,62}$/.test(value);
}

export function workspaceSlugForPath(pathname) {
  const path = normalizePath(pathname);
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  const [slug, child] = segments;
  if (!isSlugSegment(slug) || RESERVED_TOP_LEVEL_PATHS.has(slug)) return null;
  if (segments.length === 1) return slug;
  return WORKSPACE_CHILD_PATHS.has(child) ? slug : null;
}

export function isWorkspaceAppPath(pathname) {
  return Boolean(workspaceSlugForPath(pathname));
}

function privateSeo() {
  return {
    mode: 'private',
    title: null,
    description: null,
    robots: 'noindex, nofollow',
    canonical: null,
    image: null,
    ogType: 'website',
    jsonLd: null,
  };
}

/** Public storefronts keep the historical document shell. */
function isPreservedStorePath(path) {
  return /^\/shop\/[^/]+$/.test(path) || /^\/s\/[^/]+$/.test(path);
}

function toSeo(catalog, page, path) {
  const robots = page.robots || 'index, follow';
  const canonicalPath = page.canonicalPath === ''
    ? null
    : (page.canonicalPath || (page.canonical === 'self' || !page.canonical ? path : page.canonical));
  const indexable = !robots.includes('noindex');
  const canonical = canonicalPath ? `${catalog.origin}${canonicalPath}` : null;
  const image = indexable ? catalog.defaultImage : null;
  return {
    mode: 'public',
    title: page.title,
    description: page.description,
    robots,
    canonical,
    image,
    ogType: 'website',
    jsonLd: path === '/' && indexable ? organizationJsonLd(catalog) : null,
  };
}

function organizationJsonLd(catalog) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'ShelfMerch',
    url: `${catalog.origin}/`,
    logo: `${catalog.origin}/favicon-48x48.png`,
  };
}

/**
 * Metadata for one SPA document request.
 * Public catalog entries stay indexable. Account, store, and auth paths do not.
 */
export function resolveSpaSeo(catalog, pathname) {
  const path = normalizePath(pathname);
  if (isPreservedStorePath(path)) {
    return {
      mode: 'preserve',
      title: null,
      description: null,
      robots: null,
      canonical: null,
      image: null,
      ogType: 'website',
      jsonLd: null,
    };
  }

  if (/^\/apps\/catalog\/[a-f0-9]{24}$/i.test(path)) {
    return {
      mode: 'preserve',
      title: null,
      description: null,
      robots: null,
      canonical: null,
      image: null,
      ogType: 'website',
      jsonLd: null,
    };
  }

  const page = (catalog.pages || []).find((entry) => entry.path === path);
  if (page) return toSeo(catalog, page, path);

  for (const pattern of catalog.patterns || []) {
    if (new RegExp(pattern.match).test(path)) return toSeo(catalog, pattern, path);
  }

  if (isNoindexPath(catalog, path) || isWorkspaceAppPath(path)) return privateSeo();

  return {
    mode: 'unknown',
    title: 'Page not found | ShelfMerch',
    description: 'The page you requested was not found.',
    robots: 'noindex, follow',
    canonical: null,
    image: null,
    ogType: 'website',
    jsonLd: null,
  };
}

/** noindex for private shells without replacing the title the app already shows. */
export function applyPrivateShell(html) {
  let out = upsertMeta(html.replace(snapshotBlock, ''), 'name', 'robots', 'noindex, nofollow');
  out = removeCanonical(out);
  out = removeMeta(out, 'property', 'og:url');
  return upsertJsonLd(out, null);
}

function upsertMeta(html, attr, key, content) {
  const tag = `<meta ${attr}="${key}" content="${escapeHtml(content)}" />`;
  const re = new RegExp(`<meta\\s+${attr}="${key}"[^>]*>`, 'i');
  if (re.test(html)) return html.replace(re, tag);
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

function removeMeta(html, attr, key) {
  return html.replace(new RegExp(`\\s*<meta\\s+${attr}="${key}"[^>]*>`, 'i'), '');
}

function upsertCanonical(html, href) {
  const tag = `<link rel="canonical" href="${escapeHtml(href)}" />`;
  const re = /<link\s+rel="canonical"[^>]*>/i;
  if (re.test(html)) return html.replace(re, tag);
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

function removeCanonical(html) {
  return html.replace(/\s*<link\s+rel="canonical"[^>]*>/i, '');
}

function upsertJsonLd(html, jsonLd) {
  const re = /\s*<script type="application\/ld\+json" id="seo-jsonld">[\s\S]*?<\/script>/i;
  if (!jsonLd) return html.replace(re, '');
  const tag = `<script type="application/ld+json" id="seo-jsonld">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`;
  if (re.test(html)) return html.replace(re, tag);
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

const snapshotBlock = /<main id="seo-snapshot">[\s\S]*?<\/main><script>document\.getElementById\("seo-snapshot"\)\?\.remove\(\)<\/script>/;

/** Rewrite head tags in the Vite index.html shell. Leaves scripts and #root untouched. */
export function applySpaSeo(html, seo) {
  let out = html.replace(snapshotBlock, '');
  out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(seo.title)}</title>`);
  out = upsertMeta(out, 'name', 'description', seo.description);
  out = upsertMeta(out, 'name', 'robots', seo.robots);
  out = upsertMeta(out, 'property', 'og:title', seo.title);
  out = upsertMeta(out, 'property', 'og:description', seo.description);
  out = upsertMeta(out, 'property', 'og:type', seo.ogType || 'website');
  if (seo.canonical) {
    out = upsertCanonical(out, seo.canonical);
    out = upsertMeta(out, 'property', 'og:url', seo.canonical);
  } else {
    out = removeCanonical(out);
    out = removeMeta(out, 'property', 'og:url');
  }
  if (seo.image) {
    out = upsertMeta(out, 'property', 'og:image', seo.image);
    out = upsertMeta(out, 'name', 'twitter:card', 'summary_large_image');
    out = upsertMeta(out, 'name', 'twitter:title', seo.title);
    out = upsertMeta(out, 'name', 'twitter:description', seo.description);
    out = upsertMeta(out, 'name', 'twitter:image', seo.image);
  } else {
    out = removeMeta(out, 'property', 'og:image');
    out = removeMeta(out, 'name', 'twitter:card');
    out = removeMeta(out, 'name', 'twitter:title');
    out = removeMeta(out, 'name', 'twitter:description');
    out = removeMeta(out, 'name', 'twitter:image');
  }
  return upsertJsonLd(out, seo.jsonLd);
}
