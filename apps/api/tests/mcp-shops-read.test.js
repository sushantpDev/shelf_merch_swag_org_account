import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { makeTenant, makeUser } from './helpers.js';
import { getShop, listShops } from '../src/modules/mcp/shopsRead.js';
import {
  executeShopCreate,
  prepareShopCreate,
} from '../src/modules/mcp/shopsWrite.js';
import { DEFAULT_STORE_BUILDER_CATEGORIES } from '../src/modules/shops/storeBuilderCategories.js';

let app;
let tenant;
let admin;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  clearTenantLimitCache();
  tenant = await makeTenant({ slug: 'shops-read' });
  admin = await makeUser(tenant, 'company_admin', 'tenant');
});

describe('shops_list / shops_get', () => {
  it('lists stores and resolves by exact name', async () => {
    const draft = await Shop.create({
      tenantId: tenant._id,
      name: 'Alpha Store',
      slug: 'alpha-store',
      status: 'draft',
      categories: ['Merch'],
      activeListingKeys: ['a:b'],
    });
    await Shop.create({
      tenantId: tenant._id,
      name: 'Beta Live',
      slug: 'beta-live',
      status: 'live',
      categories: [],
    });

    const listed = await listShops({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: {},
    });
    expect(listed.shops).toHaveLength(2);
    expect(listed.shops.find((row) => row.id === String(draft._id))).toMatchObject({
      name: 'Alpha Store',
      status: 'draft',
      publishReady: true,
      activeProductCount: 1,
      hasLogo: false,
      hasBanner: false,
      logoUrl: '',
    });

    const liveOnly = await listShops({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { status: 'live' },
    });
    expect(liveOnly.shops).toHaveLength(1);
    expect(liveOnly.shops[0].name).toBe('Beta Live');
    expect(liveOnly.shops[0].publishReady).toBe(false);

    const byName = await getShop({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Alpha Store' },
    });
    expect(byName).toMatchObject({ id: String(draft._id), name: 'Alpha Store', publishReady: true });
  });

  it('rejects ambiguous names and missing selectors', async () => {
    await Shop.create({
      tenantId: tenant._id,
      name: 'Twin',
      slug: 'twin-a',
      status: 'draft',
      categories: ['Merch'],
    });
    await Shop.create({
      tenantId: tenant._id,
      name: 'Twin',
      slug: 'twin-b',
      status: 'draft',
      categories: ['Merch'],
    });
    await expect(getShop({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Twin' },
    })).rejects.toMatchObject({ code: 'SHOP_AMBIGUOUS' });
    await expect(getShop({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: {},
    })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('applies dashboard default categories when create omits categories', async () => {
    const input = { name: 'Default Cats Store', currencyMode: 'points' };
    const prepared = await prepareShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
    });
    expect(prepared.preview.categories).toEqual([...DEFAULT_STORE_BUILDER_CATEGORIES]);
    const created = await executeShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'default-cats-1',
    });
    expect(created.categories).toEqual([...DEFAULT_STORE_BUILDER_CATEGORIES]);
    const shop = await Shop.findOne({ _id: created.id, tenantId: tenant._id });
    expect(shop.categories).toEqual([...DEFAULT_STORE_BUILDER_CATEGORIES]);
  });
});