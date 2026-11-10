import { type FormEvent, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import "./catalog-view.css";

type FooterLink = {
  label: string;
  to?: string;
  href?: string;
  external?: boolean;
};

const BASICS: FooterLink[] = [
  { label: "Book A Demo", to: "/request-demo", external: true },
  { label: "Testimonials", to: "/#testimonials" },
  { label: "Help Center", to: "/request-demo", external: true },
  { label: "Contact Us", to: "/request-demo", external: true },
];

const MENU: FooterLink[] = [
  { label: "All Products", to: "/apps/catalog" },
  { label: "Catalog", to: "/apps/catalog" },
  { label: "Occasions", to: "/resources" },
  { label: "Use Cases", to: "/resources" },
  { label: "Teams & Roles", to: "/resources" },
  { label: "Seasons", to: "/apps/catalog" },
  { label: "Industry", to: "/apps/catalog" },
];

const OTHER: FooterLink[] = [
  { label: "About Us", to: "/about", external: true },
  { label: "Blogs", to: "/resources" },
  { label: "Careers", to: "/careers", external: true },
  { label: "Safelist", href: "https://shelfmerch.com", external: true },
  { label: "Security", to: "/privacy", external: true },
  { label: "Cookie Preferences" },
  { label: "Need Help?", to: "/request-demo" },
];

function SocialIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="currentColor">
      {children}
    </svg>
  );
}

function FooterNavLink({ item }: { item: FooterLink }) {
  const mark = item.external ? <ArrowUpRight aria-hidden="true" /> : null;
  if (!item.to && !item.href) {
    return (
      <button type="button" onClick={() => toast.message("Cookie preferences coming soon")}>
        {item.label}
        {mark}
      </button>
    );
  }
  if (item.href) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer">
        {item.label}
        {mark}
      </a>
    );
  }
  return (
    <Link to={item.to ?? "/"}>
      {item.label}
      {mark}
    </Link>
  );
}

export function CatalogMarketingFooter({ onViewCatalog }: { onViewCatalog?: () => void }) {
  const [email, setEmail] = useState("");
  const navigate = useNavigate();
  const { pathname } = useLocation();

  function handleViewCatalog() {
    if (onViewCatalog) {
      onViewCatalog();
      return;
    }
    if (pathname.startsWith("/app/catalog") || pathname.startsWith("/apps/catalog")) {
      const products = document.getElementById("catalog-products");
      if (products) {
        products.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    navigate(pathname.startsWith("/apps") ? "/apps/catalog" : "/app/catalog");
  }

  function onSubscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;
    toast.success("You're on the list 🙌");
    setEmail("");
  }

  return (
    <footer className="sm-cat-footer">
      <div className="sm-cat-container">
        <div className="sm-cat-footer-top">
          <Link to="/" className="sm-cat-brand" aria-label="Shelf Merch home">
            <img src="/images/logo/shelf-merch-wordmark.png" alt="Shelf Merch" />
            <p className="sm-cat-brand-note">Merch. Gifting. Recognition.</p>
          </Link>
          <button type="button" className="sm-cat-catalog-btn" onClick={handleViewCatalog}>
            View catalog
          </button>
        </div>

        <div className="sm-cat-footer-mid">
          <div>
            <label className="sm-cat-subscribe-label" htmlFor="sm-cat-newsletter">
              Subscribe to our Newsletter
            </label>
            <form className="sm-cat-subscribe-form" onSubmit={onSubscribe}>
              <input
                id="sm-cat-newsletter"
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="Your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button type="submit" aria-label="Subscribe">
                <ArrowRight size={16} />
              </button>
            </form>
          </div>

          <nav className="sm-cat-footer-col" aria-label="The Basics">
            <h3>The Basics</h3>
            {BASICS.map((item) => (
              <FooterNavLink key={item.label} item={item} />
            ))}
          </nav>
          <nav className="sm-cat-footer-col" aria-label="Menu">
            <h3>Menu</h3>
            {MENU.map((item) => (
              <FooterNavLink key={item.label} item={item} />
            ))}
          </nav>
          <nav className="sm-cat-footer-col" aria-label="Other">
            <h3>Other</h3>
            {OTHER.map((item) => (
              <FooterNavLink key={item.label} item={item} />
            ))}
          </nav>
        </div>

        {/* <div className="sm-cat-footer-bottom">
          <div className="sm-cat-socials" aria-label="Social media">
            <a
              className="sm-cat-social"
              href="https://in.linkedin.com/company/shelfmerch"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Shelf Merch on LinkedIn"
            >
              <SocialIcon>
                <path d="M6.5 9H3.7v11h2.8V9ZM5.1 4C4.1 4 3.3 4.8 3.3 5.8S4.1 7.6 5.1 7.6 6.9 6.8 6.9 5.8 6.1 4 5.1 4ZM20.3 13.4c0-3.1-1.6-4.6-3.9-4.6-1.8 0-2.6 1-3.1 1.7V9H10.5c0 1.3 0 11 0 11h2.8v-6.1c.2-.7.8-1.6 1.9-1.6 1.3 0 2.3.9 2.3 2.8V20h2.8v-6.6Z" />
              </SocialIcon>
            </a>
            <a
              className="sm-cat-social"
              href="https://www.youtube.com/@shelfmerch"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Shelf Merch on YouTube"
            >
              <SocialIcon>
                <path d="M21.6 7.2a2.7 2.7 0 0 0-1.9-1.9C18 5 12 5 12 5s-6 0-7.7.3A2.7 2.7 0 0 0 2.4 7.2 28 28 0 0 0 2 12a28 28 0 0 0 .4 4.8 2.7 2.7 0 0 0 1.9 1.9C6 19 12 19 12 19s6 0 7.7-.3a2.7 2.7 0 0 0 1.9-1.9A28 28 0 0 0 22 12a28 28 0 0 0-.4-4.8ZM10 15.4V8.6L15.5 12 10 15.4Z" />
              </SocialIcon>
            </a>
            <a
              className="sm-cat-social"
              href="https://www.instagram.com/shelfmerch/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Shelf Merch on Instagram"
            >
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
            </a>
            <a
              className="sm-cat-social"
              href="https://www.facebook.com/people/Shelfmerch/100085365945333/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Shelf Merch on Facebook"
            >
              <SocialIcon>
                <path d="M14 8h3V4h-3c-2.8 0-5 2.2-5 5v2H6v4h3v7h4v-7h3.2L17 11h-4V9c0-.6.4-1 1-1Z" />
              </SocialIcon>
            </a>
          </div>
          <p className="sm-cat-copy">Shelf Merch. All rights reserved © 2026</p>
          <nav className="sm-cat-legal" aria-label="Legal">
            <Link to="/request-demo">Accessibility Support</Link>
            <Link to="/terms-condition">Terms</Link>
            <Link to="/privacy">Privacy Policy</Link>
          </nav>
        </div> */}
      </div>
      <p className="sm-cat-watermark" aria-hidden="true">
        Shelf Merch
      </p>
    </footer>
  );
}
