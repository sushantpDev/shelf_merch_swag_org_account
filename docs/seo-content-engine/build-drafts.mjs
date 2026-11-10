// Offline exporter for this package's deliberately limited Markdown format.
// No API calls, environment reads, publishing, or general-purpose HTML import.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, sep } from 'node:path';
import { validateBlogContent, renderBlogContent } from '../../apps/api/src/modules/blog/blogContent.js';

const base = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(resolve(base, 'editorial-manifest.json'), 'utf8'));
const social = JSON.parse(await readFile(resolve(base, 'social-drafts.json'), 'utf8'));
const queue = JSON.parse(await readFile(resolve(base, 'release-queue.json'), 'utf8'));
const fail = (message) => { throw new Error(message); };
const hash = (value) => createHash('sha256').update(value).digest('hex');

function inline(value) {
  const nodes = [];
  const pattern = /\[([^\]]+)\]\(([^\s)]+)\)/g;
  let previous = 0;
  for (const match of value.matchAll(pattern)) {
    if (match.index > previous) nodes.push({ type: 'text', text: value.slice(previous, match.index) });
    nodes.push({ type: 'text', text: match[1], marks: [{ type: 'link', attrs: { href: match[2] } }] });
    previous = match.index + match[0].length;
  }
  if (previous < value.length) nodes.push({ type: 'text', text: value.slice(previous) });
  if (!nodes.length) fail('Empty inline content');
  return nodes;
}

function articleDocument(markdown, title) {
  const lines = markdown.replace(/\r\n/g, '\n').trim().split('\n');
  if (lines.shift() !== `# ${title}`) fail(`Article H1 does not match manifest: ${title}`);
  const content = [];
  let paragraph = [];
  let list = [];
  const flushParagraph = () => {
    if (paragraph.length) content.push({ type: 'paragraph', content: inline(paragraph.join(' ')) });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) content.push({ type: 'bulletList', content: list });
    list = [];
  };
  for (const line of lines) {
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    if (/<[^>]*>|`|!\[|\*\*/.test(line)) fail('Unsupported Markdown or HTML in pilot source');
    const heading = /^(#{2,3}) (.+)$/.exec(line);
    if (heading) {
      flushParagraph(); flushList();
      content.push({ type: 'heading', attrs: { level: heading[1].length }, content: inline(heading[2]) });
    } else if (line.startsWith('#')) {
      fail('Only one title H1 and body H2/H3 headings are supported');
    } else if (line.startsWith('- ')) {
      flushParagraph();
      list.push({ type: 'listItem', content: [{ type: 'paragraph', content: inline(line.slice(2)) }] });
    } else {
      flushList();
      if (/^(?:>|\d+\. |\* |\|)/.test(line)) fail('Unsupported block syntax in pilot source');
      paragraph.push(line.trim());
    }
  }
  flushParagraph(); flushList();
  const document = { type: 'doc', content };
  validateBlogContent(document);
  return document;
}

const articleIds = new Set();
const slugs = new Set();
const visuals = new Set(social.visual_briefs.map((brief) => brief.id));
const postIds = new Set();
for (const post of social.posts) {
  if (postIds.has(post.id)) fail(`Duplicate social draft ID: ${post.id}`);
  postIds.add(post.id);
  if (!['instagram', 'facebook'].includes(post.platform)) fail(`Invalid platform: ${post.id}`);
  if (!['A', 'B'].includes(post.variant)) fail(`Invalid variant: ${post.id}`);
  if (post.status !== 'draft' || !visuals.has(post.visual_id)) fail(`Invalid review state or visual: ${post.id}`);
  if (!post.caption.trim() || post.caption.length > (post.platform === 'instagram' ? 2200 : 2000)) fail(`Caption outside editorial limit: ${post.id}`);
  if (/\b(?:TODO|TBD|PLACEHOLDER|YOUR_API_KEY)\b|\{\{/.test(post.caption)) fail(`Unresolved caption field: ${post.id}`);
  const brief = social.visual_briefs.find((item) => item.id === post.visual_id);
  if (brief.article_id !== post.article_id) fail(`Visual/article mismatch: ${post.id}`);
}
if (queue.items.length !== 0) fail('Pilot release queue must remain empty until a separate approved release');

const exports = [];
const summary = { schema_version: 1, scope: 'offline_validation_only', articles: [], social_draft_count: social.posts.length, release_item_count: queue.items.length };
for (const article of manifest.articles) {
  if (articleIds.has(article.id) || slugs.has(article.slug)) fail(`Duplicate article ID or slug: ${article.id}`);
  articleIds.add(article.id); slugs.add(article.slug);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug) || article.slug.length > 100) fail(`Invalid slug: ${article.id}`);
  if (article.editorial_status !== 'draft') fail(`Unexpected article review state: ${article.id}`);
  for (const [field, limit] of Object.entries({ title: 180, excerpt: 400, authorName: 100, seoTitle: 180, seoDescription: 400 })) {
    if (typeof article[field] !== 'string' || !article[field].trim() || article[field].length > limit) fail(`Invalid ${field}: ${article.id}`);
  }
  const sourcePath = resolve(base, article.file);
  if (!sourcePath.startsWith(`${base}${sep}`)) fail('Article source escaped package directory');
  const markdown = await readFile(sourcePath, 'utf8');
  const document = articleDocument(markdown, article.title);
  const payload = Object.fromEntries(['slug', 'title', 'excerpt', 'authorName', 'seoTitle', 'seoDescription'].map((field) => [field, article[field]]));
  payload.content = document;
  const html = renderBlogContent(document);
  if (/<h1\b/.test(html) || !/<h2\b/.test(html) || !/<h3\b/.test(html)) fail(`Incorrect heading structure: ${article.id}`);
  if (!html.includes('href="/request-demo"')) fail(`Missing native demo CTA: ${article.id}`);
  for (const platform of ['instagram', 'facebook']) {
    const variants = social.posts.filter((post) => post.article_id === article.id && post.platform === platform);
    if (variants.length !== 2 || new Set(variants.map((post) => post.variant)).size !== 2) fail(`Expected two distinct ${platform} variants: ${article.id}`);
    if (variants.some((post) => post.source !== article.file)) fail(`Social/article source mismatch: ${article.id}`);
  }
  const payloadText = `${JSON.stringify(payload, null, 2)}\n`;
  exports.push({ filename: `${article.id.toLowerCase()}.cms-draft.json`, payloadText });
  summary.articles.push({
    id: article.id,
    words: markdown.split(/\s+/).filter(Boolean).length,
    source_sha256: hash(markdown),
    payload_sha256: hash(payloadText),
    body_h2_count: (html.match(/<h2\b/g) ?? []).length,
    body_h3_count: (html.match(/<h3\b/g) ?? []).length,
    native_content_validation: 'passed',
    editorial_approval: 'pending',
    production_links: 'unverified'
  });
}
if (social.posts.some((post) => !articleIds.has(post.article_id))) fail('Social draft references an unknown article');

// Write only after the complete package has passed validation.
const output = resolve(base, 'generated');
await mkdir(output, { recursive: true });
for (const item of exports) await writeFile(resolve(output, item.filename), item.payloadText, 'utf8');
await writeFile(resolve(output, 'validation-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(summary, null, 2));
