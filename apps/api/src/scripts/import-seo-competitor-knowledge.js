import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import {
  importCompetitorKnowledge,
  knowledgeInput,
} from "../modules/seoGrowth/seoGrowth.knowledge.js";
import { AuditLog } from "../modules/auditLogs/auditLog.model.js";

const root = new URL("../../../../", import.meta.url);
dotenv.config({
  path: fileURLToPath(new URL("apps/api/.env", root)),
  quiet: true,
});
dotenv.config({ path: fileURLToPath(new URL(".env", root)), quiet: true });
const rows = JSON.parse(
  await readFile(
    new URL(
      "docs/seo-content-engine/competitor-knowledge-2026-10-30.json",
      root,
    ),
    "utf8",
  ),
);
for (const { importKey, ...row } of rows) knowledgeInput.parse(row);
if (!process.argv.includes("--apply")) {
  console.log(
    JSON.stringify({
      mode: "dry_run",
      entries: rows.length,
      competitors: [...new Set(rows.map((row) => row.subject))],
      status: "pending",
      writes: 0,
    }),
  );
} else {
  try {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URL;
    if (!uri) throw new Error("MongoDB is not configured");
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
      autoIndex: false,
      autoCreate: false,
    });
    const result = await importCompetitorKnowledge(rows);
    await AuditLog.create({
      action: "seo.competitor_research_import",
      entityType: "SeoKnowledge",
      actorRole: "system_import",
      after: {
        ...result,
        dataset: "competitor-knowledge-2026-10-30",
        status: "pending",
        approvalGranted: false,
      },
    });
    console.log(
      JSON.stringify({
        mode: "applied",
        ...result,
        status: "pending",
        approvalGranted: false,
      }),
    );
  } catch (error) {
    // Driver errors may contain connection details. Never print the URI or raw error.
    console.error(
      JSON.stringify({
        error: "Competitor research import failed",
        type: error.name,
      }),
    );
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
