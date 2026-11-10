import { z } from 'zod';
import { env } from '../../config/env.js';
import { ApiError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { writeAudit } from '../../services/audit.service.js';
import { objectId } from '../users/users.validation.js';
import { Shop } from '../shops/shop.model.js';
import { publishShop } from '../shops/shops.service.js';
import { employeeReaderFromContext } from './employeesRead.js';
import { executeMcpWrite, prepareMcpWrite } from './mcpWriteSafety.js';

const WRITE_ROLES = new Set(rolesForTenantArea('shops', 'write'));

const selectFields = {
  shopId: objectId.optional(),
  name: z.string().trim().min(1).max(80).optional(),
};

function hasStoreSelector(value) {
  return Boolean(value.shopId || value.name);
}

const publishFieldsSchema = z.object(selectFields).strict().refine(hasStoreSelector, {
  message: 'Provide a store id or an exact store name',
});

export const SHOPS_PREPARE_PUBLISH_DESCRIPTION = [
  'Company admins only. Entity managers cannot publish a store. Do not offer publish to an entity manager.',
  'Preview publishing one company store from draft to live without changing it.',
  'This is the MCP equivalent of the dashboard Save & Publish step after a draft store already exists.',
  'Resolve the store by id or exact name. When several stores share a name, ask the user to choose.',
  'Company admins only. Requires at least one category — the same rule as the ShelfMerch dashboard.',
  'Logo and banner are optional for publish readiness; categories are required.',
  'Collections, catalog listings, and currency stay unchanged.',
  'Ask for explicit user confirmation before shops_execute_publish. Never auto-publish after create.',
  'Returns readiness, publishing effects, and a one-use confirmation.',
].join(' ');

export const SHOPS_EXECUTE_PUBLISH_DESCRIPTION = [
  'Company admins only. Entity managers cannot publish a store, even with a confirmation id.',
  'Publish the selected store from shops_prepare_publish after the user explicitly confirmed.',
  'Requires the confirmation id and an idempotency key.',
  'Rechecks the caller, tenant, and store before going live.',
  'Publishes only that store. A repeated key returns the original result.',
  'If publish fails after draft creation, the draft remains and can be retried with a new prepare/execute.',
].join(' ');

export const shopsPreparePublishInputSchema = publishFieldsSchema;
export const shopsExecutePublishInputSchema = z.object({
  ...selectFields,
  confirmationId: z.string().trim().min(20).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
}).strict().refine(hasStoreSelector, {
  message: 'Provide a store id or an exact store name',
});

const readinessSchema = z.object({
  hasLogo: z.boolean(),
  hasCompanyEmailDomain: z.boolean(),
  hasBanner: z.boolean(),
  categoriesReady: z.boolean(),
  activeProductCount: z.number().int().nonnegative(),
});

export const shopsPreparePublishOutputSchema = z.object({
  confirmationId: z.string(),
  expiresAt: z.string(),
  preview: z.object({
    action: z.enum(['publish', 'already_live']),
    shopId: z.string(),
    name: z.string(),
    status: z.string(),
    currencyMode: z.string(),
    categories: z.array(z.string()),
    readiness: readinessSchema,
    missingRequirements: z.array(z.string()),
    effects: z.array(z.string()),
    storefrontUrl: z.string().optional(),
  }),
});

export const shopsExecutePublishOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.string(),
  currencyMode: z.string(),
  categories: z.array(z.string()),
  activeProductCount: z.number().int().nonnegative(),
  storefrontUrl: z.string().optional(),
  alreadyLive: z.boolean(),
});

function invalidDetails() {
  return new ApiError(400, 'Store details are not valid', 'VALIDATION');
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function assertShopWriter(actor) {
  if (!WRITE_ROLES.has(actor?.user?.role)) {
    throw new ForbiddenError('Publishing a store requires a company admin');
  }
}

function businessInput(input) {
  if (!input || typeof input !== 'object') return {};
  const { confirmationId: _confirmationId, idempotencyKey: _idempotencyKey, ...rest } = input;
  return rest;
}

function parsePublish(input) {
  const parsed = publishFieldsSchema.safeParse(businessInput(input));
  if (!parsed.success) throw invalidDetails();
  return {
    ...(parsed.data.shopId ? { shopId: parsed.data.shopId } : {}),
    ...(parsed.data.name ? { name: parsed.data.name.trim() } : {}),
  };
}

function activeProductCount(shop) {
  if (Array.isArray(shop.activeListingKeys) && shop.activeListingKeys.length) {
    return shop.activeListingKeys.length;
  }
  if (Array.isArray(shop.selectedCatalogProductIds)) {
    return shop.selectedCatalogProductIds.length;
  }
  return 0;
}

function hasBanner(shop) {
  const config = shop.bannerConfig;
  if (!config || typeof config !== 'object') return false;
  return Object.keys(config).some((key) => {
    const value = config[key];
    if (value == null || value === '') return false;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
  });
}

/** Match web shopStorefrontHref: /s/:slug on app hosts, vanity on production apex. */
function storefrontUrl(shop) {
  const base = String(env.CLIENT_URL || env.APP_URL || '').replace(/\/$/, '');
  const slug = String(shop.slug || '').trim();
  const pathPart = slug ? `/s/${slug}` : `/shop/${shop._id}`;
  if (!base) return pathPart;
  let hostname = '';
  try {
    hostname = new URL(base).hostname.toLowerCase();
  } catch {
    return `${base}${pathPart}`;
  }
  if (hostname === 'shelfmerch.io' || hostname === 'www.shelfmerch.io') {
    return slug ? `https://${slug}.shelfmerch.io` : `${base}/shop/${shop._id}`;
  }
  return `${base}${pathPart}`;
}

function readiness(shop) {
  const categories = [...(shop.categories || [])];
  return {
    hasLogo: Boolean(shop.logoUrl),
    hasCompanyEmailDomain: Boolean(shop.companyEmailDomain),
    hasBanner: hasBanner(shop),
    categoriesReady: categories.length > 0,
    activeProductCount: activeProductCount(shop),
  };
}

function missingRequirements(shop) {
  if ((shop.categories || []).length) return [];
  return ['Add at least one category before publishing'];
}

function publishEffects(shop) {
  const url = storefrontUrl(shop);
  if (shop.status === 'live') {
    return [
      'Store is already live',
      'Collections and catalog listings stay unchanged',
      'Currency mode stays unchanged',
      ...(url ? [`Storefront remains available at ${url}`] : []),
    ];
  }
  return [
    'Store status changes from draft to live',
    'Collections and catalog listings stay unchanged',
    `Currency mode stays ${shop.currencyMode}`,
    ...(url ? [`Public storefront becomes available at ${url}`] : ['Public storefront becomes available']),
  ];
}

function shopVersion(shop) {
  return {
    shopId: String(shop._id),
    name: shop.name,
    status: shop.status,
    currencyMode: shop.currencyMode,
    categories: [...(shop.categories || [])],
    activeListingKeys: [...(shop.activeListingKeys || [])].map(String).sort(),
    updatedAt: new Date(shop.updatedAt).toISOString(),
  };
}

function safePublished(shop, { alreadyLive = false } = {}) {
  return {
    id: String(shop._id),
    name: shop.name,
    slug: shop.slug || '',
    status: shop.status,
    currencyMode: shop.currencyMode,
    categories: [...(shop.categories || [])],
    activeProductCount: activeProductCount(shop),
    ...(storefrontUrl(shop) ? { storefrontUrl: storefrontUrl(shop) } : {}),
    alreadyLive,
  };
}

async function resolveShop(tenantId, selector) {
  if (selector.shopId) {
    const shop = await Shop.findOne({ _id: selector.shopId, tenantId });
    if (!shop) throw new NotFoundError('Store not found');
    if (selector.name && normalizeName(shop.name) !== normalizeName(selector.name)) {
      throw new ApiError(400, 'Store id and name do not match', 'VALIDATION');
    }
    return shop;
  }

  const wanted = normalizeName(selector.name);
  const rows = await Shop.find({ tenantId }).sort({ createdAt: 1 });
  const matches = rows.filter((row) => normalizeName(row.name) === wanted);
  if (!matches.length) throw new NotFoundError('Store not found');
  if (matches.length > 1) {
    const choices = matches.map((row) => `${row.name} (${row._id})`).join(', ');
    throw new ApiError(
      409,
      `Multiple stores match "${selector.name}". Choose one store id: ${choices}`,
      'SHOP_AMBIGUOUS',
    );
  }
  return matches[0];
}

function assertPublishable(shop) {
  const missing = missingRequirements(shop);
  if (missing.length && shop.status !== 'live') {
    throw new ApiError(422, missing[0], 'SHOP_NO_CATEGORIES');
  }
}

function buildPreview(shop) {
  return {
    action: shop.status === 'live' ? 'already_live' : 'publish',
    shopId: String(shop._id),
    name: shop.name,
    status: shop.status,
    currencyMode: shop.currencyMode,
    categories: [...(shop.categories || [])],
    readiness: readiness(shop),
    missingRequirements: missingRequirements(shop),
    effects: publishEffects(shop),
    ...(storefrontUrl(shop) ? { storefrontUrl: storefrontUrl(shop) } : {}),
  };
}

export async function prepareShopPublish({ tenantId, actorUserId, input, now }) {
  const requested = parsePublish(input);
  const planned = {};
  const prepared = await prepareMcpWrite({
    tenantId,
    actorUserId,
    operation: 'shops.publish',
    payload: requested,
    now,
    authorize: async (actor) => {
      assertShopWriter(actor);
      planned.shop = await resolveShop(tenantId, requested);
      assertPublishable(planned.shop);
    },
    validate: async () => {
      const shop = planned.shop || await resolveShop(tenantId, requested);
      return { shopId: String(shop._id) };
    },
    resourceState: async () => shopVersion(planned.shop || await resolveShop(tenantId, requested)),
    summary: async () => ({
      action: planned.shop?.status === 'live' ? 'already_live' : 'publish',
      shopId: String(planned.shop._id),
      name: planned.shop.name,
    }),
  });
  return {
    confirmationId: prepared.confirmationId,
    expiresAt: prepared.expiresAt,
    preview: buildPreview(planned.shop),
  };
}

export async function executeShopPublish({
  tenantId,
  actorUserId,
  input,
  confirmationId,
  idempotencyKey,
  now,
}) {
  const requested = parsePublish(input);
  const saved = await executeMcpWrite({
    tenantId,
    actorUserId,
    operation: 'shops.publish',
    payload: requested,
    confirmationId,
    idempotencyKey,
    now,
    authorize: async (actor) => {
      assertShopWriter(actor);
      const shop = await resolveShop(tenantId, requested);
      assertPublishable(shop);
    },
    validate: async () => {
      const shop = await resolveShop(tenantId, requested);
      return { shopId: String(shop._id) };
    },
    resourceState: async () => shopVersion(await resolveShop(tenantId, requested)),
    reconcile: async () => {
      const shop = await resolveShop(tenantId, requested).catch(() => null);
      if (!shop) return { outcome: 'uncertain' };
      if (shop.status === 'live') {
        return { outcome: 'completed', result: safePublished(shop, { alreadyLive: true }) };
      }
      return { outcome: 'absent' };
    },
    execute: async (actor) => {
      const before = await resolveShop(tenantId, requested);
      const listingBefore = [...(before.activeListingKeys || [])].map(String).sort();
      const currencyBefore = before.currencyMode;
      const alreadyLive = before.status === 'live';
      const shop = await publishShop({
        tenantId,
        shopId: before._id,
        actorUserId: actor.user.userId,
      });
      const fresh = await Shop.findOne({ _id: shop._id, tenantId });
      if (!fresh || fresh.status !== 'live') {
        throw new ApiError(409, 'Store publish did not complete', 'MCP_WRITE_FAILED');
      }
      const listingAfter = [...(fresh.activeListingKeys || [])].map(String).sort();
      if (JSON.stringify(listingBefore) !== JSON.stringify(listingAfter)) {
        throw new ApiError(409, 'The store catalog changed before publishing finished', 'CONFIRMATION_STALE');
      }
      if (fresh.currencyMode !== currencyBefore) {
        throw new ApiError(409, 'The store currency changed before publishing finished', 'CONFIRMATION_STALE');
      }
      await writeAudit({
        tenantId,
        req: { tenantId, user: { userId: actor.user.userId, role: actor.user.role } },
        action: 'shop.publish',
        entityType: 'Shop',
        entityId: fresh._id,
        after: { status: fresh.status, alreadyLive },
      });
      return safePublished(fresh, { alreadyLive });
    },
  });
  return saved;
}

function requireCaller(ctx) {
  const caller = employeeReaderFromContext(ctx);
  if (!caller.tenantId || !caller.user?.userId) {
    throw new ForbiddenError('Stores are not available for this account');
  }
  return caller;
}

export async function prepareShopPublishForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return prepareShopPublish({ tenantId: caller.tenantId, actorUserId: caller.user.userId, input: args });
}

export async function executeShopPublishForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return executeShopPublish({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
    confirmationId: args?.confirmationId,
    idempotencyKey: args?.idempotencyKey,
  });
}

export function shopPublishText(output, heading) {
  const preview = output.preview;
  if (preview) {
    const lines = [
      heading,
      `${preview.name} (${preview.shopId}) is ${preview.status} (${preview.currencyMode})`,
      `Active products: ${preview.readiness.activeProductCount}`,
      ...preview.effects,
    ];
    if (preview.missingRequirements.length) {
      lines.push(...preview.missingRequirements);
    }
    lines.push('Confirm this preview before it expires.');
    return lines.join('\n');
  }
  const lines = [
    heading,
    `${output.name} is ${output.status}`,
  ];
  if (output.storefrontUrl) lines.push(output.storefrontUrl);
  return lines.join('\n');
}

const PUBLISH_ERRORS = {
  FORBIDDEN: 'You cannot publish stores.',
  NOT_FOUND: 'Store not found.',
  VALIDATION: 'Store details are not valid.',
  SHOP_NO_CATEGORIES: 'Add at least one category before publishing.',
  SHOP_AMBIGUOUS: 'Several stores match that name. Ask the user to choose one store id.',
  CONFIRMATION_STALE: 'This preview is out of date. Prepare the publish again.',
  CONFIRMATION_EXPIRED: 'This confirmation has expired. Prepare the publish again.',
  CONFIRMATION_REUSED: 'This confirmation was already used.',
  CONFIRMATION_INVALID: 'This confirmation is not valid.',
  CONFIRMATION_MISMATCH: 'This confirmation does not match the requested publish.',
  IDEMPOTENCY_PAYLOAD_MISMATCH: 'This idempotency key was used for a different publish.',
  IDEMPOTENT_REPLAY_IN_FLIGHT: 'This store publish is already in progress.',
  ACTOR_INACTIVE: 'This account cannot publish stores.',
  TENANT_INACTIVE: 'This workspace cannot publish stores.',
};

export function shopPublishError(error, fallback) {
  return PUBLISH_ERRORS[error?.code] || fallback;
}
