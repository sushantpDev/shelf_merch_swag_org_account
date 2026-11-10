import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONSENT_STORAGE_KEY,
  MEASUREMENT_CONSENT_STORAGE_KEY,
  parseConsentChoice,
  readConsentChoice,
  setConsentChoice,
  subscribeConsentChoice,
} from "./consentChoice";

describe("consent choice", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stays unknown until the visitor makes a choice", () => {
    expect(readConsentChoice()).toBeNull();
    expect(parseConsentChoice("{", null)).toBeNull();
    expect(parseConsentChoice(JSON.stringify({ v: 1, analytics: "yes", advertising: true }), null)).toBeNull();
  });

  it("persists analytics and advertising separately and mirrors advertising for the pixel", () => {
    setConsentChoice({ analytics: true, advertising: false });
    expect(readConsentChoice()).toEqual({ analytics: true, advertising: false });
    expect(localStorage.getItem(MEASUREMENT_CONSENT_STORAGE_KEY)).toBe("denied");

    setConsentChoice({ analytics: false, advertising: true });
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY) ?? "")).toMatchObject({
      v: 1,
      analytics: false,
      advertising: true,
    });
    expect(localStorage.getItem(MEASUREMENT_CONSENT_STORAGE_KEY)).toBe("granted");
  });

  it("reads an earlier advertising-only choice as the same decision for both categories", () => {
    localStorage.setItem(MEASUREMENT_CONSENT_STORAGE_KEY, "denied");
    expect(readConsentChoice()).toEqual({ analytics: false, advertising: false });
  });

  it("notifies listeners and ignores a listener failure", () => {
    const heard = vi.fn();
    const stop = subscribeConsentChoice(heard);
    subscribeConsentChoice(() => {
      throw new Error("listener failed");
    });
    setConsentChoice({ analytics: false, advertising: false });
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    setConsentChoice({ analytics: true, advertising: true });
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
