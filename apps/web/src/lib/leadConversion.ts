/**
 * One dataLayer signal for a demo lead that the API has already saved.
 * GTM can listen for `shelfmerch_lead_created`. The form does not wait for gtm.js.
 *
 * The event is pushed only when optional analytics or advertising consent is
 * already granted. It is not stored, and a later consent grant does not push it.
 * Customer names, emails, phone numbers, and messages are never included.
 */

import { readConsentChoice } from "./consentChoice";
import { optionalTrackingAllowed } from "./googleConsent";

export const SHELFMERCH_LEAD_CREATED_EVENT = "shelfmerch_lead_created";

const publishedLeadIds = new Set<string>();

export function safeLeadEventId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (!id || id.length > 128 || id.includes("@") || /\s/.test(id)) return null;
  return id;
}

export function resetShelfMerchLeadCreatedForTests() {
  publishedLeadIds.clear();
}

export function publishShelfMerchLeadCreated(input: { httpStatus: number; leadId: unknown }) {
  try {
    if (input.httpStatus !== 201) return;
    const leadEventId = safeLeadEventId(input.leadId);
    if (!leadEventId || publishedLeadIds.has(leadEventId)) return;
    publishedLeadIds.add(leadEventId);
    const choice = readConsentChoice();
    if (!optionalTrackingAllowed(choice) || typeof window === "undefined") return;

    const win = window as Window & { dataLayer?: unknown[] };
    win.dataLayer = win.dataLayer || [];
    win.dataLayer.push({
      event: SHELFMERCH_LEAD_CREATED_EVENT,
      lead_event_id: leadEventId,
      shelfmerch_analytics: choice?.analytics ? "granted" : "denied",
      shelfmerch_advertising: choice?.advertising ? "granted" : "denied",
    });
  } catch {
    /* A tag failure must not discard a saved demo request. */
  }
}
