import mongoose from "mongoose";
import {
  approvedBusinessKnowledge,
  isApprovedBusinessFact,
} from "./seoGrowth.knowledge.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parse } from "csv-parse/sync";
import { ApiError, ConflictError } from "../../utils/errors.js";
import { env } from "../../config/env.js";
import { BlogPost } from "../blog/blogPost.model.js";
import { blogPlainText } from "../blog/blogContent.js";
import {
  SCOPE,
  SeoSetting,
  SeoKeyword,
  SeoJob,
  SeoContent,
  SeoKnowledge,
  SeoDay,
  SeoSnapshot,
} from "./seoGrowth.models.js";
import {
  localSchedule,
  normalizeKeyword,
  classify,
  scoreOpportunity,
  similarity,
  generatedSchema,
  languageReviewSchema,
  opportunityDecisionSchema,
  validateGenerated,
  toBlogDraft,
  articleHash,
  reviewEditedArticle,
} from "./seoGrowth.domain.js";
import {
  semrushResearch,
  claudeStructured,
  providerStatus,
} from "./seoGrowth.providers.js";
import {
  collectAnalytics,
  gscOpportunities,
  reportingPeriods,
  performanceSummary,
  validPage,
  validProperty,
} from "./seoGrowth.analytics.js";

const timeZone = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, "Invalid IANA time zone");
export const settingsInput = z
  .object({
    enabled: z.boolean(),
    timezone: timeZone,
    researchTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    dailyDraftLimit: z.number().int().min(0).max(5),
    model: z.string().max(150),
    dailyUsdLimit: z.number().min(0).max(100),
    dailyTokenLimit: z.number().int().min(0).max(1000000),
    dailySemrushUnitLimit: z.number().int().min(0).max(100000),
    maxOutputTokens: z.number().int().min(500).max(12000),
    inputUsdPerMillion: z.number().positive().max(1000).nullable(),
    outputUsdPerMillion: z.number().positive().max(1000).nullable(),
    countries: z
      .array(z.string().regex(/^[a-z]{2}$/))
      .min(1)
      .max(5),
    seedKeywords: z
      .array(
        z
          .string()
          .min(2)
          .max(150)
          .refine((value) => !/[;\r\n]/.test(value)),
      )
      .min(1)
      .max(20),
    researchMode: z.enum(["gsc", "import", "api"]),
    reportingLagDays: z.number().int().min(1).max(7),
    minimumScore: z.number().min(0).max(100),
    weights: z
      .object({
        relevance: z.number().min(0).max(100),
        conversion: z.number().min(0).max(100),
        difficulty: z.number().min(0).max(100),
        volume: z.number().min(0).max(100),
      })
      .strict()
      .refine(
        (weights) => Object.values(weights).reduce((a, b) => a + b, 0) > 0,
      ),
    searchConsoleAccount: z
      .string()
      .refine(
        (value) => !value || validProperty(value),
        "Only the ShelfMerch property is supported",
      ),
    runLanguageReview: z.boolean(),
    strictContentGuards: z.boolean(),
  })
  .strict()
  .partial();

const metric = z.number().finite().nonnegative().nullable().default(null);
export const keywordInput = z
  .object({
    keyword: z.string().trim().min(2).max(200),
    country: z.string().regex(/^(?:[a-z]{2}|global)$/),
    intent: z
      .enum([
        "informational",
        "commercial",
        "transactional",
        "navigational",
        "unknown",
      ])
      .default("unknown"),
    volume: metric,
    difficulty: metric.refine((value) => value == null || value <= 100),
    currentRanking: metric,
    existingPage: z.string().max(2000).default(""),
    targetUrl: z.string().max(2000).default(""),
    competitors: z
      .array(
        z
          .object({
            url: z
              .string()
              .url()
              .refine((value) => value.startsWith("https://")),
            title: z.string().max(300).default(""),
          })
          .strict(),
      )
      .max(10)
      .default([]),
    retrievedAt: z.coerce
      .date()
      .refine(
        (value) => value.getTime() <= Date.now() + 60000,
        "Retrieval time is in the future",
      ),
  })
  .strict();

async function singleton(Model, filter, defaults = {}) {
  try {
    return await Model.findOneAndUpdate(
      filter,
      { $setOnInsert: defaults },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error.code === 11000) return Model.findOne(filter);
    throw error;
  }
}
export async function getSeoSettings() {
  return singleton(SeoSetting, { _id: SCOPE }, { model: env.ANTHROPIC_MODEL });
}
export async function reserveUsage(day, amounts, settings, session = null) {
  if (!session) await singleton(SeoDay, { scope: SCOPE, day });
  const limits = {
    usdReserved: settings.dailyUsdLimit,
    tokensReserved: settings.dailyTokenLimit,
    semrushUnitsReserved: settings.dailySemrushUnitLimit,
    draftsReserved: settings.dailyDraftLimit,
  };
  const filter = { scope: SCOPE, day };
  for (const [key, amount] of Object.entries(amounts)) {
    if (!(key in limits) || !Number.isFinite(amount) || amount < 0)
      throw new ApiError(422, "Invalid usage reservation", "SEO_BUDGET");
    filter[key] = { $lte: limits[key] - amount };
  }
  const row = await SeoDay.findOneAndUpdate(
    filter,
    { $inc: amounts },
    { returnDocument: "after", session },
  );
  if (!row)
    throw new ApiError(
      422,
      "Daily SEO cost, token, API-unit, or draft limit reached.",
      "SEO_BUDGET",
    );
  return row;
}
export async function importKeywords(rows, userId, source = "semrush_import") {
  const settings = await getSeoSettings();
  const values = rows.map((raw) => {
    const searchMetrics = raw.searchMetrics;
    const row = keywordInput.parse(
      Object.fromEntries(
        Object.entries(raw).filter(
          ([key]) => !["source", "searchMetrics"].includes(key),
        ),
      ),
    );
    for (const url of [row.existingPage, row.targetUrl])
      if (url && !validPage(url, false))
        throw new ApiError(
          422,
          "Target pages must belong to shelfmerch.io",
          "SEO_TARGET_URL",
        );
    const classification = classify(row.keyword, row.intent, row.existingPage);
    return {
      ...row,
      scope: SCOPE,
      normalized: normalizeKeyword(row.keyword),
      ...classification,
      ...scoreOpportunity(row, settings),
      source,
      searchMetrics,
      importedBy: userId,
    };
  });
  for (const row of values) {
    const existing = await SeoKeyword.findOne({
      scope: SCOPE,
      normalized: row.normalized,
      country: row.country,
    });
    if (existing && existing.retrievedAt > row.retrievedAt) continue;
    const state =
      existing?.state === "drafted"
        ? "drafted"
        : row.pageType === "refresh"
          ? "refresh"
          : row.pageType === "educational_blog"
            ? "available"
            : "recommendation";
    await SeoKeyword.updateOne(
      { scope: SCOPE, normalized: row.normalized, country: row.country },
      { $set: { ...row, state } },
      { upsert: true },
    );
  }
  return { imported: values.length };
}
export function parseKeywordCsv(csv, country, retrievedAt) {
  return parse(csv, { columns: true, skip_empty_lines: true, bom: true }).map(
    (row) => ({
      keyword: row.keyword ?? row.Keyword,
      country: row.country ?? row.database ?? country,
      intent: row.intent || "unknown",
      volume:
        row.volume || row.monthly_volume || row["Search Volume"]
          ? Number(row.volume ?? row.monthly_volume ?? row["Search Volume"])
          : null,
      difficulty:
        row.difficulty ||
        row.keyword_difficulty ||
        row["Keyword Difficulty Index"]
          ? Number(
              row.difficulty ??
                row.keyword_difficulty ??
                row["Keyword Difficulty Index"],
            )
          : null,
      retrievedAt,
    }),
  );
}

export async function enqueueDailySeo({
  now = new Date(),
  manual = false,
} = {}) {
  const settings = await getSeoSettings();
  const { day, due } = localSchedule(
    now,
    settings.timezone,
    settings.researchTime,
  );
  if (!manual && (!settings.enabled || !due)) return null;
  return singleton(SeoJob, { scope: SCOPE, day }, { nextAttemptAt: now });
}
const LEASE_MS = 10 * 60_000;
export async function claimSeoJob(now = new Date(), owner = randomUUID()) {
  return SeoJob.findOneAndUpdate(
    {
      scope: SCOPE,
      attempts: { $lt: 3 },
      $or: [
        { status: { $in: ["queued", "retry"] }, nextAttemptAt: { $lte: now } },
        { status: "running", leaseUntil: { $lte: now } },
      ],
    },
    {
      $set: {
        status: "running",
        owner,
        leaseUntil: new Date(now.getTime() + LEASE_MS),
      },
      $inc: { attempts: 1 },
    },
    { sort: { day: 1 }, returnDocument: "after" },
  );
}
export async function updateOwnedJob(job, update) {
  const result = await SeoJob.findOneAndUpdate(
    {
      _id: job._id,
      scope: SCOPE,
      owner: job.owner,
      status: "running",
      leaseUntil: { $gt: new Date() },
    },
    update,
    { returnDocument: "after" },
  );
  if (!result)
    throw new ApiError(409, "SEO worker lease was lost", "SEO_LEASE_LOST");
  return result;
}
async function stage(job, name, fn) {
  if (job.stages?.[name]?.status === "completed") return undefined;
  await updateOwnedJob(job, {
    $set: {
      stage: name,
      [`stages.${name}`]: { status: "running", startedAt: new Date() },
    },
  });
  try {
    const result = await fn();
    await updateOwnedJob(job, {
      $set: {
        [`stages.${name}.status`]: "completed",
        [`stages.${name}.completedAt`]: new Date(),
      },
    });
    return result;
  } catch (error) {
    await updateOwnedJob(job, {
      $set: {
        [`stages.${name}`]: {
          status: error.code === "SEO_SKIP" ? "skipped" : "failed",
          code: error.code || "SEO_STAGE_FAILED",
          message: safeError(error),
        },
      },
    });
    throw error;
  }
}
function safeError(error) {
  // Provider adapters deliberately never propagate response bodies, request URLs, or headers.
  if (error instanceof ApiError) return error.message;
  if (error instanceof z.ZodError) {
    const paths = [
      ...new Set(
        error.issues
          .map((issue) => issue.path.filter(Boolean).join("."))
          .filter(Boolean),
      ),
    ].slice(0, 6);
    return paths.length
      ? `Provider or import output failed structured validation (${paths.join(", ")}).`
      : "Provider or import output failed structured validation.";
  }
  return "SEO stage failed; inspect the failure code and retry after correction.";
}

export async function runSeoJob(claimed, dependencies = {}) {
  const settings = await getSeoSettings();
  const collect = dependencies.collect ?? collectAnalytics;
  const reviewConfiguration = {
    ...settings.toObject(),
    maxOutputTokens: Math.min(settings.maxOutputTokens, 2500),
  };
  const generate = dependencies.generate ?? claudeStructured;
  const research = dependencies.research ?? semrushResearch;
  let job = claimed;
  const now = new Date();
  const currentBudgetDay = () =>
    localSchedule(
      dependencies.now?.() ?? new Date(),
      settings.timezone,
      settings.researchTime,
    ).day;
  const budgetDay = currentBudgetDay();
  const reserve = (amounts) =>
    reserveUsage(currentBudgetDay(), amounts, settings);
  const recordCall = (call) => updateOwnedJob(job, { $push: { calls: call } });
  let heartbeatPending = false;
  const timer = setInterval(async () => {
    if (heartbeatPending) return;
    heartbeatPending = true;
    try {
      await updateOwnedJob(job, {
        $set: { leaseUntil: new Date(Date.now() + LEASE_MS) },
      });
    } catch {
      /* Fenced writes stop a stale owner. */
    } finally {
      heartbeatPending = false;
    }
  }, 30000);
  timer.unref?.();
  try {
    await stage(job, "analytics", async () => {
      try {
        const analytics = await collect(settings, now);
        await updateOwnedJob(job, {
          $set: {
            "stages.analytics.result": {
              status: analytics.status,
              reports: analytics.reports,
              reason: analytics.reason,
              ga4: analytics.ga4,
            },
          },
        });
      } catch (error) {
        if (settings.researchMode === "gsc") throw error;
        await updateOwnedJob(job, {
          $set: {
            "stages.analytics.result": {
              status: "unavailable",
              reason: safeError(error),
            },
          },
        });
      }
    });
    await stage(job, "research", async () => {
      if (settings.researchMode === "gsc") {
        const current = reportingPeriods(now, settings.reportingLagDays)[0];
        const rows = await SeoSnapshot.find({
          scope: SCOPE,
          source: "gsc",
          property: settings.searchConsoleAccount,
          ...current,
        }).lean();
        await importKeywords(gscOpportunities(rows), undefined, "windsor_gsc");
      } else if (settings.researchMode === "api") {
        const stale = await SeoKeyword.exists({
          scope: SCOPE,
          source: "semrush_api",
          retrievedAt: { $gte: new Date(Date.now() - 7 * 86400000) },
          keyword: { $in: settings.seedKeywords },
          country: { $in: settings.countries },
        });
        if (!stale)
          await importKeywords(
            await research(settings, reserve),
            undefined,
            "semrush_api",
          );
      }
    });
    job = await SeoJob.findById(job._id);
    if (!job.brief) {
      await stage(job, "selection", async () => {
        const candidates = await SeoKeyword.find({
          scope: SCOPE,
          state: "available",
          pageType: "educational_blog",
          relevance: { $gte: 70 },
          score: { $gte: settings.minimumScore },
          retrievedAt: { $gte: new Date(Date.now() - 30 * 86400000) },
        })
          .sort({ score: -1 })
          .limit(30)
          .lean();
        const existingArticles = await BlogPost.find()
          .select("title slug excerpt status content")
          .lean();
        const existingContent = await SeoContent.find({ scope: SCOPE })
          .select("topicKey brief")
          .lean();
        const facts = await SeoKnowledge.find(approvedBusinessKnowledge())
          .limit(100)
          .lean();
        let selected;
        for (const candidate of candidates) {
          const duplicate =
            existingContent.some(
              (item) =>
                item.topicKey === candidate.normalized ||
                similarity(item.brief?.keyword ?? "", candidate.keyword) >= 0.6,
            ) ||
            existingArticles.some(
              (item) =>
                similarity(item.title, candidate.keyword) >= 0.55 ||
                normalizeKeyword(item.title).includes(candidate.normalized),
            );
          if (duplicate) {
            await SeoKeyword.updateOne(
              { _id: candidate._id, scope: SCOPE },
              { $set: { state: "refresh", pageType: "refresh" } },
            );
            continue;
          }
          selected = candidate;
          break;
        }
        if (!selected || !facts.length || !settings.dailyDraftLimit) {
          throw new ApiError(
            422,
            !facts.length
              ? "No approved business knowledge is available."
              : !settings.dailyDraftLimit
                ? "Daily draft cap is zero."
                : "No suitable non-duplicate educational opportunity; retain commercial and refresh recommendations.",
            "SEO_SKIP",
          );
        }
        const brief = {
          keyword: selected.keyword,
          opportunity: selected,
          facts: facts.map((fact) => ({
            id: String(fact._id),
            text: fact.text,
            sourceRef: fact.sourceRef,
            sourceUrl: fact.sourceUrl,
          })),
          allowedLinks: [
            "/request-demo",
            "/blog",
            ...existingArticles
              .filter((article) => article.status === "published")
              .map((article) => `/blog/${article.slug}`),
          ],
          existingContent: existingArticles.map((article) => ({
            title: article.title,
            slug: article.slug,
            status: article.status,
            summary: article.excerpt,
          })),
          audience: "Global enterprise program owners",
          objective:
            "Qualified demo enquiries; do not claim a saved enquiry is sales-qualified",
          instructions:
            "Educational guide, natural product-relevant CTA, no arbitrary word count. Prefer a refresh or page recommendation when intent does not fit. No images or unsupported product claims.",
        };
        await updateOwnedJob(job, { $set: { keywordId: selected._id, brief } });
      });
      job = await SeoJob.findById(job._id);
    }
    if (!job.generated)
      await stage(job, "brief_review", async () => {
        const decision = opportunityDecisionSchema.parse(
          await generate(
            opportunityDecisionSchema,
            {
              task: "Check semantic overlap with all existing drafts and published content, business relevance, and the correct target page type before article generation. If a refresh or commercial page is more suitable, say so. Do not invent keyword metrics. Keep explanation and contentAngle each under 900 characters.",
              brief: job.brief,
            },
            reviewConfiguration,
            reserve,
            recordCall,
          ),
        );
        if (
          decision.existingUrl &&
          !job.brief.allowedLinks.some(
            (url) =>
              decision.existingUrl === url ||
              decision.existingUrl === `https://shelfmerch.io${url}`,
          )
        )
          throw new ApiError(
            422,
            "Brief reviewer proposed an unverified existing URL",
            "SEO_OUTPUT_INVALID",
          );
        await updateOwnedJob(job, { $set: { opportunityDecision: decision } });
        if (
          decision.duplicate ||
          !decision.businessRelevant ||
          decision.pageType !== "educational_blog"
        ) {
          await SeoKeyword.updateOne(
            { _id: job.keywordId, scope: SCOPE },
            {
              $set: {
                state: decision.duplicate ? "refresh" : "recommendation",
                pageType: decision.duplicate ? "refresh" : decision.pageType,
                ...(decision.existingUrl
                  ? {
                      existingPage: decision.existingUrl.startsWith("/")
                        ? `https://shelfmerch.io${decision.existingUrl}`
                        : decision.existingUrl,
                    }
                  : {}),
              },
            },
          );
          throw new ApiError(
            422,
            `Brief review recommends a page change or refresh: ${decision.explanation}`,
            "SEO_SKIP",
          );
        }
      });
    if (!job.draftReserved || job.draftReservationDay !== budgetDay) {
      await singleton(SeoDay, { scope: SCOPE, day: budgetDay });
      await mongoose.connection.transaction(async (session) => {
        const owned = await SeoJob.findOne({
          _id: job._id,
          owner: job.owner,
          status: "running",
          leaseUntil: { $gt: new Date() },
        }).session(session);
        if (!owned)
          throw new ConflictError(
            "Draft reservation changed or worker lease was lost",
          );
        if (!owned.draftReserved || owned.draftReservationDay !== budgetDay) {
          await reserveUsage(
            budgetDay,
            { draftsReserved: 1 },
            settings,
            session,
          );
          owned.draftReserved = true;
          owned.draftReservationDay = budgetDay;
          await owned.save({ session });
        }
      });
    }
    await stage(job, "generation", async () => {
      const generated = await generate(
        generatedSchema,
        {
          task: "Generate an educational blog article using this verified brief. Prefer clear planning advice; use approved brief facts when stating product claims.",
          brief: job.brief,
          reviewerFeedback: job.generationFeedback,
        },
        settings,
        reserve,
        recordCall,
      );
      await updateOwnedJob(job, { $set: { generated } });
    });
    job = await SeoJob.findById(job._id);
    const checked = validateGenerated(job.generated, job.brief, {
      strict: Boolean(settings.strictContentGuards),
    });
    await stage(job, "quality", async () => {
      if (!settings.runLanguageReview) {
        await updateOwnedJob(job, {
          $set: {
            languageReview: {
              findings: [],
              intentMatch: true,
              repetitive: false,
              skipped: true,
            },
          },
        });
        return;
      }
      const review = await generate(
        languageReviewSchema,
        {
          task: "Review intent, originality, unsupported assertions and filler. Report concerns. Do not treat this review as evidence.",
          brief: job.brief,
          generated: checked.data,
        },
        reviewConfiguration,
        reserve,
        recordCall,
      );
      await updateOwnedJob(job, { $set: { languageReview: review } });
    });
    job = await SeoJob.findById(job._id);
    await stage(job, "persistence", async () => {
      const already = await SeoContent.findOne({
        scope: SCOPE,
        jobId: job._id,
      });
      if (already && already.generationRevision === job.generationRevision) {
        await updateOwnedJob(job, { $set: { articleId: already.articleId } });
        return;
      }
      const draft = toBlogDraft(checked.data);
      const similar = await BlogPost.find().select("title slug").lean();
      if (
        similar.some(
          (article) =>
            String(article._id) !== String(already?.articleId) &&
            (article.slug === draft.slug ||
              similarity(article.title, draft.title) >= 0.7),
        )
      )
        throw new ApiError(
          422,
          "Generated title/slug overlaps an existing draft or published article; refresh instead.",
          "SEO_SKIP",
        );
      const findings = [
        ...checked.findings,
        ...(job.languageReview?.findings ?? []).map((message) => ({
          severity: "warning",
          code: "language_review",
          message,
        })),
      ];
      if (
        settings.strictContentGuards &&
        settings.runLanguageReview &&
        (!job.languageReview?.intentMatch || job.languageReview?.repetitive)
      )
        findings.push({
          severity: "error",
          code: "language_quality",
          message:
            "Language review flagged intent mismatch or repetitive content; revise before approval.",
        });
      else if (
        settings.runLanguageReview &&
        (!job.languageReview?.intentMatch || job.languageReview?.repetitive)
      )
        findings.push({
          severity: "warning",
          code: "language_quality",
          message:
            "Language review flagged intent mismatch or repetitive content.",
        });
      const persistenceDay = currentBudgetDay();
      await singleton(SeoDay, { scope: SCOPE, day: persistenceDay });
      await mongoose.connection.transaction(async (session) => {
        const fence = await SeoJob.updateOne(
          {
            _id: job._id,
            owner: job.owner,
            status: "running",
            leaseUntil: { $gt: new Date() },
          },
          { $set: { stage: "persistence" } },
          { session },
        );
        if (!fence.matchedCount)
          throw new ConflictError("Worker no longer owns the job");
        if (job.draftReservationDay !== persistenceDay) {
          await reserveUsage(
            persistenceDay,
            { draftsReserved: 1 },
            settings,
            session,
          );
          await SeoJob.updateOne(
            { _id: job._id, owner: job.owner },
            { $set: { draftReservationDay: persistenceDay } },
            { session },
          );
        }
        let article;
        const details = {
          generationRevision: job.generationRevision,
          generated: checked.data,
          brief: job.brief,
          findings,
          languageReview: job.languageReview,
          status: "review",
          approvedHash: "",
        };
        if (already) {
          article = await BlogPost.findById(already.articleId).session(session);
          if (!article || article.status === "published" || article.publishedAt)
            throw new ConflictError(
              "Regeneration is limited to drafts that have never been published.",
            );
          Object.assign(article, draft, { seoApprovedHash: "" });
          await article.save({ session });
          await SeoContent.updateOne(
            { _id: already._id, scope: SCOPE },
            {
              $set: details,
              $push: {
                revisions: {
                  $each: [
                    {
                      hash: articleHash(article),
                      at: new Date(),
                      reason: "regeneration",
                      feedback: job.generationFeedback,
                      draft,
                    },
                  ],
                  $slice: -20,
                },
              },
            },
            { session },
          );
        } else {
          [article] = await BlogPost.create([{ ...draft, seoManaged: true }], {
            session,
          });
          await SeoContent.create(
            [
              {
                ...details,
                scope: SCOPE,
                jobId: job._id,
                articleId: article._id,
                keywordId: job.keywordId,
                topicKey: normalizeKeyword(job.brief.keyword),
                revisions: [
                  {
                    hash: articleHash(article),
                    at: new Date(),
                    reason: "generation",
                    draft,
                  },
                ],
              },
            ],
            { session },
          );
        }
        await SeoJob.updateOne(
          { _id: job._id, owner: job.owner },
          { $set: { articleId: article._id } },
          { session },
        );
        await SeoKeyword.updateOne(
          { _id: job.keywordId, scope: SCOPE },
          {
            $set: {
              state: "drafted",
              targetUrl: `https://shelfmerch.io/blog/${article.slug}`,
            },
          },
          { session },
        );
      });
    });
    await updateOwnedJob(job, {
      $set: {
        status: "completed",
        stage: "completed",
        leaseUntil: null,
        error: "",
      },
    });
  } catch (error) {
    if (error.code !== "SEO_LEASE_LOST") {
      const skip = error.code === "SEO_SKIP";
      const retry = error.code === "SEO_PROVIDER_RETRY" && job.attempts < 3;
      await updateOwnedJob(job, {
        $set: {
          status: skip ? "skipped" : retry ? "retry" : "failed",
          reason: skip ? error.message : "",
          error: skip ? "" : safeError(error),
          leaseUntil: null,
          nextAttemptAt: new Date(Date.now() + 60000 * 2 ** (job.attempts - 1)),
        },
      }).catch(() => {});
    }
  } finally {
    clearInterval(timer);
  }
  return SeoJob.findById(job._id).lean();
}

export async function processSeoTick(dependencies = {}) {
  await enqueueDailySeo();
  // Exhausted jobs abandoned during their final attempt must not stay running forever.
  await SeoJob.updateMany(
    {
      scope: SCOPE,
      status: "running",
      attempts: { $gte: 3 },
      leaseUntil: { $lt: new Date() },
    },
    {
      $set: {
        status: "failed",
        error: "Final worker attempt expired; review recovery before retry.",
      },
    },
  );
  const job = await claimSeoJob();
  return job ? runSeoJob(job, dependencies) : null;
}

export async function reviewSeoContent(id, input, reviewer) {
  return mongoose.connection.transaction(async (session) => {
    const content = await SeoContent.findOne({ _id: id, scope: SCOPE }).session(
      session,
    );
    if (!content) throw new ApiError(404, "SEO draft not found");
    const article = await BlogPost.findById(content.articleId).session(session);
    if (!article) throw new ApiError(404, "Article not found");
    const hash = articleHash(article);
    if (hash !== input.revisionHash)
      throw new ConflictError(
        "Article changed; reload and review the current version.",
      );
    if (article.status === "published")
      throw new ConflictError(
        "Published content must be reviewed through a separate refresh draft.",
      );
    const facts = await SeoKnowledge.find(approvedBusinessKnowledge())
      .session(session)
      .lean();
    const settings = await getSeoSettings();
    const strict = Boolean(settings.strictContentGuards);
    const findings = reviewEditedArticle(article, content, facts, { strict });
    if (
      input.action === "approve" &&
      strict &&
      findings.some((item) => item.severity === "error")
    )
      throw new ApiError(
        422,
        "Resolve blocking QA findings before approval.",
        "SEO_QA_BLOCKED",
        findings,
      );
    if (
      input.action === "approve" &&
      strict &&
      !input.factsAndLinksChecked
    )
      throw new ApiError(
        422,
        "Explicit factual and link review is required.",
        "SEO_REVIEW_REQUIRED",
      );
    content.findings = findings;
    content.status = input.action === "approve" ? "approved" : "rejected";
    content.approvedHash = input.action === "approve" ? hash : "";
    content.reviewer = reviewer;
    content.reviewedAt = new Date();
    content.feedback = input.feedback;
    content.revisions = [
      ...content.revisions.slice(-19),
      {
        hash,
        at: new Date(),
        by: reviewer,
        reason: input.action,
        feedback: input.feedback,
        draft: article.toObject(),
      },
    ];
    article.seoApprovedHash = content.approvedHash;
    await article.save({ session });
    await content.save({ session });
    return content;
  });
}
export async function overview() {
  const settings = await getSeoSettings();
  const day = localSchedule(
    new Date(),
    settings.timezone,
    settings.researchTime,
  ).day;
  const [jobs, keywords, contents, knowledge, usage, snapshots] =
    await Promise.all([
      SeoJob.find({ scope: SCOPE }).sort({ createdAt: -1 }).limit(30).lean(),
      SeoKeyword.find({ scope: SCOPE }).sort({ score: -1 }).limit(200).lean(),
      SeoContent.find({ scope: SCOPE })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      SeoKnowledge.find({ scope: SCOPE })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      SeoDay.findOne({ scope: SCOPE, day }).lean(),
      SeoSnapshot.find({
        scope: SCOPE,
        source: "gsc",
        property: settings.searchConsoleAccount,
      })
        .sort({ periodEnd: -1 })
        .limit(10000)
        .lean(),
    ]);
  const articleIds = contents.map((content) => content.articleId);
  const articles = await BlogPost.find({ _id: { $in: articleIds } })
    .select(
      "title slug status content excerpt seoTitle seoDescription authorName coverImageUrl coverImageAlt",
    )
    .lean();
  const mapped = contents.map((content) => {
    const article = articles.find(
      (item) => String(item._id) === String(content.articleId),
    );
    return {
      ...content,
      findings: article
        ? reviewEditedArticle(
            article,
            content,
            knowledge.filter(isApprovedBusinessFact),
            { strict: Boolean(settings.strictContentGuards) },
          )
        : content.findings,
      article,
      revisionHash: article ? articleHash(article) : null,
      approvalCurrent: Boolean(
        article && content.approvedHash === articleHash(article),
      ),
      plainText: article ? blogPlainText(article.content) : "",
    };
  });
  return {
    settings,
    providers: providerStatus(settings),
    jobs,
    keywords,
    contents: mapped,
    knowledge,
    usage,
    performance: performanceSummary(snapshots),
    counts: {
      awaitingReview: await SeoContent.countDocuments({
        scope: SCOPE,
        status: "review",
      }),
      published: await BlogPost.countDocuments({ status: "published" }),
    },
  };
}
