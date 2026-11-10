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
  'do not replace it with an image from web search.',
  'The catalog product card is the only product presentation when the host shows it. Do not add another product card, image preview, or variant table.',
  'When that card is not shown, quote primaryImageUrl as text.',
  'A product that is not in the result is not ShelfMerch inventory and must not be used in store, campaign, or order tools.',
  'If the user asked for general gifting ideas, label anything outside this result as inspiration and do not claim it can be ordered through ShelfMerch.',
].join(' ');

export const CATALOG_SEARCH_DESCRIPTION = [
  'Search the ShelfMerch selling catalog.',
  'When the user asks for top/first/show N products, pass limit=N. Results follow existing name order and are not popularity-ranked.',
  'When the host shows the catalog product card, that card is the only product presentation. Reply with one short sentence and do not repeat the product list, prices, images, or variants.',
  'Clients without that card should use the text result, which lists every product returned on this page and quotes each primaryImageUrl.',
  'sellingPriceInr is the GST-inclusive catalog selling price in rupees and is not reduced by removing GST.',
  'Every variant uses that same selling price. Selecting a color or size does not change it.',
  'minSellingPriceInr and maxSellingPriceInr filter that catalog selling price and do not remove GST.',
  'Results are active products a tenant can order. Disabled variants are omitted.',
  'Cost, margin, and supplier fields are not returned.',
  CATALOG_INVENTORY_RULE,
].join(' ');

export function escapeCatalogSearch(search) {
  return String(search ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Inclusive-rupee range against the catalog selling price checkout charges. */
export function inclusiveSellingPriceFilter(minSellingPriceInr, maxSellingPriceInr) {
  if (minSellingPriceInr == null && maxSellingPriceInr == null) return {};
  const range = {};
  if (minSellingPriceInr != null) range.$gte = minSellingPriceInr;
  if (maxSellingPriceInr != null) range.$lte = maxSellingPriceInr;
  return { basePriceInr: range };
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

/**
 * Storefront checkout sets unitPriceInr from basePriceInr after the color
 * and size are chosen. priceOverrideInr is not part of that charge.
 */
export function variantSellingPrices(basePriceInr, variants) {
  const base = rupees(basePriceInr);
  return (variants ?? []).map(() => base);
}

export function toCatalogSearchItem(product) {
  const visible = withEnabledVariants(product);
  const sellingPriceInr = rupees(visible.basePriceInr);
  const variantPrices = variantSellingPrices(visible.basePriceInr, visible.variants);
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
    description: typeof visible.description === 'string' ? visible.description.trim() : '',
    primaryImageUrl: visible.primaryImageUrl ?? '',
    variants: (visible.variants ?? []).map((variant, index) => ({
      sku: variant.sku ?? '',
      color: variant.color ?? '',
      size: variant.size ?? '',
      sellingPriceInr: variantPrices[index],
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
    limit: z.number().int().min(1).max(25).optional().describe('Page size. Default 10, maximum 25. When the user asks for top/first/show N products, pass limit=N.'),
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
      description: z.string(),
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
  'sku name brand category subcategory childCategory basePriceInr gstRate moq description primaryImageUrl variants status source';

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

export function officialImageNote(url) {
  const value = typeof url === 'string' ? url.trim() : '';
  if (!value) return 'Official image: none. Do not substitute an external image.';
  return `Official image: ${value}`;
}

const CLIENT_CAPABILITIES_KEY = 'io.modelcontextprotocol/clientCapabilities';
const MCP_APP_MIME = 'text/html;profile=mcp-app';

/** Short text only when the client declares it can render an MCP Apps HTML card. */
export function catalogClientShowsProductCard(capabilities) {
  const ui = capabilities?.extensions?.['io.modelcontextprotocol/ui'];
  return Boolean(ui && typeof ui === 'object' && Array.isArray(ui.mimeTypes) && ui.mimeTypes.includes(MCP_APP_MIME));
}

export function catalogCardVisibleFromContext(ctx) {
  const envelope = ctx?.mcpReq?.envelope;
  return catalogClientShowsProductCard(envelope?.[CLIENT_CAPABILITIES_KEY]);
}

export function catalogSearchSummary(output) {
  const { items, pagination } = output;
  const shown = Array.isArray(items) ? items.length : 0;
  return [
    `ShelfMerch catalog page ${pagination.page} of ${pagination.totalPages}: ${shown} products loaded, ${pagination.total} matches.`,
    'The catalog product card is the only product presentation.',
    'Reply with one short sentence.',
    'Do not add a product card, image preview, variant table, price list, or repeated product details.',
  ].join(' ');
}

export function catalogSearchText(output, options = {}) {
  if (options.cardVisible) return catalogSearchSummary(output);
  const { items, pagination } = output;
  const header = [
    'ShelfMerch catalog inventory. Prices are GST-inclusive rupees.',
    'This text is for clients that do not show the catalog product card.',
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

export function catalogSearchContent(output, options = {}) {
  // Text only. An image block or resource_link is not an embedded catalog photo,
  // and this server does not serve resources/read for the CDN file.
  return [{ type: 'text', text: catalogSearchText(output, options) }];
}
