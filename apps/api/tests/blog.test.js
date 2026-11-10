import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { BlogPost } from '../src/modules/blog/blogPost.model.js';
import { SeoContent, SeoJob, SeoKeyword, SeoDay } from '../src/modules/seoGrowth/seoGrowth.models.js';
import { signAccessToken } from '../src/modules/auth/auth.service.js';

vi.mock('../src/services/storage.service.js', async (original) => ({
  ...await original(),
  uploadFile: vi.fn(async () => ({ key: 'platform/blog/test.png', url: '/uploads/platform/blog/test.png', driver: 'local' })),
  readStoredFile: vi.fn(async () => (await import('node:stream')).Readable.from(Buffer.from([137, 80, 78, 71]))),
}));

let app;
let sales;
let superAdmin;
let ops;
let auditor;
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const content = { type: 'doc', content: [
  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Useful guide' }] },
  { type: 'paragraph', content: [{ type: 'text', text: 'Practical advice.' }] },
] };
const input = { slug: 'better-merch', title: 'Better merch', excerpt: 'How to choose useful merch.',
  content, authorName: 'ShelfMerch', coverImageUrl: '', coverImageAlt: '', seoTitle: '', seoDescription: '' };

async function tokenFor(role) {
  const user = await User.create({ name: role, email: `${role}@blog.test`, status: 'active' });
  const assignment = await RoleAssignment.create({ userId: user._id, role, scopeType: 'platform' });
  return signAccessToken(user, assignment);
}

beforeAll(async () => { await connectTestDb(); app = createApp(); });
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  sales = await tokenFor('platform_sales_manager');
  superAdmin = await tokenFor('platform_super_admin');
  ops = await tokenFor('platform_ops_admin');
  auditor = await tokenFor('platform_readonly_auditor');
});

describe('blog publishing', () => {
  it('lets blog writers delete drafts and reuse their slug', async () => {
    const post = await BlogPost.create(input);
    const result = await request(app).delete(`/api/v1/platform/blog-posts/${post._id}`).set(auth(superAdmin));
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ deleted: true, id: String(post._id) });
    expect(await BlogPost.findById(post._id)).toBeNull();
    expect((await request(app).get(`/api/v1/platform/blog-posts/${post._id}`).set(auth(sales))).status).toBe(404);
    const replacement = await request(app).post('/api/v1/platform/blog-posts').set(auth(sales)).send(input);
    expect(replacement.status).toBe(201);
    expect((await request(app).delete(`/api/v1/platform/blog-posts/${replacement.body._id}`).set(auth(sales))).status).toBe(200);
    expect((await request(app).delete(`/api/v1/platform/blog-posts/${post._id}`).set(auth(superAdmin))).status).toBe(404);
    expect((await request(app).delete('/api/v1/platform/blog-posts/invalid').set(auth(superAdmin))).status).toBe(400);
  });

  it('rejects unauthenticated and read-only deletion and protects published articles', async () => {
    const post = await BlogPost.create(input);
    const url = `/api/v1/platform/blog-posts/${post._id}`;
    expect((await request(app).delete(url)).status).toBe(401);
    for (const token of [ops, auditor]) {
      expect((await request(app).delete(url).set(auth(token))).status).toBe(403);
    }
    expect(await BlogPost.findById(post._id)).not.toBeNull();
    expect((await request(app).post(`${url}/publish`).set(auth(superAdmin))).status).toBe(200);
    expect((await request(app).delete(url).set(auth(superAdmin))).status).toBe(409);
    expect((await request(app).get('/blog/better-merch')).status).toBe(200);
    expect((await request(app).post(`${url}/unpublish`).set(auth(superAdmin))).status).toBe(200);
    expect((await request(app).delete(url).set(auth(superAdmin))).status).toBe(200);
    expect((await request(app).get('/blog/better-merch')).status).toBe(404);
  });

  async function seoDraft(jobStatus = 'completed', mapping = {}) {
    const post = await BlogPost.create({ ...input, seoManaged: true });
    const keyword = await SeoKeyword.create({ keyword: 'better merch', normalized: 'better merch', country: 'us',
      state: 'drafted', pageType: 'educational_blog', targetUrl: 'https://shelfmerch.io/blog/better-merch', ...mapping });
    const job = await SeoJob.create({ day: '2026-11-04', status: jobStatus, stage: 'completed', articleId: post._id, keywordId: keyword._id });
    const draft = await SeoContent.create({ articleId: post._id, jobId: job._id, keywordId: keyword._id, topicKey: 'better merch', generated: { slug: post.slug } });
    return { post, keyword, job, draft };
  }

  it('cleans up SEO draft links, frees its topic and retains execution history and daily usage', async () => {
    const { post, keyword, job, draft } = await seoDraft();
    const day = await SeoDay.create({ day: job.day, draftsReserved: 1, usdReserved: 0.5, tokensReserved: 2000 });
    const result = await request(app).delete(`/api/v1/platform/blog-posts/${post._id}`).set(auth(superAdmin));
    expect(result.status).toBe(200);
    expect(await SeoContent.findById(draft._id)).toBeNull();
    expect(await SeoKeyword.findById(keyword._id).lean()).toMatchObject({ state: 'available', targetUrl: '' });
    const history = await SeoJob.findById(job._id).lean();
    expect(history).toMatchObject({ status: 'completed', stage: 'draft_deleted' });
    expect(history.articleId).toBeUndefined();
    expect((await request(app).post(`/api/v1/platform/seo-growth/jobs/${job._id}/retry`).set(auth(superAdmin))).status).toBe(409);
    expect(await SeoDay.findById(day._id).lean()).toMatchObject({ draftsReserved: 1, usdReserved: 0.5, tokensReserved: 2000 });
  });

  it('preserves explicit keyword mappings when deleting an SEO draft', async () => {
    const { post, keyword } = await seoDraft('completed', {
      state: 'refresh', pageType: 'refresh', existingPage: 'https://shelfmerch.io/features', targetUrl: 'https://shelfmerch.io/features',
    });
    expect((await request(app).delete(`/api/v1/platform/blog-posts/${post._id}`).set(auth(superAdmin))).status).toBe(200);
    expect(await SeoKeyword.findById(keyword._id).lean()).toMatchObject({ state: 'refresh', targetUrl: 'https://shelfmerch.io/features' });
  });

  it('releases the keyword even when an editor changed the generated draft slug', async () => {
    const { post, keyword } = await seoDraft();
    post.slug = 'edited-merch-guide';
    await post.save();
    expect((await request(app).delete(`/api/v1/platform/blog-posts/${post._id}`).set(auth(superAdmin))).status).toBe(200);
    expect(await SeoKeyword.findById(keyword._id).lean()).toMatchObject({ state: 'available', targetUrl: '' });
  });

  it.each(['queued', 'running', 'retry'])('prevents deletion while linked research is %s', async (status) => {
    const { post, draft, keyword } = await seoDraft(status);
    const result = await request(app).delete(`/api/v1/platform/blog-posts/${post._id}`).set(auth(superAdmin));
    expect(result.status).toBe(409);
    expect(await BlogPost.findById(post._id)).not.toBeNull();
    expect(await SeoContent.findById(draft._id)).not.toBeNull();
    expect((await SeoKeyword.findById(keyword._id)).state).toBe('drafted');
  });

  it('rolls back draft deletion if SEO cleanup fails', async () => {
    const { post, draft } = await seoDraft();
    const cleanup = vi.spyOn(SeoContent, 'deleteMany').mockRejectedValueOnce(new Error('Test cleanup failure'));
    try {
      expect((await request(app).delete(`/api/v1/platform/blog-posts/${post._id}`).set(auth(superAdmin))).status).toBe(500);
      expect(await BlogPost.findById(post._id)).not.toBeNull();
      expect(await SeoContent.findById(draft._id)).not.toBeNull();
    } finally { cleanup.mockRestore(); }
  });

  it('does not let a stale regeneration request recreate a deleted draft', async () => {
    const { post, draft, job } = await seoDraft();
    const original = SeoJob.findOneAndUpdate.bind(SeoJob);
    const regenerate = vi.spyOn(SeoJob, 'findOneAndUpdate').mockImplementationOnce(async (...args) => {
      expect((await request(app).delete(`/api/v1/platform/blog-posts/${post._id}`).set(auth(superAdmin))).status).toBe(200);
      return original(...args);
    });
    try {
      const result = await request(app).post(`/api/v1/platform/seo-growth/contents/${draft._id}/regenerate`).set(auth(superAdmin)).send({});
      expect(result.status).toBe(409);
      expect(await BlogPost.findById(post._id)).toBeNull();
      expect(await SeoJob.findById(job._id).lean()).toMatchObject({ status: 'completed', stage: 'draft_deleted' });
    } finally { regenerate.mockRestore(); }
  });

  it('renders the public guides hub without exposing draft articles', async () => {
    await BlogPost.create({ ...input, slug: 'private-draft', title: 'Private draft title', status: 'draft' });
    const hub = await request(app).get('/blog');
    expect(hub.status).toBe(200);
    expect(hub.text).toContain('Blog &amp; Guides | Shelf Merch');
    expect(hub.text).toContain('/images/logo/shelfmerch-wordmark.png');
    expect(hub.text).toContain('id="guides"');
    expect(hub.text).toContain('/case-studies/zoho-people');
    expect(hub.text).toContain('/docs/zoho-people/admin-guide');
    expect(hub.text).toContain('New articles are on their way.');
    expect(hub.text).not.toContain('Private draft title');
    expect(hub.text).not.toContain('/blog/private-draft');
  });

  it('paginates published articles and rejects invalid public page numbers', async () => {
    await BlogPost.insertMany(Array.from({ length: 13 }, (_, index) => ({ ...input, slug: `article-${index}`, title: `Article ${index}`, status: 'published', publishedAt: new Date(2026, 0, index + 1) })));
    const first = await request(app).get('/blog');
    expect(first.text).toContain('/blog?page=2#articles');
    expect(first.text).toContain('Article 12');
    expect(first.text).not.toContain('href="/blog/article-0"');
    const second = await request(app).get('/blog?page=2');
    expect(second.status).toBe(200);
    expect(second.text).toContain('Article 0');
    expect(second.text).toContain('/blog#articles');
    expect((await request(app).get('/blog?page=0')).status).toBe(404);
    expect((await request(app).get('/blog?page=3')).status).toBe(404);
  });

  it('keeps drafts private and updates public HTML and sitemap when published or unpublished', async () => {
    const created = await request(app).post('/api/v1/platform/blog-posts').set(auth(sales)).send(input);
    expect(created.status).toBe(201);
    const id = created.body._id;
    expect((await request(app).get('/blog/better-merch')).status).toBe(404);
    expect((await request(app).get('/sitemap-blog.xml')).text).not.toContain('/blog/better-merch');

    const published = await request(app).post(`/api/v1/platform/blog-posts/${id}/publish`).set(auth(sales));
    expect(published.status).toBe(200);
    const article = await request(app).get('/blog/better-merch');
    expect(article.status).toBe(200);
    expect(article.text).toContain('<h1>Better merch</h1>');
    expect(article.text).toContain('<h2>Useful guide</h2>');
    expect(article.text).toContain('https://shelfmerch.io/blog/better-merch');
    expect(article.text).toContain('"@type":"BlogPosting"');
    expect(article.headers['cache-control']).toBe('no-store');
    expect((await request(app).get('/blog')).text).toContain('Better merch');
    const sitemap = await request(app).get('/sitemap-blog.xml');
    expect(sitemap.text).toContain('<loc>https://shelfmerch.io/blog/better-merch</loc>');
    expect(sitemap.text).toMatch(/<lastmod>\d{4}-\d\d-\d\dT/);
    expect(sitemap.headers['cache-control']).toBe('no-store');

    const changed = await request(app).patch(`/api/v1/platform/blog-posts/${id}`).set(auth(sales)).send({ title: 'Better merch updated' });
    expect(changed.status).toBe(200);
    expect((await request(app).get('/blog/better-merch')).text).toContain('Better merch updated');
    expect((await request(app).patch(`/api/v1/platform/blog-posts/${id}`).set(auth(sales)).send({ excerpt: '' })).status).toBe(422);
    expect((await request(app).post(`/api/v1/platform/blog-posts/${id}/unpublish`).set(auth(sales))).status).toBe(200);
    expect((await request(app).get('/blog/better-merch')).status).toBe(404);
    expect((await request(app).get('/sitemap-blog.xml')).text).not.toContain('/blog/better-merch');
    expect((await request(app).get('/sitemap.xml')).text).toContain('/sitemap-blog.xml');
  });

  it('enforces write roles, duplicate slugs and permanent published URLs', async () => {
    expect((await request(app).post('/api/v1/platform/blog-posts').set(auth(ops)).send(input)).status).toBe(403);
    expect((await request(app).post('/api/v1/platform/blog-posts').set(auth(auditor)).send(input)).status).toBe(403);
    const first = await request(app).post('/api/v1/platform/blog-posts').set(auth(superAdmin)).send(input);
    expect(first.status).toBe(201);
    expect((await request(app).post('/api/v1/platform/blog-posts').set(auth(sales)).send(input)).status).toBe(409);
    expect((await request(app).post(`/api/v1/platform/blog-posts/${first.body._id}/publish`).set(auth(superAdmin))).status).toBe(200);
    expect((await request(app).patch(`/api/v1/platform/blog-posts/${first.body._id}`).set(auth(sales)).send({ slug: 'changed-url' })).status).toBe(409);
    expect((await request(app).get('/api/v1/platform/blog-posts').set(auth(auditor))).status).toBe(200);
  });

  it('rejects unsafe editor content and only accepts blog-uploaded images', async () => {
    const unsafe = { type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: 'Click', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
    ] }] };
    expect((await request(app).post('/api/v1/platform/blog-posts').set(auth(sales)).send({ ...input, content: unsafe })).status).toBe(422);
    const foreignImage = { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://evil.test/image.png', alt: 'Example' } }] };
    expect((await request(app).post('/api/v1/platform/blog-posts').set(auth(sales)).send({ ...input, content: foreignImage })).status).toBe(422);
    expect((await request(app).post('/api/v1/platform/blog-posts/images').set(auth(sales))
      .attach('image', Buffer.from('<svg/>'), { filename: 'unsafe.svg', contentType: 'image/svg+xml' })).status).toBe(415);

    const upload = await request(app).post('/api/v1/platform/blog-posts/images').set(auth(sales))
      .attach('image', Buffer.from([137, 80, 78, 71]), { filename: 'cover.png', contentType: 'image/png' });
    expect(upload.status).toBe(201);
    const media = await request(app).get(upload.body.url);
    expect(media.status).toBe(200);
    expect(media.headers['content-type']).toMatch(/image\/png/);
    expect(media.headers['x-content-type-options']).toBe('nosniff');
    const created = await request(app).post('/api/v1/platform/blog-posts').set(auth(sales))
      .send({ ...input, coverImageUrl: upload.body.url, coverImageAlt: 'A useful gift' });
    expect(created.status).toBe(201);
  });

  it('escapes article text and metadata in crawler HTML', async () => {
    const dangerous = { ...input, slug: 'escaped-article', title: '<script>alert(1)</script>',
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '<img src=x onerror=alert(1)>' }] }] } };
    const created = await request(app).post('/api/v1/platform/blog-posts').set(auth(sales)).send(dangerous);
    expect(created.status).toBe(201);
    expect((await request(app).post(`/api/v1/platform/blog-posts/${created.body._id}/publish`).set(auth(sales))).status).toBe(200);
    const html = (await request(app).get('/blog/escaped-article')).text;
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});
