import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { getStoredUser } from "@/services/api-bridge";
import { canAccessArea } from "@/services/platform-access";
import {
  getSeoOverview,
  seoAction,
  type SeoOverview,
  type SeoSettings,
  type SeoDraft,
  type SeoFact,
} from "@/services/seo-growth-api";
import { deleteBlogDraft, publishBlogPost } from "@/services/blog-api";
import { PlatformError, PlatformLoading, PlatformPageHeader } from "./platform-ui";
import "./seo-growth.css";

const tabs = ["Overview", "Keywords", "Drafts", "Knowledge", "Settings", "Performance"] as const;
const readable = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to complete this action.";
const available = (value: number | null | undefined) =>
  value == null ? "Unavailable" : value.toLocaleString();
const editableSettings = (settings: SeoSettings): SeoSettings =>
  Object.fromEntries(
    [
      "enabled",
      "timezone",
      "researchTime",
      "dailyDraftLimit",
      "model",
      "dailyUsdLimit",
      "dailyTokenLimit",
      "dailySemrushUnitLimit",
      "maxOutputTokens",
      "inputUsdPerMillion",
      "outputUsdPerMillion",
      "countries",
      "seedKeywords",
      "researchMode",
      "reportingLagDays",
      "minimumScore",
      "weights",
      "searchConsoleAccount",
      "runLanguageReview",
      "strictContentGuards",
    ].map((key) => [key, settings[key as keyof SeoSettings]]),
  ) as SeoSettings;

export default function SeoGrowthPage() {
  const canWrite = canAccessArea(getStoredUser()?.role, "blog", "write");
  const [data, setData] = useState<SeoOverview | null>(null);
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<SeoSettings | null>(null);
  const [csv, setCsv] = useState("");
  const [sourceDate, setSourceDate] = useState("");
  const [importCountry, setImportCountry] = useState("us");
  const [fact, setFact] = useState({ text: "", sourceRef: "", sourceUrl: "" });
  const [knowledgeKind, setKnowledgeKind] = useState<NonNullable<SeoFact["kind"]>>("business_fact");
  const [knowledgeSubject, setKnowledgeSubject] = useState("");
  const [knowledgeFilter, setKnowledgeFilter] = useState("all");
  const [providerTest, setProviderTest] = useState<unknown>(null);
  const load = useCallback(async () => {
    try {
      const result = await getSeoOverview();
      setData(result);
      setSettings((previous) => previous ?? editableSettings(result.settings));
      setError("");
    } catch (failure) {
      setError(readable(failure));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const perform = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
    } catch (failure) {
      setError(readable(failure));
    } finally {
      setBusy(false);
    }
  };
  if (!data || !settings)
    return <>{error ? <PlatformError message={error} /> : <PlatformLoading />}</>;
  const setSetting = <K extends keyof SeoSettings>(key: K, value: SeoSettings[K]) =>
    setSettings((previous) => (previous ? { ...previous, [key]: value } : previous));
  const saveSettings = (event: FormEvent) => {
    event.preventDefault();
    void perform(() => seoAction("/settings", editableSettings(settings), "PATCH"));
  };
  const importCsv = (event: FormEvent) => {
    event.preventDefault();
    void perform(() =>
      seoAction("/keywords/import", {
        csv,
        country: importCountry,
        retrievedAt: new Date(sourceDate).toISOString(),
        reviewedSource: true,
      }),
    );
  };
  const addFact = (event: FormEvent) => {
    event.preventDefault();
    void perform(async () => {
      await seoAction("/knowledge", {
        kind: knowledgeKind,
        subject: knowledgeKind === "business_fact" ? "ShelfMerch" : knowledgeSubject,
        ...(knowledgeKind === "competitor_research"
          ? { researchedAt: new Date().toISOString() }
          : {}),
        text: fact.text,
        sourceRef: fact.sourceRef,
        ...(fact.sourceUrl ? { sourceUrl: fact.sourceUrl } : {}),
      });
      setFact({ text: "", sourceRef: "", sourceUrl: "" });
    });
  };
  return (
    <div className="platform-page seo-growth">
      <PlatformPageHeader
        title="SEO growth"
        subtitle="Research, evidence and reviewed articles for ShelfMerch."
        actions={
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void load()}>
            Refresh
          </button>
        }
      />
      <nav className="seo-tabs" aria-label="SEO sections">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            aria-current={tab === item ? "page" : undefined}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      {error && <PlatformError message={error} />}
      {busy && <p role="status">Saving or requesting work…</p>}
      {tab === "Overview" && (
        <>
          <div className="seo-stats">
            <p>
              <strong>{data.settings.enabled ? "Enabled" : "Disabled"}</strong>Daily scheduling
            </p>
            <p>
              <strong>{data.counts.awaitingReview}</strong>Drafts awaiting review
            </p>
            <p>
              <strong>{data.counts.published}</strong>Published blog articles
            </p>
            <p>
              <strong>{data.usage ? `$${data.usage.usdReserved.toFixed(4)}` : "$0"}</strong>AI
              budget reserved today
            </p>
            <p>
              <strong>{available(data.performance.periods[0]?.clicks)}</strong>Organic clicks,
              latest reporting window
            </p>
            <p>
              <strong>{available(data.performance.periods[0]?.impressions)}</strong>Organic
              impressions
            </p>
            <p>
              <strong>{available(data.performance.qualifiedOrganicLeads)}</strong>Qualified organic
              leads
            </p>
          </div>
          <p>
            Schedule: {data.settings.researchTime} {data.settings.timezone}. Maximum{" "}
            {data.settings.dailyDraftLimit} drafts per local day. Publication requires approval.
          </p>
          {canWrite && (
            <button
              className="btn btn-brand"
              disabled={busy}
              onClick={() => void perform(() => seoAction("/run"))}
            >
              Queue research run
            </button>
          )}
          <p>Research runs in the backend worker. Repeated requests reuse the same daily job.</p>
          <details>
            <summary>Provider configuration and access status</summary>
            <p>
              Configured means the required server settings exist. Access is checked with the button
              below; “not_checked” is not a connection failure. Research results are recorded
              separately in execution history.
            </p>
            <pre>{JSON.stringify(providerTest ?? data.providers, null, 2)}</pre>
            {canWrite && (
              <button
                className="btn btn-ghost"
                disabled={busy}
                onClick={() =>
                  void perform(async () => setProviderTest(await seoAction("/providers/test")))
                }
              >
                Test configured read access
              </button>
            )}
          </details>
          <h2>Execution history</h2>
          <div className="seo-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Local day</th>
                  <th>Status</th>
                  <th>Stage</th>
                  <th>Result / issue</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {data.jobs.map((job) => (
                  <tr key={job._id}>
                    <td>{job.day}</td>
                    <td>{job.status}</td>
                    <td>{job.stage}</td>
                    <td>{job.reason || job.error || "—"}</td>
                    <td>
                      <details>
                        <summary>Stages and costs</summary>
                        <pre>
                          {JSON.stringify(
                            { attempts: job.attempts, stages: job.stages, calls: job.calls },
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                      {canWrite && ["failed", "retry", "skipped"].includes(job.status) && (
                        <button
                          disabled={busy}
                          onClick={() => void perform(() => seoAction(`/jobs/${job._id}/retry`))}
                        >
                          Retry after correction
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === "Keywords" && (
        <>
          <p>
            Search Console impressions are observed visibility. Market volume and difficulty remain
            unavailable unless supplied by verified external research. Commercial queries produce
            page recommendations.
          </p>
          <div className="seo-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Keyword / source</th>
                  <th>Intent / page</th>
                  <th>Metrics</th>
                  <th>Priority</th>
                  <th>Target mapping</th>
                </tr>
              </thead>
              <tbody>
                {data.keywords.map((keyword) => (
                  <tr key={keyword._id}>
                    <td>
                      {keyword.keyword}
                      <small>
                        {keyword.source} · {keyword.country} ·{" "}
                        {new Date(keyword.retrievedAt).toLocaleDateString()}
                      </small>
                    </td>
                    <td>
                      {keyword.intent}
                      <small>{keyword.pageType}</small>
                    </td>
                    <td>
                      Volume: {available(keyword.volume)}
                      <br />
                      Difficulty: {available(keyword.difficulty)}
                      <br />
                      Observed impressions: {available(keyword.searchMetrics?.impressions)}
                      <br />
                      Average position: {available(keyword.currentRanking)}
                    </td>
                    <td>
                      {keyword.score}
                      <details>
                        <summary>Scoring</summary>
                        <pre>{JSON.stringify(keyword.scoreExplanation, null, 2)}</pre>
                      </details>
                    </td>
                    <td>
                      {keyword.existingPage || keyword.targetUrl || "Unmapped"}
                      {canWrite && (
                        <MappingForm
                          disabled={busy}
                          onMap={(url) =>
                            perform(() =>
                              seoAction(`/keywords/${keyword._id}/mapping`, { url }, "PATCH"),
                            )
                          }
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canWrite && (
            <details>
              <summary>Import reviewed Semrush CSV (optional)</summary>
              <form onSubmit={importCsv}>
                <p>
                  Use keyword, country, intent, volume and difficulty columns. Leave missing metrics
                  blank. Imported data must be reviewed; never relabel GSC impressions as volume.
                </p>
                <label>
                  Default country/database
                  <input
                    required
                    value={importCountry}
                    onChange={(e) => setImportCountry(e.target.value)}
                  />
                </label>
                <label>
                  Actual retrieval timestamp
                  <input
                    required
                    type="datetime-local"
                    value={sourceDate}
                    onChange={(e) => setSourceDate(e.target.value)}
                  />
                </label>
                <label>
                  Reviewed CSV
                  <textarea
                    required
                    rows={7}
                    value={csv}
                    onChange={(e) => setCsv(e.target.value)}
                  />
                </label>
                <button className="btn btn-ghost" disabled={busy}>
                  Import reviewed metrics
                </button>
              </form>
            </details>
          )}
        </>
      )}
      {tab === "Drafts" && (
        <>
          <p>
            Use the existing blog editor for rich content. Editing invalidates approval. Published
            generated articles must be unpublished before editing; automated refreshes remain
            recommendations.
          </p>
          {!data.contents.length && (
            <p>
              No generated drafts yet. The worker may correctly skip when the available evidence
              does not support a suitable educational topic.
            </p>
          )}
          {data.contents.map((draft) => (
            <DraftReview
              key={`${draft._id}-${draft.revisionHash}`}
              draft={draft}
              canWrite={canWrite}
              busy={busy}
              perform={perform}
            />
          ))}
        </>
      )}
      {tab === "Knowledge" && (
        <>
          <p>
            ShelfMerch facts support generated product claims. Competitor research records what
            other vendors say and stays separate from ShelfMerch evidence, even after review.
          </p>
          <p>
            Approved ShelfMerch facts:{" "}
            {
              data.knowledge.filter(
                (item) => item.status === "approved" && item.kind !== "competitor_research",
              ).length
            }
            . Competitor research notes:{" "}
            {data.knowledge.filter((item) => item.kind === "competitor_research").length}.
          </p>
          <label>
            Show knowledge
            <select value={knowledgeFilter} onChange={(e) => setKnowledgeFilter(e.target.value)}>
              <option value="all">All knowledge</option>
              <option value="business_fact">ShelfMerch facts</option>
              <option value="competitor_research">Competitor research</option>
            </select>
          </label>
          {data.knowledge
            .filter(
              (item) =>
                knowledgeFilter === "all" || (item.kind ?? "business_fact") === knowledgeFilter,
            )
            .map((item) => (
              <article className="seo-card" key={item._id}>
                <h2>
                  {item.kind === "competitor_research"
                    ? `${item.subject} — competitor research`
                    : "ShelfMerch fact"}
                </h2>
                <p>{item.text}</p>
                <p>
                  {item.sourceRef}{" "}
                  {item.sourceUrl && (
                    <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                      Source
                    </a>
                  )}
                </p>
                {item.researchedAt && (
                  <p>
                    Researched: {item.researchedAt.slice(0, 10)}. Vendor statements have not been
                    product-tested.
                  </p>
                )}
                <small>{item.status}</small>
                {canWrite && (
                  <div className="seo-actions">
                    <button
                      disabled={busy}
                      onClick={() =>
                        void perform(() =>
                          seoAction(`/knowledge/${item._id}/review`, { status: "approved" }),
                        )
                      }
                    >
                      {item.kind === "competitor_research"
                        ? "Mark research reviewed"
                        : "Approve verified statement"}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void perform(() =>
                          seoAction(`/knowledge/${item._id}/review`, { status: "retired" }),
                        )
                      }
                    >
                      Retire
                    </button>
                  </div>
                )}
              </article>
            ))}
          {canWrite && (
            <form className="seo-card" onSubmit={addFact}>
              <h2>Add a statement for review</h2>
              <label>
                Knowledge type
                <select
                  value={knowledgeKind}
                  onChange={(e) => setKnowledgeKind(e.target.value as NonNullable<SeoFact["kind"]>)}
                >
                  <option value="business_fact">ShelfMerch fact</option>
                  <option value="competitor_research">Competitor research</option>
                </select>
              </label>
              {knowledgeKind === "competitor_research" && (
                <label>
                  Competitor name
                  <input
                    required
                    minLength={2}
                    maxLength={100}
                    value={knowledgeSubject}
                    onChange={(e) => setKnowledgeSubject(e.target.value)}
                  />
                </label>
              )}
              <label>
                Exact factual statement
                <textarea
                  required
                  minLength={10}
                  maxLength={2000}
                  value={fact.text}
                  onChange={(e) => setFact({ ...fact, text: e.target.value })}
                />
              </label>
              <label>
                Source / approved document reference
                <input
                  required
                  minLength={3}
                  maxLength={300}
                  value={fact.sourceRef}
                  onChange={(e) => setFact({ ...fact, sourceRef: e.target.value })}
                />
              </label>
              <label>
                Source URL, if public
                <input
                  type="url"
                  required={knowledgeKind === "competitor_research"}
                  value={fact.sourceUrl}
                  onChange={(e) => setFact({ ...fact, sourceUrl: e.target.value })}
                />
              </label>
              <button className="btn btn-ghost" disabled={busy}>
                Save for review
              </button>
            </form>
          )}
        </>
      )}
      {tab === "Settings" && (
        <form onSubmit={saveSettings} className="seo-card">
          <fieldset disabled={!canWrite || busy}>
            <legend>Daily workflow</legend>
            <label className="seo-check">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => setSetting("enabled", e.target.checked)}
              />
              Enable scheduled research
            </label>
            <label>
              Research source
              <select
                value={settings.researchMode}
                onChange={(e) =>
                  setSetting("researchMode", e.target.value as SeoSettings["researchMode"])
                }
              >
                <option value="gsc">Search Console through Windsor</option>
                <option value="import">Reviewed keyword imports</option>
                <option value="api">Semrush server API (optional)</option>
              </select>
            </label>
            <label>
              Search Console property
              <input
                value={settings.searchConsoleAccount}
                onChange={(e) => setSetting("searchConsoleAccount", e.target.value)}
              />
            </label>
            <label>
              Time zone
              <input
                required
                value={settings.timezone}
                onChange={(e) => setSetting("timezone", e.target.value)}
              />
            </label>
            <label>
              Daily research time
              <input
                required
                type="time"
                value={settings.researchTime}
                onChange={(e) => setSetting("researchTime", e.target.value)}
              />
            </label>
            <label>
              Draft cap per day
              <input
                type="number"
                min={0}
                max={5}
                value={settings.dailyDraftLimit}
                onChange={(e) => setSetting("dailyDraftLimit", Number(e.target.value))}
              />
            </label>
            <label>
              Reporting delay in days
              <input
                type="number"
                min={1}
                max={7}
                value={settings.reportingLagDays}
                onChange={(e) => setSetting("reportingLagDays", Number(e.target.value))}
              />
            </label>
            <label>
              Minimum opportunity score
              <input
                type="number"
                min={0}
                max={100}
                value={settings.minimumScore}
                onChange={(e) => setSetting("minimumScore", Number(e.target.value))}
              />
            </label>
          </fieldset>
          <fieldset disabled={!canWrite || busy}>
            <legend>Guardrails (off by default)</legend>
            <p>Turn these on later if you want stricter automated QA again.</p>
            <label className="seo-check">
              <input
                type="checkbox"
                checked={Boolean(settings.runLanguageReview)}
                onChange={(e) => setSetting("runLanguageReview", e.target.checked)}
              />
              Run Claude language-review stage
            </label>
            <label className="seo-check">
              <input
                type="checkbox"
                checked={Boolean(settings.strictContentGuards)}
                onChange={(e) => setSetting("strictContentGuards", e.target.checked)}
              />
              Block approve/publish on claim and QA errors
            </label>
          </fieldset>
          <fieldset disabled={!canWrite || busy}>
            <legend>Claude and cost limits</legend>
            <p>
              API keys are configured on the server and never entered here. Confirm current model
              access and prices before enabling generation.
            </p>
            <label>
              Model ID
              <input value={settings.model} onChange={(e) => setSetting("model", e.target.value)} />
            </label>
            {(
              [
                ["dailyUsdLimit", "Daily AI USD cap"],
                ["dailyTokenLimit", "Daily token cap"],
                ["maxOutputTokens", "Maximum output tokens per call"],
                ["inputUsdPerMillion", "Approved input USD per million tokens"],
                ["outputUsdPerMillion", "Approved output USD per million tokens"],
                ["dailySemrushUnitLimit", "Daily optional Semrush-unit cap"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  min={0}
                  step={key.includes("Usd") || key.includes("Million") ? "any" : "1"}
                  value={settings[key] ?? ""}
                  onChange={(e) =>
                    setSetting(
                      key,
                      e.target.value === "" && key.includes("Million")
                        ? null
                        : Number(e.target.value),
                    )
                  }
                />
              </label>
            ))}
          </fieldset>
          <fieldset disabled={!canWrite || busy}>
            <legend>Scoring weights</legend>
            {(Object.keys(settings.weights) as (keyof SeoSettings["weights"])[]).map((key) => (
              <label key={key}>
                {key}
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={settings.weights[key]}
                  onChange={(e) =>
                    setSetting("weights", { ...settings.weights, [key]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
          </fieldset>
          <fieldset disabled={!canWrite || busy}>
            <legend>Optional Semrush research inputs</legend>
            <label>
              Databases, comma separated
              <input
                value={settings.countries.join(",")}
                onChange={(e) =>
                  setSetting(
                    "countries",
                    e.target.value.split(",").map((value) => value.trim()),
                  )
                }
              />
            </label>
            <label>
              Seed keywords, one per line
              <textarea
                rows={5}
                value={settings.seedKeywords.join("\n")}
                onChange={(e) => setSetting("seedKeywords", e.target.value.split("\n"))}
              />
            </label>
          </fieldset>
          <p>
            Automatic publication is disabled by design. GA4 setup is pending the separate tracking
            audit and approval.
          </p>
          {canWrite && (
            <button className="btn btn-brand" disabled={busy}>
              Save settings
            </button>
          )}
        </form>
      )}
      {tab === "Performance" && (
        <>
          <p>Search Console property: {data.settings.searchConsoleAccount || "Not configured"}</p>
          <p>
            Organic sessions: {available(data.performance.organicSessions)} · Qualified organic
            leads: {available(data.performance.qualifiedOrganicLeads)}
          </p>
          {data.performance.periods.map((period) => (
            <article className="seo-card" key={period.period}>
              <h2>{period.period}</h2>
              <p>
                Clicks: {available(period.clicks)} · Impressions: {available(period.impressions)} ·
                CTR: {period.ctr == null ? "Unavailable" : `${(period.ctr * 100).toFixed(2)}%`}
              </p>
              <p>Latest returned reporting date: {period.latestReportingDate ?? "Unavailable"}</p>
              <h3>Queries</h3>
              <div className="seo-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Query</th>
                      <th>Brand</th>
                      <th>Clicks</th>
                      <th>Impressions</th>
                      <th>Average position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {period.queries.map((query) => (
                      <tr key={query.query}>
                        <td>{query.query}</td>
                        <td>{query.branded ? "Branded" : "Non-branded"}</td>
                        <td>{available(query.metrics.clicks)}</td>
                        <td>{available(query.metrics.impressions)}</td>
                        <td>{available(query.metrics.position)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3>Pages</h3>
              {period.pages.map((page) => (
                <p key={page.url}>
                  {page.url}
                  <br />
                  {available(page.metrics.clicks)} clicks · {available(page.metrics.impressions)}{" "}
                  impressions
                </p>
              ))}
            </article>
          ))}
          <h2>Refresh recommendations</h2>
          {data.performance.recommendations.map((item) => (
            <article className="seo-card" key={item.url}>
              <p>{item.url}</p>
              {item.reasons.map((reason) => (
                <p key={reason}>{reason}</p>
              ))}
            </article>
          ))}
          {data.performance.limitations.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </>
      )}
    </div>
  );
}

function MappingForm({
  disabled,
  onMap,
}: {
  disabled: boolean;
  onMap: (url: string) => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onMap(url);
      }}
    >
      <label>
        Existing ShelfMerch URL
        <input required type="url" value={url} onChange={(event) => setUrl(event.target.value)} />
      </label>
      <button disabled={disabled}>Recommend refresh</button>
    </form>
  );
}

function DraftReview({
  draft,
  canWrite,
  busy,
  perform,
}: {
  draft: SeoDraft;
  canWrite: boolean;
  busy: boolean;
  perform: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [feedback, setFeedback] = useState("");
  const notes = feedback.trim();
  return (
    <article className="seo-card">
      <h2>{draft.article?.title ?? "Article unavailable"}</h2>
      <p>
        Status: {draft.article?.status === "published" ? "published" : draft.status} · Approval:{" "}
        {draft.approvalCurrent ? "matches current content" : "required for current version"}
      </p>
      <Link to={`/platform/blog/${draft.articleId}`}>Open in blog editor</Link>
      <details>
        <summary>Preview</summary>
        <p className="seo-preview">{draft.plainText}</p>
      </details>
      {draft.findings.length > 0 && (
        <details>
          <summary>Notes ({draft.findings.length})</summary>
          {draft.findings.map((finding, index) => (
            <p key={`${finding.code}-${index}`}>
              {finding.severity}: {finding.message}
            </p>
          ))}
        </details>
      )}
      {canWrite && draft.article?.status !== "published" && (
        <>
          <label>
            Notes (optional)
            <textarea
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              maxLength={2000}
            />
          </label>
          <div className="seo-actions">
            {draft.article?.status === "draft" && (
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-danger-ghost"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Delete draft "${draft.article?.title}"? This cannot be undone.`)) {
                    void perform(() => deleteBlogDraft(draft.articleId));
                  }
                }}
              >
                Delete draft
              </button>
            )}
            <button
              disabled={busy}
              onClick={() =>
                void perform(() =>
                  seoAction(`/contents/${draft._id}/review`, {
                    action: "approve",
                    revisionHash: draft.revisionHash,
                    factsAndLinksChecked: true,
                    feedback: notes,
                  }),
                )
              }
            >
              Approve
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void perform(() =>
                  seoAction(`/contents/${draft._id}/review`, {
                    action: "reject",
                    revisionHash: draft.revisionHash,
                    feedback: notes,
                  }),
                )
              }
            >
              Reject
            </button>
            <button
              disabled={busy || Boolean(draft.article?.publishedAt)}
              onClick={() =>
                void perform(() =>
                  seoAction(`/contents/${draft._id}/regenerate`, {
                    ...(notes ? { feedback: notes } : {}),
                  }),
                )
              }
            >
              Regenerate
            </button>
            <button
              className="btn btn-brand"
              disabled={busy || !draft.approvalCurrent || draft.status !== "approved"}
              onClick={() => void perform(() => publishBlogPost(draft.articleId))}
            >
              Publish
            </button>
          </div>
        </>
      )}
    </article>
  );
}
