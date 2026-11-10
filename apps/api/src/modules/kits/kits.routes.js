import { artworkUpload, validateArtworkUpload } from '../../middleware/artwork.middleware.js';
import { Router } from 'express';
import { z } from 'zod';
import { uploader, DOCUMENT_TYPES } from '../../middleware/upload.middleware.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { resolveTenant, requireTenantContext } from '../../middleware/tenant.middleware.js';
import { tenantArea } from '../../middleware/tenantAccess.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { objectId } from '../users/users.validation.js';
import { Kit } from './kit.model.js';
import { PlatformKit } from './platformKit.model.js';
import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { uploadFile } from '../../services/storage.service.js';
import { writeAudit } from '../../services/audit.service.js';
import { ApiError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { sumKitProductPrices } from './kitPricing.js';
import { normalizeVariantImages } from './kitVariantImages.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';

// Allow multiple mockup PNGs (one per kit product) — same cap as collections.
const upload = uploader({ allow: DOCUMENT_TYPES, maxSizeMb: 25, files: 50 });
const router = Router();

router.use(authenticate, resolveTenant, requireTenantContext);
const canWrite = tenantArea('kits', 'write');
const canRead = tenantArea('kits', 'read');
/** Clone a curated platform kit into the tenant workspace for send — ops only. */
const canOperate = tenantArea('campaignOps', 'write');

/** Kit artwork upload during craft (kits write) or curated send (campaignOps write). */
function canUploadKitArtwork(req, _res, next) {
  const role = req.user?.role;
  const allowed = new Set([
    ...rolesForTenantArea('kits', 'write'),
    ...rolesForTenantArea('campaignOps', 'write'),
  ]);
  if (!allowed.has(role)) {
    return next(new ForbiddenError('Kit artwork upload requires kits or campaignOps write access'));
  }
  next();
}

const productRef = z.object({
  catalogProductId: objectId,
  brand: z.string().optional().default(''),
  name: z.string().min(1),
  group: z.string().optional().default(''),
  mockupUrl: z.string().optional().default(''),
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
  placement: z
    .object({
      printCxPct: z.number().finite().optional(),
      printCyPct: z.number().finite().optional(),
      printWPct: z.number().finite().optional(),
      xPct: z.number(),
      yPct: z.number(),
      wPct: z.number(),
      rot: z.number(),
    })
    .nullish(),
});

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(''),
  productRefs: z.array(productRef).min(1),
  designNotes: z.string().optional().default(''),
  packaging: z.enum(['none', 'box']).optional().default('none'),
  kitPrice: z.number().nonnegative().optional(),
  status: z.enum(['draft', 'live', 'archived']).optional().default('draft'),
});

const updateSchema = createSchema.partial();

async function resolveKitPrice(productRefs, clientKitPrice) {
  const ids = (productRefs || []).map((r) => r.catalogProductId).filter(Boolean);
  if (!ids.length) return Math.round(Number(clientKitPrice) || 0);
  const products = await CatalogProduct.find({ _id: { $in: ids } })
    .select('basePriceInr')
    .lean();
  const fromCatalog = sumKitProductPrices(products);
  if (fromCatalog > 0) return fromCatalog;
  return Math.round(Number(clientKitPrice) || 0);
}

function parseCuratedMeta(designNotes) {
  try {
    if (!designNotes) return null;
    const parsed = JSON.parse(designNotes);
    if (parsed && parsed.curated) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

/** Default true when unset — matches historical Send Kit logo requirement. */
function requireLogoFromPlatform(platformKit) {
  return platformKit?.rules?.requireLogo !== false;
}

router.get(
  '/',
  canRead,
  asyncHandler(async (req, res) => {
    res.json(await Kit.find({ tenantId: req.tenantId }).sort({ createdAt: -1 }));
  }),
);

/**
 * Ensure a tenant-scoped clone of a platform curated kit exists for sending.
 * Reuses an existing curated clone when present. Allowed for campaignOps write
 * (entity_manager + super) without granting general kits write.
 *
 * Body may include productRefs resolved from the tenant catalog (preferred).
 * Falls back to platform kit items / active catalog products when needed.
 */
router.post(
  '/from-platform/:platformKitId',
  canOperate,
  validate({
    params: z.object({ platformKitId: objectId }),
    body: z
      .object({
        productRefs: z.array(productRef).min(1).optional(),
      })
      .optional(),
  }),
  asyncHandler(async (req, res) => {
    const platformKitId = String(req.params.platformKitId);
    const platformKit = await PlatformKit.findOne({ _id: platformKitId, status: 'active' });
    if (!platformKit) throw new NotFoundError('Curated kit not found');

    const existing = await Kit.find({ tenantId: req.tenantId }).sort({ createdAt: -1 });
    const reuse = existing.find((k) => {
      const meta = parseCuratedMeta(k.designNotes);
      return meta && String(meta.originalId) === platformKitId;
    });
    if (reuse) {
      // Keep clone in sync with live requireLogo so toggles apply to existing clones.
      const requireLogo = requireLogoFromPlatform(platformKit);
      const meta = parseCuratedMeta(reuse.designNotes) || {
        curated: true,
        originalId: platformKitId,
      };
      if (meta.requireLogo !== requireLogo) {
        reuse.designNotes = JSON.stringify({ ...meta, requireLogo });
        await reuse.save();
      }
      return res.json(reuse);
    }

    let productRefs = Array.isArray(req.body?.productRefs) ? [...req.body.productRefs] : [];

    if (productRefs.length === 0) {
      const catalogIds = (platformKit.items || [])
        .map((item) => item.catalogProductId)
        .filter(Boolean);
      const products = catalogIds.length
        ? await CatalogProduct.find({ _id: { $in: catalogIds } }).lean()
        : [];
      const byId = new Map(products.map((p) => [String(p._id), p]));

      for (const item of platformKit.items || []) {
        const pid = item.catalogProductId;
        if (!pid) continue;
        const product = byId.get(String(pid));
        productRefs.push({
          catalogProductId: pid,
          brand: product?.brand || '',
          name: product?.name || 'Product',
          group: product?.category || product?.group || '',
        });
      }
    }

    // Shopify-imported curated kits often have empty `items`. Do not invent
    // tenant catalog productRefs — curated fulfillment uses designNotes
    // (itemImages / approxValueInr) when productRefs stay empty.

    const heroImage = String(platformKit.heroImage || '').trim() || platformKit.imageUrls?.[0] || '';
    const itemImages = Array.isArray(platformKit.itemImages)
      ? platformKit.itemImages.map((it) => ({
          imageUrl: it.imageUrl,
          label: it.label || '',
        }))
      : [];
    const variantImages = normalizeVariantImages(platformKit.variantImages);
    const galleryImages = Array.isArray(platformKit.galleryImages) ? [...platformKit.galleryImages] : [];

    const designNotes = JSON.stringify({
      curated: true,
      originalId: platformKitId,
      description: platformKit.description || '',
      approxValueInr: Math.round(Number(platformKit.approxValueInr) || 0),
      imageUrls: platformKit.imageUrls || [],
      heroImage,
      galleryImages,
      itemImages,
      variantImages,
      requireLogo: requireLogoFromPlatform(platformKit),
    });

    const curatedPrice = Math.round(Number(platformKit.approxValueInr) || 0);

    const kit = await Kit.create({
      tenantId: req.tenantId,
      name: platformKit.name,
      description: platformKit.description || '',
      productRefs,
      packaging: platformKit.packaging === 'none' ? 'none' : 'box',
      designNotes,
      status: 'live',
      artworkUrl: heroImage,
      kitPrice: curatedPrice > 0 ? curatedPrice : await resolveKitPrice(productRefs, 0),
    });

    writeAudit({
      req,
      action: 'kit.clone_curated',
      entityType: 'Kit',
      entityId: kit._id,
      after: kit.toObject(),
    });
    res.status(201).json(kit);
  }),
);

router.post(
  '/',
  canWrite,
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const kitPrice = await resolveKitPrice(req.body.productRefs, req.body.kitPrice);
    const kit = await Kit.create({
      tenantId: req.tenantId,
      ...req.body,
      kitPrice,
    });
    writeAudit({ req, action: 'kit.create', entityType: 'Kit', entityId: kit._id, after: kit.toObject() });
    res.status(201).json(kit);
  }),
);

router.patch(
  '/:id',
  canWrite,
  validate({ params: z.object({ id: objectId }), body: updateSchema }),
  asyncHandler(async (req, res) => {
    const kit = await Kit.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!kit) throw new NotFoundError('Kit not found');
    const before = kit.toObject();
    Object.assign(kit, req.body);
    if (req.body.productRefs || req.body.kitPrice != null) {
      kit.kitPrice = await resolveKitPrice(kit.productRefs, req.body.kitPrice ?? kit.kitPrice);
    }
    await kit.save();
    writeAudit({ req, action: 'kit.update', entityType: 'Kit', entityId: kit._id, before, after: kit.toObject() });
    res.json(kit);
  }),
);

router.post(
  '/:id/artwork',
  canUploadKitArtwork,
  validate({ params: z.object({ id: objectId }) }),
  artworkUpload.single('artwork'),
  asyncHandler(async (req, res) => {
    validateArtworkUpload(req.file);
    const kit = await Kit.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!kit) throw new NotFoundError('Kit not found');
    const { url } = await uploadFile({ tenantId: req.tenantId, kind: 'artwork', file: req.file });
    kit.artworkUrl = url;
    // Mark curated clones so send-flow can require a real tenant logo (not platform hero).
    try {
      const meta = kit.designNotes ? JSON.parse(kit.designNotes) : null;
      if (meta && typeof meta === 'object' && meta.curated) {
        kit.designNotes = JSON.stringify({ ...meta, brandLogoUploaded: true, brandLogoUrl: url });
      }
    } catch {
      /* leave designNotes unchanged */
    }
    await kit.save();
    writeAudit({ req, action: 'kit.artwork', entityType: 'Kit', entityId: kit._id, after: { artworkUrl: url } });
    res.json(kit);
  }),
);

const mockupMetaItem = z.object({
  catalogProductId: objectId,
  placement: z
    .object({
      printCxPct: z.number().finite().optional(),
      printCyPct: z.number().finite().optional(),
      printWPct: z.number().finite().optional(),
      xPct: z.number().finite(),
      yPct: z.number().finite(),
      wPct: z.number().finite(),
      rot: z.number().finite(),
    })
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
});

router.post(
  '/:id/mockups',
  canWrite,
  validate({ params: z.object({ id: objectId }) }),
  upload.fields([
    { name: 'mockups', maxCount: 50 },
    { name: 'designOnly', maxCount: 50 },
  ]),
  asyncHandler(async (req, res) => {
    const kit = await Kit.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!kit) throw new NotFoundError('Kit not found');
    const files = req.files?.mockups || [];
    const designFiles = req.files?.designOnly || [];
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
    for (let i = 0; i < files.length; i++) {
      const { catalogProductId, placement, printSpec, hasDesignOnly } = meta[i];
      const { url } = await uploadFile({ tenantId: req.tenantId, kind: 'mockup', file: files[i] });
      const ref = kit.productRefs.find(
        (r) => String(r.catalogProductId) === String(catalogProductId),
      );
      if (ref) {
        ref.mockupUrl = url;
        if (placement) ref.placement = placement;
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
    kit.markModified('productRefs');
    await kit.save();
    writeAudit({
      req,
      action: 'kit.mockups',
      entityType: 'Kit',
      entityId: kit._id,
      after: { mockupCount: files.length, designOnlyCount: designIdx },
    });
    res.json(kit);
  }),
);

export default router;
