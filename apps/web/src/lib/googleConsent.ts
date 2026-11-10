/**
 * Google Consent Mode v2 for the existing GTM container.
 * Defaults are denied in index.html before gtm.js can run.
 * GA4 honors analytics_storage. A Meta tag inside the same container does not
 * automatically honor ad_storage, so gtm.js is requested only after the visitor
 * allows analytics or advertising. Rejecting both never requests the container.
 */

import type { ConsentChoice } from "./consentChoice";

export type ConsentState = "granted" | "denied";

export type GoogleConsentSignals = {
  ad_storage: ConsentState;
  ad_user_data: ConsentState;
  ad_personalization: ConsentState;
  analytics_storage: ConsentState;
};

type Gtag = (...args: unknown[]) => void;

export type ConsentWindow = Window & {
  dataLayer?: unknown[];
  gtag?: Gtag;
  fbq?: (...args: unknown[]) => void;
  __shelfmerchGtmLoaded?: boolean;
  __shelfmerchSyncConsent?: (choice: ConsentChoice) => void;
};

export function googleConsentSignals(choice: ConsentChoice | null): GoogleConsentSignals {
  const ads: ConsentState = choice?.advertising ? "granted" : "denied";
  const analytics: ConsentState = choice?.analytics ? "granted" : "denied";
  return {
    ad_storage: ads,
    ad_user_data: ads,
    ad_personalization: ads,
    analytics_storage: analytics,
  };
}

export function optionalTrackingAllowed(choice: ConsentChoice | null) {
  return Boolean(choice && (choice.analytics || choice.advertising));
}

export function loadGoogleTagManager(win: ConsentWindow, doc: Document, gtmId: string | undefined) {
  const id = String(gtmId ?? "").trim();
  if (!id || id.startsWith("%") || win.__shelfmerchGtmLoaded) return false;
  win.__shelfmerchGtmLoaded = true;
  win.dataLayer = win.dataLayer || [];
  win.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
  const script = doc.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
  const first = doc.getElementsByTagName("script")[0];
  if (first?.parentNode) first.parentNode.insertBefore(script, first);
  else (doc.head || doc.documentElement).appendChild(script);
  return true;
}

export function applyGoogleConsent(win: ConsentWindow, doc: Document, choice: ConsentChoice | null, gtmId: string | undefined) {
  win.dataLayer = win.dataLayer || [];
  const gtag: Gtag = win.gtag ?? ((...args: unknown[]) => {
    win.dataLayer?.push(args);
  });
  win.gtag = gtag;
  gtag("consent", "update", googleConsentSignals(choice));
  if (optionalTrackingAllowed(choice)) loadGoogleTagManager(win, doc, gtmId);
  if (choice && !choice.advertising) {
    try {
      win.fbq?.("consent", "revoke");
    } catch {
      /* Meta may not be loaded. Withdrawal still blocks future container loads. */
    }
  }
}

export function syncOptionalTrackingConsent(choice: ConsentChoice | null) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const win = window as ConsentWindow;
  if (choice && win.__shelfmerchSyncConsent) {
    win.__shelfmerchSyncConsent(choice);
    return;
  }
  applyGoogleConsent(win, document, choice, import.meta.env.VITE_GTM_ID);
}
