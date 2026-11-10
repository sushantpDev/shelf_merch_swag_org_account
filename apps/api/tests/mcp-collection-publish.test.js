import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { Collection } from '../src/modules/collections/collection.model.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { McpWriteIdempotency } from '../src/modules/mcp/mcpWriteIdempotency.model.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { makeTenant, makeUser } from './helpers.js';
import {
  executeCollectionDraft,
  executeCollectionPublish,
  prepareCollectionDraft,
  prepareCollectionPublish,
} from '../src/modules/mcp/shopsCollectionWrite.js';

let tenant;
let admin;
let shop;
let product;
let otherProduct;

beforeAll(connectTestDb);
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  clearTenantLimitCache();
  tenant = await makeTenant({ slug: 'collections' });
  admin = await makeUser(tenant, 'company_admin', 'tenant');
  shop = await Shop.create({
    tenantId: tenant._id,
    name: 'HQ Store',
    slug: `hq-col-${Date.now()}`,
    status: 'draft',
    activeListingKeys: ['other-collection:kept'],
  });
  product = await CatalogProduct.create({
    sku: `SM-MUG-${Date.now()}`,
    name: 'Desk Mug',
    category: 'Drinkware',
    group: 'mug',
    basePriceInr: 400,
    costPriceInr: 222222,
  });
  otherProduct = await CatalogProduct.create({
    sku: `SM-CAP-${Date.now()}`,
    name: 'Cap',
    category: 'Apparel',
    group: 'cap',
    basePriceInr: 300,
  });
});

function draftInput(extra = {}) {
  return {
    shopId: String(shop._id),
    name: 'Desk set',
    catalogProductIds: [String(product._id)],
    ...extra,
  };
}

describe('store collection draft and publish', () => {
  it('resolves destination store by exact name', async () => {
    const prepared = await prepareCollectionDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: {
        shopName: 'HQ Store',
        name: 'Named destination',
        catalogProductIds: [String(product._id)],
      },
    });
    expect(prepared.preview.shopId).toBe(String(shop._id));
    const saved = await executeCollectionDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: {
        shopName: 'HQ Store',
        name: 'Named destination',
        catalogProductIds: [String(product._id)],
      },
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'collection-by-name-1',
    });
    expect(saved.shopId).toBe(String(shop._id));
  });

  it('does not mutate a different destination store', async () => {
    const otherShop = await Shop.create({
      tenantId: tenant._id,
      name: 'Other Store',
      slug: `other-col-${Date.now()}`,
      status: 'draft',
      activeListingKeys: ['keep:other'],
    });
    const prepared = await prepareCollectionDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: draftInput({ shopName: 'HQ Store', name: 'Only HQ' }),
    });
    const saved = await executeCollectionDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: draftInput({ shopName: 'HQ Store', name: 'Only HQ' }),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'collection-dest-1',
    });
    const stored = await Collection.findOne({ _id: saved.id, tenantId: tenant._id });
    stored.artworkUrl = 'https://cdn.test/dest-art.png';
    await stored.save();
    const publishPreview = await prepareCollectionPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { collectionId: saved.id, shopName: 'HQ Store' },
    });
    await executeCollectionPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { collectionId: saved.id, shopName: 'HQ Store' },
      confirmationId: publishPreview.confirmationId,
      idempotencyKey: 'collection-dest-publish-1',
    });
    const untouched = await Shop.findOne({ _id: otherShop._id, tenantId: tenant._id });
    expect(untouched.activeListingKeys).toEqual(['keep:other']);
    const target = await Shop.findOne({ _id: shop._id, tenantId: tenant._id });
    expect(target.activeListingKeys.some((key) => String(key).startsWith(`${saved.id}:`))).toBe(true);
  });

  it('saves a draft without publishing, then publishes only its products', async () => {
    const prepared = await prepareCollectionDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: draftInput(),
    });
    expect(prepared.preview).toMatchObject({
      action: 'create',
      status: 'draft',
      designReady: false,
      products: [{ catalogProductId: String(product._id), name: 'Desk Mug' }],
    });
    expect(JSON.stringify(prepared)).not.toContain('222222');
    expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).activeListingKeys).toEqual(['other-collection:kept']);

    const saved = await executeCollectionDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: draftInput(),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'collection-draft-1',
    });
    expect(saved).toMatchObject({ status: 'draft', published: false, productCount: 1 });
    const stored = await Collection.findOne({ _id: saved.id, tenantId: tenant._id });
    expect(stored.shopIds).toEqual([]);
    expect(stored.shopId).toBeFalsy();
    expect((await CatalogProduct.findById(product._id)).basePriceInr).toBe(400);

    const draftRow = await McpWriteIdempotency.findOne({ key: 'collection-draft-1', tenantId: tenant._id });
    await McpWriteIdempotency.updateOne(
      { _id: draftRow._id, tenantId: tenant._id },
      { $set: { status: 'pending', result: null, leaseOwner: 'replica-a', leaseExpiresAt: new Date(0) } },
    );
    const recovered = await executeCollectionDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: draftInput(),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'collection-draft-1',
    });
    expect(recovered.id).toBe(saved.id);
    expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(1);

    await expect(prepareCollectionPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { collectionId: saved.id, shopId: String(shop._id) },
    })).rejects.toMatchObject({ code: 'DESIGN_REQUIRED' });
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).activeListingKeys).toEqual(['other-collection:kept']);

    stored.artworkUrl = 'https://cdn.test/existing-art.png';
    await stored.save();
    const publishPreview = await prepareCollectionPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { collectionId: saved.id, shopId: String(shop._id) },
    });
    expect(publishPreview.preview.becomingVisible).toEqual([
      expect.objectContaining({ name: 'Desk Mug', catalogProductId: String(product._id) }),
    ]);
    expect(publishPreview.preview.becomingVisible[0].listingKey).not.toContain(String(otherProduct._id));

    const published = await executeCollectionPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { collectionId: saved.id, shopId: String(shop._id) },
      confirmationId: publishPreview.confirmationId,
      idempotencyKey: 'collection-publish-1',
    });
    expect(published.status).toBe('ready');
    expect(published.visibleProducts).toHaveLength(1);
    const shopAfter = await Shop.findOne({ _id: shop._id, tenantId: tenant._id });
    expect(shopAfter.activeListingKeys).toContain('other-collection:kept');
    expect(shopAfter.activeListingKeys).toContain(published.visibleProducts[0].listingKey);
    expect(shopAfter.activeListingKeys.filter((key) => key.startsWith(`${saved.id}:`))).toHaveLength(1);

    const again = await prepareCollectionPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { collectionId: saved.id, shopId: String(shop._id) },
    });
    const replayed = await executeCollectionPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { collectionId: saved.id, shopId: String(shop._id) },
      confirmationId: again.confirmationId,
      idempotencyKey: 'collection-publish-2',
    });
    expect(replayed.visibleProducts).toHaveLength(1);
    const finalShop = await Shop.findOne({ _id: shop._id, tenantId: tenant._id });
    expect(finalShop.activeListingKeys.filter((key) => key.startsWith(`${saved.id}:`))).toHaveLength(1);
  });


  it('prepares MCP publish after saving artwork through the collection APIs', async () => {
    const prepared = await prepareCollectionDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: draftInput(),
    });
    const saved = await executeCollectionDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: draftInput(),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'collection-design-save-1',
    });
    await expect(prepareCollectionPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { collectionId: saved.id, shopId: String(shop._id) },
    })).rejects.toMatchObject({ code: 'DESIGN_REQUIRED' });

    const collection = await Collection.findOne({ _id: saved.id, tenantId: tenant._id });
    collection.artworkUrl = 'https://cdn.test/saved-from-editor.png';
    collection.productRefs[0].mockupUrl = 'https://cdn.test/mug-mockup.png';
    collection.productRefs[0].placement = { xPct: 12, yPct: 18, wPct: 40, rot: 0 };
    collection.status = 'ready';
    await collection.save();

    const beforeKeys = [...((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).activeListingKeys || [])];
    const publishPreview = await prepareCollectionPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { collectionId: saved.id, shopId: String(shop._id) },
    });
    expect(publishPreview.preview.becomingVisible).toEqual([
      expect.objectContaining({ catalogProductId: String(product._id), name: 'Desk Mug' }),
    ]);
    const afterKeys = (await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).activeListingKeys || [];
    expect(afterKeys).toEqual(beforeKeys);
    expect(collection.shopIds || []).toEqual([]);
  });

  it('rejects the wrong role, another tenant, an unknown product, and a stale publish', async () => {
    const manager = await makeUser(tenant, 'entity_manager', 'entity', { assignedEntityIds: [] });
    await expect(prepareCollectionDraft({
      tenantId: tenant._id,
      actorUserId: manager.user._id,
      input: draftInput(),
    })).rejects.toMatchObject({ status: 403 });

    const other = await makeTenant({ slug: 'other-col' });
    const outsider = await makeUser(other, 'company_admin', 'tenant');
    await expect(prepareCollectionDraft({
      tenantId: other._id,
      actorUserId: outsider.user._id,
      input: draftInput(),
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(prepareCollectionDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: draftInput({ catalogProductIds: ['a'.repeat(24)] }),
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const prepared = await prepareCollectionDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: draftInput(),
    });
    const saved = await executeCollectionDraft({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: draftInput(),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'collection-draft-stale',
    });
    const collection = await Collection.findOne({ _id: saved.id, tenantId: tenant._id });
    collection.artworkUrl = 'https://cdn.test/existing-art.png';
    await collection.save();
    const publishPreview = await prepareCollectionPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { collectionId: saved.id, shopId: String(shop._id) },
    });
    collection.name = 'Renamed set';
    await collection.save();
    await expect(executeCollectionPublish({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { collectionId: saved.id, shopId: String(shop._id) },
      confirmationId: publishPreview.confirmationId,
      idempotencyKey: 'stale-publish',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });
    expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).activeListingKeys).toEqual(['other-collection:kept']);
  });
});
