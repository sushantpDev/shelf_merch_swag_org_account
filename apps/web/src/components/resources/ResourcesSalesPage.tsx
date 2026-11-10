import { useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, ArrowUpRight, Check, Gift, Heart, Megaphone } from "lucide-react";
import { Link } from "react-router";
import { ResourcesShell } from "./ResourcesShell";
import { TEAMS } from "./resources-data";
import "./resources-sales.css";

const ART = "/images/resources/sales";
const benefits = [
  {
    id: "sales-prospects",
    label: "PROSPECT GIFTING",
    title: "Give your next conversation a thoughtful start.",
    body: "Send a relevant gift before a meeting, after a demo or as part of an account-based campaign. Make the outreach personal, with a simple way for recipients to choose and claim.",
    points: ["Personal gift links without address chasing", "Recipient choice within a set budget"],
    image: "sales-prospect-v2",
    alt: "A marketer with a megaphone beside a blue funnel illustrating prospect outreach",
  },
  {
    id: "sales-brand",
    label: "BRAND VISIBILITY",
    title: "Make your brand part of their everyday.",
    body: "Create merchandise people will want to keep using. Bring approved products, artwork and packaging together for launches, communities, field teams and partner programs.",
    points: ["Approved artwork and product collections", "Bulk or on-demand production"],
    image: "sales-brand-v2",
    alt: "A premium emerald gift box with coordinated lavender apparel, a cap, bottle, tote and notebook",
  },
  {
    id: "sales-campaigns",
    label: "CAMPAIGN CONTROL",
    title: "Plan the touchpoint. See the whole picture.",
    body: "Build repeatable gifting around your campaign moments. Keep gift claims, delivery status and spend together, so your team can follow each program with less manual coordination.",
    points: ["One-off or recurring gifting programs", "Campaign budgets and redemption reporting"],
    image: "sales-workflow-v2",
    alt: "A campaign planner connecting thoughtful gifts with individual recipients",
  },
  {
    id: "sales-clients",
    label: "CLIENT RELATIONSHIPS",
    title: "Stay close, beyond the next deal.",
    body: "Mark renewals, project wins and important relationships with considered client gifting. Choose premium products, personal notes and packaging that feels like your brand.",
    points: [
      "Collections tailored to different client tiers",
      "Premium packaging and personal notes",
    ],
    image: "sales-clients-v2",
    alt: "A sales professional connecting with a client who has received a thoughtful gift",
  },
] as const;
const tabContent = [
  {
    id: "stores",
    label: "Branded gifting",
    title: "Your collection. Their perfect choice.",
    body: "Launch a branded gifting collection for clients and prospects. Curate the products and budget, then let recipients choose the item that suits them and share their delivery details.",
    points: [
      "Your approved products and branding",
      "A personal recipient experience",
      "Gift links for campaigns and individual sends",
    ],
    image: "sales-store-v2",
    alt: "A client holding a gift beside a branded merchandise storefront",
  },
  {
    id: "workflows",
    label: "Campaign workflows",
    title: "Keep your next send moving.",
    body: "Bring the audience, collection and campaign rules together before you send. Reuse a considered workflow for prospect outreach, client appreciation and recurring programs.",
    points: [
      "Choose your audience and sending method",
      "Set campaign budgets before launch",
      "Follow claims, delivery and spend together",
    ],
    image: "sales-workflow-v2",
    alt: "A gifting planner connecting campaign gifts with their recipients",
  },
  {
    id: "brand",
    label: "Brand consistency",
    title: "One brand, wherever it goes.",
    body: "Give sales teams an approved selection of products, artwork and packaging. Keep each touchpoint recognisable, from a single client thank you to a wider product launch.",
    points: [
      "Brand-approved collections",
      "Consistent artwork and packaging",
      "Merchandise for launches and partner programs",
    ],
    image: "sales-brand-v2",
    alt: "A coordinated collection of branded gifts, packaging and merchandise",
  },
] as const;

function SalesToolkit() {
  const [active, setActive] = useState(0);
  const tabButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = tabContent[active];
  function onKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabContent.length;
    else if (event.key === "ArrowLeft") next = (index + tabContent.length - 1) % tabContent.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabContent.length - 1;
    else return;
    event.preventDefault();
    setActive(next);
    tabButtons.current[next]?.focus();
  }
  return (
    <section
      className="sales-wrap sales-section sales-toolkit"
      aria-labelledby="sales-toolkit-title"
    >
      <div className="sales-section-heading">
        <span className="sales-label">A TOOLKIT FOR REVENUE TEAMS</span>
        <h2 id="sales-toolkit-title">
          Built for your brand.<em>Ready for your next campaign.</em>
        </h2>
      </div>
      <div className="sales-tabs" role="tablist" aria-label="Sales and marketing tools">
        {tabContent.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`sales-tab-${tab.id}`}
            aria-selected={index === active}
            aria-controls="sales-tool-panel"
            tabIndex={index === active ? 0 : -1}
            ref={(node) => {
              tabButtons.current[index] = node;
            }}
            onClick={() => setActive(index)}
            onKeyDown={(event) => onKey(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        className="sales-tool-panel"
        id="sales-tool-panel"
        role="tabpanel"
        aria-labelledby={`sales-tab-${selected.id}`}
        tabIndex={0}
      >
        <div>
          <h3>{selected.title}</h3>
          <p>{selected.body}</p>
          <ul>
            {selected.points.map((point) => (
              <li key={point}>
                <Check size={17} aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
          <Link className="sales-inline-link" to="/request-demo">
            Build your campaign <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        </div>
        <img
          src={`${ART}/${selected.image}.webp`}
          alt={selected.alt}
          width="1536"
          height="1024"
          loading="lazy"
        />
      </div>
    </section>
  );
}

export function ResourcesSalesPage() {
  const sales = TEAMS.sales;
  return (
    <ResourcesShell title="Shelf Merch for Sales & Marketing Teams" variant="sales">
      <main className="sales-main">
        <section className="sales-hero" aria-labelledby="sales-title">
          <svg
            className="sales-hero__backdrop"
            viewBox="0 0 1440 620"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M0 0H320C263 90 143 72 111 174C78 248 46 262 0 274Z" />
            <path d="M1040 0H1440V620H1098C1071 552 935 534 928 445C918 343 781 317 837 204C877 131 1057 151 1040 0Z" />
          </svg>
          <div className="sales-wrap sales-hero__grid">
            <div className="sales-hero__copy">
              <span className="sales-label">SHELF MERCH FOR SALES &amp; MARKETING TEAMS</span>
              <h1 id="sales-title">
                Turn every gift<em>into momentum.</em>
              </h1>
              <p>
                Run prospect gifting, client appreciation and branded campaigns at the speed of your
                pipeline, with every item on-brand and every rupee visible.
              </p>
              <div className="sales-actions">
                <Link className="sales-button" to="/request-demo">
                  Plan your next campaign <ArrowUpRight size={19} aria-hidden="true" />
                </Link>
                <a className="sales-button sales-button--outline" href="#sales-benefits">
                  Explore the possibilities <ArrowRight size={18} aria-hidden="true" />
                </a>
              </div>
              <span className="sales-proof">
                <Check size={16} aria-hidden="true" /> Open doors. Build loyalty. Keep your brand
                consistent.
              </span>
            </div>
            <img
              className="sales-hero__image"
              src={`${ART}/sales-hero-v2.webp`}
              alt="Sales and marketing colleagues planning a thoughtful branded gifting campaign"
              width="1536"
              height="1024"
              fetchPriority="high"
            />
          </div>
        </section>
        <nav className="sales-journey" aria-label="Sales gifting programs">
          <div className="sales-wrap">
            <a href="#sales-prospects">
              <Gift size={23} aria-hidden="true" />
              Prospect outreach
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
            <a href="#sales-brand">
              <Megaphone size={23} aria-hidden="true" />
              Campaign merchandise
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
            <a href="#sales-clients">
              <Heart size={23} aria-hidden="true" />
              Client appreciation
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          </div>
        </nav>
        <section
          className="sales-wrap sales-section"
          id="sales-benefits"
          aria-labelledby="sales-benefits-title"
        >
          <div className="sales-section-heading">
            <span className="sales-label">THOUGHTFUL TOUCHPOINTS. STRONGER CONNECTIONS.</span>
            <h2 id="sales-benefits-title">
              From first conversation<em>to lasting connection.</em>
            </h2>
            <p>{sales.body}</p>
          </div>
          <div>
            {benefits.map((benefit, index) => (
              <article
                key={benefit.id}
                id={benefit.id}
                className={`sales-benefit${index % 2 ? " sales-benefit--reverse" : ""}`}
              >
                <div>
                  <span className="sales-label">
                    0{index + 1} / {benefit.label}
                  </span>
                  <h3>{benefit.title}</h3>
                  <p>{benefit.body}</p>
                  <ul>
                    {benefit.points.map((point) => (
                      <li key={point}>
                        <Check size={17} aria-hidden="true" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
                <img
                  src={`${ART}/${benefit.image}.webp`}
                  alt={benefit.alt}
                  loading="lazy"
                  width="1536"
                  height="1024"
                />
              </article>
            ))}
          </div>
        </section>
        <section className="sales-workflow" aria-labelledby="sales-workflow-title">
          <div className="sales-wrap">
            <div className="sales-section-heading">
              <span className="sales-label">MORE SELLING. LESS COORDINATING.</span>
              <h2 id="sales-workflow-title">
                A campaign in motion,<em>not in a spreadsheet.</em>
              </h2>
              <p>One clear process, from the audience you choose to the moment they receive.</p>
            </div>
            <div className="sales-steps">
              {sales.steps.map((step, index) => (
                <article key={step[1]}>
                  <span>0{index + 1}</span>
                  <h3>{step[1]}</h3>
                  <p>{step[2]}</p>
                </article>
              ))}
            </div>
            <div className="sales-guardrails">
              {sales.controls.map((control) => (
                <span key={control}>
                  <Check size={16} aria-hidden="true" />
                  {control}
                </span>
              ))}
            </div>
          </div>
        </section>
        <SalesToolkit />
        <section className="sales-cta" aria-labelledby="sales-cta-title">
          <div className="sales-wrap">
            <span className="sales-label">YOUR NEXT CONNECTION STARTS HERE</span>
            <h2 id="sales-cta-title">
              Make your next touchpoint<em>worth remembering.</em>
            </h2>
            <p>
              Let’s build a gifting program around your audience, your brand and your next big
              moment.
            </p>
            <div className="sales-actions">
              <Link to="/request-demo" className="sales-button">
                Talk to our team <ArrowUpRight size={19} aria-hidden="true" />
              </Link>
              <Link to="/apps/catalog" className="sales-button sales-button--outline">
                Explore the catalog <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
        <div className="sales-wrap sales-related">
          <Link to="/resources">← All resources</Link>
          <div>
            <Link to="/resources/human-resources">
              HR &amp; People <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
            <Link to="/resources/events">
              Events <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </main>
    </ResourcesShell>
  );
}
