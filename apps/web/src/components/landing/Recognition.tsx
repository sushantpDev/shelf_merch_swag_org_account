import { ArrowIcon } from "./icons";

export function Recognition() {
  return (
    <section className="recognition-section">
      <div className="recognition-heading">
        <span className="kicker">RECOGNITION, BUILT IN</span>
        <h2>
          Celebrate the moments
          <br />
          <em>that move teams.</em>
        </h2>
      </div>
      <div className="recognition-copy">
        <ul>
          <li>
            <span>
              <svg
                aria-hidden="true"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 2l4 4-4 4" />
                <path d="M3 11V9a3 3 0 013-3h15" />
                <path d="M7 22l-4-4 4-4" />
                <path d="M21 13v2a3 3 0 01-3 3H3" />
              </svg>
            </span>
            <div>
              <b>Spot &amp; recurring</b>
              <small className="desktop-only">One-off kudos or automated milestones</small>
              <small className="mobile-only">One-off kudos or automated milestones</small>
            </div>
          </li>
          <li>
            <span>
              <svg
                aria-hidden="true"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 20V10" />
                <path d="M10 20V4" />
                <path d="M16 20v-7" />
                <path d="M22 20H2" />
              </svg>
            </span>
            <div>
              <b>Reports &amp; insights</b>
              <small className="desktop-only">Spend, redemption and engagement visibility</small>
              <small className="mobile-only">Spend, redemption and engagement</small>
            </div>
          </li>
          <li>
            <span>
              <svg
                aria-hidden="true"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8 3v6M16 3v6" />
                <path d="M6 9h12v2a6 6 0 01-12 0V9z" />
                <path d="M12 17v4" />
              </svg>
            </span>
            <div>
              <b className="desktop-only">Fits how you work</b>
              <b className="mobile-only">HR &amp; team integrations</b>
              <small className="desktop-only">HRMS, Slack and Microsoft Teams integrations</small>
              <small className="mobile-only">HRMS, Slack and Teams</small>
            </div>
          </li>
        </ul>
        <a href="#contact" className="text-link desktop-only">
          Explore recognition
          <span>
            <ArrowIcon />
          </span>
        </a>
      </div>
      <div className="recognition-ui">
        <img
          src="/images/landing/recognition/recognition-dashboard.png"
          alt="Shelf Merch recognition dashboard"
          loading="lazy"
        />
      </div>
    </section>
  );
}
