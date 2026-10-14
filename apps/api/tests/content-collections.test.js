import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { ContentPage } from '../src/modules/seo/contentPage.model.js';

const content = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'What is different' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'A factual comparison.' }] },
  ],
};

let app;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

describe('compare and solutions publishing foundation', () => {
  it('keeps empty hubs out of the index and renders a published page with sitemap metadata', async () => {
    const empty = await request(app).get('/compare');
    expect(empty.status).toBe(200);
    expect(empty.headers['x-robots-tag']).toBe('noindex, follow');
    expect(empty.text).toContain('<h1>Compare ShelfMerch</h1>');
    expect(empty.text).toContain('name="robots" content="noindex, follow"');

    const emptySitemap = await request(app).get('/sitemap-compare.xml');
    expect(emptySitemap.status).toBe(200);
    expect(emptySitemap.text).not.toContain('<loc>');

    await ContentPage.create({
      kind: 'compare',
      slug: 'shelfmerch-vs-spreadsheets',
      title: 'ShelfMerch vs spreadsheets',
      excerpt: 'How a shared catalog compares with tracking swag in spreadsheets.',
      content,
      seoTitle: 'ShelfMerch vs spreadsheets',
      seoDescription: 'A comparison of ShelfMerch and spreadsheet-based swag tracking.',
      status: 'draft',
    });
    expect((await request(app).get('/compare/shelfmerch-vs-spreadsheets')).status).toBe(404);
    expect((await request(app).get('/sitemap-compare.xml')).text).not.toContain('shelfmerch-vs-spreadsheets');

    await ContentPage.updateOne({ slug: 'shelfmerch-vs-spreadsheets' }, {
      status: 'published',
      publishedAt: new Date('2026-10-01T00:00:00.000Z'),
    });

    const article = await request(app).get('/compare/shelfmerch-vs-spreadsheets');
    expect(article.status).toBe(200);
    expect(article.headers['x-robots-tag']).toBe('index, follow');
    expect(article.text).toContain('<h1>ShelfMerch vs spreadsheets</h1>');
    expect(article.text).toContain('<h2>What is different</h2>');
    expect(article.text).toContain('<link rel="canonical" href="https://shelfmerch.io/compare/shelfmerch-vs-spreadsheets" />');
    expect(article.text).toContain('A factual comparison.');
    expect(article.text).not.toContain('/app/');

    const hub = await request(app).get('/compare');
    expect(hub.headers['x-robots-tag']).toBe('index, follow');
    expect(hub.text).toContain('href="/compare/shelfmerch-vs-spreadsheets"');

    const sitemap = await request(app).get('/sitemap-compare.xml');
    expect(sitemap.headers['cache-control']).toBe('private, no-store');
    expect(sitemap.text).toContain('<loc>https://shelfmerch.io/compare</loc>');
    expect(sitemap.text).toContain('<loc>https://shelfmerch.io/compare/shelfmerch-vs-spreadsheets</loc>');
    expect(sitemap.text).not.toContain('/app/');
    expect(sitemap.text).not.toContain('/login');
  });

  it('serves solutions on their own canonical path', async () => {
    await ContentPage.create({
      kind: 'solution',
      slug: 'employee-onboarding',
      title: 'Employee onboarding',
      excerpt: 'Kits and gifts for a new hire’s first week.',
      content,
      status: 'published',
      publishedAt: new Date('2026-10-02T00:00:00.000Z'),
    });
    const page = await request(app).get('/solutions/employee-onboarding');
    expect(page.status).toBe(200);
    expect(page.text).toContain('https://shelfmerch.io/solutions/employee-onboarding');
    expect((await request(app).get('/compare/employee-onboarding')).status).toBe(404);
    const sitemap = await request(app).get('/sitemap-solutions.xml');
    expect(sitemap.text).toContain('<loc>https://shelfmerch.io/solutions/employee-onboarding</loc>');
    expect(sitemap.text).not.toContain('/compare/');
  });

  it('escapes stored content, hides unsafe documents, and keeps canonicals aligned with the sitemap', async () => {
    expect(ContentPage.schema.path('tenantId')).toBeUndefined();
    const payload = '</script><img src=x onerror=alert(1)>';
    await ContentPage.create({
      kind: 'compare',
      slug: 'xss-check',
      title: payload,
      excerpt: '"><img src=x onerror=alert(1)>',
      seoTitle: payload,
      seoDescription: payload,
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: payload }] }],
      },
      status: 'published',
      publishedAt: new Date('2026-10-03T00:00:00.000Z'),
    });
    await ContentPage.create({
      kind: 'compare',
      slug: 'bad-link',
      title: 'Bad link',
      excerpt: 'Should not publish.',
      content: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: 'click', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }],
        }],
      },
      status: 'published',
      publishedAt: new Date('2026-10-03T00:00:00.000Z'),
    });

    const page = await request(app).get('/compare/xss-check');
    expect(page.status).toBe(200);
    expect(page.text).toContain('&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;');
    expect(page.text).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
    expect(page.text).not.toContain('<script>alert');
    expect(page.text).not.toContain('</script><img');
    expect(page.text).toContain('\\u003c/script>\\u003cimg');
    expect(page.headers['cache-control']).toBe('private, no-store');
    const canonical = page.text.match(/<link rel="canonical" href="([^"]+)"/)[1];
    expect(canonical).toBe('https://shelfmerch.io/compare/xss-check');

    const blocked = await request(app).get('/compare/bad-link');
    expect(blocked.status).toBe(404);
    expect(blocked.text).not.toContain('javascript:alert');
    expect(blocked.headers['x-robots-tag']).toBe('noindex, follow');

    const sitemap = await request(app).get('/sitemap-compare.xml');
    expect(sitemap.text).toContain(`<loc>${canonical}</loc>`);
    expect(sitemap.text).not.toContain('bad-link');
    expect(sitemap.text).not.toContain('javascript:');

    const slash = await request(app).get('/compare/xss-check/');
    expect(slash.status).toBe(301);
    expect(slash.headers.location).toBe('/compare/xss-check');
    expect((await request(app).get('/compare/')).status).toBe(301);
  });
});
