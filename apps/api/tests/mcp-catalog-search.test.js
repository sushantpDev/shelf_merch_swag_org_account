import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { shopSignOptions } from '../src/config/jwt.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { signRedemptionSession } from '../src/modules/redemptions/redemptions.service.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { catalogClientShowsProductCard, catalogSearchMongoFilter } from '../src/modules/mcp/catalogSearch.js';
import { evaluateMcpBoundary } from '../src/modules/mcp/mcpBoundary.js';
import { authHeader, makeTenant, makeUser } from './helpers.js';

const PROTOCOL = '2026-07-28';

let app;

function mcpRequest(token, method, params = {}, extraHeaders = {}, meta = {}) {
  const req = request(app)
    .post('/mcp')
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .set('MCP-Protocol-Version', PROTOCOL)
    .set('Mcp-Method', method);
  if (typeof params.name === 'string') req.set('Mcp-Name', params.name);
  if (token) req.set(authHeader(token));
  for (const [key, value] of Object.entries(extraHeaders)) req.set(key, value);
  return req.send({
    jsonrpc: '2.0',
    id: 1,
    method,
    params: {
      ...params,
      _meta: {
        'io.modelcontextprotocol/protocolVersion': PROTOCOL,
        'io.modelcontextprotocol/clientCapabilities': {},
        ...meta,
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

async function callCatalog(token, args = {}) {
  const res = await mcpRequest(token, 'tools/call', { name: 'catalog_search', arguments: args });
  expect(res.status, JSON.stringify(res.body ?? res.text).slice(0, 800)).toBe(200);
  const body = rpcBody(res);
  return body.result;
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

async function seedCatalog() {
  await CatalogProduct.create([
    {
      sku: 'MUG-1',
      name: 'Ceramic Mug',
      brand: 'Shelf',
      category: 'Drinkware',
      basePriceInr: 118,
      gstRate: 18,
      costPriceInr: 40,
      supplierName: 'Secret Mill',
      status: 'active',
      source: { provider: 'manual' },
      variants: [
        { sku: 'MUG-1-WHT', color: 'White', size: 'OS', stock: 4, enabled: true },
        { sku: 'MUG-1-LUX', color: 'Gold', size: 'OS', priceOverrideInr: 900, stock: 1, enabled: true },
        { sku: 'MUG-1-CHEAP', color: 'Blue', size: 'OS', priceOverrideInr: 50, stock: 3, enabled: true },
        { sku: 'MUG-1-OLD', color: 'Grey', size: 'OS', stock: 1, enabled: false },
      ],
    },
    {
      sku: 'TEE-1',
      name: 'axb',
      category: 'Apparel',
      basePriceInr: 105,
      gstRate: 5,
      status: 'active',
      source: { provider: 'manual' },
    },
    {
      sku: 'A.B-1',
      name: 'Safe Bottle',
      category: 'Drinkware',
      basePriceInr: 250,
      status: 'active',
      source: { provider: 'shopify' },
    },
    {
      sku: 'CAP-1',
      name: 'Cap',
      category: 'Apparel',
      basePriceInr: 800,
      status: 'active',
      source: { provider: 'manual' },
      variants: [
        { sku: 'CAP-1-M', color: 'Navy', size: 'M', priceOverrideInr: 115, stock: 2, enabled: true },
        { sku: 'CAP-1-S', color: 'Navy', size: 'S', priceOverrideInr: 50, stock: 9, enabled: false },
      ],
    },
    {
      sku: 'HID-1',
      name: 'Hidden Cap',
      category: 'Apparel',
      basePriceInr: 900,
      status: 'active',
      variants: [{ sku: 'HID-1-S', size: 'S', priceOverrideInr: 115, enabled: false }],
    },
    {
      sku: 'SEED-1',
      name: 'Seed Tee',
      category: 'Drinkware',
      basePriceInr: 118,
      status: 'active',
      source: { provider: 'seed' },
    },
    {
      sku: 'DRF-1',
      name: 'Draft Mug',
      category: 'Drinkware',
      basePriceInr: 118,
      status: 'draft',
      source: { provider: 'manual' },
    },
    {
      sku: 'KIT-1',
      name: 'Kit Shell',
      category: 'Drinkware',
      basePriceInr: 118,
      status: 'active',
      source: { provider: 'manual', kindOverride: 'kit' },
    },
    {
      sku: 'OTH-1',
      name: 'Other Source',
      category: 'Drinkware',
      basePriceInr: 118,
      status: 'active',
      source: { provider: 'import' },
    },
    {
      sku: 'PEN-1',
      name: 'Gold Pen',
      category: 'Office Supplies',
      basePriceInr: 2500,
      status: 'active',
      source: { provider: 'manual' },
    },
  ]);
}

describe('catalog_search filter', () => {
  it('escapes regex metacharacters before they reach Mongo', () => {
    const filter = catalogSearchMongoFilter({ query: 'a.b' });
    const search = filter.$and.find((clause) => clause.$or?.some((part) => part.sku));
    expect(search.$or[0].name.$regex).toBe('a\\.b');
    expect(search.$or[1].sku.$regex).toBe('a\\.b');
  });
});

describe('POST /mcp catalog_search', () => {
  it('rejects a missing bearer token and does not serve the SPA', async () => {
    const res = await request(app).post('/mcp').send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.error.code).toBe('UNAUTHORIZED');

    const getRes = await request(app).get('/mcp');
    expect(getRes.status).toBe(401);
    expect(getRes.headers['content-type']).toMatch(/json/);
  });

  it('returns 400 for malformed JSON and 401 for a valid initialize with no token', async () => {
    const bad = await request(app)
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send('{not json');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_JSON');
    expect(JSON.stringify(bad.body)).not.toMatch(/position|column|stack/i);

    const missing = await request(app)
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'local-test', version: '1.0' },
        },
      });
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe('UNAUTHORIZED');
    expect(missing.body.error.message).toMatch(/token/i);
  });

  it('runs initialize, tools/list, and a GST-inclusive catalog_search', async () => {
    await seedCatalog();
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin', 'tenant');
    const headers = {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      ...authHeader(token),
    };
    const init = await request(app).post('/mcp').set(headers).send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'inspector-test', version: '1.0' },
      },
    });
    expect(init.status).toBe(200);
    const initBody = rpcBody(init);
    expect(initBody.result.serverInfo.name).toBe('shelfmerch');
    expect(initBody.result.capabilities.tools).toBeTruthy();

    const listed = await request(app).post('/mcp').set(headers).send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });
    expect(listed.status).toBe(200);
    expect(rpcBody(listed).result.tools.map((tool) => tool.name)).toContain('catalog_search');

    const called = await request(app).post('/mcp').set(headers).send({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'catalog_search',
        arguments: { maxSellingPriceInr: 2000, page: 1, limit: 10 },
      },
    });
    expect(called.status).toBe(200);
    const result = rpcBody(called).result;
    expect(result.isError).not.toBe(true);
    const payload = JSON.stringify(result);
    expect(payload).not.toContain('costPriceInr');
    expect(payload).not.toContain('supplierName');
    expect(payload).not.toContain('margin');
    const skus = result.structuredContent.items.map((item) => item.sku);
    expect(skus).toContain('MUG-1');
    expect(skus).not.toContain('PEN-1');
    for (const item of result.structuredContent.items) {
      expect(item.sellingPriceInr).toBeLessThanOrEqual(2000);
      for (const variant of item.variants) {
        expect(variant.sellingPriceInr).toBeLessThanOrEqual(2000);
      }
    }
  });

  it('rejects redemption and shop tokens that share the access secret', async () => {
    const tenant = await makeTenant();
    const redemption = signRedemptionSession({ _id: tenant._id, tenantId: tenant._id });
    const shop = jwt.sign(
      { sub: 'shop-user', tenantId: String(tenant._id) },
      env.JWT_ACCESS_SECRET,
      shopSignOptions({ expiresIn: '5m' }),
    );
    for (const token of [redemption, shop]) {
      const res = await mcpRequest(token, 'tools/list');
      expect(res.status).toBe(401);
    }
  });

  it('allows catalog-read roles and refuses other roles', async () => {
    await seedCatalog();
    const tenant = await makeTenant();
    const admin = await makeUser(tenant, 'company_admin', 'tenant');
    const manager = await makeUser(tenant, 'entity_manager', 'tenant');
    const finance = await makeUser(tenant, 'company_finance_user', 'tenant');
    const recipient = await makeUser(tenant, 'recipient', 'tenant');
    const catalogAdmin = await makeUser(null, 'platform_catalog_admin', 'platform');
    const superAdmin = await makeUser(null, 'platform_super_admin', 'platform');

    for (const token of [admin.token, manager.token, superAdmin.token]) {
      const listed = rpcBody(await mcpRequest(token, 'tools/list'));
      expect(listed.result.tools.map((tool) => tool.name)).toContain('catalog_search');
      const tool = listed.result.tools.find((entry) => entry.name === 'catalog_search');
      expect(tool.description).toContain('primaryImageUrl');
      expect(tool.description).toContain('do not repeat the product list');
      expect(tool.description).toContain('web search');
      expect(tool.description).toContain('inspiration');
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.annotations.destructiveHint).toBe(false);
      expect(tool.annotations.openWorldHint).toBe(false);
    }

    for (const token of [finance.token, recipient.token, catalogAdmin.token]) {
      const res = await mcpRequest(token, 'tools/list');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('returns GST-inclusive prices, enabled variants, and no cost data', async () => {
    await seedCatalog();
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin', 'tenant');

    const result = await callCatalog(token, {
      minSellingPriceInr: 110,
      maxSellingPriceInr: 120,
    });
    const skus = result.structuredContent.items.map((item) => item.sku).sort();
    expect(skus).toEqual(['MUG-1', 'SEED-1']);

    const mug = result.structuredContent.items.find((item) => item.sku === 'MUG-1');
    expect(mug.sellingPriceInr).toBe(118);
    expect(mug.gstRate).toBe(18);
    expect(mug.variants.map((variant) => variant.sku).sort()).toEqual(['MUG-1-CHEAP', 'MUG-1-LUX', 'MUG-1-WHT']);
    expect(mug.variants.map((variant) => variant.sellingPriceInr)).toEqual([118, 118, 118]);

    const payload = JSON.stringify(result);
    expect(payload).not.toContain('costPriceInr');
    expect(payload).not.toContain('supplierName');
    expect(payload).not.toContain('Secret Mill');
    expect(payload).not.toContain('marginInr');
    expect(payload).not.toContain('MUG-1-OLD');
    expect(payload).not.toContain('CAP-1');
    for (const item of result.structuredContent.items) {
      expect(item.sellingPriceInr).toBeGreaterThanOrEqual(110);
      expect(item.sellingPriceInr).toBeLessThanOrEqual(120);
      for (const variant of item.variants) {
        expect(variant.sellingPriceInr).toBeGreaterThanOrEqual(110);
        expect(variant.sellingPriceInr).toBeLessThanOrEqual(120);
      }
    }
    expect(payload).not.toContain('CAP-1-S');
    expect(result.content[0].text).toContain('GST-inclusive');
    expect(result.content[0].text).toContain('ShelfMerch catalog');
    expect(result.content[0].text).toContain('do not replace');
    expect(result.content[0].text).toContain('inspiration');
    expect(result.isError).not.toBe(true);
  });

  it('returns the stored catalog image and keeps external ideas out of inventory', async () => {
    const image = 'https://cdn.shopify.com/s/files/1/example/Blue_Travel_Laptop_Backpack.jpg?v=1';
    const backpack = await CatalogProduct.create({
      sku: 'BAG-1',
      name: 'Blue Travel Laptop Backpack',
      category: 'Bags',
      basePriceInr: 1499,
      gstRate: 18,
      status: 'active',
      primaryImageUrl: image,
      source: { provider: 'shopify' },
      variants: [{ sku: 'BAG-1-OS', color: 'Blue', size: 'OS', stock: 6, enabled: true }],
    });
    await CatalogProduct.create({
      sku: 'BAG-2',
      name: 'Plain Tote',
      category: 'Bags',
      basePriceInr: 499,
      status: 'active',
      primaryImageUrl: '',
      source: { provider: 'manual' },
    });
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin', 'tenant');

    const found = await callCatalog(token, { query: 'Blue Travel Laptop Backpack' });
    expect(found.structuredContent.items).toHaveLength(1);
    const item = found.structuredContent.items[0];
    expect(item.id).toBe(String(backpack._id));
    expect(item.name).toBe('Blue Travel Laptop Backpack');
    expect(item.sellingPriceInr).toBe(1499);
    expect(item.primaryImageUrl).toBe(image);
    expect(item.description).toBe('');
    expect(item.variants).toEqual([
      expect.objectContaining({ sku: 'BAG-1-OS', stock: 6, sellingPriceInr: 1499 }),
    ]);
    expect(found.content[0].text).toContain(image);
    expect(found.content[0].text).toContain(`id ${backpack._id}`);
    expect(found.content[0].text).toContain('do not replace');
    expect(found.content[0].text).toContain('inspiration');
    expect(found.content[0].text).not.toContain('Plain Tote');
    expect(found.content).toEqual([{ type: 'text', text: expect.stringContaining(image) }]);

    const plain = await callCatalog(token, { query: 'Plain Tote' });
    expect(plain.structuredContent.items[0].primaryImageUrl).toBe('');
    expect(plain.content[0].text).toContain('Official image: none. Do not substitute an external image.');
    expect(plain.content.some((block) => block.type === 'resource_link')).toBe(false);
  });

  it('charges the catalog selling price for every selected variant', async () => {
    await CatalogProduct.create([
      {
        sku: 'BAG-SHARED',
        name: 'Shared Color Pack',
        category: 'Bags',
        basePriceInr: 700,
        gstRate: 18,
        status: 'active',
        source: { provider: 'shopify' },
        variants: [
          { sku: 'BAG-SHARED-BLU', color: 'Blue', size: 'OS', priceOverrideInr: 800, stock: 3, enabled: true },
          { sku: 'BAG-SHARED-RED', color: 'Red', size: 'OS', priceOverrideInr: 800, stock: 2, enabled: true },
        ],
      },
      {
        sku: 'BAG-SAME',
        name: 'Same Price Pack',
        category: 'Bags',
        basePriceInr: 700,
        gstRate: 18,
        status: 'active',
        source: { provider: 'manual' },
        variants: [
          { sku: 'BAG-SAME-BLU', color: 'Blue', size: 'OS', priceOverrideInr: 700, stock: 1, enabled: true },
          { sku: 'BAG-SAME-RED', color: 'Red', size: 'OS', stock: 1, enabled: true },
        ],
      },
      {
        sku: 'BAG-SPLIT',
        name: 'Split Price Pack',
        category: 'Bags',
        basePriceInr: 700,
        gstRate: 18,
        status: 'active',
        source: { provider: 'manual' },
        variants: [
          { sku: 'BAG-SPLIT-BLU', color: 'Blue', size: 'OS', stock: 4, enabled: true },
          { sku: 'BAG-SPLIT-RED', color: 'Red', size: 'OS', priceOverrideInr: 900, stock: 5, enabled: true },
        ],
      },
    ]);
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin', 'tenant');

    const shared = await callCatalog(token, { query: 'Shared Color Pack' });
    const sharedItem = shared.structuredContent.items[0];
    expect(sharedItem.sellingPriceInr).toBe(700);
    expect(sharedItem.gstRate).toBe(18);
    expect(sharedItem.variants.map((variant) => variant.sellingPriceInr)).toEqual([700, 700]);
    expect(shared.content[0].text).not.toContain('₹800');
    expect(shared.content[0].text).toContain('₹700');
    expect(shared.content[0].text).not.toContain('593');

    const same = await callCatalog(token, { query: 'Same Price Pack' });
    expect(same.structuredContent.items[0].variants.map((variant) => variant.sellingPriceInr)).toEqual([700, 700]);

    const split = await callCatalog(token, { query: 'Split Price Pack' });
    const splitItem = split.structuredContent.items[0];
    expect(splitItem.sellingPriceInr).toBe(700);
    expect(splitItem.variants).toEqual([
      expect.objectContaining({ sku: 'BAG-SPLIT-BLU', color: 'Blue', sellingPriceInr: 700, stock: 4 }),
      expect.objectContaining({ sku: 'BAG-SPLIT-RED', color: 'Red', sellingPriceInr: 700, stock: 5 }),
    ]);
    const detail = rpcBody(await mcpRequest(token, 'tools/call', {
      name: 'catalog_get_product',
      arguments: { productId: splitItem.id },
    })).result;
    expect(detail.structuredContent.sellingPriceInr).toBe(700);
    expect(detail.structuredContent.gstRate).toBe(18);
    expect(detail.structuredContent.variants.map((variant) => [variant.color, variant.sellingPriceInr])).toEqual([
      ['Blue', 700],
      ['Red', 700],
    ]);
    expect(detail.content[0].text).toContain('incl. GST');
    expect(detail.content[0].text).toContain('₹700');
    expect(detail.content[0].text).not.toContain('₹900');
    expect(detail.content[0].text).not.toContain('₹593');
  });

  it('summarizes for a UI host and keeps the official image for other clients', async () => {
    const image = 'https://cdn.shopify.com/s/files/1/example/Blue_Travel_Laptop_Backpack.jpg?v=1';
    await CatalogProduct.create([
      {
        sku: 'BAG-UI',
        name: 'Blue Travel Laptop Backpack',
        category: 'Bags',
        basePriceInr: 700,
        gstRate: 18,
        description: 'Organized storage.',
        status: 'active',
        primaryImageUrl: image,
        source: { provider: 'shopify' },
        variants: [
          { sku: 'BAG-UI-BLU', color: 'Blue', size: 'OS', priceOverrideInr: 800, stock: 3, enabled: true },
          { sku: 'BAG-UI-RED', color: 'Red', size: 'OS', priceOverrideInr: 800, stock: 2, enabled: true },
        ],
      },
      {
        sku: 'MUG-UI',
        name: 'Desk Mug',
        category: 'Drinkware',
        basePriceInr: 118,
        status: 'active',
        primaryImageUrl: 'https://cdn.shopify.com/s/files/1/example/mug.jpg',
        source: { provider: 'manual' },
        variants: [{ sku: 'MUG-UI-WHT', color: 'White', size: 'OS', stock: 4, enabled: true }],
      },
    ]);
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin', 'tenant');
    const uiMeta = {
      'io.modelcontextprotocol/clientCapabilities': {
        extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } },
      },
    };

    const search = rpcBody(await mcpRequest(token, 'tools/call', {
      name: 'catalog_search',
      arguments: { query: 'Blue Travel' },
    }, {}, uiMeta)).result;
    expect(search.content).toEqual([{ type: 'text', text: expect.any(String) }]);
    expect(search.content[0].text).toContain('only product presentation');
    expect(search.content[0].text).not.toContain(image);
    expect(search.content[0].text).not.toContain('BAG-UI-BLU');
    expect(search.content[0].text).not.toContain('variants:');
    expect(search.structuredContent.items[0].primaryImageUrl).toBe(image);
    expect(search.structuredContent.items[0].sellingPriceInr).toBe(700);
    expect(search.structuredContent.items[0].variants.map((variant) => variant.sellingPriceInr)).toEqual([700, 700]);

    const listed = rpcBody(await mcpRequest(token, 'tools/call', {
      name: 'catalog_search',
      arguments: { category: 'Bags', limit: 25 },
    }, {}, uiMeta)).result;
    expect(listed.content[0].text).toContain('products loaded');
    expect(listed.content[0].text).not.toContain('https://');
    expect(listed.content[0].text).not.toContain('Desk Mug');
    expect(listed.structuredContent.items.map((item) => item.primaryImageUrl)).toEqual(expect.arrayContaining([image]));

    const productId = search.structuredContent.items[0].id;
    const detail = rpcBody(await mcpRequest(token, 'tools/call', {
      name: 'catalog_get_product',
      arguments: { productId },
    }, {}, uiMeta)).result;
    expect(detail.content).toEqual([{ type: 'text', text: expect.any(String) }]);
    expect(detail.content[0].text).toContain('only product presentation');
    expect(detail.content[0].text).not.toContain(image);
    expect(detail.content[0].text).not.toContain('BAG-UI');
    expect(detail.content[0].text).not.toContain('₹800');
    expect(detail.structuredContent.primaryImageUrl).toBe(image);
    expect(detail.structuredContent.sellingPriceInr).toBe(700);
    expect(detail.structuredContent.description).toBe('Organized storage.');

    expect(catalogClientShowsProductCard({
      extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } },
    })).toBe(true);
    expect(catalogClientShowsProductCard(null, { name: 'ChatGPT-User' })).toBe(false);
    expect(catalogClientShowsProductCard({
      extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html'] } },
    })).toBe(false);

    const plain = await callCatalog(token, { query: 'Blue Travel Laptop Backpack' });
    expect(plain.content[0].text).toContain(image);
    expect(plain.content[0].text).toContain('incl. GST');
    expect(plain.content.some((block) => block.type === 'image' || block.type === 'resource_link')).toBe(false);
  });

  it('treats a dotted query as literal text', async () => {
    await seedCatalog();
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin', 'tenant');
    const result = await callCatalog(token, { query: 'a.b' });
    expect(result.structuredContent.items.map((item) => item.sku)).toEqual(['A.B-1']);
  });

  it('does not let a regex wildcard match the catalog', async () => {
    await seedCatalog();
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin', 'tenant');
    const result = await callCatalog(token, { query: '.*' });
    expect(result.structuredContent.items).toEqual([]);
  });

  it('applies category aliases on the same result set', async () => {
    await seedCatalog();
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin', 'tenant');
    const result = await callCatalog(token, { category: 'Accessories', minSellingPriceInr: 110, maxSellingPriceInr: 120 });
    expect(result.structuredContent.items.map((item) => item.sku).sort()).toEqual(['MUG-1', 'SEED-1']);
  });

  it('rejects an oversized page and an inverted price range inside the tool result', async () => {
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin', 'tenant');
    const tooWide = await callCatalog(token, { limit: 100 });
    expect(tooWide.isError).toBe(true);
    const inverted = await callCatalog(token, { minSellingPriceInr: 500, maxSellingPriceInr: 100 });
    expect(inverted.isError).toBe(true);
  });

  it('keeps a suspended workspace out even when another tenant id is sent', async () => {
    const active = await makeTenant({ slug: 'active-co', name: 'Active' });
    const suspended = await makeTenant({ slug: 'suspended-co', name: 'Suspended', status: 'suspended' });
    const { token } = await makeUser(suspended, 'company_admin', 'tenant');
    const res = await mcpRequest(token, 'tools/list').set('X-Tenant-Id', String(active._id));
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/suspended/i);
  });

  it('counts tenant calls against the tenant quota and leaves other tenants alone', async () => {
    const noisy = await makeTenant({
      slug: 'noisy-mcp',
      limits: { requestsPerMinute: 1 },
    });
    const calm = await makeTenant({ slug: 'calm-mcp' });
    const noisyUser = await makeUser(noisy, 'company_admin', 'tenant');
    const calmUser = await makeUser(calm, 'company_admin', 'tenant');
    const superAdmin = await makeUser(null, 'platform_super_admin', 'platform');

    const first = await mcpRequest(noisyUser.token, 'tools/list');
    const second = await mcpRequest(noisyUser.token, 'tools/list');
    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe('TENANT_QUOTA_EXCEEDED');

    const other = await mcpRequest(calmUser.token, 'tools/list');
    expect(other.status).toBe(200);
    const platform = await mcpRequest(superAdmin.token, 'tools/list');
    const platformAgain = await mcpRequest(superAdmin.token, 'tools/list');
    expect(platform.status).toBe(200);
    expect(platformAgain.status).toBe(200);
  });

  it('still answers a 2025-style tools/call without the modern envelope', async () => {
    await seedCatalog();
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin', 'tenant');
    const res = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set(authHeader(token))
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'catalog_search', arguments: { query: 'a.b' } },
      });
    expect(res.status).toBe(200);
    const body = rpcBody(res);
    expect(body.result.structuredContent.items.map((item) => item.sku)).toEqual(['A.B-1']);
    expect(JSON.stringify(body.result)).not.toContain('costPriceInr');
  });

  it('paginates without repeating a row', async () => {
    await seedCatalog();
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin', 'tenant');
    const first = await callCatalog(token, { limit: 1, page: 1 });
    const second = await callCatalog(token, { limit: 1, page: 2 });
    expect(first.structuredContent.items).toHaveLength(1);
    expect(second.structuredContent.items).toHaveLength(1);
    expect(first.structuredContent.pagination.limit).toBe(1);
    expect(first.structuredContent.pagination.total).toBeGreaterThan(1);
    expect(first.structuredContent.items[0].sku).not.toBe(second.structuredContent.items[0].sku);
  });

  it('answers repeated calls without a session', async () => {
    await seedCatalog();
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin', 'tenant');
    const totals = [];
    for (let i = 0; i < 5; i += 1) {
      const result = await callCatalog(token, { query: 'Ceramic' });
      totals.push(result.structuredContent.pagination.total);
    }
    expect(totals).toEqual([1, 1, 1, 1, 1]);
  });

  it('keeps concurrent callers isolated', async () => {
    await seedCatalog();
    const tenant = await makeTenant();
    const admin = await makeUser(tenant, 'company_admin', 'tenant');
    const superAdmin = await makeUser(null, 'platform_super_admin', 'platform');
    const finance = await makeUser(tenant, 'company_finance_user', 'tenant');
    const [adminResult, superResult, denied] = await Promise.all([
      callCatalog(admin.token, { query: 'Ceramic' }),
      callCatalog(superAdmin.token, { query: 'Ceramic' }),
      mcpRequest(finance.token, 'tools/list'),
    ]);
    expect(adminResult.structuredContent.items.map((item) => item.sku)).toEqual(['MUG-1']);
    expect(superResult.structuredContent.items.map((item) => item.sku)).toEqual(['MUG-1']);
    expect(denied.status).toBe(403);
    expect(JSON.stringify(adminResult)).not.toContain('costPriceInr');
  });

  it('rejects a bumped session, a suspended user, and a demoted role', async () => {
    const tenant = await makeTenant();
    const expired = await makeUser(tenant, 'company_admin', 'tenant');
    expired.user.sessionVersion = 1;
    await expired.user.save();
    const stale = await mcpRequest(expired.token, 'tools/list');
    expect(stale.status).toBe(401);
    expect(stale.body.error.code).toBe('SESSION_EXPIRED');

    const suspended = await makeUser(tenant, 'company_admin', 'tenant');
    suspended.user.status = 'suspended';
    await suspended.user.save();
    const blocked = await mcpRequest(suspended.token, 'tools/list');
    expect(blocked.status).toBe(401);

    const demoted = await makeUser(tenant, 'company_admin', 'tenant');
    demoted.assignment.role = 'company_finance_user';
    await demoted.assignment.save();
    const forbidden = await mcpRequest(demoted.token, 'tools/list');
    expect(forbidden.status).toBe(403);
  });

  it('rejects a foreign host and origin and does not echo a bearer token', async () => {
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin', 'tenant');
    const host = await request(app)
      .post('/mcp')
      .set('Host', 'evil.example')
      .set(authHeader(token))
      .set('Content-Type', 'application/json')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(host.status).toBe(403);
    expect(host.body.error.code).toBe('FORBIDDEN_HOST');
    expect(JSON.stringify(host.body)).not.toContain('eyJ');

    const origin = await mcpRequest(token, 'tools/list', {}, { Origin: 'https://evil.example' });
    expect(origin.status).toBe(403);
    expect(origin.body.error.code).toBe('FORBIDDEN_ORIGIN');
    expect(JSON.stringify(origin.body)).not.toContain('eyJ');

    const allowed = await mcpRequest(token, 'tools/list', {}, { Origin: 'http://127.0.0.1:8080' });
    expect(allowed.status).toBe(200);
  });

  it('rejects non-POST methods and does not serve HTML for /mcp', async () => {
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin', 'tenant');
    for (const method of ['get', 'delete', 'put', 'patch']) {
      const res = await request(app)[method]('/mcp').set(authHeader(token));
      expect([400, 405]).toContain(res.status);
      expect(String(res.headers['content-type'] || '')).not.toMatch(/html/);
      expect(JSON.stringify(res.body ?? '')).not.toContain('eyJ');
    }
    const missing = await request(app).put('/mcp');
    expect(missing.status).toBe(401);
    expect(missing.headers['content-type']).toMatch(/json/);

    const extra = await request(app).get('/mcp/extra');
    expect(extra.status).toBe(404);
    expect(String(extra.headers['content-type'] || '')).toMatch(/json/);
  });

  it('hides database failures from the tool result', async () => {
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin', 'tenant');
    const chain = {
      select() { return this; },
      sort() { return this; },
      skip() { return this; },
      limit() { return this; },
      lean() { return Promise.reject(new Error('ECONNREFUSED secret plan')); },
    };
    const findSpy = vi.spyOn(CatalogProduct, 'find').mockReturnValue(chain);
    const countSpy = vi.spyOn(CatalogProduct, 'countDocuments').mockRejectedValue(new Error('ECONNREFUSED secret plan'));
    try {
      const result = await callCatalog(token, { query: 'mug' });
      expect(result.isError).toBe(true);
      const payload = JSON.stringify(result);
      expect(payload).toContain('Catalog search failed');
      expect(payload).not.toContain('ECONNREFUSED');
      expect(payload).not.toContain('secret plan');
    } finally {
      findSpy.mockRestore();
      countSpy.mockRestore();
    }
  });

  it('treats parenthesis in a query as literal text', async () => {
    await seedCatalog();
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin', 'tenant');
    const result = await callCatalog(token, { query: '(a' });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent.items).toEqual([]);
  });
});

describe('MCP host boundary', () => {
  it('allows the public host in production and rejects loopback and foreign hosts', () => {
    const urls = ['https://shelfmerch.io', 'https://app.shelfmerch.io'];
    expect(evaluateMcpBoundary({
      hostHeader: 'shelfmerch.io',
      origin: '',
      nodeEnv: 'production',
      urls,
    }).ok).toBe(true);
    expect(evaluateMcpBoundary({
      hostHeader: 'app.shelfmerch.io:443',
      origin: 'https://app.shelfmerch.io',
      nodeEnv: 'production',
      urls,
    }).ok).toBe(true);
    expect(evaluateMcpBoundary({
      hostHeader: 'evil.example',
      origin: '',
      nodeEnv: 'production',
      urls,
    }).code).toBe('FORBIDDEN_HOST');
    expect(evaluateMcpBoundary({
      hostHeader: 'localhost',
      origin: '',
      nodeEnv: 'production',
      urls,
    }).code).toBe('FORBIDDEN_HOST');
    expect(evaluateMcpBoundary({
      hostHeader: 'shelfmerch.io',
      origin: 'https://evil.example',
      nodeEnv: 'production',
      urls,
    }).code).toBe('FORBIDDEN_ORIGIN');
  });

  it('indexes active catalog rows by GST-inclusive price', () => {
    const indexed = CatalogProduct.schema.indexes().some(([fields]) => fields.status === 1 && fields.basePriceInr === 1);
    expect(indexed).toBe(true);
  });
});
