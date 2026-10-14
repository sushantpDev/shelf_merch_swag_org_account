import { ContentPage, CONTENT_COLLECTIONS } from './contentPage.model.js';
import { escapeHtml, renderBlogContent, validateBlogContent } from '../blog/blogContent.js';
import { SITE_ORIGIN, escapeXml } from './sitemap.controller.js';

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PRIVATE_CACHE = 'private, no-store';

const STYLES = `
  :root{font-family:Inter,Arial,sans-serif;color:#121212;background:#f7f3ea}
  *{box-sizing:border-box}body{margin:0}a{color:inherit}img{max-width:100%}
  .seo-header{background:#fff;border-bottom:1px solid #e7e2d9;padding:18px max(20px,5vw);display:flex;align-items:center;justify-content:space-between;gap:20px}
  .seo-brand{font-family:'Bricolage Grotesque',sans-serif;font-size:22px;font-weight:800;text-decoration:none;letter-spacing:-.05em}
  .seo-header nav{display:flex;gap:22px;font-size:14px;font-weight:600}.seo-header nav a{text-decoration:none}
  .seo-wrap{width:min(860px,calc(100% - 40px));margin:0 auto;padding:56px 0 96px}
  .seo-eyebrow{text-transform:uppercase;letter-spacing:.15em;font-size:12px;color:#3155ff;font-weight:800}
  h1,h2{font-family:'Bricolage Grotesque',sans-serif;letter-spacing:-.045em}h1{font-size:clamp(40px,6vw,68px);line-height:1.05;margin:12px 0 18px}
  .seo-intro{font-size:18px;line-height:1.65;color:#555}.seo-list{display:grid;gap:16px;margin-top:36px}
  .seo-card{background:#fff;border:1px solid #e7e2d9;border-radius:16px;padding:22px}.seo-card h2{font-size:26px;margin:0 0 8px}.seo-card h2 a{text-decoration:none}
  .seo-card p{line-height:1.6;color:#555;margin:0}
  .seo-article{font-size:18px;line-height:1.75}.seo-article h2{font-size:32px;margin-top:40px}.seo-article a{color:#3155ff}
  .seo-footer{background:#121212;color:#fff;padding:28px max(20px,5vw);font-size:14px}.seo-footer a{margin-right:18px}
`;

function jsonLdScript(value) {
  const json = JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `<script type="application/ld+json">${json}</script>`;
}

function htmlPage({ title, description, canonical, robots, body, jsonLd = null }) {
  const structuredData = jsonLd ? jsonLdScript(jsonLd) : '';
  return `<!doctype html><html lang="en"><head>
    <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="${escapeHtml(robots)}" />
    ${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}" />` : ''}
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    ${canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}" />` : ''}
    <meta property="og:image" content="${escapeHtml(`${SITE_ORIGIN}/images/logo/shelfmerch-wordmark.png`)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" href="/favicon-32x32.png" type="image/png" />
    <style>${STYLES}</style>${structuredData}
    </head><body>
    <header class="seo-header"><a class="seo-brand" href="/">shelfmerch</a><nav aria-label="Site"><a href="/blog">Blog</a><a href="/compare">Compare</a><a href="/solutions">Solutions</a><a href="/request-demo">Book a demo</a></nav></header>
    ${body}
    <footer class="seo-footer"><a href="/">ShelfMerch</a><a href="/blog">Blog</a><a href="/legal/privacy-policy">Privacy</a></footer>
    </body></html>`;
}

function collectionOrNull(kind) {
  return Object.values(CONTENT_COLLECTIONS).find((entry) => entry.kind === kind) || null;
}

function safeSlug(value) {
  const slug = String(value || '');
  return SAFE_SLUG.test(slug) ? slug : null;
}

function renderPublishedBody(content) {
  try {
    validateBlogContent(content);
  } catch {
    return null;
  }
  if (!publicImagesAreSafe(content)) return null;
  return renderBlogContent(content);
}

function publicImagesAreSafe(content) {
  let safe = true;
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'image') {
      const src = node.attrs?.src;
      if (typeof src !== 'string' || src.startsWith('//') || !/^(\/|https?:\/\/)/.test(src)) safe = false;
    }
    for (const child of node.content ?? []) visit(child);
  }
  visit(content);
  return safe;
}

async function publishedPosts(kind, fields) {
  const posts = await ContentPage.find({ kind, status: 'published' })
    .select(fields)
    .sort({ publishedAt: -1, _id: -1 })
    .limit(100)
    .lean();
  return posts.filter((post) => safeSlug(post.slug) && renderPublishedBody(post.content));
}

export function sendContentIndex(kind) {
  const collection = collectionOrNull(kind);
  return async function sendContentIndexHandler(_req, res) {
    const posts = await publishedPosts(kind, 'slug title excerpt content publishedAt updatedAt');
    const indexable = posts.length > 0;
    const robots = indexable ? 'index, follow' : 'noindex, follow';
    const canonical = `${SITE_ORIGIN}${collection.basePath}`;
    const cards = posts.map((post) => `<article class="seo-card"><h2><a href="${collection.basePath}/${escapeHtml(post.slug)}">${escapeHtml(post.title)}</a></h2><p>${escapeHtml(post.excerpt)}</p></article>`).join('');
    const body = `<main class="seo-wrap"><span class="seo-eyebrow">ShelfMerch</span><h1>${escapeHtml(collection.hubHeading)}</h1><p class="seo-intro">${escapeHtml(collection.hubIntro)}</p>${cards ? `<div class="seo-list">${cards}</div>` : ''}</main>`;
    const jsonLd = indexable
      ? {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: collection.hubTitle,
        description: collection.hubDescription,
        url: canonical,
      }
      : null;
    res.status(200).type('html').set('Cache-Control', PRIVATE_CACHE).set('X-Robots-Tag', robots).send(htmlPage({
      title: collection.hubTitle,
      description: collection.hubDescription,
      canonical,
      robots,
      body,
      jsonLd,
    }));
  };
}

export function sendContentArticle(kind) {
  const collection = collectionOrNull(kind);
  return async function sendContentArticleHandler(req, res) {
    const slug = safeSlug(req.params.slug);
    const post = slug
      ? await ContentPage.findOne({ kind, slug, status: 'published' }).lean()
      : null;
    const articleHtml = post ? renderPublishedBody(post.content) : null;
    if (!post || !articleHtml) {
      return res.status(404).type('html').set('Cache-Control', PRIVATE_CACHE).set('X-Robots-Tag', 'noindex, follow').send(htmlPage({
        title: 'Page not found | ShelfMerch',
        description: 'The page you requested was not found.',
        robots: 'noindex, follow',
        body: `<main class="seo-wrap"><h1>Page not found</h1><p><a href="${collection.basePath}">Back</a></p></main>`,
      }));
    }
    const canonical = `${SITE_ORIGIN}${collection.basePath}/${post.slug}`;
    const title = post.seoTitle || `${post.title} | ShelfMerch`;
    const description = post.seoDescription || post.excerpt;
    const body = `<main class="seo-wrap"><a href="${collection.basePath}">← All</a><article><span class="seo-eyebrow">${escapeHtml(collection.articleEyebrow)}</span><h1>${escapeHtml(post.title)}</h1><p class="seo-intro">${escapeHtml(post.excerpt)}</p><div class="seo-article">${articleHtml}</div></article></main>`;
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description,
      mainEntityOfPage: canonical,
      datePublished: post.publishedAt ? new Date(post.publishedAt).toISOString() : undefined,
      dateModified: new Date(post.updatedAt).toISOString(),
      publisher: { '@type': 'Organization', name: 'ShelfMerch', url: SITE_ORIGIN },
    };
    res.status(200).type('html').set('Cache-Control', PRIVATE_CACHE).set('X-Robots-Tag', 'index, follow').send(htmlPage({
      title, description, canonical, robots: 'index, follow', body, jsonLd,
    }));
  };
}

export function buildContentSitemapXml(collection, posts) {
  const urls = [];
  if (posts.length > 0) {
    urls.push(`  <url>\n    <loc>${escapeXml(`${SITE_ORIGIN}${collection.basePath}`)}</loc>\n  </url>`);
  }
  for (const post of posts) {
    urls.push(`  <url>\n    <loc>${escapeXml(`${SITE_ORIGIN}${collection.basePath}/${post.slug}`)}</loc>\n    <lastmod>${new Date(post.updatedAt).toISOString()}</lastmod>\n  </url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export function sendContentSitemap(kind) {
  const collection = collectionOrNull(kind);
  return async function sendContentSitemapHandler(_req, res) {
    const posts = (await ContentPage.find({ kind, status: 'published' })
      .select('slug updatedAt content')
      .sort({ slug: 1 })
      .limit(50_000)
      .lean()).filter((post) => safeSlug(post.slug) && renderPublishedBody(post.content));
    res.status(200).type('application/xml').set('Cache-Control', PRIVATE_CACHE).send(buildContentSitemapXml(collection, posts));
  };
}
