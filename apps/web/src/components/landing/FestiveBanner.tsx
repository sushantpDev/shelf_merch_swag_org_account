import { ArrowIcon } from "./icons";

const FESTIVE_IMAGE = "/images/landing/festive/festive-gifting-premium.png";

export function FestiveBanner() {
  return (
    <section className="festive-banner">
      <img src={FESTIVE_IMAGE} alt="Premium contemporary Indian festive corporate hamper" />
      <div className="festive-overlay">
        <span className="kicker light">FESTIVE GIFTING</span>
        <h2>
          Ready for
          <br />
          <em>festival season?</em>
        </h2>
        <p>Plan once. Ship a thoughtful festive kit to every city on your list.</p>
        <a className="button button-light" href="https://shelfmerch.store/pages/diwali-festival">
          See festive gifting <ArrowIcon />
        </a>
      </div>
    </section>
  );
}
