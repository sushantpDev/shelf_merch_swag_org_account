import { apiFetch } from "./api";
import type { BlogPost } from "./blog-api";

export type SeoSettings = {
  enabled: boolean;
  timezone: string;
  researchTime: string;
  dailyDraftLimit: number;
  model: string;
  dailyUsdLimit: number;
  dailyTokenLimit: number;
  dailySemrushUnitLimit: number;
  maxOutputTokens: number;
  inputUsdPerMillion: number | null;
  outputUsdPerMillion: number | null;
  countries: string[];
  seedKeywords: string[];
  researchMode: "gsc" | "import" | "api";
  reportingLagDays: number;
  minimumScore: number;
  weights: { relevance: number; conversion: number; difficulty: number; volume: number };
  searchConsoleAccount: string;
  runLanguageReview: boolean;
  strictContentGuards: boolean;
};
export type SeoFact = {
  _id: string;
  kind?: "business_fact" | "competitor_research";
  subject?: string;
  researchedAt?: string;
  text: string;
  sourceRef: string;
  sourceUrl: string;
  status: string;
};
export type SeoKeyword = {
  _id: string;
  keyword: string;
  country: string;
  intent: string;
  pageType: string;
  volume: number | null;
  difficulty: number | null;
  currentRanking: number | null;
  score: number;
  source: string;
  retrievedAt: string;
  targetUrl: string;
  existingPage: string;
  searchMetrics?: { impressions: number; clicks: number };
  scoreExplanation: unknown;
};
export type SeoJob = {
  _id: string;
  day: string;
  stage: string;
  status: string;
  error?: string;
  reason?: string;
  attempts: number;
  stages: Record<string, unknown>;
  calls: unknown[];
};
export type SeoDraft = {
  _id: string;
  articleId: string;
  status: string;
  article?: BlogPost;
  plainText: string;
  revisionHash: string;
  approvalCurrent: boolean;
  findings: { severity: string; code: string; message: string }[];
  brief: { facts: { id: string; text: string; sourceRef: string; sourceUrl?: string }[] };
  feedback: string;
  languageReview: unknown;
};
export type SeoPerformance = {
  periods: {
    period: string;
    clicks: number | null;
    impressions: number | null;
    ctr: number | null;
    latestReportingDate: string | null;
    queries: {
      query: string;
      branded: boolean;
      metrics: { clicks: number; impressions: number; ctr: number; position: number };
    }[];
    pages: {
      url: string;
      metrics: { clicks: number; impressions: number; ctr: number; position: number };
    }[];
  }[];
  recommendations: { url: string; reasons: string[] }[];
  organicSessions: number | null;
  qualifiedOrganicLeads: number | null;
  limitations: string[];
};
export type SeoOverview = {
  settings: SeoSettings;
  providers: Record<string, unknown>;
  jobs: SeoJob[];
  keywords: SeoKeyword[];
  contents: SeoDraft[];
  knowledge: SeoFact[];
  usage: {
    usdReserved: number;
    tokensReserved: number;
    semrushUnitsReserved: number;
    draftsReserved: number;
  } | null;
  performance: SeoPerformance;
  counts: { awaitingReview: number; published: number };
};
export const getSeoOverview = () => apiFetch<SeoOverview>("/platform/seo-growth");
export const seoAction = <T = unknown>(path: string, body?: unknown, method = "POST") =>
  apiFetch<T>(`/platform/seo-growth${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
