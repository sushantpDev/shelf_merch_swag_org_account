import { z } from 'zod';
import { ApiError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { objectId } from '../users/users.validation.js';
import { Shop } from '../shops/shop.model.js';
import { listShops as listShopsService, getShop as getShopService } from '../shops/shops.service.js';
import { employeeReaderFromContext } from './employeesRead.js';

const READ_ROLES = new Set(rolesForTenantArea('shops', 'read'));

export const SHOPS_LIST_DESCRIPTION = [
  'List company stores in this workspace.',
  'Company admins and department managers can read stores.',
  'Returns id, name, slug, status (draft or live), currency, categories, branding flags, and active product count.',
  'Use this to resume an unfinished draft store before publishing.',
].join(' ');

export const SHOPS_GET_DESCRIPTION = [
  'Get one company store by id or exact name.',
  'When several stores share a name, ask the user to choose a store id.',
  'Returns draft/live status, currency, categories, logo/banner readiness, and whether the store can be published.',
  'Company admins and department managers can read stores.',
].join(' ');

export const shopsListInputSchema = z.object({
  status: z.enum(['draft', 'live']).optional(),
}).strict();

export const shopsGetInputSchema = z.object({
  shopId: objectId.optional(),
  name: z.string().trim().min(1).max(80).optional(),
}).strict().refine((value) => Boolean(value.shopId || value.name), {
  message: 'Provide a store id or an exact store name',
});

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

const shopRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.string(),
  currencyMode: z.string(),
  categories: z.array(z.string()),
  logoUrl: z.string(),
  hasLogo: z.boolean(),
  hasBanner: z.boolean(),
  bannerConfig: z.record(z.string()),
  activeProductCount: z.number().int().nonnegative(),
  publishReady: z.boolean(),
});

export const shopsListOutputSchema = z.object({
  shops: z.array(shopRowSchema),
});

export const shopsGetOutputSchema = shopRowSchema;

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
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

function presentShop(shop) {
  const categories = [...(shop.categories || [])];
  const logoUrl = shop.logoUrl || '';
  const bannerConfig = { ...(shop.bannerConfig || {}) };
  return {
    id: String(shop._id),
    name: shop.name,
    slug: shop.slug || '',
    status: shop.status,
    currencyMode: shop.currencyMode,
    categories,
    logoUrl,
    hasLogo: Boolean(logoUrl),
    hasBanner: hasBanner(shop),
    bannerConfig,
    activeProductCount: activeProductCount(shop),
    publishReady: categories.length > 0,
  };
}

async function assertShopReader(tenantId, actorUserId) {
  const { User } = await import('../users/user.model.js');
  const { RoleAssignment } = await import('../roles/roleAssignment.model.js');
  const user = await User.findOne({ _id: actorUserId, tenantId });
  const assignment = user
    ? await RoleAssignment.findOne({ userId: user._id, tenantId })
    : null;
  if (!user || user.status !== 'active' || !READ_ROLES.has(assignment?.role)) {
    throw new ForbiddenError('Stores are not available for this account');
  }
  return { user, role: assignment.role };
}

async function resolveShop(tenantId, { shopId, name }) {
  if (shopId) {
    const shop = await getShopService({ tenantId, shopId });
    if (name && normalizeName(shop.name) !== normalizeName(name)) {
      throw new ApiError(400, 'Store id and name do not match', 'VALIDATION');
    }
    return shop;
  }
  const wanted = normalizeName(name);
  const rows = await Shop.find({ tenantId }).sort({ createdAt: 1 });
  const matches = rows.filter((row) => normalizeName(row.name) === wanted);
  if (!matches.length) throw new NotFoundError('Store not found');
  if (matches.length > 1) {
    const choices = matches.map((row) => `${row.name} (${row._id})`).join(', ');
    throw new ApiError(
      409,
      `Multiple stores match "${name}". Choose one store id: ${choices}`,
      'SHOP_AMBIGUOUS',
    );
  }
  return matches[0];
}

function requireCaller(ctx) {
  const caller = employeeReaderFromContext(ctx);
  if (!caller.tenantId || !caller.user?.userId) {
    throw new ForbiddenError('Stores are not available for this account');
  }
  return caller;
}

export async function listShops({ tenantId, actorUserId, input = {} }) {
  await assertShopReader(tenantId, actorUserId);
  const parsed = shopsListInputSchema.safeParse(input ?? {});
  if (!parsed.success) throw new ApiError(400, 'Store filter is not valid', 'VALIDATION');
  let shops = await listShopsService({ tenantId });
  if (parsed.data.status) {
    shops = shops.filter((shop) => shop.status === parsed.data.status);
  }
  return { shops: shops.map(presentShop) };
}

export async function getShop({ tenantId, actorUserId, input = {} }) {
  await assertShopReader(tenantId, actorUserId);
  const parsed = shopsGetInputSchema.safeParse(input ?? {});
  if (!parsed.success) throw new ApiError(400, 'Store details are not valid', 'VALIDATION');
  const shop = await resolveShop(tenantId, parsed.data);
  return presentShop(shop);
}

export async function listShopsForCaller(ctx, args = {}) {
  const caller = requireCaller(ctx);
  return listShops({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
  });
}

export async function getShopForCaller(ctx, args = {}) {
  const caller = requireCaller(ctx);
  return getShop({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
  });
}

export function shopsReadText(output, heading) {
  if (output?.shops) {
    if (!output.shops.length) return `${heading}\nNo stores found.`;
    return [
      heading,
      ...output.shops.map((shop) => `${shop.name} (${shop.id}) ${shop.status} ${shop.currencyMode}`),
    ].join('\n');
  }
  return [
    heading,
    `${output.name} (${output.id}) is ${output.status}`,
    `Categories: ${output.categories.join(', ') || '(none)'}`,
    output.publishReady ? 'Ready for store publish.' : 'Needs at least one category before publishing.',
  ].join('\n');
}

export function shopsReadError(error, fallback) {
  const map = {
    FORBIDDEN: 'You cannot view stores.',
    NOT_FOUND: 'Store not found.',
    VALIDATION: 'Store details are not valid.',
    SHOP_AMBIGUOUS: 'Several stores match that name. Ask the user to choose one store id.',
  };
  return map[error?.code] || fallback;
}