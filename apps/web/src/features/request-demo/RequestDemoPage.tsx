import { ArrowRight, Check, Star } from "lucide-react";
import { Link } from "react-router";
import { ShelfMerchLogo } from "@/components/brand/ShelfMerchLogo";
import { RequestDemoForm } from "./RequestDemoForm";
import "./request-demo.css";

const withoutShelfMerch = [
  "Swag requests scattered across chats and spreadsheets",
  "Manual vendor follow-ups for every city and department",
  "No clear view of budgets, approvals or delivery status",
];

const withShelfMerch = [
  "One workspace for stores, kits, rewards and bulk orders",
  "Budgets, approvals and fulfilment tracked in one flow",
  "Pan-India production and delivery handled by one team",
];

const workflowCards = [
  {
    title: "Company stores",
    copy: "Launch branded stores for teams, offices and events with curated product collections.",
    image: "/images/landing/company-stores.png?v=3",
  },
  {
    title: "Kits and rewards",
    copy: "Build onboarding kits, milestone gifts and recognition drops without vendor chaos.",
    image: "/images/landing/kits-and-rewards.png?v=3",
  },
  {
    title: "Reports and approvals",
    copy: "Give finance and people teams visibility into budgets, spend and delivery status.",
    image: "/images/landing/reports-and-approvals.png?v=4",
  },
];

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
              <br />
              <span>swag moment with</span>
              <br />
              <span>one merch platform</span>
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

      <section className="request-demo__section request-demo__section--center">
        <p className="request-demo__kicker">One platform. Every team moment.</p>
        <h2>Unified merch. No vendor switching.</h2>
        <p>
          Prospect gifting, employee rewards, onboarding and festival kits can all move through one
          clean planning and fulfilment flow.
        </p>
      </section>

      <section className="request-demo__compare">
        <article className="request-demo__compare-card request-demo__compare-card--messy">
          <h3>Without Shelf Merch</h3>
          <div className="request-demo__compare-visual" aria-hidden="true">
            <span className="request-demo__node request-demo__node--a" />
            <span className="request-demo__node request-demo__node--b" />
            <span className="request-demo__node request-demo__node--c" />
            <span className="request-demo__node request-demo__node--d" />
            <span className="request-demo__warning request-demo__warning--a">!</span>
            <span className="request-demo__warning request-demo__warning--b">!</span>
            <span className="request-demo__warning request-demo__warning--c">!</span>
          </div>
          <ul>
            {withoutShelfMerch.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
        <article className="request-demo__compare-card request-demo__compare-card--clean">
          <h3>With Shelf Merch</h3>
          <div className="request-demo__compare-visual" aria-hidden="true">
            <div className="request-demo__profile-card">
              <span className="request-demo__avatar" />
              <div>
                <strong>Merch plan</strong>
                <small>Ready to ship</small>
              </div>
              <em>+6</em>
            </div>
            <div className="request-demo__success-strip">Approved workflow</div>
          </div>
          <ul>
            {withShelfMerch.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>

      <section className="request-demo__section">
        <h2>Built for the way modern teams gift</h2>
        <div className="request-demo__cards">
          {workflowCards.map((card) => (
            <article className="request-demo__feature-card" key={card.title}>
              <div className="request-demo__card-image-wrap">
                <img src={card.image} alt={card.title} className="request-demo__card-image" />
              </div>
              <h3>{card.title}</h3>
              <p>{card.copy}</p>
              <Link to="/request-demo">Book demo</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="request-demo__plans">
        <div className="request-demo__plans-inner">
          <h2>Plan, manage and equip your teams with one solution</h2>
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
          <h2>Excellent corporate merch support</h2>
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
        <h2>Fast support that keeps your merch moving</h2>
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
        <h2>Get started with Shelf Merch in three easy steps</h2>
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
        <h2>Ready to build your merch platform?</h2>
        <Link to="/request-demo">
          Book a demo <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}
