import { BLOG_PUBLIC_STYLES, blogHeader, blogFooter, renderBlogHub } from './blogPublicView.js';
import { BlogPost } from './blogPost.model.js';
import { BlogAsset } from './blogAsset.model.js';
import { escapeHtml, renderBlogContent } from './blogContent.js';
import { SITE_ORIGIN } from '../seo/sitemap.controller.js';
import { readStoredFile } from '../../services/storage.service.js';
import { pipeline } from 'node:stream/promises';
import mongoose from 'mongoose';


function absoluteImage(url) {
  return url?.startsWith('/') ? `${SITE_ORIGIN}${url}` : url;
}

function htmlPage({ title, description, canonical, body, image = '', type = 'website', jsonLd = null, robots = 'index,follow' }) {
  const socialImage = image ? `<meta property="og:image" content="${escapeHtml(absoluteImage(image))}" />` : '';
  const structuredData = jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`
    : '';
  return `<!doctype html><html lang="en"><head>
    <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="${robots}" />
    ${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}" />` : ''}
    <meta property="og:type" content="${type}" /><meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    ${canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}" />` : ''}
    ${socialImage}<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />
    <link rel="icon" href="/favicon-32x32.png" type="image/png" />
    <style>${BLOG_PUBLIC_STYLES}</style>${structuredData}</head><body>
    ${blogHeader()}
    ${body}${blogFooter()}
    </body></html>`;
}

function dateText(value) {
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export async function sendBlogIndex(req, res) {
  const page = Number(req.query.page ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) {
    return res.status(404).type('html').set('Cache-Control', 'no-store').send(htmlPage({
      title: 'Blog page not found', description: '', robots: 'noindex,follow', body: '<main class="blog-wrap"><h1>Page not found</h1></main>',
    }));
  }
  const limit = 12;
  const [posts, total] = await Promise.all([
    BlogPost.find({ status: 'published' }).select('slug title excerpt coverImageUrl coverImageAlt publishedAt').sort({ publishedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    BlogPost.countDocuments({ status: 'published' }),
  ]);
  if (page > 1 && posts.length === 0) {
    return res.status(404).type('html').set('Cache-Control', 'no-store').send(htmlPage({
      title: 'Blog page not found', description: '', robots: 'noindex,follow', body: '<main class="blog-wrap"><h1>Page not found</h1></main>',
    }));
  }
  const body = renderBlogHub({ posts, page, total, limit, dateText });
  const canonical = `${SITE_ORIGIN}/blog${page > 1 ? `?page=${page}` : ''}`;
  res.status(200).type('html').set('Cache-Control', 'no-store').send(htmlPage({
    title: 'Blog & Guides | Shelf Merch', description: 'Stories, guides and practical ideas for merchandise, gifting and recognition.', canonical, body,
  }));
}

export async function sendBlogArticle(req, res) {
  const post = await BlogPost.findOne({ slug: req.params.slug, status: 'published' }).lean();
  if (!post) {
    return res.status(404).type('html').set('Cache-Control', 'no-store').send(htmlPage({
      title: 'Article not found | ShelfMerch', description: '', robots: 'noindex,follow',
      body: '<main class="blog-wrap"><h1>Article not found</h1><a href="/blog">Back to blog</a></main>',
    }));
  }
  const canonical = `${SITE_ORIGIN}/blog/${post.slug}`;
  const title = post.seoTitle || `${post.title} | ShelfMerch`;
  const description = post.seoDescription || post.excerpt;
  const datePublished = post.publishedAt.toISOString();
  const dateModified = post.updatedAt.toISOString();
  const body = `<main class="blog-wrap blog-article"><a href="/blog">← All articles</a>
    <article><span class="blog-eyebrow">ShelfMerch Blog</span><h1>${escapeHtml(post.title)}</h1>
    <p class="blog-intro">${escapeHtml(post.excerpt)}</p><p class="blog-meta">By ${escapeHtml(post.authorName || 'ShelfMerch')} · <time datetime="${datePublished}">${dateText(post.publishedAt)}</time></p>
    ${post.coverImageUrl ? `<img class="blog-cover" src="${escapeHtml(post.coverImageUrl)}" alt="${escapeHtml(post.coverImageAlt)}" />` : ''}
    <div class="blog-content">${renderBlogContent(post.content)}</div></article></main>`;
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title,
    description, mainEntityOfPage: canonical, datePublished, dateModified,
    author: { '@type': post.authorName && post.authorName !== 'ShelfMerch' ? 'Person' : 'Organization', name: post.authorName || 'ShelfMerch' },
    publisher: { '@type': 'Organization', name: 'ShelfMerch', url: SITE_ORIGIN },
    ...(post.coverImageUrl ? { image: absoluteImage(post.coverImageUrl) } : {}),
  };
  res.status(200).type('html').set('Cache-Control', 'no-store').send(htmlPage({
    title, description, canonical, body, image: post.coverImageUrl, type: 'article', jsonLd,
  }));
}

export async function sendBlogMedia(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).end();
  const asset = await BlogAsset.findById(req.params.id).lean();
  if (!asset) return res.status(404).end();
  const stream = await readStoredFile(asset);
  res.status(200).type(asset.contentType)
    .set('X-Content-Type-Options', 'nosniff')
    .set('Content-Security-Policy', "default-src 'none'; sandbox")
    .set('Cache-Control', 'public, max-age=31536000, immutable');
  await pipeline(stream, res);
}
