import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MEASUREMENT_CONSENT_STORAGE_KEY,
  readMeasurementConsent,
  setMeasurementConsent,
  subscribeMeasurementConsent,
  withdrawMeasurementConsent,
} from "./measurementConsent";

describe("advertising measurement consent", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stays unknown until the visitor makes a choice", () => {
    expect(readMeasurementConsent()).toBe("unknown");
    localStorage.setItem(MEASUREMENT_CONSENT_STORAGE_KEY, "maybe");
    expect(readMeasurementConsent()).toBe("unknown");
  });

  it("persists allow, denial, and withdrawal", () => {
    setMeasurementConsent("granted");
    expect(readMeasurementConsent()).toBe("granted");
    expect(localStorage.getItem(MEASUREMENT_CONSENT_STORAGE_KEY)).toBe("granted");

    withdrawMeasurementConsent();
    expect(readMeasurementConsent()).toBe("denied");

    setMeasurementConsent("granted");
    setMeasurementConsent("denied");
    expect(readMeasurementConsent()).toBe("denied");
  });

  it("notifies listeners and ignores a listener failure", () => {
    const heard = vi.fn();
    const stop = subscribeMeasurementConsent(heard);
    subscribeMeasurementConsent(() => {
      throw new Error("listener failed");
    });

    setMeasurementConsent("denied");
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    setMeasurementConsent("granted");
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
