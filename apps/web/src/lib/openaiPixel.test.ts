import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MEASUREMENT_CONSENT_STORAGE_KEY } from "./measurementConsent";
import {
  OPENAI_PENDING_REGISTRATION_KEY,
  OPENAI_PIXEL_SCRIPT_SRC,
  createOpenAiPixelTracker,
  prepareOpenAiPixel,
  readOpenAiMeasurementConsent,
  trackOpenAiLeadCreated,
  trackOpenAiRegistrationCompleted,
  type OpenAiMeasurementConsent,
} from "./openaiPixel";

type ScriptEl = { async: boolean; src: string };

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key) {
      map.delete(key);
    },
    setItem(key, value) {
      map.set(String(key), String(value));
    },
  };
}

function fakeBrowser() {
  const scripts: ScriptEl[] = [];
  const win = {
    document: {
      createElement: (tag: string) => {
        if (tag !== "script") return {};
        const el: ScriptEl = { async: false, src: "" };
        scripts.push(el);
        return el;
      },
      getElementsByTagName: () => [] as ScriptEl[],
      head: { appendChild: () => undefined },
      documentElement: { appendChild: () => undefined },
    },
  };
  return { win: win as unknown as Window & { oaiq?: (...args: unknown[]) => void }, scripts };
}

function trackerFor(
  consent: OpenAiMeasurementConsent,
  pixelId = "px_test",
  browser = fakeBrowser(),
  storage = memoryStorage(),
  advancedMatchingReviewed = true,
) {
  const tracker = createOpenAiPixelTracker({
    getPixelId: () => pixelId,
    getConsent: () => consent,
    getAdvancedMatchingReviewed: () => advancedMatchingReviewed,
    getWindow: () => browser.win,
    getSessionStorage: () => storage,
  });
  return { tracker, storage, ...browser };
}

function calls(win: { oaiq?: { q?: unknown[] } | ((...args: unknown[]) => void) }) {
  const command = win.oaiq;
  if (!command || !("q" in command) || !Array.isArray(command.q)) return [];
  return command.q as unknown[][];
}

describe("OpenAI measurement pixel", () => {
  beforeEach(() => {
    localStorage.removeItem(MEASUREMENT_CONSENT_STORAGE_KEY);
    sessionStorage.removeItem(OPENAI_PENDING_REGISTRATION_KEY);
  });

  it("stays unloaded in the application because consent is unknown", () => {
    expect(readOpenAiMeasurementConsent()).toBe("unknown");
    prepareOpenAiPixel();
    trackOpenAiLeadCreated("lead-1");
    trackOpenAiRegistrationCompleted("user-1");
    expect(typeof window === "undefined" || !("oaiq" in window)).toBe(true);
    expect(sessionStorage.getItem(OPENAI_PENDING_REGISTRATION_KEY)).toBeNull();
  });

  it("does not add the pixel to the GTM document shell", () => {
    const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    expect(html).toContain("googletagmanager.com/gtm.js");
    expect(html).not.toContain("oaiq");
    expect(html).not.toContain("bzrcdn.openai.com");
  });

  it("does not initialize when the pixel id is missing, blank, consent is not granted, or matching is unreviewed", () => {
    for (const pixelId of ["", "   ", undefined]) {
      const browser = fakeBrowser();
      const tracker = createOpenAiPixelTracker({
        getPixelId: () => pixelId,
        getConsent: () => "granted",
        getAdvancedMatchingReviewed: () => true,
        getWindow: () => browser.win,
      });
      tracker.prepare();
      tracker.trackLeadCreated("lead-1");
      expect(browser.scripts).toHaveLength(0);
      expect(browser.win.oaiq).toBeUndefined();
    }

    const blocked = trackerFor("unknown", "px_live");
    blocked.tracker.prepare();
    blocked.tracker.trackRegistrationCompleted("user-1");
    expect(blocked.scripts).toHaveLength(0);
    expect(blocked.win.oaiq).toBeUndefined();

    const unreviewed = trackerFor("granted", "px_live", fakeBrowser(), memoryStorage(), false);
    unreviewed.tracker.prepare();
    unreviewed.tracker.trackLeadCreated("lead-1");
    unreviewed.tracker.trackRegistrationCompleted("user-1");
    expect(unreviewed.scripts).toHaveLength(0);
    expect(unreviewed.win.oaiq).toBeUndefined();
    expect(unreviewed.storage.getItem(OPENAI_PENDING_REGISTRATION_KEY)).toBeNull();
  });

  it("sends lead_created and registration_completed without customer details", () => {
    const lead = trackerFor("granted");
    lead.tracker.trackLeadCreated("lead-1");
    const registration = trackerFor("granted", "px_reg");
    registration.tracker.trackRegistrationCompleted("user-1");

    expect(lead.scripts.map((script) => script.src)).toEqual([OPENAI_PIXEL_SCRIPT_SRC]);
    expect(lead.scripts[0]?.async).toBe(true);
    expect(calls(lead.win)).toEqual([
      ["consent", true],
      ["init", { pixelId: "px_test" }],
      ["measure", "lead_created", { type: "customer_action" }, { event_id: "lead-1" }],
    ]);
    expect(calls(registration.win).filter((call) => call[0] === "measure")).toEqual([]);
    expect(lead.storage.getItem(OPENAI_PENDING_REGISTRATION_KEY)).toBeNull();
    expect(registration.storage.getItem(OPENAI_PENDING_REGISTRATION_KEY)).toBe("user-1");
    const delivered = trackerFor("granted", "px_reg", fakeBrowser(), registration.storage);
    delivered.tracker.prepare();
    expect(calls(delivered.win).filter((call) => call[0] === "measure")).toEqual([
      ["measure", "registration_completed", { type: "customer_action" }, { event_id: "user-1" }],
    ]);

    const payload = JSON.stringify([...calls(lead.win), ...calls(delivered.win)]);
    expect(payload).not.toContain("email");
    expect(payload).not.toContain("phone");
    expect(payload).not.toContain("name");
    expect(payload).not.toContain("@");
    expect(payload).not.toContain('"user"');
  });

  it("sends one conversion for a repeated event id and ignores unsafe ids", () => {
    const { tracker, win, scripts } = trackerFor("granted");
    tracker.trackLeadCreated("lead-1");
    tracker.trackLeadCreated("lead-1");
    tracker.trackLeadCreated("  lead-1  ");
    tracker.trackLeadCreated("ada@example.com");
    tracker.trackLeadCreated("");
    tracker.prepare();

    const measured = calls(win).filter((call) => call[0] === "measure");
    expect(measured).toEqual([
      ["measure", "lead_created", { type: "customer_action" }, { event_id: "lead-1" }],
    ]);
    expect(scripts).toHaveLength(1);
  });

  it("sends one registration_completed across navigation, reloads, and repeated initialization", () => {
    const storage = memoryStorage();
    const first = trackerFor("granted", "px_test", fakeBrowser(), storage);
    first.tracker.trackRegistrationCompleted("user-1");
    first.tracker.trackRegistrationCompleted("user-1");
    expect(calls(first.win).filter((call) => call[0] === "measure")).toEqual([]);
    expect(storage.getItem(OPENAI_PENDING_REGISTRATION_KEY)).toBe("user-1");

    const second = trackerFor("granted", "px_test", fakeBrowser(), storage);
    second.tracker.prepare();
    second.tracker.prepare();

    const reloaded = trackerFor("granted", "px_test", fakeBrowser(), storage);
    reloaded.tracker.prepare();

    const measured = [
      ...calls(first.win),
      ...calls(second.win),
      ...calls(reloaded.win),
    ].filter((call) => call[0] === "measure");
    expect(measured).toEqual([
      ["measure", "registration_completed", { type: "customer_action" }, { event_id: "user-1" }],
    ]);
    expect(storage.getItem(OPENAI_PENDING_REGISTRATION_KEY)).toBeNull();
  });

  it("does not send a registration that was attempted without advertising consent", () => {
    const storage = memoryStorage();
    const withoutConsent = trackerFor("unknown", "px_test", fakeBrowser(), storage);
    withoutConsent.tracker.trackRegistrationCompleted("user-1");
    expect(storage.getItem(OPENAI_PENDING_REGISTRATION_KEY)).toBeNull();

    const grantedLater = trackerFor("granted", "px_test", fakeBrowser(), storage);
    grantedLater.tracker.prepare();
    expect(calls(grantedLater.win).filter((call) => call[0] === "measure")).toEqual([]);
  });

  it("drops a pending registration and records denial without loading the pixel", () => {
    const storage = memoryStorage();
    storage.setItem(OPENAI_PENDING_REGISTRATION_KEY, "user-1");
    const recorded: unknown[][] = [];
    const browser = fakeBrowser();
    browser.win.oaiq = ((...args: unknown[]) => {
      recorded.push(args);
    }) as NonNullable<typeof browser.win.oaiq>;
    const tracker = createOpenAiPixelTracker({
      getPixelId: () => "px_test",
      getConsent: () => "denied",
      getAdvancedMatchingReviewed: () => true,
      getWindow: () => browser.win,
      getSessionStorage: () => storage,
    });

    tracker.prepare();
    tracker.trackRegistrationCompleted("user-1");
    tracker.trackLeadCreated("lead-1");

    expect(recorded).toEqual([["consent", false]]);
    expect(browser.scripts).toHaveLength(0);
    expect(storage.getItem(OPENAI_PENDING_REGISTRATION_KEY)).toBeNull();
  });

  it("swallows pixel failures", () => {
    const browser = fakeBrowser();
    const tracker = createOpenAiPixelTracker({
      getPixelId: () => "px_test",
      getConsent: () => "granted",
      getAdvancedMatchingReviewed: () => true,
      getWindow: () => browser.win,
    });
    tracker.prepare();
    browser.win.oaiq = () => {
      throw new Error("pixel unavailable");
    };
    expect(() => tracker.trackLeadCreated("lead-9")).not.toThrow();
    expect(() => tracker.trackRegistrationCompleted("user-9")).not.toThrow();
  });
});
