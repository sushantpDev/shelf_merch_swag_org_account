import { useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  Gift,
  Heart,
  Layers,
  Package,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { Link } from "react-router";
import { ResourcesShell } from "../../components/resources/ResourcesShell";
import { useDocsMeta } from "../docs/useDocsMeta";
import "./platform-marketing.css";

const TITLE = "The Shelf Merch Platform | Recognition, Swag and Gifting";
const recognition = [
  {
    id: "kudos",
    label: "Kudos and recognition",
    eyebrow: "MAKE APPRECIATION PART OF EVERY DAY",
    title: "Good work deserves to be seen.",
    body: "Give employees a simple way to recognise peers, managers and cross-functional partners. Bring meaningful appreciation and approved rewards into one program.",
    points: [
      "Peer, manager and team-wide recognition",
      "Values-based appreciation, with or without points",
      "Engagement and participation reporting",
    ],
    image: "hr-recognition-illustration-v2.webp",
    alt: "Colleagues sharing recognition and appreciation",
  },
  {
    id: "milestones",
    label: "Milestones and occasions",
    eyebrow: "REMEMBER THE MOMENTS THAT MATTER",
    title: "A thoughtful moment, right on time.",
    body: "Set up gifting around birthdays, work anniversaries and employee achievements. Choose rewards and budgets that fit the occasion, and keep preparation and delivery connected.",
    points: [
      "Birthdays, anniversaries and key occasions",
      "Gifts by tenure, team, budget or recipient choice",
      "Scheduled gifting and delivery tracking",
    ],
    image: "hr-engagement-illustration-v2.webp",
    alt: "An employee milestone planner connecting gifts with recipients",
  },
] as const;
const process = [
  ["Create your program", "Choose recognition, milestones, a company store or a gifting campaign."],
  ["Bring your audience", "Add employees, prospects or clients and choose the right collection."],
  ["Set the boundaries", "Agree budgets, recipient choices and approval rules before you launch."],
  ["We make it happen", "Production, packing, dispatch and tracking come together in one flow."],
];
const controls = [
  {
    icon: SlidersHorizontal,
    title: "Budgets and credits",
    body: "Allocate funds by department, team or cost centre and keep program spend visible.",
  },
  {
    icon: ShieldCheck,
    title: "Approved choices",
    body: "Set catalogue, campaign and spending rules so teams can work within your brand’s guidelines.",
  },
  {
    icon: Layers,
    title: "Reporting in one place",
    body: "Follow spend, redemption, engagement, orders and delivery without piecing together separate updates.",
  },
  {
    icon: Users,
    title: "Connected workflows",
    body: "Bring employee data into your gifting workflow with integrations such as Zoho People.",
  },
];

function RecognitionPrograms() {
  const [active, setActive] = useState(0);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const item = recognition[active];
  function onKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft")
      next = (index + 1) % recognition.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = recognition.length - 1;
    else return;
    event.preventDefault();
    setActive(next);
    buttons.current[next]?.focus();
  }
  return (
    <section className="pm-wrap pm-section" id="recognition" aria-labelledby="pm-recognition-title">
      <div className="pm-heading">
        <span className="pm-label">RECOGNITION AND MILESTONES</span>
        <h2 id="pm-recognition-title">
          For the work they do.<em>And the moments they share.</em>
        </h2>
        <p>
          Build employee programs that feel personal, with a clear way for HR to coordinate them.
        </p>
      </div>
      <div className="pm-tabs" role="tablist" aria-label="Employee recognition programs">
        {recognition.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`pm-tab-${tab.id}`}
            aria-controls="pm-recognition-panel"
            aria-selected={active === index}
            tabIndex={active === index ? 0 : -1}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            onClick={() => setActive(index)}
            onKeyDown={(event) => onKey(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        className="pm-feature pm-recognition-panel"
        id="pm-recognition-panel"
        role="tabpanel"
        aria-labelledby={`pm-tab-${item.id}`}
        tabIndex={0}
      >
        <div>
          <span className="pm-label">{item.eyebrow}</span>
          <h3>{item.title}</h3>
          <p>{item.body}</p>
          <ul>
            {item.points.map((point) => (
              <li key={point}>
                <Check size={18} aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
          <Link className="pm-link" to="/resources/human-resources">
            Explore HR solutions <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        </div>
        <img
          src={`/images/resources/hr/${item.image}`}
          alt={item.alt}
          width="1536"
          height="1024"
          loading="lazy"
        />
      </div>
    </section>
  );
}

export function PlatformMarketingPage() {
  useDocsMeta({
    title: TITLE,
    description:
      "Run recognition, milestones, company stores, swag and gifting programs with Shelf Merch. One connected platform, production and fulfilment partner.",
    canonicalPath: "/platform",
  });
  return (
    <ResourcesShell title={TITLE} variant="platform">
      <main className="pm-main">
        <section className="pm-hero" aria-labelledby="pm-title">
          <div className="pm-wrap pm-hero-grid">
            <div>
              <span className="pm-label">THE SHELF MERCH PLATFORM</span>
              <h1 id="pm-title">
                One platform.<em>Every branded moment.</em>
              </h1>
              <p>
                Bring recognition, company stores, swag and gifting together. Your teams run the
                program. We make, pack and deliver the experience.
              </p>
              <div className="pm-actions">
                <Link className="pm-button" to="/request-demo">
                  Book a platform demo <ArrowUpRight size={19} aria-hidden="true" />
                </Link>
                <a className="pm-link" href="#platform-programs">
                  Explore the platform <ArrowDown size={18} aria-hidden="true" />
                </a>
              </div>
              <span className="pm-hero-note">
                <Check size={17} aria-hidden="true" /> One place to plan. One partner to deliver.
              </span>
            </div>
            <img
              src="/images/platform/platform-overview-hero.webp"
              alt="A program manager and colleague bringing employee recognition, stores and welcome gifts together"
              width="1536"
              height="1024"
              fetchPriority="high"
            />
          </div>
        </section>
        <nav className="pm-program-nav" id="platform-programs" aria-label="Platform programs">
          <div className="pm-wrap">
            <a href="#recognition">
              <Heart size={22} aria-hidden="true" />
              Recognition
            </a>
            <a href="#swag">
              <Package size={22} aria-hidden="true" />
              Swag
            </a>
            <a href="#stores">
              <ShoppingBag size={22} aria-hidden="true" />
              Company stores
            </a>
            <a href="#gifting">
              <Gift size={22} aria-hidden="true" />
              Gifting
            </a>
          </div>
        </nav>
        <section className="pm-wrap pm-section pm-overview" aria-labelledby="pm-overview-title">
          <div>
            <span className="pm-label">ONE CONNECTED WAY TO WORK</span>
            <h2 id="pm-overview-title">
              Less to coordinate.<em>More to make meaningful.</em>
            </h2>
          </div>
          <p>
            Keep the audience, collection, budget and delivery in the same plan. From a single thank
            you to a company-wide program, Shelf Merch connects the software with the work that
            happens after you click send.
          </p>
        </section>
        <RecognitionPrograms />
        <section className="pm-swag" id="swag" aria-labelledby="pm-swag-title">
          <div className="pm-wrap pm-section">
            <div className="pm-heading">
              <span className="pm-label">SWAG, YOUR WAY</span>
              <h2 id="pm-swag-title">
                Start with one.<em>Grow with your program.</em>
              </h2>
              <p>
                Choose on-demand orders or planned bulk production, with the same attention to your
                brand and the finished product.
              </p>
            </div>
            <div className="pm-swag-grid">
              <article>
                <div className="pm-swag-image pm-swag-image-blue">
                  <img
                    src="/images/resources/sales/sales-brand-v2.webp"
                    alt="A premium branded merchandise collection with apparel, accessories and packaging"
                    width="1536"
                    height="1024"
                    loading="lazy"
                  />
                </div>
                <span className="pm-label">ON-DEMAND SWAG</span>
                <h3>Make what gets ordered.</h3>
                <p>
                  Give distributed teams and always-on stores a way to order the products they need,
                  with production and fulfilment handled together.
                </p>
                <Link className="pm-link" to="/apps/catalog">
                  Build your collection <ArrowUpRight size={18} aria-hidden="true" />
                </Link>
              </article>
              <article>
                <div className="pm-swag-image pm-swag-image-peach">
                  <img
                    src="/images/resources/events/events-merch.webp"
                    alt="Coordinated apparel, bags and accessories for a larger merchandise program"
                    width="1536"
                    height="1024"
                    loading="lazy"
                  />
                </div>
                <span className="pm-label">BULK MERCHANDISE</span>
                <h3>Plan the bigger moment.</h3>
                <p>
                  Coordinate merchandise for events, offices and larger groups, with approved
                  artwork, clear quantities and a production timeline.
                </p>
                <Link className="pm-link" to="/resources/events">
                  Plan event merchandise <ArrowUpRight size={18} aria-hidden="true" />
                </Link>
              </article>
            </div>
          </div>
        </section>
        <section
          className="pm-wrap pm-section pm-feature pm-store"
          id="stores"
          aria-labelledby="pm-store-title"
        >
          <div>
            <span className="pm-label">YOUR COMPANY STORE</span>
            <h2 id="pm-store-title">
              Your brand.<em>Their favourite new store.</em>
            </h2>
            <p>
              Create a private branded store for employees, new hires, partners or distributors.
              Bring your approved products, budgets and access rules into a shopping experience that
              feels like your company.
            </p>
            <ul>
              <li>
                <Check size={18} aria-hidden="true" />
                Curated products and consistent artwork
              </li>
              <li>
                <Check size={18} aria-hidden="true" />
                Recipient choice within your program rules
              </li>
              <li>
                <Check size={18} aria-hidden="true" />
                Production and fulfilment behind each order
              </li>
            </ul>
            <Link className="pm-button" to="/request-demo">
              Explore company stores <ArrowUpRight size={19} aria-hidden="true" />
            </Link>
          </div>
          <img
            src="/images/resources/hr/hr-company-store-illustration-v2.webp"
            alt="An employee choosing a gift through a branded company storefront"
            width="1536"
            height="1024"
            loading="lazy"
          />
        </section>
        <section className="pm-gifting" id="gifting" aria-labelledby="pm-gifting-title">
          <div className="pm-wrap pm-section">
            <div className="pm-heading">
              <span className="pm-label">PROSPECT AND CLIENT GIFTING</span>
              <h2 id="pm-gifting-title">
                Open the conversation.<em>Keep the connection.</em>
              </h2>
              <p>
                A considered gift can make the first touch more personal and the next milestone more
                memorable.
              </p>
            </div>
            <div className="pm-gifting-grid">
              <article>
                <span className="pm-label">PROSPECT GIFTING</span>
                <h3>A thoughtful first impression.</h3>
                <p>
                  Send a relevant gift before a meeting, after a demo or as part of an account-based
                  campaign.
                </p>
                <ul>
                  <li>
                    <Check size={18} aria-hidden="true" />
                    Gift links without address chasing
                  </li>
                  <li>
                    <Check size={18} aria-hidden="true" />
                    Recipient choice within a set budget
                  </li>
                  <li>
                    <Check size={18} aria-hidden="true" />
                    Redemption and delivery tracking
                  </li>
                </ul>
              </article>
              <article>
                <span className="pm-label">CLIENT APPRECIATION</span>
                <h3>A reason to stay in touch.</h3>
                <p>
                  Mark renewals, project wins and important relationships with premium, on-brand
                  gifting.
                </p>
                <ul>
                  <li>
                    <Check size={18} aria-hidden="true" />
                    Collections tailored to client tiers
                  </li>
                  <li>
                    <Check size={18} aria-hidden="true" />
                    One-off or recurring gifting moments
                  </li>
                  <li>
                    <Check size={18} aria-hidden="true" />
                    Personal notes and premium packaging
                  </li>
                </ul>
              </article>
            </div>
            <Link className="pm-link" to="/resources/sales">
              Explore Sales &amp; Marketing solutions <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </section>
        <section className="pm-wrap pm-section" aria-labelledby="pm-process-title">
          <div className="pm-heading">
            <span className="pm-label">FROM THE IDEA TO THE DOORSTEP</span>
            <h2 id="pm-process-title">
              A clear program.<em>A connected journey.</em>
            </h2>
          </div>
          <ol className="pm-process">
            {process.map(([title, body], index) => (
              <li key={title}>
                <span>0{index + 1}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ol>
        </section>
        <section className="pm-controls" aria-labelledby="pm-controls-title">
          <div className="pm-wrap pm-section">
            <div className="pm-heading">
              <span className="pm-label">CONTROL WITHOUT THE CHAOS</span>
              <h2 id="pm-controls-title">
                Room for your teams.<em>Guardrails for your brand.</em>
              </h2>
              <p>
                Give teams the flexibility to run their programs, with clear budgets, approved
                choices and visibility for the people managing them.
              </p>
            </div>
            <div className="pm-controls-grid">
              {controls.map(({ icon: Icon, title, body }) => (
                <article key={title}>
                  <Icon size={27} strokeWidth={1.5} aria-hidden="true" />
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
            <Link className="pm-link" to="/case-studies/zoho-people">
              See the Zoho People workflow <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </section>
        <section className="pm-wrap pm-section pm-teams" aria-labelledby="pm-teams-title">
          <div>
            <span className="pm-label">BUILT AROUND YOUR PEOPLE</span>
            <h2 id="pm-teams-title">
              Different teams.<em>One place to begin.</em>
            </h2>
          </div>
          <div className="pm-team-links">
            <Link to="/resources/human-resources">
              <Users size={24} aria-hidden="true" />
              <span>HR &amp; People</span>
              <ArrowUpRight size={21} aria-hidden="true" />
            </Link>
            <Link to="/resources/sales">
              <Gift size={24} aria-hidden="true" />
              <span>Sales &amp; Marketing</span>
              <ArrowUpRight size={21} aria-hidden="true" />
            </Link>
            <Link to="/resources/events">
              <CalendarDays size={24} aria-hidden="true" />
              <span>Events</span>
              <ArrowUpRight size={21} aria-hidden="true" />
            </Link>
          </div>
        </section>
        <section className="pm-cta" aria-labelledby="pm-cta-title">
          <div className="pm-wrap">
            <span className="pm-label">ONE PLATFORM. EVERY MOMENT.</span>
            <h2 id="pm-cta-title">
              Put your next program<em>on the shelf.</em>
            </h2>
            <p>Let’s bring your people, your brand and your next meaningful moment together.</p>
            <div className="pm-actions">
              <Link className="pm-button" to="/request-demo">
                Book a platform demo <ArrowUpRight size={19} aria-hidden="true" />
              </Link>
              <Link className="pm-link" to="/apps/catalog">
                Explore the catalog <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </ResourcesShell>
  );
}
