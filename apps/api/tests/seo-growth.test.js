import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { readFile } from "node:fs/promises";
import { importCompetitorKnowledge } from "../src/modules/seoGrowth/seoGrowth.knowledge.js";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./setup.js";
import { createApp } from "../src/app.js";
import { User } from "../src/modules/users/user.model.js";
import { RoleAssignment } from "../src/modules/roles/roleAssignment.model.js";
import { signAccessToken } from "../src/modules/auth/auth.service.js";
import { env } from "../src/config/env.js";
import { BlogPost } from "../src/modules/blog/blogPost.model.js";
import {
  SeoSetting,
  SeoKeyword,
  SeoJob,
  SeoContent,
  SeoKnowledge,
  SeoDay,
  SeoSnapshot,
  SCOPE,
} from "../src/modules/seoGrowth/seoGrowth.models.js";
import {
  localSchedule,
  classify,
  scoreOpportunity,
  generatedSchema,
  opportunityDecisionSchema,
  validateGenerated,
  looksLikeUnsupportedClaim,
  articleHash,
} from "../src/modules/seoGrowth/seoGrowth.domain.js";
import {
  getSeoSettings,
  importKeywords,
  enqueueDailySeo,
  claimSeoJob,
  runSeoJob,
  reserveUsage,
  reviewSeoContent,
  updateOwnedJob,
} from "../src/modules/seoGrowth/seoGrowth.service.js";
import {
  reportingPeriods,
  normalizeSnapshot,
  ingestSnapshots,
  performanceSummary,
  collectAnalytics,
  gscOpportunities,
} from "../src/modules/seoGrowth/seoGrowth.analytics.js";
import {
  providerRequest,
  claudeStructured,
  semrushResearch,
  providerStatus,
  testProviderAccess,
} from "../src/modules/seoGrowth/seoGrowth.providers.js";

let app;
const keyword = "how to plan employee welcome kits";
const auth = (token) => ({ Authorization: `Bearer ${token}` });
async function tokenFor(role) {
  const user = await User.create({
    name: role,
    email: `${role}@seo.test`,
    status: "active",
  });
  const assignment = await RoleAssignment.create({
    userId: user._id,
    role,
    scopeType: "platform",
  });
  return { token: signAccessToken(user, assignment), user };
}
async function setupOpportunity(overrides = {}) {
  await SeoSetting.create({
    _id: SCOPE,
    researchMode: "import",
    model: "test-model",
    inputUsdPerMillion: 1,
    outputUsdPerMillion: 5,
    ...overrides,
  });
  const fact = await SeoKnowledge.create({
    text: "ShelfMerch lets employees redeem points for merchandise.",
    sourceRef: "Owner-verified product brief",
    status: "approved",
  });
  await importKeywords([
    {
      keyword,
      country: "us",
      intent: "informational",
      volume: 100,
      difficulty: 20,
      retrievedAt: new Date(),
    },
  ]);
  return fact;
}
function output(fact) {
  return {
    title: "How to Plan Employee Welcome Kits",
    slug: "plan-employee-welcome-kits",
    metaTitle: "Plan Employee Welcome Kits | ShelfMerch",
    metaDescription:
      "Plan a useful employee welcome program with a clear audience, selection process and budget owner.",
    primaryKeyword: keyword,
    supportingKeywords: ["onboarding kits"],
    intent: "informational",
    summary:
      "Plan an employee welcome program by defining its audience, selection process and responsible owner.",
    sections: [
      {
        heading: "Define the program",
        level: 2,
        paragraphs: [
          {
            text: "Start by agreeing the audience and the purpose of the welcome program.",
            kind: "advice",
            evidenceIds: [],
          },
        ],
      },
      {
        heading: "Review the store approach",
        level: 2,
        paragraphs: [
          { text: fact.text, kind: "fact", evidenceIds: [String(fact._id)] },
        ],
      },
    ],
    internalLinks: [],
    faqs: [],
    cta: { text: "Book a ShelfMerch demo", href: "/request-demo" },
    schemaType: "BlogPosting",
    qualityNotes: ["Human review required."],
  };
}
function dependencies(fact, changes = {}) {
  return {
    collect: vi.fn(async () => ({
      status: "unavailable",
      reason: "No test analytics",
    })),
    generate: vi.fn(async (schema) =>
      schema === opportunityDecisionSchema
        ? {
            pageType: "educational_blog",
            duplicate: false,
            businessRelevant: true,
            existingUrl: "",
            explanation: "A distinct, relevant planning question.",
            contentAngle: "Planning employee welcome kits.",
          }
        : schema === generatedSchema
          ? output(fact)
          : { findings: [], intentMatch: true, repetitive: false },
    ),
    ...changes,
  };
}
async function generateDraft(fact, deps = dependencies(fact)) {
  await enqueueDailySeo({ manual: true });
  return runSeoJob(await claimSeoJob(), deps);
}
const originalKeys = {};
beforeAll(async () => {
  for (const key of [
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_MODEL",
    "SEMRUSH_API_KEY",
    "WINDSOR_API_KEY",
  ])
    originalKeys[key] = env[key];
  await connectTestDb();
  await Promise.all(
    [
      SeoSetting,
      SeoKeyword,
      SeoJob,
      SeoContent,
      SeoKnowledge,
      SeoDay,
      SeoSnapshot,
    ].map((Model) => Model.init()),
  );
  app = createApp();
});
beforeEach(async () => {
  await clearTestDb();
});
afterEach(() => {
  for (const [key, value] of Object.entries(originalKeys)) env[key] = value;
  vi.restoreAllMocks();
});
afterAll(disconnectTestDb);

describe("competitor knowledge isolation", () => {
  it("imports sourced research idempotently without replacing review decisions", async () => {
    const rows = JSON.parse(
      await readFile(
        new URL(
          "../../../docs/seo-content-engine/competitor-knowledge-2026-10-30.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(await importCompetitorKnowledge(rows)).toEqual({
      inserted: 12,
      existing: 0,
    });
    expect(
      await SeoKnowledge.countDocuments({
        kind: "competitor_research",
        status: "pending",
      }),
    ).toBe(12);
    const first = await SeoKnowledge.findOne();
    first.status = "retired";
    first.text = "A manually revised competitor research note.";
    await first.save();
    const before = first.updatedAt;
    expect(await importCompetitorKnowledge(rows)).toEqual({
      inserted: 0,
      existing: 12,
    });
    expect(await SeoKnowledge.countDocuments()).toBe(12);
    const after = await SeoKnowledge.findById(first._id);
    expect(after.status).toBe("retired");
    expect(after.text).toBe(first.text);
    expect(after.updatedAt).toEqual(before);
  });
  it("requires competitor attribution and keeps manual creation pending", async () => {
    const { token } = await tokenFor("platform_sales_manager");
    const row = {
      kind: "competitor_research",
      subject: "AXOMO",
      text: "AXOMO describes branded company stores.",
      sourceRef: "AXOMO official product page",
    };
    const url = "/api/v1/platform/seo-growth/knowledge";
    expect(
      (await request(app).post(url).set(auth(token)).send(row)).status,
    ).toBe(400);
    const result = await request(app)
      .post(url)
      .set(auth(token))
      .send({
        ...row,
        sourceUrl: "https://axomo.com/company-store/",
        researchedAt: new Date().toISOString(),
      });
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      kind: "competitor_research",
      subject: "AXOMO",
      status: "pending",
    });
    expect(
      (
        await request(app)
          .post(url)
          .set(auth(token))
          .send({ ...row, status: "approved" })
      ).status,
    ).toBe(400);
  });
  it("does not generate using approved competitor research as business evidence", async () => {
    const fact = await setupOpportunity();
    await SeoKnowledge.updateOne(
      { _id: fact._id },
      { $set: { kind: "competitor_research", subject: "AXOMO" } },
    );
    const deps = dependencies(fact);
    const job = await generateDraft(fact, deps);
    expect(job.status).toBe("skipped");
    expect(job.reason).toBe("No approved business knowledge is available.");
    expect(deps.generate).not.toHaveBeenCalled();
    expect(await BlogPost.countDocuments()).toBe(0);
  });
  it("preserves legacy business evidence and excludes competitor notes at approval and publication", async () => {
    const fact = await setupOpportunity();
    await SeoSetting.updateOne(
      { _id: "platform" },
      { $set: { strictContentGuards: true } },
    );
    await SeoKnowledge.collection.updateOne(
      { _id: fact._id },
      { $unset: { kind: "" } },
    );
    const job = await generateDraft(fact);
    expect(job.status).toBe("completed");
    const { user, token } = await tokenFor("platform_sales_manager");
    const article = await BlogPost.findById(job.articleId);
    const content = await SeoContent.findOne();
    const review = {
      action: "approve",
      revisionHash: articleHash(article),
      factsAndLinksChecked: true,
    };
    await reviewSeoContent(content._id, review, user._id);
    await SeoKnowledge.updateOne(
      { _id: fact._id },
      { $set: { kind: "competitor_research", subject: "AXOMO" } },
    );
    await expect(
      reviewSeoContent(content._id, review, user._id),
    ).rejects.toMatchObject({ code: "SEO_QA_BLOCKED" });
    const blocked = await request(app)
      .post(`/api/v1/platform/blog-posts/${article._id}/publish`)
      .set(auth(token));
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe("SEO_QA_BLOCKED");
  });
});

describe("SEO scheduling, leases and budgets", () => {
  it("uses the configured local date and 03:00 boundary independently of the host zone", () => {
    expect(
      localSchedule(new Date("2026-10-28T21:29:00Z"), "Asia/Kolkata", "03:00"),
    ).toEqual({ day: "2026-10-29", due: false });
    expect(
      localSchedule(new Date("2026-10-28T21:30:00Z"), "Asia/Kolkata", "03:00"),
    ).toEqual({ day: "2026-10-29", due: true });
    expect(
      localSchedule(new Date("2026-10-28T18:30:00Z"), "Asia/Kolkata", "03:00")
        .day,
    ).toBe("2026-10-29");
  });
  it("defaults to disabled and creates only one daily job under concurrent manual requests", async () => {
    expect(await enqueueDailySeo()).toBeNull();
    await Promise.all(
      Array.from({ length: 8 }, () => enqueueDailySeo({ manual: true })),
    );
    expect(await SeoJob.countDocuments()).toBe(1);
  });
  it("permits one lease holder, recovers after expiry, and fences the old holder", async () => {
    await enqueueDailySeo({ manual: true });
    const first = await claimSeoJob(new Date(), "worker-a");
    expect(await claimSeoJob(new Date(), "worker-b")).toBeNull();
    await SeoJob.updateOne(
      { _id: first._id },
      { $set: { leaseUntil: new Date(0) } },
    );
    expect((await claimSeoJob(new Date(), "worker-b")).owner).toBe("worker-b");
    await expect(
      updateOwnedJob(first, { $set: { reason: "stale write" } }),
    ).rejects.toMatchObject({ code: "SEO_LEASE_LOST" });
  });
  it("atomically enforces AI, token, unit and draft caps across callers", async () => {
    const settings = await getSeoSettings();
    settings.dailyUsdLimit = 1;
    const results = await Promise.allSettled([
      reserveUsage("2026-10-29", { usdReserved: 0.6 }, settings),
      reserveUsage("2026-10-29", { usdReserved: 0.6 }, settings),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    await expect(
      reserveUsage("2026-10-29", { semrushUnitsReserved: 1001 }, settings),
    ).rejects.toMatchObject({ code: "SEO_BUDGET" });
    await expect(
      reserveUsage("2026-10-29", { tokensReserved: 30001 }, settings),
    ).rejects.toMatchObject({ code: "SEO_BUDGET" });
    await reserveUsage("2026-10-29", { draftsReserved: 1 }, settings);
    await expect(
      reserveUsage("2026-10-29", { draftsReserved: 1 }, settings),
    ).rejects.toMatchObject({ code: "SEO_BUDGET" });
  });
  it("rejects conflicting page intent instead of making a commercial keyword into a blog", () => {
    expect(classify("corporate gifting platform", "commercial").pageType).toBe(
      "commercial_landing",
    );
    expect(classify(keyword, "informational").pageType).toBe(
      "educational_blog",
    );
    expect(
      classify(keyword, "informational", "https://shelfmerch.io/blog/existing")
        .pageType,
    ).toBe("refresh");
  });
  it("does not invent missing volume/difficulty in opportunity scoring", async () => {
    const settings = await getSeoSettings();
    const result = scoreOpportunity(
      { keyword, intent: "informational", volume: null, difficulty: null },
      settings,
    );
    expect(result.scoreExplanation.components).toMatchObject({
      volume: 0,
      difficulty: 0,
      relevance: 100,
    });
  });
});

describe("grounded generation and recoverable persistence", () => {
  it("retries a skipped job after approved knowledge is supplied without creating a second daily job", async () => {
    const original = await setupOpportunity();
    await SeoKnowledge.deleteMany({});
    const skipped = await generateDraft(original);
    expect(skipped.status).toBe("skipped");
    expect(skipped.stages.selection.status).toBe("skipped");
    const fact = await SeoKnowledge.create({
      text: original.text,
      sourceRef: original.sourceRef,
      status: "approved",
    });
    const { token } = await tokenFor("platform_sales_manager");
    const response = await request(app)
      .post(`/api/v1/platform/seo-growth/jobs/${skipped._id}/retry`)
      .set(auth(token));
    expect(response.status).toBe(202);
    expect(response.body._id).toBe(String(skipped._id));
    const completed = await runSeoJob(await claimSeoJob(), dependencies(fact));
    expect(completed.status).toBe("completed");
    expect(await SeoJob.countDocuments()).toBe(1);
    expect(await BlogPost.countDocuments()).toBe(1);
  });
  it("does not overwrite a manual edit when replaying an already committed persistence stage", async () => {
    const fact = await setupOpportunity();
    const first = await generateDraft(fact);
    const article = await BlogPost.findById(first.articleId);
    article.title = "Manually Revised Welcome Kit Guide";
    await article.save();
    await SeoJob.updateOne(
      { _id: first._id },
      {
        $set: {
          status: "queued",
          nextAttemptAt: new Date(),
          attempts: 0,
          "stages.persistence": { status: "pending" },
        },
      },
    );
    const deps = dependencies(fact);
    const job = await runSeoJob(await claimSeoJob(), deps);
    expect(job.status).toBe("completed");
    expect((await BlogPost.findById(first.articleId)).title).toBe(
      "Manually Revised Welcome Kit Guide",
    );
    expect((await SeoContent.findOne()).revisions).toHaveLength(1);
    expect(deps.generate).not.toHaveBeenCalled();
  });
  it("enforces the new local day's draft cap when generation crosses midnight", async () => {
    const fact = await setupOpportunity();
    await SeoDay.create({ scope: SCOPE, day: "2026-10-30", draftsReserved: 1 });
    let clock = new Date("2026-10-29T18:29:00Z");
    const base = dependencies(fact);
    const deps = {
      ...base,
      now: () => clock,
      generate: async (...args) => {
        const result = await base.generate(...args);
        if (args[0] === generatedSchema)
          clock = new Date("2026-10-29T18:31:00Z");
        return result;
      },
    };
    const job = await generateDraft(fact, deps);
    expect(job.status).toBe("failed");
    expect(await BlogPost.countDocuments()).toBe(0);
    expect((await SeoDay.findOne({ day: "2026-10-30" })).draftsReserved).toBe(
      1,
    );
  });
  it("creates one native draft and prevents repeated daily generation", async () => {
    const fact = await setupOpportunity();
    const deps = dependencies(fact);
    const job = await generateDraft(fact, deps);
    expect(job.status).toBe("completed");
    expect(deps.generate).toHaveBeenCalledTimes(3);
    const article = await BlogPost.findById(job.articleId);
    expect(article.status).toBe("draft");
    expect(article.seoManaged).toBe(true);
    expect(await SeoContent.countDocuments()).toBe(1);
    await enqueueDailySeo({ manual: true });
    expect(await claimSeoJob()).toBeNull();
    expect((await SeoDay.findOne()).draftsReserved).toBe(1);
  });
  it("skips an empty opportunity set without calling Claude", async () => {
    const fact = await setupOpportunity();
    await SeoKeyword.deleteMany({});
    const deps = dependencies(fact);
    const job = await generateDraft(fact, deps);
    expect(job.status).toBe("skipped");
    expect(deps.generate).not.toHaveBeenCalled();
    expect(await BlogPost.countDocuments()).toBe(0);
  });
  it("detects existing drafts and recommends refresh rather than duplicate generation", async () => {
    const fact = await setupOpportunity();
    await BlogPost.create({ title: keyword, slug: "existing-welcome" });
    const job = await generateDraft(fact);
    expect(job.status).toBe("skipped");
    expect((await SeoKeyword.findOne()).state).toBe("refresh");
  });
  it("retries transient provider errors with bounded exponential backoff", async () => {
    const fact = await setupOpportunity();
    const failure = Object.assign(new Error("unsafe provider payload"), {
      code: "SEO_PROVIDER_RETRY",
    });
    const job = await generateDraft(
      fact,
      dependencies(fact, { generate: vi.fn().mockRejectedValue(failure) }),
    );
    expect(job.status).toBe("retry");
    expect(job.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(job.error).not.toContain("unsafe provider");
    expect(job.stages.brief_review.status).toBe("failed");
  });
  it("strictly rejects malformed Claude output and unsupported evidence", async () => {
    const fact = await setupOpportunity();
    const data = output(fact);
    expect(() =>
      generatedSchema.parse({ ...data, extraToolCall: "publish" }),
    ).toThrow();
    data.sections[1].paragraphs[0].text =
      "ShelfMerch guarantees delivery everywhere.";
    const checked = validateGenerated(data, {
      keyword,
      facts: [{ id: String(fact._id), text: fact.text }],
      allowedLinks: ["/request-demo"],
    });
    expect(
      checked.findings.some((finding) => finding.code === "evidence"),
    ).toBe(true);
  });
  it("allows planning ordinals in advice but blocks commercial claim patterns", () => {
    expect(
      looksLikeUnsupportedClaim(
        "List three occasions and map recipients before setting tiers.",
      ),
    ).toBe(false);
    expect(looksLikeUnsupportedClaim("Start with step 1: define goals.")).toBe(
      false,
    );
    expect(
      looksLikeUnsupportedClaim(
        "ShelfMerch helps organizations manage employee gifting workflows.",
      ),
    ).toBe(true);
    expect(looksLikeUnsupportedClaim("Budget about $50 per employee.")).toBe(
      true,
    );
    expect(
      looksLikeUnsupportedClaim("Integrations with HRIS systems are available."),
    ).toBe(true);
    const factId = "507f1f77bcf86cd799439011";
    const brief = {
      keyword,
      facts: [
        {
          id: factId,
          text: "ShelfMerch is a corporate gifting platform.",
        },
      ],
      allowedLinks: ["/request-demo"],
    };
    const base = {
      title: "How to plan a corporate gifting budget",
      slug: "how-to-plan-a-corporate-gifting-budget",
      metaTitle: "How to plan a corporate gifting budget",
      metaDescription:
        "A practical planning guide for enterprise owners building an annual corporate gifting budget.",
      primaryKeyword: keyword,
      supportingKeywords: [],
      intent: "informational",
      summary:
        "A practical planning guide for enterprise owners building an annual corporate gifting budget.",
      sections: [
        {
          heading: "Map your programs",
          level: 2,
          paragraphs: [
            {
              kind: "advice",
              text: "List three occasions and map recipients before setting tiers.",
              evidenceIds: [],
            },
          ],
        },
        {
          heading: "Where ShelfMerch fits",
          level: 2,
          paragraphs: [
            {
              kind: "fact",
              text: "ShelfMerch is a corporate gifting platform.",
              evidenceIds: [factId],
            },
          ],
        },
      ],
      internalLinks: [],
      faqs: [],
      cta: { text: "Book a ShelfMerch demo", href: "/request-demo" },
      schemaType: "BlogPosting",
      qualityNotes: [],
    };
    expect(
      validateGenerated(base, brief).findings.some(
        (finding) => finding.code === "unsupported_advice_claim",
      ),
    ).toBe(false);
    const withBrandAdvice = structuredClone(base);
    withBrandAdvice.sections[0].paragraphs[0] = {
      kind: "advice",
      text: "Use ShelfMerch to automate approvals across regions.",
      evidenceIds: [],
    };
    const relaxed = validateGenerated(withBrandAdvice, brief);
    expect(
      relaxed.findings.some(
        (finding) =>
          finding.code === "unsupported_advice_claim" &&
          finding.severity === "warning",
      ),
    ).toBe(true);
    const strict = validateGenerated(withBrandAdvice, brief, { strict: true });
    expect(
      strict.findings.some(
        (finding) =>
          finding.code === "unsupported_advice_claim" &&
          finding.severity === "error",
      ),
    ).toBe(true);
  });
  it("resumes persisted generation after a crash without generating the article again", async () => {
    const fact = await setupOpportunity();
    await enqueueDailySeo({ manual: true });
    const claimed = await claimSeoJob();
    await SeoJob.updateOne(
      { _id: claimed._id },
      {
        $set: {
          generated: output(fact),
          brief: {
            keyword,
            facts: [{ id: String(fact._id), text: fact.text }],
            allowedLinks: ["/request-demo"],
          },
          keywordId: (await SeoKeyword.findOne())._id,
          "stages.generation": { status: "completed" },
        },
      },
    );
    const deps = dependencies(fact);
    const job = await runSeoJob(await SeoJob.findById(claimed._id), deps);
    expect(job.status).toBe("completed");
    expect(deps.generate).toHaveBeenCalledTimes(1);
  });
});

describe("approval, authorization and native SEO publication", () => {
  it("regenerates a never-published draft in place with feedback and clears approval", async () => {
    const fact = await setupOpportunity();
    const first = await generateDraft(fact);
    const { token } = await tokenFor("platform_sales_manager");
    const content = await SeoContent.findOne();
    const response = await request(app)
      .post(`/api/v1/platform/seo-growth/contents/${content._id}/regenerate`)
      .set(auth(token))
      .send({ feedback: "Make the planning advice clearer." });
    expect(response.status).toBe(202);
    const deps = dependencies(fact);
    const job = await runSeoJob(await claimSeoJob(), deps);
    expect(job.status).toBe("completed");
    expect(String(job.articleId)).toBe(String(first.articleId));
    expect(await BlogPost.countDocuments()).toBe(1);
    expect(await SeoContent.countDocuments()).toBe(1);
    expect((await SeoContent.findOne()).revisions).toHaveLength(2);
    expect((await SeoContent.findOne()).approvedHash).toBe("");
    expect((await SeoDay.findOne()).draftsReserved).toBe(1);
  });
  it("blocks tenant users and nonmarketing writers from platform SEO data", async () => {
    const ops = await tokenFor("platform_ops_admin");
    expect(
      (
        await request(app)
          .get("/api/v1/platform/seo-growth")
          .set(auth(ops.token))
      ).status,
    ).toBe(403);
    const tenantUser = await User.create({
      name: "Tenant",
      email: "tenant@seo.test",
      status: "active",
    });
    const token = signAccessToken(tenantUser, {
      role: "company_admin",
      tenantId: new mongoose.Types.ObjectId(),
      scopeType: "tenant",
    });
    expect(
      (await request(app).get("/api/v1/platform/seo-growth").set(auth(token)))
        .status,
    ).toBe(403);
    expect((await request(app).get("/api/v1/platform/seo-growth")).status).toBe(
      401,
    );
  });
  it("requires current human approval, publishes crawlable HTML and is retry-safe", async () => {
    const fact = await setupOpportunity();
    const job = await generateDraft(fact);
    const { token, user } = await tokenFor("platform_sales_manager");
    const url = `/api/v1/platform/blog-posts/${job.articleId}/publish`;
    const blocked = await request(app).post(url).set(auth(token));
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe("SEO_APPROVAL_REQUIRED");
    const content = await SeoContent.findOne();
    const article = await BlogPost.findById(job.articleId);
    const approved = await request(app)
      .post(`/api/v1/platform/seo-growth/contents/${content._id}/review`)
      .set(auth(token))
      .send({
        action: "approve",
        revisionHash: articleHash(article),
        factsAndLinksChecked: true,
        feedback: "Sources independently checked.",
      });
    expect(approved.status).toBe(200);
    expect(approved.body.reviewer).toBe(String(user._id));
    expect((await request(app).post(url).set(auth(token))).status).toBe(200);
    const first = (await BlogPost.findById(job.articleId)).publishedAt;
    expect((await request(app).post(url).set(auth(token))).status).toBe(200);
    expect((await BlogPost.findById(job.articleId)).publishedAt).toEqual(first);
    const page = await request(app).get("/blog/plan-employee-welcome-kits");
    expect(page.status).toBe(200);
    expect(page.text).toContain("<h1>How to Plan Employee Welcome Kits</h1>");
    expect(page.text).toContain("<h2>Define the program</h2>");
    expect(page.text).toContain(
      "https://shelfmerch.io/blog/plan-employee-welcome-kits",
    );
    expect(page.text).toContain('"@type":"BlogPosting"');
    expect((await request(app).get("/sitemap-blog.xml")).text).toContain(
      "/blog/plan-employee-welcome-kits",
    );
    expect(
      (
        await request(app)
          .patch(`/api/v1/platform/blog-posts/${job.articleId}`)
          .set(auth(token))
          .send({ title: "Unreviewed edit" })
      ).status,
    ).toBe(409);
  });
  it("invalidates approval after editing and rejects stale reviewer versions", async () => {
    const fact = await setupOpportunity();
    const job = await generateDraft(fact);
    const { token, user } = await tokenFor("platform_sales_manager");
    const content = await SeoContent.findOne();
    const article = await BlogPost.findById(job.articleId);
    const revisionHash = articleHash(article);
    await reviewSeoContent(
      content._id,
      {
        action: "approve",
        revisionHash,
        factsAndLinksChecked: true,
        feedback: "",
      },
      user._id,
    );
    expect(
      (
        await request(app)
          .patch(`/api/v1/platform/blog-posts/${job.articleId}`)
          .set(auth(token))
          .send({ title: "Updated Employee Welcome Kit Planning" })
      ).status,
    ).toBe(200);
    expect((await BlogPost.findById(job.articleId)).seoApprovedHash).toBe("");
    await expect(
      reviewSeoContent(
        content._id,
        { action: "approve", revisionHash, factsAndLinksChecked: true },
        user._id,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await request(app)
          .post(`/api/v1/platform/blog-posts/${job.articleId}/publish`)
          .set(auth(token))
      ).status,
    ).toBe(422);
  });
  it("blocks retired evidence and unsupported claims even when a reviewer asks to approve", async () => {
    const fact = await setupOpportunity();
    await SeoSetting.updateOne(
      { _id: "platform" },
      { $set: { strictContentGuards: true } },
    );
    const job = await generateDraft(fact);
    const { user } = await tokenFor("platform_sales_manager");
    await SeoKnowledge.updateOne(
      { _id: fact._id },
      { $set: { status: "retired" } },
    );
    const article = await BlogPost.findById(job.articleId);
    const content = await SeoContent.findOne();
    await expect(
      reviewSeoContent(
        content._id,
        {
          action: "approve",
          revisionHash: articleHash(article),
          factsAndLinksChecked: true,
        },
        user._id,
      ),
    ).rejects.toMatchObject({ code: "SEO_QA_BLOCKED" });
  });
});

describe("analytics integrity and provider boundaries", () => {
  it("distinguishes unchecked provider access from an actual failed check", async () => {
    const settings = await getSeoSettings();
    expect(providerStatus(settings).windsor).toMatchObject({
      accessVerified: null,
      verificationStatus: "not_checked",
    });
    expect(providerStatus(settings).claude).toMatchObject({
      accessVerified: null,
      verificationStatus: "not_checked",
    });
    env.ANTHROPIC_API_KEY = "test-key";
    env.WINDSOR_API_KEY = "test-key";
    settings.model = "test-model";
    const failed = await testProviderAccess(settings, async () => ({
      ok: false,
      status: 403,
    }));
    expect(failed.windsor).toMatchObject({
      accessVerified: false,
      verificationStatus: "failed",
    });
    expect(failed.claude).toMatchObject({
      accessVerified: false,
      verificationStatus: "failed",
    });
    const passed = await testProviderAccess(settings, async (url) => ({
      ok: true,
      text: async () =>
        JSON.stringify(
          url.includes("anthropic.com") ? { data: [{ id: "test-model" }] } : [],
        ),
    }));
    expect(passed.windsor).toMatchObject({
      accessVerified: true,
      verificationStatus: "verified",
    });
    expect(passed.claude).toMatchObject({
      accessVerified: true,
      verificationStatus: "verified",
    });
  });
  it("rejects invalid metrics and keeps different verified property aggregations separate", async () => {
    const input = {
      source: "gsc",
      property: "sc-domain:shelfmerch.io",
      periodStart: "2026-10-01",
      periodEnd: "2026-10-28",
      granularity: "daily",
    };
    expect(() =>
      normalizeSnapshot({ date: "2026-10-27", clicks: false }, input),
    ).toThrow("metric is invalid");
    expect(() => normalizeSnapshot({ date: "2026-10-29" }, input)).toThrow(
      "reporting date",
    );
    await ingestSnapshots(
      [{ date: "2026-10-27", clicks: 2, impressions: 49 }],
      input,
    );
    await ingestSnapshots(
      [{ date: "2026-10-27", clicks: 5, impressions: 90 }],
      { ...input, property: "https://shelfmerch.io/" },
    );
    const { token } = await tokenFor("platform_sales_manager");
    const response = await request(app)
      .get("/api/v1/platform/seo-growth")
      .set(auth(token));
    expect(response.status).toBe(200);
    expect(response.body.performance.periods[0]).toMatchObject({
      clicks: 2,
      impressions: 49,
    });
  });
  it("uses the verified ShelfMerch baseline without forcing an article from sparse unrelated queries", async () => {
    const baseline = JSON.parse(
      await readFile(
        new URL(
          "../../../docs/seo-content-engine/gsc-baseline-2026-10-29.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const settings = await getSeoSettings();
    settings.researchMode = "import";
    await settings.save();
    const input = {
      source: "gsc",
      property: baseline.property,
      periodStart: baseline.periodStart,
      periodEnd: baseline.periodEnd,
    };
    await ingestSnapshots(baseline.reports.daily.rows, {
      ...input,
      granularity: "daily",
    });
    await ingestSnapshots(baseline.reports.queries.rows, {
      ...input,
      granularity: "query",
    });
    await ingestSnapshots(baseline.reports.pages.rows, {
      ...input,
      granularity: "page",
    });
    const rows = await SeoSnapshot.find({ scope: SCOPE }).lean();
    const summary = performanceSummary(rows);
    expect(summary.periods[0]).toMatchObject({
      clicks: 2,
      impressions: 49,
      latestReportingDate: "2026-10-27",
    });
    await importKeywords(gscOpportunities(rows), undefined, "windsor_gsc");
    const deps = dependencies({ text: "unused", _id: "unused" });
    await enqueueDailySeo({ manual: true });
    const job = await runSeoJob(await claimSeoJob(), deps);
    expect(job.status).toBe("skipped");
    expect(deps.generate).not.toHaveBeenCalled();
    expect(await BlogPost.countDocuments()).toBe(0);
    expect(await SeoKeyword.countDocuments()).toBe(5);
  });
  it("builds nonoverlapping finalized comparison windows", () => {
    expect(reportingPeriods(new Date("2026-10-29T00:00:00Z"), 3)).toEqual([
      { periodStart: "2026-09-29", periodEnd: "2026-10-26" },
      { periodStart: "2026-09-01", periodEnd: "2026-09-28" },
    ]);
  });
  it("rejects a different Search Console property and preserves missing metrics", () => {
    const input = {
      source: "gsc",
      property: "sc-domain:shelfmerch.io",
      periodStart: "2026-10-01",
      periodEnd: "2026-10-28",
      granularity: "daily",
    };
    expect(() =>
      normalizeSnapshot({ account_id: "quizup.site" }, input),
    ).toThrow("another property");
    expect(
      normalizeSnapshot(
        { account_id: "shelfmerch.io", date: "2026-10-27" },
        input,
      ).metrics,
    ).toEqual({ clicks: null, impressions: null, position: null, ctr: null });
  });
  it("ingests snapshots idempotently and never substitutes query/page aggregates for property totals", async () => {
    const input = {
      source: "gsc",
      property: "sc-domain:shelfmerch.io",
      periodStart: "2026-10-01",
      periodEnd: "2026-10-28",
      granularity: "daily",
    };
    await ingestSnapshots(
      [
        {
          account_id: "shelfmerch.io",
          date: "2026-10-27",
          clicks: 2,
          impressions: 49,
        },
      ],
      input,
    );
    await ingestSnapshots(
      [
        {
          account_id: "shelfmerch.io",
          date: "2026-10-27",
          clicks: 2,
          impressions: 49,
        },
      ],
      input,
    );
    await ingestSnapshots(
      [{ query: "shelfmerch", clicks: 0, impressions: 4 }],
      { ...input, granularity: "query" },
    );
    const summary = performanceSummary(await SeoSnapshot.find().lean());
    expect(await SeoSnapshot.countDocuments()).toBe(2);
    expect(summary.periods[0]).toMatchObject({
      clicks: 2,
      impressions: 49,
      latestReportingDate: "2026-10-27",
    });
    expect(summary.qualifiedOrganicLeads).toBeNull();
  });
  it("discovers supported Windsor fields before querying and rejects truncated results", async () => {
    const read = vi.fn(async (connector) =>
      connector.endsWith("/fields") ? [{ id: "account_id" }] : { data: [] },
    );
    const result = await collectAnalytics(
      await getSeoSettings(),
      new Date(),
      read,
    );
    expect(read).toHaveBeenCalledTimes(1);
    expect(
      result.reports.every((report) => report.status === "unavailable"),
    ).toBe(true);
  });
  it("redacts provider failures and bounds timeout/retry signaling", async () => {
    await expect(
      providerRequest(
        "Windsor",
        "https://connectors.windsor.ai/searchconsole",
        {},
        vi.fn(async () => ({ ok: false, status: 429 })),
      ),
    ).rejects.toMatchObject({ code: "SEO_PROVIDER_RETRY" });
    await expect(
      providerRequest(
        "Claude",
        "https://api.anthropic.com/v1/messages",
        {},
        vi.fn(async () => {
          throw new Error("secret=value");
        }),
      ),
    ).rejects.toMatchObject({
      message: "Claude network request failed or timed out",
    });
  });
  it("reserves Claude costs before a generation request and rejects truncated JSON", async () => {
    env.ANTHROPIC_API_KEY = "test-key";
    const fact = await setupOpportunity();
    const settings = await getSeoSettings();
    const events = [];
    const transport = vi.fn(async (url) => {
      events.push(url.endsWith("count_tokens") ? "count" : "generate");
      return {
        ok: true,
        text: async () =>
          JSON.stringify(
            url.endsWith("count_tokens")
              ? { input_tokens: 100 }
              : {
                  stop_reason: "max_tokens",
                  content: [],
                  usage: { input_tokens: 100, output_tokens: 6000 },
                },
          ),
      };
    });
    await expect(
      claudeStructured(
        generatedSchema,
        { brief: fact.text },
        settings,
        async () => events.push("reserve"),
        async () => {},
        transport,
      ),
    ).rejects.toMatchObject({ code: "SEO_OUTPUT_INVALID" });
    expect(events).toEqual(["count", "reserve", "generate"]);
  });
  it("does not call paid Semrush APIs without a server key or sufficient unit budget", async () => {
    env.SEMRUSH_API_KEY = "";
    const settings = await getSeoSettings();
    const transport = vi.fn();
    await expect(
      semrushResearch(settings, vi.fn(), transport),
    ).rejects.toMatchObject({ code: "SEO_PROVIDER_MISSING" });
    env.SEMRUSH_API_KEY = "test-key";
    await expect(
      semrushResearch(
        settings,
        async () => {
          throw Object.assign(new Error("cap"), { code: "SEO_BUDGET" });
        },
        transport,
      ),
    ).rejects.toMatchObject({ code: "SEO_BUDGET" });
    expect(transport).not.toHaveBeenCalled();
  });
});
