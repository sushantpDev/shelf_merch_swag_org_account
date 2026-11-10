import mongoose from 'mongoose';

export const PRODUCT_STATUSES = ['draft', 'active', 'archived', 'discontinued'];
export const INVENTORY_MODES = ['physical', 'made_to_order'];
export const CUSTOMIZATION_METHODS = [
  'screen_print',
  'dtf',
  'embroidery',
  'engraving',
  'sublimation',
  'uv_print',
];

/**
 * Internal-only fields (cost, supplier) are `select: false` so they can never
 * leak into tenant/public responses by accident (non-negotiable #3). Platform
 * services opt in with `.select(INTERNAL_PRODUCT_FIELDS)`.
 */
export const INTERNAL_PRODUCT_FIELDS = '+costPriceInr +supplierName';

// Platform-wide master catalog — intentionally NOT tenant-scoped (§5.3).
const catalogProductSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, unique: true },
    skuPrefix: { type: String, default: '' },
    slug: { type: String, default: '', index: true },
    brand: { type: String, default: '' },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    keyFeatures: { type: String, default: '' },
    sizeGuide: { type: String, default: '' },
    // Primary placement (denormalized path for browse/compat).
    category: { type: String, default: '', index: true },
    subcategory: { type: String, default: '', index: true },
    childCategory: { type: String, default: '', index: true },
    // All taxonomy placements — product can belong to multiple categories.
    categoryIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
      default: [],
    },
    // Names along every assigned path (root→leaf) for sync category filters.
    categoryLabels: { type: [String], default: [] },
    group: { type: String, default: '' }, // icon group, e.g. "tee", "mug", "hoodie"
    // basePriceInr is the tenant-facing selling price (kept as the historical
    // field name; the platform API exposes it as sellingPriceInr).
    basePriceInr: { type: Number, required: true },
    costPriceInr: { type: Number, default: 0, select: false },
    supplierName: { type: String, default: '', select: false },
    gstRate: { type: Number, default: 18 },
    hsnCode: { type: String, default: '' },
    moq: { type: Number, default: 1 },
    material: { type: String, default: '' },
    printableAreas: { type: [String], default: [] },
    customizationMethods: { type: [String], default: [] },
    productionDays: { type: Number, default: 7 },
    customization: [
      {
        method: { type: String, enum: CUSTOMIZATION_METHODS, required: true },
        printableArea: { type: String, default: '' },
        extraCostInr: { type: Number, default: 0 },
      },
    ],
    // Physical product frame in inches — source of truth for the editor grid.
    physicalDimensions: {
      width: { type: Number, default: 20 },
      height: { type: Number, default: 24 },
      length: { type: Number, default: 18 },
    },
    // Product-level print DPI (production assets = inches × dpi).
    dpi: { type: Number, default: 300 },
    // POD design-placeholder geometry. Inches (xIn/yIn/widthIn/heightIn) are
    // the source of truth; box % and max*Cm are derived for legacy readers.
    // `printableAreas` (names) is derived from labels.
    printAreas: [
      {
        key: { type: String, default: '' },
        label: { type: String, default: '' },
        mockupImageUrl: { type: String, default: '' },
        xIn: { type: Number, default: 0 },
        yIn: { type: Number, default: 0 },
        widthIn: { type: Number, default: 0 },
        heightIn: { type: Number, default: 0 },
        rotationDeg: { type: Number, default: 0 },
        scale: { type: Number, default: 1 },
        lockSize: { type: Boolean, default: false },
        shapeType: { type: String, enum: ['rect', 'polygon'], default: 'rect' },
        polygonPoints: [
          {
            xIn: { type: Number, default: 0 },
            yIn: { type: Number, default: 0 },
          },
        ],
        box: {
          xPct: { type: Number, default: 0 },
          yPct: { type: Number, default: 0 },
          widthPct: { type: Number, default: 0 },
          heightPct: { type: Number, default: 0 },
        },
        maxWidthCm: { type: Number, default: 0 },
        maxHeightCm: { type: Number, default: 0 },
        dpi: { type: Number, default: 300 },
        methods: [{ type: String, enum: CUSTOMIZATION_METHODS }],
      },
    ],
    variants: [
      {
        color: String,
        colorHex: { type: String, default: '' },
        size: String,
        material: String,
        sku: String,
        priceOverrideInr: { type: Number, default: null },
        stock: { type: Number, default: 0 },
        /** When false, hidden from tenant/storefront catalog responses. */
        enabled: { type: Boolean, default: true },
      },
    ],
    imageUrls: { type: [String], default: [] },
    primaryImageUrl: { type: String, default: '' },
    // Production imagery is separate from primaryImageUrl/imageUrls (marketing).
    // baseImageUrl / maskImageUrl = front; *Back* / *Left* / *Right* = optional side views.
    // mask* is the transparent PNG used for design/production; base* is the visible stage.
    baseImageUrl: { type: String, default: '' },
    maskImageUrl: { type: String, default: '' },
    baseBackImageUrl: { type: String, default: '' },
    maskBackImageUrl: { type: String, default: '' },
    baseLeftImageUrl: { type: String, default: '' },
    maskLeftImageUrl: { type: String, default: '' },
    baseRightImageUrl: { type: String, default: '' },
    maskRightImageUrl: { type: String, default: '' },
    // §3.2 — available/reserved are derived from InventoryTransactions only.
    inventory: {
      mode: { type: String, enum: INVENTORY_MODES, default: 'physical' },
      available: { type: Number, default: 0 },
      reserved: { type: Number, default: 0 },
      lowStockThreshold: { type: Number, default: 10 },
    },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
    status: { type: String, enum: PRODUCT_STATUSES, default: 'active' },
    // Provenance — set when a product is imported (e.g. Shopify) for dedupe.
    source: {
      provider: { type: String, default: 'manual' }, // 'manual' | 'shopify'
      domain: { type: String, default: '' },
      externalId: { type: String, default: '' }, // Shopify product id (string)
      handle: { type: String, default: '' },
      categoryAssignedByAdmin: { type: Boolean, default: false },
      // Manual Catalog ↔ Kits choice; import must not reclassify when set.
      kindOverride: { type: String, enum: ['catalog', 'kit'], default: undefined },
    },
  },
  { timestamps: true },
);

catalogProductSchema.index({ status: 1, category: 1 });
catalogProductSchema.index({ status: 1, basePriceInr: 1 });
catalogProductSchema.index({ categoryIds: 1 });
catalogProductSchema.index({ categoryLabels: 1 });
catalogProductSchema.index({ 'source.provider': 1, 'source.externalId': 1 });

export const CatalogProduct = mongoose.model('CatalogProduct', catalogProductSchema);
