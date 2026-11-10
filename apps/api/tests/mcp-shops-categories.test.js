import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { McpWriteConfirmation } from '../src/modules/mcp/mcpWriteConfirmation.model.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { authHeader, makeTenant, makeUser } from './helpers.js';
import {
  executeShopCategoriesUpdate,
  getShopCategories,
  prepareShopCategoriesUpdate,
} from '../src/modules/mcp/shopsCategoriesWrite.js';
import { prepareShopPublish } from '../src/modules/mcp/shopsPublishWrite.js';

let app;
let tenant;
let admin;
let shop;
let otherShop;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  clearTenantLimitCache();
  tenant = await makeTenant({ slug: 'shops-categories' });
  admin = await makeUser(tenant, 'company_admin', 'tenant');
  shop = await Shop.create({
    tenantId: tenant._id,
    name: 'MCP QA Store Updated',
    slug: `mcp-cat-${Date.now()}`,
    status: 'draft',
    currencyMode: 'points',
    categories: [],
    logoUrl: 'https://cdn.test/logo.png',
    activeListingKeys: ['col1:prod1'],
  });
  otherShop = await Shop.create({
    tenantId: tenant._id,
    name: 'Other Draft Store',
    slug: `other-cat-${Date.now()}`,
    status: 'draft',
    currencyMode: 'points',
    categories: ['Luxury'],
    activeListingKeys: ['keep:listing'],
  });
});

describe('store category MCP service', () => {
  it('reads available and selected categories', async () => {
    const empty = await getShopCategories({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id) },
    });
    expect(empty).toMatchObject({
      shopId: String(shop._id),
      selectedCategories: [],
      publishReady: false,
    });
    expect(empty.availableCategories.map((row) => row.label)).toEqual(
      expect.arrayContaining(['Merch', 'Work Essentials', 'Luxury', 'Food & Beverages']),
    );

    shop.categories = ['Merch'];
    await shop.save();
    const selected = await getShopCategories({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'MCP QA Store Updated' },
    });
    expect(selected.selectedCategories).toEqual(['Merch']);
    expect(selected.publishReady).toBe(true);
  });

  it('adds categories to a draft store and unlocks publish prepare', async () => {
    await expect(prepareShopPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id) },
    })).rejects.toMatchObject({ code: 'SHOP_NO_CATEGORIES' });

    const prepared = await prepareShopCategoriesUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id), categories: ['merch', 'Work Essentials'] },
    });
    expect(prepared.preview).toMatchObject({
      from: [],
      to: ['Merch', 'Work Essentials'],
      publishReadyAfter: true,
    });
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).categories).toEqual([]);

    const saved = await executeShopCategoriesUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id), categories: ['merch', 'Work Essentials'] },
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'shop-cats-1',
    });
    expect(saved).toMatchObject({
      id: String(shop._id),
      categories: ['Merch', 'Work Essentials'],
      publishReady: true,
    });

    const stored = await Shop.findOne({ _id: shop._id, tenantId: tenant._id });
    expect(stored.categories).toEqual(['Merch', 'Work Essentials']);
    expect(stored.currencyMode).toBe('points');
    expect(stored.logoUrl).toBe('https://cdn.test/logo.png');
    expect(stored.activeListingKeys).toEqual(['col1:prod1']);
    expect(stored.name).toBe('MCP QA Store Updated');
    expect((await Shop.findOne({ _id: otherShop._id, tenantId: tenant._id })).categories).toEqual(['Luxury']);

    const publishPreview = await prepareShopPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id) },
    });
    expect(publishPreview.preview).toMatchObject({
      action: 'publish',
      status: 'draft',
      categories: ['Merch', 'Work Essentials'],
      missingRequirements: [],
    });

    const replay = await executeShopCategoriesUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id), categories: ['merch', 'Work Essentials'] },
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'shop-cats-1',
    });
    expect(replay.categories).toEqual(['Merch', 'Work Essentials']);
  });

  it('replaces selected categories without touching unrelated stores', async () => {
    shop.categories = ['Merch'];
    await shop.save();
    const prepared = await prepareShopCategoriesUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'MCP QA Store Updated', categories: ['Luxury'] },
    });
    expect(prepared.preview.from).toEqual(['Merch']);
    expect(prepared.preview.to).toEqual(['Luxury']);
    const saved = await executeShopCategoriesUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'MCP QA Store Updated', categories: ['Luxury'] },
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'shop-cats-replace',
    });
    expect(saved.categories).toEqual(['Luxury']);
    expect((await Shop.findOne({ _id: otherShop._id, tenantId: tenant._id })).categories).toEqual(['Luxury']);
  });

  it('accepts custom labels and rejects empty or duplicate normalized labels', async () => {
    const prepared = await prepareShopCategoriesUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: {
        shopId: String(shop._id),
        categories: ['  Welcome Kit  ', 'merch', 'Work   Essentials'],
      },
    });
    expect(prepared.preview.to).toEqual(['Welcome Kit', 'Merch', 'Work Essentials']);

    const saved = await executeShopCategoriesUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: {
        shopId: String(shop._id),
        categories: ['  Welcome Kit  ', 'merch', 'Work   Essentials'],
      },
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'shop-cats-custom',
    });
    expect(saved.categories).toEqual(['Welcome Kit', 'Merch', 'Work Essentials']);
    expect(saved.publishReady).toBe(true);

    await expect(prepareShopCategoriesUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id), categories: ['Merch', 'merch'] },
    })).rejects.toMatchObject({ code: 'CATEGORY_DUPLICATE' });

    await expect(prepareShopCategoriesUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id), categories: ['   '] },
    })).rejects.toMatchObject({ code: 'VALIDATION' });

    await expect(prepareShopCategoriesUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id), categories: [] },
    })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('rejects expired and stale confirmations', async () => {
    const prepared = await prepareShopCategoriesUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id), categories: ['Merch'] },
    });
    await McpWriteConfirmation.updateOne(
      { confirmationId: prepared.confirmationId, tenantId: tenant._id },
      { $set: { expiresAt: new Date(0) } },
    );
    await expect(executeShopCategoriesUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id), categories: ['Merch'] },
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'shop-cats-expired',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_EXPIRED' });

    const fresh = await prepareShopCategoriesUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id), categories: ['Merch'] },
    });
    shop.name = 'Renamed After Prepare';
    await shop.save();
    await expect(executeShopCategoriesUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id), categories: ['Merch'] },
      confirmationId: fresh.confirmationId,
      idempotencyKey: 'shop-cats-stale',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).categories).toEqual([]);
  });

  it('rejects unauthorized roles and cross-tenant access', async () => {
    const manager = await makeUser(tenant, 'entity_manager', 'entity', { assignedEntityIds: [] });
    await expect(getShopCategories({
      tenantId: tenant._id,
      actorUserId: manager.user._id,
      input: { shopId: String(shop._id) },
    })).rejects.toMatchObject({ status: 403 });
    await expect(prepareShopCategoriesUpdate({
      tenantId: tenant._id,
      actorUserId: manager.user._id,
      input: { shopId: String(shop._id), categories: ['Merch'] },
    })).rejects.toMatchObject({ status: 403 });

    const other = await makeTenant({ slug: 'shops-categories-other' });
    const outsider = await makeUser(other, 'company_admin', 'tenant');
    await expect(prepareShopCategoriesUpdate({
      tenantId: other._id,
      actorUserId: outsider.user._id,
      input: { shopId: String(shop._id), categories: ['Merch'] },
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('dashboard category compatibility', () => {
  it('keeps REST shop update categories compatible with MCP labels', async () => {
    const password = 'correct-horse';
    const email = `dash-cat-${tenant.slug}@test.io`;
    admin = await makeUser(tenant, 'company_admin', 'tenant', { email, password });
    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(login.status).toBe(200);
    const token = login.body.accessToken;

    const updated = await request(app)
      .patch(`/api/v1/shops/${shop._id}`)
      .set(authHeader(token))
      .send({ categories: ['Merch', 'Team Events'] });
    expect(updated.status).toBe(200);
    expect(updated.body.categories).toEqual(['Merch', 'Team Events']);

    const viewed = await getShopCategories({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id) },
    });
    expect(viewed.selectedCategories).toEqual(['Merch', 'Team Events']);
    expect(viewed.publishReady).toBe(true);
  });
});