import { z } from "zod";
import { SeoKnowledge, SCOPE } from "./seoGrowth.models.js";

// Records saved before knowledge categories existed are ShelfMerch business facts.
export const approvedBusinessKnowledge = () => ({
  scope: SCOPE,
  status: "approved",
  $or: [{ kind: "business_fact" }, { kind: { $exists: false } }],
});
export const isApprovedBusinessFact = (fact) =>
  fact.status === "approved" && (!fact.kind || fact.kind === "business_fact");

export const knowledgeInput = z
  .object({
    kind: z
      .enum(["business_fact", "competitor_research"])
      .default("business_fact"),
    subject: z.string().trim().min(2).max(100).default("ShelfMerch"),
    text: z.string().trim().min(10).max(2000),
    sourceRef: z.string().trim().min(3).max(300),
    sourceUrl: z
      .union([z.literal(""), z.string().url().startsWith("https://")])
      .default(""),
    researchedAt: z.string().datetime().optional(),
  })
  .strict()
  .superRefine((row, context) => {
    if (
      row.kind === "competitor_research" &&
      (!row.sourceUrl ||
        !row.researchedAt ||
        row.subject.toLowerCase() === "shelfmerch")
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Competitor research needs a competitor name, HTTPS source and research date.",
      });
    }
    if (row.kind === "business_fact" && row.subject !== "ShelfMerch") {
      context.addIssue({
        code: "custom",
        message: "Business facts must describe ShelfMerch.",
      });
    }
  });

// Validate the complete batch before writing. Re-imports never replace reviews or edits.
export async function importCompetitorKnowledge(rows) {
  const parsed = z
    .array(
      z
        .object({
          importKey: z.string().min(10).max(150),
          kind: z.literal("competitor_research"),
          subject: z.string(),
          text: z.string(),
          sourceRef: z.string(),
          sourceUrl: z.string(),
          researchedAt: z.string(),
        })
        .strict(),
    )
    .min(1)
    .max(100)
    .parse(rows);
  const validated = parsed.map(({ importKey, ...row }) => ({
    ...knowledgeInput.parse(row),
    importKey,
  }));
  if (new Set(validated.map((row) => row.importKey)).size !== validated.length)
    throw new Error("Duplicate research import keys");
  const result = await SeoKnowledge.bulkWrite(
    validated.map((row) => ({
      updateOne: {
        filter: { scope: SCOPE, importKey: row.importKey },
        update: {
          $setOnInsert: {
            ...row,
            scope: SCOPE,
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        upsert: true,
        timestamps: false,
      },
    })),
  );
  return {
    inserted: result.upsertedCount,
    existing: validated.length - result.upsertedCount,
  };
}
