import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { Kit } from '../src/modules/kits/kit.model.js';
import { PlatformKit } from '../src/modules/kits/platformKit.model.js';
import { makeTenant, makeUser } from './helpers.js';
import { getCuratedKit, getKit, kitsText, listCuratedKits, listKits, officialKitImageUrl } from '../src/modules/mcp/kitsRead.js';
import { CATALOG_PRODUCT_CARD_URI, catalogProductCardHtml } from '../src/modules/mcp/catalogProductCard.js';
import { KIT_CATALOG_CARD_URI, kitCatalogCardHtml, kitCatalogCardToolMeta } from '../src/modules/mcp/kitCatalogCard.js';
import { normalizeKitListType, kitsListInputSchema, KITS_LIST_DESCRIPTION, resolveKitListLimit, listKits, listCuratedKits } from '../src/modules/mcp/kitsRead.js';

let tenant;
let admin;
let manager;
let finance;

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  tenant = await makeTenant({ slug: 'kit-read' });
  admin = await makeUser(tenant, 'company_admin', 'tenant');
  manager = await makeUser(tenant, 'entity_manager', 'entity');
  finance = await makeUser(tenant, 'company_finance_user', 'tenant');
});

describe('workspace and curated kit reads', () => {
  it('lists customized and curated copies for this workspace only', async () => {
    const product = await CatalogProduct.create({
      sku: 'SM-MUG-1',
      name: 'Desk Mug',
      category: 'Drinkware',
      group: 'mug',
      basePriceInr: 118,
      primaryImageUrl: 'https://cdn.shopify.com/mug.png',
    });
    await Kit.create({
      tenantId: tenant._id,
      name: 'Onboarding Kit',
      description: 'For new hires',
      productRefs: [{ catalogProductId: product._id, name: 'Desk Mug', brand: '', group: 'mug' }],
      status: 'live',
      kitPrice: 118,
      artworkUrl: 'https://cdn.shopify.com/kit.png',
    });
    await Kit.create({
      tenantId: tenant._id,
      name: 'Archived Kit',
      productRefs: [{ catalogProductId: product._id, name: 'Desk Mug', brand: '', group: 'mug' }],
      status: 'archived',
      kitPrice: 118,
    });
    const other = await makeTenant({ slug: 'other-kits' });
    await Kit.create({
      tenantId: other._id,
      name: 'Secret Kit',
      productRefs: [{ catalogProductId: product._id, name: 'Desk Mug', brand: '', group: 'mug' }],
      status: 'live',
      kitPrice: 900,
    });

    const listed = await listKits({
      tenantId: tenant._id,
      user: { role: 'company_admin', userId: admin.user._id },
      input: { query: 'onboard' },
    });
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]).toMatchObject({
      name: 'Onboarding Kit',
      type: 'customized',
      status: 'live',
      itemCount: 1,
      priceInr: 118,
      imageUrl: 'https://cdn.shopify.com/kit.png',
      sendEligible: true,
    });
    expect(listed.view).toEqual({ type: 'all', limit: 100 });
    expect(listed.items[0].description).toBe('For new hires');
    expect(listed.items[0].products).toEqual([
      expect.objectContaining({ name: 'Desk Mug', quantity: 1, imageUrl: 'https://cdn.shopify.com/mug.png' }),
    ]);
    expect(JSON.stringify(listed)).not.toContain('Secret Kit');

    const detail = await getKit({
      tenantId: tenant._id,
      user: { role: 'entity_manager', userId: manager.user._id },
      kitId: listed.items[0].id,
    });
    expect(detail.products).toEqual([
      expect.objectContaining({ name: 'Desk Mug', quantity: 1, imageUrl: 'https://cdn.shopify.com/mug.png' }),
    ]);
    await expect(getKit({
      tenantId: other._id,
      user: { role: 'company_admin', userId: admin.user._id },
      kitId: listed.items[0].id,
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(listKits({
      tenantId: tenant._id,
      user: { role: 'company_finance_user', userId: finance.user._id },
    })).rejects.toMatchObject({ status: 403 });
  });

  it('lists active curated kits by name and budget without copying them', async () => {
    const welcome = await PlatformKit.create({
      name: 'Welcome Box',
      description: 'Onboarding gifts',
      status: 'active',
      approxValueInr: 1500,
      heroImage: 'https://cdn.shopify.com/welcome.png',
      items: [],
      itemImages: [{ imageUrl: 'https://cdn.shopify.com/notebook.png', label: 'Notebook' }],
      rules: { requireLogo: false },
    });
    await PlatformKit.create({
      name: 'Executive Box',
      description: 'Leadership',
      status: 'active',
      approxValueInr: 4000,
      heroImage: 'https://cdn.shopify.com/exec.png',
    });
    await PlatformKit.create({
      name: 'Hidden Draft',
      status: 'draft',
      approxValueInr: 100,
    });

    const listed = await listCuratedKits({
      tenantId: tenant._id,
      user: { role: 'company_admin', userId: admin.user._id },
      input: { query: 'onboarding', maxPriceInr: 1500 },
    });
    expect(listed.items.map((kit) => kit.name)).toEqual(['Welcome Box']);
    expect(listed.view).toEqual({ type: 'curated', limit: 100 });
    expect(listed.items[0]).toMatchObject({
      type: 'curated',
      priceInr: 1500,
      itemCount: 1,
      requireLogo: false,
      imageUrl: 'https://cdn.shopify.com/welcome.png',
    });
    expect(await Kit.countDocuments({ tenantId: tenant._id })).toBe(0);

    const detail = await getCuratedKit({
      tenantId: tenant._id,
      user: { role: 'entity_manager', userId: manager.user._id },
      platformKitId: String(welcome._id),
    });
    expect(detail.products).toEqual([
      expect.objectContaining({ name: 'Notebook', quantity: 1 }),
    ]);

    await expect(getCuratedKit({
      tenantId: tenant._id,
      user: { role: 'company_admin', userId: admin.user._id },
      platformKitId: '6a82b7d8a03ad62bdb7f3bc9',
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('filters customized kits without dropping curated origin labels', async () => {
    const product = await CatalogProduct.create({
      sku: 'SM-MUG-2',
      name: 'Desk Mug',
      category: 'Drinkware',
      group: 'mug',
      basePriceInr: 118,
      primaryImageUrl: 'https://cdn.shopify.com/mug.png',
    });
    await Kit.create({
      tenantId: tenant._id,
      name: 'Team Welcome Kit',
      description: 'Custom onboarding',
      productRefs: [{ catalogProductId: product._id, name: 'Desk Mug', brand: '', group: 'mug' }],
      status: 'live',
      kitPrice: 118,
      artworkUrl: 'https://s3.ap-south-1.amazonaws.com/shelfmerch.io/tenant/artwork/welcome.jpeg',
    });
    await Kit.create({
      tenantId: tenant._id,
      name: '10 in 1 Work Bundle',
      productRefs: [{ catalogProductId: product._id, name: 'Desk Mug', brand: '', group: 'mug' }],
      status: 'live',
      kitPrice: 1500,
      artworkUrl: 'https://cdn.shopify.com/bundle.png',
      designNotes: JSON.stringify({ curated: true, originalId: '6a82b7d8a03ad62bdb7f3bc9', approxValueInr: 1500, heroImage: 'https://cdn.shopify.com/bundle.png' }),
    });

    const customized = await listKits({
      tenantId: tenant._id,
      user: { role: 'company_admin', userId: admin.user._id },
      input: { type: 'customized' },
    });
    expect(customized.view).toEqual({ type: 'customized', limit: 100 });
    expect(customized.items.map((kit) => kit.name)).toEqual(['Team Welcome Kit']);
    expect(customized.items[0].type).toBe('customized');

    const limitedCustomized = await listKits({
      tenantId: tenant._id,
      user: { role: 'company_admin', userId: admin.user._id },
      input: { type: 'customized', limit: 1 },
    });
    expect(limitedCustomized.view).toEqual({ type: 'customized', limit: 1 });
    expect(limitedCustomized.items).toHaveLength(1);
    expect(limitedCustomized.items[0].type).toBe('customized');
    expect(limitedCustomized.items[0].products[0]).toEqual(expect.objectContaining({
      name: expect.any(String),
      imageUrl: expect.any(String),
      colors: expect.any(Array),
      sizes: expect.any(Array),
    }));

    expect(normalizeKitListType('customised')).toBe('customized');
    expect(normalizeKitListType('CUSTOMIZED')).toBe('customized');
    expect(kitsListInputSchema.parse({ type: 'customised' })).toEqual({ type: 'customized' });
    expect(resolveKitListLimit(5)).toBe(5);
    expect(resolveKitListLimit(undefined)).toBe(100);
    expect(kitsListInputSchema.parse({ type: 'customized', limit: 5 })).toEqual({ type: 'customized', limit: 5 });
    expect(KITS_LIST_DESCRIPTION).toContain('type=customized');
    expect(KITS_LIST_DESCRIPTION).toContain('customised');
    expect(KITS_LIST_DESCRIPTION).toContain('Do not omit type');
    expect(customized.items[0].imageUrl).toBe('https://s3.ap-south-1.amazonaws.com/shelfmerch.io/tenant/artwork/welcome.jpeg');

    const curatedCopies = await listKits({
      tenantId: tenant._id,
      user: { role: 'company_admin', userId: admin.user._id },
      input: { type: 'curated' },
    });
    expect(curatedCopies.view).toEqual({ type: 'curated', limit: 100 });
    expect(curatedCopies.items.map((kit) => kit.name)).toEqual(['10 in 1 Work Bundle']);
    expect(curatedCopies.items[0].type).toBe('curated');

    const all = await listKits({
      tenantId: tenant._id,
      user: { role: 'company_admin', userId: admin.user._id },
      input: { type: 'all' },
    });
    expect(all.view).toEqual({ type: 'all', limit: 100 });
    expect(all.items.map((kit) => kit.name).sort()).toEqual(['10 in 1 Work Bundle', 'Team Welcome Kit']);
  });
  it('keeps a missing official image empty and does not invent one', async () => {
    await Kit.create({
      tenantId: tenant._id,
      name: 'Plain Kit',
      description: 'No photo',
      productRefs: [],
      status: 'live',
      kitPrice: 250,
      artworkUrl: '/uploads/kit.png',
    });
    const listed = await listKits({
      tenantId: tenant._id,
      user: { role: 'company_admin', userId: admin.user._id },
      input: { query: 'Plain' },
    });
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]).toMatchObject({
      type: 'customized',
      priceInr: 250,
      imageUrl: '',
      description: 'No photo',
      itemCount: 0,
    });
    const text = kitsText(listed, 'List workspace kits');
    expect(text).toContain('Official image: none');
    expect(text).toContain('250 INR');
    const card = kitsText(listed, 'List workspace kits', { cardVisible: true });
    expect(card).toContain('kit card');
    expect(card).not.toContain('https://');
    expect(card).not.toContain('250');
  });
});


  it('resolves public kit artwork and hides private files', () => {
    const bases = ['https://app.example'];
    expect(officialKitImageUrl('/uploads/abc/artwork/logo.png', bases)).toBe('https://app.example/uploads/abc/artwork/logo.png');
    expect(officialKitImageUrl('uploads/abc/mockup/front.webp', bases)).toBe('https://app.example/uploads/abc/mockup/front.webp');
    expect(officialKitImageUrl('https://cdn.shopify.com/kit.png', bases)).toBe('https://cdn.shopify.com/kit.png');
    expect(officialKitImageUrl('/uploads/abc/document/secret.pdf', bases)).toBe('');
    expect(officialKitImageUrl('/uploads/abc/artwork/../secret.png', bases)).toBe('');
    expect(officialKitImageUrl('http://cdn.shopify.com/kit.png', bases)).toBe('');
    expect(officialKitImageUrl('/uploads/kit.png', bases)).toBe('');
  });
describe('kit catalog card', () => {
  it('initializes the type chip from view.type and omits All for typed requests', () => {
    const html = kitCatalogCardHtml();
    expect(html).toContain('requestedType(body)');
    expect(html).toContain("session.type === 'all'");
    expect(html).toContain('typeOptions');
    expect(html).toContain("typeId = session.type || 'all'");
  });
  it('registers a versioned kit card without changing the product card', () => {
    const meta = kitCatalogCardToolMeta();
    expect(KIT_CATALOG_CARD_URI).toBe('ui://shelfmerch/catalog-kit-card-v5.html');
    expect(meta.ui.resourceUri).toBe(KIT_CATALOG_CARD_URI);
    expect(meta['openai/outputTemplate']).toBe(KIT_CATALOG_CARD_URI);
    expect(CATALOG_PRODUCT_CARD_URI).toBe('ui://shelfmerch/catalog-product-card-v7.html');
    expect(CATALOG_PRODUCT_CARD_URI).not.toBe(KIT_CATALOG_CARD_URI);
    const html = kitCatalogCardHtml();
    expect(html).toContain('View details');
    expect(html).toContain('Show more');
    expect(html).toContain('Back');
    expect(html).toContain('Image unavailable');
    expect(html).toContain('Listed price');
    expect(html).toContain('Estimated card price');
    expect(html).toContain('Stored card price, not the checkout total.');
    expect(html).toContain('container-type: inline-size');
    expect(html).toContain('@container (max-width: 360px)');
    expect(html).toContain('layoutMode');
    expect(html).toContain('list-stage');
    expect(html).not.toContain('hero-stage');
    expect(html).toContain('Included products');
    expect(html).toContain('paintProductRow');
    expect(html).toContain('.details:hover');
    expect(html).toContain('initialVisibleCount');
    expect(html).toContain('linkish');
    expect(html).toContain('row-media');
    expect(html).toContain('list-stage');
    expect(html).toContain("version: '0.5.0'");
    expect(html).toContain('row-media');
    expect(html).toContain('width: 100px');
    expect(html).toContain('height: 110px');
    expect(html.toLowerCase()).not.toContain('gst');
    expect(catalogProductCardHtml()).not.toContain('catalog-kit-card');
    expect(html).not.toContain('catalog-product-card');
  });
});
