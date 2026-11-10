import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.middleware.js";
import {
  resolveTenant,
  blockDuringImpersonation,
} from "../../middleware/tenant.middleware.js";
import { platformArea } from "../../middleware/platformAccess.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { validate } from "../../middleware/validate.middleware.js";
import { writeAudit } from "../../services/audit.service.js";
import { ApiError } from "../../utils/errors.js";
import {
  SeoJob,
  SeoContent,
  SeoKnowledge,
  SeoKeyword,
  SCOPE,
} from "./seoGrowth.models.js";
import {
  settingsInput,
  getSeoSettings,
  overview,
  enqueueDailySeo,
  importKeywords,
  parseKeywordCsv,
  reviewSeoContent,
} from "./seoGrowth.service.js";
import { testProviderAccess } from "./seoGrowth.providers.js";
import { ingestSnapshots, validProperty } from "./seoGrowth.analytics.js";
import { BlogPost } from "../blog/blogPost.model.js";
import { knowledgeInput } from "./seoGrowth.knowledge.js";

const router = Router();
router.use(authenticate, resolveTenant, platformArea("blog", "read"));
const write = [platformArea("blog", "write"), blockDuringImpersonation];
const params = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) });
const audit = (req, action, id) =>
  writeAudit({
    req,
    action: `seo.${action}`,
    entityType: "SeoGrowth",
    entityId: id || SCOPE,
  });
router.get(
  "/",
  asyncHandler(async (_req, res) => res.json(await overview())),
);
router.patch(
  "/settings",
  ...write,
  validate({ body: settingsInput }),
  asyncHandler(async (req, res) => {
    const setting = await getSeoSettings();
    Object.assign(setting, req.body);
    setting.updatedBy = req.user.userId;
    await setting.save();
    audit(req, "settings");
    res.json(setting);
  }),
);
router.post(
  "/providers/test",
  ...write,
  asyncHandler(async (req, res) => {
    const result = await testProviderAccess(await getSeoSettings());
    audit(req, "provider_test");
    res.json(result);
  }),
);
router.post(
  "/run",
  ...write,
  asyncHandler(async (req, res) => {
    const job = await enqueueDailySeo({ manual: true });
    audit(req, "run", job._id);
    res.status(202).json(job);
  }),
);
router.post(
  "/jobs/:id/retry",
  ...write,
  validate({ params }),
  asyncHandler(async (req, res) => {
    const job = await SeoJob.findOneAndUpdate(
      {
        _id: req.params.id,
        scope: SCOPE,
        status: { $in: ["failed", "retry", "skipped"] },
      },
      {
        $set: {
          status: "queued",
          attempts: 0,
          nextAttemptAt: new Date(),
          error: "",
        },
      },
      { new: true },
    );
    if (!job)
      throw new ApiError(
        409,
        "Only a failed, skipped, or waiting retry job can be retried.",
      );
    audit(req, "retry", job._id);
    res.status(202).json(job);
  }),
);
router.post(
  "/keywords/import",
  ...write,
  validate({
    body: z
      .object({
        rows: z.array(z.unknown()).max(1000).optional(),
        csv: z.string().max(500000).optional(),
        country: z
          .string()
          .regex(/^[a-z]{2}$/)
          .default("us"),
        retrievedAt: z.string().datetime(),
        reviewedSource: z.literal(true),
      })
      .strict()
      .refine(
        (body) => Boolean(body.rows?.length) !== Boolean(body.csv?.trim()),
        "Provide either rows or CSV",
      ),
  }),
  asyncHandler(async (req, res) => {
    const rows =
      req.body.rows ??
      parseKeywordCsv(req.body.csv, req.body.country, req.body.retrievedAt);
    const result = await importKeywords(rows, req.user.userId);
    audit(req, "keyword_import");
    res.status(201).json(result);
  }),
);
router.patch(
  "/keywords/:id/mapping",
  ...write,
  validate({
    params,
    body: z
      .object({
        url: z
          .string()
          .url()
          .refine((url) => /^https:\/\/shelfmerch\.io\//.test(url)),
      })
      .strict(),
  }),
  asyncHandler(async (req, res) => {
    const keyword = await SeoKeyword.findOneAndUpdate(
      { _id: req.params.id, scope: SCOPE },
      {
        $set: {
          existingPage: req.body.url,
          targetUrl: req.body.url,
          pageType: "refresh",
          state: "refresh",
        },
      },
      { new: true },
    );
    if (!keyword) throw new ApiError(404, "Keyword not found");
    audit(req, "keyword_mapping", keyword._id);
    res.json(keyword);
  }),
);
router.post(
  "/knowledge",
  ...write,
  validate({ body: knowledgeInput }),
  asyncHandler(async (req, res) => {
    const fact = await SeoKnowledge.create({
      ...req.body,
      scope: SCOPE,
      status: "pending",
    });
    audit(req, "knowledge_create", fact._id);
    res.status(201).json(fact);
  }),
);
router.post(
  "/knowledge/:id/review",
  ...write,
  validate({
    params,
    body: z.object({ status: z.enum(["approved", "retired"]) }).strict(),
  }),
  asyncHandler(async (req, res) => {
    const fact = await SeoKnowledge.findOneAndUpdate(
      { _id: req.params.id, scope: SCOPE },
      {
        $set: {
          status: req.body.status,
          reviewedBy: req.user.userId,
          reviewedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    );
    if (!fact) throw new ApiError(404, "Knowledge entry not found");
    audit(req, "knowledge_review", fact._id);
    res.json(fact);
  }),
);
router.post(
  "/contents/:id/review",
  ...write,
  validate({
    params,
    body: z
      .object({
        action: z.enum(["approve", "reject"]),
        revisionHash: z.string().regex(/^[a-f0-9]{64}$/),
        factsAndLinksChecked: z.boolean().default(false),
        feedback: z.string().max(2000).default(""),
      })
      .strict(),
  }),
  asyncHandler(async (req, res) => {
    const content = await reviewSeoContent(
      req.params.id,
      req.body,
      req.user.userId,
    );
    audit(req, req.body.action, content._id);
    res.json(content);
  }),
);
router.post(
  "/contents/:id/regenerate",
  ...write,
  validate({
    params,
    body: z
      .object({ feedback: z.string().trim().max(2000).optional() })
      .strict(),
  }),
  asyncHandler(async (req, res) => {
    const content = await SeoContent.findOne({
      _id: req.params.id,
      scope: SCOPE,
    });
    if (!content) throw new ApiError(404, "SEO draft not found");
    const article = await BlogPost.findById(content.articleId);
    if (!article || article.publishedAt || article.status === "published")
      throw new ApiError(
        409,
        "Published articles need a separate refresh review; regeneration is limited to never-published drafts.",
      );
    const feedback =
      req.body.feedback?.trim() ||
      "Improve clarity and fix issues from the previous draft.";
    const job = await SeoJob.findOneAndUpdate(
      {
        _id: content.jobId,
        scope: SCOPE,
        // Deletion clears this link so a regeneration request that read the
        // draft just before deletion cannot queue it again afterward.
        articleId: content.articleId,
        status: { $in: ["completed", "failed", "skipped"] },
      },
      {
        $set: {
          status: "queued",
          attempts: 0,
          nextAttemptAt: new Date(),
          generated: null,
          languageReview: null,
          generationFeedback: feedback,
          "stages.generation": { status: "pending" },
          "stages.quality": { status: "pending" },
          "stages.persistence": { status: "pending" },
        },
        $inc: { generationRevision: 1 },
      },
      { new: true },
    );
    if (!job) throw new ApiError(409, "This draft was deleted or already has an active job.");
    audit(req, "regenerate", content._id);
    res.status(202).json(job);
  }),
);
router.post(
  "/snapshots/import",
  ...write,
  validate({
    body: z
      .object({
        property: z.string().refine(validProperty),
        periodStart: z.string().date(),
        periodEnd: z.string().date(),
        granularity: z.enum(["daily", "query", "page", "query_page"]),
        rows: z.array(z.record(z.string(), z.unknown())).max(25000),
        reviewedSource: z.literal(true),
      })
      .strict()
      .refine((body) => body.periodStart <= body.periodEnd),
  }),
  asyncHandler(async (req, res) => {
    const rows = await ingestSnapshots(req.body.rows, {
      ...req.body,
      source: "gsc",
    });
    audit(req, "snapshot_import");
    res.status(201).json({ imported: rows.length });
  }),
);
export default router;
