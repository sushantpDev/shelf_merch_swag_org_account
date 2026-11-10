import { createHash } from "node:crypto";
import { z } from "zod";
import { validateBlogContent, blogPlainText } from "../blog/blogContent.js";

export const normalizeKeyword = (value) =>
  value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export const sha = (value) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
export function articleHash(article) {
  return sha(
    Object.fromEntries(
      [
        "title",
        "slug",
        "excerpt",
        "content",
        "seoTitle",
        "seoDescription",
        "coverImageUrl",
        "coverImageAlt",
        "authorName",
      ].map((key) => [key, article[key] ?? ""]),
    ),
  );
}
export function localSchedule(now, timezone, researchTime) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    due: `${parts.hour}:${parts.minute}` >= researchTime,
  };
}
export const PAGE_TYPES = [
  "homepage",
  "commercial_landing",
  "solution",
  "integration",
  "category",
  "comparison",
  "case_study",
  "educational_blog",
  "refresh",
];
export const CLUSTERS = [
  "corporate_gifting",
  "gifting_platforms",
  "employee_recognition",
  "employee_rewards",
  "onboarding_kits",
  "branded_merchandise",
  "company_stores",
  "employee_engagement",
  "gifting_automation",
  "hr_integrations",
];
export function classify(keyword, intent = "unknown", existingPage = "") {
  const k = normalizeKeyword(keyword);
  const cluster = /integrat|hris|workday|bamboo/.test(k)
    ? "hr_integrations"
    : /automat/.test(k)
      ? "gifting_automation"
      : /recognition/.test(k)
        ? "employee_recognition"
        : /engagement/.test(k)
          ? "employee_engagement"
          : /welcome|onboard/.test(k)
            ? "onboarding_kits"
            : /reward|point/.test(k)
              ? "employee_rewards"
              : /store|shop/.test(k)
                ? "company_stores"
                : /platform|software/.test(k)
                  ? "gifting_platforms"
                  : /merch|swag/.test(k)
                    ? "branded_merchandise"
                    : "corporate_gifting";
  const pageType = existingPage
    ? "refresh"
    : /\bshelf ?merch\b/.test(k) && !/how|guide|vs/.test(k)
      ? "homepage"
      : /integrat/.test(k)
        ? "integration"
        : /\bvs\b|versus|alternatives|compare/.test(k)
          ? "comparison"
          : /case study/.test(k)
            ? "case_study"
            : intent === "informational" &&
                /^(how|what|why|when)|guide|checklist|ideas|planning/.test(k)
              ? "educational_blog"
              : /solution|for (hr|teams|enterprise)/.test(k)
                ? "solution"
                : /buy|products|catalog/.test(k)
                  ? "category"
                  : "commercial_landing";
  return { cluster, pageType };
}
export function scoreOpportunity(row, settings) {
  const k = normalizeKeyword(row.keyword);
  const relevance =
    /swag|merch|welcome kit|gifting budget|gifting platform/.test(k)
      ? 100
      : /employee|corporate gift/.test(k)
        ? 70
        : 0;
  const conversion =
    row.intent === "transactional"
      ? 100
      : row.intent === "commercial"
        ? 90
        : /company|employee|corporate|onboard|welcome/.test(k)
          ? 75
          : 30;
  const components = {
    relevance,
    conversion,
    difficulty:
      row.difficulty === null || row.difficulty === undefined
        ? 0
        : 100 - row.difficulty,
    volume:
      row.volume == null ? 0 : Math.min(100, Math.log10(row.volume + 1) * 25),
  };
  const weights = settings.weights;
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  const score = Math.round(
    Object.entries(components).reduce(
      (sum, [key, value]) => sum + value * weights[key],
      0,
    ) / total,
  );
  return {
    relevance,
    conversion,
    score,
    scoreExplanation: {
      components,
      weights,
      note: "Missing metrics contribute zero; no ranking promise. Rules are deterministic and inspectable.",
    },
  };
}
const STOP = new Set([
  "the",
  "a",
  "an",
  "to",
  "for",
  "and",
  "of",
  "in",
  "how",
  "what",
  "with",
  "your",
  "guide",
]);
export function similarity(a, b) {
  const tokens = (value) =>
    new Set(
      normalizeKeyword(value)
        .split(" ")
        .filter((x) => !STOP.has(x))
        .map((x) => x.replace(/s$/, "")),
    );
  const x = tokens(a);
  const y = tokens(b);
  return (
    [...x].filter((value) => y.has(value)).length /
    Math.max(1, new Set([...x, ...y]).size)
  );
}

const paragraphSchema = z
  .object({
    text: z.string().min(1).max(5000),
    kind: z.enum(["advice", "fact"]),
    evidenceIds: z.array(z.string()).max(20),
  })
  .strict();
export const generatedSchema = z
  .object({
    title: z.string().min(5).max(180),
    slug: z
      .string()
      .min(3)
      .max(100)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    metaTitle: z.string().min(5).max(180),
    metaDescription: z.string().min(20).max(400),
    primaryKeyword: z.string().min(1),
    supportingKeywords: z.array(z.string()).max(20),
    intent: z.literal("informational"),
    summary: z.string().min(20).max(400),
    sections: z
      .array(
        z
          .object({
            heading: z.string().min(1).max(200),
            level: z.union([z.literal(2), z.literal(3)]),
            paragraphs: z.array(paragraphSchema).min(1).max(20),
          })
          .strict(),
      )
      .min(2)
      .max(30),
    internalLinks: z
      .array(
        z
          .object({ href: z.string(), anchor: z.string().min(1).max(200) })
          .strict(),
      )
      .max(12),
    faqs: z
      .array(
        z
          .object({ question: z.string().max(200), answer: paragraphSchema })
          .strict(),
      )
      .max(8),
    cta: z
      .object({
        text: z.literal("Book a ShelfMerch demo"),
        href: z.literal("/request-demo"),
      })
      .strict(),
    schemaType: z.literal("BlogPosting"),
    qualityNotes: z.array(z.string().max(500)).max(20),
  })
  .strict();
/** Anthropic structured-output JSON Schema rejects maxLength, so Claude can
 *  overshoot; clip before validating so review stages do not fail on verbosity. */
const clipped = (min, max) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.length > max
        ? value.slice(0, max)
        : value,
    z.string().min(min).max(max),
  );
export const languageReviewSchema = z
  .object({
    findings: z.array(clipped(1, 500)).max(30),
    intentMatch: z.boolean(),
    repetitive: z.boolean(),
  })
  .strict();
export const opportunityDecisionSchema = z
  .object({
    pageType: z.enum(PAGE_TYPES),
    duplicate: z.boolean(),
    businessRelevant: z.boolean(),
    existingUrl: z.string().max(2000),
    explanation: clipped(5, 1000),
    contentAngle: clipped(5, 1000),
  })
  .strict();

/**
 * Advice paragraphs may use plain planning language (including ordinals like
 * "step 1" or "3 occasions"). Product/commercial claims still require an exact
 * approved fact paragraph — brand, money, %, customers, integrations, etc.
 */
export function looksLikeUnsupportedClaim(text) {
  if (typeof text !== "string" || !text.trim()) return false;
  if (/\bShelf\s?Merch\b/i.test(text)) return true;
  if (
    /\b(guarantee|guarantees|guaranteed|testimonial|testimonials)\b/i.test(text)
  )
    return true;
  if (/\bcertif\w*\b/i.test(text)) return true;
  if (/\bintegrat(?:e|es|ed|ing|ion|ions)\b/i.test(text)) return true;
  if (/\bcustomers?\b/i.test(text)) return true;
  if (/\bpercent(?:age)?\b|[%$₹£€]/i.test(text)) return true;
  if (
    /\d[\d,]*(?:\.\d+)?\s*(?:%|usd|inr|rs\.?|dollars?|rupees?|employees?|customers?|users?|clients?)\b/i.test(
      text,
    )
  )
    return true;
  if (/(?:usd|inr|rs\.?|\$|₹|£|€)\s*\d/i.test(text)) return true;
  return false;
}

export function validateGenerated(raw, brief, { strict = false } = {}) {
  const data = generatedSchema.parse(raw);
  const findings = [];
  const severity = strict ? "error" : "warning";
  const note = (code, message, level = severity) =>
    findings.push({ code, severity: level, message });
  if (normalizeKeyword(data.primaryKeyword) !== normalizeKeyword(brief.keyword))
    note(
      "keyword",
      "Generated primary keyword differs from the selected opportunity.",
    );
  if (data.sections[0].level !== 2)
    note("headings", "The article must begin with H2 below the title H1.");
  const facts = new Map(brief.facts.map((fact) => [String(fact.id), fact]));
  const paragraphs = [
    ...data.sections.flatMap((section) => section.paragraphs),
    ...data.faqs.map((faq) => faq.answer),
  ];
  for (const paragraph of paragraphs) {
    if (paragraph.kind === "fact") {
      if (
        !paragraph.evidenceIds.length ||
        paragraph.evidenceIds.some((id) => !facts.has(id)) ||
        !paragraph.evidenceIds.some(
          (id) => facts.get(id)?.text === paragraph.text,
        )
      )
        note(
          "evidence",
          "Factual paragraphs must reproduce a verified approved claim with its evidence ID; otherwise revise or approve a supporting source.",
        );
    } else if (looksLikeUnsupportedClaim(paragraph.text)) {
      note(
        "unsupported_advice_claim",
        "An advice paragraph contains a product, numeric, customer, or commercial assertion requiring claim evidence.",
      );
    }
    if (/<[^>]+>|\b(?:TODO|TBD|PLACEHOLDER)\b|\{\{/.test(paragraph.text))
      note("markup", "Unsupported markup or unresolved placeholders.", "error");
  }
  for (const link of data.internalLinks)
    if (!brief.allowedLinks.includes(link.href))
      note("internal_link", `Unapproved internal link: ${link.href}`);
  const headings = data.sections.map((section) =>
    section.heading.toLowerCase(),
  );
  if (new Set(headings).size !== headings.length)
    note("repetition", "Repeated section headings.");
  if (
    new Set(paragraphs.map((p) => p.text.toLowerCase())).size !==
    paragraphs.length
  )
    note("repetition", "Repeated paragraphs.");
  return { data, findings };
}

export function toBlogDraft(data) {
  const p = (text) => ({
    type: "paragraph",
    content: [{ type: "text", text }],
  });
  const h = (text, level) => ({
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }],
  });
  const content = data.sections.flatMap((section) => [
    h(section.heading, section.level),
    ...section.paragraphs.map((item) => p(item.text)),
  ]);
  if (data.faqs.length)
    content.push(
      h("Frequently asked questions", 2),
      ...data.faqs.flatMap((faq) => [h(faq.question, 3), p(faq.answer.text)]),
    );
  for (const link of data.internalLinks)
    content.push({
      type: "paragraph",
      content: [
        {
          type: "text",
          text: link.anchor,
          marks: [{ type: "link", attrs: { href: link.href } }],
        },
      ],
    });
  content.push({
    type: "paragraph",
    content: [
      {
        type: "text",
        text: data.cta.text,
        marks: [{ type: "link", attrs: { href: data.cta.href } }],
      },
    ],
  });
  const draft = {
    title: data.title,
    slug: data.slug,
    excerpt: data.summary,
    seoTitle: data.metaTitle,
    seoDescription: data.metaDescription,
    authorName: "ShelfMerch",
    content: { type: "doc", content },
  };
  validateBlogContent(draft.content);
  return draft;
}
export function reviewEditedArticle(
  article,
  content,
  facts,
  { strict = false } = {},
) {
  const generation = [...content.revisions]
    .reverse()
    .find((revision) =>
      ["generation", "regeneration"].includes(revision.reason),
    );
  const edited = articleHash(article) !== generation?.hash;
  const policy = strict ? "error" : "warning";
  const findings = edited
    ? []
    : [
        ...content.findings.filter(
          (finding) => finding.severity === "error" || !strict,
        ),
      ].map((finding) =>
        // When relaxed, carry prior policy findings as warnings so they stay visible.
        !strict && finding.severity === "error" && finding.code !== "content"
          ? { ...finding, severity: "warning" }
          : finding,
      );
  try {
    validateBlogContent(article.content);
  } catch {
    findings.push({
      severity: "error",
      code: "content",
      message: "Invalid native content.",
    });
  }
  if (
    !article.title ||
    !article.seoTitle ||
    !article.seoDescription ||
    !article.excerpt ||
    !blogPlainText(article.content)
  )
    findings.push({
      severity: "error",
      code: "metadata",
      message: "Title, metadata, excerpt and body are required.",
    });
  const approved = new Set(facts.map((fact) => String(fact._id)));
  if (!edited)
    for (const paragraph of [
      ...content.generated.sections.flatMap((section) => section.paragraphs),
      ...content.generated.faqs.map((faq) => faq.answer),
    ])
      if (paragraph.evidenceIds.some((id) => !approved.has(id)))
        findings.push({
          severity: policy,
          code: "retired_evidence",
          message: "A supporting claim is no longer approved.",
        });
  const approvedText = new Set(facts.map((fact) => fact.text));
  const allowedLinks = new Set([
    ...(content.brief.allowedLinks ?? []),
    ...facts.map((fact) => fact.sourceUrl).filter(Boolean),
  ]);
  let hasCta = false;
  const inspect = (node) => {
    if (node.type === "heading" && ![2, 3].includes(node.attrs?.level))
      findings.push({
        severity: policy,
        code: "headings",
        message: "Body headings must use H2/H3.",
      });
    if (node.type === "paragraph") {
      const value = blogPlainText({ content: node.content ?? [] });
      const isDemoCta = node.content?.some((child) =>
        child.marks?.some(
          (mark) =>
            mark.type === "link" && mark.attrs?.href === "/request-demo",
        ),
      );
      if (isDemoCta) hasCta = true;
      if (isDemoCta && value !== "Book a ShelfMerch demo")
        findings.push({
          severity: policy,
          code: "cta",
          message: "Use the verified CTA: Book a ShelfMerch demo.",
        });
      if (
        !isDemoCta &&
        looksLikeUnsupportedClaim(value) &&
        !approvedText.has(value)
      )
        findings.push({
          severity: policy,
          code: "unsupported_claim",
          message:
            "A product, numeric, customer or commercial claim lacks an exact approved supporting statement.",
        });
    }
    for (const mark of node.marks ?? [])
      if (mark.type === "link" && !allowedLinks.has(mark.attrs?.href))
        findings.push({
          severity: policy,
          code: "internal_link",
          message: "A link is outside the approved brief/source list.",
        });
    for (const child of node.content ?? []) inspect(child);
  };
  inspect(article.content);
  if (!hasCta)
    findings.push({
      severity: policy,
      code: "cta",
      message: "The approved demo CTA is missing.",
    });
  if (edited)
    findings.push({
      severity: "warning",
      code: "edited_content",
      message:
        "Content changed after generation; reviewer must independently verify all edits and links.",
    });
  return findings;
}
