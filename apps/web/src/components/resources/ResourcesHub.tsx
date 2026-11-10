import { Link } from "react-router";
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  FileCheck2,
  Truck,
  UsersRound,
  Wallet,
} from "lucide-react";
import { ResourcesShell } from "./ResourcesShell";
import { ResourcesImageMarquee } from "./ResourcesImageMarquee";
import "./resources-hub.css";

const IMAGE_ROOT = "/images/resources";
const PLAYBOOKS = [
  {
    slug: "hr",
    label: "HR & People",
    icon: UsersRound,
    title: "Make every employee moment count.",
    description: "Onboarding, milestones and employee recognition.",
    cta: "Explore HR playbook",
    alt: "Custom printed welcome box with a notebook, T-shirt and bottle",
  },
  {
    slug: "sales",
    label: "Sales & Marketing",
    icon: BarChart3,
    title: "Build relationships that go further.",
    description: "Prospect gifting, client appreciation and campaigns.",
    cta: "Explore sales playbook",
    alt: "Premium branded client gift box with a mug and notebook",
  },
  {
    slug: "events",
    label: "Events",
    icon: CalendarDays,
    title: "Give your event a lasting impression.",
    description: "Conference kits, merch bars and follow-ups.",
    cta: "Explore events playbook",
    alt: "Canvas event tote, conference badge, notebook and bottle",
  },
] as const;

const FEATURES = [
  { icon: Wallet, title: "Budgets & credits", description: "Allocate by team or campaign." },
  { icon: FileCheck2, title: "Approved catalogues", description: "Keep every product on-brand." },
  { icon: BarChart3, title: "Shared reporting", description: "See spend and delivery together." },
  { icon: Truck, title: "Pan-India fulfillment", description: "Make, pack, ship and track." },
];

export default function ResourcesHub() {
  return (
    <ResourcesShell title="Resources & Team Playbooks — Shelf Merch" variant="hub">
      <main className="rh-main" id="resources-main">
        <section className="rh-hero" aria-labelledby="resources-title">
          <div className="rh-hero__copy">
            <span className="rh-eyebrow">
              <BookOpen size={16} aria-hidden="true" />
              Resources &amp; inspiration
            </span>
            <h1 id="resources-title">
              <span>Ideas that inspire.</span>
              <span>Playbooks that work.</span>
            </h1>
            <p>
              Fresh thinking and practical playbooks for better employee experiences, stronger
              client relationships and memorable events.
            </p>
            <div className="rh-hero__actions">
              <a className="rh-button" href="#by-team">
                Explore playbooks <ArrowUpRight size={17} aria-hidden="true" />
              </a>
              <Link className="rh-hero__catalog" to="/apps/catalog">
                Explore the catalog <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
            </div>
          </div>
          <img
            className="rh-hero__image"
            src={`${IMAGE_ROOT}/resources-editorial-hero-transparent.webp`}
            alt="Shelf Merch people, gifting and event playbooks alongside thoughtfully branded merchandise"
            width={1448}
            height={1086}
            fetchPriority="high"
          />
        </section>

        <ResourcesImageMarquee />

        <nav className="rh-team-nav" aria-label="Find resources by team">
          {PLAYBOOKS.map(({ slug, label, icon: Icon }) => (
            <a href={`#playbook-${slug}`} key={slug}>
              <Icon size={27} strokeWidth={1.4} aria-hidden="true" />
              <span>{label}</span>
            </a>
          ))}
        </nav>

        <section
          className="rh-playbooks rh-container"
          id="by-team"
          aria-labelledby="playbooks-title"
        >
          <div className="rh-section-heading">
            <h2 id="playbooks-title" className="rh-editorial-heading">
              <span>Practical playbooks for</span>
              <em>your team’s next big idea.</em>
            </h2>
            <p>
              <strong>
                Build stronger teams, closer client relationships and memorable events.
              </strong>
              Explore ideas for onboarding, recognition, client gifting and event
              merchandise tailored to the moments your team owns.
            </p>
          </div>
          <div className="rh-playbook-grid">
            {PLAYBOOKS.map(({ slug, label, title, description, cta, alt }, index) => (
              <article className="rh-playbook" id={`playbook-${slug}`} key={slug}>
                <Link className="rh-playbook__link" to={`/resources/${slug === "hr" ? "human-resources" : slug}`}>
                  <div className={`rh-playbook__photo rh-playbook__photo--${slug}`}>
                    <img
                      className={slug === "sales" ? "rh-playbook__image--full" : undefined}
                      src={`${IMAGE_ROOT}/${slug === "sales" ? "team-client-gift-full.webp" : "team-merchandise.webp"}`}
                      alt={alt}
                      width={slug === "sales" ? 1254 : 2172}
                      height={slug === "sales" ? 1254 : 724}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <div className="rh-playbook__copy">
                    <span className="rh-eyebrow">
                      0{index + 1} / {label}
                    </span>
                    <h3>{title}</h3>
                    <p>{description}</p>
                    <span className="rh-text-link">
                      {cta} <ArrowUpRight size={16} aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="rh-planning" aria-labelledby="planning-title">
          <div className="rh-container rh-planning__grid">
            <img
              className="rh-planning__photo"
              src={`${IMAGE_ROOT}/planning-together.webp`}
              alt="Two colleagues reviewing a notebook and a custom branded welcome kit at their desk"
              width={1365}
              height={1024}
              loading="lazy"
              decoding="async"
            />
            <div className="rh-planning__copy">
              <span className="rh-eyebrow">From ideas to action</span>
              <h2 id="planning-title" className="rh-editorial-heading">
                <span>Your next branded moment,</span>
                <em>thoughtfully planned.</em>
              </h2>
              <p>
                Bring the products, packaging and delivery together with a clear plan for your team.
              </p>
              <ol className="rh-steps">
                <li>
                  <span>01</span>Choose your audience
                </li>
                <li>
                  <span>02</span>Curate the right collection
                </li>
                <li>
                  <span>03</span>Plan the delivery
                </li>
              </ol>
              <Link className="rh-button" to="/apps/catalog">
                Explore the catalog <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <section className="rh-platform rh-container" aria-labelledby="platform-title">
          <div className="rh-platform__copy">
            <span className="rh-eyebrow">One connected platform</span>
            <h2 id="platform-title" className="rh-editorial-heading">
              <span>Different teams.</span>
              <em>One source of truth.</em>
            </h2>
            <p>Every team gets a workflow that fits. Your company keeps everything connected.</p>
          </div>
          <div className="rh-feature-grid">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div className="rh-feature" key={title}>
                <Icon size={30} strokeWidth={1.4} aria-hidden="true" />
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rh-cta" aria-labelledby="resources-cta-title">
          <div className="rh-container rh-cta__inner">
            <div>
              <span className="rh-eyebrow">
                <BookOpen size={16} aria-hidden="true" />
                Your next chapter
              </span>
              <h2 id="resources-cta-title" className="rh-editorial-heading">
                <span>Let’s build your next</span>
                <em>branded moment.</em>
              </h2>
              <p>One platform for your people, clients and events.</p>
              <Link className="rh-button" to="/request-demo">
                Book a demo <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
            </div>
            <div className="rh-cta__photo" aria-hidden="true">
              <img
                src={`${IMAGE_ROOT}/notebook-and-mug.webp`}
                alt=""
                width={1536}
                height={1024}
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </section>
      </main>
    </ResourcesShell>
  );
}
