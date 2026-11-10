import { z } from 'zod';
import { ApiError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { writeAudit } from '../../services/audit.service.js';
import { objectId } from '../users/users.validation.js';
import { Shop } from '../shops/shop.model.js';
import { updateShop } from '../shops/shops.service.js';
import {
  listStoreBuilderCategories,
  resolveStoreCategoryLabels,
} from '../shops/storeBuilderCategories.js';
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

const categoriesInputSchema = z.object({
  ...selectFields,
  categories: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
}).strict().refine(hasStoreSelector, {
  message: 'Provide a store id or an exact store name',
});

export const SHOPS_GET_CATEGORIES_DESCRIPTION = [
  'List suggested shop-builder category presets and the categories currently selected on a store.',
  'Resolve the store by id or exact name. Company admins only.',
  'Presets match the ShelfMerch shop builder chips. Selected values may also include custom labels.',
].join(' ');

export const SHOPS_PREPARE_CATEGORIES_DESCRIPTION = [
  'Preview replacing the selected categories on one company store without saving.',
  'Pass suggested preset names (for example Merch) or custom labels, matching dashboard updateShop rules.',
  'Suggested names are matched case-insensitively. Duplicates after normalization are rejected.',
  'Company admins only. Name, currency, branding, collections, and catalog listings stay unchanged.',
  'Returns a one-use confirmation. Saving requires shops_execute_categories_update.',
].join(' ');

export const SHOPS_EXECUTE_CATEGORIES_DESCRIPTION = [
  'Apply the category change from shops_prepare_categories_update.',
  'Requires the confirmation id and an idempotency key.',
  'Rechecks the caller, tenant, and store before writing.',
  'A repeated key returns the original result.',
].join(' ');

export const shopsGetCategoriesInputSchema = z.object(selectFields).strict().refine(hasStoreSelector, {
  message: 'Provide a store id or an exact store name',
});

export const shopsGetCategoriesOutputSchema = z.object({
  shopId: z.string(),
  name: z.string(),
  status: z.string(),
  selectedCategories: z.array(z.string()),
  availableCategories: z.array(z.object({ label: z.string(), suggested: z.boolean().optional() })),
  publishReady: z.boolean(),
});

export const shopsPrepareCategoriesInputSchema = categoriesInputSchema;
export const shopsExecuteCategoriesInputSchema = z.object({
  ...selectFields,
  categories: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
  confirmationId: z.string().trim().min(20).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
}).strict().refine(hasStoreSelector, {
  message: 'Provide a store id or an exact store name',
});

export const shopsPrepareCategoriesOutputSchema = z.object({
  confirmationId: z.string(),
  expiresAt: z.string(),
  preview: z.object({
    shopId: z.string(),
    name: z.string(),
    status: z.string(),
    from: z.array(z.string()),
    to: z.array(z.string()),
    availableCategories: z.array(z.object({ label: z.string(), suggested: z.boolean().optional() })),
    publishReadyAfter: z.boolean(),
  }),
});

export const shopsExecuteCategoriesOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  categories: z.array(z.string()),
  publishReady: z.boolean(),
});

function invalidDetails() {
  return new ApiError(400, 'Store category details are not valid', 'VALIDATION');
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function assertShopWriter(actor) {
  if (!WRITE_ROLES.has(actor?.user?.role)) {
    throw new ForbiddenError('Store category changes require a company admin');
  }
}

function businessInput(input) {
  if (!input || typeof input !== 'object') return {};
  const { confirmationId: _c, idempotencyKey: _k, ...rest } = input;
  return rest;
}

function parseSelector(input) {
  const parsed = z.object(selectFields).strict().refine(hasStoreSelector, {
    message: 'Provide a store id or an exact store name',
  }).safeParse(businessInput(input));
  if (!parsed.success) throw invalidDetails();
  return {
    ...(parsed.data.shopId ? { shopId: parsed.data.shopId } : {}),
    ...(parsed.data.name ? { name: parsed.data.name.trim() } : {}),
  };
}

function parseCategoriesUpdate(input) {
  const parsed = categoriesInputSchema.safeParse(businessInput(input));
  if (!parsed.success) throw invalidDetails();
  return {
    ...(parsed.data.shopId ? { shopId: parsed.data.shopId } : {}),
    ...(parsed.data.name ? { name: parsed.data.name.trim() } : {}),
    categories: parsed.data.categories,
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

function shopVersion(shop) {
  return {
    shopId: String(shop._id),
    name: shop.name,
    status: shop.status,
    categories: [...(shop.categories || [])],
    currencyMode: shop.currencyMode,
    logoUrl: shop.logoUrl || '',
    activeListingKeys: [...(shop.activeListingKeys || [])].map(String).sort(),
    updatedAt: new Date(shop.updatedAt).toISOString(),
  };
}

function presentCategories(shop) {
  const categories = [...(shop.categories || [])];
  return {
    id: String(shop._id),
    name: shop.name,
    status: shop.status,
    categories,
    publishReady: categories.length > 0,
  };
}

function canonicalPayload(shopId, categories) {
  return { shopId: String(shopId), categories: [...categories] };
}

export async function getShopCategories({ tenantId, actorUserId, input }) {
  const selector = parseSelector(input);
  const { User } = await import('../users/user.model.js');
  const { RoleAssignment } = await import('../roles/roleAssignment.model.js');
  const user = await User.findOne({ _id: actorUserId, tenantId });
  const assignment = user
    ? await RoleAssignment.findOne({ userId: user._id, tenantId })
    : null;
  if (!user || user.status !== 'active' || !WRITE_ROLES.has(assignment?.role)) {
    throw new ForbiddenError('Store categories require a company admin');
  }
  const shop = await resolveShop(tenantId, selector);
  const categories = [...(shop.categories || [])];
  return {
    shopId: String(shop._id),
    name: shop.name,
    status: shop.status,
    selectedCategories: categories,
    availableCategories: listStoreBuilderCategories(),
    publishReady: categories.length > 0,
  };
}

export async function prepareShopCategoriesUpdate({ tenantId, actorUserId, input, now }) {
  const requested = parseCategoriesUpdate(input);
  const planned = {};
  const categories = resolveStoreCategoryLabels(requested.categories);
  const prepared = await prepareMcpWrite({
    tenantId,
    actorUserId,
    operation: 'shops.categories_update',
    payload: requested,
    now,
    authorize: async (actor) => {
      assertShopWriter(actor);
      planned.shop = await resolveShop(tenantId, requested);
    },
    validate: async () => canonicalPayload(planned.shop._id, categories),
    resourceState: async () => shopVersion(planned.shop),
    summary: async () => ({
      action: 'preview',
      shopId: String(planned.shop._id),
      categories,
    }),
  });
  const from = [...(planned.shop.categories || [])];
  return {
    confirmationId: prepared.confirmationId,
    expiresAt: prepared.expiresAt,
    preview: {
      shopId: String(planned.shop._id),
      name: planned.shop.name,
      status: planned.shop.status,
      from,
      to: categories,
      availableCategories: listStoreBuilderCategories(),
      publishReadyAfter: categories.length > 0,
    },
  };
}

export async function executeShopCategoriesUpdate({
  tenantId,
  actorUserId,
  input,
  confirmationId,
  idempotencyKey,
  now,
}) {
  const requested = parseCategoriesUpdate(input);
  const categories = resolveStoreCategoryLabels(requested.categories);
  const saved = await executeMcpWrite({
    tenantId,
    actorUserId,
    operation: 'shops.categories_update',
    payload: requested,
    confirmationId,
    idempotencyKey,
    now,
    authorize: async (actor) => {
      assertShopWriter(actor);
      await resolveShop(tenantId, requested);
    },
    validate: async () => {
      const shop = await resolveShop(tenantId, requested);
      return canonicalPayload(shop._id, categories);
    },
    resourceState: async () => shopVersion(await resolveShop(tenantId, requested)),
    reconcile: async () => {
      const shop = await resolveShop(tenantId, requested).catch(() => null);
      if (!shop) return { outcome: 'uncertain' };
      const current = [...(shop.categories || [])];
      if (JSON.stringify(current) === JSON.stringify(categories)) {
        return { outcome: 'completed', result: presentCategories(shop) };
      }
      return { outcome: 'absent' };
    },
    execute: async (actor) => {
      const before = await resolveShop(tenantId, requested);
      const listingBefore = [...(before.activeListingKeys || [])].map(String).sort();
      const currencyBefore = before.currencyMode;
      const nameBefore = before.name;
      const logoBefore = before.logoUrl || '';
      const { shop } = await updateShop({
        tenantId,
        shopId: before._id,
        patch: { categories },
      });
      const fresh = await Shop.findOne({ _id: shop._id, tenantId });
      if (!fresh) throw new ApiError(409, 'Store category update did not complete', 'MCP_WRITE_FAILED');
      const listingAfter = [...(fresh.activeListingKeys || [])].map(String).sort();
      if (JSON.stringify(listingBefore) !== JSON.stringify(listingAfter)) {
        throw new ApiError(409, 'The store catalog changed before categories were saved', 'CONFIRMATION_STALE');
      }
      if (fresh.currencyMode !== currencyBefore || fresh.name !== nameBefore || (fresh.logoUrl || '') !== logoBefore) {
        throw new ApiError(409, 'Unrelated store fields changed before categories were saved', 'CONFIRMATION_STALE');
      }
      await writeAudit({
        tenantId,
        req: { tenantId, user: { userId: actor.user.userId, role: actor.user.role } },
        action: 'shop.update',
        entityType: 'Shop',
        entityId: fresh._id,
        after: { categories: [...(fresh.categories || [])] },
      });
      return presentCategories(fresh);
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

export async function getShopCategoriesForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return getShopCategories({ tenantId: caller.tenantId, actorUserId: caller.user.userId, input: args });
}

export async function prepareShopCategoriesUpdateForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return prepareShopCategoriesUpdate({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
  });
}

export async function executeShopCategoriesUpdateForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return executeShopCategoriesUpdate({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
    confirmationId: args?.confirmationId,
    idempotencyKey: args?.idempotencyKey,
  });
}

export function shopCategoriesText(output, heading) {
  if (output.availableCategories && output.selectedCategories) {
    return [
      heading,
      `${output.name} (${output.shopId}) is ${output.status}`,
      `Selected: ${output.selectedCategories.join(', ') || '(none)'}`,
      `Available: ${output.availableCategories.map((row) => row.label).join(', ')}`,
      output.publishReady ? 'Ready for store publish.' : 'Add at least one category before publishing.',
    ].join('\n');
  }
  if (output.preview) {
    return [
      heading,
      `${output.preview.name}: ${output.preview.from.join(', ') || '(none)'} -> ${output.preview.to.join(', ')}`,
      'Confirm this preview before it expires.',
    ].join('\n');
  }
  return [
    heading,
    `${output.name} categories: ${output.categories.join(', ')}`,
    output.publishReady ? 'Ready for store publish.' : 'Add at least one category before publishing.',
  ].join('\n');
}

const CATEGORY_ERRORS = {
  FORBIDDEN: 'You cannot change store categories.',
  NOT_FOUND: 'Store not found.',
  VALIDATION: 'Store category details are not valid.',
  CATEGORY_REQUIRED: 'Add at least one store category.',
  CATEGORY_DUPLICATE: 'Remove duplicate categories and try again.',
  SHOP_AMBIGUOUS: 'Several stores match that name. Ask the user to choose one store id.',
  CONFIRMATION_STALE: 'This preview is out of date. Prepare the category change again.',
  CONFIRMATION_EXPIRED: 'This confirmation has expired. Prepare the category change again.',
  CONFIRMATION_REUSED: 'This confirmation was already used.',
  CONFIRMATION_INVALID: 'This confirmation is not valid.',
  CONFIRMATION_MISMATCH: 'This confirmation does not match the requested category change.',
  IDEMPOTENCY_PAYLOAD_MISMATCH: 'This idempotency key was used for a different category change.',
  IDEMPOTENT_REPLAY_IN_FLIGHT: 'This category change is already in progress.',
  ACTOR_INACTIVE: 'This account cannot change store categories.',
  TENANT_INACTIVE: 'This workspace cannot change store categories.',
};

export function shopCategoriesError(error, fallback) {
  return CATEGORY_ERRORS[error?.code] || fallback;
}