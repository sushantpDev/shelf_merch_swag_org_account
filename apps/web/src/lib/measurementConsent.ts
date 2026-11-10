/**
 * Advertising-measurement view of the shared consent choice.
 * The OpenAI pixel reads this module and does not load unless the value is
 * "granted". Analytics consent is stored beside it and does not enable the pixel.
 */

import {
  MEASUREMENT_CONSENT_STORAGE_KEY,
  readConsentChoice,
  setConsentChoice,
  subscribeConsentChoice,
} from "./consentChoice";

export { MEASUREMENT_CONSENT_STORAGE_KEY };

export type MeasurementConsent = "granted" | "denied" | "unknown";

export function readMeasurementConsent(): MeasurementConsent {
  const choice = readConsentChoice();
  if (!choice) return "unknown";
  return choice.advertising ? "granted" : "denied";
}

export function setMeasurementConsent(decision: "granted" | "denied") {
  const current = readConsentChoice();
  setConsentChoice({
    analytics: current?.analytics ?? decision === "granted",
    advertising: decision === "granted",
  });
}

export function withdrawMeasurementConsent() {
  setMeasurementConsent("denied");
}

export function subscribeMeasurementConsent(listener: () => void) {
  return subscribeConsentChoice(listener);
}
