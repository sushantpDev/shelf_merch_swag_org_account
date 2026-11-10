import crypto from 'node:crypto';
import { z } from 'zod';
import { ApiError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { writeAudit } from '../../services/audit.service.js';
import { objectId } from '../users/users.validation.js';
import { Shop } from '../shops/shop.model.js';
import { Collection } from '../collections/collection.model.js';
import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { publishCollectionToShop } from '../shops/shopCatalogSync.js';
import { isCollectionLinkedToShop } from '../collections/collectionQueries.js';
import { listingKey, listingKeysFromCollection } from '../shops/listingKeys.js';
import { employeeReaderFromContext } from './employeesRead.js';
import { executeMcpWrite, prepareMcpWrite } from './mcpWriteSafety.js';
import { McpCollectionClaim } from './mcpCollectionClaim.model.js';

const ROLES = new Set(rolesForTenantArea('shops', 'write'));

const shopSelectFields = {
  shopId: objectId.optional(),
  shopName: z.string().trim().min(1).max(80).optional(),
};

function hasShopSelector(value) {
  return Boolean(value.shopId || value.shopName);
}

const draftSchema = z.object({
  ...shopSelectFields,
  name: z.string().trim().min(1).max(160),
  catalogProductIds: z.array(objectId).min(1).max(50),
  artworkCollectionId: objectId.optional(),
}).strict().refine(hasShopSelector, {
  message: 'Provide a store id or an exact store name',
});

const publishSchema = z.object({
  collectionId: objectId,
  ...shopSelectFields,
}).strict().refine(hasShopSelector, {
  message: 'Provide a store id or an exact store name',
});

export const COLLECTION_PREPARE_DRAFT_DESCRIPTION = [
  'Preview a draft product collection for a company store without publishing it.',
  'Company admins only. Resolve the destination store by id or exact name. Checks that the store and catalog products belong to this workspace.',
  'Does not change the master catalog, generate artwork, or add store listings.',
  'Design files are added in the ShelfMerch swag editor.',
].join(' ');

export const COLLECTION_EXECUTE_DRAFT_DESCRIPTION = [
  'Save the draft collection from shops_prepare_collection_draft.',
  'Requires the confirmation id and an idempotency key.',
  'The collection stays a draft and is not added to the store.',
  'A repeated name returns the original draft.',
].join(' ');

export const COLLECTION_PREPARE_PUBLISH_DESCRIPTION = [
  'Preview which products will become visible when a collection is published to a store.',
  'Company admins only. Publishing requires a design that already exists.',
  'Nothing is published by this preview.',
].join(' ');

export const COLLECTION_EXECUTE_PUBLISH_DESCRIPTION = [
  'Publish the collection from shops_prepare_collection_publish.',
  'Requires the confirmation id and an idempotency key.',
  'Adds only that collection\'s products to the store.',
  'A retry does not duplicate the collection or its listings.',
].join(' ');

const productPreviewSchema = z.object({
  catalogProductId: z.string(),
  name: z.string(),
  listingKey: z.string().optional(),
});

export const collectionPrepareDraftInputSchema = draftSchema;
export const collectionExecuteDraftInputSchema = draftSchema.extend({
  confirmationId: z.string().trim().min(20).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
});
export const collectionPrepareDraftOutputSchema = z.object({
  confirmationId: z.string(),
  expiresAt: z.string(),
  preview: z.object({
    action: z.enum(['create', 'reuse']),
    name: z.string(),
    shopId: z.string(),
    status: z.literal('draft'),
    products: z.array(productPreviewSchema),
    designReady: z.boolean(),
  }),
});
export const collectionExecuteDraftOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  shopId: z.string(),
  productCount: z.number().int(),
  published: z.boolean(),
});
export const collectionPreparePublishInputSchema = publishSchema;
export const collectionExecutePublishInputSchema = publishSchema.extend({
  confirmationId: z.string().trim().min(20).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
});
export const collectionPreparePublishOutputSchema = z.object({
  confirmationId: z.string(),
  expiresAt: z.string(),
  preview: z.object({
    collectionId: z.string(),
    shopId: z.string(),
    becomingVisible: z.array(productPreviewSchema),
    alreadyVisible: z.array(productPreviewSchema),
  }),
});
export const collectionExecutePublishOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  shopId: z.string(),
  visibleProducts: z.array(productPreviewSchema),
});

function invalid(message = 'Collection details are not valid') {
  return new ApiError(400, message, 'VALIDATION');
}

function businessInput(input) {
  if (!input || typeof input !== 'object') return {};
  const { confirmationId: _confirmationId, idempotencyKey: _idempotencyKey, ...rest } = input;
  return rest;
}

function assertAdmin(actor) {
  if (!ROLES.has(actor?.user?.role)) throw new ForbiddenError('Store collections require a company admin');
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function nameKey(name) {
  return `collection:${normalizeName(name)}`;
}

let claimsReady;
function ensureClaims() {
  claimsReady ??= McpCollectionClaim.syncIndexes();
  return claimsReady;
}

function normalizeShopName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function resolveShop(tenantId, selector) {
  if (selector.shopId) {
    const shop = await Shop.findOne({ _id: selector.shopId, tenantId });
    if (!shop) throw new NotFoundError('Store not found');
    if (selector.shopName && normalizeShopName(shop.name) !== normalizeShopName(selector.shopName)) {
      throw new ApiError(400, 'Store id and name do not match', 'VALIDATION');
    }
    return shop;
  }
  const wanted = normalizeShopName(selector.shopName);
  const rows = await Shop.find({ tenantId }).sort({ createdAt: 1 });
  const matches = rows.filter((row) => normalizeShopName(row.name) === wanted);
  if (!matches.length) throw new NotFoundError('Store not found');
  if (matches.length > 1) {
    const choices = matches.map((row) => `${row.name} (${row._id})`).join(', ');
    throw new ApiError(
      409,
      `Multiple stores match "${selector.shopName}". Choose one store id: ${choices}`,
      'SHOP_AMBIGUOUS',
    );
  }
  return matches[0];
}

async function loadShop(tenantId, shopId) {
  return resolveShop(tenantId, { shopId });
}

function shopSelector(input) {
  return {
    ...(input.shopId ? { shopId: input.shopId } : {}),
    ...(input.shopName ? { shopName: String(input.shopName).trim() } : {}),
  };
}

async function loadProducts(ids) {
  const unique = [...new Set(ids.map(String))];
  if (unique.length !== ids.length) throw invalid('Each catalog product can be added once');
  const products = await CatalogProduct.find({ _id: { $in: unique } }).select('name brand group status basePriceInr').lean();
  if (products.length !== unique.length) throw new NotFoundError('A catalog product was not found');
  if (products.some((product) => product.status && product.status !== 'active')) {
    throw new ApiError(422, 'A catalog product is not available', 'PRODUCT_UNAVAILABLE');
  }
  const byId = new Map(products.map((product) => [String(product._id), product]));
  return unique.map((id) => byId.get(id));
}

function designReady(collection) {
  if (String(collection.artworkUrl || '').trim()) return true;
  const refs = collection.productRefs || [];
  return refs.length > 0 && refs.every((ref) => ref.mockupUrl || ref.designOnlyImageUrl);
}

async function artworkFromReference(tenantId, artworkCollectionId, products) {
  if (!artworkCollectionId) return { artworkUrl: '', refs: new Map() };
  const source = await Collection.findOne({ _id: artworkCollectionId, tenantId });
  if (!source) throw new NotFoundError('Artwork collection not found');
  if (!designReady(source)) {
    throw new ApiError(422, 'Add the design in the ShelfMerch swag editor before using it', 'DESIGN_REQUIRED');
  }
  const refs = new Map();
  for (const ref of source.productRefs || []) {
    refs.set(String(ref.catalogProductId), ref);
  }
  for (const product of products) {
    if (!refs.has(String(product._id)) && !source.artworkUrl) {
      throw new ApiError(422, 'That artwork does not cover every selected product', 'DESIGN_REQUIRED');
    }
  }
  return { artworkUrl: source.artworkUrl || '', refs };
}

function productRefsFor(products, artwork) {
  return products.map((product) => {
    const existing = artwork.refs.get(String(product._id));
    return {
      catalogProductId: product._id,
      brand: product.brand || '',
      name: product.name,
      group: product.group || '',
      mockupUrl: existing?.mockupUrl || '',
      designOnlyImageUrl: existing?.designOnlyImageUrl || '',
      placement: existing?.placement || null,
      placements: existing?.placements || [],
    };
  });
}

async function matchingDraft(tenantId, input, products) {
  const wanted = products.map((product) => String(product._id)).join(',');
  const rows = await Collection.find({ tenantId, name: input.name.trim(), status: 'draft' });
  return rows.find((row) => {
    const ids = (row.productRefs || []).map((ref) => String(ref.catalogProductId)).join(',');
    return ids === wanted && !row.shopIds?.length && !row.shopId;
  }) || null;
}

function presentDraft(collection, shopId) {
  return {
    id: String(collection._id),
    name: collection.name,
    status: collection.status,
    shopId: String(shopId),
    productCount: collection.productRefs?.length || 0,
    published: isCollectionLinkedToShop(collection, shopId),
  };
}

async function saveDraft(actor, input) {
  await ensureClaims();
  const tenantId = actor.tenant._id;
  assertAdmin(actor);
  const shop = await resolveShop(tenantId, shopSelector(input));
  const products = await loadProducts(input.catalogProductIds);
  const artwork = await artworkFromReference(tenantId, input.artworkCollectionId, products);
  const existing = await matchingDraft(tenantId, input, products);
  if (existing) return presentDraft(existing, shop._id);
  const key = nameKey(input.name);
  let claim = await McpCollectionClaim.findOne({ tenantId, logicalKey: key });
  if (!claim) {
    try {
      claim = await McpCollectionClaim.create({ tenantId, logicalKey: key });
    } catch (error) {
      if (error?.code !== 11000 && error?.cause?.code !== 11000) throw error;
      claim = await McpCollectionClaim.findOne({ tenantId, logicalKey: key });
    }
  }
  if (claim?.collectionId) {
    const linked = await Collection.findOne({ _id: claim.collectionId, tenantId });
    if (linked?.status === 'draft') {
      const wanted = products.map((product) => String(product._id)).join(',');
      const ids = (linked.productRefs || []).map((ref) => String(ref.catalogProductId)).join(',');
      if (ids === wanted) return presentDraft(linked, shop._id);
    }
    if (linked) throw new ApiError(409, 'A collection with this name already exists', 'COLLECTION_EXISTS');
  }
  const collection = await Collection.create({
    tenantId,
    shopId: null,
    shopIds: [],
    code: `C${crypto.randomInt(100_000_000, 999_999_999)}`,
    name: input.name.trim(),
    productRefs: productRefsFor(products, artwork),
    artworkUrl: artwork.artworkUrl,
    status: 'draft',
    createdBy: actor.user.userId,
    isShopSpecific: false,
  });
  await McpCollectionClaim.updateOne({ _id: claim._id, tenantId }, { $set: { collectionId: collection._id } });
  await writeAudit({
    tenantId,
    req: { tenantId, user: { userId: actor.user.userId, role: actor.user.role } },
    action: 'collection.draft',
    entityType: 'Collection',
    entityId: collection._id,
    after: { name: collection.name, status: collection.status, productCount: collection.productRefs.length },
  });
  return presentDraft(collection, shop._id);
}

async function draftSnapshot(tenantId, input) {
  const products = await loadProducts(input.catalogProductIds);
  const shop = await resolveShop(tenantId, shopSelector(input));
  const existing = await matchingDraft(tenantId, input, products);
  return {
    shopId: String(shop._id),
    name: normalizeName(input.name),
    products: products.map((product) => ({ id: String(product._id), name: product.name })),
    exists: Boolean(existing),
    collectionId: existing ? String(existing._id) : '',
  };
}

export async function prepareCollectionDraft({ tenantId, actorUserId, input, now }) {
  const requested = draftSchema.safeParse(businessInput(input));
  if (!requested.success) throw invalid();
  const planned = {};
  const prepared = await prepareMcpWrite({
    tenantId,
    actorUserId,
    operation: 'shops.collection_draft',
    payload: requested.data,
    now,
    authorize: async (actor) => {
      assertAdmin(actor);
      planned.products = await loadProducts(requested.data.catalogProductIds);
      planned.shop = await resolveShop(tenantId, shopSelector(requested.data));
      planned.artwork = await artworkFromReference(tenantId, requested.data.artworkCollectionId, planned.products);
      planned.existing = await matchingDraft(tenantId, requested.data, planned.products);
    },
    validate: async () => requested.data,
    resourceState: async () => draftSnapshot(tenantId, requested.data),
    summary: async () => ({
      action: 'preview',
      name: requested.data.name,
      productCount: planned.products.length,
    }),
  });
  const previewProducts = planned.products.map((product) => ({
    catalogProductId: String(product._id),
    name: product.name,
  }));
  const ready = Boolean(planned.artwork.artworkUrl) || planned.products.every((product) => planned.artwork.refs.get(String(product._id))?.mockupUrl);
  return {
    confirmationId: prepared.confirmationId,
    expiresAt: prepared.expiresAt,
    preview: {
      action: planned.existing ? 'reuse' : 'create',
      name: requested.data.name.trim(),
      shopId: String(planned.shop._id),
      status: 'draft',
      products: previewProducts,
      designReady: ready,
    },
  };
}

export async function executeCollectionDraft({
  tenantId, actorUserId, input, confirmationId, idempotencyKey, now,
}) {
  const requested = draftSchema.safeParse(businessInput(input));
  if (!requested.success) throw invalid();
  const saved = await executeMcpWrite({
    tenantId,
    actorUserId,
    operation: 'shops.collection_draft',
    payload: requested.data,
    confirmationId,
    idempotencyKey,
    now,
    authorize: async (actor) => {
      assertAdmin(actor);
      await resolveShop(tenantId, shopSelector(requested.data));
    },
    validate: async () => requested.data,
    resourceState: async () => draftSnapshot(tenantId, requested.data),
    reconcile: async () => {
      const products = await loadProducts(requested.data.catalogProductIds);
      const shop = await resolveShop(tenantId, shopSelector(requested.data));
      const existing = await matchingDraft(tenantId, requested.data, products);
      if (existing) return { outcome: 'completed', result: presentDraft(existing, shop._id) };
      const claim = await McpCollectionClaim.findOne({ tenantId, logicalKey: nameKey(requested.data.name) });
      if (claim?.collectionId) {
        const linked = await Collection.findOne({ _id: claim.collectionId, tenantId });
        if (linked?.status === 'draft') {
          const wanted = products.map((product) => String(product._id)).join(',');
          const ids = (linked.productRefs || []).map((ref) => String(ref.catalogProductId)).join(',');
          if (ids === wanted) return { outcome: 'completed', result: presentDraft(linked, shop._id) };
        }
        if (linked) return { outcome: 'uncertain' };
      }
      return { outcome: 'absent' };
    },
    execute: async (actor) => saveDraft(actor, requested.data),
  });
  return saved;
}

function visibleLists(collection, shop) {
  const active = new Set((shop.activeListingKeys || []).map(String));
  const becomingVisible = [];
  const alreadyVisible = [];
  for (const ref of collection.productRefs || []) {
    const key = listingKey(collection._id, ref.catalogProductId);
    const row = { catalogProductId: String(ref.catalogProductId), name: ref.name || '', listingKey: key };
    if (active.has(key)) alreadyVisible.push(row);
    else becomingVisible.push(row);
  }
  return { becomingVisible, alreadyVisible };
}

async function loadOwnedCollection(tenantId, collectionId) {
  const collection = await Collection.findOne({ _id: collectionId, tenantId });
  if (!collection) throw new NotFoundError('Collection not found');
  if (collection.status === 'archived') throw new ApiError(422, 'This collection is archived', 'COLLECTION_ARCHIVED');
  return collection;
}

function assertCanPublish(collection) {
  if (!designReady(collection)) {
    throw new ApiError(422, 'Add the design in the ShelfMerch swag editor before publishing', 'DESIGN_REQUIRED');
  }
}

async function assertNoDuplicateListing(tenantId, shop, collection) {
  const ids = (collection.productRefs || []).map((ref) => ref.catalogProductId).filter(Boolean);
  if (!ids.length) throw invalid();
  const others = await Collection.find({
    tenantId,
    _id: { $ne: collection._id },
    status: { $ne: 'archived' },
    'productRefs.catalogProductId': { $in: ids },
  });
  for (const other of others) {
    if (!isCollectionLinkedToShop(other, shop._id)) continue;
    const overlap = (other.productRefs || []).some((ref) => ids.map(String).includes(String(ref.catalogProductId)));
    if (overlap) throw new ApiError(409, 'A selected product is already published in this store', 'PRODUCT_ALREADY_IN_SHOP');
  }
}

async function publishSnapshot(tenantId, input) {
  const collection = await loadOwnedCollection(tenantId, input.collectionId);
  const shop = await resolveShop(tenantId, shopSelector(input));
  return {
    collectionId: String(collection._id),
    status: collection.status,
    updatedAt: new Date(collection.updatedAt).toISOString(),
    products: (collection.productRefs || []).map((ref) => String(ref.catalogProductId)),
    shopUpdatedAt: new Date(shop.updatedAt).toISOString(),
    activeCount: (shop.activeListingKeys || []).length,
  };
}

async function presentPublished(tenantId, collectionId, shopId) {
  const collection = await loadOwnedCollection(tenantId, collectionId);
  const shop = await loadShop(tenantId, shopId);
  const keys = new Set(listingKeysFromCollection(collection));
  const visibleProducts = (collection.productRefs || [])
    .filter((ref) => keys.has(listingKey(collection._id, ref.catalogProductId)))
    .filter((ref) => (shop.activeListingKeys || []).map(String).includes(listingKey(collection._id, ref.catalogProductId)))
    .map((ref) => ({
      catalogProductId: String(ref.catalogProductId),
      name: ref.name || '',
      listingKey: listingKey(collection._id, ref.catalogProductId),
    }));
  return {
    id: String(collection._id),
    name: collection.name,
    status: collection.status,
    shopId: String(shop._id),
    visibleProducts,
  };
}

export async function prepareCollectionPublish({ tenantId, actorUserId, input, now }) {
  const requested = publishSchema.safeParse(businessInput(input));
  if (!requested.success) throw invalid();
  const planned = {};
  const prepared = await prepareMcpWrite({
    tenantId,
    actorUserId,
    operation: 'shops.collection_publish',
    payload: requested.data,
    now,
    authorize: async (actor) => {
      assertAdmin(actor);
      planned.collection = await loadOwnedCollection(tenantId, requested.data.collectionId);
      planned.shop = await resolveShop(tenantId, shopSelector(requested.data));
      assertCanPublish(planned.collection);
      if (!isCollectionLinkedToShop(planned.collection, planned.shop._id)) {
        await assertNoDuplicateListing(tenantId, planned.shop, planned.collection);
      }
    },
    validate: async () => requested.data,
    resourceState: async () => publishSnapshot(tenantId, requested.data),
    summary: async () => ({
      action: 'preview',
      collectionId: requested.data.collectionId,
      shopId: String(planned.shop._id),
    }),
  });
  const lists = visibleLists(planned.collection, planned.shop);
  return {
    confirmationId: prepared.confirmationId,
    expiresAt: prepared.expiresAt,
    preview: {
      collectionId: String(planned.collection._id),
      shopId: String(planned.shop._id),
      becomingVisible: lists.becomingVisible,
      alreadyVisible: lists.alreadyVisible,
    },
  };
}

export async function executeCollectionPublish({
  tenantId, actorUserId, input, confirmationId, idempotencyKey, now,
}) {
  const requested = publishSchema.safeParse(businessInput(input));
  if (!requested.success) throw invalid();
  return executeMcpWrite({
    tenantId,
    actorUserId,
    operation: 'shops.collection_publish',
    payload: requested.data,
    confirmationId,
    idempotencyKey,
    now,
    authorize: async (actor) => {
      assertAdmin(actor);
      const collection = await loadOwnedCollection(tenantId, requested.data.collectionId);
      assertCanPublish(collection);
    },
    validate: async () => requested.data,
    resourceState: async () => publishSnapshot(tenantId, requested.data),
    reconcile: async () => {
      const collection = await Collection.findOne({ _id: requested.data.collectionId, tenantId });
      const shop = await resolveShop(tenantId, shopSelector(requested.data)).catch(() => null);
      if (!collection || !shop) return { outcome: 'uncertain' };
      const keys = listingKeysFromCollection(collection);
      const active = new Set((shop.activeListingKeys || []).map(String));
      const linked = isCollectionLinkedToShop(collection, shop._id) && keys.every((key) => active.has(key));
      if (linked && collection.status === 'ready') {
        return { outcome: 'completed', result: await presentPublished(tenantId, collection._id, shop._id) };
      }
      return { outcome: 'absent' };
    },
    execute: async (actor) => {
      const collection = await loadOwnedCollection(tenantId, requested.data.collectionId);
      const shop = await resolveShop(tenantId, shopSelector(requested.data));
      assertCanPublish(collection);
      const before = new Set((shop.activeListingKeys || []).map(String));
      if (!isCollectionLinkedToShop(collection, shop._id)) {
        await assertNoDuplicateListing(tenantId, shop, collection);
        await publishCollectionToShop(shop._id, tenantId, collection);
      }
      const fresh = await Collection.findOne({ _id: collection._id, tenantId });
      const keys = listingKeysFromCollection(fresh);
      await Shop.updateOne(
        { _id: shop._id, tenantId },
        { $addToSet: { activeListingKeys: { $each: keys } } },
      );
      const after = await loadShop(tenantId, shop._id);
      const unrelated = [...before].filter((key) => !key.startsWith(`${collection._id}:`));
      const kept = unrelated.every((key) => (after.activeListingKeys || []).map(String).includes(key));
      if (!kept) throw new ApiError(409, 'The store changed before publishing finished', 'CONFIRMATION_STALE');
      await writeAudit({
        tenantId,
        req: { tenantId, user: { userId: actor.user.userId, role: actor.user.role } },
        action: 'collection.publish',
        entityType: 'Collection',
        entityId: fresh._id,
        after: { shopId: String(shop._id), status: fresh.status, productCount: keys.length },
      });
      return presentPublished(tenantId, fresh._id, shop._id);
    },
  });
}

function requireCaller(ctx) {
  const caller = employeeReaderFromContext(ctx);
  if (!caller.tenantId || !caller.user?.userId) {
    throw new ForbiddenError('Store collections are not available for this account');
  }
  return caller;
}

export async function prepareCollectionDraftForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return prepareCollectionDraft({ tenantId: caller.tenantId, actorUserId: caller.user.userId, input: args });
}
export async function executeCollectionDraftForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return executeCollectionDraft({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
    confirmationId: args?.confirmationId,
    idempotencyKey: args?.idempotencyKey,
  });
}
export async function prepareCollectionPublishForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return prepareCollectionPublish({ tenantId: caller.tenantId, actorUserId: caller.user.userId, input: args });
}
export async function executeCollectionPublishForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return executeCollectionPublish({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
    confirmationId: args?.confirmationId,
    idempotencyKey: args?.idempotencyKey,
  });
}

export function collectionText(output, heading) {
  const preview = output.preview;
  if (preview?.products) return [heading, `${preview.products.length} products stay in draft`, 'Confirm this preview before it expires.'].join('\n');
  if (preview?.becomingVisible) return [heading, `${preview.becomingVisible.length} products will become visible`, 'Confirm this preview before it expires.'].join('\n');
  return [heading, `${output.name} is ${output.status}`].join('\n');
}

const WRITE_ERRORS = {
  FORBIDDEN: 'You cannot change store collections.',
  NOT_FOUND: 'That store or collection was not found.',
  VALIDATION: 'Collection details are not valid.',
  PRODUCT_UNAVAILABLE: 'A catalog product is not available.',
  DESIGN_REQUIRED: 'Add the design in the ShelfMerch swag editor before publishing.',
  SHOP_AMBIGUOUS: 'Several stores match that name. Ask the user to choose one store id.',
  COLLECTION_EXISTS: 'A collection with this name already exists.',
  COLLECTION_ARCHIVED: 'This collection is archived.',
  PRODUCT_ALREADY_IN_SHOP: 'A selected product is already published in this store.',
  CONFIRMATION_STALE: 'This preview is out of date. Prepare it again.',
  CONFIRMATION_EXPIRED: 'This confirmation has expired. Prepare it again.',
  CONFIRMATION_REUSED: 'This confirmation was already used.',
  CONFIRMATION_INVALID: 'This confirmation is not valid.',
  CONFIRMATION_MISMATCH: 'This confirmation does not match the requested change.',
  IDEMPOTENCY_PAYLOAD_MISMATCH: 'This idempotency key was used for a different change.',
  IDEMPOTENT_REPLAY_IN_FLIGHT: 'This collection change is already in progress.',
  IDEMPOTENCY_RECONCILIATION_REQUIRED: 'This collection change needs to be checked before it can be retried.',
  ACTOR_INACTIVE: 'This account cannot change store collections.',
  TENANT_INACTIVE: 'This workspace cannot change store collections.',
};

export function collectionError(error, fallback) {
  return WRITE_ERRORS[error?.code] || fallback;
}
