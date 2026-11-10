import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { Category } from '../src/modules/catalog/category.model.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { authHeader, makeTenant, makeUser } from './helpers.js';
import {
  CATALOG_PRODUCT_CARD_MIME,
  CATALOG_PRODUCT_CARD_URI,
  catalogBrowseFilters,
  catalogCardSession,
  catalogColorPreview,
  catalogPageNote,
  catalogProductCardHtml,
  publicCatalogProductUrl,
  catalogProductCards,
  catalogProductCardView,
  CATALOG_GRID_PAGE,
  officialCatalogImageUrl,
} from '../src/modules/mcp/catalogProductCard.js';

const PROTOCOL = '2026-07-28';
const SECRET_SUPPLIER = 'Secret Mill Wave1';
const SECRET_DOMAIN = 'supplier.internal.wave1';
const SECRET_EXTERNAL = 'shopify-secret-wave1';
const SECRET_COST = 424242;
const SECRET_EXTRA = 777701;
const SECRET_MASK = 'https://cdn.example/mask-secret-wave1.png';
const SECRET_BASE = 'https://cdn.example/base-secret-wave1.png';
const PUBLIC_IMAGE = 'https://cdn.example/mug-front-wave1.jpg';

let app;

function mcpRequest(token, method, params = {}) {
  const req = request(app)
    .post('/mcp')
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .set('MCP-Protocol-Version', PROTOCOL)
    .set('Mcp-Method', method);
  if (typeof params.name === 'string') req.set('Mcp-Name', params.name);
  if (method === 'resources/read' && typeof params.uri === 'string') req.set('Mcp-Name', params.uri);
  if (token) req.set(authHeader(token));
  return req.send({
    jsonrpc: '2.0',
    id: 1,
    method,
    params: {
      ...params,
      _meta: {
        'io.modelcontextprotocol/protocolVersion': PROTOCOL,
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    },
  });
}

function rpcBody(res) {
  if (res.body && typeof res.body === 'object' && res.body.jsonrpc) return res.body;
  const text = res.text ?? '';
  const line = text.split(/\r?\n/).find((row) => row.startsWith('data: '));
  if (!line) {
    throw new Error(`Unexpected MCP response ${res.status}: ${text.slice(0, 600)}`);
  }
  return JSON.parse(line.slice('data: '.length));
}

async function callTool(token, name, args = {}) {
  const res = await mcpRequest(token, 'tools/call', { name, arguments: args });
  expect(res.status, JSON.stringify(res.body ?? res.text).slice(0, 800)).toBe(200);
  return rpcBody(res).result;
}

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});

afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  clearTenantLimitCache();
});

async function seedVisibleProduct() {
  const vendorId = new mongoose.Types.ObjectId();
  const product = await CatalogProduct.create({
    sku: 'MUG-DETAIL',
    name: 'Detail Mug',
    brand: 'Shelf',
    category: 'Drinkware',
    subcategory: 'Mugs',
    basePriceInr: 118,
    gstRate: 18,
    moq: 12,
    description: 'A white and gold desk mug.',
    costPriceInr: SECRET_COST,
    supplierName: SECRET_SUPPLIER,
    vendorId,
    status: 'active',
    primaryImageUrl: PUBLIC_IMAGE,
    imageUrls: [PUBLIC_IMAGE, 'https://cdn.example/mug-side-wave1.jpg'],
    baseImageUrl: SECRET_BASE,
    maskImageUrl: SECRET_MASK,
    customization: [{ method: 'screen_print', extraCostInr: SECRET_EXTRA }],
    source: {
      provider: 'manual',
      domain: SECRET_DOMAIN,
      externalId: SECRET_EXTERNAL,
    },
    variants: [
      { sku: 'MUG-DETAIL-WHT', color: 'White', size: 'OS', stock: 4, enabled: true },
      { sku: 'MUG-DETAIL-OLD', color: 'Grey', size: 'OS', stock: 1, enabled: false, priceOverrideInr: 50 },
      { sku: 'MUG-DETAIL-LUX', color: 'Gold', size: 'OS', priceOverrideInr: 236, stock: 2, enabled: true },
    ],
  });
  const hidden = await CatalogProduct.create({
    sku: 'HID-IMPORT',
    name: 'Imported Secret',
    category: 'Drinkware',
    basePriceInr: 118,
    status: 'active',
    supplierName: SECRET_SUPPLIER,
    source: { provider: 'import', externalId: SECRET_EXTERNAL },
  });
  const draft = await CatalogProduct.create({
    sku: 'DRF-DETAIL',
    name: 'Draft Detail',
    category: 'Drinkware',
    basePriceInr: 118,
    status: 'draft',
    source: { provider: 'manual' },
  });
  const kit = await CatalogProduct.create({
    sku: 'KIT-DETAIL',
    name: 'Kit Detail',
    category: 'Drinkware',
    basePriceInr: 118,
    status: 'active',
    source: { provider: 'manual', kindOverride: 'kit' },
  });
  return { product, hidden, draft, kit, vendorId };
}

function expectRedacted(payload) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  expect(text).not.toContain('costPriceInr');
  expect(text).not.toContain('supplierName');
  expect(text).not.toContain(SECRET_SUPPLIER);
  expect(text).not.toContain(String(SECRET_COST));
  expect(text).not.toContain('margin');
  expect(text).not.toContain('vendorId');
  expect(text).not.toContain(SECRET_DOMAIN);
  expect(text).not.toContain(SECRET_EXTERNAL);
  expect(text).not.toContain('extraCostInr');
  expect(text).not.toContain(String(SECRET_EXTRA));
  expect(text).not.toContain(SECRET_MASK);
  expect(text).not.toContain(SECRET_BASE);
  expect(text).not.toContain('MUG-DETAIL-OLD');
}

describe('catalog read tools', () => {
  it('lists the new read tools beside catalog_search', async () => {
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin', 'tenant');
    const listed = rpcBody(await mcpRequest(token, 'tools/list'));
    const names = listed.result.tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(['catalog_search', 'catalog_get_product', 'catalog_list_categories']));
    const productTool = listed.result.tools.find((entry) => entry.name === 'catalog_get_product');
    expect(productTool.description).toContain('primaryImageUrl');
    expect(productTool.description).toContain('web search');
    expect(productTool.description).toContain('inspiration');
    expect(CATALOG_PRODUCT_CARD_URI).toBe('ui://shelfmerch/catalog-product-card-v7.html');
    expect(productTool._meta.ui.resourceUri).toBe(CATALOG_PRODUCT_CARD_URI);
    expect(productTool._meta['openai/outputTemplate']).toBe(CATALOG_PRODUCT_CARD_URI);
    const searchTool = listed.result.tools.find((entry) => entry.name === 'catalog_search');
    expect(searchTool._meta.ui.resourceUri).toBe(CATALOG_PRODUCT_CARD_URI);
    expect(searchTool._meta['openai/outputTemplate']).toBe(CATALOG_PRODUCT_CARD_URI);
    expect(searchTool.description).toContain('do not repeat the product list');
    expect(productTool.description).toContain('do not repeat');
    for (const name of ['catalog_get_product', 'catalog_list_categories']) {
      const tool = listed.result.tools.find((entry) => entry.name === name);
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.annotations.destructiveHint).toBe(false);
      expect(tool.annotations.openWorldHint).toBe(false);
    }
  });

  it('refuses finance, recipient, and platform catalog admin', async () => {
    const tenant = await makeTenant();
    const finance = await makeUser(tenant, 'company_finance_user', 'tenant');
    const recipient = await makeUser(tenant, 'recipient', 'tenant');
    const catalogAdmin = await makeUser(null, 'platform_catalog_admin', 'platform');
    for (const token of [finance.token, recipient.token, catalogAdmin.token]) {
      const res = await mcpRequest(token, 'tools/call', {
        name: 'catalog_get_product',
        arguments: { productId: new mongoose.Types.ObjectId().toString() },
      });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('returns the selling-price detail for an active tenant-visible product', async () => {
    const { product } = await seedVisibleProduct();
    const tenant = await makeTenant();
    const admin = await makeUser(tenant, 'company_admin', 'tenant');
    const manager = await makeUser(tenant, 'entity_manager', 'tenant');

    for (const token of [admin.token, manager.token]) {
      const result = await callTool(token, 'catalog_get_product', { productId: String(product._id) });
      expect(result.isError).not.toBe(true);
      const item = result.structuredContent;
      expect(item).toMatchObject({
        id: String(product._id),
        sku: 'MUG-DETAIL',
        name: 'Detail Mug',
        brand: 'Shelf',
        category: 'Drinkware',
        sellingPriceInr: 118,
        gstRate: 18,
        moq: 12,
        primaryImageUrl: PUBLIC_IMAGE,
        description: 'A white and gold desk mug.',
      });
      expect(item.images).toEqual([
        PUBLIC_IMAGE,
        'https://cdn.example/mug-side-wave1.jpg',
      ]);
      expect(item.variants).toEqual([
        expect.objectContaining({ sku: 'MUG-DETAIL-WHT', sellingPriceInr: 118, stock: 4 }),
        expect.objectContaining({ sku: 'MUG-DETAIL-LUX', sellingPriceInr: 118, stock: 2 }),
      ]);
      expectRedacted(result);
      expect(result.content[0].text).toContain('ShelfMerch catalog');
      expect(result.content[0].text).toContain(PUBLIC_IMAGE);
      expect(result.content[0].text).toContain('inspiration');
      expect(result.content[0].text).toContain('https://cdn.example/mug-side-wave1.jpg');
      expect(result.content[0].text).toContain('A white and gold desk mug.');
      expect(result.content.some((block) => block.type === 'resource_link')).toBe(false);
    }
  });

  it('hides inactive, kit, and non-tenant products from every tenant', async () => {
    const { product, hidden, draft, kit } = await seedVisibleProduct();
    const first = await makeTenant();
    const second = await makeTenant();
    const adminA = await makeUser(first, 'company_admin', 'tenant');
    const adminB = await makeUser(second, 'company_admin', 'tenant');

    const visibleA = await callTool(adminA.token, 'catalog_get_product', { productId: String(product._id) });
    const visibleB = await callTool(adminB.token, 'catalog_get_product', { productId: String(product._id) });
    expect(visibleA.structuredContent.sku).toBe('MUG-DETAIL');
    expect(visibleB.structuredContent.sku).toBe('MUG-DETAIL');

    for (const token of [adminA.token, adminB.token]) {
      for (const id of [hidden._id, draft._id, kit._id, new mongoose.Types.ObjectId()]) {
        const result = await callTool(token, 'catalog_get_product', { productId: String(id) });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe('Product not found.');
        expectRedacted(result);
        expect(JSON.stringify(result)).not.toContain('HID-IMPORT');
        expect(JSON.stringify(result)).not.toContain('Draft Detail');
        expect(JSON.stringify(result)).not.toContain('Kit Detail');
      }
    }
  });

  it('rejects a product id that is not an object id', async () => {
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin', 'tenant');
    const result = await callTool(token, 'catalog_get_product', { productId: 'not-an-id' });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain(SECRET_SUPPLIER);
  });

  it('hides database failures from the product lookup', async () => {
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin', 'tenant');
    const findSpy = vi.spyOn(CatalogProduct, 'findOne').mockReturnValue({
      select() {
        return this;
      },
      lean() {
        return Promise.reject(new Error('ECONNREFUSED secret plan'));
      },
    });
    try {
      const result = await callTool(token, 'catalog_get_product', {
        productId: new mongoose.Types.ObjectId().toString(),
      });
      expect(result.isError).toBe(true);
      const payload = JSON.stringify(result);
      expect(payload).toContain('Product lookup failed');
      expect(payload).not.toContain('ECONNREFUSED');
      expect(payload).not.toContain('secret plan');
    } finally {
      findSpy.mockRestore();
    }
  });

  it('returns the active category hierarchy and omits archived nodes', async () => {
    const parent = await Category.create({
      name: 'Drinkware',
      slug: 'drinkware',
      description: 'Cups',
      status: 'active',
      sortOrder: 1,
    });
    await Category.create({
      name: 'Mugs',
      slug: 'mugs',
      description: 'Hot drinks',
      status: 'active',
      parentId: parent._id,
      depth: 1,
      sortOrder: 2,
    });
    await Category.create({
      name: 'Retired',
      slug: 'retired',
      status: 'archived',
      sortOrder: 0,
    });
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin', 'tenant');
    const result = await callTool(token, 'catalog_list_categories', {});
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent.categories).toEqual([
      {
        id: String(parent._id),
        name: 'Drinkware',
        slug: 'drinkware',
        sortOrder: 1,
        description: 'Cups',
        children: [
          {
            id: expect.any(String),
            name: 'Mugs',
            slug: 'mugs',
            sortOrder: 2,
            description: 'Hot drinks',
            children: [],
          },
        ],
      },
    ]);
    const payload = JSON.stringify(result);
    expect(payload).not.toContain('Retired');
    expect(payload).not.toContain('archived');
    expect(result.content[0].text).toContain('Drinkware');
    expect(result.content[0].text).toContain('Mugs');
  });

  it('serves one product card resource for every catalog product', async () => {
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin', 'tenant');
    const finance = await makeUser(tenant, 'company_finance_user', 'tenant');
    const listed = rpcBody(await mcpRequest(token, 'resources/list'));
    const card = listed.result.resources.find((entry) => entry.uri === CATALOG_PRODUCT_CARD_URI);
    expect(card.mimeType).toBe(CATALOG_PRODUCT_CARD_MIME);
    expect(card.description).toContain('catalog_get_product');

    const read = rpcBody(await mcpRequest(token, 'resources/read', { uri: CATALOG_PRODUCT_CARD_URI }));
    const content = read.result.contents[0];
    expect(content.mimeType).toBe(CATALOG_PRODUCT_CARD_MIME);
    expect(content.text).toContain('<!DOCTYPE html>');
    expect(content.text).toContain('ui/notifications/tool-result');
    expect(content.text).toContain('toolOutput');
    expect(card._meta.ui.csp.resourceDomains).toContain('https://cdn.shopify.com');
    expect(content.text).toContain('Image unavailable');
    expect(content.text).toContain('Product Information');
    expect(content.text).toContain('View details');
    expect(content.text).toContain('Show more');
    expect(content.text).toContain('Back');
    expect(content.text).toContain('ui/notifications/tool-result');
    expect(content.text.toLowerCase()).not.toContain('gst');
    expect(content.text).not.toContain('Polo');
    expect(content.text).not.toContain('Hoodies');
    expect(content.text).not.toContain('6a82b7d8a03ad62bdb7f3bc9');
    expect(content.text).not.toContain('Blue Travel');
    expect(content._meta.ui.csp.resourceDomains).toContain('https://cdn.shopify.com');
    expect(content._meta.ui.csp.connectDomains).toBeUndefined();

    const initRes = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set(authHeader(token))
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'product-card-test', version: '1.0' },
        },
      });
    const init = rpcBody(initRes);
    expect(init.result.capabilities.extensions['io.modelcontextprotocol/ui'].mimeTypes).toEqual([
      CATALOG_PRODUCT_CARD_MIME,
    ]);

    const denied = await mcpRequest(finance.token, 'resources/read', { uri: CATALOG_PRODUCT_CARD_URI });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');
  });

  it('builds the same card view for two products without a stored product', () => {
    const image = 'https://cdn.shopify.com/s/files/1/example/pack.jpg?v=1';
    const backpack = catalogProductCardView({
      id: 'pack-1',
      name: 'Travel Pack',
      description: 'Padded laptop sleeve.',
      sellingPriceInr: 700,
      gstRate: 18,
      primaryImageUrl: image,
      images: ['https://cdn.shopify.com/s/files/1/example/other.jpg'],
      variants: [
        { sku: 'PACK-BLU', color: 'Blue', size: 'OS', sellingPriceInr: 700, stock: 3 },
        { sku: 'PACK-RED', color: 'Red', size: 'OS', sellingPriceInr: 900, stock: 0 },
      ],
    });
    const mug = catalogProductCardView({
      id: 'mug-1',
      name: 'Detail Mug',
      description: '',
      sellingPriceInr: 118,
      primaryImageUrl: '',
      variants: [{ sku: 'MUG-WHT', color: 'White', size: 'OS', sellingPriceInr: 118, stock: 4 }],
    });

    expect(backpack).toMatchObject({
      name: 'Travel Pack',
      productId: 'pack-1',
      priceLabel: '₹700',
      information: 'Padded laptop sleeve.',
      imageUrl: image,
      colors: ['Blue', 'Red'],
    });
    expect(backpack.variants[1].stockLabel).toBe('Out of stock');
    expect(JSON.stringify(backpack)).not.toContain('900');
    expect(JSON.stringify(backpack).toLowerCase()).not.toContain('gst');
    expect(mug).toMatchObject({
      name: 'Detail Mug',
      priceLabel: '₹118',
      information: 'No product information available.',
      imageUrl: '',
    });
    const listed = catalogProductCards({
      structuredContent: {
        items: [
          { id: 'polo-1', name: 'ActiveDry Polo', sellingPriceInr: 390, primaryImageUrl: 'https://cdn.shopify.com/s/files/1/example/13.png' },
          { id: 'polo-2', name: 'Corporate Polo', sellingPriceInr: 610, primaryImageUrl: 'https://cdn.shopify.com/s/files/1/example/12.png' },
          { id: 'crew-1', name: 'Alif Activewear Crew Neck', sellingPriceInr: 410, primaryImageUrl: '' },
          { id: 'crew-2', name: 'Classic Crew Neck', sellingPriceInr: 410, primaryImageUrl: 'javascript:alert(1)' },
        ],
      },
    });
    expect(listed.map((item) => item.imageUrl)).toEqual([
      'https://cdn.shopify.com/s/files/1/example/13.png',
      'https://cdn.shopify.com/s/files/1/example/12.png',
      '',
      '',
    ]);
    expect(listed.map((item) => item.priceLabel)).toEqual(['₹390', '₹610', '₹410', '₹410']);
    expect(catalogProductCards({
      id: 'pack-1',
      name: 'Travel Pack',
      description: 'Padded laptop sleeve.',
      sellingPriceInr: 700,
      primaryImageUrl: image,
    })[0]).toMatchObject({ name: 'Travel Pack', priceLabel: '₹700', imageUrl: image });
    expect(publicCatalogProductUrl('507f1f77bcf86cd799439011', ['https://shelfmerch.io'])).toBe('https://shelfmerch.io/apps/catalog/507f1f77bcf86cd799439011');
    expect(publicCatalogProductUrl('pack-1', ['https://shelfmerch.io'])).toBe('');
    expect(publicCatalogProductUrl('507f1f77bcf86cd799439011', ['http://localhost:5173'])).toMatch(/\/apps\/catalog\/507f1f77bcf86cd799439011$/);
    expect(catalogProductCardHtml()).toContain(catalogProductCardView.name);
    expect(catalogProductCardHtml()).toContain('toolOutput');
    expect(catalogProductCardHtml()).toContain('container-type: inline-size');
    expect(catalogProductCardHtml()).toContain('@container (max-width: 360px)');
    expect(catalogProductCardHtml()).toContain('layoutMode');
    expect(catalogProductCardHtml()).toContain('list-stage');
    expect(catalogProductCardHtml()).not.toContain('hero-stage');
    expect(catalogProductCardHtml()).toContain('.details:hover');
    expect(catalogProductCardHtml()).toContain('initialVisibleCount');
    expect(catalogProductCardHtml()).toContain('rows.slice(0, shown)');
    expect(catalogProductCardHtml()).toContain('linkish');
    expect(catalogProductCardHtml()).toContain('row-media');
    expect(catalogProductCardHtml()).toContain('list-stage');
    expect(catalogProductCardHtml()).toContain('View on ShelfMerch');
    expect(catalogProductCardHtml()).toContain('.row-media, .kit-product-media { width: 100px;');
    expect(catalogProductCardHtml()).toContain('height: 110px');
    expect(catalogProductCardHtml()).toContain('linkish');
    expect(catalogProductCardHtml()).toContain("version: '0.8.0'");
    expect(officialCatalogImageUrl('http://cdn.shopify.com/a.jpg')).toBe('');
    expect(officialCatalogImageUrl('javascript:alert(1)')).toBe('');
    expect(officialCatalogImageUrl('https://user:token@cdn.shopify.com/a.jpg')).toBe('');
    expect(officialCatalogImageUrl(`${image}#fragment`)).toBe(`${image}#fragment`);
  });

  it('pages a loaded search, filters by the data on that page, and opens one product directly', () => {
    const groups = ['Polo', 'Crew Neck', 'Hoodies', 'Jackets', 'Caps'];
    const items = Array.from({ length: 19 }, (_, index) => ({
      id: `item-${index}`,
      name: `Loaded ${index}`,
      sellingPriceInr: 400 + index,
      subcategory: groups[index % groups.length],
      category: 'Apparel',
      description: index === 0 ? 'Organized storage.' : '',
      moq: index === 0 ? 2 : 1,
      primaryImageUrl: index === 3 ? '' : `https://cdn.shopify.com/s/files/1/example/${index}.png`,
      variants: Array.from({ length: index === 1 ? 5 : 1 }, (__, colorIndex) => ({
        color: ['Blue', 'Red', 'Green', 'Black', 'White'][colorIndex],
        size: 'M',
        stock: index === 2 ? 0 : 4,
        sellingPriceInr: 900,
      })),
    }));
    const session = catalogCardSession({
      items,
      pagination: { page: 1, limit: 25, total: 19, totalPages: 1 },
    });
    expect(session.mode).toBe('grid');
    expect(session.views).toHaveLength(19);
    expect(session.views[0]).toMatchObject({
      priceLabel: '₹400',
      availabilityLabel: 'In stock',
      information: 'Organized storage.',
      moqLabel: 'Minimum order 2',
    });
    expect(JSON.stringify(session.views[0])).not.toContain('900');
    expect(session.views[2].availabilityLabel).toBe('Out of stock');
    expect(session.views[3].imageUrl).toBe('');
    expect(catalogColorPreview(session.views[1].colors)).toEqual({
      shown: ['Blue', 'Red', 'Green'],
      more: 2,
    });
    const filters = catalogBrowseFilters(session.views);
    expect(filters.field).toBe('subcategory');
    expect(filters.options.map((option) => option.label)).toEqual(['All', 'Caps', 'Crew Neck', 'Hoodies', 'Jackets', 'Polo']);
    expect(filters.options.find((option) => option.label === 'Polo').count).toBe(4);
    expect(catalogPageNote(10, { total: 40 })).toContain('not all 40');
    expect(catalogPageNote(19, session.pagination)).toBe('');
    expect(catalogCardSession({ id: 'only-1', name: 'Only Bottle', sellingPriceInr: 500 }).mode).toBe('detail');
    expect(catalogCardSession({ items: [] }).views).toEqual([]);
    expect(CATALOG_GRID_PAGE).toBe(6);
    const visible = session.views.slice(0, CATALOG_GRID_PAGE);
    expect(visible).toHaveLength(6);
    expect(session.views.slice(0, CATALOG_GRID_PAGE * 2)).toHaveLength(12);
    expect(session.views.slice(0, CATALOG_GRID_PAGE * 4)).toHaveLength(19);
  });
});
