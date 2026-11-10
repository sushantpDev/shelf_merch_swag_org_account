import { ArrowRight, ArrowUpRight, Check, Gift, Package, Video } from "lucide-react";
import { Link } from "react-router";
import { ResourcesShell } from "./ResourcesShell";
import { TEAMS } from "./resources-data";
import "./resources-events.css";

const ART = "/images/resources/events";
const benefits = [
  {
    id: "event-merch",
    label: "MADE FOR YOUR EVENT",
    title: "Merch they take home. A brand they remember.",
    body: "Bring your event identity to products people will keep using. Curate apparel, everyday essentials and premium keepsakes, with coordinated artwork and packaging.",
    points: [
      "Approved products, samples and artwork",
      "Custom printing, embroidery and event kits",
    ],
    image: "events-merch",
    alt: "A coordinated event collection of apparel, bags, drinkware and a lanyard",
  },
  {
    id: "event-gifting",
    label: "BEFORE AND AFTER",
    title: "Start the connection before the doors open.",
    body: "Welcome speakers and attendees with a thoughtful pre-event gift, then follow up with a personal thank you. Let recipients choose their item and share delivery details through a gift link.",
    points: [
      "Speaker, attendee and VIP collections",
      "Personal gift links and branded thank-you notes",
    ],
    image: "events-gifting",
    alt: "An attendee claiming a thoughtful event gift on her phone",
  },
  {
    id: "event-delivery",
    label: "FROM PACKING TO ARRIVAL",
    title: "Every kit ready for its big day.",
    body: "Keep production, packing and distribution with one partner. Plan deliveries to a venue, office, hotel or individual attendee, with clear quantities and timelines for each destination.",
    points: [
      "Kitting, storage and multi-location shipping",
      "Order and delivery tracking in one place",
    ],
    image: "events-logistics",
    alt: "A fulfilment coordinator preparing event parcels at a packing bench",
  },
  {
    id: "event-virtual",
    label: "TOGETHER, WHEREVER THEY ARE",
    title: "Make a shared moment travel further.",
    body: "Give remote attendees something tangible to share. Coordinate merchandise and welcome kits for webinars, virtual conferences and team offsites, so everyone feels included wherever they join.",
    points: ["Kits for virtual and hybrid audiences", "Individual delivery before your event date"],
    image: "events-virtual",
    alt: "A virtual event host connecting with colleagues who have received event gifts",
  },
] as const;
const extras = [
  {
    title: "A merch bar with real choice",
    body: "Create a curated selection for attendees to choose their preferred size and style at your event.",
    href: "#event-merch",
    icon: Gift,
  },
  {
    title: "Your brand, carried through",
    body: "Keep products, artwork, packaging and personal notes consistent across every touchpoint.",
    href: "/apps/catalog",
    icon: Package,
  },
  {
    title: "A follow-up worth opening",
    body: "Keep the conversation going with a considered thank you after the last session ends.",
    href: "#event-gifting",
    icon: ArrowRight,
  },
] as const;

export function ResourcesEventsPage() {
  return (
    <ResourcesShell title="Shelf Merch for Events" variant="events">
      <main className="events-main">
        <section className="events-hero" aria-labelledby="events-title">
          <svg
            className="events-backdrop"
            viewBox="0 0 1440 640"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M880 0H1440V640H1190C1088 601 1177 504 1044 446C898 384 1061 279 891 239C751 206 764 66 880 0Z" />
            <path d="M0 420C92 382 83 525 177 557C254 583 329 548 394 640H0Z" />
          </svg>
          <div className="events-wrap events-hero-grid">
            <div>
              <span className="events-label">SHELF MERCH FOR EVENT TEAMS</span>
              <h1 id="events-title">
                Bring people together.<em>Leave a lasting impression.</em>
              </h1>
              <p>
                From the first invitation to the final thank you, bring your event to life with
                thoughtful merchandise, attendee gifting and seamless fulfilment.
              </p>
              <div className="events-actions">
                <Link className="events-button" to="/request-demo">
                  Plan your next event <ArrowUpRight size={19} aria-hidden="true" />
                </Link>
                <a className="events-text-link" href="#event-benefits">
                  Explore the possibilities <ArrowRight size={18} aria-hidden="true" />
                </a>
              </div>
              <span className="events-proof">
                <Check size={17} aria-hidden="true" /> One brief. Every kit, venue and attendee.
              </span>
            </div>
            <img
              src={`${ART}/events-hero.webp`}
              alt="Attendees connecting at a conference welcome counter and through a virtual event"
              width="1536"
              height="1024"
              fetchPriority="high"
            />
          </div>
        </section>
        <nav className="events-nav" aria-label="Event merchandise programs">
          <div className="events-wrap">
            <a href="#event-merch">
              <Gift aria-hidden="true" size={24} /> Conference merchandise
            </a>
            <a href="#event-delivery">
              <Package aria-hidden="true" size={24} /> Kits and fulfilment
            </a>
            <a href="#event-virtual">
              <Video aria-hidden="true" size={24} /> Virtual and hybrid events
            </a>
          </div>
        </nav>
        <section
          className="events-wrap events-section"
          id="event-benefits"
          aria-labelledby="events-benefits-title"
        >
          <div className="events-heading">
            <span className="events-label">EVERY DETAIL, PART OF THE EXPERIENCE</span>
            <h2 id="events-benefits-title">
              More than event merchandise.<em>A reason to connect.</em>
            </h2>
            <p>
              Build anticipation, create energy in the room and give attendees something meaningful
              to take away.
            </p>
          </div>
          {benefits.map((item, index) => (
            <article
              id={item.id}
              className={`events-benefit${index % 2 ? " events-benefit-reverse" : ""}`}
              key={item.id}
            >
              <div>
                <span className="events-label">
                  0{index + 1} / {item.label}
                </span>
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
              </div>
              <img
                src={`${ART}/${item.image}.webp`}
                alt={item.alt}
                width="1536"
                height="1024"
                loading="lazy"
              />
            </article>
          ))}
        </section>
        <section className="events-workflow" aria-labelledby="events-workflow-title">
          <div className="events-wrap">
            <div className="events-heading">
              <span className="events-label">YOUR DATE. ONE COORDINATED PLAN.</span>
              <h2 id="events-workflow-title">
                Big-event energy.<em>One calm workflow.</em>
              </h2>
              <p>
                Bring the brief, the deadline and the audience. We help bring the pieces together.
              </p>
            </div>
            <div className="events-steps">
              {TEAMS.events.steps.map((step, index) => (
                <article key={step[1]}>
                  <span>0{index + 1}</span>
                  <h3>{step[1]}</h3>
                  <p>{step[2]}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="events-wrap events-section" aria-labelledby="events-extras-title">
          <div className="events-heading">
            <h2 id="events-extras-title">
              Make the experience<em>feel like your brand.</em>
            </h2>
            <p>A few thoughtful details can make the whole event feel more connected.</p>
          </div>
          <div className="events-extras">
            {extras.map(({ title, body, href, icon: Icon }) => (
              <article key={title}>
                <Icon size={28} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{body}</p>
                {href.startsWith("#") ? (
                  <a href={href}>
                    Explore this idea <ArrowUpRight size={18} aria-hidden="true" />
                  </a>
                ) : (
                  <Link to={href}>
                    Explore the catalog <ArrowUpRight size={18} aria-hidden="true" />
                  </Link>
                )}
              </article>
            ))}
          </div>
        </section>
        <section className="events-cta" aria-labelledby="events-cta-title">
          <div className="events-wrap">
            <span className="events-label">LET’S MAKE IT MEMORABLE</span>
            <h2 id="events-cta-title">
              Your next event,<em>thoughtfully brought together.</em>
            </h2>
            <p>
              Tell us what you’re planning. We’ll help shape the products, packaging and delivery
              around your audience.
            </p>
            <Link className="events-button" to="/request-demo">
              Talk to our event team <ArrowUpRight size={19} aria-hidden="true" />
            </Link>
          </div>
        </section>
        <div className="events-wrap events-related">
          <Link to="/resources">← All resources</Link>
          <div>
            <Link to="/resources/human-resources">
              HR &amp; People <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
            <Link to="/resources/sales">
              Sales &amp; Marketing <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </main>
    </ResourcesShell>
  );
}
