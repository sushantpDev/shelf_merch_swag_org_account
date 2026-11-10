// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { resetShelfMerchLeadCreatedForTests, SHELFMERCH_LEAD_CREATED_EVENT } from "@/lib/leadConversion";
import { CONSENT_STORAGE_KEY, setConsentChoice } from "@/lib/consentChoice";
import { ApiError } from "@/services/api";
import { RequestDemoForm } from "./RequestDemoForm";

const publicFetch = vi.fn();
const trackOpenAiLeadCreated = vi.fn();

vi.mock("@/services/api", async () => {
  const actual = await vi.importActual<typeof import("@/services/api")>("@/services/api");
  return { ...actual, publicFetch: (...args: unknown[]) => publicFetch(...args) };
});

vi.mock("@/lib/openaiPixel", () => ({
  trackOpenAiLeadCreated: (...args: unknown[]) => trackOpenAiLeadCreated(...args),
}));

afterEach(() => {
  cleanup();
  publicFetch.mockReset();
  trackOpenAiLeadCreated.mockReset();
  resetShelfMerchLeadCreatedForTests();
  localStorage.clear();
  sessionStorage.clear();
  const win = window as Window & { dataLayer?: unknown[]; __shelfmerchSyncConsent?: unknown };
  delete win.dataLayer;
  delete win.__shelfmerchSyncConsent;
});

function savedLead(id: string) {
  return { status: 201, body: { id, status: "new" } };
}

function grantConsent(choice: { analytics: boolean; advertising: boolean }) {
  localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ v: 1, ...choice }));
}

function leadEvents() {
  const layer = (window as Window & { dataLayer?: unknown[] }).dataLayer ?? [];
  return layer.filter(
    (entry): entry is { event: string; lead_event_id: string } =>
      Boolean(entry && typeof entry === "object" && (entry as { event?: string }).event === SHELFMERCH_LEAD_CREATED_EVENT),
  );
}

function renderForm() {
  return render(
    <MemoryRouter>
      <RequestDemoForm />
    </MemoryRouter>,
  );
}

async function fillRequiredFields() {
  const user = userEvent.setup();
  await user.type(document.getElementById("demo-full-name") as HTMLInputElement, "Ada Lovelace");
  await user.type(document.getElementById("demo-company-name") as HTMLInputElement, "Analytical Engines");
  await user.type(document.getElementById("demo-email") as HTMLInputElement, "ada@example.com");
  await user.type(document.getElementById("demo-mobile") as HTMLInputElement, "9876543210");
  return user;
}

describe("RequestDemoForm OpenAI lead measurement", () => {
  it("tracks lead_created only after the demo request is saved", async () => {
    publicFetch.mockResolvedValue(savedLead("lead-1"));
    renderForm();
    const user = await fillRequiredFields();

    await user.click(document.querySelector("button[type='submit']") as HTMLButtonElement);

    expect(await document.body.textContent).toContain("Request received");
    expect(document.querySelector(".demo-receipt__primary")?.textContent).toBe("Back to homepage");
    expect(document.querySelector(".demo-receipt__primary")?.getAttribute("href")).toBe("/");
    expect(document.querySelectorAll(".demo-receipt__next li")).toHaveLength(3);
    expect(document.activeElement?.id).toBe("demo-form-title");
    expect(publicFetch).toHaveBeenCalledTimes(1);
    expect(trackOpenAiLeadCreated).toHaveBeenCalledTimes(1);
    expect(trackOpenAiLeadCreated).toHaveBeenCalledWith("lead-1");
    expect(JSON.stringify(trackOpenAiLeadCreated.mock.calls)).not.toContain("ada@example.com");
  });

  it("does not track a lead when the request fails", async () => {
    grantConsent({ analytics: true, advertising: true });
    publicFetch.mockRejectedValue(new ApiError(500, "unavailable", "SERVER"));
    renderForm();
    const user = await fillRequiredFields();

    await user.click(document.querySelector("button[type='submit']") as HTMLButtonElement);

    expect(await document.querySelector("[role='alert']")?.textContent).toContain(
      "Something went wrong while submitting your request",
    );
    expect(trackOpenAiLeadCreated).not.toHaveBeenCalled();
    expect(leadEvents()).toHaveLength(0);
    expect(document.querySelector("button[type='submit']")).not.toBeNull();
  });

  it("does not treat a demo-button or WhatsApp click as a lead", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    renderForm();
    const user = userEvent.setup();

    await user.click(document.querySelector(".request-demo__whatsapp-button") as HTMLButtonElement);

    expect(open).toHaveBeenCalledTimes(1);
    expect(publicFetch).not.toHaveBeenCalled();
    expect(trackOpenAiLeadCreated).not.toHaveBeenCalled();
    expect(leadEvents()).toHaveLength(0);
    open.mockRestore();
  });

  it("saves one lead when submit is repeated before the response returns", async () => {
    let resolveFetch: (value: ReturnType<typeof savedLead>) => void = () => undefined;
    publicFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    renderForm();
    await fillRequiredFields();
    const form = document.querySelector("form");
    expect(form).not.toBeNull();

    fireEvent.submit(form as HTMLFormElement);
    fireEvent.submit(form as HTMLFormElement);
    expect(publicFetch).toHaveBeenCalledTimes(1);

    resolveFetch(savedLead("lead-1"));
    await waitFor(() => {
      expect(trackOpenAiLeadCreated).toHaveBeenCalledTimes(1);
    });
    expect(trackOpenAiLeadCreated).toHaveBeenCalledWith("lead-1");
  });

  it("still confirms the request when measurement throws", async () => {
    publicFetch.mockResolvedValue(savedLead("lead-2"));
    trackOpenAiLeadCreated.mockImplementation(() => {
      throw new Error("pixel unavailable");
    });
    renderForm();
    const user = await fillRequiredFields();

    await user.click(document.querySelector("button[type='submit']") as HTMLButtonElement);

    await waitFor(() => {
      expect(document.body.textContent).toContain("Request received");
    });
  });
});

describe("RequestDemoForm shelfmerch_lead_created", () => {
  it("pushes one dataLayer event after a saved 201 lead when consent is already granted", async () => {
    grantConsent({ analytics: true, advertising: false });
    publicFetch.mockResolvedValue(savedLead("lead-9"));
    renderForm();
    const user = await fillRequiredFields();

    await user.click(document.querySelector("button[type='submit']") as HTMLButtonElement);

    await waitFor(() => expect(leadEvents()).toHaveLength(1));
    expect(leadEvents()[0]).toEqual({
      event: SHELFMERCH_LEAD_CREATED_EVENT,
      lead_event_id: "lead-9",
      shelfmerch_analytics: "granted",
      shelfmerch_advertising: "denied",
    });
    expect(trackOpenAiLeadCreated).toHaveBeenCalledWith("lead-9");
    const serialized = JSON.stringify(leadEvents());
    expect(serialized).not.toContain("ada@example.com");
    expect(serialized).not.toContain("Ada Lovelace");
    expect(serialized).not.toContain("9876543210");
    expect(serialized).not.toContain("Analytical Engines");
  });

  it("does not push the event when the lead request fails", async () => {
    grantConsent({ analytics: true, advertising: true });
    publicFetch.mockRejectedValue(new ApiError(400, "Enter a work email.", "VALIDATION_ERROR"));
    renderForm();
    const user = await fillRequiredFields();

    await user.click(document.querySelector("button[type='submit']") as HTMLButtonElement);

    expect(await document.querySelector("[role='alert']")?.textContent).toContain("Enter a work email.");
    expect(leadEvents()).toHaveLength(0);
    expect(trackOpenAiLeadCreated).not.toHaveBeenCalled();
  });

  it("does not push the event for a successful response that is not HTTP 201", async () => {
    grantConsent({ analytics: true, advertising: true });
    publicFetch.mockResolvedValue({ status: 200, body: { id: "lead-200", status: "new" } });
    renderForm();
    const user = await fillRequiredFields();

    await user.click(document.querySelector("button[type='submit']") as HTMLButtonElement);

    await waitFor(() => expect(document.body.textContent).toContain("Request received"));
    expect(leadEvents()).toHaveLength(0);
    expect(trackOpenAiLeadCreated).not.toHaveBeenCalled();
  });

  it("pushes the saved lead once when submit is repeated before the response returns", async () => {
    grantConsent({ analytics: false, advertising: true });
    let resolveFetch: (value: { status: number; body: { id: string; status: string } }) => void = () => undefined;
    publicFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    renderForm();
    await fillRequiredFields();
    const form = document.querySelector("form");

    fireEvent.submit(form as HTMLFormElement);
    fireEvent.submit(form as HTMLFormElement);
    resolveFetch(savedLead("lead-once"));

    await waitFor(() => expect(leadEvents()).toHaveLength(1));
    expect(leadEvents()[0]?.lead_event_id).toBe("lead-once");
    expect(trackOpenAiLeadCreated).toHaveBeenCalledTimes(1);
  });

  it("does not push before consent and does not replay after a later grant", async () => {
    publicFetch.mockResolvedValue(savedLead("lead-early"));
    renderForm();
    const user = await fillRequiredFields();

    await user.click(document.querySelector("button[type='submit']") as HTMLButtonElement);
    await waitFor(() => expect(document.body.textContent).toContain("Request received"));
    expect(leadEvents()).toHaveLength(0);
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull();

    (window as Window & { __shelfmerchSyncConsent?: () => void }).__shelfmerchSyncConsent = () => undefined;
    setConsentChoice({ analytics: true, advertising: true });

    expect(leadEvents()).toHaveLength(0);
    expect(JSON.stringify(localStorage)).not.toContain("lead-early");
    expect(JSON.stringify(sessionStorage)).not.toContain("lead-early");
    expect(document.querySelector("script[src*='googletagmanager.com']")).toBeNull();
  });

  it("still confirms the request when the dataLayer push throws", async () => {
    grantConsent({ analytics: true, advertising: true });
    publicFetch.mockResolvedValue(savedLead("lead-throw"));
    const win = window as Window & { dataLayer?: unknown[] };
    const layer: unknown[] = [];
    vi.spyOn(layer, "push").mockImplementation(() => {
      throw new Error("gtm unavailable");
    });
    win.dataLayer = layer;
    renderForm();
    const user = await fillRequiredFields();

    await user.click(document.querySelector("button[type='submit']") as HTMLButtonElement);

    await waitFor(() => expect(document.body.textContent).toContain("Request received"));
    expect(trackOpenAiLeadCreated).toHaveBeenCalledWith("lead-throw");
  });
});
