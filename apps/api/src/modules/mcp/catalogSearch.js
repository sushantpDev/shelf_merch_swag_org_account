import { z } from 'zod';
import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import {
  categoryFilter,
  productSearchFilter,
  tenantCatalogFilter,
  withEnabledVariants,
} from '../catalog/catalogFilters.js';
import { getPagination, paginatedResponse } from '../../utils/pagination.js';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

/**
 * Catalog selling prices are GST-inclusive rupees. Search compares those
 * stored amounts and never recomputes or strips GST.
 */
export const CATALOG_INVENTORY_RULE = [
  'Results are real ShelfMerch catalog products.',
  'Use only the ids, prices, variants, stock, and primaryImageUrl values in the result.',
  'Do not invent product ids, prices, variants, or stock.',
  'primaryImageUrl is the official catalog image.',
  'Display that URL and do not replace it with an image from web search.',
  'If the image cannot be rendered, show the URL itself.',
  'A product that is not in the result is not ShelfMerch inventory and must not be used in store, campaign, or order tools.',
  'If the user asked for general gifting ideas, label anything outside this result as inspiration and do not claim it can be ordered through ShelfMerch.',
].join(' ');

export const CATALOG_SEARCH_DESCRIPTION = [
  'Search the ShelfMerch selling catalog.',
  'sellingPriceInr is the GST-inclusive price in rupees: the product base price, or a variant price override when one is set.',
  'minSellingPriceInr and maxSellingPriceInr filter those inclusive rupee prices and do not remove GST.',
  'A product matches when its base selling price is inside the range, or an enabled variant override is.',
  'Every selling price in the result is inside that range. Variants outside it are omitted.',
  'If the base price is outside the range, sellingPriceInr is the lowest matching variant price.',
  'Results are active products a tenant can order. Disabled variants are omitted.',
  'Cost, margin, and supplier fields are not returned.',
  CATALOG_INVENTORY_RULE,
].join(' ');

export function escapeCatalogSearch(search) {
  return String(search ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Inclusive-rupee range. Variant overrides count only when the variant is enabled. */
export function inclusiveSellingPriceFilter(minSellingPriceInr, maxSellingPriceInr) {
  if (minSellingPriceInr == null && maxSellingPriceInr == null) return {};
  const range = {};
  if (minSellingPriceInr != null) range.$gte = minSellingPriceInr;
  if (maxSellingPriceInr != null) range.$lte = maxSellingPriceInr;
  return {
    $or: [
      { basePriceInr: range },
      {
        variants: {
          $elemMatch: {
            enabled: { $ne: false },
            priceOverrideInr: range,
          },
        },
      },
    ],
  };
}

export function catalogSearchMongoFilter(input = {}) {
  const clauses = [
    { status: 'active' },
    { 'source.kindOverride': { $ne: 'kit' } },
    tenantCatalogFilter(),
  ];
  const category = categoryFilter(input.category);
  if (Object.keys(category).length) clauses.push(category);
  const search = productSearchFilter(escapeCatalogSearch(input.query));
  if (Object.keys(search).length) clauses.push(search);
  const price = inclusiveSellingPriceFilter(input.minSellingPriceInr, input.maxSellingPriceInr);
  if (Object.keys(price).length) clauses.push(price);
  return { $and: clauses };
}

function rupees(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount) : 0;
}

export function priceWithinLimits(amount, minSellingPriceInr, maxSellingPriceInr) {
  if (minSellingPriceInr != null && amount < minSellingPriceInr) return false;
  if (maxSellingPriceInr != null && amount > maxSellingPriceInr) return false;
  return true;
}

/**
 * Drop prices outside the requested GST-inclusive range. The Mongo query can
 * admit a product because one variant matches; the payload must not still
 * show the out-of-range base price or other variants.
 */
export function applyPriceLimits(item, minSellingPriceInr, maxSellingPriceInr) {
  if (minSellingPriceInr == null && maxSellingPriceInr == null) return item;
  const variants = item.variants.filter((variant) =>
    priceWithinLimits(variant.sellingPriceInr, minSellingPriceInr, maxSellingPriceInr),
  );
  const baseOk = priceWithinLimits(item.sellingPriceInr, minSellingPriceInr, maxSellingPriceInr);
  if (!baseOk && variants.length === 0) return null;
  const sellingPriceInr = baseOk
    ? item.sellingPriceInr
    : Math.min(...variants.map((variant) => variant.sellingPriceInr));
  return { ...item, sellingPriceInr, variants };
}

export function toCatalogSearchItem(product) {
  const visible = withEnabledVariants(product);
  const sellingPriceInr = rupees(visible.basePriceInr);
  return {
    id: String(visible._id),
    sku: visible.sku ?? '',
    name: visible.name ?? '',
    brand: visible.brand ?? '',
    category: visible.category ?? '',
    subcategory: visible.subcategory ?? '',
    childCategory: visible.childCategory ?? '',
    sellingPriceInr,
    gstRate: Number(visible.gstRate ?? 18),
    moq: Number(visible.moq ?? 1),
    primaryImageUrl: visible.primaryImageUrl ?? '',
    variants: (visible.variants ?? []).map((variant) => ({
      sku: variant.sku ?? '',
      color: variant.color ?? '',
      size: variant.size ?? '',
      sellingPriceInr: rupees(variant.priceOverrideInr ?? visible.basePriceInr),
      stock: Number(variant.stock ?? 0),
    })),
  };
}

export const catalogSearchInputSchema = z
  .object({
    query: z
      .string()
      .trim()
      .max(80)
      .optional()
      .describe('Literal match against product name, SKU, or brand. Regular-expression characters are not operators.'),
    category: z
      .string()
      .trim()
      .max(80)
      .optional()
      .describe('Category, subcategory, or child category. Parent names include their legacy aliases.'),
    minSellingPriceInr: z
      .number()
      .int()
      .min(0)
      .max(10_000_000)
      .optional()
      .describe('Minimum GST-inclusive selling price in rupees.'),
    maxSellingPriceInr: z
      .number()
      .int()
      .min(0)
      .max(10_000_000)
      .optional()
      .describe('Maximum GST-inclusive selling price in rupees.'),
    page: z.number().int().min(1).max(10_000).optional().describe('1-based page number.'),
    limit: z.number().int().min(1).max(25).optional().describe('Page size. Default 10, maximum 25.'),
  })
  .refine(
    (value) =>
      value.minSellingPriceInr == null ||
      value.maxSellingPriceInr == null ||
      value.minSellingPriceInr <= value.maxSellingPriceInr,
    { message: 'minSellingPriceInr cannot exceed maxSellingPriceInr' },
  );

const catalogSearchVariantSchema = z.object({
  sku: z.string(),
  color: z.string(),
  size: z.string(),
  sellingPriceInr: z.number().int(),
  stock: z.number(),
});

export const catalogSearchOutputSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      sku: z.string(),
      name: z.string(),
      brand: z.string(),
      category: z.string(),
      subcategory: z.string(),
      childCategory: z.string(),
      sellingPriceInr: z.number().int(),
      gstRate: z.number(),
      moq: z.number(),
      primaryImageUrl: z.string(),
      variants: z.array(catalogSearchVariantSchema),
    }),
  ),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

const PUBLIC_PRODUCT_FIELDS =
  'sku name brand category subcategory childCategory basePriceInr gstRate moq primaryImageUrl variants status source';

export async function searchCatalog(input = {}) {
  const filter = catalogSearchMongoFilter(input);
  const { page, limit, skip } = getPagination(
    { page: input.page, limit: input.limit },
    { defaultLimit: DEFAULT_LIMIT, maxLimit: MAX_LIMIT },
  );
  const [rows, total] = await Promise.all([
    CatalogProduct.find(filter)
      .select(PUBLIC_PRODUCT_FIELDS)
      .sort({ name: 1, sku: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CatalogProduct.countDocuments(filter),
  ]);
  const items = rows
    .map((row) =>
      applyPriceLimits(
        toCatalogSearchItem(row),
        input.minSellingPriceInr,
        input.maxSellingPriceInr,
      ),
    )
    .filter(Boolean);
  return paginatedResponse(items, total, { page, limit });
}

function imageMimeType(url) {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    // keep the raw string
  }
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return undefined;
}

export function officialImageNote(url) {
  const value = typeof url === 'string' ? url.trim() : '';
  if (!value) return 'Official image: none. Do not substitute an external image.';
  return `Official image: ${value}`;
}

/** URL-oriented image block. MCP image content requires downloaded bytes, which these tools do not fetch. */
export function officialImageLink(item, url, description) {
  const value = typeof url === 'string' ? url.trim() : '';
  if (!/^https?:\/\//i.test(value)) return null;
  const link = {
    type: 'resource_link',
    name: item.name || item.sku || 'Catalog product',
    uri: value,
    description,
  };
  const mimeType = imageMimeType(value);
  if (mimeType) link.mimeType = mimeType;
  return link;
}

export function catalogSearchText(output) {
  const { items, pagination } = output;
  const header = [
    'ShelfMerch catalog inventory. Prices are GST-inclusive rupees.',
    `Page ${pagination.page} of ${pagination.totalPages} (${pagination.total} total).`,
    CATALOG_INVENTORY_RULE,
  ].join(' ');
  if (!items.length) return `${header}\nNo matching products.`;
  const lines = items.map((item) => {
    const variants = item.variants
      .map((variant) => `${variant.sku || variant.size || variant.color || 'variant'} ₹${variant.sellingPriceInr} stock ${variant.stock}`)
      .join(', ');
    const variantNote = variants ? ` variants: ${variants}` : '';
    return `${item.name} [${item.sku}] id ${item.id} ₹${item.sellingPriceInr} incl. GST (${item.gstRate}%) ${item.category}${variantNote} ${officialImageNote(item.primaryImageUrl)}`;
  });
  return [header, ...lines].join('\n');
}

export function catalogSearchContent(output) {
  const links = output.items
    .map((item) =>
      officialImageLink(
        item,
        item.primaryImageUrl,
        `Official ShelfMerch catalog image for ${item.name || item.sku}. Do not replace this URL.`,
      ),
    )
    .filter(Boolean);
  return [{ type: 'text', text: catalogSearchText(output) }, ...links];
}
