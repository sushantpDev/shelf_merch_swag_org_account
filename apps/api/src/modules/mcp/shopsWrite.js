import { z } from 'zod';
import { ApiError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { writeAudit } from '../../services/audit.service.js';
import { slugifyShopName } from '../../utils/shopSlug.js';
import { Shop } from '../shops/shop.model.js';
import { DEFAULT_STORE_BUILDER_CATEGORIES } from '../shops/storeBuilderCategories.js';
import { createShop, updateShop } from '../shops/shops.service.js';
import {
  consumeShopAsset,
  resolveShopAssetUrl,
} from './shopsAssetUpload.js';
import { employeeReaderFromContext } from './employeesRead.js';
import { executeMcpWrite, prepareMcpWrite } from './mcpWriteSafety.js';
import { McpShopClaim } from './mcpShopClaim.model.js';

const WRITE_ROLES = new Set(rolesForTenantArea('shops', 'write'));

/** Matches web INITIAL_SHOP_DRAFT banner (ShopBuilder default black merchandise pattern). */
export const DEFAULT_STORE_BANNER_CONFIG = Object.freeze({
  theme: 'dark',
  preset: 'solid-pattern',
});

const BANNER_THEMES = new Set(['light', 'brand', 'dark', 'blue', 'purple']);
const BANNER_PRESETS = new Set([
  'solid-pattern',
  'dia-de-los-muertos',
  'happy-passover',
  'thats-a-wrap',
  'out-of-this-world',
  'happy-summer',
  'snack-break',
  'pizza-party',
  'happy-pride',
  'mothers-day',
  'handcrafted-haven',
  'exceptional-leader',
  'stellar-performance',
  'standing-ovation',
  'surprise',
  'welcome',
  'happy-birthday',
  'happy-holi',
  'merry-christmas',
  'we-did-it',
]);

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value.replace(/^@/, ''))
  .refine(
    (value) => value === '' || /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(value),
    'Enter a valid domain like company.com',
  );

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens');

const mediaUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (value) => value === ''
      || /^https:\/\/\S+$/.test(value)
      || /^\/uploads\/\S+$/.test(value),
    'Use an https or /uploads/ media URL',
  );

const bannerConfigSchema = z.object({
  theme: z.enum(['light', 'brand', 'dark', 'blue', 'purple']).optional(),
  preset: z.string().trim().min(1).max(64).optional(),
  imageUrl: mediaUrlSchema.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.preset && !BANNER_PRESETS.has(value.preset)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Unknown banner preset', path: ['preset'] });
  }
  if (value.theme && !BANNER_THEMES.has(value.theme)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Unknown banner theme', path: ['theme'] });
  }
});

const ticketIdSchema = z.string().trim().min(8).max(80);

const textFields = {
  name: z.string().trim().min(1).max(80),
  slug: slugSchema.optional(),
  pointsConversionEnabled: z.boolean().optional(),
  companyEmailDomain: domainSchema.optional(),
  categories: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  logoUrl: mediaUrlSchema.optional(),
  bannerConfig: bannerConfigSchema.optional(),
  logoTicketId: ticketIdSchema.optional(),
  bannerTicketId: ticketIdSchema.optional(),
};

const createSchema = z.object({
  ...textFields,
  currencyMode: z.enum(['points', 'inr']).optional(),
}).strict();

const updateFieldsSchema = z.object({
  shopId: z.string().trim().regex(/^[a-fA-F0-9]{24}$/),
  ...textFields,
  name: textFields.name.optional(),
}).strict();

function hasStoreUpdate(value) {
  return ['name', 'slug', 'pointsConversionEnabled', 'companyEmailDomain', 'categories', 'logoUrl', 'bannerConfig', 'logoTicketId', 'bannerTicketId']
    .some((field) => value[field] !== undefined);
}

const updateSchema = updateFieldsSchema.refine(hasStoreUpdate, {
  message: 'Store details are not valid',
});

export const SHOPS_PREPARE_CREATE_DESCRIPTION = [
  'Company admins only. If the signed-in user is an entity manager, do not ask for a store name or currency and do not show a store creation form. Tell them a company admin has to create the store.',
  'Preview a new ShelfMerch company store without saving it.',
  'Ask a company admin for the store name and currency (points or inr).',
  'Currency cannot be changed after creation — say that clearly before confirming.',
  'Points conversion is ₹1 = 2 Points; INR mode is ₹1 = 1 Credit.',
  'When categories are omitted, applies the same default builder categories as the dashboard (Food & Beverages, Work Essentials, Merch).',
  'When bannerConfig is omitted, seeds the same default black merchandise-pattern banner as the dashboard (theme dark, preset solid-pattern).',
  'Logo and custom banner images are optional. To upload, use shops_prepare_asset_upload then pass logoTicketId / bannerTicketId; otherwise skip branding.',
  'Creating a store only saves a draft — it does not publish. After the draft exists, ask for explicit confirmation before shops_prepare_publish / shops_execute_publish.',
  'Company admins only. Returns a one-use confirmation. Saving requires shops_execute_create.',
].join(' ');

export const SHOPS_EXECUTE_CREATE_DESCRIPTION = [
  'Company admins only. Entity managers cannot create a store, even with a confirmation id.',
  'Create the draft store from shops_prepare_create.',
  'Requires the confirmation id and an idempotency key.',
  'Rechecks the caller and the store settings before writing.',
  'Seeds default categories and the default banner when those were omitted in prepare.',
  'A repeated key returns the original draft. The same store name is not created twice.',
  'Does not publish the store — publish requires a separate confirmed shops_execute_publish call.',
].join(' ');

export const SHOPS_PREPARE_UPDATE_DESCRIPTION = [
  'Company admins only. Entity managers can read stores but cannot edit them. Do not collect store changes from an entity manager.',
  'Preview a company store name, slug, domain, categories, logo, or banner change without saving it.',
  'Status and currency mode are rejected (currency is permanent after create).',
  'Optional logoTicketId / bannerTicketId from shops_prepare_asset_upload are accepted; confirmation hashing uses resolved media URLs.',
  'The confirmation is bound to the current store record and expires.',
].join(' ');

export const SHOPS_EXECUTE_UPDATE_DESCRIPTION = [
  'Company admins only. Entity managers cannot update a store, even with a confirmation id.',
  'Apply the store change from shops_prepare_update.',
  'Requires the confirmation id and an idempotency key.',
  'Rechecks permissions and the store record before writing.',
  'A changed record, an expired confirmation, or a repeated confirmation is rejected.',
].join(' ');

export const shopsPrepareCreateInputSchema = createSchema;
export const shopsExecuteCreateInputSchema = createSchema.extend({
  confirmationId: z.string().trim().min(20).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
});

const shopPresentationSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  slug: z.string(),
  status: z.string(),
  currencyMode: z.string(),
  pointsConversionEnabled: z.boolean(),
  companyEmailDomain: z.string(),
  categories: z.array(z.string()),
  logoUrl: z.string(),
  bannerConfig: z.record(z.string()),
});

export const shopsPrepareCreateOutputSchema = z.object({
  confirmationId: z.string(),
  expiresAt: z.string(),
  preview: z.object({
    action: z.enum(['create', 'reuse']),
    name: z.string(),
    slug: z.string(),
    status: z.string(),
    currencyMode: z.string(),
    pointsConversionEnabled: z.boolean(),
    companyEmailDomain: z.string(),
    categories: z.array(z.string()),
    logoUrl: z.string(),
    bannerConfig: z.record(z.string()),
    shopId: z.string().optional(),
  }),
});
export const shopsExecuteCreateOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.string(),
  currencyMode: z.string(),
  pointsConversionEnabled: z.boolean(),
  companyEmailDomain: z.string(),
  categories: z.array(z.string()),
  logoUrl: z.string(),
  bannerConfig: z.record(z.string()),
});
export const shopsPrepareUpdateInputSchema = updateSchema;
// Use extend, not and: Zod and() becomes JSON Schema allOf with
// additionalProperties:false on each half, so ChatGPT rejects confirmationId.
export const shopsExecuteUpdateInputSchema = updateFieldsSchema.extend({
  confirmationId: z.string().trim().min(20).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
}).refine(hasStoreUpdate, {
  message: 'Store details are not valid',
});
export const shopsPrepareUpdateOutputSchema = z.object({
  confirmationId: z.string(),
  expiresAt: z.string(),
  preview: z.object({
    shopId: z.string(),
    version: z.string(),
    changes: z.array(z.object({ field: z.string(), from: z.string(), to: z.string() })),
    shop: shopPresentationSchema.extend({ id: z.string() }),
  }),
});
export const shopsExecuteUpdateOutputSchema = shopsExecuteCreateOutputSchema;

let claimsReady;

function invalidDetails() {
  return new ApiError(400, 'Store details are not valid', 'VALIDATION');
}

function duplicateKey(error) {
  return error?.code === 11000 || error?.cause?.code === 11000;
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function nameKey(input) {
  return `shop:${normalizeName(input.name)}`;
}

function assertShopWriter(actor) {
  if (!WRITE_ROLES.has(actor?.user?.role)) {
    throw new ForbiddenError('Store changes require a company admin');
  }
}

function businessInput(input) {
  if (!input || typeof input !== 'object') return {};
  const { confirmationId: _confirmationId, idempotencyKey: _idempotencyKey, ...rest } = input;
  return rest;
}

function canonicalizeBannerConfig(raw, { seedDefault }) {
  if (raw === undefined) {
    return seedDefault ? { ...DEFAULT_STORE_BANNER_CONFIG } : undefined;
  }
  const theme = raw.theme || (seedDefault ? 'dark' : 'light');
  const imageUrl = raw.imageUrl || '';
  if (imageUrl) return { imageUrl, theme };
  const preset = raw.preset || '';
  if (preset) return { preset, theme };
  return theme === 'light' ? {} : { theme };
}

function bannerKey(config) {
  return JSON.stringify(config || {});
}

async function materializeCreate(tenantId, actorUserId, input) {
  const parsed = createSchema.safeParse(businessInput(input));
  if (!parsed.success) throw invalidDetails();
  const data = parsed.data;
  let logoUrl = data.logoUrl || '';
  let bannerConfig = data.bannerConfig;

  if (data.logoTicketId) {
    const resolved = await resolveShopAssetUrl({
      tenantId,
      actorUserId,
      ticketId: data.logoTicketId,
      expectedKind: 'logo',
      assetUrl: logoUrl || undefined,
      consume: false,
    });
    if (logoUrl && logoUrl !== resolved) {
      throw new ApiError(400, 'Asset reference does not match the upload ticket', 'INVALID_ASSET_URL');
    }
    logoUrl = resolved;
  }

  if (data.bannerTicketId) {
    const imageUrl = await resolveShopAssetUrl({
      tenantId,
      actorUserId,
      ticketId: data.bannerTicketId,
      expectedKind: 'banner',
      assetUrl: bannerConfig?.imageUrl || undefined,
      consume: false,
    });
    bannerConfig = {
      imageUrl,
      theme: bannerConfig?.theme || DEFAULT_STORE_BANNER_CONFIG.theme,
    };
  }

  // Ticket ids are transport-only; confirmation hash uses resolved media URLs.
  return {
    payload: {
      name: data.name.trim(),
      slug: data.slug || '',
      currencyMode: data.currencyMode || 'points',
      pointsConversionEnabled: data.pointsConversionEnabled ?? false,
      companyEmailDomain: data.companyEmailDomain || '',
      categories: data.categories === undefined ? [...DEFAULT_STORE_BUILDER_CATEGORIES] : data.categories,
      logoUrl,
      bannerConfig: canonicalizeBannerConfig(bannerConfig, { seedDefault: true }),
    },
    tickets: {
      logoTicketId: data.logoTicketId,
      bannerTicketId: data.bannerTicketId,
    },
  };
}

async function materializeUpdate(tenantId, actorUserId, input) {
  const parsed = updateSchema.safeParse(businessInput(input));
  if (!parsed.success) throw invalidDetails();
  const data = parsed.data;
  const payload = { shopId: data.shopId };
  for (const field of ['name', 'slug', 'pointsConversionEnabled', 'companyEmailDomain', 'categories']) {
    if (data[field] !== undefined) payload[field] = data[field];
  }

  let logoUrl = data.logoUrl;
  if (data.logoTicketId) {
    const resolved = await resolveShopAssetUrl({
      tenantId,
      actorUserId,
      ticketId: data.logoTicketId,
      expectedKind: 'logo',
      assetUrl: typeof logoUrl === 'string' && logoUrl ? logoUrl : undefined,
      consume: false,
    });
    if (typeof logoUrl === 'string' && logoUrl && logoUrl !== resolved) {
      throw new ApiError(400, 'Asset reference does not match the upload ticket', 'INVALID_ASSET_URL');
    }
    logoUrl = resolved;
  }
  if (logoUrl !== undefined) payload.logoUrl = logoUrl;

  let bannerConfig = data.bannerConfig;
  if (data.bannerTicketId) {
    const imageUrl = await resolveShopAssetUrl({
      tenantId,
      actorUserId,
      ticketId: data.bannerTicketId,
      expectedKind: 'banner',
      assetUrl: bannerConfig?.imageUrl || undefined,
      consume: false,
    });
    bannerConfig = {
      imageUrl,
      theme: bannerConfig?.theme || 'dark',
    };
  }
  if (bannerConfig !== undefined) {
    payload.bannerConfig = canonicalizeBannerConfig(bannerConfig, { seedDefault: false });
  }

  return {
    payload,
    tickets: {
      logoTicketId: data.logoTicketId,
      bannerTicketId: data.bannerTicketId,
    },
  };
}

async function consumeCreateTickets(tenantId, actorUserId, payload, tickets) {
  // Only consume tickets presented on this confirmed write.
  if (tickets?.logoTicketId) {
    await consumeShopAsset({
      tenantId,
      actorUserId,
      ticketId: tickets.logoTicketId,
      assetUrl: payload.logoUrl,
    });
  }
  if (tickets?.bannerTicketId) {
    await consumeShopAsset({
      tenantId,
      actorUserId,
      ticketId: tickets.bannerTicketId,
      assetUrl: payload.bannerConfig?.imageUrl,
    });
  }
}

async function consumeUpdateTickets(tenantId, actorUserId, payload, tickets) {
  if (tickets?.logoTicketId) {
    await consumeShopAsset({
      tenantId,
      actorUserId,
      ticketId: tickets.logoTicketId,
      assetUrl: payload.logoUrl,
    });
  }
  if (tickets?.bannerTicketId) {
    await consumeShopAsset({
      tenantId,
      actorUserId,
      ticketId: tickets.bannerTicketId,
      assetUrl: payload.bannerConfig?.imageUrl,
    });
  }
}

function createData(input) {
  return {
    name: input.name,
    ...(input.slug ? { slug: input.slug } : {}),
    currencyMode: input.currencyMode,
    pointsConversionEnabled: input.pointsConversionEnabled,
    companyEmailDomain: input.companyEmailDomain,
    categories: input.categories,
    logoUrl: input.logoUrl,
    bannerConfig: input.bannerConfig,
  };
}

function safeShop(shop) {
  return {
    id: String(shop._id),
    name: shop.name,
    slug: shop.slug || '',
    status: shop.status,
    currencyMode: shop.currencyMode,
    pointsConversionEnabled: Boolean(shop.pointsConversionEnabled),
    companyEmailDomain: shop.companyEmailDomain || '',
    categories: [...(shop.categories || [])],
    logoUrl: shop.logoUrl || '',
    bannerConfig: { ...(shop.bannerConfig || {}) },
  };
}

async function ensureClaims() {
  claimsReady ??= McpShopClaim.syncIndexes();
  await claimsReady;
}

async function matchingShop(tenantId, name) {
  const wanted = normalizeName(name);
  const rows = await Shop.find({ tenantId }).sort({ createdAt: 1 });
  return rows.find((row) => normalizeName(row.name) === wanted) || null;
}

function wantedSlug(input) {
  return input.slug || slugifyShopName(input.name);
}

function sameConfig(shop, input) {
  const slug = shop.slug || '';
  const slugMatches = input.slug
    ? slug === input.slug
    : slug === wantedSlug(input) || slug.startsWith(`${wantedSlug(input)}-`);
  return slugMatches
    && shop.currencyMode === input.currencyMode
    && Boolean(shop.pointsConversionEnabled) === input.pointsConversionEnabled
    && (shop.companyEmailDomain || '') === input.companyEmailDomain
    && JSON.stringify(shop.categories || []) === JSON.stringify(input.categories)
    && (shop.logoUrl || '') === input.logoUrl
    && bannerKey(shop.bannerConfig) === bannerKey(input.bannerConfig);
}

async function loadShop(tenantId, shopId) {
  const shop = await Shop.findOne({ _id: shopId, tenantId });
  if (!shop) throw new NotFoundError('Store not found');
  return shop;
}

function shopVersion(shop) {
  return {
    shopId: String(shop._id),
    name: shop.name,
    slug: shop.slug || '',
    status: shop.status,
    currencyMode: shop.currencyMode,
    pointsConversionEnabled: Boolean(shop.pointsConversionEnabled),
    companyEmailDomain: shop.companyEmailDomain || '',
    categories: [...(shop.categories || [])],
    logoUrl: shop.logoUrl || '',
    bannerConfig: { ...(shop.bannerConfig || {}) },
    updatedAt: new Date(shop.updatedAt).toISOString(),
  };
}

function displayValue(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value ?? '');
}

function shopChanges(shop, input) {
  const current = {
    name: shop.name,
    slug: shop.slug || '',
    pointsConversionEnabled: Boolean(shop.pointsConversionEnabled),
    companyEmailDomain: shop.companyEmailDomain || '',
    categories: [...(shop.categories || [])],
    logoUrl: shop.logoUrl || '',
    bannerConfig: { ...(shop.bannerConfig || {}) },
  };
  return ['name', 'slug', 'pointsConversionEnabled', 'companyEmailDomain', 'categories', 'logoUrl', 'bannerConfig']
    .filter((field) => input[field] !== undefined)
    .filter((field) => displayValue(current[field]) !== displayValue(input[field]))
    .map((field) => ({
      field,
      from: displayValue(current[field]),
      to: displayValue(input[field]),
    }));
}

async function auditShop(actor, action, shop) {
  await writeAudit({
    tenantId: actor.tenant._id,
    req: { tenantId: actor.tenant._id, user: { userId: actor.user.userId, role: actor.user.role } },
    action,
    entityType: 'Shop',
    entityId: shop._id,
    after: {
      name: shop.name,
      slug: shop.slug,
      status: shop.status,
      currencyMode: shop.currencyMode,
    },
  });
}

async function applyDraftConfig(actor, shop, input) {
  if (shop.currencyMode !== input.currencyMode) {
    throw new ApiError(409, 'A store with this name already exists', 'SHOP_EXISTS');
  }
  if (sameConfig(shop, input)) return safeShop(shop);
  const patch = {};
  if (input.name !== shop.name) patch.name = input.name;
  if (input.slug && input.slug !== shop.slug) patch.slug = input.slug;
  if (Boolean(shop.pointsConversionEnabled) !== input.pointsConversionEnabled) {
    patch.pointsConversionEnabled = input.pointsConversionEnabled;
  }
  if ((shop.companyEmailDomain || '') !== input.companyEmailDomain) {
    patch.companyEmailDomain = input.companyEmailDomain;
  }
  if (JSON.stringify(shop.categories || []) !== JSON.stringify(input.categories)) {
    patch.categories = input.categories;
  }
  if ((shop.logoUrl || '') !== input.logoUrl) patch.logoUrl = input.logoUrl;
  if (bannerKey(shop.bannerConfig) !== bannerKey(input.bannerConfig)) {
    patch.bannerConfig = input.bannerConfig;
  }
  if (!Object.keys(patch).length) return safeShop(shop);
  const { shop: saved } = await updateShop({
    tenantId: actor.tenant._id,
    shopId: shop._id,
    patch,
  });
  await auditShop(actor, 'shop.update', saved);
  return safeShop(saved);
}

async function linkMatchingShop(tenantId, logicalKey, input) {
  const claim = await McpShopClaim.findOne({ tenantId, logicalKey });
  if (claim?.shopId) {
    const linked = await Shop.findOne({ _id: claim.shopId, tenantId });
    if (linked) return String(linked._id);
  }
  const match = await matchingShop(tenantId, input.name);
  if (!match) return null;
  await McpShopClaim.updateOne(
    { tenantId, logicalKey },
    { $set: { shopId: match._id } },
    { upsert: true },
  );
  return String(match._id);
}

async function waitForShop(tenantId, logicalKey, input) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const shopId = await linkMatchingShop(tenantId, logicalKey, input);
    if (shopId) return shopId;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new ApiError(409, 'This store is already being created', 'SHOP_CREATE_IN_PROGRESS');
}

async function saveLinkedShop(actor, input) {
  await ensureClaims();
  const tenantId = actor.tenant._id;
  const existing = await matchingShop(tenantId, input.name);
  if (existing?.status === 'live') {
    throw new ApiError(409, 'A store with this name already exists', 'SHOP_EXISTS');
  }
  if (existing) return applyDraftConfig(actor, existing, input);

  const logicalKey = nameKey(input);
  let ownsClaim = false;
  try {
    await McpShopClaim.create({ tenantId, logicalKey });
    ownsClaim = true;
  } catch (error) {
    if (!duplicateKey(error)) throw error;
  }
  if (!ownsClaim) {
    const shopId = await waitForShop(tenantId, logicalKey, input);
    const shop = await Shop.findOne({ _id: shopId, tenantId });
    if (!shop) throw new ApiError(409, 'This store is already being created', 'SHOP_CREATE_IN_PROGRESS');
    if (shop.status !== 'draft') {
      throw new ApiError(409, 'A store with this name already exists', 'SHOP_EXISTS');
    }
    return applyDraftConfig(actor, shop, input);
  }

  try {
    const shop = await createShop({ tenantId, data: createData(input) });
    if (shop.status !== 'draft') {
      throw new ApiError(409, 'Store was not created as a draft', 'SHOP_NOT_DRAFT');
    }
    await McpShopClaim.updateOne({ tenantId, logicalKey }, { $set: { shopId: shop._id } });
    await auditShop(actor, 'shop.create', shop);
    return safeShop(shop);
  } catch (error) {
    const created = await matchingShop(tenantId, input.name);
    if (created) {
      await McpShopClaim.updateOne({ tenantId, logicalKey }, { $set: { shopId: created._id } });
    } else {
      await McpShopClaim.deleteOne({ tenantId, logicalKey, shopId: null });
    }
    throw error;
  }
}

async function createResourceState(tenantId, input) {
  const shop = await matchingShop(tenantId, input.name);
  if (!shop) return { name: normalizeName(input.name), exists: false };
  return { exists: true, ...shopVersion(shop) };
}

export async function prepareShopCreate({ tenantId, actorUserId, input, now }) {
  const { payload: requested } = await materializeCreate(tenantId, actorUserId, input);
  const prepared = await prepareMcpWrite({
    tenantId,
    actorUserId,
    operation: 'shops.create',
    payload: requested,
    now,
    authorize: async (actor) => {
      assertShopWriter(actor);
      const shop = await matchingShop(tenantId, requested.name);
      if (shop?.status === 'live') {
        throw new ApiError(409, 'A store with this name already exists', 'SHOP_EXISTS');
      }
    },
    validate: async () => requested,
    resourceState: async () => createResourceState(tenantId, requested),
    summary: async () => ({ action: 'preview', name: requested.name, status: 'draft' }),
  });
  const shop = await matchingShop(tenantId, requested.name);
  return {
    confirmationId: prepared.confirmationId,
    expiresAt: prepared.expiresAt,
    preview: {
      action: shop ? 'reuse' : 'create',
      name: requested.name,
      slug: shop?.slug || wantedSlug(requested),
      status: 'draft',
      currencyMode: requested.currencyMode,
      pointsConversionEnabled: requested.pointsConversionEnabled,
      companyEmailDomain: requested.companyEmailDomain,
      categories: requested.categories,
      logoUrl: requested.logoUrl,
      bannerConfig: requested.bannerConfig,
      ...(shop ? { shopId: String(shop._id) } : {}),
    },
  };
}

export async function executeShopCreate({
  tenantId,
  actorUserId,
  input,
  confirmationId,
  idempotencyKey,
  now,
}) {
  const { payload: requested, tickets } = await materializeCreate(tenantId, actorUserId, input);
  const saved = await executeMcpWrite({
    tenantId,
    actorUserId,
    operation: 'shops.create',
    payload: requested,
    confirmationId,
    idempotencyKey,
    now,
    authorize: async (actor) => {
      assertShopWriter(actor);
    },
    validate: async () => requested,
    resourceState: async () => createResourceState(tenantId, requested),
    reconcile: async () => {
      const shop = await matchingShop(tenantId, requested.name);
      if (shop?.status === 'draft') return { outcome: 'completed', result: safeShop(shop) };
      const claim = await McpShopClaim.findOne({ tenantId, logicalKey: nameKey(requested) });
      if ((claim && !claim.shopId) || shop) return { outcome: 'uncertain' };
      return { outcome: 'absent' };
    },
    execute: async (actor) => {
      const shop = await saveLinkedShop(actor, requested);
      await consumeCreateTickets(tenantId, actorUserId, requested, tickets);
      return shop;
    },
  });
  return presentShop(tenantId, saved);
}

export async function prepareShopUpdate({ tenantId, actorUserId, input, now }) {
  const { payload: requested } = await materializeUpdate(tenantId, actorUserId, input);
  const planned = {};
  const prepared = await prepareMcpWrite({
    tenantId,
    actorUserId,
    operation: 'shops.update',
    payload: requested,
    now,
    authorize: async (actor) => {
      assertShopWriter(actor);
      planned.shop = await loadShop(tenantId, requested.shopId);
      planned.changes = shopChanges(planned.shop, requested);
      if (!planned.changes.length) throw invalidDetails();
    },
    validate: async () => requested,
    resourceState: async () => shopVersion(await loadShop(tenantId, requested.shopId)),
    summary: async () => ({
      action: 'preview',
      shopId: requested.shopId,
      fields: planned.changes?.map((change) => change.field) || [],
    }),
  });
  return {
    confirmationId: prepared.confirmationId,
    expiresAt: prepared.expiresAt,
    preview: {
      shopId: String(planned.shop._id),
      version: new Date(planned.shop.updatedAt).toISOString(),
      changes: planned.changes,
      shop: {
        ...safeShop(planned.shop),
        ...Object.fromEntries(planned.changes.map((change) => [change.field, requested[change.field]])),
      },
    },
  };
}

export async function executeShopUpdate({
  tenantId,
  actorUserId,
  input,
  confirmationId,
  idempotencyKey,
  now,
}) {
  const { payload: requested, tickets } = await materializeUpdate(tenantId, actorUserId, input);
  const saved = await executeMcpWrite({
    tenantId,
    actorUserId,
    operation: 'shops.update',
    payload: requested,
    confirmationId,
    idempotencyKey,
    now,
    authorize: async (actor) => {
      assertShopWriter(actor);
      const shop = await loadShop(tenantId, requested.shopId);
      if (!shopChanges(shop, requested).length) throw invalidDetails();
    },
    validate: async () => requested,
    resourceState: async () => shopVersion(await loadShop(tenantId, requested.shopId)),
    reconcile: async () => {
      const shop = await Shop.findOne({ _id: requested.shopId, tenantId });
      if (!shop) return { outcome: 'uncertain' };
      if (!shopChanges(shop, requested).length) return { outcome: 'completed', result: safeShop(shop) };
      return { outcome: 'absent' };
    },
    execute: async (actor) => {
      const patch = {};
      for (const field of ['name', 'slug', 'pointsConversionEnabled', 'companyEmailDomain', 'categories', 'logoUrl', 'bannerConfig']) {
        if (requested[field] !== undefined) patch[field] = requested[field];
      }
      const { shop } = await updateShop({ tenantId, shopId: requested.shopId, patch });
      await auditShop(actor, 'shop.update', shop);
      await consumeUpdateTickets(tenantId, actorUserId, requested, tickets);
      return safeShop(shop);
    },
  });
  return presentShop(tenantId, saved);
}


async function presentShop(tenantId, result) {
  const shop = await Shop.findOne({ _id: result.id, tenantId });
  return {
    ...result,
    companyEmailDomain: shop?.companyEmailDomain || '',
    logoUrl: shop?.logoUrl || result.logoUrl || '',
    bannerConfig: { ...(shop?.bannerConfig || result.bannerConfig || {}) },
  };
}
function requireCaller(ctx) {
  const caller = employeeReaderFromContext(ctx);
  if (!caller.tenantId || !caller.user.userId) {
    throw new ForbiddenError('Stores are not available for this account');
  }
  return caller;
}

export async function prepareShopCreateForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return prepareShopCreate({ tenantId: caller.tenantId, actorUserId: caller.user.userId, input: args });
}

export async function executeShopCreateForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return executeShopCreate({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
    confirmationId: args?.confirmationId,
    idempotencyKey: args?.idempotencyKey,
  });
}

export async function prepareShopUpdateForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return prepareShopUpdate({ tenantId: caller.tenantId, actorUserId: caller.user.userId, input: args });
}

export async function executeShopUpdateForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return executeShopUpdate({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
    confirmationId: args?.confirmationId,
    idempotencyKey: args?.idempotencyKey,
  });
}

export function shopWriteText(output, heading) {
  const shop = output.preview?.shop || output.preview || output;
  const lines = [
    heading,
    `${shop.name} (${shop.slug}) ${shop.status} ${shop.currencyMode}`,
  ];
  if (shop.bannerConfig) {
    lines.push(`Banner: ${JSON.stringify(shop.bannerConfig)}`);
  }
  if (shop.logoUrl) lines.push(`Logo: ${shop.logoUrl}`);
  if (output.preview?.changes?.length) {
    lines.push(...output.preview.changes.map((change) => `${change.field}: ${change.from} -> ${change.to}`));
  }
  if (output.confirmationId) lines.push('Confirm this preview before it expires.');
  if (shop.status === 'draft') {
    lines.push('Store is still a draft. Publishing requires a separate confirmed publish step.');
  }
  return lines.join('\n');
}

const WRITE_ERRORS = {
  FORBIDDEN: 'You cannot change stores.',
  SHOP_EXISTS: 'A store with this name already exists.',
  NOT_FOUND: 'Store not found.',
  VALIDATION: 'Store details are not valid.',
  CONFIRMATION_STALE: 'This preview is out of date. Prepare the change again.',
  CONFIRMATION_EXPIRED: 'This confirmation has expired. Prepare the change again.',
  CONFIRMATION_REUSED: 'This confirmation was already used.',
  CONFIRMATION_INVALID: 'This confirmation is not valid.',
  CONFIRMATION_MISMATCH: 'This confirmation does not match the requested change.',
  IDEMPOTENCY_PAYLOAD_MISMATCH: 'This idempotency key was used for a different change.',
  IDEMPOTENT_REPLAY_IN_FLIGHT: 'This store change is already in progress.',
  ACTOR_INACTIVE: 'This account cannot change stores.',
  TENANT_INACTIVE: 'This workspace cannot change stores.',
  SHOP_CREATE_IN_PROGRESS: 'This store is already being created.',
  ASSET_REQUIRED: 'Upload the store image before continuing.',
  INVALID_ASSET_URL: 'That asset reference is not valid.',
};

export function shopWriteError(error, fallback) {
  return WRITE_ERRORS[error?.code] || fallback;
}
