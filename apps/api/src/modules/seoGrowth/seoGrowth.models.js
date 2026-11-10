import mongoose from "mongoose";

export const SCOPE = "platform";
const opts = { timestamps: true };
const mixed = mongoose.Schema.Types.Mixed;
const scoped = {
  scope: { type: String, enum: [SCOPE], default: SCOPE, required: true },
};
const settingSchema = new mongoose.Schema(
  {
    _id: { type: String, default: SCOPE },
    enabled: { type: Boolean, default: false },
    timezone: { type: String, default: "Asia/Kolkata" },
    researchTime: { type: String, default: "03:00" },
    dailyDraftLimit: { type: Number, default: 5 },
    model: { type: String, default: "" },
    // Opus brief+generate+quality for one article can reserve ~25–40k tokens;
    // keep room for retries without blocking mid-pipeline.
    dailyUsdLimit: { type: Number, default: 10 },
    dailyTokenLimit: { type: Number, default: 200000 },
    dailySemrushUnitLimit: { type: Number, default: 1000 },
    inputUsdPerMillion: { type: Number, default: null },
    outputUsdPerMillion: { type: Number, default: null },
    maxOutputTokens: { type: Number, default: 6000 },
    countries: { type: [String], default: ["us", "uk", "in"] },
    seedKeywords: {
      type: [String],
      default: [
        "how to plan employee welcome kits",
        "how to set up a company swag store",
        "corporate gifting platform",
      ],
    },
    researchMode: {
      type: String,
      enum: ["gsc", "import", "api"],
      default: "gsc",
    },
    reportingLagDays: { type: Number, default: 3 },
    minimumScore: { type: Number, default: 60 },
    weights: {
      type: mixed,
      default: () => ({
        relevance: 45,
        conversion: 25,
        difficulty: 20,
        volume: 10,
      }),
    },
    searchConsoleAccount: { type: String, default: "sc-domain:shelfmerch.io" },
    ga4Account: { type: String, default: "" },
    ga4OrganicFilter: { type: String, default: "Organic Search" },
    qualifiedDemoEvent: { type: String, default: "" },
    // Future tightening: off by default for a simple generate → approve → publish path.
    runLanguageReview: { type: Boolean, default: false },
    strictContentGuards: { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  opts,
);

const keywordSchema = new mongoose.Schema(
  {
    ...scoped,
    keyword: String,
    normalized: String,
    country: String,
    cluster: String,
    intent: {
      type: String,
      enum: [
        "informational",
        "commercial",
        "transactional",
        "navigational",
        "unknown",
      ],
    },
    pageType: String,
    volume: { type: Number, default: null },
    difficulty: { type: Number, default: null },
    currentRanking: { type: Number, default: null },
    competitors: { type: [mixed], default: [] },
    targetUrl: { type: String, default: "" },
    existingPage: { type: String, default: "" },
    relevance: Number,
    conversion: Number,
    score: Number,
    scoreExplanation: mixed,
    source: {
      type: String,
      enum: ["semrush_api", "semrush_import", "windsor_gsc"],
    },
    searchMetrics: mixed,
    retrievedAt: Date,
    importedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    state: {
      type: String,
      enum: ["available", "recommendation", "drafted", "refresh"],
      default: "available",
    },
  },
  opts,
);
keywordSchema.index({ scope: 1, normalized: 1, country: 1 }, { unique: true });
keywordSchema.index({ scope: 1, state: 1, score: -1 });

const jobSchema = new mongoose.Schema(
  {
    ...scoped,
    day: String,
    status: {
      type: String,
      enum: ["queued", "running", "retry", "completed", "skipped", "failed"],
      default: "queued",
    },
    stage: { type: String, default: "queued" },
    stages: { type: mixed, default: () => ({}) },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    owner: String,
    leaseUntil: Date,
    error: String,
    reason: String,
    brief: mixed,
    generated: mixed,
    languageReview: mixed,
    generationFeedback: { type: String, default: "" },
    generationRevision: { type: Number, default: 0 },
    opportunityDecision: mixed,
    keywordId: { type: mongoose.Schema.Types.ObjectId, ref: "SeoKeyword" },
    articleId: { type: mongoose.Schema.Types.ObjectId, ref: "BlogPost" },
    draftReserved: { type: Boolean, default: false },
    draftReservationDay: String,
    calls: { type: [mixed], default: [] },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 180 * 86400000),
    },
  },
  opts,
);
jobSchema.index({ scope: 1, day: 1 }, { unique: true });
jobSchema.index({ status: 1, nextAttemptAt: 1, leaseUntil: 1 });
jobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const contentSchema = new mongoose.Schema(
  {
    ...scoped,
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SeoGenerationJob",
      required: true,
    },
    keywordId: { type: mongoose.Schema.Types.ObjectId, ref: "SeoKeyword" },
    articleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BlogPost",
      required: true,
    },
    topicKey: { type: String, required: true },
    type: { type: String, default: "educational_blog" },
    generated: mixed,
    brief: mixed,
    generationRevision: { type: Number, default: 0 },
    findings: { type: [mixed], default: [] },
    status: {
      type: String,
      enum: ["review", "approved", "rejected", "published"],
      default: "review",
    },
    approvedHash: String,
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    feedback: { type: String, default: "" },
    languageReview: mixed,
    revisions: { type: [mixed], default: [] },
  },
  opts,
);
contentSchema.index({ scope: 1, topicKey: 1 }, { unique: true });
contentSchema.index({ scope: 1, jobId: 1 }, { unique: true });
contentSchema.index({ articleId: 1 }, { unique: true });

const knowledgeSchema = new mongoose.Schema(
  {
    ...scoped,
    kind: {
      type: String,
      enum: ["business_fact", "competitor_research"],
      default: "business_fact",
    },
    subject: { type: String, default: "ShelfMerch" },
    researchedAt: Date,
    importKey: String,
    text: { type: String, required: true },
    sourceRef: { type: String, required: true },
    sourceUrl: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "approved", "retired"],
      default: "pending",
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
  },
  opts,
);
knowledgeSchema.index({ scope: 1, status: 1 });
knowledgeSchema.index({ importKey: 1 }, { unique: true, sparse: true });

const daySchema = new mongoose.Schema(
  {
    ...scoped,
    day: String,
    usdReserved: { type: Number, default: 0 },
    tokensReserved: { type: Number, default: 0 },
    semrushUnitsReserved: { type: Number, default: 0 },
    draftsReserved: { type: Number, default: 0 },
  },
  opts,
);
daySchema.index({ scope: 1, day: 1 }, { unique: true });

const snapshotSchema = new mongoose.Schema(
  {
    ...scoped,
    source: { type: String, enum: ["gsc", "ga4"], required: true },
    property: String,
    periodStart: String,
    periodEnd: String,
    geography: { type: String, default: "" },
    granularity: {
      type: String,
      enum: ["daily", "query", "page", "query_page"],
      required: true,
    },
    url: String,
    query: { type: String, default: "" },
    branded: { type: Boolean, default: null },
    metrics: mixed,
    provenance: mixed,
    retrievedAt: Date,
    rowKey: String,
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 550 * 86400000),
    },
  },
  opts,
);
snapshotSchema.index({ scope: 1, rowKey: 1 }, { unique: true });
snapshotSchema.index({ scope: 1, source: 1, periodStart: 1, periodEnd: 1 });
snapshotSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SeoSetting = mongoose.model("SeoAutomationSetting", settingSchema);
export const SeoKeyword = mongoose.model("SeoKeyword", keywordSchema);
export const SeoJob = mongoose.model("SeoGenerationJob", jobSchema);
export const SeoContent = mongoose.model("SeoContent", contentSchema);
export const SeoKnowledge = mongoose.model("SeoKnowledge", knowledgeSchema);
export const SeoDay = mongoose.model("SeoUsageDay", daySchema);
export const SeoSnapshot = mongoose.model(
  "SeoPerformanceSnapshot",
  snapshotSchema,
);
