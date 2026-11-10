import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { Category } from '../src/modules/catalog/category.model.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { authHeader, makeTenant, makeUser } from './helpers.js';

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
      });
      expect(item.images).toEqual([
        PUBLIC_IMAGE,
        'https://cdn.example/mug-side-wave1.jpg',
      ]);
      expect(item.variants).toEqual([
        expect.objectContaining({ sku: 'MUG-DETAIL-WHT', sellingPriceInr: 118, stock: 4 }),
        expect.objectContaining({ sku: 'MUG-DETAIL-LUX', sellingPriceInr: 236, stock: 2 }),
      ]);
      expectRedacted(result);
      expect(result.content[0].text).toContain('ShelfMerch catalog');
      expect(result.content[0].text).toContain(PUBLIC_IMAGE);
      expect(result.content[0].text).toContain('inspiration');
      expect(result.content[0].text).toContain('https://cdn.example/mug-side-wave1.jpg');
      const links = result.content.filter((block) => block.type === 'resource_link');
      expect(links.map((block) => block.uri)).toEqual([
        PUBLIC_IMAGE,
        'https://cdn.example/mug-side-wave1.jpg',
      ]);
      expect(links[0].description).toContain('Do not replace');
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
});
