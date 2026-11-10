import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser, authHeader } from './helpers.js';
import { createApp } from '../src/app.js';
import { prepareMcpWrite } from '../src/modules/mcp/mcpWriteSafety.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { prepareShopCreate, executeShopCreate } from '../src/modules/mcp/shopsWrite.js';
let app;
beforeAll(async () => { await connectTestDb(); app = createApp(); });
afterAll(disconnectTestDb);
beforeEach(clearTestDb);
describe('dashboard / MCP creation status evidence', () => {
  it.each(['points', 'inr'])('compares %s API responses and persisted records', async (currencyMode) => {
    const tenant = await makeTenant();
    const admin = await makeUser(tenant, 'company_admin');
    const settings = { currencyMode, categories: ['Merch'], logoUrl: 'https://example.com/logo.png', bannerConfig: { theme: 'dark', preset: 'solid-pattern' } };
    const created = await request(app).post('/api/v1/shops').set(authHeader(admin.token)).send({ ...settings, name: 'Dashboard Store' });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('draft');
    expect((await Shop.findOne({ _id: created.body._id, tenantId: tenant._id })).status).toBe('draft');
    const published = await request(app).post(`/api/v1/shops/${created.body._id}/publish`).set(authHeader(admin.token)).send({});
    expect(published.status).toBe(200);
    expect(published.body.status).toBe('live');
    expect((await Shop.findOne({ _id: created.body._id, tenantId: tenant._id })).status).toBe('live');
    const input = { ...settings, name: 'MCP Store' };
    const preview = await prepareShopCreate({ tenantId: tenant._id, actorUserId: admin.user._id, input });
    expect(preview.preview.status).toBe('live');
    expect(await Shop.countDocuments({ tenantId: tenant._id })).toBe(1);
    const mcp = await executeShopCreate({ tenantId: tenant._id, actorUserId: admin.user._id, input, confirmationId: preview.confirmationId, idempotencyKey: 'parity-create-key' });
    expect(mcp.status).toBe('live');
    expect((await Shop.findOne({ _id: mcp.id, tenantId: tenant._id })).status).toBe('live');
    expect(mcp.status).toBe(published.body.status);
    for (const [key, value] of Object.entries(settings)) expect(mcp[key]).toEqual(value);
    expect(await Shop.countDocuments({ tenantId: tenant._id })).toBe(2);
  });
  it('rejects empty categories without changing the dashboard publishing rule', async () => {
    const tenant = await makeTenant();
    const admin = await makeUser(tenant, 'company_admin');
    const created = await request(app).post('/api/v1/shops').set(authHeader(admin.token)).send({ name: 'Empty', categories: [] });
    const published = await request(app).post(`/api/v1/shops/${created.body._id}/publish`).set(authHeader(admin.token)).send({});
    expect(published.status).toBe(422);
    await expect(prepareShopCreate({ tenantId: tenant._id, actorUserId: admin.user._id, input: { name: 'Empty Copilot', categories: [] } })).rejects.toMatchObject({ code: 'SHOP_NO_CATEGORIES' });
    expect(await Shop.countDocuments({ tenantId: tenant._id })).toBe(1);
    expect((await Shop.findOne({ _id: created.body._id, tenantId: tenant._id })).status).toBe('draft');
  });

  it.each(['draft', 'live'])('leaves an existing %s store untouched', async (status) => {
    const tenant = await makeTenant();
    const admin = await makeUser(tenant, 'company_admin');
    const shop = await Shop.create({ tenantId: tenant._id, name: 'Existing', slug: 'existing', status, categories: ['Original'], logoUrl: '/uploads/original.png' });
    const before = shop.toObject();
    await expect(prepareShopCreate({ tenantId: tenant._id, actorUserId: admin.user._id, input: { name: 'Existing', categories: ['Replacement'] } })).rejects.toMatchObject({ code: 'SHOP_EXISTS' });
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).toObject()).toEqual(before);
  });

  it('rejects a legacy draft-only confirmation before writing', async () => {
    const tenant = await makeTenant();
    const admin = await makeUser(tenant, 'company_admin');
    const input = { name: 'Legacy', slug: 'legacy', currencyMode: 'points', pointsConversionEnabled: false, companyEmailDomain: '', categories: ['Merch'], logoUrl: '', bannerConfig: { theme: 'dark', preset: 'solid-pattern' } };
    const legacy = await prepareMcpWrite({ tenantId: tenant._id, actorUserId: admin.user._id, operation: 'shops.create', payload: input, resourceState: async () => ({ name: 'legacy', exists: false }) });
    await expect(executeShopCreate({ tenantId: tenant._id, actorUserId: admin.user._id, input, confirmationId: legacy.confirmationId, idempotencyKey: 'legacy-no-publish' })).rejects.toMatchObject({ code: 'CONFIRMATION_MISMATCH' });
    expect(await Shop.countDocuments({ tenantId: tenant._id })).toBe(0);
  });

});
