import { ArrowIcon } from "./icons";

const HERO_IMAGE = "/images/landing/hero.png";
const MOBILE_HERO_IMAGE = "/images/landing/hero-mobile-merch-flatlay.png";

export function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <div className="eyebrow">
          <span /> Merch. Gifting. Recognition.
        </div>
        <h1>
          The AI-powered
          <br />
          platform
          <br />
          <em>for corporate swag</em>
        </h1>
        <p className="hero-lead">
          <span className="hero-lead__line">Curate branded merchandise with AI, launch your company</span>{' '}
          <span className="hero-lead__line">swag store, and manage onboarding kits and employee gifts</span>{' '}
          <span className="hero-lead__line">in one place. We handle fulfilment worldwide.</span>
        </p>
        <div className="hero-actions">
          <a className="button button-dark" href="/request-demo">
            Get started <ArrowIcon />
          </a>
        </div>
        <div className="hero-proof desktop-only">
          <div className="avatar-stack">
            <span>HR</span>
            <span>MK</span>
            <span>AD</span>
          </div>
          <p>
            <strong>One dashboard</strong>
            <br />
            for every team
          </p>
        </div>
      </div>
      <div className="hero-visual" aria-label="Colorful corporate onboarding kit">
        <div className="hero-color-shape shape-one" />
        <div className="hero-color-shape shape-two" />
        <picture>
          <source media="(max-width: 860px)" srcSet={MOBILE_HERO_IMAGE} />
          <img
            src={HERO_IMAGE}
            alt="Premium corporate merchandise with apparel, drinkware, stationery and tech accessories"
          />
        </picture>
        <div className="floating-card float-top desktop-only">
          <span className="status-dot" />
          Order #SM-2481 <strong>In production</strong>
        </div>
        <div className="floating-card float-bottom desktop-only">
          <span className="float-icon">
            <svg
              aria-hidden="true"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 5h12v11H3z" />
              <path d="M15 9h4l3 4v3h-7z" />
              <circle cx="7" cy="18" r="2" />
              <circle cx="18" cy="18" r="2" />
            </svg>
          </span>
          <span>
            <strong>Pan-India delivery</strong>
            <small>One order. Every city.</small>
          </span>
        </div>
        <div className="burst desktop-only">
          YOUR BRAND
          <br />
          <strong>EVERYWHERE</strong>
        </div>
      </div>
    </section>
  );
}
