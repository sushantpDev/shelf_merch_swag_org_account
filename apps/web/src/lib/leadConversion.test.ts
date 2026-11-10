// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { CONSENT_STORAGE_KEY } from "./consentChoice";
import {
  publishShelfMerchLeadCreated,
  resetShelfMerchLeadCreatedForTests,
  SHELFMERCH_LEAD_CREATED_EVENT,
} from "./leadConversion";

function grant(choice: { analytics: boolean; advertising: boolean }) {
  localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ v: 1, ...choice }));
}

function leadEvents() {
  const layer = (window as Window & { dataLayer?: unknown[] }).dataLayer ?? [];
  return layer.filter(
    (entry): entry is { event: string; lead_event_id: string } =>
      Boolean(entry && typeof entry === "object" && (entry as { event?: string }).event === SHELFMERCH_LEAD_CREATED_EVENT),
  );
}

afterEach(() => {
  resetShelfMerchLeadCreatedForTests();
  localStorage.clear();
  sessionStorage.clear();
  delete (window as Window & { dataLayer?: unknown[] }).dataLayer;
});

describe("publishShelfMerchLeadCreated", () => {
  it("pushes one event for a 201 lead id and ignores a duplicate id", () => {
    grant({ analytics: true, advertising: true });

    publishShelfMerchLeadCreated({ httpStatus: 201, leadId: "lead-1" });
    publishShelfMerchLeadCreated({ httpStatus: 201, leadId: "lead-1" });

    expect(leadEvents()).toEqual([
      {
        event: SHELFMERCH_LEAD_CREATED_EVENT,
        lead_event_id: "lead-1",
        shelfmerch_analytics: "granted",
        shelfmerch_advertising: "granted",
      },
    ]);
    expect(JSON.stringify(sessionStorage)).not.toContain("lead-1");
    expect(JSON.stringify(localStorage)).not.toContain("lead-1");
  });

  it("does not push on API failures, non-201 responses, or unsafe ids", () => {
    grant({ analytics: true, advertising: true });

    publishShelfMerchLeadCreated({ httpStatus: 500, leadId: "lead-1" });
    publishShelfMerchLeadCreated({ httpStatus: 400, leadId: "lead-1" });
    publishShelfMerchLeadCreated({ httpStatus: 200, leadId: "lead-1" });
    publishShelfMerchLeadCreated({ httpStatus: 201, leadId: "ada@example.com" });
    publishShelfMerchLeadCreated({ httpStatus: 201, leadId: "" });
    publishShelfMerchLeadCreated({ httpStatus: 201, leadId: undefined });

    expect(leadEvents()).toHaveLength(0);
  });

  it("does not push without consent and does not keep the lead for a later grant", () => {
    publishShelfMerchLeadCreated({ httpStatus: 201, leadId: "lead-early" });
    expect(leadEvents()).toHaveLength(0);

    grant({ analytics: false, advertising: false });
    publishShelfMerchLeadCreated({ httpStatus: 201, leadId: "lead-early" });
    expect(leadEvents()).toHaveLength(0);

    localStorage.clear();
    grant({ analytics: true, advertising: false });
    publishShelfMerchLeadCreated({ httpStatus: 201, leadId: "lead-early" });
    expect(leadEvents()).toHaveLength(0);
    expect(JSON.stringify(window.sessionStorage)).not.toContain("lead-early");
  });

  it("creates dataLayer without requiring gtm.js", () => {
    grant({ analytics: true, advertising: false });
    expect(document.querySelector("script[src*='googletagmanager.com']")).toBeNull();

    publishShelfMerchLeadCreated({ httpStatus: 201, leadId: "lead-gtm" });

    expect(leadEvents()).toHaveLength(1);
    expect(document.querySelector("script[src*='googletagmanager.com']")).toBeNull();
    expect((window as Window & { __shelfmerchGtmLoaded?: boolean }).__shelfmerchGtmLoaded).toBeUndefined();
  });
});
