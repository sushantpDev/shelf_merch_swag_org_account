import { z } from 'zod';
import { env } from '../../config/env.js';
import { ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { Kit } from '../kits/kit.model.js';
import { PlatformKit } from '../kits/platformKit.model.js';
import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { isCuratedKitMeta, parseCuratedKitMeta } from '../kits/curatedKitMeta.js';
import { employeeReaderFromContext } from './employeesRead.js';

const READ_ROLES = new Set(rolesForTenantArea('kits', 'read'));
const OBJECT_ID = /^[a-f\d]{24}$/i;

export const KITS_LIST_DESCRIPTION = [
  'List workspace kits for the signed-in company.',
  'type is required for intent matching. British spelling customised means customized.',
  'For "customised kits", "customized kits", "own kits", or "company kits", call with type=customized. Do not omit type.',
  'For "curated kits" that already live in this workspace, call with type=curated.',
  'For "all workspace kits" or an explicit request for every kit, call with type=all.',
  'Customized kits are workspace-built. Curated workspace copies keep type curated and must not appear in customized results.',
  'Company admins and department managers can list them. Another workspace is never included.',
  'Search matches the kit name. Draft, live, and archived kits can be filtered by status.',
  'Each row includes the kit id, type, status, item count, stored kit price, official image, and whether it can be sent.',
  'The stored price is the kit card price. The send preview calculates the payable total.',
  'This does not send a kit, create a campaign, or copy a curated kit.',
  'When the kit card is shown, it is the only kit presentation. Do not repeat the kit list, images, or prices.',
].join(' ');

export const KITS_GET_DESCRIPTION = [
  'Get one workspace kit by id from kits_list.',
  'Includes constituent products, quantities, the stored kit price, status, packaging, and the official image.',
  'A curated copy is marked curated and keeps the platform kit id it came from.',
  'Company admins and department managers only. This does not send the kit.',
  'When the kit card is shown, it is the only kit presentation. Do not repeat the kit list, images, or prices.',
].join(' ');

export const KITS_LIST_CURATED_DESCRIPTION = [
  'List active ShelfMerch curated kits. These are platform kits, not workspace-owned customized kits.',
  'Search matches the kit name or description. maxPriceInr filters the stored inclusive kit price.',
  'Each row includes the platform kit id, item count, stored price, official image, packaging, and whether a logo is required before sending.',
  'Any signed-in company admin or department manager in a workspace can read them.',
  'This does not copy the kit into the workspace or send it.',
  'When the kit card is shown, it is the only kit presentation. Do not repeat the kit list, images, or prices.',
].join(' ');

export const KITS_GET_CURATED_DESCRIPTION = [
  'Get one active ShelfMerch curated kit by id from kits_list_curated.',
  'Includes item labels, quantities, the stored inclusive price, images, packaging, and logo requirement.',
  'Archived and draft platform kits are not returned.',
  'This does not copy the kit into the workspace or send it.',
  'When the kit card is shown, it is the only kit presentation. Do not repeat the kit list, images, or prices.',
].join(' ');

const productSchema = z.object({
  catalogProductId: z.string(),
  name: z.string(),
  brand: z.string(),
  quantity: z.number().int(),
  imageUrl: z.string(),
  colors: z.array(z.string()),
  sizes: z.array(z.string()),
  stockLabel: z.string(),
});

const kitSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['customized', 'curated']),
  status: z.string(),
  itemCount: z.number().int(),
  priceInr: z.number(),
  imageUrl: z.string(),
  packaging: z.string(),
  sendEligible: z.boolean(),
  description: z.string(),
  products: z.array(productSchema),
});

/** Map common natural-language type aliases before enum validation. */
export function normalizeKitListType(value) {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'customized' || normalized === 'customised') return 'customized';
  if (normalized === 'curated') return 'curated';
  if (normalized === 'all') return 'all';
  return normalized;
}

export function resolveKitListLimit(value, { defaultLimit = 100, maxLimit = 100 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return defaultLimit;
  return Math.min(maxLimit, Math.max(1, Math.round(n)));
}

export const kitsListInputSchema = z.object({
  query: z.string().trim().max(80).optional(),
  status: z.enum(['draft', 'live', 'archived']).optional(),
  type: z.preprocess(
    normalizeKitListType,
    z.enum(['customized', 'curated', 'all']).optional(),
  ).describe(
    'customized = workspace-built kits only (also accepts customised). curated = curated workspace copies only. all = every authorized workspace kit. Required when the user asks for customised/customized/own/company kits.',
  ),
  limit: z.number().int().min(1).max(100).optional().describe(
    'Maximum kits to return. When the user asks for top/first/show N kits, pass limit=N. Results follow existing name order and are not popularity-ranked.',
  ),
});
export const kitsListOutputSchema = z.object({
  items: z.array(kitSummarySchema),
  view: z.object({
    type: z.enum(['customized', 'curated', 'all']),
    limit: z.number().int(),
  }),
});
export const kitsGetInputSchema = z.object({ kitId: z.string().trim().regex(OBJECT_ID) });
export const kitsGetOutputSchema = kitSummarySchema.extend({
  platformKitId: z.string(),
  requireLogo: z.boolean(),
});
export const kitsListCuratedInputSchema = z.object({
  query: z.string().trim().max(80).optional(),
  maxPriceInr: z.number().nonnegative().optional(),
  limit: z.number().int().min(1).max(100).optional().describe(
    'Maximum curated kits to return. When the user asks for top/first/show N curated kits, pass limit=N. Results follow existing name order and are not popularity-ranked.',
  ),
});
export const kitsListCuratedOutputSchema = z.object({
  items: z.array(kitSummarySchema.omit({ sendEligible: true }).extend({
    requireLogo: z.boolean(),
  })),
  view: z.object({
    type: z.literal('curated'),
    limit: z.number().int(),
  }),
});
export const kitsGetCuratedInputSchema = z.object({ platformKitId: z.string().trim().regex(OBJECT_ID) });
export const kitsGetCuratedOutputSchema = kitsListCuratedOutputSchema.shape.items.element;

function assertReader(user) {
  if (!READ_ROLES.has(user?.role)) {
    throw new ForbiddenError('Kits are not available for this account');
  }
}

function readerOrThrow(ctx) {
  const reader = employeeReaderFromContext(ctx);
  if (!reader.tenantId || !reader.user?.userId) {
    throw new ForbiddenError('Kits are not available for this account');
  }
  assertReader(reader.user);
  return reader;
}

function escapeSearch(value) {
  return String(value || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PUBLIC_KIT_IMAGE_KINDS = new Set(['artwork', 'mockup', 'product', 'logo']);
const PUBLIC_KIT_IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg)$/i;

function httpsOrigin(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return url.origin;
  } catch {
    return '';
  }
}

/** HTTPS origins that already serve dashboard /uploads files. */
/** HTTPS origins that already host official kit artwork for the dashboard. */
export function kitImageResourceOrigins(bases = [env.BASE_URL, env.APP_URL, env.CLIENT_URL, env.S3_PUBLIC_BASE_URL, env.R2_ENDPOINT]) {
  const origins = [];
  const add = (value) => {
    const origin = httpsOrigin(value);
    if (origin && !origins.includes(origin)) origins.push(origin);
  };
  for (const base of bases) add(base);
  if (env.S3_BUCKET_NAME && env.AWS_REGION) {
    add(`https://s3.${env.AWS_REGION}.amazonaws.com`);
    add(`https://${env.S3_BUCKET_NAME}.s3.${env.AWS_REGION}.amazonaws.com`);
  }
  return origins;
}

function dashboardUploadPath(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:') || raw.startsWith('http://') || raw.startsWith('https://')) return '';
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  if (normalized.includes('..') || normalized.includes('\\') || normalized.includes('?') || normalized.includes('#') || normalized.includes('\0')) return '';
  const parts = normalized.split('/');
  if (parts.length !== 5 || parts[1] !== 'uploads' || !parts[2] || parts[2] === '.') return '';
  if (!PUBLIC_KIT_IMAGE_KINDS.has(parts[3]) || !PUBLIC_KIT_IMAGE_EXT.test(parts[4])) return '';
  return normalized;
}

/**
 * Official kit image for ChatGPT. HTTPS URLs pass through. A relative upload
 * is joined to the same public app origin the dashboard already uses, and only
 * for public image kinds. Documents and other private files stay empty.
 */
export function officialKitImageUrl(value, origins = kitImageResourceOrigins()) {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 2000) return '';
  if (raw.startsWith('https://') || raw.startsWith('http://')) {
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:' || url.username || url.password) return '';
      if (url.pathname.includes('/document/') || url.pathname.includes('/attachment/')) return '';
      return url.href;
    } catch {
      return '';
    }
  }
  const uploadPath = dashboardUploadPath(raw);
  if (!uploadPath) return '';
  const origin = origins.find((item) => item.startsWith('https://'));
  // Local/dev often only has http://localhost — keep a same-origin relative path
  // so the embedded Copilot can resolve it via resolveMediaUrl.
  if (!origin) return uploadPath;
  return origin + uploadPath;
}

function variantOptions(product) {
  const variants = Array.isArray(product?.variants)
    ? product.variants.filter((variant) => variant && variant.enabled !== false)
    : [];
  const colors = [];
  const sizes = [];
  let stock = 0;
  for (const variant of variants) {
    const color = String(variant.color || '').trim();
    const size = String(variant.size || '').trim();
    if (color && !colors.includes(color)) colors.push(color);
    if (size && !sizes.includes(size)) sizes.push(size);
    const qty = Number(variant.stock);
    if (Number.isFinite(qty)) stock += qty;
  }
  return {
    colors,
    sizes,
    stockLabel: variants.length ? (stock > 0 ? 'In stock' : 'Out of stock') : '',
  };
}

async function catalogById(ids) {
  const unique = [...new Set(ids.map((id) => String(id || '')).filter(Boolean))];
  if (!unique.length) return new Map();
  const products = await CatalogProduct.find({ _id: { $in: unique } }).select('name brand primaryImageUrl variants').lean();
  return new Map(products.map((product) => [String(product._id), product]));
}

function workspaceProducts(kit, byId) {
  return (kit.productRefs || []).map((ref) => {
    const product = byId.get(String(ref.catalogProductId));
    const options = variantOptions(product);
    return {
      catalogProductId: ref.catalogProductId ? String(ref.catalogProductId) : '',
      name: ref.name || product?.name || 'Item',
      brand: String(ref.brand || product?.brand || ''),
      quantity: 1,
      imageUrl: officialKitImageUrl(ref.mockupUrl || product?.primaryImageUrl),
      colors: options.colors,
      sizes: options.sizes,
      stockLabel: options.stockLabel,
    };
  });
}

function curatedProducts(kit, byId) {
  const fromItems = (kit.items || []).map((item) => {
    const product = byId.get(String(item.catalogProductId));
    const options = variantOptions(product);
    return {
      catalogProductId: item.catalogProductId ? String(item.catalogProductId) : '',
      name: product?.name || 'Item',
      brand: String(product?.brand || ''),
      quantity: Math.max(1, Math.round(Number(item.qty) || 1)),
      imageUrl: officialKitImageUrl(product?.primaryImageUrl),
      colors: options.colors,
      sizes: options.sizes,
      stockLabel: options.stockLabel,
    };
  });
  if (fromItems.length) return fromItems;
  return (kit.itemImages || []).map((item) => ({
    catalogProductId: '',
    name: item.label || 'Item',
    brand: '',
    quantity: 1,
    imageUrl: officialKitImageUrl(item.imageUrl),
    colors: [],
    sizes: [],
    stockLabel: '',
  }));
}

function curatedSummary(kit, products = []) {
  const items = Array.isArray(kit.items) ? kit.items : [];
  const images = Array.isArray(kit.itemImages) ? kit.itemImages : [];
  return {
    id: String(kit._id),
    name: kit.name || 'Curated kit',
    type: 'curated',
    status: kit.status || 'active',
    itemCount: items.length || images.length,
    priceInr: Math.round(Number(kit.approxValueInr) || 0),
    imageUrl: officialKitImageUrl(kit.heroImage || kit.imageUrls?.[0]),
    packaging: kit.packaging || 'box',
    requireLogo: kit.rules?.requireLogo !== false,
    description: String(kit.description || ''),
    products,
  };
}

function workspaceSummary(kit, meta, products = []) {
  const curated = isCuratedKitMeta(meta);
  const refs = kit.productRefs || [];
  const images = Array.isArray(meta?.itemImages) ? meta.itemImages : [];
  const sendEligible = kit.status !== 'archived' && (refs.length > 0 || curated);
  return {
    id: String(kit._id),
    name: kit.name || 'Kit',
    type: curated ? 'curated' : 'customized',
    status: kit.status || 'draft',
    itemCount: refs.length || images.length,
    priceInr: Math.round(Number(curated ? meta.approxValueInr || kit.kitPrice : kit.kitPrice) || 0),
    imageUrl: officialKitImageUrl(kit.artworkUrl || meta?.heroImage || meta?.imageUrls?.[0]),
    packaging: kit.packaging || 'none',
    sendEligible,
    description: String(meta?.description || kit.description || ''),
    products,
  };
}

export async function listKits({ tenantId, user, input = {} }) {
  assertReader(user);
  const requestedType = input.type === 'customized' || input.type === 'curated' ? input.type : 'all';
  const limit = resolveKitListLimit(input.limit);
  const filter = { tenantId };
  if (input.status) filter.status = input.status;
  if (input.query) filter.name = new RegExp(escapeSearch(input.query), 'i');
  const kits = await Kit.find(filter).sort({ name: 1 }).limit(100).lean();
  const byId = await catalogById(kits.flatMap((kit) => (kit.productRefs || []).map((ref) => ref.catalogProductId)));
  const items = kits
    .map((kit) => workspaceSummary(kit, parseCuratedKitMeta(kit.designNotes), workspaceProducts(kit, byId)))
    .filter((kit) => requestedType === 'all' || kit.type === requestedType)
    .slice(0, limit);
  return {
    items,
    view: { type: requestedType, limit },
  };
}

export async function getKit({ tenantId, user, kitId }) {
  assertReader(user);
  const kit = await Kit.findOne({ _id: kitId, tenantId }).lean();
  if (!kit) throw new NotFoundError('Kit not found');
  const meta = parseCuratedKitMeta(kit.designNotes);
  const ids = (kit.productRefs || []).map((ref) => ref.catalogProductId).filter(Boolean);
  const byId = await catalogById(ids);
  return {
    ...workspaceSummary(kit, meta, workspaceProducts(kit, byId)),
    platformKitId: meta?.originalId ? String(meta.originalId) : '',
    requireLogo: meta ? meta.requireLogo !== false : false,
  };
}

export async function listCuratedKits({ tenantId, user, input = {} }) {
  if (!tenantId) throw new ForbiddenError('Kits are not available for this account');
  assertReader(user);
  const filter = { status: 'active' };
  if (input.query) {
    const pattern = new RegExp(escapeSearch(input.query), 'i');
    filter.$or = [{ name: pattern }, { description: pattern }];
  }
  if (input.maxPriceInr != null) filter.approxValueInr = { $lte: input.maxPriceInr };
  const limit = resolveKitListLimit(input.limit);
  const kits = await PlatformKit.find(filter).sort({ name: 1 }).limit(100).lean();
  const byId = await catalogById(kits.flatMap((kit) => (kit.items || []).map((item) => item.catalogProductId)));
  return {
    items: kits.map((kit) => curatedSummary(kit, curatedProducts(kit, byId))).slice(0, limit),
    view: { type: 'curated', limit },
  };
}

export async function getCuratedKit({ tenantId, user, platformKitId }) {
  if (!tenantId) throw new ForbiddenError('Kits are not available for this account');
  assertReader(user);
  const kit = await PlatformKit.findOne({ _id: platformKitId, status: 'active' }).lean();
  if (!kit) throw new NotFoundError('Kit not found');
  const ids = (kit.items || []).map((item) => item.catalogProductId).filter(Boolean);
  return curatedSummary(kit, curatedProducts(kit, await catalogById(ids)));
}

export async function listKitsForCaller(ctx, args) {
  const reader = readerOrThrow(ctx);
  return listKits({ tenantId: reader.tenantId, user: reader.user, input: args });
}
export async function getKitForCaller(ctx, args) {
  const reader = readerOrThrow(ctx);
  return getKit({ tenantId: reader.tenantId, user: reader.user, kitId: args?.kitId });
}
export async function listCuratedKitsForCaller(ctx, args) {
  const reader = readerOrThrow(ctx);
  return listCuratedKits({ tenantId: reader.tenantId, user: reader.user, input: args });
}
export async function getCuratedKitForCaller(ctx, args) {
  const reader = readerOrThrow(ctx);
  return getCuratedKit({ tenantId: reader.tenantId, user: reader.user, platformKitId: args?.platformKitId });
}

export function kitsText(output, heading, options = {}) {
  const items = output.items || [output];
  if (!items.length || !items[0]?.name) return `${heading}\nNo matching kits.`;
  if (options.cardVisible) {
    const noun = items.length === 1 ? 'kit is' : 'kits are';
    return [
      `${heading}. ${items.length} ${noun} on the ShelfMerch kit card.`,
      'The kit card is the only kit presentation.',
      'Reply with one short sentence.',
      'Do not add a kit card, image preview, or price list.',
    ].join(' ');
  }
  const lines = items.map((kit) => {
    const price = kit.priceInr ? `${kit.priceInr} INR` : 'price unavailable';
    const image = kit.imageUrl
      ? `Official image: ${kit.imageUrl}`
      : 'Official image: none. Do not substitute an external image.';
    return `${kit.name} [${kit.type}] ${kit.status} ${kit.itemCount} items ${price}. ${image}`;
  });
  return [heading, ...lines].join('\n');
}

export function kitsError(error, fallback) {
  if (error instanceof NotFoundError) return 'Kit not found.';
  if (error instanceof ForbiddenError) return error.message;
  if (error?.name === 'ZodError') return 'Kit details are not valid.';
  return fallback;
}
