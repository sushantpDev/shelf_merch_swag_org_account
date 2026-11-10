import { useEffect, useMemo } from "react";
import { Database, Eye, Hand, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { Link } from "react-router";
import { ResourcesShell } from "@/components/resources/ResourcesShell";
import { MeasurementConsentChoice } from "@/features/privacy/MeasurementConsentChoice";
import { useDocsMeta } from "@/features/docs/useDocsMeta";
import privacyHtml from "./pages/privacy.html?raw";
import "./privacy-page.css";

const TITLE = "Privacy Policy | Shelf Merch";
const icons = [Database, Eye, ShieldCheck, Hand];

// The existing, repository-authored policy remains the source of truth.
function readPolicy() {
  const doc = new DOMParser().parseFromString(privacyHtml, "text/html");
  return {
    intro: doc.querySelector(".intro p")?.textContent ?? "",
    date: doc.querySelector(".date")?.textContent ?? "",
    notice: doc.querySelector(".notice p")?.textContent ?? "",
    summaries: Array.from(doc.querySelectorAll(".summary-grid article"), (item) => ({
      title: item.querySelector("h3")?.textContent ?? "",
      body: item.querySelector("p")?.textContent ?? "",
    })),
    sections: Array.from(doc.querySelectorAll("article.policy"), (item) => ({
      id: item.id,
      number: item.querySelector(".num")?.textContent ?? "",
      title: item.querySelector("h2")?.textContent ?? "",
      summary: item.querySelector(".title em")?.textContent ?? "",
      markup: item.querySelector(".copy")?.innerHTML ?? "",
    })),
    help: doc.querySelector(".help p")?.textContent ?? "",
  };
}

export function PrivacyPage() {
  const policy = useMemo(readPolicy, []);
  const overviewParagraphs = policy.notice.split(/(?<=\.)\s+/);
  useDocsMeta({
    title: TITLE,
    description:
      "How Shelf Merch collects, uses and protects personal data, and the choices available to you.",
    canonicalPath: "/legal/privacy-policy",
  });

  useEffect(() => {
    // Also support links to cookie preferences from the site footer or consent banner.
    const frame = requestAnimationFrame(() => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <ResourcesShell title={TITLE}>
      <main className="privacy-page">
        <section className="privacy-hero" aria-labelledby="privacy-title">
          <div className="privacy-container privacy-hero-grid">
            <div>
              <p className="privacy-eyebrow">
                <ShieldCheck size={20} aria-hidden="true" /> YOUR DATA, EXPLAINED CLEARLY
              </p>
              <h1 id="privacy-title">
                Privacy <em>Policy.</em>
              </h1>
              <p className="privacy-intro">{policy.intro}</p>
              <p className="privacy-date">{policy.date}</p>
            </div>
            <aside className="privacy-overview" aria-labelledby="privacy-overview-title">
              <div className="privacy-overview-top">
                <div className="privacy-overview-icon">
                  <ShieldCheck size={26} strokeWidth={1.5} aria-hidden="true" />
                </div>
                <p className="privacy-eyebrow">AT A GLANCE</p>
              </div>
              <h2 id="privacy-overview-title">
                Your information.
                <br />
                <em>Your choices.</em>
              </h2>
              <div className="privacy-overview-copy">
                {overviewParagraphs.slice(0, -1).map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
              <p className="privacy-overview-promise">
                <ShieldCheck size={20} aria-hidden="true" />
                <span>{overviewParagraphs.at(-1)}</span>
              </p>
              <a className="privacy-preferences-button" href="#cookie-preferences">
                <SlidersHorizontal size={18} aria-hidden="true" /> Manage cookie preferences
              </a>
            </aside>
          </div>
        </section>

        <section className="privacy-principles privacy-container" aria-label="Privacy principles">
          {policy.summaries.map((summary, index) => {
            const Icon = icons[index];
            return (
              <article key={summary.title}>
                <Icon size={26} strokeWidth={1.5} aria-hidden="true" />
                <h2>{summary.title}</h2>
                <p>{summary.body}</p>
              </article>
            );
          })}
        </section>

        <div className="privacy-container privacy-layout">
          <aside className="privacy-sidebar">
            <nav aria-label="Privacy policy sections">
              <p className="privacy-eyebrow">ON THIS PAGE</p>
              <ol>
                {policy.sections.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`}>
                      <span>{section.number}</span>
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
              <a className="privacy-cookie-link" href="#cookie-preferences">
                <SlidersHorizontal size={16} aria-hidden="true" /> Cookie preferences
              </a>
            </nav>
          </aside>
          <div className="privacy-content">
            {policy.sections.map((section) => (
              <article
                className={`privacy-section${section.id === "rights" ? " privacy-section--rights" : ""}`}
                id={section.id}
                key={section.id}
                aria-labelledby={`${section.id}-title`}
              >
                <header className="privacy-section-header">
                  <span className="privacy-section-number" aria-hidden="true">
                    {section.number}
                  </span>
                  <div>
                    <h2 id={`${section.id}-title`}>{section.title}</h2>
                    <p>{section.summary}</p>
                  </div>
                </header>
                <div
                  className="privacy-policy-copy"
                  dangerouslySetInnerHTML={{ __html: section.markup }}
                />
              </article>
            ))}
            <MeasurementConsentChoice />
          </div>
        </div>

        <section className="privacy-help privacy-container" aria-labelledby="privacy-help-title">
          <div>
            <p className="privacy-eyebrow">PRIVACY QUESTIONS?</p>
            <h2 id="privacy-help-title">
              Talk to a <em>real person.</em>
            </h2>
            <p>{policy.help}</p>
          </div>
          <Link className="privacy-button" to="/request-demo">
            Send a privacy request
          </Link>
        </section>
      </main>
    </ResourcesShell>
  );
}
