import { ArrowUpRight, CalendarDays, Check, Gift, Heart, Plus, Users } from "lucide-react";
import { Link } from "react-router";
import { ResourcesShell } from "./ResourcesShell";
import { TEAMS } from "./resources-data";
import { HrBenefits } from "./HrBenefits";
import "./resources-hr.css";

const ART = "/images/resources/hr";
const controlDescriptions = [
  "Allocate credits by department or cost centre, with clear limits for each employee program.",
  "Keep your gifting consistent with a curated selection of products and approved branding.",
  "Connect employee information to the moments you want to celebrate, from joining dates to anniversaries.",
  "See what employees redeem and keep your program reporting together in one place.",
];

export function ResourcesHrPage() {
  const hr = TEAMS.hr;
  return (
    <ResourcesShell title="Shelf Merch for Human Resources" variant="hr">
      <main className="hr-page">
        <section className="hr-hero" aria-labelledby="hr-title">
          <svg
            className="hr-hero__backdrop"
            viewBox="0 0 1440 620"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M820 0H1440V620H940C870 540 1005 424 898 324C800 234 661 250 694 116C703 72 753 19 820 0Z" />
            <path d="M0 362C64 381 13 493 82 544C123 575 180 571 220 620H0Z" />
            <path
              className="hr-hero__spark"
              d="M1040 42l5 15 15 5-15 5-5 15-5-15-15-5 15-5zM1350 140l3 10 10 3-10 3-3 10-3-10-10-3 10-3z"
            />
          </svg>
          <img
            className="hr-hero__companion"
            src={`${ART}/hr-cat-and-plant.webp`}
            alt=""
            aria-hidden="true"
            width="1024"
            height="1024"
          />
          <div className="hr-wrap hr-hero__grid">
            <div className="hr-hero__copy">
              <p className="hr-eyebrow">
                <span /> SHELF MERCH FOR HUMAN RESOURCE TEAMS
              </p>
              <h1 id="hr-title">
                Build a culture
                <br />
                <em>
                  people want
                  <br />
                  to stay for.
                </em>
              </h1>
              <p className="hr-hero__intro">
                Bring onboarding, milestones, recognition and employee gifting into one HR-friendly
                platform, without adding another operational burden.
              </p>
              <div className="hr-actions">
                <Link className="hr-button" to="/request-demo">
                  {hr.cta}
                  <ArrowUpRight size={18} aria-hidden="true" />
                </Link>
                <a href="#hr-programs" className="hr-underlink">
                  Explore the use cases <span aria-hidden="true">↓</span>
                </a>
              </div>
              <p className="hr-hero__footnote">
                <Check size={15} aria-hidden="true" /> One employee journey. Every branded moment.
              </p>
            </div>
            <div className="hr-hero__visual">
              <img
                className="hr-hero__illustration"
                src={`${ART}/hr-hero-illustration-v2.webp`}
                alt="An HR professional at a desk with employee recognition cards and thoughtful branded gifts"
                width="1536"
                height="1024"
                fetchPriority="high"
              />
            </div>
          </div>
        </section>

        <nav className="hr-journey" aria-label="Employee programs">
          <div className="hr-wrap">
            <p>
              FOR EVERY CHAPTER
              <br />
              <strong>of the employee journey.</strong>
            </p>
            <a href="#hr-onboarding">
              <Gift aria-hidden="true" size={22} /> A great first day{" "}
              <ArrowUpRight aria-hidden="true" size={16} />
            </a>
            <a href="#hr-milestones">
              <CalendarDays aria-hidden="true" size={22} /> Moments that matter{" "}
              <ArrowUpRight aria-hidden="true" size={16} />
            </a>
            <a href="#hr-recognition">
              <Heart aria-hidden="true" size={22} /> Everyday appreciation{" "}
              <ArrowUpRight aria-hidden="true" size={16} />
            </a>
          </div>
        </nav>

        <HrBenefits />
        <section className="hr-workflow" aria-labelledby="hr-workflow-title">
          <div className="hr-wrap">
            <div className="hr-centered">
              <p className="hr-eyebrow">A LITTLE LESS ADMIN. A LOT MORE IMPACT.</p>
              <h2 id="hr-workflow-title">
                From people data<em>to a delivered moment.</em>
              </h2>
              <p>One connected process, from your first idea to their doorstep.</p>
            </div>
            <div className="hr-steps">
              {hr.steps.map((step, i) => (
                <article key={step[1]}>
                  <div className="hr-step-number">
                    0{i + 1}
                    <span aria-hidden="true">→</span>
                  </div>
                  <h3>{step[1]}</h3>
                  <p>{step[2]}</p>
                </article>
              ))}
            </div>
            <div className="hr-workflow__foot">
              <Users size={20} aria-hidden="true" />
              <p>
                Your people make it meaningful. <strong>We make it manageable.</strong>
              </p>
            </div>
          </div>
        </section>

        <section className="hr-wrap hr-section hr-controls" aria-labelledby="hr-controls-title">
          <div>
            <p className="hr-eyebrow">CONTROL WITHOUT THE CHAOS</p>
            <h2 id="hr-controls-title">
              Room for the human.<em>Structure for the team.</em>
            </h2>
            <p>{hr.controlBody}</p>
            <Link to="/request-demo" className="hr-inline-link">
              See what your program could look like <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <div className="hr-accordions">
            {hr.controls.map((item, i) => (
              <details key={item} open={i === 0}>
                <summary>
                  <span>0{i + 1}</span>
                  {item}
                  <Plus size={18} aria-hidden="true" />
                </summary>
                <p>{controlDescriptions[i]}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="hr-wrap hr-next" aria-labelledby="hr-next-title">
          <div>
            <p className="hr-eyebrow">ONE PARTNER. EVERY MOMENT.</p>
            <h2 id="hr-next-title">
              Put your team’s program<em>on the shelf.</em>
            </h2>
            <p>See how Shelf Merch can simplify your next program from idea to doorstep.</p>
            <Link to="/request-demo" className="hr-button">
              Book a team demo <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <div className="hr-next__art" aria-hidden="true">
            <span className="hr-next__asterisk">✳</span>
            <p>
              For the people
              <br />
              who make
              <br />
              <em>your company.</em>
            </p>
            <Heart size={30} />
          </div>
        </section>
        <section className="hr-wrap hr-related" aria-label="More team resources">
          <Link to="/resources">← All resources</Link>
          <div>
            <Link to="/resources/sales">
              Sales &amp; Marketing <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
            <Link to="/resources/events">
              Events <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
    </ResourcesShell>
  );
}
