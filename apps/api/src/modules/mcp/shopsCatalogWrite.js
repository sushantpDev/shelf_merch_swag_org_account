import { z } from 'zod';
import { ApiError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { writeAudit } from '../../services/audit.service.js';
import { Collection } from '../collections/collection.model.js';
import { collectionsForShopFilter } from '../collections/collectionQueries.js';
import { Shop } from '../shops/shop.model.js';
import { listingKey } from '../shops/listingKeys.js';
import { filterValidListingKeys, syncActiveListingKeys } from '../shops/shopCatalogSync.js';
import { employeeReaderFromContext } from './employeesRead.js';
import { executeMcpWrite, prepareMcpWrite } from './mcpWriteSafety.js';

const WRITE_ROLES = new Set(rolesForTenantArea('shops', 'write'));

const listingKeysSchema = z.array(z.string().trim().min(1).max(80)).max(500);

const catalogSchema = z.object({
  shopId: z.string().trim().regex(/^[a-fA-F0-9]{24}$/),
  activeListingKeys: listingKeysSchema,
  featuredListingKeys: listingKeysSchema,
}).strict();

export const SHOPS_PREPARE_CATALOG_DESCRIPTION = [
  'Preview which products a company store will show, hide, or feature.',
  'Company admins only. Every listing key must already belong to a published collection on that store.',
  'Featured products must also be shown. Unknown keys are rejected.',
  'Nothing is saved. Collections and catalog products are not created, published, or removed.',
  'Returns a one-use confirmation. Saving requires shops_execute_catalog_update.',
].join(' ');

export const SHOPS_EXECUTE_CATALOG_DESCRIPTION = [
  'Apply the store product visibility from shops_prepare_catalog_update.',
  'Requires the confirmation id and an idempotency key.',
  'Rechecks the caller, the store, and that every listing is still eligible.',
  'A repeated key returns the original result. A newer store change invalidates the preview.',
].join(' ');

const listingSummarySchema = z.object({
  listingKey: z.string(),
  productName: z.string(),
  collectionName: z.string(),
});

export const shopsPrepareCatalogInputSchema = catalogSchema;
export const shopsExecuteCatalogInputSchema = catalogSchema.extend({
  confirmationId: z.string().trim().min(20).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
});
export const shopsPrepareCatalogOutputSchema = z.object({
  confirmationId: z.string(),
  expiresAt: z.string(),
  preview: z.object({
    shopId: z.string(),
    version: z.string(),
    shown: z.array(listingSummarySchema),
    hidden: z.array(listingSummarySchema),
    featured: z.array(listingSummarySchema),
  }),
});
export const shopsExecuteCatalogOutputSchema = z.object({
  id: z.string(),
  activeListingKeys: z.array(z.string()),
  featuredListingKeys: z.array(z.string()),
});

function invalidDetails() {
  return new ApiError(400, 'Store listing details are not valid', 'VALIDATION');
}

function businessInput(input) {
  if (!input || typeof input !== 'object') return {};
  const { confirmationId: _confirmationId, idempotencyKey: _idempotencyKey, ...rest } = input;
  return rest;
}

function parseCatalog(input) {
  const parsed = catalogSchema.safeParse(businessInput(input));
  if (!parsed.success) throw invalidDetails();
  if (new Set(parsed.data.activeListingKeys).size !== parsed.data.activeListingKeys.length) throw invalidDetails();
  if (new Set(parsed.data.featuredListingKeys).size !== parsed.data.featuredListingKeys.length) throw invalidDetails();
  return parsed.data;
}

function assertShopWriter(actor) {
  if (!WRITE_ROLES.has(actor?.user?.role)) {
    throw new ForbiddenError('Store product changes require a company admin');
  }
}

function assertFeaturedSubset(activeListingKeys, featuredListingKeys) {
  const active = new Set(activeListingKeys);
  if (featuredListingKeys.some((key) => !active.has(key))) {
    throw new ApiError(422, 'Featured products must also be shown on the store', 'FEATURED_NOT_ACTIVE');
  }
}

async function loadShop(tenantId, shopId) {
  const shop = await Shop.findOne({ _id: shopId, tenantId });
  if (!shop) throw new NotFoundError('Store not found');
  return shop;
}

async function readyListings(shopId, tenantId) {
  const collections = await Collection.find({
    tenantId,
    status: 'ready',
    ...collectionsForShopFilter(shopId),
  }).select('name productRefs.catalogProductId productRefs.name');
  const listings = new Map();
  for (const collection of collections) {
    for (const ref of collection.productRefs || []) {
      if (!ref.catalogProductId) continue;
      const key = listingKey(collection._id, ref.catalogProductId);
      listings.set(key, {
        listingKey: key,
        productName: ref.name || '',
        collectionName: collection.name,
      });
    }
  }
  return listings;
}

async function assertEligible(shopId, tenantId, keys) {
  if (!keys.length) return new Map();
  const listings = await readyListings(shopId, tenantId);
  const accepted = await filterValidListingKeys(shopId, tenantId, keys);
  const acceptedSet = new Set(accepted);
  if (
    accepted.length !== keys.length
    || keys.some((key) => !acceptedSet.has(key) || !listings.has(key))
  ) {
    throw new ApiError(422, 'A listing key is not available on this store', 'LISTING_KEY_INVALID');
  }
  return listings;
}

function describeListing(listings, key) {
  return listings.get(key) || { listingKey: key, productName: '', collectionName: '' };
}

function shopVersion(shop) {
  return {
    shopId: String(shop._id),
    status: shop.status,
    activeListingKeys: (shop.activeListingKeys || []).map(String),
    featuredListingKeys: (shop.featuredListingKeys || []).map(String),
    updatedAt: new Date(shop.updatedAt).toISOString(),
  };
}

function sameList(left, right) {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

function safeResult(shop) {
  return {
    id: String(shop._id),
    activeListingKeys: (shop.activeListingKeys || []).map(String),
    featuredListingKeys: (shop.featuredListingKeys || []).map(String),
  };
}

async function applyVisibility(actor, requested) {
  const shop = await loadShop(actor.tenant._id, requested.shopId);
  assertFeaturedSubset(requested.activeListingKeys, requested.featuredListingKeys);
  await assertEligible(shop._id, actor.tenant._id, requested.activeListingKeys);
  shop.featuredListingKeys = requested.featuredListingKeys;
  try {
    await syncActiveListingKeys(shop, actor.tenant._id, requested.activeListingKeys);
  } catch (error) {
    if (error?.name === 'VersionError') {
      throw new ApiError(409, 'This preview is out of date', 'CONFIRMATION_STALE');
    }
    throw error;
  }
  const active = (shop.activeListingKeys || []).map(String);
  const featured = (shop.featuredListingKeys || []).map(String);
  if (!sameList(active, requested.activeListingKeys) || !sameList(featured, requested.featuredListingKeys)) {
    throw new ApiError(409, 'The store listings changed before they could be saved', 'CONFIRMATION_STALE');
  }
  await writeAudit({
    tenantId: actor.tenant._id,
    req: { tenantId: actor.tenant._id, user: { userId: actor.user.userId, role: actor.user.role } },
    action: 'shop.catalog_visibility',
    entityType: 'Shop',
    entityId: shop._id,
    after: { activeCount: active.length, featuredCount: featured.length },
  });
  return safeResult(shop);
}

export async function prepareShopCatalogUpdate({ tenantId, actorUserId, input, now }) {
  const requested = parseCatalog(input);
  const planned = {};
  const prepared = await prepareMcpWrite({
    tenantId,
    actorUserId,
    operation: 'shops.catalog_update',
    payload: requested,
    now,
    authorize: async (actor) => {
      assertShopWriter(actor);
      assertFeaturedSubset(requested.activeListingKeys, requested.featuredListingKeys);
      planned.shop = await loadShop(tenantId, requested.shopId);
      planned.listings = await assertEligible(planned.shop._id, tenantId, requested.activeListingKeys);
    },
    validate: async () => requested,
    resourceState: async () => shopVersion(await loadShop(tenantId, requested.shopId)),
    summary: async () => ({
      action: 'preview',
      shopId: requested.shopId,
      activeCount: requested.activeListingKeys.length,
      featuredCount: requested.featuredListingKeys.length,
    }),
  });
  const next = new Set(requested.activeListingKeys);
  return {
    confirmationId: prepared.confirmationId,
    expiresAt: prepared.expiresAt,
    preview: {
      shopId: String(planned.shop._id),
      version: new Date(planned.shop.updatedAt).toISOString(),
      shown: requested.activeListingKeys.map((key) => describeListing(planned.listings, key)),
      hidden: (planned.shop.activeListingKeys || [])
        .map(String)
        .filter((key) => !next.has(key))
        .map((key) => describeListing(planned.listings, key)),
      featured: requested.featuredListingKeys.map((key) => describeListing(planned.listings, key)),
    },
  };
}

export async function executeShopCatalogUpdate({
  tenantId,
  actorUserId,
  input,
  confirmationId,
  idempotencyKey,
  now,
}) {
  const requested = parseCatalog(input);
  return executeMcpWrite({
    tenantId,
    actorUserId,
    operation: 'shops.catalog_update',
    payload: requested,
    confirmationId,
    idempotencyKey,
    now,
    authorize: async (actor) => {
      assertShopWriter(actor);
      assertFeaturedSubset(requested.activeListingKeys, requested.featuredListingKeys);
      const shop = await loadShop(tenantId, requested.shopId);
      await assertEligible(shop._id, tenantId, requested.activeListingKeys);
    },
    validate: async () => requested,
    resourceState: async () => shopVersion(await loadShop(tenantId, requested.shopId)),
    reconcile: async () => {
      const shop = await Shop.findOne({ _id: requested.shopId, tenantId });
      if (!shop) return { outcome: 'uncertain' };
      const result = safeResult(shop);
      if (
        sameList(result.activeListingKeys, requested.activeListingKeys)
        && sameList(result.featuredListingKeys, requested.featuredListingKeys)
      ) {
        return { outcome: 'completed', result };
      }
      return { outcome: 'absent' };
    },
    execute: async (actor) => applyVisibility(actor, requested),
  });
}

function requireCaller(ctx) {
  const caller = employeeReaderFromContext(ctx);
  if (!caller.tenantId || !caller.user.userId) {
    throw new ForbiddenError('Stores are not available for this account');
  }
  return caller;
}

export async function prepareShopCatalogUpdateForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return prepareShopCatalogUpdate({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
  });
}

export async function executeShopCatalogUpdateForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return executeShopCatalogUpdate({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
    confirmationId: args?.confirmationId,
    idempotencyKey: args?.idempotencyKey,
  });
}

export function shopCatalogText(output, heading) {
  const preview = output.preview;
  if (!preview) {
    return [
      heading,
      `${output.activeListingKeys?.length || 0} shown, ${output.featuredListingKeys?.length || 0} featured`,
    ].join('\n');
  }
  const lines = [
    heading,
    `Show: ${preview.shown.map((item) => item.productName || item.listingKey).join(', ') || 'none'}`,
    `Hide: ${preview.hidden.map((item) => item.productName || item.listingKey).join(', ') || 'none'}`,
    `Feature: ${preview.featured.map((item) => item.productName || item.listingKey).join(', ') || 'none'}`,
  ];
  if (output.confirmationId) lines.push('Confirm this preview before it expires.');
  return lines.join('\n');
}

const WRITE_ERRORS = {
  FORBIDDEN: 'You cannot change store products.',
  NOT_FOUND: 'Store not found.',
  VALIDATION: 'Store listing details are not valid.',
  LISTING_KEY_INVALID: 'A listing key is not available on this store.',
  FEATURED_NOT_ACTIVE: 'Featured products must also be shown on the store.',
  CONFIRMATION_STALE: 'This preview is out of date. Prepare the change again.',
  CONFIRMATION_EXPIRED: 'This confirmation has expired. Prepare the change again.',
  CONFIRMATION_REUSED: 'This confirmation was already used.',
  CONFIRMATION_INVALID: 'This confirmation is not valid.',
  CONFIRMATION_MISMATCH: 'This confirmation does not match the requested change.',
  IDEMPOTENCY_PAYLOAD_MISMATCH: 'This idempotency key was used for a different change.',
  IDEMPOTENT_REPLAY_IN_FLIGHT: 'This store change is already in progress.',
  ACTOR_INACTIVE: 'This account cannot change stores.',
  TENANT_INACTIVE: 'This workspace cannot change stores.',
};

export function shopCatalogError(error, fallback) {
  return WRITE_ERRORS[error?.code] || fallback;
}
