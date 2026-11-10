import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { syncCollectionPublishTargets } from '../src/modules/shops/shopCatalogSync.js';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { Collection } from '../src/modules/collections/collection.model.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { Order } from '../src/modules/orders/order.model.js';
import { Campaign } from '../src/modules/campaigns/campaign.model.js';
import { Recipient } from '../src/modules/campaigns/recipient.model.js';
import { Entity } from '../src/modules/entities/entity.model.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';
import { signAccessToken } from '../src/modules/auth/auth.service.js';

let app;
let adminToken;
let tenant;
let product;
let collection;

async function makeUser(tenantDoc, role, scopeType) {
  const user = await User.create({
    tenantId: tenantDoc?._id ?? null,
    name: `${role} user`,
    email: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.io`,
    status: 'active',
  });
  const assignment = await RoleAssignment.create({
    tenantId: tenantDoc?._id ?? null,
    userId: user._id,
    role,
    scopeType,
  });
  return signAccessToken(user, assignment);
}

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  tenant = await Tenant.create({ name: 'Rubix', slug: 'rubix' });
  adminToken = await makeUser(tenant, 'company_admin', 'tenant');
  product = await CatalogProduct.create({
    sku: `SM-TEE-${Date.now()}`,
    name: 'Core Cotton Tee',
    category: 'Apparel',
    basePriceInr: 499,
  });
  collection = await Collection.create({
    tenantId: tenant._id,
    code: 'C123456789',
    name: 'Employee Swag',
    status: 'ready',
    artworkUrl: '/uploads/test/art.png',
    productRefs: [{ catalogProductId: product._id, brand: 'Rubix', name: 'Core Cotton Tee', group: 'tee' }],
  });
});

describe('collections archive / restore / delete', () => {
  it('archives a collection', async () => {
    const res = await request(app)
      .post(`/api/v1/collections/${collection._id}/archive`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('archived');
  });

  it('restores an archived collection to ready when artwork exists', async () => {
    collection.status = 'archived';
    await collection.save();
    const res = await request(app)
      .post(`/api/v1/collections/${collection._id}/restore`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  it('soft-deletes a collection', async () => {
    const res = await request(app)
      .delete(`/api/v1/collections/${collection._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
    const found = await Collection.findOne({ _id: collection._id, tenantId: tenant._id });
    expect(found).toBeNull();
    const deleted = await Collection.findOne({ _id: collection._id, tenantId: tenant._id }).setOptions({ includeDeleted: true });
    expect(deleted?.deletedAt).toBeTruthy();
  });

  it('soft-deletes a collection and removes it from linked shops', async () => {
    const shop = await Shop.create({
      tenantId: tenant._id,
      name: 'Linked Shop',
      status: 'live',
    });
    collection.shopId = shop._id;
    collection.shopIds = [shop._id];
    await collection.save();
    await request(app)
      .post(`/api/v1/collections/${collection._id}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ shopId: String(shop._id) });

    const res = await request(app)
      .delete(`/api/v1/collections/${collection._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(204);

    const shopRecord = await Shop.findOne({ _id: shop._id, tenantId: tenant._id });
    expect(shopRecord.activeListingKeys).toEqual([]);

    const storefront = await request(app).get(`/api/v1/storefront/${shop._id}`);
    expect(storefront.body.products).toHaveLength(0);
  });

  it('blocks delete when collection products have been ordered', async () => {
    const wallet = await Wallet.create({ tenantId: tenant._id, name: 'Budget' });
    const entity = await Entity.create({ tenantId: tenant._id, walletId: wallet._id, name: 'Marketing' });
    const shop = await Shop.create({ tenantId: tenant._id, name: 'Order Shop', status: 'live' });
    const campaign = await Campaign.create({
      tenantId: tenant._id,
      entityId: entity._id,
      name: 'Test campaign',
      type: 'points',
      shopId: shop._id,
      status: 'redemption_open',
      creditsPerRecipient: 500,
      totalBudget: 500,
      recipientCount: 1,
    });
    const recipient = await Recipient.create({
      tenantId: tenant._id,
      campaignId: campaign._id,
      name: 'Alex',
      email: 'alex@test.io',
      creditAmount: 500,
      redemptionToken: 'token-ordered',
      redemptionStatus: 'order_created',
    });
    await Order.create({
      tenantId: tenant._id,
      campaignId: campaign._id,
      recipientId: recipient._id,
      orderNumber: `ORD-${Date.now()}`,
      items: [{
        catalogProductId: product._id,
        collectionId: collection._id,
        name: 'Core Cotton Tee',
        qty: 1,
        unitPriceInr: 499,
      }],
      amountBreakdown: { subtotal: 499, serviceFee: 0, gst: 0, total: 499 },
    });

    const res = await request(app)
      .delete(`/api/v1/collections/${collection._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('COLLECTION_HAS_ORDERS');

    const stillThere = await Collection.findOne({ _id: collection._id, tenantId: tenant._id });
    expect(stillThere).toBeTruthy();
  });
});

describe('collection shop links', () => {
  it('links one collection to multiple shops without creating duplicates', async () => {
    const shopA = await Shop.create({ tenantId: tenant._id, name: 'Salesforce Shop', status: 'live' });
    const shopB = await Shop.create({ tenantId: tenant._id, name: 'Zeta Shop', status: 'live' });

    const linkA = await request(app)
      .patch(`/api/v1/collections/${collection._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ shopId: String(shopA._id) });
    expect(linkA.status).toBe(200);
    expect(linkA.body.shopIds.map(String)).toContain(String(shopA._id));

    const linkB = await request(app)
      .patch(`/api/v1/collections/${collection._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ shopId: String(shopB._id) });
    expect(linkB.status).toBe(200);
    expect(linkB.body.shopIds.map(String)).toEqual(
      expect.arrayContaining([String(shopA._id), String(shopB._id)]),
    );

    const count = await Collection.countDocuments({ tenantId: tenant._id, name: 'Employee Swag' });
    expect(count).toBe(1);

    const forA = await request(app)
      .get(`/api/v1/collections?shopId=${shopA._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    const forB = await request(app)
      .get(`/api/v1/collections?shopId=${shopB._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(forA.body.some((c) => String(c._id) === String(collection._id))).toBe(true);
    expect(forB.body.some((c) => String(c._id) === String(collection._id))).toBe(true);

    const shopARecord = await Shop.findOne({ _id: shopA._id, tenantId: tenant._id });
    expect(shopARecord.selectedCatalogProductIds.map(String)).toContain(String(product._id));
    const shopBRecord = await Shop.findOne({ _id: shopB._id, tenantId: tenant._id });
    expect(shopBRecord.selectedCatalogProductIds.map(String)).toContain(String(product._id));
  });

  it('publishes one collection to multiple shops via shopIds', async () => {
    const shopA = await Shop.create({ tenantId: tenant._id, name: 'Google Shop', status: 'live' });
    const shopB = await Shop.create({ tenantId: tenant._id, name: 'Amazon Shop', status: 'live' });
    const res = await request(app)
      .post(`/api/v1/collections/${collection._id}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ shopIds: [String(shopA._id), String(shopB._id)] });
    expect(res.status).toBe(200);
    expect(res.body.shopIds.map(String)).toEqual(
      expect.arrayContaining([String(shopA._id), String(shopB._id)]),
    );
    const shopARecord = await Shop.findOne({ _id: shopA._id, tenantId: tenant._id });
    const shopBRecord = await Shop.findOne({ _id: shopB._id, tenantId: tenant._id });
    expect(shopARecord.activeListingKeys.length).toBeGreaterThan(0);
    expect(shopBRecord.activeListingKeys.length).toBeGreaterThan(0);
  });

  it('adds catalog products to the shop when creating a shop-linked collection', async () => {
    const shop = await Shop.create({ tenantId: tenant._id, name: 'New Shop', status: 'live' });
    const res = await request(app)
      .post('/api/v1/collections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        shopId: String(shop._id),
        name: 'Onboarding Swag',
        artworkUrl: '/uploads/test/art.png',
        isShopSpecific: true,
        productRefs: [{ catalogProductId: String(product._id), name: 'Core Cotton Tee', group: 'tee' }],
      });
    expect(res.status).toBe(201);
    const updated = await Shop.findOne({ _id: shop._id, tenantId: tenant._id });
    expect(updated.selectedCatalogProductIds.map(String)).toContain(String(product._id));
  });
});

describe('collection mockup uploads', () => {
  it('stores mockupUrl on product refs via multipart upload', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAC4jAAAuIwF4pT92AAAAFElEQVR4nGP4z8DAAMIM////ZwAAHu8E/KPItPcAAAAASUVORK5CYII=',
      'base64',
    );
    const res = await request(app)
      .post(`/api/v1/collections/${collection._id}/mockups`)
      .set('Authorization', `Bearer ${adminToken}`)
      .field('meta', JSON.stringify([{ catalogProductId: String(product._id) }]))
      .attach('mockups', png, { filename: 'mockup.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.productRefs[0].mockupUrl).toBeTruthy();

    const shop = await Shop.create({
      tenantId: tenant._id,
      name: 'Linked Shop',
      status: 'live',
      selectedCatalogProductIds: [product._id],
    });
    await Collection.updateOne(
      { _id: collection._id, tenantId: tenant._id },
      { $set: { shopId: shop._id, shopIds: [shop._id] } },
    );
    const storefront = await request(app).get(`/api/v1/storefront/${shop._id}`);
    expect(storefront.body.products[0].mockupUrl).toBe(res.body.productRefs[0].mockupUrl);
  });

  it('persists the Konva placement with the mockup and serves it to the storefront', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAC4jAAAuIwF4pT92AAAAFElEQVR4nGP4z8DAAMIM////ZwAAHu8E/KPItPcAAAAASUVORK5CYII=',
      'base64',
    );
    const placement = { xPct: 42.5, yPct: 31, wPct: 28, rot: -7.5 };
    const res = await request(app)
      .post(`/api/v1/collections/${collection._id}/mockups`)
      .set('Authorization', `Bearer ${adminToken}`)
      .field('meta', JSON.stringify([{ catalogProductId: String(product._id), placement }]))
      .attach('mockups', png, { filename: 'mockup.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.productRefs[0].placement).toMatchObject(placement);

    const shop = await Shop.create({
      tenantId: tenant._id,
      name: 'Placement Shop',
      status: 'live',
      selectedCatalogProductIds: [product._id],
    });
    await Collection.updateOne(
      { _id: collection._id, tenantId: tenant._id },
      { $set: { shopId: shop._id, shopIds: [shop._id] } },
    );
    const storefront = await request(app).get(`/api/v1/storefront/${shop._id}`);
    expect(storefront.body.products[0].placement).toMatchObject(placement);
  });

  it('merges mockups from sequential per-product uploads', async () => {
    const productB = await CatalogProduct.create({
      sku: `SM-MUG-${Date.now()}`,
      name: 'Bliss Mug',
      category: 'Drinkware',
      basePriceInr: 299,
    });
    collection.productRefs.push({
      catalogProductId: productB._id,
      brand: 'Rubix',
      name: 'Bliss Mug',
      group: 'mug',
    });
    await collection.save();
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAC4jAAAuIwF4pT92AAAAFElEQVR4nGP4z8DAAMIM////ZwAAHu8E/KPItPcAAAAASUVORK5CYII=',
      'base64',
    );
    const first = await request(app)
      .post(`/api/v1/collections/${collection._id}/mockups`)
      .set('Authorization', `Bearer ${adminToken}`)
      .field('meta', JSON.stringify([{ catalogProductId: String(product._id) }]))
      .attach('mockups', png, { filename: 'mockup-a.png', contentType: 'image/png' });
    expect(first.status).toBe(200);
    expect(first.body.productRefs[0].mockupUrl).toBeTruthy();
    expect(first.body.productRefs[1].mockupUrl).toBeFalsy();

    const second = await request(app)
      .post(`/api/v1/collections/${collection._id}/mockups`)
      .set('Authorization', `Bearer ${adminToken}`)
      .field('meta', JSON.stringify([{ catalogProductId: String(productB._id) }]))
      .attach('mockups', png, { filename: 'mockup-b.png', contentType: 'image/png' });
    expect(second.status).toBe(200);
    expect(second.body.productRefs[0].mockupUrl).toBe(first.body.productRefs[0].mockupUrl);
    expect(second.body.productRefs[1].mockupUrl).toBeTruthy();
  });

  it('stores mockups for multiple products in one request', async () => {
    const productB = await CatalogProduct.create({
      sku: `SM-CAP-${Date.now()}`,
      name: 'Custom Cap',
      category: 'Apparel',
      basePriceInr: 399,
    });
    collection.productRefs.push({
      catalogProductId: productB._id,
      brand: 'Rubix',
      name: 'Custom Cap',
      group: 'cap',
    });
    await collection.save();
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAC4jAAAuIwF4pT92AAAAFElEQVR4nGP4z8DAAMIM////ZwAAHu8E/KPItPcAAAAASUVORK5CYII=',
      'base64',
    );
    const res = await request(app)
      .post(`/api/v1/collections/${collection._id}/mockups`)
      .set('Authorization', `Bearer ${adminToken}`)
      .field(
        'meta',
        JSON.stringify([
          { catalogProductId: String(product._id) },
          { catalogProductId: String(productB._id) },
        ]),
      )
      .attach('mockups', png, { filename: 'mockup-a.png', contentType: 'image/png' })
      .attach('mockups', png, { filename: 'mockup-b.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.productRefs[0].mockupUrl).toBeTruthy();
    expect(res.body.productRefs[1].mockupUrl).toBeTruthy();
  });

  it('merges sequential mockup batches for 13 products', async () => {
    const extras = [];
    for (let i = 0; i < 12; i += 1) {
      extras.push(
        await CatalogProduct.create({
          sku: `SM-SWAG-${Date.now()}-${i}`,
          name: `Swag Item ${i + 2}`,
          category: 'Apparel',
          basePriceInr: 299 + i,
        }),
      );
    }
    collection.productRefs.push(
      ...extras.map((p) => ({
        catalogProductId: p._id,
        brand: 'Rubix',
        name: p.name,
        group: 'tee',
      })),
    );
    await collection.save();
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAC4jAAAuIwF4pT92AAAAFElEQVR4nGP4z8DAAMIM////ZwAAHu8E/KPItPcAAAAASUVORK5CYII=',
      'base64',
    );
    const ids = collection.productRefs.map((ref) => String(ref.catalogProductId));
    let last;
    for (let i = 0; i < ids.length; i += 1) {
      last = await request(app)
        .post(`/api/v1/collections/${collection._id}/mockups`)
        .set('Authorization', `Bearer ${adminToken}`)
        .field('meta', JSON.stringify([{ catalogProductId: ids[i] }]))
        .attach('mockups', png, { filename: `mockup-${i}.png`, contentType: 'image/png' });
      expect(last.status).toBe(200);
    }
    expect(last.body.productRefs).toHaveLength(13);
    expect(last.body.productRefs.every((ref) => ref.mockupUrl)).toBe(true);
  });
});

describe('collection re-publish and shop rollback', () => {
  it('re-publishes an existing collection without duplicating shop links', async () => {
    const shop = await Shop.create({ tenantId: tenant._id, name: 'Salesforce Shop', status: 'live' });
    const first = await request(app)
      .post(`/api/v1/collections/${collection._id}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ shopIds: [String(shop._id)] });
    expect(first.status).toBe(200);
    const second = await request(app)
      .post(`/api/v1/collections/${collection._id}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ shopIds: [String(shop._id)] });
    expect(second.status).toBe(200);
    expect(second.body.shopIds.map(String)).toEqual([String(shop._id)]);
    const shopRecord = await Shop.findOne({ _id: shop._id, tenantId: tenant._id });
    const keys = shopRecord.activeListingKeys.map(String);
    expect(keys).toEqual([...new Set(keys)]);
  });

  it('rolls back shops added in this call if a later shop publish fails', async () => {
    const shopA = await Shop.create({ tenantId: tenant._id, name: 'Google Shop', status: 'live' });
    const shopB = await Shop.create({ tenantId: tenant._id, name: 'Amazon Shop', status: 'live' });
    const originalFindOne = Shop.findOne.bind(Shop);
    const spy = vi.spyOn(Shop, 'findOne').mockImplementation(function findOneMock(filter, ...rest) {
      if (filter && String(filter._id) === String(shopB._id)) {
        return Promise.reject(new Error('simulated shop publish failure'));
      }
      return originalFindOne(filter, ...rest);
    });

    try {
      await expect(
        syncCollectionPublishTargets(collection._id, tenant._id, [shopA._id, shopB._id]),
      ).rejects.toThrow('simulated shop publish failure');
    } finally {
      spy.mockRestore();
    }

    const refreshed = await Collection.findOne({ _id: collection._id, tenantId: tenant._id });
    expect((refreshed.shopIds || []).map(String)).not.toContain(String(shopA._id));
    expect((refreshed.shopIds || []).map(String)).not.toContain(String(shopB._id));
    const shopARecord = await Shop.findOne({ _id: shopA._id, tenantId: tenant._id });
    expect(shopARecord.activeListingKeys || []).toEqual([]);
  });
});

describe("collection design save without publishing", () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAC4jAAAuIwF4pT92AAAAFElEQVR4nGP4z8DAAMIM////ZwAAHu8E/KPItPcAAAAASUVORK5CYII=",
    "base64",
  );

  it("saves artwork and mockups without linking shops or creating listings", async () => {
    const draft = await Collection.create({
      tenantId: tenant._id,
      code: "C555555555",
      name: "MCP Mug Draft",
      status: "draft",
      productRefs: [{ catalogProductId: product._id, brand: "Rubix", name: "Core Cotton Tee", group: "tee" }],
    });
    const shop = await Shop.create({
      tenantId: tenant._id,
      name: "QA Store",
      status: "live",
      activeListingKeys: ["keep:me"],
    });

    const art = await request(app)
      .post(`/api/v1/collections/${draft._id}/artwork`)
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("artwork", png, { filename: "logo.png", contentType: "image/png" });
    expect(art.status).toBe(200);
    expect(art.body.artworkUrl).toBeTruthy();
    expect(art.body.status).toBe("ready");
    expect(art.body.shopIds || []).toEqual([]);

    const mock = await request(app)
      .post(`/api/v1/collections/${draft._id}/mockups`)
      .set("Authorization", `Bearer ${adminToken}`)
      .field("meta", JSON.stringify([{ catalogProductId: String(product._id), placement: { xPct: 10, yPct: 20, wPct: 30, rot: 0 } }]))
      .attach("mockups", png, { filename: "mockup.png", contentType: "image/png" });
    expect(mock.status).toBe(200);
    expect(mock.body.productRefs[0].mockupUrl).toBeTruthy();
    expect(mock.body.productRefs[0].placement).toMatchObject({ xPct: 10, yPct: 20, wPct: 30, rot: 0 });

    const stored = await Collection.findOne({ _id: draft._id, tenantId: tenant._id });
    expect(stored.shopId).toBeFalsy();
    expect(stored.shopIds || []).toEqual([]);
    expect(stored.artworkUrl).toBeTruthy();
    expect(stored.productRefs[0].mockupUrl).toBeTruthy();

    const shopAfter = await Shop.findOne({ _id: shop._id, tenantId: tenant._id });
    expect(shopAfter.activeListingKeys).toEqual(["keep:me"]);
  });

  it("allows renaming and productRefs updates on ready unpublished collections", async () => {
    const draft = await Collection.create({
      tenantId: tenant._id,
      code: "C666666666",
      name: "Ready Unpublished",
      status: "draft",
      productRefs: [{ catalogProductId: product._id, brand: "Rubix", name: "Core Cotton Tee", group: "tee" }],
    });
    const artReady = await request(app)
      .post(`/api/v1/collections/${draft._id}/artwork`)
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("artwork", png, { filename: "logo.png", contentType: "image/png" });
    expect(artReady.status).toBe(200);
    expect(artReady.body.status).toBe("ready");

    const productB = await CatalogProduct.create({
      sku: `SM-HAT-${Date.now()}`,
      name: "Cap",
      category: "Apparel",
      basePriceInr: 199,
    });
    const patched = await request(app)
      .patch(`/api/v1/collections/${draft._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Ready Renamed",
        productRefs: [{ catalogProductId: String(productB._id), name: "Cap", group: "cap" }],
      });
    expect(patched.status).toBe(200);
    expect(patched.body.name).toBe("Ready Renamed");
    expect(patched.body.productRefs[0].name).toBe("Cap");
    expect(patched.body.shopIds || []).toEqual([]);
  });

  it("rejects productRefs edits after the collection is linked to a shop", async () => {
    const shop = await Shop.create({ tenantId: tenant._id, name: "Live Shop", status: "live" });
    collection.shopIds = [shop._id];
    collection.shopId = shop._id;
    await collection.save();

    const res = await request(app)
      .patch(`/api/v1/collections/${collection._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Should Fail" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("COLLECTION_NOT_DRAFT");
  });

it("preserves existing mockups when PATCH omits design fields", async () => {
    const draft = await Collection.create({
      tenantId: tenant._id,
      code: "C777777777",
      name: "Preserve Design",
      status: "ready",
      artworkUrl: "https://cdn.test/art.png",
      productRefs: [{
        catalogProductId: product._id,
        brand: "Rubix",
        name: "Core Cotton Tee",
        group: "tee",
        mockupUrl: "https://cdn.test/keep-mock.png",
        designOnlyImageUrl: "https://cdn.test/keep-design.png",
        placement: { xPct: 15, yPct: 25, wPct: 35, rot: 2 },
      }],
    });

    const patched = await request(app)
      .patch(`/api/v1/collections/${draft._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Preserve Design Renamed",
        productRefs: [{ catalogProductId: String(product._id), name: "Core Cotton Tee", group: "tee", brand: "Rubix" }],
      });
    expect(patched.status).toBe(200);
    expect(patched.body.name).toBe("Preserve Design Renamed");
    expect(patched.body.productRefs[0].mockupUrl).toBe("https://cdn.test/keep-mock.png");
    expect(patched.body.productRefs[0].designOnlyImageUrl).toBe("https://cdn.test/keep-design.png");
    expect(patched.body.productRefs[0].placement).toMatchObject({ xPct: 15, yPct: 25, wPct: 35, rot: 2 });
  });

  it("rejects artwork and mockup uploads after the collection is linked to a shop", async () => {
    const shop = await Shop.create({ tenantId: tenant._id, name: "Locked Shop", status: "live" });
    collection.shopIds = [shop._id];
    collection.shopId = shop._id;
    await collection.save();

    const art = await request(app)
      .post(`/api/v1/collections/${collection._id}/artwork`)
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("artwork", png, { filename: "logo.png", contentType: "image/png" });
    expect(art.status).toBe(409);
    expect(art.body.error.code).toBe("COLLECTION_PUBLISHED");

    const mock = await request(app)
      .post(`/api/v1/collections/${collection._id}/mockups`)
      .set("Authorization", `Bearer ${adminToken}`)
      .field("meta", JSON.stringify([{ catalogProductId: String(product._id) }]))
      .attach("mockups", png, { filename: "mockup.png", contentType: "image/png" });
    expect(mock.status).toBe(409);
    expect(mock.body.error.code).toBe("COLLECTION_PUBLISHED");
  });

  it("keeps prior mockups across repeated design saves that only rename", async () => {
    const draft = await Collection.create({
      tenantId: tenant._id,
      code: "C888888888",
      name: "Repeat Save",
      status: "draft",
      productRefs: [{ catalogProductId: product._id, brand: "Rubix", name: "Core Cotton Tee", group: "tee" }],
    });
    await request(app)
      .post(`/api/v1/collections/${draft._id}/artwork`)
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("artwork", png, { filename: "logo.png", contentType: "image/png" });
    const firstMock = await request(app)
      .post(`/api/v1/collections/${draft._id}/mockups`)
      .set("Authorization", `Bearer ${adminToken}`)
      .field("meta", JSON.stringify([{ catalogProductId: String(product._id), placement: { xPct: 5, yPct: 6, wPct: 7, rot: 0 } }]))
      .attach("mockups", png, { filename: "mockup.png", contentType: "image/png" });
    expect(firstMock.status).toBe(200);
    const mockUrl = firstMock.body.productRefs[0].mockupUrl;

    const renamed = await request(app)
      .patch(`/api/v1/collections/${draft._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Repeat Save 2",
        productRefs: [{ catalogProductId: String(product._id), name: "Core Cotton Tee", group: "tee" }],
      });
    expect(renamed.status).toBe(200);
    expect(renamed.body.productRefs[0].mockupUrl).toBe(mockUrl);
    expect(renamed.body.productRefs[0].placement).toMatchObject({ xPct: 5, yPct: 6, wPct: 7, rot: 0 });
  });


  it("rejects artwork upload from another tenant", async () => {
    const other = await Tenant.create({ name: "Other Co", slug: `other-${Date.now()}` });
    const otherToken = await makeUser(other, "company_admin", "tenant");
    const res = await request(app)
      .post(`/api/v1/collections/${collection._id}/artwork`)
      .set("Authorization", `Bearer ${otherToken}`)
      .attach("artwork", png, { filename: "logo.png", contentType: "image/png" });
    expect(res.status).toBe(404);
  });
});
