import { useLayoutEffect } from "react";
import { ArrowRight, Check, Star } from "lucide-react";
import { Link } from "react-router";
import { ShelfMerchLogo } from "@/components/brand/ShelfMerchLogo";
import { RequestDemoForm } from "./RequestDemoForm";
import "./request-demo.css";
import "./request-demo-typography.css";
import "./request-demo-spacing.css";

const solutions = [
  {
    name: "Company Stores",
    tagline: "Storefronts",
    copy: "Launch self-serve branded stores for employees, clients, and event attendees.",
    features: [
      "Custom domain & branding",
      "Curated product catalog",
      "Employee point redemptions",
      "Automated order routing",
    ],
  },
  {
    name: "Kits & Gifting",
    tagline: "Onboarding & Rewards",
    copy: "Ship personalized welcome packages and milestone rewards directly to doorstep.",
    features: [
      "Custom packaging & kitting",
      "HRIS & Slack integrations",
      "Address collection portals",
      "Pan-India & global delivery",
    ],
  },
  {
    name: "Budgets & Logistics",
    tagline: "Control & Fulfilment",
    copy: "Centralize procurement, team wallets, and inventory management in one place.",
    features: [
      "Department budget wallets",
      "Multi-level order approvals",
      "Real-time inventory tracking",
      "GST invoices & reporting",
    ],
  },
];

const stats = [
  ["6 min", "average demo request time"],
  ["1 hr", "typical first response window"],
  ["93%", "delivery workflow visibility"],
];

const steps = [
  {
    title: "Book a demo",
    copy: "Tell us about your team, gifting goals and delivery needs. We&apos;ll map the right Shelf Merch workflow for you.",
  },
  {
    title: "Add your teams",
    copy: "Set up departments, locations and approvers so every request moves through one clear platform.",
  },
  {
    title: "Launch your merch program",
    copy: "Go live with stores, kits, rewards and bulk gifting backed by our fulfilment team.",
  },
];

const faqs = [
  "Can Shelf Merch support multiple office locations?",
  "Can we create onboarding and festival kits?",
  "Can finance review budgets before orders ship?",
  "How fast can a company store go live?",
];

export function RequestDemoPage() {
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);

  return (
    <main className="request-demo">
      <section className="request-demo__hero">
        <header className="request-demo__header">
          <Link to="/" aria-label="Shelf Merch home" className="request-demo__logo">
            <ShelfMerchLogo height={30} />
          </Link>
        </header>

        <div className="request-demo__shell">
          <section className="request-demo__intro" aria-labelledby="request-demo-title">
            <h1 id="request-demo-title">
              <span>Manage every</span>
              <span>swag moment with</span>
              <em>one merch platform</em>
            </h1>

            <p className="request-demo__lead">
              Run company stores, onboarding kits, employee rewards and bulk gifting from one Shelf
              Merch workspace without switching vendors or spreadsheets.
            </p>
          </section>

          <section className="request-demo__form-card" aria-labelledby="demo-form-title">
            <RequestDemoForm titleId="demo-form-title" />
          </section>
        </div>
      </section>

      <section className="request-demo__plans">
        <div className="request-demo__plans-inner">
          <h2>Plan, manage and equip your teams <em>with one solution</em></h2>
          <div className="request-demo__plan-grid">
            {solutions.map((item) => (
              <article className="request-demo__plan" key={item.name}>
                <p>{item.name}</p>
                <h3>{item.tagline}</h3>
                <span>{item.copy}</span>
                <Link to="/request-demo">Book a demo</Link>
                <h4>Key capabilities</h4>
                <ul>
                  {item.features.map((feature) => (
                    <li key={feature}>
                      <Check size={14} aria-hidden="true" /> {feature}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="request-demo__testimonial">
        <div className="request-demo__video-card">
          <img src="/images/request-demo/customer-story-merch.png" alt="" />
        </div>
        <div>
          <p className="request-demo__kicker">Customer story</p>
          <h2>Excellent corporate merch <em>support</em></h2>
          <p>
            Shelf Merch helped us consolidate gifting, improve turnaround times and give finance a
            clearer view of every order.
          </p>
          <div className="request-demo__stars" aria-label="5 star rating">
            {Array.from({ length: 5 }).map((_, index) => (
              <Star key={index} size={18} fill="currentColor" aria-hidden="true" />
            ))}
          </div>
        </div>
      </section>

      <section className="request-demo__section">
        <h2>Fast support that keeps <em>your merch moving</em></h2>
        <div className="request-demo__stats">
          {stats.map(([value, label]) => (
            <article key={value}>
              <strong>{value}</strong>
              <span>{label}</span>
            </article>
          ))}
        </div>
        <Link className="request-demo__dark-link" to="/request-demo">
          Book a demo
        </Link>
      </section>

      <section className="request-demo__steps">
        <h2>Get started with Shelf Merch <em>in three easy steps</em></h2>
        <div className="request-demo__steps-grid">
          <div className="request-demo__steps-layout">
            <ol>
              {steps.map((step, index) => (
                <li key={step.title}>
                  <span>{index + 1}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.copy}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Link className="request-demo__steps-cta" to="/request-demo">
              Book a demo
            </Link>
          </div>
          <div className="request-demo__team-card">
            <img
              src="/images/request-demo/steps-team-ui.png?v=6"
              alt="Team members filter dashboard with country flags"
            />
          </div>
        </div>
      </section>

      <section className="request-demo__faq">
        <h2>FAQs</h2>
        {faqs.map((question) => (
          <details key={question}>
            <summary>{question}</summary>
            <p>
              Yes. We&apos;ll cover this in the demo and recommend the cleanest workflow for your
              team.
            </p>
          </details>
        ))}
      </section>

      <section className="request-demo__footer-cta" aria-label="Book a Shelf Merch demo">
        <h2>Ready to build <em>your merch platform?</em></h2>
        <Link to="/request-demo">
          Book a demo <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}
