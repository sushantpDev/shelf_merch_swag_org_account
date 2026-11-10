import { useConsentDraft } from "./useConsentDraft";
import "./measurement-consent.css";

export function MeasurementConsentChoice() {
  const { choice, draft, setDraft, acceptAll, rejectOptional, saveDraft } = useConsentDraft();

  return (
    <section
      id="cookie-preferences"
      className="measurement-consent"
      aria-labelledby="cookie-preferences-title"
    >
      <h2 id="cookie-preferences-title">Cookie preferences</h2>
      <p id="measurement-choice">
        Essential cookies are required for sign-in, security, and the service. They are not switched off
        here. Analytics covers Google Analytics 4 loaded by Google Tag Manager. Advertising covers the
        Meta tag in that container and the optional OpenAI measurement pixel. The OpenAI pixel stays
        unloaded until you allow advertising and Shelf Merch has accepted that automatic advanced matching
        will run.
      </p>
      <p>
        When the pixel is enabled, OpenAI automatic advanced matching hashes recognizable form details in
        your browser, such as a name, email address, or phone number. OpenAI does not provide a supported
        way to turn that hashing off. The events Shelf Merch sends contain only an event name and an event
        id, not your name, email, phone number, or verification code. OpenAI may store __oppref for about
        30 days and __obref for about 365 days. Withdrawing advertising consent stops later OpenAI
        measurement and, if the pixel is already loaded, asks it to remove those cookies.
      </p>
      <p className="measurement-consent__status" role="status">
        {choice
          ? `Saved in this browser. Analytics ${choice.analytics ? "on" : "off"}. Advertising ${choice.advertising ? "on" : "off"}.`
          : "No choice is saved in this browser. Optional measurement stays off."}
      </p>
      <div className="measurement-consent__actions">
        <button type="button" onClick={acceptAll}>
          Accept all
        </button>
        <button type="button" onClick={rejectOptional}>
          Reject optional
        </button>
      </div>
      <fieldset className="measurement-consent__prefs">
        <legend>Manage preferences</legend>
        <label>
          <input type="checkbox" checked disabled /> Essential (always on)
        </label>
        <label>
          <input
            type="checkbox"
            checked={draft.analytics}
            onChange={(event) => setDraft((current) => ({ ...current, analytics: event.target.checked }))}
          />
          Analytics
        </label>
        <label>
          <input
            type="checkbox"
            checked={draft.advertising}
            onChange={(event) => setDraft((current) => ({ ...current, advertising: event.target.checked }))}
          />
          Advertising. If the OpenAI pixel is enabled, it hashes recognizable form details.
        </label>
        <button type="button" onClick={saveDraft}>
          Save preferences
        </button>
      </fieldset>
    </section>
  );
}
