import { useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  Heart,
  MapPin,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router";
import { ResourcesShell } from "../../components/resources/ResourcesShell";
import { useDocsMeta } from "../docs/useDocsMeta";
import "./about-page.css";

const TITLE = "About Shelf Merch | Built to Make Brand Moments Real";
const team = [
  { name: "Balaji", image: "balaji.png" },
  { name: "Chandru", image: "chandru.png" },
  { name: "Mouaz", image: "mouaz.png" },
  { name: "Srini", image: "srini.png" },
] as const;
const engines = [
  {
    id: "software",
    label: "THE PLATFORM",
    tab: "Software",
    title: "A clear view of every program.",
    body: "Bring branded stores, catalogues, budgets, campaigns, approvals and orders together. Give each team a way to run its program while keeping everyone aligned.",
    image: "model-software.png",
    alt: "Software tools for coordinating merchandise programs",
    points: ["Company stores and curated catalogues", "Budgets, approvals and reporting"],
    href: "/platform",
    link: "Explore the platform",
  },
  {
    id: "production",
    label: "THE CRAFT",
    tab: "Production",
    title: "Made with care. Checked with purpose.",
    body: "Keep printing, embroidery, personalisation and quality checks close to the people responsible for the finished product. Carry your brand through every detail, from artwork to packaging.",
    image: "model-production1.png",
    alt: "Embroidery machinery working on branded apparel",
    points: ["Printing, embroidery and personalisation", "Artwork checks and branded packaging"],
    href: "/apps/catalog",
    link: "Discover our products",
  },
  {
    id: "fulfilment",
    label: "THE DELIVERY",
    tab: "Fulfilment",
    title: "One office. Hundreds of doorsteps.",
    body: "Bring kitting, labelling, dispatch and tracking into the same plan. We coordinate the final steps around your audience and the moment you are creating, across India.",
    image: "model-fulfillment.png",
    alt: "Parcels prepared for merchandise fulfilment",
    points: ["Kitting, packing and distribution", "Delivery to offices, venues and recipients"],
    href: "/resources/events",
    link: "See event solutions",
  },
] as const;
const story = [
  {
    label: "2023 / HYDERABAD",
    title: "It started with something people could hold.",
    body: "Shelf Merch began as a Merchandise-as-a-Service platform, helping creators and brands design, sell and deliver products without carrying inventory or funding production upfront.",
  },
  {
    label: "A WIDER NEED",
    title: "The same challenge lived inside companies.",
    body: "HR, marketing and admin teams were coordinating vendors for onboarding, events, gifting and recognition. We brought those workflows into one company-controlled platform.",
  },
  {
    label: "THE SHELF TODAY",
    title: "The whole journey, brought together.",
    body: "Today, branded stores, budgets and campaigns connect with production, kitting, packaging and fulfilment. The goal remains simple: take responsibility for the experience from idea to doorstep.",
  },
];
const principles = [
  {
    icon: Heart,
    title: "People before products",
    body: "Start with what someone will be happy to receive, use and keep.",
  },
  {
    icon: ShieldCheck,
    title: "Own the outcome",
    body: "Stay accountable to the brief through production, packing and delivery.",
  },
  {
    icon: Sparkles,
    title: "Speed with standards",
    body: "Keep quality at the centre, even when the timeline is tight.",
  },
  {
    icon: Check,
    title: "Choice over waste",
    body: "Use recipient choice and on-demand production to help teams buy thoughtfully.",
  },
];

const briefs = [
  {
    label: "THOUGHTFUL MATERIALS",
    title: "Google India",
    body: "Eco-friendly apparel made using recycled plastic bottles and leftover fabric cuttings.",
  },
  {
    label: "A TIGHT EVENT TIMELINE",
    title: "Datadog",
    body: "Artwork, production and handoff coordinated together for an event requirement with only hours to work.",
  },
  {
    label: "A CONSIDERED EXPERIENCE",
    title: "DataForce by TransPerfect UK",
    body: "An Ayurvedic event kit, curated, packed as one experience and delivered on time.",
  },
];

function AboutModel() {
  const [active, setActive] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const item = engines[active];
  function onKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % engines.length;
    else if (event.key === "ArrowLeft") next = (index + engines.length - 1) % engines.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = engines.length - 1;
    else return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  }
  return (
    <section className="ab-model" id="our-model" aria-labelledby="ab-model-title">
      <div className="ab-wrap">
        <div className="ab-model-heading">
          <div>
            <span className="ab-label">HOW THE SHELF WORKS</span>
            <h2 id="ab-model-title">
              From a good idea<em>to their doorstep.</em>
            </h2>
          </div>
          <p>
            One team connects the platform, the craft and the delivery. Explore the three parts that
            bring your program together.
          </p>
        </div>
        <div className="ab-model-tabs" role="tablist" aria-label="How Shelf Merch works">
          {engines.map((engine, index) => (
            <button
              key={engine.id}
              type="button"
              role="tab"
              id={`ab-model-tab-${engine.id}`}
              aria-controls="ab-model-panel"
              aria-selected={active === index}
              tabIndex={active === index ? 0 : -1}
              ref={(node) => {
                tabs.current[index] = node;
              }}
              onClick={() => setActive(index)}
              onKeyDown={(event) => onKey(event, index)}
            >
              <span className="ab-tab-number">0{index + 1}</span>
              <span>
                <strong>{engine.tab}</strong>
                <small>{["Plan your program", "Make it yours", "Deliver the moment"][index]}</small>
              </span>
              <ArrowUpRight size={20} aria-hidden="true" />
            </button>
          ))}
        </div>
        <div
          className={`ab-model-panel ab-model-panel-${item.id}`}
          id="ab-model-panel"
          role="tabpanel"
          aria-labelledby={`ab-model-tab-${item.id}`}
          tabIndex={0}
        >
          <div className="ab-model-copy">
            <span className="ab-label">{item.label}</span>
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
            <Link className="ab-button" to={item.href}>
              {item.link}
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <div className="ab-model-art">
            <img
              src={`/images/about/${item.image}`}
              alt={item.alt}
              width="1376"
              height="1168"
              loading="lazy"
            />
            <span className="ab-model-art-label">
              {item.tab} <span aria-hidden="true">/</span> Shelf Merch
            </span>
          </div>
        </div>
        <div className="ab-model-foot">
          <span>
            <Check size={17} aria-hidden="true" /> One coordinated program
          </span>
          <span>
            <Check size={17} aria-hidden="true" /> Consistent branding
          </span>
          <span>
            <Check size={17} aria-hidden="true" /> Care through delivery
          </span>
        </div>
      </div>
    </section>
  );
}

export function AboutPage() {
  useDocsMeta({
    title: TITLE,
    description:
      "Meet Shelf Merch: an operator-built merchandise platform combining software, in-house production and pan-India fulfilment.",
    canonicalPath: "/about",
  });
  return (
    <ResourcesShell title={TITLE} variant="about">
      <main className="ab-main">
        <section className="ab-hero" aria-labelledby="ab-title">
          <div className="ab-wrap ab-hero-grid">
            <div>
              <span className="ab-label">THIS IS SHELF MERCH</span>
              <h1 id="ab-title">
                Good ideas deserve<em>to become real.</em>
              </h1>
              <p>
                We bring software, merchandise production and fulfilment together, so your next
                brand moment feels thoughtful from the first idea to the final delivery.
              </p>
              <div className="ab-actions">
                <a className="ab-button" href="#our-model">
                  Meet the Shelf <ArrowDown size={18} aria-hidden="true" />
                </a>
                <a className="ab-link" href="#our-story">
                  Read our story <ArrowRight size={18} aria-hidden="true" />
                </a>
              </div>
              <span className="ab-origin">
                <MapPin size={18} aria-hidden="true" /> Built in Hyderabad. Made for modern teams.
              </span>
            </div>
            <div className="ab-hero-art">
              <span className="ab-hero-circle" aria-hidden="true" />
              <img
                src="/images/shelf-merch-hero.png"
                alt="A coordinated corporate gift kit with a notebook, bottle and pen in a yellow presentation box"
                width="1376"
                height="1168"
                fetchPriority="high"
              />
            </div>
          </div>
          <div className="ab-wrap ab-hero-foot">
            <span>MERCH. GIFTING. RECOGNITION.</span>
            <span>One partner, from idea to doorstep.</span>
          </div>
        </section>
        <section className="ab-wrap ab-purpose" aria-labelledby="ab-purpose-title">
          <div>
            <span className="ab-label">WHY WE EXIST</span>
            <h2 id="ab-purpose-title">
              Merch should feel personal.<em>Running it should feel simple.</em>
            </h2>
          </div>
          <div>
            <p>
              A thoughtful gift can welcome a teammate, celebrate a milestone or start a
              conversation. Getting it there should not mean chasing quotations, artwork, sizes and
              delivery spreadsheets.
            </p>
            <p>
              We built Shelf Merch to connect those moving parts, while keeping the craft and human
              attention that make the finished experience matter.
            </p>
          </div>
        </section>
        <AboutModel />
        <section className="ab-wrap ab-story" id="our-story" aria-labelledby="ab-story-title">
          <div className="ab-story-intro">
            <span className="ab-label">OUR STORY</span>
            <h2 id="ab-story-title">
              Built around the work.<em>And the people behind it.</em>
            </h2>
            <p>
              We started by taking responsibility for the merchandise journey. That idea still
              shapes what we build.
            </p>
            <span className="ab-story-location">
              <MapPin size={20} aria-hidden="true" /> Hyderabad, India
            </span>
          </div>
          <ol className="ab-timeline">
            {story.map((item) => (
              <li key={item.label}>
                <span className="ab-label">{item.label}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </li>
            ))}
          </ol>
        </section>
        <section className="ab-wrap ab-team" aria-labelledby="ab-team-title">
          <div className="ab-heading">
            <span className="ab-label">MEET THE TEAM</span>
            <h2 id="ab-team-title">
              The people behind<em>your next brand moment.</em>
            </h2>
            <p>Meet the team bringing the Shelf Merch vision to life.</p>
          </div>
          <div className="ab-team-grid">
            {team.map((member) => (
              <article key={member.name}>
                <img
                  src={`/images/about/team/${member.image}`}
                  alt={`${member.name}, Shelf Merch team`}
                  loading="lazy"
                  width="410"
                  height="410"
                />
                <h3>{member.name}</h3>
              </article>
            ))}
          </div>
        </section>
        <section className="ab-wrap ab-briefs" aria-labelledby="ab-briefs-title">
          <div className="ab-heading">
            <span className="ab-label">FROM THE BRIEF TO THE FINISHED MOMENT</span>
            <h2 id="ab-briefs-title">
              Different needs.<em>The same care in delivery.</em>
            </h2>
            <p>A few of the briefs that have shaped how we work.</p>
          </div>
          <div className="ab-brief-grid">
            {briefs.map((item) => (
              <article key={item.title}>
                <span className="ab-label">{item.label}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="ab-principles" aria-labelledby="ab-principles-title">
          <div className="ab-wrap">
            <div className="ab-heading">
              <span className="ab-label">HOW WE WORK</span>
              <h2 id="ab-principles-title">
                Thoughtful in the details.<em>Accountable for the whole.</em>
              </h2>
            </div>
            <div className="ab-principle-grid">
              {principles.map(({ icon: Icon, title, body }) => (
                <article key={title}>
                  <Icon size={28} strokeWidth={1.5} aria-hidden="true" />
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="ab-wrap ab-belief" aria-label="Our belief">
          <span className="ab-label">WHAT WE BELIEVE</span>
          <blockquote>
            A brand is also what people<em>open, wear, keep and remember.</em>
          </blockquote>
          <p>That is the part we help make real.</p>
        </section>
        <section className="ab-wrap ab-next" aria-labelledby="ab-next-title">
          <div>
            <span className="ab-label">LET’S BUILD SOMETHING PEOPLE KEEP</span>
            <h2 id="ab-next-title">
              Your next brand moment,<em>thoughtfully made.</em>
            </h2>
            <p>
              Tell us about the people and the occasion. We’ll help shape the merchandise, the
              program and the delivery around them.
            </p>
            <div className="ab-actions">
              <Link className="ab-button" to="/request-demo">
                Meet Shelf Merch <ArrowUpRight size={19} aria-hidden="true" />
              </Link>
              <Link className="ab-link" to="/resources">
                Explore our resources <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
          <div className="ab-next-art" aria-hidden="true">
            <span>THE IDEA.</span>
            <span>THE CRAFT.</span>
            <em>The moment.</em>
          </div>
        </section>
      </main>
    </ResourcesShell>
  );
}
