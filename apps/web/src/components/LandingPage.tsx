import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { ArrowRight, Box, CalendarCheck, Check, CheckCircle2, Gift, Heart, Leaf, PackageCheck, Plug, Shirt, ShoppingBag, Sparkles, Store, Truck } from "lucide-react";
import { Header } from "./landing/Header";
import { Footer } from "./landing/Footer";
import { HomeDemoBanner } from "./landing/HomeDemoBanner";
import { Testimonials } from "./landing/Testimonials";
import { Quote } from "./landing/Quote";
import { TRUST_LOGOS } from "./landing/TrustBar";
import { CATALOG_ITEMS } from "./landing/catalog-data";
import { SOLUTIONS } from "./landing/solutions-data";
import "./landing-page.css";
import "./landing-typography.css";
import "./landing-home.css";

const offerings = [
  {
    icon: ShoppingBag,
    label: "COMPANY STORES",
    title: "Your brand. Their choice.",
    body: "Give employees and partners a branded place to choose products they will use and enjoy.",
    href: "/platform#stores",
    action: "Explore company stores",
    image: "/images/resources/hr/hr-company-store-illustration-v2.webp",
    alt: "An employee choosing merchandise from a company store",
  },
  {
    icon: Heart,
    label: "RECOGNITION AND MILESTONES",
    title: "Make appreciation tangible.",
    body: "Connect everyday recognition, birthdays and work anniversaries with thoughtful rewards.",
    href: "/resources/human-resources",
    action: "Explore employee programs",
    image: "/images/resources/hr/hr-recognition-illustration-v2.webp",
    alt: "Colleagues recognising each other's contributions",
  },
  {
    icon: Gift,
    label: "KITS AND GIFTING",
    title: "A moment, made personal.",
    body: "Bring welcome kits, event merchandise and client gifts together with considered packaging.",
    href: "/resources/sales",
    action: "Explore gifting",
    image: "/images/landing/gifting-kit-cobalt.webp",
    alt: "A premium corporate merchandise collection with coordinated packaging",
  },
];
const catalogIcons = [Shirt, Gift, Plug, Box, Sparkles, CalendarCheck, Gift, Store];
const offeringPills = ["Shops", "Kits", "Wallet", "Milestones", "Recognition", "Bulk Orders", "Custom Merch"];
const plan = [
  {
    icon: CheckCircle2,
    title: "No payment or commitment",
    body: "Share your requirement first. We shape the plan before anything is locked.",
  },
  {
    icon: PackageCheck,
    title: "One team from design to delivery",
    body: "Products, packaging, budgets and fulfilment stay in one clear workflow.",
  },
  {
    icon: Truck,
    title: "Pan-India delivery support",
    body: "Ship employee kits, event merch and partner gifts across locations with ease.",
  },
];
const teamArtwork: Record<string, string> = {
  Admin: "/images/resources/hr/hr-connected-illustration-v2.webp",
  "Team Leads": "/images/resources/hr/hr-recognition-illustration-v2.webp",
  Marketing: "/images/resources/sales/sales-store-v2.webp",
  Sales: "/images/resources/sales/sales-clients-v2.webp",
  "Human Resources": "/images/resources/hr/hr-hero-illustration-v2.webp",
  Events: "/images/resources/events/events-hero.webp",
};
function HomeTeams() {
  const [active, setActive] = useState(4);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const item = SOLUTIONS[active];
  function onKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % SOLUTIONS.length;
    else if (event.key === "ArrowLeft") next = (index + SOLUTIONS.length - 1) % SOLUTIONS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = SOLUTIONS.length - 1;
    else return;
    event.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  }
  const href =
    item.tab === "Events"
      ? "/resources/events"
      : ["Sales", "Marketing"].includes(item.tab)
        ? "/resources/sales"
        : "/resources/human-resources";
  return (
    <section className="lh-wrap lh-section" id="solutions" aria-labelledby="lh-teams-title">
      <div className="lh-heading">
        <span className="lh-label">BUILT AROUND YOUR TEAM</span>
        <h2 id="lh-teams-title">
          Everyone gets what they need.<em>One partner brings it together.</em>
        </h2>
        <p>
          Give every team a clear way to create branded moments, with the right controls behind the
          scenes.
        </p>
      </div>
      <div className="lh-tabs" role="tablist" aria-label="Solutions by team">
        {SOLUTIONS.map((tab, index) => (
          <button
            key={tab.tab}
            type="button"
            role="tab"
            id={`home-team-tab-${index}`}
            aria-controls="home-team-panel"
            aria-selected={active === index}
            tabIndex={active === index ? 0 : -1}
            ref={(node) => {
              refs.current[index] = node;
            }}
            onClick={() => setActive(index)}
            onKeyDown={(event) => onKey(event, index)}
          >
            {tab.tab}
          </button>
        ))}
      </div>
      <div
        className="lh-feature lh-team-panel"
        id="home-team-panel"
        role="tabpanel"
        aria-labelledby={`home-team-tab-${active}`}
        tabIndex={0}
      >
        <div>
          <span className="lh-label">FOR {item.tab.toUpperCase()}</span>
          <h3>{item.title}</h3>
          <p>{item.body}</p>
          <ul className="lh-checks">
            {item.points.map((point) => (
              <li key={point}>
                <Check size={18} aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
          <Link className="lh-button lh-button-outline" to={href}>
            Explore team solutions
          </Link>
        </div>
        <img
          src={teamArtwork[item.tab]}
          alt={`${item.tab} merchandise and gifting programs`}
          width="1536"
          height="1024"
          loading="lazy"
        />
      </div>
    </section>
  );
}

export default function LandingPage() {
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const page = pageRef.current;
    if (
      !page ||
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;

    const selector = [
      ".lh-heading",
      ".lh-split-heading",
      ".lh-catalog-heading",
      ".lh-offerings > article",
      ".lh-category",
      ".lh-feature > div",
      ".lh-feature > img",
      ".lh-moment-grid > article",
      ".testimonial-section-v2 .heading-wrapper",
      ".testimonial-section-v2 article",
      ".lh-resource-feature",
      ".lh-resource-story",
      ".lh-final > .lh-wrap",
    ].join(",");
    const elements = [...page.querySelectorAll<HTMLElement>(selector)];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-lh-reveal", "visible");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -24px 0px" },
    );

    for (const element of elements) {
      const bounds = element.getBoundingClientRect();
      // Keep anything already in view visible, including restored scroll positions.
      if (bounds.top < window.innerHeight && bounds.bottom > 0) continue;
      const siblings = [...(element.parentElement?.children ?? [])].filter((child) =>
        child.matches(selector),
      );
      const delay = (Math.max(0, siblings.indexOf(element)) % 3) * 70;
      element.style.setProperty("--lh-reveal-delay", `${delay}ms`);
      element.setAttribute("data-lh-reveal", "pending");
      observer.observe(element);
    }

    return () => {
      observer.disconnect();
      for (const element of elements) {
        element.removeAttribute("data-lh-reveal");
        element.style.removeProperty("--lh-reveal-delay");
      }
    };
  }, []);

  return (
    <div className="shelf-landing landing-home" ref={pageRef}>
      <Header />
      <main className="lh-main">
        <section className="lh-hero" id="top" aria-labelledby="lh-title">
          <div className="lh-wrap lh-hero-grid">
            <div>
              <span className="lh-label">MERCH. GIFTING. RECOGNITION.</span>
              <h1 id="lh-title">
                Every gift,<em>one shelf.</em>
              </h1>
              <p>
                Run your company's swag, onboarding kits and employee gifting from one platform,
                designed, printed and delivered anywhere in India.
              </p>
              <div className="lh-actions">
                <Link className="lh-button lh-button-white" to="/request-demo">
                  Get started
                </Link>
                <Link className="lh-button lh-button-hero-outline" to="/apps/catalog">
                  Explore the catalog
                </Link>
              </div>
              <div className="lh-hero-proof">
                <span>
                  <ShoppingBag size={22} aria-hidden="true" />
                  One connected platform
                </span>
                <span>
                  <PackageCheck size={22} aria-hidden="true" />
                  Design to delivery
                </span>
                <span>
                  <Truck size={22} aria-hidden="true" />
                  Pan-India delivery
                </span>
              </div>
            </div>
            <div className="lh-hero-visual">
              <img
                className="lh-hero-image"
                src="/images/landing/home-hero-v2.webp"
                alt="A premium cobalt corporate gift box with apparel, drinkware, a notebook and accessories"
                width="1536"
                height="1024"
                fetchPriority="high"
              />
              <img
                className="lh-hero-accent"
                src="/images/landing/corporate-gifting-accent.webp"
                alt=""
                aria-hidden="true"
                width="1440"
                height="1080"
              />
              <div className="lh-hero-details">
                <span className="lh-hero-badge">
                  Made for
                  <br />
                  your brand
                </span>
                <span className="lh-hero-tag lh-hero-tag-brand">Custom branding</span>
                <span className="lh-hero-tag lh-hero-tag-delivery">Delivered with care</span>
                <span className="lh-hero-star lh-hero-star-one" aria-hidden="true">
                  ✳
                </span>
                <span className="lh-hero-star lh-hero-star-two" aria-hidden="true">
                  ✳
                </span>
              </div>
            </div>
          </div>
        </section>
        <section className="lh-trust" aria-label="Trusted customers">
          <span className="lh-label">TRUSTED BY TEAMS AT</span>
          <div className="lh-trust-marquee">
            <div className="lh-trust-track">
              {[0, 1].map((group) => (
                <div className="lh-trust-group" key={group} aria-hidden={group === 1}>
                  {TRUST_LOGOS.map((logo) => (
                    <img src={logo.src} alt={group === 0 ? logo.alt : ""} key={logo.alt} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="lh-wrap lh-section" id="platform" aria-labelledby="lh-offerings-title">
          <div className="lh-heading">
            <span className="lh-label">EVERYTHING YOUR BRAND TOUCHES</span>
            <h2 id="lh-offerings-title">
              Thoughtful experiences. <em>One connected place.</em>
            </h2>
            <p>
              From a first-day welcome to a company-wide celebration, keep the products, people and
              delivery in the same plan.
            </p>
          </div>
          <div className="lh-offerings">
            {offerings.map(({ icon: Icon, label, title, body, href, action, image, alt }) => (
              <article key={label}>
                <div className="lh-offering-art">
                  <img src={image} alt={alt} width="1536" height="1024" loading="lazy" />
                </div>
                <span className="lh-label">
                  <Icon size={19} aria-hidden="true" />
                  {label}
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
                <Link className="lh-button lh-button-outline" to={href}>
                  {action}
                </Link>
              </article>
            ))}
          </div>
        </section>
        <section className="lh-catalog" id="catalog" aria-labelledby="lh-catalog-title">
          <div className="lh-wrap lh-section">
            <div className="lh-catalog-heading">
              <span className="lh-label">SOMETHING FOR EVERYONE</span>
              <h2 id="lh-catalog-title">
                One catalog <em>for every occasion</em>
              </h2>
              <Link className="lh-catalog-link" to="/apps/catalog">
                View full catalog <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
            <div className="lh-catalog-grid">
              {CATALOG_ITEMS.map((item, index) => {
                const Icon = catalogIcons[index];
                return (
                <Link
                  to={item.to.replace(/^\/app\/catalog/, "/apps/catalog")}
                  className={`lh-category${[0, 1, 6].includes(index) ? " lh-category-light" : ""}`}
                  key={item.count}
                >
                  <div>
                    <span className="lh-category-number" aria-hidden="true">{item.count}</span>
                    <Icon className="lh-category-icon" size={22} aria-hidden="true" />
                    <img
                      src={item.image}
                      alt={item.imageAlt ?? item.title}
                      loading="lazy"
                      width="400"
                      height="400"
                    />
                    <span className="lh-category-name">{item.title}</span>
                    <span className="lh-category-arrow" aria-hidden="true"><ArrowRight size={14} /></span>
                  </div>
                </Link>
                );
              })}
            </div>
          </div>
        </section>
        <section className="lh-wrap lh-section lh-feature" aria-labelledby="lh-platform-title">
          <div>
            <span className="lh-label">THE PLATFORM BEHIND THE MOMENT</span>
            <h2 id="lh-platform-title">
              Less coordinating.<em>More making it happen.</em>
            </h2>
            <p>
              Bring company stores, employee recognition and gifting programs together. Give your
              teams room to move, with clear budgets and approved choices.
            </p>
            <ul className="lh-checks">
              <li>
                <Check size={18} aria-hidden="true" />
                Branded stores and curated collections
              </li>
              <li>
                <Check size={18} aria-hidden="true" />
                Budgets, approvals and reporting
              </li>
              <li>
                <Check size={18} aria-hidden="true" />
                Connected ordering and fulfilment
              </li>
            </ul>
            <Link className="lh-button" to="/platform">
              Explore the platform
            </Link>
          </div>
          <div className="lh-platform-art">
            <img
              src="/images/platform/platform-overview-hero.webp"
              alt="Recognition, milestones and company stores coordinated through one platform"
              width="1536"
              height="1024"
              loading="lazy"
            />
          </div>
        </section>
        <div className="lh-team-band">
          <HomeTeams />
        </div>
        <section className="lh-offerings-intro" aria-labelledby="lh-offerings-intro-title">
          <div className="lh-wrap lh-heading">
            <span className="lh-label">OUR OFFERINGS</span>
            <h2 id="lh-offerings-intro-title">
              Everything your brand touches,<em>in one place.</em>
            </h2>
            <p>
              From your first employee's welcome kit to your thousandth client gift, keep every
              branded item consistent, on-budget and on time.
            </p>
          </div>
          <div className="lh-offerings-marquee">
            <div className="lh-offerings-track">
              {[0, 1, 2, 3].map((group) => (
                <div className="lh-offerings-group" key={group} aria-hidden={group !== 0}>
                  {offeringPills.map((label, index) => (
                    <span className={`lh-offering-pill lh-offering-pill-${index}`} key={label}>
                      {label}<ArrowRight size={18} aria-hidden="true" />
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>
        <section
          className="lh-production"
          id="production"
          aria-labelledby="lh-production-title"
        >
          <div className="lh-production-image">
            <img
              src="/images/landing/production.png"
              alt="Embroidery equipment producing branded apparel"
              width="1376"
              height="1168"
              loading="lazy"
            />
            <span><Sparkles size={14} aria-hidden="true" /> MADE BY US</span>
          </div>
          <div className="lh-production-copy">
            <span className="lh-label">THE ONLY MERCH PARTNER YOU NEED</span>
            <h2 id="lh-production-title">
              From design file<br />to doorstep<em>we make it ourselves.</em>
            </h2>
            <p>
              Most platforms resell someone else's catalog. We print, embroider and pack in-house,
              so quality, timelines and pricing stay in our control.
            </p>
            <div className="lh-capabilities">
              <span><Shirt aria-hidden="true" /> In-house DTF printing</span>
              <span><Sparkles aria-hidden="true" /> Tajima embroidery</span>
              <span><PackageCheck aria-hidden="true" /> ANT blank apparel</span>
              <span><Truck aria-hidden="true" /> Pan-India fulfilment</span>
              <span><Leaf aria-hidden="true" /> Sustainable materials</span>
              <span><Store aria-hidden="true" /> 500+ catalog items</span>
            </div>
            <Link className="lh-button lh-button-white" to="/about#our-model">
              Meet your merch partner
            </Link>
          </div>
        </section>
        <section className="lh-recognition" id="recognition" aria-labelledby="lh-recognition-title">
          <div className="lh-wrap lh-section lh-feature">
            <div>
              <span className="lh-label">RECOGNITION, BUILT IN</span>
              <h2 id="lh-recognition-title">
                Celebrate the moments<em>that move teams.</em>
              </h2>
              <p>
                Make appreciation visible through everyday kudos and thoughtful milestone gifts.
                Bring rewards, recipient choice and reporting into one employee experience.
              </p>
              <ul className="lh-checks">
                <li>
                  <Check size={18} aria-hidden="true" />
                  One-off appreciation and recurring occasions
                </li>
                <li>
                  <Check size={18} aria-hidden="true" />
                  Spend, redemption and engagement visibility
                </li>
                <li>
                  <Check size={18} aria-hidden="true" />
                  Employee data and HR workflows
                </li>
              </ul>
              <Link className="lh-button" to="/resources/human-resources">
                Explore recognition
              </Link>
            </div>
            <img
              src="/images/resources/hr/hr-engagement-illustration-v2.webp"
              alt="Employee milestones connecting thoughtful gifts with individual recipients"
              width="1536"
              height="1024"
              loading="lazy"
            />
          </div>
        </section>
        <section className="lh-wrap lh-section" aria-labelledby="lh-moments-title">
          <div className="lh-heading">
            <span className="lh-label">EVERY OCCASION, CONSIDERED</span>
            <h2 id="lh-moments-title">
              Big milestones.<em>Everyday connections.</em>
            </h2>
            <p>Make every welcome, thank you and gathering feel personal.</p>
          </div>
          <div className="lh-moment-grid">
            <article>
              <img
                className="lh-moment-art"
                src="/images/resources/hr/hr-onboarding-illustration-v2.webp"
                alt="Colleagues welcoming a new team member with a gift"
                width="1536"
                height="1024"
                loading="lazy"
              />
              <div className="lh-moment-copy">
                <span className="lh-label">FOR YOUR PEOPLE</span>
                <h3>Belonging starts here.</h3>
                <p>Welcome kits and thoughtful rewards for your team's milestones.</p>
                <Link className="lh-button lh-button-outline" to="/resources/human-resources">
                  Explore employee gifting
                </Link>
              </div>
            </article>
            <article>
              <img
                className="lh-moment-art"
                src="/images/resources/sales/sales-clients-v2.webp"
                alt="A client receiving a thoughtful gift during a call"
                width="1536"
                height="1024"
                loading="lazy"
              />
              <div className="lh-moment-copy">
                <span className="lh-label">FOR YOUR RELATIONSHIPS</span>
                <h3>Stay close. Stand out.</h3>
                <p>Personal gifts for new connections, loyal clients and valued partners.</p>
                <Link className="lh-button lh-button-outline" to="/resources/sales">
                  Explore client gifting
                </Link>
              </div>
            </article>
            <article>
              <img
                className="lh-moment-art"
                src="/images/resources/events/events-gifting.webp"
                alt="An event attendee redeeming a branded gift on their phone"
                width="1536"
                height="1024"
                loading="lazy"
              />
              <div className="lh-moment-copy">
                <span className="lh-label">FOR YOUR NEXT EVENT</span>
                <h3>Make the moment last.</h3>
                <p>Branded essentials for conferences, offsites and shared experiences.</p>
                <Link className="lh-button lh-button-outline" to="/resources/events">
                  Explore event merchandise
                </Link>
              </div>
            </article>
          </div>
        </section>
        <Quote />
        <section className="lh-plan" id="contact" aria-labelledby="lh-plan-title">
          <div className="lh-wrap lh-section">
            <div className="lh-heading">
              <span className="lh-label">MERCH PLANNING</span>
              <h2 id="lh-plan-title">
                Tell us what you need.<em>We'll build the merch plan.</em>
              </h2>
            </div>
            <div className="lh-feature">
              <div className="lh-plan-copy">
                {plan.map(({ icon: Icon, title, body }) => (
                  <article key={title}>
                    <Icon size={25} aria-hidden="true" />
                    <div>
                      <h3>{title}</h3>
                      <p>{body}</p>
                    </div>
                  </article>
                ))}
                <Link className="lh-button" to="/request-demo">
                  Book a demo
                </Link>
              </div>
              <img
                src="/images/landing/merch-plan/merch-flatlay-transparent.png"
                alt="Blue and pink merchandise including a tote, cap, notebook, drinkware and pen"
                width="1376"
                height="1168"
                loading="lazy"
              />
            </div>
          </div>
        </section>
        <Testimonials />
        <section className="lh-wrap lh-section" aria-labelledby="lh-resources-title">
          <div className="lh-split-heading">
            <div>
              <span className="lh-label">IDEAS FOR YOUR NEXT PROGRAM</span>
              <h2 id="lh-resources-title">
                A little inspiration. <em>A clear next step.</em>
              </h2>
            </div>
            <Link className="lh-button lh-button-outline" to="/resources">
              Browse all resources
            </Link>
          </div>
          <div className="lh-resource-editorial">
            <article className="lh-resource-feature">
              <div className="lh-resource-feature-art">
                <img
                  src="/images/resources/zoho/zoho-onboarding-hero.webp"
                  alt="An illustrated employee welcome connected to an onboarding workflow"
                  width="1536"
                  height="1024"
                  loading="lazy"
                />
                <span className="lh-resource-feature-caption">A CONNECTED WELCOME</span>
              </div>
              <div className="lh-resource-feature-copy">
                <span className="lh-label">WORKFLOW GUIDE</span>
                <h3>Connect your people data with their welcome.</h3>
                <p>An example onboarding workflow with Zoho People and Shelf Merch.</p>
                <Link className="lh-button" to="/case-studies/zoho-people">
                  Explore the workflow
                </Link>
              </div>
            </article>
            <div className="lh-resource-stories">
              <article className="lh-resource-story">
                <img
                  src="/images/landing/resource-planning-desk.webp"
                  alt="Gift packaging sketches with fabric and color samples on a planning desk"
                  width="800"
                  height="800"
                  loading="lazy"
                />
                <div>
                  <span className="lh-label">BLOG AND GUIDES</span>
                  <h3>Fresh thinking for thoughtful programs.</h3>
                  <p>Practical ideas for your next employee, client or event program.</p>
                  <a className="lh-resource-text-link" href="/blog">
                    Visit Blog &amp; guides
                  </a>
                </div>
              </article>
              <article className="lh-resource-story">
                <img
                  src="/images/landing/resource-careful-packing.webp"
                  alt="Hands carefully arranging a shirt, notebook and bottle in a gift box"
                  width="800"
                  height="800"
                  loading="lazy"
                />
                <div>
                  <span className="lh-label">BEHIND THE SHELF</span>
                  <h3>Meet the team bringing it all together.</h3>
                  <p>From your first brief to the final delivery. Get to know our team.</p>
                  <Link className="lh-resource-text-link" to="/about">
                    Get to know Shelf Merch
                  </Link>
                </div>
              </article>
            </div>
          </div>
        </section>
        <section className="lh-final" aria-labelledby="lh-final-title">
          <div className="lh-wrap">
            <span className="lh-label">ONE PARTNER. EVERY MOMENT.</span>
            <h2 id="lh-final-title">
              Your next branded moment<em>belongs on the shelf.</em>
            </h2>
            <p>
              From a first idea to a delivered gift, let's build something people will be happy to
              keep.
            </p>
            <Link className="lh-button lh-button-white" to="/request-demo">
              Let's plan your next moment
            </Link>
          </div>
        </section>
      </main>
      <Footer />
      <HomeDemoBanner pageRef={pageRef} />
    </div>
  );
}
