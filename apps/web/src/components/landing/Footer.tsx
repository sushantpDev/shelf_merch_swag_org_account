import { useState, type ReactNode } from "react";
import { Link } from "react-router";

const WORDMARK = "/images/logo/shelfmerch-wordmark-white.png";

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="currentColor">
      <path d="M14 8h3V4h-3c-2.8 0-5 2.2-5 5v2H6v4h3v7h4v-7h3.2L17 11h-4V9c0-.6.4-1 1-1Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="4" y="4" width="16" height="16" rx="5" />
      <circle cx="12" cy="12" r="3.5" />
      <circle cx="17.2" cy="6.8" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="currentColor">
      <path d="M6.5 9H3.7v11h2.8V9ZM5.1 4C4.1 4 3.3 4.8 3.3 5.8S4.1 7.6 5.1 7.6 6.9 6.8 6.9 5.8 6.1 4 5.1 4ZM20.3 13.4c0-3.1-1.6-4.6-3.9-4.6-1.8 0-2.6 1-3.1 1.7V9H10.5c0 1.3 0 11 0 11h2.8v-6.1c.2-.7.8-1.6 1.9-1.6 1.3 0 2.3.9 2.3 2.8V20h2.8v-6.6Z" />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="currentColor">
      <path d="M21.6 7.2a2.7 2.7 0 0 0-1.9-1.9C18 5 12 5 12 5s-6 0-7.7.3A2.7 2.7 0 0 0 2.4 7.2 28 28 0 0 0 2 12a28 28 0 0 0 .4 4.8 2.7 2.7 0 0 0 1.9 1.9C6 19 12 19 12 19s6 0 7.7-.3a2.7 2.7 0 0 0 1.9-1.9A28 28 0 0 0 22 12a28 28 0 0 0-.4-4.8ZM10 15.4V8.6L15.5 12 10 15.4Z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M4 7l8 6 8-6" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <path d="M7 3h3l1.5 4-2 1.2a12 12 0 0 0 6.3 6.3L17 12.5l4 1.5v3A16 16 0 0 1 7 3Z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5L15 16" />
    </svg>
  );
}

type FooterSection = {
  id: string;
  title: string;
  links: ReactNode;
};

const FOOTER_SECTIONS: FooterSection[] = [
  {
    id: "platform",
    title: "Platform",
    links: (
      <>
        <a href="/platform">Features</a>
        <a href="/platform#connects">Integrations</a>
      </>
    ),
  },
  {
    id: "resources",
    title: "Resources",
    links: (
      <>
        <a href="/blog">Blog</a>
        <Link to="/resources/human-resources">Human Resource</Link>
        <Link to="/resources/sales">Sales &amp; Marketing</Link>
        <Link to="/resources/events">Events</Link>
      </>
    ),
  },
  {
    id: "catalog",
    title: "Catalog",
    links: (
      <>
        <Link to="/apps/catalog">All Products</Link>
        <Link to="/apps/catalog?category=Apparel">Apparel</Link>
        <Link to="/apps/catalog?category=Drinkware">Drinkware</Link>
        <Link to="/apps/catalog?category=Office%20Supplies">Office Supplies</Link>
        <Link to="/apps/catalog?category=Technology">Tech Accessories</Link>
        <Link to="/apps/catalog">Kits</Link>
      </>
    ),
  },
  {
    id: "about",
    title: "About Us",
    links: (
      <>
        <Link to="/request-demo">Book a Demo</Link>
        <a href="/careers">Careers</a>
      </>
    ),
  },
  {
    id: "legal",
    title: "Legal",
    links: (
      <>
        <a href="/legal/terms-of-service">Terms &amp; Conditions</a>
        <a href="/privacy">Privacy Policy</a>
        <a
          href="/privacy#cookie-preferences"
          onClick={(event) => {
            event.preventDefault();
            window.dispatchEvent(new Event("shelfmerch:open-consent"));
          }}
        >
          Cookie preferences
        </a>
        <span>Refund Policy</span>
        <span>Shipping Policy</span>
        <span>Cookie Policy</span>
      </>
    ),
  },
];

function FooterAccordion() {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="footer-accordion mobile-only">
      {FOOTER_SECTIONS.map((section) => {
        const open = openId === section.id;
        return (
          <div key={section.id} className={`footer-acc${open ? " is-open" : ""}`}>
            <button
              type="button"
              className="footer-acc__trigger"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : section.id)}
            >
              {section.title}
              <span aria-hidden="true">{open ? "−" : "+"}</span>
            </button>
            <div className="footer-acc__panel" hidden={!open}>
              {section.links}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <div className="footer-brand-col">
          <Link to="/" className="footer-logo" aria-label="Shelf Merch home">
            <img src={WORDMARK} alt="Shelf Merch" className="brand-wordmark footer-wordmark" />
          </Link>
          <p>
            Merch. Gifting. Recognition.
            <br />
            Made and delivered across India.
          </p>
          <div className="footer-socials" aria-label="Social media">
            <a
              className="footer-social"
              href="https://www.facebook.com/people/Shelfmerch/100085365945333/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Shelf Merch on Facebook"
            >
              <FacebookIcon />
            </a>
            <a
              className="footer-social"
              href="https://www.instagram.com/shelfmerch/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Shelf Merch on Instagram"
            >
              <InstagramIcon />
            </a>
            <a
              className="footer-social"
              href="https://in.linkedin.com/company/shelfmerch"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Shelf Merch on LinkedIn"
            >
              <LinkedInIcon />
            </a>
            <a
              className="footer-social"
              href="https://www.youtube.com/@shelfmerch"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Shelf Merch on YouTube"
            >
              <YouTubeIcon />
            </a>
          </div>
        </div>

        {FOOTER_SECTIONS.map((section) => (
          <div key={section.id} className="footer-col desktop-only">
            <h4>{section.title}</h4>
            {section.links}
          </div>
        ))}
      </div>

      <FooterAccordion />

      <div className="footer-bottom">
        <div className="footer-contact">
          <span className="footer-contact-icon">
            <MailIcon />
          </span>
          <p>
            <small>Need help?</small>
            <a href="mailto:support@shelfmerch.com">support@shelfmerch.com</a>
          </p>
        </div>
        <div className="footer-contact">
          <span className="footer-contact-icon">
            <PhoneIcon />
          </span>
          <p>
            <small>Call us</small>
            <a href="tel:+919515888515">9515888515</a>
          </p>
        </div>
        <div className="footer-contact">
          <span className="footer-contact-icon">
            <ClockIcon />
          </span>
          <p>
            <small>Mon to Fri, 9:00 AM to 6:00 PM</small>
            <strong>We&apos;re here to help</strong>
          </p>
        </div>
        <span className="footer-copy">© 2026 ShelfMerch. All rights reserved.</span>
      </div>
    </footer>
  );
}
