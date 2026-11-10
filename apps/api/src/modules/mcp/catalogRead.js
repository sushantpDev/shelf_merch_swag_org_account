import { z } from 'zod';
import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { tenantCatalogFilter } from '../catalog/catalogFilters.js';
import { listPublicCategories } from '../catalog/platformCatalog.service.js';
import { CATALOG_INVENTORY_RULE, officialImageNote, toCatalogSearchItem } from './catalogSearch.js';

const PRODUCT_ID = /^[a-fA-F0-9]{24}$/;

export const CATALOG_GET_PRODUCT_DESCRIPTION = [
  'Look up one ShelfMerch catalog product by id.',
  'sellingPriceInr is the GST-inclusive catalog price in rupees and is not reduced by removing GST.',
  'Every variant uses that same selling price. Selecting a color or size does not change it.',
  'Only active products a tenant can order are returned. Disabled variants are omitted.',
  'description is the catalog product information.',
  'images lists official marketing photos, with primaryImageUrl first.',
  'primaryImageUrl is the official catalog image for the catalog product card. Do not replace it with an image from web search.',
  'When that card is visible, it is the only product presentation. Reply with one short sentence and do not repeat its description, price, image, or variants.',
  'Do not invent prices, variants, or stock.',
  'This product is ShelfMerch inventory. Anything not returned here is not available to order and, if offered as a general gift idea, must be labeled inspiration.',
  'Cost, margin, supplier, vendor, source identifiers, customization costs, and production-mask assets are not returned.',
].join(' ');

export const catalogGetProductInputSchema = z.object({
  productId: z
    .string()
    .trim()
    .regex(PRODUCT_ID, 'productId must be a catalog product id')
    .describe('Catalog product id from catalog_search.'),
});

const catalogVariantSchema = z.object({
  sku: z.string(),
  color: z.string(),
  size: z.string(),
  sellingPriceInr: z.number().int(),
  stock: z.number(),
});

export const catalogGetProductOutputSchema = z.object({
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
  images: z.array(z.string()),
  variants: z.array(catalogVariantSchema),
});

const DETAIL_FIELDS =
  'sku name brand category subcategory childCategory basePriceInr gstRate moq description primaryImageUrl imageUrls variants';

/** Same visibility rules as catalog search, narrowed to one id. */
export function catalogProductMongoFilter(productId) {
  return {
    $and: [
      { _id: productId },
      { status: 'active' },
      { 'source.kindOverride': { $ne: 'kit' } },
      tenantCatalogFilter(),
    ],
  };
}

/** Search projection plus the marketing gallery. Production assets are not selected. */
export function toCatalogProductDetail(product) {
  const item = toCatalogSearchItem(product);
  const images = [];
  const seen = new Set();
  const push = (url) => {
    const value = typeof url === 'string' ? url.trim() : '';
    if (!value || seen.has(value)) return;
    seen.add(value);
    images.push(value);
  };
  push(item.primaryImageUrl);
  for (const url of product.imageUrls ?? []) push(url);
  return {
    ...item,
    images,
    description: typeof product.description === 'string' ? product.description.trim() : '',
  };
}

export async function getCatalogProduct(productId) {
  const row = await CatalogProduct.findOne(catalogProductMongoFilter(productId))
    .select(DETAIL_FIELDS)
    .lean();
  if (!row) return null;
  return toCatalogProductDetail(row);
}

export function catalogProductSummary() {
  return [
    'The catalog product card shows this ShelfMerch product.',
    'That card is the only product presentation.',
    'Reply with one short sentence.',
    'Do not add a product card, image preview, variant table, or repeated product details.',
  ].join(' ');
}

export function catalogProductText(product, options = {}) {
  if (options.cardVisible) return catalogProductSummary();
  const variants = product.variants
    .map((variant) => `${variant.sku || variant.size || variant.color || 'variant'} ₹${variant.sellingPriceInr} stock ${variant.stock}`)
    .join(', ');
  const variantNote = variants ? ` variants: ${variants}` : '';
  const gallery = (product.images ?? []).filter((url) => url && url !== product.primaryImageUrl);
  const galleryNote = gallery.length ? ` Additional official images: ${gallery.join(' ')}` : '';
  const information = String(product.description || '').replace(/\s+/g, ' ').trim();
  return [
    `ShelfMerch catalog product. ${CATALOG_INVENTORY_RULE}`,
    `${product.name} [${product.sku}] id ${product.id} ₹${product.sellingPriceInr} incl. GST (${product.gstRate}%) ${product.category}${variantNote} ${officialImageNote(product.primaryImageUrl)}${galleryNote}`,
    `Product information: ${information || 'none'}`,
  ].join('\n');
}

export function catalogProductContent(product, options = {}) {
  return [{ type: 'text', text: catalogProductText(product, options) }];
}

export const CATALOG_LIST_CATEGORIES_DESCRIPTION = [
  'List the active ShelfMerch catalog category hierarchy.',
  'Archived categories are omitted. The tree is Parent, then category, then sub-category.',
].join(' ');

export const catalogListCategoriesInputSchema = z.object({});

export const catalogCategoryNodeSchema = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    sortOrder: z.number().int(),
    description: z.string(),
    children: z.array(catalogCategoryNodeSchema),
  }),
);

export const catalogListCategoriesOutputSchema = z.object({
  categories: z.array(catalogCategoryNodeSchema),
});

function toCatalogCategory(node) {
  return {
    id: String(node._id),
    name: node.name ?? '',
    slug: node.slug ?? '',
    sortOrder: Number(node.sortOrder ?? 0),
    description: node.description || '',
    children: (node.children ?? []).map(toCatalogCategory),
  };
}

export async function listCatalogCategories() {
  const tree = await listPublicCategories();
  return { categories: tree.map(toCatalogCategory) };
}

export function catalogCategoriesText(output) {
  const lines = [];
  const walk = (nodes, depth) => {
    for (const node of nodes) {
      lines.push(`${'  '.repeat(depth)}${node.name}`);
      walk(node.children ?? [], depth + 1);
    }
  };
  walk(output.categories, 0);
  const header = 'Active catalog categories.';
  if (!lines.length) return `${header}\nNo categories.`;
  return [header, ...lines].join('\n');
}
