import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import {
  authHeader,
  makeTenant,
  makeUser,
  makeShop,
} from './helpers.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { Collection } from '../src/modules/collections/collection.model.js';
import mongoose from 'mongoose';
import { listingKey } from '../src/modules/shops/listingKeys.js';
import { listOpenAiToolsForRole, registeredToolNames } from '../src/modules/copilot/copilotTools.js';
import { getShop } from '../src/modules/mcp/shopsRead.js';
import { formatAssistantTextForCards } from '../src/modules/copilot/copilotResponseFormat.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';

let app;
const prev = {
  enabled: env.EMBEDDED_COPILOT_ENABLED,
  storeCreate: env.EMBEDDED_COPILOT_WRITE_STORE_CREATE,
  storeUpdate: env.EMBEDDED_COPILOT_WRITE_STORE_UPDATE,
  storePublish: env.EMBEDDED_COPILOT_WRITE_STORE_PUBLISH,
  shopCatalog: env.EMBEDDED_COPILOT_WRITE_SHOP_CATALOG,
  collections: env.EMBEDDED_COPILOT_WRITE_COLLECTIONS,
  key: env.OPENAI_API_KEY,
};

beforeAll(async () => {
  env.EMBEDDED_COPILOT_ENABLED = 'true';
  env.EMBEDDED_COPILOT_WRITE_STORE_CREATE = 'true';
  env.EMBEDDED_COPILOT_WRITE_STORE_UPDATE = 'true';
  env.EMBEDDED_COPILOT_WRITE_STORE_PUBLISH = 'true';
  env.EMBEDDED_COPILOT_WRITE_SHOP_CATALOG = 'true';
  env.EMBEDDED_COPILOT_WRITE_COLLECTIONS = 'false';
  env.OPENAI_API_KEY = '';
  await connectTestDb();
  app = createApp();
});

afterAll(async () => {
  Object.assign(env, {
    EMBEDDED_COPILOT_ENABLED: prev.enabled,
    EMBEDDED_COPILOT_WRITE_STORE_CREATE: prev.storeCreate,
    EMBEDDED_COPILOT_WRITE_STORE_UPDATE: prev.storeUpdate,
    EMBEDDED_COPILOT_WRITE_STORE_PUBLISH: prev.storePublish,
    EMBEDDED_COPILOT_WRITE_SHOP_CATALOG: prev.shopCatalog,
    EMBEDDED_COPILOT_WRITE_COLLECTIONS: prev.collections,
    OPENAI_API_KEY: prev.key,
  });
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  clearTenantLimitCache();
  env.EMBEDDED_COPILOT_ENABLED = 'true';
  env.EMBEDDED_COPILOT_WRITE_SHOP_CATALOG = 'true';
  env.EMBEDDED_COPILOT_WRITE_COLLECTIONS = 'false';
  env.OPENAI_API_KEY = '';
});

async function seedShopWithListing(tenant) {
  const shop = await makeShop(tenant, { name: 'Rewards Store', status: 'draft', currencyMode: 'points' });
  const productId = new mongoose.Types.ObjectId();
  const collection = await Collection.create({
    tenantId: tenant._id,
    name: 'Apparel',
    code: `C${Date.now()}`,
    status: 'ready',
    shopIds: [shop._id],
    productRefs: [{ catalogProductId: productId, name: 'ActiveDry Polo' }],
  });
  const key = listingKey(collection._id, productId);
  return { shop, productId, collection, key };
}

describe('copilot shop catalog + store UX helpers', () => {
  it('exposes prepare catalog to Claude when flag is on and keeps execute gated', () => {
    const model = listOpenAiToolsForRole('company_admin').map((row) => row.function.name);
    expect(model).toContain('shops_prepare_catalog_update');
    expect(model).not.toContain('shops_execute_catalog_update');
    expect(registeredToolNames()).toEqual(expect.arrayContaining([
      'shops_prepare_catalog_update',
      'shops_execute_catalog_update',
    ]));
  });

  it('shops_get returns available listing keys for catalog prepare', async () => {
    const tenant = await makeTenant();
    const admin = await makeUser(tenant, 'company_admin');
    const { shop, key } = await seedShopWithListing(tenant);
    const detail = await getShop({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: String(shop._id) },
    });
    expect(detail.availableListings.some((row) => row.listingKey === key && row.productName === 'ActiveDry Polo')).toBe(true);
    expect(detail.activeListingKeys).toEqual([]);
  });

  it('company admin can prepare/execute catalog show and remount reconcile', async () => {
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin');
    const { shop, key } = await seedShopWithListing(tenant);

    const prepared = await request(app)
      .post('/api/v1/copilot/writes/shops.catalog_update/prepare')
      .set(authHeader(token))
      .send({ shopId: String(shop._id), activeListingKeys: [key], featuredListingKeys: [] });
    expect(prepared.status).toBe(200);
    expect(prepared.body.preview.shown[0].productName).toBe('ActiveDry Polo');

    const first = await request(app)
      .post('/api/v1/copilot/writes/shops.catalog_update/execute')
      .set(authHeader(token))
      .send({
        shopId: String(shop._id),
        activeListingKeys: [key],
        featuredListingKeys: [],
        confirmationId: prepared.body.confirmationId,
        idempotencyKey: 'catalog-show-1',
      });
    expect(first.status).toBe(200);
    expect(first.body.activeListingKeys).toEqual([key]);

    const remount = await request(app)
      .post('/api/v1/copilot/writes/shops.catalog_update/execute')
      .set(authHeader(token))
      .send({
        shopId: String(shop._id),
        activeListingKeys: [key],
        featuredListingKeys: [],
        confirmationId: prepared.body.confirmationId,
        idempotencyKey: 'catalog-show-remount',
      });
    expect(remount.status).toBe(200);
    expect(
      await Shop.countDocuments({ _id: shop._id, tenantId: tenant._id, activeListingKeys: key }),
    ).toBe(1);
  });

  it('denies entity manager catalog prepare/execute', async () => {
    const tenant = await makeTenant();
    const admin = await makeUser(tenant, 'company_admin');
    const manager = await makeUser(tenant, 'entity_manager');
    const { shop, key } = await seedShopWithListing(tenant);

    const denied = await request(app)
      .post('/api/v1/copilot/writes/shops.catalog_update/prepare')
      .set(authHeader(manager.token))
      .send({ shopId: String(shop._id), activeListingKeys: [key], featuredListingKeys: [] });
    expect(denied.status).toBe(403);

    const prepared = await request(app)
      .post('/api/v1/copilot/writes/shops.catalog_update/prepare')
      .set(authHeader(admin.token))
      .send({ shopId: String(shop._id), activeListingKeys: [key], featuredListingKeys: [] });
    const steal = await request(app)
      .post('/api/v1/copilot/writes/shops.catalog_update/execute')
      .set(authHeader(manager.token))
      .send({
        shopId: String(shop._id),
        activeListingKeys: [key],
        featuredListingKeys: [],
        confirmationId: prepared.body.confirmationId,
        idempotencyKey: 'manager-catalog-steal',
      });
    expect([403, 404]).toContain(steal.status);
  });

  it('strips duplicate product names and raw urls when cards are present', () => {
    const artifacts = [{ kind: 'product', product: { id: '1', name: 'ActiveDry Polo' } }];
    const text = formatAssistantTextForCards(
      [
        'Here are options.',
        '- ActiveDry Polo',
        '[ActiveDry Polo](https://cdn.example.com/polo.png)',
        'https://cdn.example.com/polo.png',
        'Want me to add it to your store?',
      ].join('\n'),
      artifacts,
    );
    expect(text).toContain('Here are options.');
    expect(text).toContain('Want me to add it to your store?');
    expect(text).not.toContain('cdn.example.com');
    expect(text).not.toMatch(/^- ActiveDry Polo$/m);
  });

  it('persists success artifact so reopen does not keep pending confirm', async () => {
    const tenant = await makeTenant();
    const admin = await makeUser(tenant, 'company_admin');
    const convo = await CopilotConversation.create({
      tenantId: tenant._id,
      userId: admin.user._id,
      title: 'publish',
      messages: [{
        role: 'assistant',
        content: 'Ready to publish.',
        artifacts: [{
          kind: 'confirmation',
          operation: 'shops.publish',
          confirmationId: 'c'.repeat(24),
          status: 'pending',
          request: { shopId: '507f1f77bcf86cd799439011' },
        }],
      }],
    });
    const persisted = await request(app)
      .patch(`/api/v1/copilot/conversations/${convo._id}/write-artifacts`)
      .set(authHeader(admin.token))
      .send({
        confirmationId: 'c'.repeat(24),
        artifact: {
          kind: 'success',
          operation: 'shops.publish',
          title: 'Store published successfully!',
          message: 'Rewards Store is now Live.',
          result: { id: '507f1f77bcf86cd799439011', name: 'Rewards Store', status: 'live' },
        },
      });
    expect(persisted.status).toBe(200);
    const reopened = await request(app)
      .get(`/api/v1/copilot/conversations/${convo._id}`)
      .set(authHeader(admin.token));
    expect(reopened.status).toBe(200);
    expect(reopened.body.messages[0].artifacts[0].kind).toBe('success');
    expect(reopened.body.messages[0].artifacts[0].title).toMatch(/published/i);
  });
});