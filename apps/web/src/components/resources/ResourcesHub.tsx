import { Link } from "react-router";
import { ResourcesShell } from "./ResourcesShell";

export default function ResourcesHub() {
  return (
    <ResourcesShell title="Resources by Team — Shelf Merch">
      <section className="hub-hero">
        <div className="hub-copy">
          <span className="kicker">Shelf Merch Resources</span>
          <h1>
            Playbooks for
            <br />
            <em className="serif">every team.</em>
          </h1>
          <p>
            See how HR, Sales & Marketing, and Event teams use one Shelf Merch platform to create branded
            moments without operational chaos.
          </p>
          <a className="button" href="#by-team">
            Explore by team →
          </a>
        </div>
        <div className="stack">
          <div className="stack-card hr">
            <span>01</span>
            <i>♙</i>
            <b>HR</b>
            <small>ONBOARDING · MILESTONES · RECOGNITION</small>
          </div>
          <div className="stack-card sales">
            <span>02</span>
            <i>✦</i>
            <b>
              Sales &<br />
              Marketing
            </b>
            <small>PROSPECTS · CLIENTS · CAMPAIGNS</small>
          </div>
          <div className="stack-card events">
            <span>03</span>
            <i>✦</i>
            <b>Events</b>
            <small>SWAG BARS · KITS · FULFILLMENT</small>
          </div>
        </div>
      </section>

      <section className="section" id="by-team">
        <div className="section-head">
          <span className="kicker">By Team</span>
          <h2>
            Choose your team.
            <br />
            <em className="serif">See your Shelf.</em>
          </h2>
          <p>
            Start with the outcomes your team owns. The platform, production and pan-India fulfillment stay
            connected underneath.
          </p>
        </div>
        <div className="team-grid">
          <Link className="team-card hr" to="/resources/hr">
            <div className="team-card-top">
              <span>01</span>
              <i className="round-icon">♙</i>
            </div>
            <h3>
              Human
              <br />
              Resources
            </h3>
            <p>Onboarding, milestones and employee recognition.</p>
            <strong>Explore the playbook →</strong>
            <div className="shape-boxes">
              <i />
              <i />
              <i />
            </div>
          </Link>
          <Link className="team-card sales" to="/resources/sales">
            <div className="team-card-top">
              <span>02</span>
              <i className="round-icon">✦</i>
            </div>
            <h3>
              Sales &<br />
              Marketing
            </h3>
            <p>Prospect gifting, client appreciation and campaigns.</p>
            <strong>Explore the playbook →</strong>
            <div className="shape-boxes">
              <i />
              <i />
              <i />
            </div>
          </Link>
          <Link className="team-card events" to="/resources/events">
            <div className="team-card-top">
              <span>03</span>
              <i className="round-icon">✦</i>
            </div>
            <h3>Events</h3>
            <p>Conference swag, bulk kits and merch bars.</p>
            <strong>Explore the playbook →</strong>
            <div className="shape-boxes">
              <i />
              <i />
              <i />
            </div>
          </Link>
        </div>
      </section>

      <section className="common">
        <div>
          <span className="kicker">One operating platform</span>
          <h2>
            Different teams.
            <br />
            <em className="serif">One source of truth.</em>
          </h2>
          <p>
            Everyone gets a workflow that fits. Your company keeps one approved catalogue, one budget system
            and one fulfillment partner.
          </p>
        </div>
        <div className="common-grid">
          <article>
            <i>₹</i>
            <b>Budgets & credits</b>
            <small>Allocate by team, campaign or cost centre.</small>
          </article>
          <article>
            <i>▦</i>
            <b>Approved catalogues</b>
            <small>Keep every product and logo on-brand.</small>
          </article>
          <article>
            <i>▥</i>
            <b>Shared reporting</b>
            <small>See spend, redemption and delivery together.</small>
          </article>
          <article>
            <i>⇢</i>
            <b>Pan-India fulfillment</b>
            <small>We make, pack, ship and track the rest.</small>
          </article>
        </div>
      </section>

      <section className="final">
        <span className="kicker">Find your playbook</span>
        <h2>
          One platform.
          <br />
          <em className="serif">Every team.</em>
        </h2>
        <p>Bring your next employee, revenue or event program to one shelf.</p>
        <Link className="button" to="/request-demo">
          Book a demo →
        </Link>
      </section>
    </ResourcesShell>
  );
}
