import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Cookie, X } from "lucide-react";
import { readConsentChoice, subscribeConsentChoice } from "@/lib/consentChoice";
import { useConsentDraft } from "./useConsentDraft";
import "./measurement-consent.css";

export function ConsentBanner() {
  const panelRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => readConsentChoice() === null);
  const [managing, setManaging] = useState(false);
  const { draft, setDraft, acceptAll, rejectOptional, saveDraft } = useConsentDraft();

  useEffect(() => {
    return subscribeConsentChoice(() => {
      if (readConsentChoice() === null) setVisible(true);
    });
  }, []);

  useEffect(() => {
    if (!visible) return;
    const panel = panelRef.current;
    if (!panel) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const background = [...document.body.children]
      .filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement && !element.classList.contains("consent-overlay"),
      )
      .map((element) => ({ element, inert: element.inert }));
    background.forEach(({ element }) => {
      element.inert = true;
    });
    document.body.style.overflow = "hidden";
    panel.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setVisible(false);
        setManaging(false);
      }
      if (event.key !== "Tab") return;
      const controls = [
        ...panel.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href], input:not([disabled])",
        ),
      ];
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === panel)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === panel)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    panel.addEventListener("keydown", onKeyDown);
    return () => {
      panel.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      background.forEach(({ element, inert }) => {
        element.inert = inert;
      });
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [visible]);

  useEffect(() => {
    const open = () => {
      setManaging(true);
      setVisible(true);
      panelRef.current?.querySelector("button")?.focus();
    };
    window.addEventListener("shelfmerch:open-consent", open);
    return () => window.removeEventListener("shelfmerch:open-consent", open);
  }, []);

  if (!visible) return null;

  function closeAfterChoice(save: () => void) {
    save();
    setVisible(false);
    setManaging(false);
  }

  return createPortal(
    <div className="consent-overlay">
      <div
        ref={panelRef}
        className="consent-banner"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby="consent-banner-title"
        aria-describedby="consent-banner-copy"
      >
        <button
          className="consent-banner__close"
          type="button"
          aria-label="Close cookie preferences"
          onClick={() => {
            setVisible(false);
            setManaging(false);
          }}
        >
          <X size={20} aria-hidden="true" />
        </button>
        <div className="consent-banner__inner">
          <div className="consent-banner__copy">
            <span className="consent-banner__icon" aria-hidden="true">
              <Cookie size={26} strokeWidth={1.6} />
            </span>
            <h2 id="consent-banner-title">Your privacy choices</h2>
            <p id="consent-banner-copy">
              We use essential cookies to keep Shelfmerch working. With your permission, we also use
              cookies for analytics and advertising. If you allow advertising and Shelf Merch
              enables the OpenAI pixel, OpenAI automatic advanced matching hashes recognizable form
              details in your browser, such as a name, email address, or phone number. OpenAI does
              not provide a supported way to turn that hashing off. The events Shelf Merch sends
              contain only an event name and an event id.
            </p>
          </div>
          <div className="consent-banner__controls">
            <div className="consent-banner__actions">
              <button type="button" onClick={() => closeAfterChoice(acceptAll)}>
                Accept all
              </button>
              <button type="button" onClick={() => closeAfterChoice(rejectOptional)}>
                Reject optional
              </button>
            </div>
            <div className="consent-banner__links">
              <button
                type="button"
                onClick={() => setManaging((open) => !open)}
                aria-expanded={managing}
              >
                Manage preferences
              </button>
              <a href="/privacy#cookie-preferences">Privacy policy</a>
            </div>
          </div>
          {managing ? (
            <fieldset className="consent-banner__prefs">
              <legend>Optional measurement</legend>
              <label>
                <input type="checkbox" checked disabled /> Essential, always on
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.analytics}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, analytics: event.target.checked }))
                  }
                />
                Analytics, Google Analytics 4
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.advertising}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, advertising: event.target.checked }))
                  }
                />
                Advertising. Meta, and OpenAI if enabled. OpenAI hashes recognizable form details
                and that hashing cannot be switched off.
              </label>
              <button type="button" onClick={() => closeAfterChoice(saveDraft)}>
                Save preferences
              </button>
            </fieldset>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
