import { Link } from "react-router";
import { ArrowIcon } from "./icons";

export function Features() {
  return (
    <section className="section operations">
      <div className="split-heading">
        <div>
          <span className="kicker">GIFTING OPERATIONS</span>
          <h2>
            Moments happen fast.
            <br />
            <em>Your gifting should too.</em>
          </h2>
        </div>
        <Link to="/platform" className="text-link operations-see-all mobile-only">
          See all
          <span>
            <ArrowIcon />
          </span>
        </Link>
      </div>
      <div className="feature-grid">
        <article className="feature-card coral">
          <div className="feature-top">
            <img
              className="feature-icon"
              src="/images/landing/operations/icons/kits.png"
              alt=""
              loading="lazy"
            />
            <span className="feature-number">01</span>
          </div>
          <h3>Kits</h3>
          <p className="desktop-only">
            Bundle apparel, drinkware and stationery into ready-to-ship kits.
          </p>
          <p className="mobile-only">Ready-to-ship curated kits.</p>
          <div className="feature-point desktop-only">
            <span>✓</span>
            Curated combos. Zero hassle.
          </div>
        </article>

        <article className="feature-card blue">
          <div className="feature-top">
            <img
              className="feature-icon"
              src="/images/landing/operations/icons/wallet.png"
              alt=""
              loading="lazy"
            />
            <span className="feature-number">02</span>
          </div>
          <h3>
            <span className="desktop-only">Wallet</span>
            <span className="mobile-only">Wallets</span>
          </h3>
          <p className="desktop-only">
            Let teams spend an approved budget, fully tracked and controlled.
          </p>
          <p className="mobile-only">Tracked budgets teams can spend.</p>
          <div className="feature-point desktop-only">
            <span>✓</span>
            Real-time balance. Total visibility.
          </div>
        </article>

        <article className="feature-card yellow">
          <div className="feature-top">
            <img
              className="feature-icon"
              src="/images/landing/operations/icons/spot-gifting.png"
              alt=""
              loading="lazy"
            />
            <span className="feature-number">03</span>
          </div>
          <h3>
            <span className="desktop-only">Spot gifting</span>
            <span className="mobile-only">Send gifting</span>
          </h3>
          <p className="desktop-only">
            Send a gift the moment it matters. No operational back-and-forth.
          </p>
          <p className="mobile-only">Send a gift the moment it matters.</p>
          <div className="feature-point desktop-only">
            <span>✓</span>
            Quick, thoughtful & on-brand.
          </div>
        </article>

        <article className="feature-card lilac">
          <div className="feature-top">
            <img
              className="feature-icon"
              src="/images/landing/operations/icons/automated-gifting.png"
              alt=""
              loading="lazy"
            />
            <span className="feature-number">04</span>
          </div>
          <h3>Automated gifting</h3>
          <p className="desktop-only">
            Set the rule once. Birthdays and milestones run automatically.
          </p>
          <p className="mobile-only">Birthdays and milestones on autopilot.</p>
          <div className="feature-point desktop-only">
            <span>✓</span>
            Always on. Always personal.
          </div>
        </article>
      </div>
      <div className="tag-line desktop-only">
        <span>Client &amp; prospect gifting</span>
        <span>Festivals &amp; celebrations</span>
        <span>Employee appreciation</span>
        <span>Birthdays &amp; anniversaries</span>
      </div>
    </section>
  );
}
