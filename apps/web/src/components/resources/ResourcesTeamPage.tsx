import { Link, Navigate, useParams } from "react-router";
import { ResourcesShell } from "./ResourcesShell";
import { isTeamSlug, TEAMS } from "./resources-data";

export function ResourcesTeamPage() {
  const { team } = useParams();
  if (!isTeamSlug(team)) return <Navigate to="/resources" replace />;

  const t = TEAMS[team];
  const related = (Object.values(TEAMS) as typeof t[]).filter((item) => item.slug !== t.slug);

  return (
    <ResourcesShell title={`Shelf Merch for ${t.name}`} tone={t.tone}>
      <section className={`team-hero ${t.tone}`}>
        <div className="team-copy">
          <span className="kicker">{t.eyebrow}</span>
          <h1>
            {t.titleBefore}
            <br />
            <em className="serif">{t.titleEm}</em>
          </h1>
          <p>{t.sub}</p>
          <div className="team-actions">
            <Link className="button dark" to="/request-demo">
              {t.cta} →
            </Link>
            <a href="#moments">See the use cases ↓</a>
          </div>
          <div className="proof">{t.proof}</div>
        </div>
        <div className="hero-art">
          <div className="dashboard">
            <div className="dash-top">
              <span>{t.dash[0]}</span>
              <i>Live</i>
            </div>
            <div className="dash-title">
              <p>
                <small>ACTIVE PROGRAM</small>
                <b>{t.dash[1]}</b>
              </p>
              <strong>{t.dash[2]}</strong>
            </div>
            <div className="progress">
              <i />
            </div>
            <div className="dash-stats">
              <span>
                <b>{t.dash[3]}</b>
                <small>{t.dash[4]}</small>
              </span>
              <span>
                <b>{t.dash[5]}</b>
                <small>{t.dash[6]}</small>
              </span>
              <span>
                <b>{t.dash[7]}</b>
                <small>{t.dash[8]}</small>
              </span>
            </div>
            <div className="dash-row">
              <i>{t.dash[9]}</i>
              <p>
                <b>{t.dash[10]}</b>
                <small>{t.dash[11]}</small>
              </p>
              <em>{t.dash[12]}</em>
            </div>
          </div>
          <div className="float-card one">
            <i>{t.floats[0][0]}</i>
            <p>
              <b>{t.floats[0][1]}</b>
              <small>{t.floats[0][2]}</small>
            </p>
          </div>
          <div className="float-card two">
            <i>{t.floats[1][0]}</i>
            <p>
              <b>{t.floats[1][1]}</b>
              <small>{t.floats[1][2]}</small>
            </p>
          </div>
        </div>
      </section>

      <section className="stats">
        {t.stats.map((stat, i) => (
          <article key={stat[1]}>
            <span>0{i + 1}</span>
            <b>{stat[0]}</b>
            <p>{stat[1]}</p>
          </article>
        ))}
      </section>

      <section className="moments" id="moments">
        <div className="section-head">
          <span className="kicker">Built around your team</span>
          <h2>
            {t.sectionBefore}
            <br />
            <em className="serif">{t.sectionEm}</em>
          </h2>
          <p>{t.body}</p>
        </div>
        <div className="moment-grid">
          {t.moments.map((moment, i) => (
            <article className="moment-card" key={moment[1]}>
              <div className="moment-top">
                <span>0{i + 1}</span>
                <i className="round-icon">{moment[0]}</i>
              </div>
              <h3>{moment[1]}</h3>
              <p>{moment[2]}</p>
              <ul>
                {moment[3].map((item) => (
                  <li key={item}>✓ &nbsp;{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="workflow">
        <span className="kicker">About</span>
        <h2>
          {t.workflowBefore}
          <br />
          <em className="serif">{t.workflowEm}</em>
        </h2>
        <div className="workflow-grid">
          {t.steps.map((step, i) => (
            <article className="workflow-card" key={step[1]}>
              <span>0{i + 1}</span>
              <i>{step[0]}</i>
              <h3>{step[1]}</h3>
              <p>{step[2]}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="control">
        <div>
          <span className="kicker">Control without the chaos</span>
          <h2>{t.control}</h2>
          <p>{t.controlBody}</p>
        </div>
        <div className="control-panel">
          {t.controls.map((item, i) => (
            <span key={item}>
              <i>0{i + 1}</i>
              <b>{item}</b>
              <strong>✓</strong>
            </span>
          ))}
        </div>
      </section>

      <section className="related">
        <span className="kicker">Resources by team</span>
        <h2>
          Built for your
          <br />
          <em className="serif">next collaborator, too.</em>
        </h2>
        <div className="related-grid">
          {related.map((item) => (
            <Link className="related-card" to={`/resources/${item.slug}`} key={item.slug}>
              <i>{item.icon}</i>
              <span>
                <small>BY TEAM</small>
                <b>{item.name}</b>
                <em>{item.proof.replace("✓ ", "")}</em>
              </span>
              <strong>→</strong>
            </Link>
          ))}
        </div>
      </section>

      <section className="final">
        <span className="kicker">One partner. Every moment.</span>
        <h2>
          Put your team&apos;s
          <br />
          <em className="serif">program on the shelf.</em>
        </h2>
        <p>See how Shelf Merch can simplify your next program from idea to doorstep.</p>
        <Link className="button" to="/request-demo">
          Book a team demo →
        </Link>
      </section>
    </ResourcesShell>
  );
}
