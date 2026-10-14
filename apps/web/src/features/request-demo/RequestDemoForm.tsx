import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, ChevronDown, Home, MessageCircle } from "lucide-react";
import { Link } from "react-router";
import { ApiError, publicFetch } from "@/services/api";
import {
  buildRequestDemoWhatsAppHref,
  buildRequestDemoWhatsAppMessage,
  getRequestDemoFirstName,
  requestDemoNextSteps,
  requestDemoRequirements,
  type DemoLeadFormValues,
} from "./model";
import "./request-demo.css";

type RequestDemoFormProps = {
  titleId?: string;
  variant?: "page" | "landing";
  showHeading?: boolean;
  submitLabel?: string;
  whatsAppLabel?: string;
  consentText?: string;
  commitmentText?: string;
  idPrefix?: string;
};

function readLeadFormValues(form: HTMLFormElement): DemoLeadFormValues {
  const formData = new FormData(form);
  return {
    fullName: String(formData.get("fullName") ?? "").trim(),
    companyName: String(formData.get("companyName") ?? "").trim(),
    workEmail: String(formData.get("workEmail") ?? "").trim(),
    mobileNumber: String(formData.get("mobileNumber") ?? "").trim(),
    requirement: String(formData.get("requirement") ?? "").trim(),
  };
}

function openWhatsApp(values?: Partial<DemoLeadFormValues>) {
  const href = buildRequestDemoWhatsAppHref(buildRequestDemoWhatsAppMessage(values));
  window.open(href, "_blank", "noopener,noreferrer");
}

export function RequestDemoForm({
  titleId = "demo-form-title",
  variant = "page",
  showHeading = true,
  submitLabel = "Request a Demo",
  whatsAppLabel = "Prefer WhatsApp? Chat now",
  consentText = "By submitting this form, you agree to be contacted by Shelf Merch regarding your enquiry.",
  commitmentText = "No payment or commitment is required.",
  idPrefix = "demo",
}: RequestDemoFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const [submittedFirstName, setSubmittedFirstName] = useState("");
  const [submittedLead, setSubmittedLead] = useState<DemoLeadFormValues | null>(null);
  const [requirement, setRequirement] = useState("");
  const [isRequirementOpen, setIsRequirementOpen] = useState(false);
  const isSubmitting = submitState === "submitting";
  const isLandingVariant = variant === "landing";

  useEffect(() => {
    if (submitState !== "success" || !isLandingVariant) return;

    const timeoutId = window.setTimeout(() => {
      const hero = document.getElementById("top");
      if (hero) {
        hero.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [isLandingVariant, submitState]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitState === "submitting" || submitState === "success") return;

    const currentForm = event.currentTarget;
    const values = readLeadFormValues(currentForm);

    setSubmitState("submitting");
    setMessage("");

    try {
      await publicFetch("/demo-leads", {
        method: "POST",
        body: JSON.stringify({
          fullName: values.fullName,
          companyName: values.companyName,
          workEmail: values.workEmail,
          mobileNumber: values.mobileNumber,
          requirement: values.requirement || undefined,
        }),
      });

      currentForm.reset();
      setRequirement("");
      setIsRequirementOpen(false);
      setSubmittedFirstName(getRequestDemoFirstName(values.fullName));
      setSubmittedLead(values);
      setSubmitState("success");
      setMessage("");
    } catch (error) {
      setSubmitState("error");
      const isValidation =
        error instanceof ApiError && (error.status === 400 || error.code === "VALIDATION_ERROR");
      setMessage(
        isValidation && error instanceof ApiError
          ? error.message
          : "Something went wrong while submitting your request. Please try again.",
      );
    }
  }

  function handleWhatsAppClick() {
    const values = formRef.current ? readLeadFormValues(formRef.current) : undefined;
    openWhatsApp(values);
  }

  if (submitState === "success") {
    return (
      <div className={`request-demo__success request-demo__success--${variant}`} role="status">
        <span className="request-demo__success-icon" aria-hidden="true">
          <Check size={26} strokeWidth={3} />
        </span>
        <div className="request-demo__success-copy">
          <h2 id={titleId}>Request received!</h2>
          <p className="request-demo__success-subtitle">We&apos;ll be in touch soon.</p>
          {isLandingVariant ? (
            <p>
              Thanks, <strong>{submittedFirstName}</strong>. A Shelf Merch specialist will contact
              you shortly.
            </p>
          ) : (
            <p>
              Thanks, <strong>{submittedFirstName}</strong>. A Shelf Merch specialist will contact
              you shortly to understand your requirements and schedule your personalised demo.
            </p>
          )}

          {!isLandingVariant ? (
            <div className="request-demo__next-steps">
              <h3>What happens next?</h3>
              <ul>
                {requestDemoNextSteps.map((step) => (
                  <li key={step}>
                    <span aria-hidden="true">
                      <Check size={14} strokeWidth={3} />
                    </span>
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="request-demo__success-confirm">
            <span aria-hidden="true">
              <Check size={14} strokeWidth={3} />
            </span>
            Your request has been submitted successfully.
          </p>
        </div>

        {!isLandingVariant ? (
          <div className="request-demo__success-actions">
            <a
              className="request-demo__success-action request-demo__success-action--primary"
              href={buildRequestDemoWhatsAppHref(
                buildRequestDemoWhatsAppMessage(submittedLead ?? undefined),
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              Chat on WhatsApp
              <span aria-hidden="true">
                <MessageCircle size={18} />
              </span>
            </a>
            <Link
              className="request-demo__success-action request-demo__success-action--secondary"
              to="/"
            >
              Return to Homepage
              <span aria-hidden="true">
                <Home size={18} />
              </span>
            </Link>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      {showHeading ? (
        <div className="request-demo__form-heading">
          <div
            className="request-demo__g2-rating"
            aria-label="G2 Rating: 4.7 out of 5 stars from 15,128 reviews"
          >
            <span className="request-demo__g2-badge">G²</span>
            <span className="request-demo__g2-star">★</span>
            <strong className="request-demo__g2-score">4.7 / 5</strong>
            <span className="request-demo__g2-divider">|</span>
            <span className="request-demo__g2-count">15,128 Reviews</span>
          </div>
          <h2 id={titleId}>Book a free merch planning demo</h2>
          <p>Experience a personalised Shelf Merch walkthrough and get your questions answered.</p>
        </div>
      ) : (
        <h2 id={titleId} className="request-demo__visually-hidden">
          Tell us about your team.
        </h2>
      )}

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className={`request-demo__form request-demo__form--${variant}`}
      >
        <div className="request-demo__field">
          <label htmlFor={`${idPrefix}-full-name`}>
            Full Name<span aria-hidden="true">*</span>
          </label>
          <input
            id={`${idPrefix}-full-name`}
            name="fullName"
            type="text"
            autoComplete="name"
            placeholder="Full Name"
            required
            disabled={isSubmitting}
          />
        </div>

        <div className="request-demo__field">
          <label htmlFor={`${idPrefix}-company-name`}>
            Company Name<span aria-hidden="true">*</span>
          </label>
          <input
            id={`${idPrefix}-company-name`}
            name="companyName"
            type="text"
            autoComplete="organization"
            placeholder="Company Name"
            required
            disabled={isSubmitting}
          />
        </div>

        <div className="request-demo__field">
          <label htmlFor={`${idPrefix}-email`}>
            Work Email<span aria-hidden="true">*</span>
          </label>
          <input
            id={`${idPrefix}-email`}
            name="workEmail"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="@company.com"
            required
            disabled={isSubmitting}
          />
        </div>

        <div className="request-demo__field">
          <label htmlFor={`${idPrefix}-mobile`}>
            Mobile Number<span aria-hidden="true">*</span>
          </label>
          <input
            id={`${idPrefix}-mobile`}
            name="mobileNumber"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="Mobile number"
            pattern="[0-9+() -]{7,20}"
            title="Enter a valid mobile number"
            required
            disabled={isSubmitting}
          />
        </div>

        <div className="request-demo__field request-demo__field--wide">
          <label id={`${idPrefix}-requirement-label`} htmlFor={`${idPrefix}-requirement`}>
            What are you looking for?
          </label>
          <input
            id={`${idPrefix}-requirement`}
            type="hidden"
            name="requirement"
            value={requirement}
            readOnly
          />
          <div className="request-demo__select-wrap request-demo__select-wrap--custom">
            <button
              type="button"
              className="request-demo__select-button"
              aria-expanded={isRequirementOpen}
              aria-haspopup="listbox"
              aria-labelledby={`${idPrefix}-requirement-label`}
              disabled={isSubmitting}
              onBlur={(event) => {
                if (
                  !event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)
                ) {
                  setIsRequirementOpen(false);
                }
              }}
              onClick={() => setIsRequirementOpen((open) => !open)}
            >
              <span className={requirement ? "" : "request-demo__select-placeholder"}>
                {requirement || "Select a requirement"}
              </span>
              <ChevronDown size={18} aria-hidden="true" />
            </button>

            {isRequirementOpen ? (
              <div
                className="request-demo__select-menu"
                role="listbox"
                aria-labelledby={`${idPrefix}-requirement-label`}
                tabIndex={-1}
              >
                {requestDemoRequirements.map((option) => (
                  <button
                    type="button"
                    className={`request-demo__select-option${requirement === option ? " is-selected" : ""}`}
                    key={option}
                    role="option"
                    aria-selected={requirement === option}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setRequirement(option);
                      setIsRequirementOpen(false);
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <button
          type="submit"
          className="request-demo__submit"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
        >
          {isSubmitting ? "Submitting..." : submitLabel}
        </button>

        {message ? (
          <p
            className={`request-demo__form-status request-demo__form-status--${submitState}`}
            role="alert"
          >
            {message}
          </p>
        ) : null}

        <p className="request-demo__consent">{consentText}</p>

        <div className="request-demo__whatsapp-divider" aria-hidden="true">
          <span />
          OR
          <span />
        </div>

        <button
          type="button"
          className="request-demo__whatsapp-button"
          onClick={handleWhatsAppClick}
        >
          <MessageCircle size={22} aria-hidden="true" />
          {whatsAppLabel}
        </button>

        <p className="request-demo__commitment">
          <Check size={14} aria-hidden="true" /> {commitmentText}
        </p>
      </form>
    </>
  );
}
