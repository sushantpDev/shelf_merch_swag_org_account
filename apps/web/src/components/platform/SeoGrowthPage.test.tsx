// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import SeoGrowthPage from "./SeoGrowthPage";
import { getSeoOverview, seoAction } from "@/services/seo-growth-api";
import { getStoredUser } from "@/services/api-bridge";
import { deleteBlogDraft } from "@/services/blog-api";

vi.mock("@/services/seo-growth-api", () => ({
  getSeoOverview: vi.fn(),
  seoAction: vi.fn(async () => ({})),
}));
vi.mock("@/services/api-bridge", () => ({ getStoredUser: vi.fn() }));
vi.mock("@/services/blog-api", () => ({ publishBlogPost: vi.fn(async () => ({})), deleteBlogDraft: vi.fn(async () => ({ deleted: true, id: "article1" })) }));
const settings = {
  _id: "platform",
  enabled: false,
  timezone: "Asia/Kolkata",
  researchTime: "03:00",
  dailyDraftLimit: 1,
  model: "test-model",
  dailyUsdLimit: 2,
  dailyTokenLimit: 30000,
  dailySemrushUnitLimit: 1000,
  maxOutputTokens: 6000,
  inputUsdPerMillion: null,
  outputUsdPerMillion: null,
  countries: ["us"],
  seedKeywords: ["company swag store"],
  researchMode: "gsc",
  reportingLagDays: 3,
  minimumScore: 60,
  weights: { relevance: 45, conversion: 25, difficulty: 20, volume: 10 },
  searchConsoleAccount: "sc-domain:shelfmerch.io",
  runLanguageReview: false,
  strictContentGuards: false,
};
const fixture = () => ({
  settings,
  providers: { windsor: { configured: true } },
  jobs: [],
  keywords: [],
  contents: [],
  knowledge: [],
  usage: null,
  counts: { awaitingReview: 0, published: 0 },
  performance: {
    periods: [],
    recommendations: [],
    organicSessions: null,
    qualifiedOrganicLeads: null,
    limitations: ["GA4 metrics are unavailable."],
  },
});
beforeEach(() => {
  Object.defineProperty(window, "confirm", { configurable: true, writable: true, value: vi.fn(() => true) });
  vi.mocked(getStoredUser).mockReturnValue({ role: "platform_sales_manager" } as ReturnType<
    typeof getStoredUser
  >);
  vi.mocked(getSeoOverview).mockResolvedValue(
    fixture() as Awaited<ReturnType<typeof getSeoOverview>>,
  );
  vi.mocked(seoAction).mockClear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const mount = () =>
  render(
    <MemoryRouter>
      <SeoGrowthPage />
    </MemoryRouter>,
  );

describe("SEO control plane", () => {
  it("deletes an SEO draft after confirmation and refreshes the displayed drafts", async () => {
    const data = { ...fixture(), contents: [{
      _id: "content1", articleId: "article1", status: "review",
      article: { title: "Welcome kit guide", status: "draft", publishedAt: null },
      revisionHash: "a".repeat(64), approvalCurrent: false, plainText: "Guide content.",
      brief: { facts: [] }, findings: [], feedback: "", languageReview: {},
    }] } as unknown as Awaited<ReturnType<typeof getSeoOverview>>;
    vi.mocked(getSeoOverview).mockResolvedValueOnce(data).mockResolvedValue(fixture() as Awaited<ReturnType<typeof getSeoOverview>>);
    const confirm = vi.mocked(window.confirm).mockReturnValueOnce(false).mockReturnValue(true);
    vi.mocked(deleteBlogDraft).mockClear();
    mount();
    await screen.findByText("Daily scheduling");
    fireEvent.click(screen.getByRole("button", { name: "Drafts" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete draft" }));
    expect(deleteBlogDraft).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete draft" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Welcome kit guide"));
    await waitFor(() => expect(deleteBlogDraft).toHaveBeenCalledWith("article1"));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Welcome kit guide" })).toBeNull());
  });

  it.each(["published", "readonly"])("hides draft deletion for %s articles or users", async (mode) => {
    if (mode === "readonly") vi.mocked(getStoredUser).mockReturnValue({ role: "platform_readonly_auditor" } as ReturnType<typeof getStoredUser>);
    vi.mocked(getSeoOverview).mockResolvedValue({ ...fixture(), contents: [{
      _id: "content1", articleId: "article1", status: "review",
      article: { title: "Welcome kit guide", status: mode === "published" ? "published" : "draft" },
      revisionHash: "a".repeat(64), approvalCurrent: false, plainText: "Guide content.",
      brief: { facts: [] }, findings: [], feedback: "", languageReview: {},
    }] } as unknown as Awaited<ReturnType<typeof getSeoOverview>>);
    mount();
    await screen.findByText("Daily scheduling");
    fireEvent.click(screen.getByRole("button", { name: "Drafts" }));
    expect(screen.queryByRole("button", { name: "Delete draft" })).toBeNull();
  });

  it("separates competitor research from approved ShelfMerch facts", async () => {
    vi.mocked(getSeoOverview).mockResolvedValue({
      ...fixture(),
      knowledge: [
        {
          _id: "c1",
          kind: "competitor_research",
          subject: "AXOMO",
          researchedAt: "2026-10-30T00:00:00.000Z",
          text: "AXOMO describes store credit.",
          sourceRef: "Official page",
          sourceUrl: "https://axomo.com/company-store/",
          status: "approved",
        },
        {
          _id: "b1",
          text: "ShelfMerch supports employee merch redemption.",
          sourceRef: "Owner brief",
          sourceUrl: "",
          status: "pending",
        },
      ],
    } as Awaited<ReturnType<typeof getSeoOverview>>);
    mount();
    await screen.findByText("Daily scheduling");
    fireEvent.click(screen.getByRole("button", { name: "Knowledge" }));
    expect(screen.getByText(/Approved ShelfMerch facts: 0/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Source" }).getAttribute("href")).toBe(
      "https://axomo.com/company-store/",
    );
    fireEvent.change(screen.getByLabelText("Show knowledge"), {
      target: { value: "competitor_research" },
    });
    expect(screen.getByText("AXOMO describes store credit.")).toBeTruthy();
    expect(screen.queryByText("ShelfMerch supports employee merch redemption.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mark research reviewed" }));
    await waitFor(() =>
      expect(seoAction).toHaveBeenCalledWith("/knowledge/c1/review", { status: "approved" }),
    );
  });
  it("offers an explicit retry for a skipped daily job", async () => {
    vi.mocked(getSeoOverview).mockResolvedValue({
      ...fixture(),
      jobs: [
        {
          _id: "job1",
          day: "2026-10-30",
          status: "skipped",
          stage: "selection",
          reason: "No approved business knowledge is available.",
          attempts: 1,
          stages: {},
          calls: [],
        },
      ],
    } as unknown as Awaited<ReturnType<typeof getSeoOverview>>);
    mount();
    await screen.findByText("Daily scheduling");
    fireEvent.click(screen.getByRole("button", { name: "Retry after correction" }));
    await waitFor(() => expect(seoAction).toHaveBeenCalledWith("/jobs/job1/retry"));
    expect(screen.getByText(/“not_checked” is not a connection failure/)).toBeTruthy();
  });
  it("shows disabled scheduling and queues work without claiming it ran in the browser", async () => {
    mount();
    await screen.findByText("Daily scheduling");
    fireEvent.click(screen.getByRole("button", { name: "Queue research run" }));
    await waitFor(() => expect(seoAction).toHaveBeenCalledWith("/run"));
    expect(screen.getByText(/Research runs in the backend worker/)).toBeTruthy();
  });
  it("sends only supported settings fields, without database metadata or credentials", async () => {
    mount();
    await screen.findByText("Daily scheduling");
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const save = screen.getByRole("button", { name: "Save settings" });
    const form = save.closest("form")!;
    const invalid = Array.from(form.querySelectorAll("input"))
      .filter((input) => !input.checkValidity())
      .map((input) => ({
        label: input.closest("label")?.textContent,
        value: input.value,
        reason: input.validationMessage,
      }));
    expect(invalid).toEqual([]);
    fireEvent.submit(form);
    await waitFor(() => expect(seoAction).toHaveBeenCalled());
    const [, body, method] = vi.mocked(seoAction).mock.calls[0];
    expect(method).toBe("PATCH");
    expect(body).not.toHaveProperty("_id");
    expect(body).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(body).toMatchObject({ enabled: false, researchMode: "gsc", timezone: "Asia/Kolkata" });
  });
  it("requires factual review and submits the exact displayed version for approval", async () => {
    const data = fixture();
    const draft = {
      _id: "content1",
      articleId: "article1",
      status: "review",
      article: { title: "Welcome kit guide", status: "draft", publishedAt: null },
      revisionHash: "a".repeat(64),
      approvalCurrent: false,
      plainText: "Practical content.",
      brief: { facts: [] },
      findings: [],
      languageReview: {},
      feedback: "",
    };
    vi.mocked(getSeoOverview).mockResolvedValue({
      ...data,
      contents: [draft],
    } as unknown as Awaited<ReturnType<typeof getSeoOverview>>);
    mount();
    await screen.findByText("Daily scheduling");
    fireEvent.click(screen.getByRole("button", { name: "Drafts" }));
    const approve = screen.getByRole("button", {
      name: "Approve current version",
    }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Publish approved article" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(approve);
    await waitFor(() =>
      expect(seoAction).toHaveBeenCalledWith("/contents/content1/review", {
        action: "approve",
        revisionHash: "a".repeat(64),
        factsAndLinksChecked: true,
        feedback: "",
      }),
    );
  });
  it("keeps read-only users out of write controls and does not render unavailable analytics as zero", async () => {
    vi.mocked(getStoredUser).mockReturnValue({ role: "platform_readonly_auditor" } as ReturnType<
      typeof getStoredUser
    >);
    mount();
    await screen.findByText("Daily scheduling");
    expect(screen.queryByRole("button", { name: "Queue research run" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Performance" }));
    expect(screen.getByText(/Organic sessions: Unavailable/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.queryByRole("button", { name: "Save settings" })).toBeNull();
  });
});
