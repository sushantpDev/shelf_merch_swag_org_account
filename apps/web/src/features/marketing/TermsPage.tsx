import { useEffect, useMemo } from "react";
import { FileText, ScrollText } from "lucide-react";
import { Link } from "react-router";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { useDocsMeta } from "@/features/docs/useDocsMeta";
import termsHtml from "./pages/terms.html?raw";
import "@/components/landing-page.css";
import "./terms-page.css";

function readTerms() {
  const doc = new DOMParser().parseFromString(termsHtml, "text/html");
  return {
    intro: doc.querySelector(".intro p")?.textContent ?? "",
    date: doc.querySelector(".date")?.textContent ?? "",
    noteTitle: doc.querySelector(".note strong")?.textContent ?? "",
    note: doc.querySelector(".note p")?.textContent ?? "",
    sections: Array.from(doc.querySelectorAll("main article"), (section) => ({
      id: section.id,
      number: section.querySelector(".num")?.textContent ?? "",
      title: section.querySelector("h2")?.textContent ?? "",
      summary: section.querySelector(".title em")?.textContent ?? "",
      markup: section.querySelector(".copy")?.innerHTML ?? "",
    })),
    help: doc.querySelector(".help p")?.textContent ?? "",
    legalNote: doc.querySelector(".legal-note")?.textContent ?? "",
  };
}

export function TermsPage() {
  const terms = useMemo(readTerms, []);
  const chapters = [
    {
      id: "terms-using",
      number: "01",
      title: "Using Shelf Merch",
      range: "SECTIONS 01–03",
      sections: terms.sections.slice(0, 3),
    },
    {
      id: "terms-ordering",
      number: "02",
      title: "Your orders & products",
      range: "SECTIONS 04–07",
      sections: terms.sections.slice(3, 7),
    },
    {
      id: "terms-responsibilities",
      number: "03",
      title: "Our shared responsibilities",
      range: "SECTIONS 08–13",
      sections: terms.sections.slice(7),
    },
  ];
  useDocsMeta({
    title: "Terms & Conditions | Shelf Merch",
    description:
      "Terms and Conditions for Shelf Merch websites, company stores, merchandise programmes and fulfilment services.",
    canonicalPath: "/legal/terms-of-service",
  });
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
      else window.scrollTo(0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="terms-site shelf-landing">
      <Header />
      <main className="terms-page">
        <section className="terms-hero" aria-labelledby="terms-title">
          <div className="terms-container">
            <p className="terms-eyebrow">
              <ScrollText size={19} aria-hidden="true" /> THE DETAILS, MADE CLEAR
            </p>
            <h1 id="terms-title">
              Terms & <em>Conditions.</em>
            </h1>
            <p className="terms-intro">{terms.intro}</p>
            <div className="terms-document-meta">
              <span>
                <FileText size={16} aria-hidden="true" /> WEBSITE & PLATFORM TERMS
              </span>
              <span>{terms.date}</span>
              <span>13 sections</span>
            </div>
          </div>
        </section>

        <section
          className="terms-directory terms-container"
          aria-labelledby="terms-directory-title"
        >
          <div className="terms-directory-heading">
            <p className="terms-eyebrow">YOUR GUIDE TO THE DETAILS</p>
            <h2 id="terms-directory-title">
              Find what <em>you’re looking for.</em>
            </h2>
            <p>Read the full terms below, or jump to a section.</p>
          </div>
          <nav className="terms-directory-grid" aria-label="Terms and conditions sections">
            {chapters.map((chapter) => (
              <div className="terms-directory-chapter" key={chapter.id}>
                <div className="terms-directory-label">
                  <span>{chapter.number}</span>
                  <h3>{chapter.title}</h3>
                </div>
                <ol>
                  {chapter.sections.map((section) => (
                    <li key={section.id}>
                      <a href={`#${section.id}`}>
                        <span>{section.number}</span>
                        {section.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </nav>
        </section>

        <aside className="terms-notice terms-container" aria-labelledby="terms-note-title">
          <span className="terms-notice-symbol" aria-hidden="true">
            i
          </span>
          <div>
            <h2 id="terms-note-title">{terms.noteTitle}</h2>
            <p>{terms.note}</p>
          </div>
        </aside>

        <nav className="terms-chapter-nav" aria-label="Jump to a chapter">
          <div className="terms-container">
            {chapters.map((chapter) => (
              <a key={chapter.id} href={`#${chapter.id}`}>
                <span>{chapter.number}</span>
                {chapter.title}
              </a>
            ))}
          </div>
        </nav>

        <div className="terms-reading">
          {chapters.map((chapter) => (
            <section
              className="terms-chapter"
              id={chapter.id}
              key={chapter.id}
              aria-labelledby={`${chapter.id}-title`}
            >
              <header className="terms-chapter-heading">
                <p className="terms-eyebrow">
                  CHAPTER {chapter.number} <span>{chapter.range}</span>
                </p>
                <h2 id={`${chapter.id}-title`}>{chapter.title}</h2>
              </header>
              {chapter.sections.map((section) => (
                <article
                  className="terms-article"
                  id={section.id}
                  key={section.id}
                  aria-labelledby={`terms-${section.id}-title`}
                >
                  <span className="terms-article-number" aria-hidden="true">
                    {section.number}
                  </span>
                  <div>
                    <h3 id={`terms-${section.id}-title`}>{section.title}</h3>
                    <p className="terms-article-summary">{section.summary}</p>
                    <div
                      className="terms-copy"
                      dangerouslySetInnerHTML={{ __html: section.markup }}
                    />
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>

        <section className="terms-help terms-container" aria-labelledby="terms-help-title">
          <div>
            <p className="terms-eyebrow">NEED CLARITY?</p>
            <h2 id="terms-help-title">
              Let’s keep it <em>simple.</em>
            </h2>
            <p>{terms.help}</p>
          </div>
          <Link className="terms-button" to="/request-demo">
            Contact Shelf Merch
          </Link>
        </section>
        <p className="terms-legal-note terms-container">{terms.legalNote}</p>
      </main>
      <Footer />
    </div>
  );
}
