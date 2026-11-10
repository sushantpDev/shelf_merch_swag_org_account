import { artworkUpload, validateArtworkUpload } from '../../middleware/artwork.middleware.js';
import { Router } from 'express';
import { z } from 'zod';
import { uploader, DOCUMENT_TYPES } from '../../middleware/upload.middleware.js';
import crypto from 'node:crypto';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { resolveTenant, requireTenantContext } from '../../middleware/tenant.middleware.js';
import { tenantArea } from '../../middleware/tenantAccess.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { objectId } from '../users/users.validation.js';
import { Collection } from './collection.model.js';
import { Shop } from '../shops/shop.model.js';
import { uploadFile } from '../../services/storage.service.js';
import { writeAudit } from '../../services/audit.service.js';
import { NotFoundError, ApiError } from '../../utils/errors.js';
import { collectionsForShopFilter, isCollectionLinkedToAnyShop, mergeProductRefsPreservingDesign } from './collectionQueries.js';
import { publishCollectionToShop, unpublishCollectionFromShop, syncCollectionPublishTargets, unlinkCollectionFromAllShops } from '../shops/shopCatalogSync.js';
import { Order } from '../orders/order.model.js';

const router = Router();

router.use(authenticate, resolveTenant, requireTenantContext);
const canWrite = tenantArea('swag', 'write');
const canRead = tenantArea('swag', 'read');

const placementShape = z.object({
  printCxPct: z.number().finite().optional(),
  printCyPct: z.number().finite().optional(),
  printWPct: z.number().finite().optional(),
  xPct: z.number(),
  yPct: z.number(),
  wPct: z.number(),
  rot: z.number(),
  artworkUrl: z.string().optional(),
});

const productRef = z.object({
  catalogProductId: objectId,
  brand: z.string().optional().default(''),
  name: z.string().min(1),
  group: z.string().optional().default(''),
  mockupUrl: z.string().optional().default(''),
  mockupBackUrl: z.string().optional().default(''),
  // Konva artwork placement — carried so shop-specific collections (Add to shop)
  // recolour live colour variants at the same size/position as the baked mockup.
  placement: placementShape.nullish(),
  placements: z
    .array(
      placementShape.extend({
        key: z.string().min(1),
      }),
    )
    .optional()
    .default([]),
  designOnlyImageUrl: z.string().optional().default(''),
  printSpec: z
    .object({
      widthIn: z.number().positive(),
      heightIn: z.number().positive(),
      dpi: z.number().int().positive(),
      widthPx: z.number().int().positive(),
      heightPx: z.number().int().positive(),
    })
    .nullish(),
});

const createSchema = z.object({
  shopId: objectId.optional(),
  name: z.string().min(1),
  productRefs: z.array(productRef).min(1),
  preferredColors: z.array(z.string().min(1)).optional().default([]),
  artworkUrl: z.string().optional().default(''),
  isShopSpecific: z.boolean().optional(),
});

router.get(
  '/',
  canRead,
  validate({ query: z.object({ shopId: objectId.optional() }) }),
  asyncHandler(async (req, res) => {
    const filter = {
      tenantId: req.tenantId,
      ...(req.query.shopId
        ? { $or: [{ shopId: req.query.shopId }, { shopIds: req.query.shopId }] }
        : {}),
    };
    res.json(await Collection.find(filter).sort({ createdAt: -1 }));
  }),
);

router.post(
  '/',
  canWrite,
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    let shopId = null;
    if (req.body.shopId) {
      const shop = await Shop.findOne({ _id: req.body.shopId, tenantId: req.tenantId });
      if (!shop) throw new NotFoundError('Shop not found');
      shopId = shop._id;
    }
    const artworkUrl = req.body.artworkUrl || '';
    if (shopId && req.body.isShopSpecific && req.body.productRefs?.length) {
      const catalogProductId = req.body.productRefs[0].catalogProductId;
      const duplicate = await Collection.findOne({
        ...collectionsForShopFilter(shopId),
        tenantId: req.tenantId,
        status: { $ne: 'archived' },
        artworkUrl,
        'productRefs.catalogProductId': catalogProductId,
      });
      if (duplicate) {
        throw new ApiError(400, 'This product is already in this shop', 'PRODUCT_ALREADY_IN_SHOP');
      }
    }
    const collection = await Collection.create({
      tenantId: req.tenantId,
      shopId,
      shopIds: shopId ? [shopId] : [],
      code: `C${crypto.randomInt(100_000_000, 999_999_999)}`,
      name: req.body.name,
      productRefs: req.body.productRefs,
      preferredColors: req.body.preferredColors || [],
      artworkUrl,
      status: artworkUrl ? 'ready' : 'draft',
      createdBy: req.user.userId,
      isShopSpecific: req.body.isShopSpecific || false,
    });
    if (shopId && req.body.productRefs?.length) {
      await publishCollectionToShop(shopId, req.tenantId, collection);
    }
    writeAudit({ req, action: 'collection.create', entityType: 'Collection', entityId: collection._id, after: collection.toObject() });
    res.status(201).json(collection);
  }),
);

const patchSchema = z.object({
  shopId: objectId.optional(),
  status: z.enum(['draft', 'ready', 'archived']).optional(),
  name: z.string().min(1).optional(),
  productRefs: z.array(productRef).min(1).optional(),
});

router.patch(
  '/:id',
  canWrite,
  validate({ params: z.object({ id: objectId }), body: patchSchema }),
  asyncHandler(async (req, res) => {
    const collection = await Collection.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!collection) throw new NotFoundError('Collection not found');
    let linkedShopId = null;
    if (req.body.shopId) {
      const shop = await Shop.findOne({ _id: req.body.shopId, tenantId: req.tenantId });
      if (!shop) throw new NotFoundError('Shop not found');
      const shopKey = String(shop._id);
      let nextIds = [...(collection.shopIds || [])];
      const linked = nextIds.map(String);
      if (!linked.length && collection.shopId) nextIds = [collection.shopId];
      if (!nextIds.map(String).includes(shopKey)) {
        nextIds.push(shop._id);
        linkedShopId = shop._id;
      }
      collection.shopIds = nextIds;
      if (!collection.shopId) collection.shopId = shop._id;
    }
    if (req.body.name || req.body.productRefs) {
      // Drafts and ready-but-unpublished collections can still be refined in the
      // swag editor (artwork save promotes status to ready before Publish).
      // Once linked to a shop, content edits stay locked.
      const linkedToShop = isCollectionLinkedToAnyShop(collection);
      const canEditContents = collection.status === 'draft'
        || (collection.status === 'ready' && !linkedToShop);
      if (!canEditContents) {
        throw new ApiError(400, 'Only draft collections can be edited', 'COLLECTION_NOT_DRAFT');
      }
      if (req.body.name) collection.name = req.body.name;
      if (req.body.productRefs) {
        collection.productRefs = mergeProductRefsPreservingDesign(
          collection.productRefs,
          req.body.productRefs,
        );
      }
    }
    if (req.body.status) collection.status = req.body.status;
    await collection.save();
    if (linkedShopId) {
      await publishCollectionToShop(linkedShopId, req.tenantId, collection);
    }
    writeAudit({ req, action: 'collection.update', entityType: 'Collection', entityId: collection._id, after: collection.toObject() });
    res.json(collection);
  }),
);

router.post(
  '/:id/publish',
  canWrite,
  validate({
    params: z.object({ id: objectId }),
    body: z
      .object({
        shopId: objectId.optional(),
        shopIds: z.array(objectId).optional(),
      })
      .refine((b) => b.shopId || b.shopIds !== undefined, {
        message: 'Provide shopId or shopIds',
      }),
  }),
  asyncHandler(async (req, res) => {
    const collection = await Collection.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!collection) throw new NotFoundError('Collection not found');

    const shopIds = req.body.shopIds !== undefined
      ? req.body.shopIds.map(String)
      : [String(req.body.shopId)];

    for (const sid of shopIds) {
      const shop = await Shop.findOne({ _id: sid, tenantId: req.tenantId });
      if (!shop) throw new NotFoundError('Shop not found');
    }

    let updated;
    if (req.body.shopIds !== undefined) {
      updated = await syncCollectionPublishTargets(collection._id, req.tenantId, shopIds);
    } else {
      await publishCollectionToShop(shopIds[0], req.tenantId, collection);
      updated = await Collection.findOne({ _id: collection._id, tenantId: req.tenantId });
    }

    writeAudit({
      req,
      action: 'collection.publish',
      entityType: 'Collection',
      entityId: collection._id,
      after: { shopIds },
    });
    res.json(updated);
  }),
);

router.post(
  '/:id/unpublish',
  canWrite,
  validate({
    params: z.object({ id: objectId }),
    body: z.object({ shopId: objectId }),
  }),
  asyncHandler(async (req, res) => {
    const collection = await Collection.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!collection) throw new NotFoundError('Collection not found');
    const shop = await Shop.findOne({ _id: req.body.shopId, tenantId: req.tenantId });
    if (!shop) throw new NotFoundError('Shop not found');
    await unpublishCollectionFromShop(shop._id, req.tenantId, collection);
    const updated = await Collection.findOne({ _id: collection._id, tenantId: req.tenantId });
    writeAudit({
      req,
      action: 'collection.unpublish',
      entityType: 'Collection',
      entityId: collection._id,
      after: { shopId: shop._id },
    });
    res.json(updated);
  }),
);

router.post(
  '/:id/archive',
  canWrite,
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    const collection = await Collection.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!collection) throw new NotFoundError('Collection not found');
    collection.status = 'archived';
    await collection.save();
    writeAudit({ req, action: 'collection.archive', entityType: 'Collection', entityId: collection._id, after: { status: 'archived' } });
    res.json(collection);
  }),
);

router.post(
  '/:id/restore',
  canWrite,
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    const collection = await Collection.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!collection) throw new NotFoundError('Collection not found');
    collection.status = collection.artworkUrl ? 'ready' : 'draft';
    await collection.save();
    writeAudit({ req, action: 'collection.restore', entityType: 'Collection', entityId: collection._id, after: { status: collection.status } });
    res.json(collection);
  }),
);

router.delete(
  '/:id',
  canWrite,
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    let collection = await Collection.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!collection) throw new NotFoundError('Collection not found');

    const orderCount = await Order.countDocuments({
      tenantId: req.tenantId,
      'items.collectionId': collection._id,
    });
    if (orderCount > 0) {
      throw new ApiError(
        409,
        'This collection cannot be deleted because products from it have been ordered.',
        'COLLECTION_HAS_ORDERS',
      );
    }

    collection = await unlinkCollectionFromAllShops(collection, req.tenantId);
    if (!collection) throw new NotFoundError('Collection not found');

    await collection.softDelete();
    writeAudit({ req, action: 'collection.delete', entityType: 'Collection', entityId: collection._id });
    res.status(204).send();
  }),
);

// §7.6 — artwork upload flips the collection to "ready".
router.post(
  '/:id/artwork',
  canWrite,
  validate({ params: z.object({ id: objectId }) }),
  artworkUpload.single('artwork'),
  asyncHandler(async (req, res) => {
    validateArtworkUpload(req.file);
    const collection = await Collection.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!collection) throw new NotFoundError('Collection not found');
    if (isCollectionLinkedToAnyShop(collection)) {
      throw new ApiError(
        409,
        'Published collections cannot change artwork here. Unpublish from shops first, or create a new design.',
        'COLLECTION_PUBLISHED',
      );
    }
    const { url } = await uploadFile({ tenantId: req.tenantId, kind: 'artwork', file: req.file });
    collection.artworkUrl = url;
    collection.status = 'ready';
    await collection.save();
    writeAudit({ req, action: 'collection.artwork', entityType: 'Collection', entityId: collection._id, after: { artworkUrl: url, status: 'ready' } });
    res.json(collection);
  }),
);

const mockupMetaItem = z.object({
  catalogProductId: objectId,
  // Placement baked into this mockup — print-area % preferred.
  placement: placementShape.optional(),
  placements: z
    .array(
      placementShape.extend({
        key: z.string().min(1),
        /** When true, next `areaArts` file is uploaded and stored on this placement. */
        hasArtwork: z.boolean().optional(),
      }),
    )
    .optional(),
  printSpec: z
    .object({
      widthIn: z.number().positive(),
      heightIn: z.number().positive(),
      dpi: z.number().int().positive(),
      widthPx: z.number().int().positive(),
      heightPx: z.number().int().positive(),
    })
    .optional(),
  hasDesignOnly: z.boolean().optional(),
  hasMockupBack: z.boolean().optional(),
});

const mockupUpload = uploader({ allow: DOCUMENT_TYPES, maxSizeMb: 25, files: 200 });

// Upload pre-baked product mockups (one PNG per catalog product in the collection).
// Optional `designOnly` files are print-DPI transparent PNGs (inches × dpi).
// Optional `areaArts` files are per print-area artworks (colour-tint live composite).
// Optional `mockupsBack` files are back-view baked mockups (paired via hasMockupBack).
router.post(
  '/:id/mockups',
  canWrite,
  validate({ params: z.object({ id: objectId }) }),
  mockupUpload.fields([
    { name: 'mockups', maxCount: 50 },
    { name: 'mockupsBack', maxCount: 50 },
    { name: 'designOnly', maxCount: 50 },
    { name: 'areaArts', maxCount: 100 },
  ]),
  asyncHandler(async (req, res) => {
    const collection = await Collection.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!collection) throw new NotFoundError('Collection not found');
    if (isCollectionLinkedToAnyShop(collection)) {
      throw new ApiError(
        409,
        'Published collections cannot change mockups here. Unpublish from shops first, or create a new design.',
        'COLLECTION_PUBLISHED',
      );
    }
    const files = req.files?.mockups || [];
    const backFiles = req.files?.mockupsBack || [];
    const designFiles = req.files?.designOnly || [];
    const areaArtFiles = req.files?.areaArts || [];
    // Validate all source artwork before persisting any files in this batch.
    areaArtFiles.forEach(validateArtworkUpload);
    let meta;
    try {
      meta = mockupMetaItem.array().parse(JSON.parse(req.body.meta || '[]'));
    } catch {
      throw new ApiError(400, 'Invalid mockup metadata', 'MOCKUP_META_INVALID');
    }
    if (meta.length !== files.length) {
      throw new ApiError(400, 'Mockup file count does not match metadata', 'MOCKUP_COUNT_MISMATCH');
    }
    let designIdx = 0;
    let areaArtIdx = 0;
    let backIdx = 0;
    for (let i = 0; i < files.length; i++) {
      const { catalogProductId, placement, placements, printSpec, hasDesignOnly, hasMockupBack } = meta[i];
      const { url } = await uploadFile({ tenantId: req.tenantId, kind: 'mockup', file: files[i] });
      const ref = collection.productRefs.find(
        (r) => String(r.catalogProductId) === String(catalogProductId),
      );
      if (ref) {
        ref.mockupUrl = url;
        if (hasMockupBack && backFiles[backIdx]) {
          const back = await uploadFile({
            tenantId: req.tenantId,
            kind: 'mockup',
            file: backFiles[backIdx],
          });
          ref.mockupBackUrl = back.url;
          backIdx += 1;
        }
        if (placement) ref.placement = placement;
        if (Array.isArray(placements) && placements.length) {
          const saved = [];
          for (const row of placements) {
            const { hasArtwork, artworkUrl: existingArt, ...rest } = row;
            let artworkUrl = existingArt || '';
            if (hasArtwork && areaArtFiles[areaArtIdx]) {
              const art = await uploadFile({
                tenantId: req.tenantId,
                kind: 'artwork',
                file: areaArtFiles[areaArtIdx],
              });
              artworkUrl = art.url;
              areaArtIdx += 1;
            }
            saved.push({ ...rest, ...(artworkUrl ? { artworkUrl } : {}) });
          }
          ref.placements = saved;
          const primary = saved[0];
          if (primary && !placement) {
            const { key: _k, artworkUrl: _a, ...pl } = primary;
            ref.placement = pl;
          }
        } else if (placement) {
          ref.placements = [{ key: 'area_1', ...placement }];
        }
        if (printSpec) ref.printSpec = printSpec;
        if (hasDesignOnly && designFiles[designIdx]) {
          const design = await uploadFile({
            tenantId: req.tenantId,
            kind: 'production',
            file: designFiles[designIdx],
          });
          ref.designOnlyImageUrl = design.url;
          designIdx += 1;
        }
      }
    }
    collection.markModified('productRefs');
    // Designs saved — promote out of draft so the swag list treats it as ready.
    if (collection.status === 'draft') {
      collection.status = 'ready';
    }
    await collection.save();
    writeAudit({
      req,
      action: 'collection.mockups',
      entityType: 'Collection',
      entityId: collection._id,
      after: {
        mockupCount: files.length,
        mockupBackCount: backIdx,
        designOnlyCount: designIdx,
        areaArtCount: areaArtIdx,
        status: collection.status,
      },
    });
    res.json(collection);
  }),
);

export default router;
