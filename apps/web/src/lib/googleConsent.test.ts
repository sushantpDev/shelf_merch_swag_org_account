import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  applyGoogleConsent,
  googleConsentSignals,
  loadGoogleTagManager,
  optionalTrackingAllowed,
  type ConsentWindow,
} from "./googleConsent";

function fakeDom() {
  const scripts: { src: string; async: boolean }[] = [];
  const doc = {
    createElement: () => {
      const script = { src: "", async: false };
      scripts.push(script);
      return script;
    },
    getElementsByTagName: () => [{ parentNode: { insertBefore: () => undefined } }],
    head: { appendChild: () => undefined },
    documentElement: { appendChild: () => undefined },
  };
  const win = {
    dataLayer: [] as unknown[],
    fbq: vi.fn(),
  } as unknown as ConsentWindow;
  return { win, doc: doc as unknown as Document, scripts };
}

describe("Google consent mode", () => {
  it("denies optional storage when no choice or a rejection is saved", () => {
    expect(googleConsentSignals(null)).toEqual({
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
    });
    expect(optionalTrackingAllowed(null)).toBe(false);
    expect(optionalTrackingAllowed({ analytics: false, advertising: false })).toBe(false);
    const browser = fakeDom();
    applyGoogleConsent(browser.win, browser.doc, { analytics: false, advertising: false }, "GTM-TEST");
    expect(browser.scripts).toHaveLength(0);
    expect(browser.win.fbq).toHaveBeenCalledWith("consent", "revoke");
  });

  it("loads the existing container once when analytics or advertising is allowed", () => {
    const browser = fakeDom();
    expect(loadGoogleTagManager(browser.win, browser.doc, "")).toBe(false);
    expect(loadGoogleTagManager(browser.win, browser.doc, "%VITE_GTM_ID%")).toBe(false);
    applyGoogleConsent(browser.win, browser.doc, { analytics: true, advertising: false }, "GTM-TEST");
    applyGoogleConsent(browser.win, browser.doc, { analytics: true, advertising: true }, "GTM-TEST");
    expect(browser.scripts).toHaveLength(1);
    expect(browser.scripts[0]?.src).toBe("https://www.googletagmanager.com/gtm.js?id=GTM-TEST");
    expect(browser.scripts[0]?.async).toBe(true);
    const updates = browser.win.dataLayer?.filter((entry) => Array.isArray(entry) && entry[0] === "consent");
    expect(updates).toEqual([
      ["consent", "update", googleConsentSignals({ analytics: true, advertising: false })],
      ["consent", "update", googleConsentSignals({ analytics: true, advertising: true })],
    ]);
  });

  it("sets denied consent defaults before the GTM container request in the document shell", () => {
    const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    const consentAt = html.indexOf('ad_storage: "denied"');
    const gtmAt = html.indexOf("googletagmanager.com/gtm.js");
    expect(consentAt).toBeGreaterThan(-1);
    expect(gtmAt).toBeGreaterThan(consentAt);
    expect(html).toContain('analytics_storage: "denied"');
    expect(html).not.toContain("googletagmanager.com/ns.html");
    expect(html).not.toContain("oaiq");
    expect(html).not.toContain("bzrcdn.openai.com");
    expect(html).not.toContain("connect.facebook.net");
  });
});
