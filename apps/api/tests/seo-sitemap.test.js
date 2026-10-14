import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import {
  buildCatalogSitemapXml,
  escapeXml,
} from '../src/modules/seo/sitemap.controller.js';

const FORBIDDEN_LOCS = [
  'https://shelfmerch.io/app/',
  'https://shelfmerch.io/login',
  'https://shelfmerch.io/signup',
  'https://shelfmerch.io/forgot-password',
  'https://shelfmerch.io/reset-password',
  'https://shelfmerch.io/accept-invite',
  'https://shelfmerch.io/redeem/',
  'https://shelfmerch.io/zoho/',
  'https://shelfmerch.io/platform/dashboard',
  'https://shelfmerch.io/privacy',
  'https://shelfmerch.io/terms',
  'https://shelfmerch.io/app/catalog',
];

const EXPECTED_STATIC_URLS = [
  'https://shelfmerch.io/',
  'https://shelfmerch.io/about',
  'https://shelfmerch.io/careers',
  'https://shelfmerch.io/platform',
  'https://shelfmerch.io/resources',
  'https://shelfmerch.io/blog',
  'https://shelfmerch.io/resources/hr',
  'https://shelfmerch.io/resources/sales',
  'https://shelfmerch.io/resources/events',
  'https://shelfmerch.io/request-demo',
  'https://shelfmerch.io/contact-us',
  'https://shelfmerch.io/apps/catalog',
  'https://shelfmerch.io/apps/catalog/category/apparel',
  'https://shelfmerch.io/apps/catalog/category/accessories',
  'https://shelfmerch.io/apps/catalog/category/bags',
  'https://shelfmerch.io/apps/catalog/category/drinkware',
  'https://shelfmerch.io/apps/catalog/category/technology',
  'https://shelfmerch.io/apps/catalog/category/office-supplies',
  'https://shelfmerch.io/apps/catalog/category/kits',
  'https://shelfmerch.io/integrations/slack',
  'https://shelfmerch.io/support',
  'https://shelfmerch.io/legal/privacy-policy',
  'https://shelfmerch.io/legal/terms-of-service',
  'https://shelfmerch.io/docs/zoho-people',
  'https://shelfmerch.io/docs/zoho-people/user-guide',
  'https://shelfmerch.io/docs/zoho-people/admin-guide',
  'https://shelfmerch.io/case-studies/zoho-people',
];

let app;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});

afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
});

describe('SEO robots.txt', () => {
  it('allows crawling so noindex can be read, and publishes the sitemap', async () => {
    const res = await request(app).get('/robots.txt');
    expect(res.status).toBe(200);
    expect(String(res.headers['content-type'] || '')).toMatch(/text\/plain/i);
    const body = String(res.text || '');
    expect(body).toContain('Sitemap: https://shelfmerch.io/sitemap.xml');
    expect(body).toContain('Allow: /');
    expect(body).toContain('Disallow: /api/');
    expect(body).toContain('Disallow: /uploads/');
    expect(body).toContain('Disallow: /email-assets/');
    expect(body).not.toMatch(/^Disallow: \/(app|login|platform|shop)/m);
  });
});

describe('SEO sitemap index + static', () => {
  it('GET /sitemap.xml returns a sitemap index', async () => {
    const res = await request(app).get('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(String(res.headers['content-type'] || '')).toMatch(/xml/i);
    const body = String(res.text || '');
    expect(body).toContain('<sitemapindex');
    expect(body).toContain('https://shelfmerch.io/sitemap-static.xml');
    expect(body).toContain('https://shelfmerch.io/sitemap-catalog.xml');
    expect(body).toContain('https://shelfmerch.io/sitemap-blog.xml');
    expect(body).toContain('https://shelfmerch.io/sitemap-compare.xml');
    expect(body).toContain('https://shelfmerch.io/sitemap-solutions.xml');
    expect(body).not.toContain('<html');
  });

  it('GET /sitemap-static.xml lists canonical public URLs only', async () => {
    const res = await request(app).get('/sitemap-static.xml');
    expect(res.status).toBe(200);
    expect(String(res.headers['content-type'] || '')).toMatch(/xml/i);
    const body = String(res.text || '');
    expect(body).toContain('<urlset');
    for (const url of EXPECTED_STATIC_URLS) {
      expect(body).toContain(`<loc>${url}</loc>`);
    }
    for (const loc of FORBIDDEN_LOCS) {
      expect(body).not.toContain(`<loc>${loc}</loc>`);
    }
    expect(body).not.toContain('lastmod');
    expect(body).not.toContain('changefreq');
    expect(body).not.toContain('priority');
  });
});

describe('SEO sitemap-catalog.xml', () => {
  it('includes active public products and excludes inactive ones', async () => {
    const active = await CatalogProduct.create({
      sku: 'SEO-ACTIVE-1',
      name: 'Active Tee',
      category: 'Apparel',
      basePriceInr: 500,
      status: 'active',
      source: { provider: 'manual' },
    });
    const draft = await CatalogProduct.create({
      sku: 'SEO-DRAFT-1',
      name: 'Draft Tee',
      category: 'Apparel',
      basePriceInr: 500,
      status: 'draft',
      source: { provider: 'manual' },
    });
    const archived = await CatalogProduct.create({
      sku: 'SEO-ARCH-1',
      name: 'Archived Tee',
      category: 'Apparel',
      basePriceInr: 500,
      status: 'archived',
      source: { provider: 'manual' },
    });

    const res = await request(app).get('/sitemap-catalog.xml');
    expect(res.status).toBe(200);
    expect(String(res.headers['content-type'] || '')).toMatch(/xml/i);
    expect(res.headers['cache-control']).toMatch(/public/i);
    const body = String(res.text || '');
    expect(body).toContain('<urlset');
    expect(body).toContain(`https://shelfmerch.io/apps/catalog/${active._id}`);
    expect(body).not.toContain(String(draft._id));
    expect(body).not.toContain(String(archived._id));
    expect(body).not.toContain('<html');
  });

  it('XML-escapes loc values safely', () => {
    const xml = buildCatalogSitemapXml(['abc&<>"\'']);
    expect(xml).toContain(escapeXml('https://shelfmerch.io/apps/catalog/abc&<>"\''));
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&lt;');
    expect(xml).toContain('&gt;');
    expect(xml).toContain('&quot;');
    expect(xml).toContain('&apos;');
    expect(xml).not.toContain(`<loc>https://shelfmerch.io/apps/catalog/abc&<>`);
  });

  it('returns a controlled server error (not SPA HTML) on DB failure', async () => {
    const spy = vi.spyOn(CatalogProduct, 'find').mockImplementation(() => {
      throw new Error('simulated mongo failure');
    });

    try {
      const res = await request(app).get('/sitemap-catalog.xml');
      expect(res.status).toBe(500);
      expect(String(res.headers['content-type'] || '')).toMatch(/json/i);
      expect(res.body?.error?.code).toBe('INTERNAL');
      const raw = String(res.text || '');
      expect(raw).not.toMatch(/<!doctype html/i);
      expect(raw).not.toContain('id="root"');
    } finally {
      spy.mockRestore();
    }
  });
});
