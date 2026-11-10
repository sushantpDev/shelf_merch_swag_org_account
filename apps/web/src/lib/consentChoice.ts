/**
 * Optional measurement choice for this browser.
 * Essential site functions do not read this store.
 * No choice is written until the visitor accepts, rejects, or saves preferences.
 */

import { syncOptionalTrackingConsent } from "./googleConsent";

export const CONSENT_STORAGE_KEY = "shelfmerch.consent";
export const MEASUREMENT_CONSENT_STORAGE_KEY = "shelfmerch.advertising-measurement-consent";

export type ConsentChoice = {
  analytics: boolean;
  advertising: boolean;
};

type StoredConsentChoice = ConsentChoice & { v: 1 };

const listeners = new Set<() => void>();

function browserStorage(): Storage | undefined {
  try {
    if (typeof localStorage === "undefined") return undefined;
    return localStorage;
  } catch {
    return undefined;
  }
}

function isChoice(value: unknown): value is StoredConsentChoice {
  if (!value || typeof value !== "object") return false;
  const choice = value as Partial<StoredConsentChoice>;
  return choice.v === 1 && typeof choice.analytics === "boolean" && typeof choice.advertising === "boolean";
}

export function parseConsentChoice(raw: string | null, legacy: string | null): ConsentChoice | null {
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isChoice(parsed)) return { analytics: parsed.analytics, advertising: parsed.advertising };
    } catch {
      /* Fall through to the earlier advertising-only value. */
    }
  }
  if (legacy === "granted" || legacy === "denied") {
    const allowed = legacy === "granted";
    return { analytics: allowed, advertising: allowed };
  }
  return null;
}

export function readConsentChoice(): ConsentChoice | null {
  const storage = browserStorage();
  if (!storage) return null;
  try {
    return parseConsentChoice(
      storage.getItem(CONSENT_STORAGE_KEY),
      storage.getItem(MEASUREMENT_CONSENT_STORAGE_KEY),
    );
  } catch {
    return null;
  }
}

function notify() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* A listener failure must not block the visitor's choice. */
    }
  }
}

export function setConsentChoice(choice: ConsentChoice) {
  const storage = browserStorage();
  if (!storage) return;
  const stored: StoredConsentChoice = { v: 1, analytics: choice.analytics, advertising: choice.advertising };
  try {
    storage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(stored));
    storage.setItem(MEASUREMENT_CONSENT_STORAGE_KEY, choice.advertising ? "granted" : "denied");
  } catch {
    return;
  }
  syncOptionalTrackingConsent(stored);
  notify();
}

export function subscribeConsentChoice(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
