import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';

let app;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

describe('catalog product initial HTML', () => {
  it('returns public product facts in the first response and hides unavailable products', async () => {
    const active = await CatalogProduct.create({
      sku: 'SEO-PDP-1',
      name: 'Summit Tee <script>',
      description: 'A public cotton tee for company stores.',
      brand: 'ShelfMerch',
      category: 'Apparel',
      basePriceInr: 987654,
      status: 'active',
      primaryImageUrl: '/images/landing/hero.png',
      inventory: { available: 42, reserved: 3 },
      source: { provider: 'manual' },
    });
    const draft = await CatalogProduct.create({
      sku: 'SEO-PDP-DRAFT',
      name: 'Secret Draft Hoodie',
      description: 'Hidden',
      category: 'Apparel',
      basePriceInr: 100,
      status: 'draft',
      source: { provider: 'manual' },
    });
    const archived = await CatalogProduct.create({
      sku: 'SEO-PDP-ARCHIVED',
      name: 'Archived Private Mug',
      description: 'Hidden',
      category: 'Drinkware',
      basePriceInr: 100,
      status: 'archived',
      source: { provider: 'manual' },
    });

    const page = await request(app).get(`/apps/catalog/${active._id}`);
    expect(page.status).toBe(200);
    expect(page.headers['cache-control']).toBe('private, no-store');
    expect(page.text).toContain('<div id="root"></div>');
    expect(page.text).not.toContain('seo-snapshot');
    expect(page.text).toContain('<title>Summit Tee &lt;script&gt; | ShelfMerch</title>');
    expect(page.text).toContain('A public cotton tee for company stores.');
    expect(page.text).toContain(`<link rel="canonical" href="https://shelfmerch.io/apps/catalog/${active._id}" />`);
    expect(page.text).not.toContain('"@type":"Product"');
    expect(page.text).not.toContain('"aggregateRating"');
    expect(page.text).not.toContain('"review"');
    expect(page.text).not.toContain('987654');
    expect(page.text).not.toContain('"offers"');
    expect(page.text).not.toContain('Secret Draft');
    expect(page.text).not.toContain('"available":42');
    expect((page.text.match(/googletagmanager/g) || []).length).toBeLessThanOrEqual(2);

    const hidden = await request(app).get(`/apps/catalog/${draft._id}`);
    expect(hidden.status).toBe(404);
    expect(hidden.headers['x-robots-tag']).toBe('noindex, follow');
    expect(hidden.text).not.toContain('Secret Draft Hoodie');

    const gone = await request(app).get(`/apps/catalog/${archived._id}`);
    expect(gone.status).toBe(404);
    expect(gone.text).not.toContain('Archived Private Mug');

    const missing = await request(app).get('/apps/catalog/507f1f77bcf86cd799439011');
    expect(missing.status).toBe(404);
    expect(missing.text).toContain('Product not found');

    const slash = await request(app).get(`/apps/catalog/${active._id}/`);
    expect(slash.status).toBe(301);
    expect(slash.headers.location).toBe(`/apps/catalog/${active._id}`);

    const sitemap = await request(app).get('/sitemap-catalog.xml');
    expect(sitemap.text).toContain(`<loc>https://shelfmerch.io/apps/catalog/${active._id}</loc>`);
    expect(sitemap.text).not.toContain(String(draft._id));
  });
});

describe('public URL status codes', () => {
  it('404s unknown marketing urls and redirects known aliases without touching app prefixes', async () => {
    const unknown = await request(app).get('/no-such-marketing-page');
    expect(unknown.status).toBe(404);
    expect(unknown.headers['x-robots-tag']).toBe('noindex, follow');
    expect(unknown.text).toContain('<h1>Page not found</h1>');
    expect(unknown.text).not.toContain('id="root"');

    const about = await request(app).get('/about/');
    expect(about.status).toBe(301);
    expect(about.headers.location).toBe('/about');

    const contact = await request(app).get('/contact');
    expect(contact.status).toBe(301);
    expect(contact.headers.location).toBe('/contact-us');

    const platform = await request(app).get('/platform/');
    expect(platform.status).toBe(301);
    expect(platform.headers.location).toBe('/platform');
  });
});

import { applyCatalogProductSeo, catalogProductMeta } from '../src/modules/seo/catalogProductDocument.js';

describe('product structured data eligibility', () => {
  const shell = '<!doctype html><html><head><title>Old</title><script type="application/ld+json" id="seo-jsonld">{"@type":"Organization"}</script></head><body><div id="root"></div></body></html>';

  it('keeps indexable metadata and drops Product JSON-LD without an offer or review', () => {
    const meta = catalogProductMeta({
      id: '507f1f77bcf86cd799439011',
      name: 'Summit Tee',
      description: 'A public cotton tee',
      image: '/images/landing/hero.png',
      basePriceInr: 987654,
    }, 'https://shelfmerch.io');
    expect(meta.jsonLd).toBeNull();
    expect(JSON.stringify(meta)).not.toContain('987654');
    const html = applyCatalogProductSeo(shell, {
      id: '507f1f77bcf86cd799439011',
      name: 'Summit Tee',
      description: 'A public cotton tee',
      image: '/images/landing/hero.png',
    }, 'https://shelfmerch.io');
    expect(html).toContain('<title>Summit Tee | ShelfMerch</title>');
    expect(html).toContain('rel="canonical" href="https://shelfmerch.io/apps/catalog/507f1f77bcf86cd799439011"');
    expect(html).toContain('og:image" content="https://shelfmerch.io/images/landing/hero.png"');
    expect(html).toContain('name="robots" content="index, follow"');
    expect(html).not.toContain('"@type":"Product"');
    expect(html).not.toContain('Organization');
  });

  it('emits Product JSON-LD when a real public offer is supplied', () => {
    const meta = catalogProductMeta({
      id: '507f1f77bcf86cd799439011',
      name: 'Summit Tee',
      description: 'A public cotton tee',
      offer: { price: 599, priceCurrency: 'INR' },
    }, 'https://shelfmerch.io');
    expect(meta.jsonLd.offers.price).toBe(599);
    expect(meta.jsonLd.offers.priceCurrency).toBe('INR');
    expect(meta.jsonLd.aggregateRating).toBeUndefined();
    const html = applyCatalogProductSeo(shell, {
      id: '507f1f77bcf86cd799439011',
      name: 'Summit Tee',
      offer: { price: 599, priceCurrency: 'INR' },
    }, 'https://shelfmerch.io');
    expect(html).toContain('"@type":"Product"');
    expect(html).toContain('"price":599');
    expect(html).not.toContain('aggregateRating');
    expect(html).not.toContain('InStock');
  });
});
