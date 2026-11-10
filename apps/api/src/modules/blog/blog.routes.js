import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { resolveTenant, blockDuringImpersonation } from '../../middleware/tenant.middleware.js';
import { platformArea } from '../../middleware/platformAccess.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { uploader, IMAGE_TYPES } from '../../middleware/upload.middleware.js';
import { uploadFile } from '../../services/storage.service.js';
import { writeAudit } from '../../services/audit.service.js';
import { ApiError, ConflictError, NotFoundError } from '../../utils/errors.js';
import { objectId } from '../users/users.validation.js';
import { BlogPost } from './blogPost.model.js';
import { BlogAsset } from './blogAsset.model.js';
import { blogPlainText, validateBlogContent } from './blogContent.js';
import { assertSeoPublication } from '../seoGrowth/seoGrowth.approval.js';
import { SeoContent, SeoJob, SeoKeyword, SCOPE } from '../seoGrowth/seoGrowth.models.js';

const router = Router();
router.use(authenticate, resolveTenant, platformArea('blog', 'read'));
const blogWrite = [platformArea('blog', 'write'), blockDuringImpersonation];
const idParam = z.object({ id: objectId });
const slug = z.string().min(3).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const postFields = z.object({
  slug,
  title: z.string().trim().min(1).max(180),
  excerpt: z.string().trim().max(400).default(''),
  content: z.unknown().default({ type: 'doc', content: [] }),
  authorName: z.string().trim().max(100).default('ShelfMerch'),
  coverImageUrl: z.string().max(2000).default(''),
  coverImageAlt: z.string().trim().max(200).default(''),
  seoTitle: z.string().trim().max(180).default(''),
  seoDescription: z.string().trim().max(400).default(''),
});
// Use fields without create defaults: Zod retains defaults through .partial(),
// which would otherwise clear an existing article on a one-field edit.
const patchFields = z.object({
  slug,
  title: z.string().trim().min(1).max(180),
  excerpt: z.string().trim().max(400),
  content: z.unknown(),
  authorName: z.string().trim().max(100),
  coverImageUrl: z.string().max(2000),
  coverImageAlt: z.string().trim().max(200),
  seoTitle: z.string().trim().max(180),
  seoDescription: z.string().trim().max(400),
}).partial().refine((value) => Object.keys(value).length > 0);

async function validateAssets(fields) {
  const urls = new Set(fields.content ? validateBlogContent(fields.content) : []);
  if (fields.coverImageUrl) {
    if (!fields.coverImageAlt) {
      throw new ApiError(422, 'Cover image needs alt text', 'INVALID_BLOG_IMAGE');
    }
    urls.add(fields.coverImageUrl);
  }
  if (!urls.size) return;
  const count = await BlogAsset.countDocuments({ url: { $in: [...urls] } });
  if (count !== urls.size) {
    throw new ApiError(422, 'Use images uploaded through the blog editor', 'INVALID_BLOG_IMAGE');
  }
}

function handleDuplicate(err) {
  if (err?.code === 11000) throw new ConflictError('Blog slug is already in use');
  throw err;
}

router.get('/', validate({ query: z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}) }), asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const [items, total] = await Promise.all([
    BlogPost.find().select('-content').sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    BlogPost.countDocuments(),
  ]);
  res.json({ items, total, page, limit });
}));

router.get('/:id', validate({ params: idParam }), asyncHandler(async (req, res) => {
  const post = await BlogPost.findById(req.params.id).lean();
  if (!post) throw new NotFoundError('Blog post not found');
  res.json(post);
}));

router.post('/', ...blogWrite, validate({ body: postFields }), asyncHandler(async (req, res) => {
  await validateAssets(req.body);
  try {
    const post = await BlogPost.create(req.body);
    writeAudit({ req, action: 'blog.create', entityType: 'BlogPost', entityId: post._id });
    res.status(201).json(post);
  } catch (err) { handleDuplicate(err); }
}));

router.patch('/:id', ...blogWrite, validate({ params: idParam, body: patchFields }), asyncHandler(async (req, res) => {
  const post = await BlogPost.findById(req.params.id);
  if (!post) throw new NotFoundError('Blog post not found');
  if (post.seoManaged && post.publishedAt) {
    throw new ConflictError(
      'Unpublish this SEO-managed article before editing it.',
    );
  }
  if (post.publishedAt && req.body.slug && req.body.slug !== post.slug) {
    throw new ConflictError('Slug cannot change after publication');
  }
  const next = { ...post.toObject(), ...req.body };
  await validateAssets(next);
  if (post.status === 'published' && (!next.excerpt || !blogPlainText(next.content))) {
    throw new ApiError(422, 'Published articles need an excerpt and article content', 'INCOMPLETE_BLOG_POST');
  }
  Object.assign(post, req.body);
  if (post.seoManaged) {
    post.seoApprovedHash = '';
    await SeoContent.updateOne(
      { scope: SCOPE, articleId: post._id },
      { $set: { approvedHash: '', status: 'review' } },
    );
  }
  try {
    await post.save();
  } catch (err) { handleDuplicate(err); }
  writeAudit({ req, action: 'blog.update', entityType: 'BlogPost', entityId: post._id });
  res.json(post);
}));

router.post('/:id/publish', ...blogWrite, validate({ params: idParam }), asyncHandler(async (req, res) => {
  const post = await BlogPost.findById(req.params.id);
  if (!post) throw new NotFoundError('Blog post not found');
  await validateAssets(post.toObject());
  if (!post.excerpt || !blogPlainText(post.content)) {
    throw new ApiError(422, 'Add an excerpt and article content before publishing', 'INCOMPLETE_BLOG_POST');
  }
  await assertSeoPublication(post);
  post.status = 'published';
  post.publishedAt ||= new Date();
  await post.save();
  writeAudit({ req, action: 'blog.publish', entityType: 'BlogPost', entityId: post._id });
  res.json(post);
}));

router.post('/:id/unpublish', ...blogWrite, validate({ params: idParam }), asyncHandler(async (req, res) => {
  const post = await BlogPost.findById(req.params.id);
  if (!post) throw new NotFoundError('Blog post not found');
  post.status = 'draft';
  await post.save();
  writeAudit({ req, action: 'blog.unpublish', entityType: 'BlogPost', entityId: post._id });
  res.json(post);
}));

router.delete('/:id', ...blogWrite, validate({ params: idParam }), asyncHandler(async (req, res) => {
  await mongoose.connection.transaction(async (session) => {
    const post = await BlogPost.findById(req.params.id).session(session);
    if (!post) throw new NotFoundError('Blog post not found');
    if (post.status !== 'draft') {
      throw new ConflictError('Unpublish this article before deleting it.');
    }
    const contents = await SeoContent.find({ scope: SCOPE, articleId: post._id }).session(session);
    const jobs = await SeoJob.find({
      scope: SCOPE,
      $or: [{ articleId: post._id }, { _id: { $in: contents.map((item) => item.jobId) } }],
    }).session(session);
    if (jobs.some((job) => ['queued', 'running', 'retry'].includes(job.status))) {
      throw new ConflictError('Research or regeneration is in progress for this draft. Wait for it to finish before deleting.');
    }

    await BlogPost.deleteOne({ _id: post._id, status: 'draft' }, { session });
    await SeoContent.deleteMany({ scope: SCOPE, articleId: post._id }, { session });
    // Keep execution history and usage reservations, but prevent a retry from
    // restoring a draft that an administrator intentionally deleted.
    await SeoJob.updateMany({ scope: SCOPE, _id: { $in: jobs.map((job) => job._id) } }, {
      $set: { status: 'completed', stage: 'draft_deleted', reason: 'Draft deleted by an administrator.', error: '', leaseUntil: null },
      $unset: { articleId: 1, owner: 1 },
    }, { session });
    const keywordIds = [...contents, ...jobs].map((item) => item.keywordId).filter(Boolean);
    // The editor can change an unpublished slug without changing the original
    // generated URL stored on the keyword.
    const draftUrls = [post.slug, ...contents.map((item) => item.generated?.slug), ...jobs.map((item) => item.generated?.slug)]
      .filter(Boolean).map((value) => `https://shelfmerch.io/blog/${value}`);
    const retainedKeywordIds = await SeoContent.distinct('keywordId', {
      scope: SCOPE, keywordId: { $in: keywordIds },
    }).session(session);
    await SeoKeyword.updateMany({
      scope: SCOPE,
      _id: { $in: keywordIds, $nin: retainedKeywordIds },
      state: 'drafted',
      pageType: 'educational_blog',
      existingPage: { $in: ['', null] },
      targetUrl: { $in: draftUrls },
    }, { $set: { state: 'available', targetUrl: '' } }, { session });
  });
  writeAudit({ req, action: 'blog.delete', entityType: 'BlogPost', entityId: req.params.id });
  res.json({ deleted: true, id: req.params.id });
}));

const imageUpload = uploader({ allow: IMAGE_TYPES, maxSizeMb: 5 });
router.post('/images', ...blogWrite, imageUpload.single('image'), asyncHandler(async (req, res) => {
  const uploaded = await uploadFile({ tenantId: 'platform', kind: 'blog', file: req.file });
  const asset = new BlogAsset({ key: uploaded.key, driver: uploaded.driver, contentType: req.file.mimetype });
  asset.url = `/blog/media/${asset._id}`;
  await asset.save();
  writeAudit({ req, action: 'blog.image_upload', entityType: 'BlogAsset', entityId: asset._id });
  res.status(201).json({ url: asset.url });
}));

export default router;
