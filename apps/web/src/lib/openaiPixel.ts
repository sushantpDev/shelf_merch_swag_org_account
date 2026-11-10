/**
 * OpenAI Ads Measurement Pixel.
 * Official loader and commands: https://developers.openai.com/ads/measurement-pixel
 *
 * The script is not inserted, and `oaiq` is not called, unless all of these are true:
 * a non-empty `VITE_OPENAI_PIXEL_ID`, advertising-measurement consent `"granted"`,
 * and `VITE_OPENAI_AAM_REVIEWED=true` after automatic advanced matching is
 * explicitly accepted. True does not disable matching. The SDK has no command
 * to turn it off. Keeping the script unloaded is what stops it from reading form fields.
 *
 * A denied choice calls `oaiq("consent", false)` when the pixel is already
 * present. That is the documented way to stop pings and remove `__oppref`
 * and `__obref`. Denied events are not replayed.
 */

import {
  readMeasurementConsent,
  subscribeMeasurementConsent,
} from "./measurementConsent";

export const OPENAI_PIXEL_SCRIPT_SRC = "https://bzrcdn.openai.com/sdk/oaiq.min.js";
export const OPENAI_PENDING_REGISTRATION_KEY = "shelfmerch.openai.pending-registration";

export type OpenAiMeasurementConsent = "granted" | "denied" | "unknown";

type Oaiq = {
  (...args: unknown[]): void;
  q?: unknown[];
};

type PixelWindow = Window & { oaiq?: Oaiq };

export type OpenAiPixelDeps = {
  getPixelId: () => string | undefined | null;
  getConsent: () => OpenAiMeasurementConsent;
  getAdvancedMatchingReviewed: () => boolean;
  getWindow: () => PixelWindow | undefined;
  getSessionStorage?: () => Storage | undefined;
};

export function readOpenAiMeasurementConsent(): OpenAiMeasurementConsent {
  return readMeasurementConsent();
}

function pixelIdFrom(value: string | undefined | null): string {
  return String(value ?? "").trim();
}

function safeEventId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (!id || id.length > 128 || id.includes("@") || /\s/.test(id)) return null;
  return id;
}

function installOpenAiQueue(win: PixelWindow, doc: Document) {
  if (win.oaiq) return;
  const queued: unknown[] = [];
  const q = function oaiqQueue(this: unknown, ...args: unknown[]) {
    queued.push(args);
  } as Oaiq;
  q.q = queued;
  win.oaiq = q;
  const script = doc.createElement("script");
  script.async = true;
  script.src = OPENAI_PIXEL_SCRIPT_SRC;
  const first = doc.getElementsByTagName("script")[0];
  if (first?.parentNode) first.parentNode.insertBefore(script, first);
  else (doc.head || doc.documentElement).appendChild(script);
}

export function createOpenAiPixelTracker(deps: OpenAiPixelDeps) {
  const sent = new Set<string>();
  let initialized = false;

  function pixelId() {
    return pixelIdFrom(deps.getPixelId());
  }

  function measurementAllowed() {
    return pixelId().length > 0 && deps.getConsent() === "granted" && deps.getAdvancedMatchingReviewed();
  }

  function sessionStore() {
    try {
      if (deps.getSessionStorage) return deps.getSessionStorage();
      return typeof sessionStorage === "undefined" ? undefined : sessionStorage;
    } catch {
      return undefined;
    }
  }

  function rememberRegistration(eventId: string) {
    try {
      sessionStore()?.setItem(OPENAI_PENDING_REGISTRATION_KEY, eventId);
    } catch {
      /* The immediate measure call is still attempted. */
    }
  }

  function takePendingRegistration() {
    const storage = sessionStore();
    let id: string | null = null;
    try {
      id = safeEventId(storage?.getItem(OPENAI_PENDING_REGISTRATION_KEY));
      storage?.removeItem(OPENAI_PENDING_REGISTRATION_KEY);
    } catch {
      id = null;
    }
    return id;
  }

  function dropPendingRegistration() {
    try {
      sessionStore()?.removeItem(OPENAI_PENDING_REGISTRATION_KEY);
    } catch {
      /* Ignore storage failures. */
    }
  }

  function ensureInitialized() {
    if (!measurementAllowed() || initialized) return measurementAllowed() && initialized;
    const win = deps.getWindow();
    const doc = win?.document;
    if (!win || !doc) return false;
    installOpenAiQueue(win, doc);
    win.oaiq?.("consent", true);
    win.oaiq?.("init", { pixelId: pixelId() });
    initialized = true;
    return true;
  }

  function signalDenied() {
    initialized = false;
    const oaiq = deps.getWindow()?.oaiq;
    if (!oaiq) return;
    oaiq("consent", false);
  }

  function measure(
    eventName: "lead_created" | "registration_completed",
    eventId: unknown,
    options?: { replay?: boolean },
  ) {
    try {
      const id = safeEventId(eventId);
      if (!measurementAllowed() || !id) return;
      // The verification page navigates immediately. Measuring there and again
      // after load delivers the same signup twice, so the id is only sent once
      // the next page is running.
      if (eventName === "registration_completed" && !options?.replay) {
        rememberRegistration(id);
        return;
      }
      const key = `${eventName}:${id}`;
      if (sent.has(key)) return;
      sent.add(key);
      if (!ensureInitialized()) return;
      deps.getWindow()?.oaiq?.("measure", eventName, { type: "customer_action" }, { event_id: id });
    } catch {
      /* A pixel failure must not affect the completed product action. */
    }
  }

  function prepare() {
    try {
      if (deps.getConsent() === "denied") {
        dropPendingRegistration();
        signalDenied();
        return;
      }
      if (!ensureInitialized()) return;
      const pending = takePendingRegistration();
      if (pending) measure("registration_completed", pending, { replay: true });
    } catch {
      /* Measurement must not affect application startup. */
    }
  }

  return {
    prepare,
    trackLeadCreated(eventId: unknown) {
      measure("lead_created", eventId);
    },
    trackRegistrationCompleted(eventId: unknown) {
      measure("registration_completed", eventId);
    },
  };
}

const openAiPixel = createOpenAiPixelTracker({
  getPixelId: () => import.meta.env.VITE_OPENAI_PIXEL_ID,
  getConsent: readOpenAiMeasurementConsent,
  getAdvancedMatchingReviewed: () => import.meta.env.VITE_OPENAI_AAM_REVIEWED === "true",
  getWindow: () => (typeof window === "undefined" ? undefined : window),
});

subscribeMeasurementConsent(() => {
  openAiPixel.prepare();
});

export function prepareOpenAiPixel() {
  openAiPixel.prepare();
}

export function trackOpenAiLeadCreated(eventId: unknown) {
  openAiPixel.trackLeadCreated(eventId);
}

export function trackOpenAiRegistrationCompleted(eventId: unknown) {
  openAiPixel.trackRegistrationCompleted(eventId);
}
