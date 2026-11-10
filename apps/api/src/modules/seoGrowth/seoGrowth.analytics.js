import { ApiError } from "../../utils/errors.js";
import { SeoSnapshot, SCOPE } from "./seoGrowth.models.js";
import { sha } from "./seoGrowth.domain.js";
import { windsorRead } from "./seoGrowth.providers.js";

const ORIGIN = "https://shelfmerch.io";
const numeric = (value) =>
  value === "" || value == null
    ? null
    : Number.isFinite(Number(value))
      ? Number(value)
      : null;
const isoDay = (date) => date.toISOString().slice(0, 10);
export function reportingPeriods(now, lagDays = 3) {
  const end = new Date(`${isoDay(now)}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - lagDays);
  const period = (offset) => {
    const to = new Date(end);
    to.setUTCDate(to.getUTCDate() - offset);
    const from = new Date(to);
    from.setUTCDate(from.getUTCDate() - 27);
    return { periodStart: isoDay(from), periodEnd: isoDay(to) };
  };
  return [period(0), period(28)];
}
export function validProperty(property) {
  return (
    property === "sc-domain:shelfmerch.io" ||
    property === "https://shelfmerch.io/"
  );
}
export function validPage(url, allowSubdomains = true) {
  try {
    const value = new URL(url);
    return (
      value.protocol === "https:" &&
      (value.hostname === "shelfmerch.io" ||
        (allowSubdomains && value.hostname.endsWith(".shelfmerch.io")))
    );
  } catch {
    return false;
  }
}
export function normalizeSnapshot(row, input) {
  const account = String(row.account_id ?? input.property)
    .replace(/^sc-domain:/, "")
    .replace(/^https:\/\//, "")
    .replace(/\/$/, "");
  if (
    !validProperty(input.property) ||
    (input.source === "gsc" && account !== "shelfmerch.io")
  )
    throw new ApiError(
      422,
      "Analytics row belongs to another property",
      "SEO_WRONG_PROPERTY",
    );
  if (row.page && !validPage(row.page))
    throw new ApiError(
      422,
      "Analytics page belongs to another site",
      "SEO_WRONG_PROPERTY",
    );
  if (
    input.granularity === "daily" &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(row.date ?? "") ||
      row.date < input.periodStart ||
      row.date > input.periodEnd)
  )
    throw new ApiError(
      422,
      "Daily analytics row has an invalid reporting date",
      "SEO_ANALYTICS_DATE",
    );
  if (
    ["query", "query_page"].includes(input.granularity) &&
    !String(row.query ?? "").trim()
  )
    throw new ApiError(
      422,
      "Query analytics row is missing a query",
      "SEO_ANALYTICS_DIMENSION",
    );
  if (["page", "query_page"].includes(input.granularity) && !row.page)
    throw new ApiError(
      422,
      "Page analytics row is missing its URL",
      "SEO_ANALYTICS_DIMENSION",
    );
  for (const key of [
    "clicks",
    "impressions",
    "position",
    "sessions",
    "qualifiedDemoConversions",
  ])
    if (
      row[key] != null &&
      row[key] !== "" &&
      (!["number", "string"].includes(typeof row[key]) ||
        !Number.isFinite(Number(row[key])) ||
        Number(row[key]) < 0)
    )
      throw new ApiError(
        422,
        "Analytics metric is invalid",
        "SEO_ANALYTICS_METRIC",
      );
  const metrics =
    input.source === "gsc"
      ? {
          clicks: numeric(row.clicks),
          impressions: numeric(row.impressions),
          position: numeric(row.position),
          ctr:
            numeric(row.impressions) > 0 && numeric(row.clicks) !== null
              ? numeric(row.clicks) / numeric(row.impressions)
              : null,
        }
      : {
          sessions: numeric(row.sessions),
          qualifiedDemoConversions: numeric(row.qualifiedDemoConversions),
        };
  const value = {
    scope: SCOPE,
    source: input.source,
    property: input.property,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    granularity: input.granularity,
    geography: row.country ?? "",
    url: row.page ?? "",
    query: row.query ?? "",
    branded: row.query ? /shelf\s?merch/i.test(row.query) : null,
    metrics,
    provenance: {
      connector: "windsor",
      dimensions: input.fields ?? [],
      date: row.date ?? null,
      note: "Query rows can omit anonymized queries; do not sum query or page totals into property totals.",
    },
    retrievedAt: new Date(),
  };
  value.rowKey = sha([
    value.source,
    value.property,
    value.periodStart,
    value.periodEnd,
    value.granularity,
    value.geography,
    value.url,
    value.query,
    value.provenance.date,
  ]);
  return value;
}
export async function ingestSnapshots(rows, input) {
  const values = rows.map((row) => normalizeSnapshot(row, input));
  if (values.length)
    await SeoSnapshot.bulkWrite(
      values.map((value) => ({
        updateOne: {
          filter: { scope: SCOPE, rowKey: value.rowKey },
          update: { $set: value },
          upsert: true,
        },
      })),
    );
  return values;
}

export async function collectAnalytics(
  settings,
  now = new Date(),
  read = windsorRead,
) {
  if (!validProperty(settings.searchConsoleAccount))
    return {
      status: "unavailable",
      reason: "Select the ShelfMerch Search Console property.",
      rows: [],
    };
  const definitions = {
    daily: ["account_id", "date", "clicks", "impressions", "position"],
    query: ["account_id", "query", "clicks", "impressions", "position"],
    page: ["account_id", "page", "clicks", "impressions", "position"],
    query_page: [
      "account_id",
      "query",
      "page",
      "clicks",
      "impressions",
      "position",
    ],
  };
  const discovered = await read("searchconsole/fields");
  const fieldRows = Array.isArray(discovered)
    ? discovered
    : (discovered.data ?? discovered.result ?? []);
  const supported = new Set(fieldRows.map((field) => field.id));
  const currentRows = [];
  const reports = [];
  const periods = reportingPeriods(now, settings.reportingLagDays);
  for (const [periodIndex, period] of periods.entries()) {
    for (const [granularity, fields] of Object.entries(definitions)) {
      if (periodIndex === 1 && granularity === "query_page") continue;
      if (fields.some((field) => !supported.has(field))) {
        reports.push({
          ...period,
          granularity,
          status: "unavailable",
          reason: "Required connector fields not exposed.",
        });
        continue;
      }
      const result = await read("searchconsole", {
        select_accounts: settings.searchConsoleAccount,
        fields: fields.join(","),
        date_from: period.periodStart,
        date_to: period.periodEnd,
        _max_rows: "25000",
      });
      const rows = Array.isArray(result) ? result : result.data;
      if (!Array.isArray(rows))
        throw new ApiError(
          422,
          "Windsor response has no data array",
          "SEO_PROVIDER_RESPONSE",
        );
      if (rows.length >= 25000)
        throw new ApiError(
          422,
          "Windsor result may be truncated; narrow the period before using totals.",
          "SEO_ANALYTICS_TRUNCATED",
        );
      const snapshots = await ingestSnapshots(rows, {
        source: "gsc",
        property: settings.searchConsoleAccount,
        ...period,
        granularity,
        fields,
      });
      if (!periodIndex) currentRows.push(...snapshots);
      reports.push({
        ...period,
        granularity,
        status: "available",
        rowCount: rows.length,
      });
    }
  }
  return {
    status: "available",
    reports,
    rows: currentRows,
    ga4: {
      status: "unavailable",
      reason:
        "GA4 connection and conversion mapping are pending the read-only tracking audit; missing values remain unavailable.",
    },
  };
}

export function gscOpportunities(rows) {
  const mappings = rows.filter(
    (row) =>
      row.granularity === "query_page" && row.url.startsWith(`${ORIGIN}/`),
  );
  return rows
    .filter((row) => row.granularity === "query")
    .map((row) => {
      const mapped = mappings
        .filter((item) => item.query === row.query)
        .sort(
          (a, b) => (b.metrics.impressions ?? 0) - (a.metrics.impressions ?? 0),
        );
      return {
        keyword: row.query,
        country: row.geography || "global",
        intent: /^(how|what|why|when)\b|guide|checklist|ideas/i.test(row.query)
          ? "informational"
          : row.branded
            ? "navigational"
            : "unknown",
        volume: null,
        difficulty: null,
        currentRanking: row.metrics.position,
        existingPage: mapped[0]?.url ?? "",
        targetUrl: mapped[0]?.url ?? "",
        source: "windsor_gsc",
        retrievedAt: row.retrievedAt,
        searchMetrics: {
          ...row.metrics,
          periodStart: row.periodStart,
          periodEnd: row.periodEnd,
          property: row.property,
          note: "Impressions are observed site visibility, not keyword search volume. Position is a Search Console average.",
        },
      };
    });
}

export function performanceSummary(rows) {
  const periods = [
    ...new Set(rows.map((row) => `${row.periodStart}/${row.periodEnd}`)),
  ]
    .sort()
    .reverse()
    .slice(0, 2);
  const summaries = periods.map((key) => {
    const inPeriod = rows.filter(
      (row) =>
        `${row.periodStart}/${row.periodEnd}` === key && row.source === "gsc",
    );
    const daily = inPeriod.filter((row) => row.granularity === "daily");
    const sum = (field) =>
      daily.length && daily.every((row) => row.metrics[field] !== null)
        ? daily.reduce((n, row) => n + row.metrics[field], 0)
        : null;
    const clicks = sum("clicks");
    const impressions = sum("impressions");
    return {
      period: key,
      clicks,
      impressions,
      ctr: impressions > 0 && clicks !== null ? clicks / impressions : null,
      latestReportingDate:
        daily
          .map((row) => row.provenance.date)
          .filter(Boolean)
          .sort()
          .at(-1) ?? null,
      queries: inPeriod
        .filter((row) => row.granularity === "query")
        .sort(
          (a, b) => (b.metrics.impressions ?? 0) - (a.metrics.impressions ?? 0),
        ),
      pages: inPeriod
        .filter((row) => row.granularity === "page")
        .sort(
          (a, b) => (b.metrics.impressions ?? 0) - (a.metrics.impressions ?? 0),
        ),
    };
  });
  const current = summaries[0];
  const previous = summaries[1];
  const recommendations = [];
  for (const page of current?.pages ?? []) {
    const prior = previous?.pages.find((row) => row.url === page.url);
    const reasons = [];
    if (page.metrics.impressions >= 100 && page.metrics.ctr < 0.01)
      reasons.push(
        "High impressions and CTR below 1%; review intent, title and description.",
      );
    if (
      page.metrics.position >= 4 &&
      page.metrics.position <= 20 &&
      page.metrics.impressions >= 50
    )
      reasons.push(
        "Observed average position near stronger visibility; inspect query intent before changing content.",
      );
    if (
      prior &&
      prior.metrics.impressions >= 50 &&
      page.metrics.impressions < prior.metrics.impressions * 0.75
    )
      reasons.push(
        "Observed impressions fell by more than 25%; investigate before attributing a cause.",
      );
    if (reasons.length)
      recommendations.push({
        url: page.url,
        reasons,
        action: "human_review",
        autoUpdate: false,
      });
  }
  return {
    periods: summaries,
    recommendations,
    organicSessions: null,
    qualifiedOrganicLeads: null,
    limitations: [
      "GSC is observed search data, not market demand.",
      "Query reports exclude some anonymized queries.",
      "Domain properties can include app subdomains; page summaries identify each host.",
      "GA4 sessions and qualified conversions are unavailable until the property and audited event mapping are configured.",
      "No automatic published-content changes.",
    ],
  };
}
