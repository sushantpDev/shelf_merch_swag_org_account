import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { ResourceDropdown } from "../resources/ResourceDropdown";
import { CatalogDropdown } from "./CatalogDropdown";
import "../landing-mobile.css";
import "../resources/resource-nav.css";

function AuthLinks({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  return (
    <span className={`header-login${className ? ` ${className}` : ""}`}>
      <Link to="/login" onClick={onNavigate}>
        Log in
      </Link>
      <span aria-hidden="true"> / </span>
      <Link to="/signup" onClick={onNavigate}>
        Sign up
      </Link>
    </span>
  );
}

export function Header() {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => {
    setMenuOpen(false);
  };

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className={`site-header${menuOpen ? " menu-open" : ""}`}>
      <Link to="/" className="brand" aria-label="Shelf Merch home" onClick={closeMenu}>
        <img src="/images/logo/shelfmerch-wordmark.png" alt="" className="brand-wordmark" />
      </Link>

      <button
        type="button"
        className="menu-scrim"
        aria-label="Close menu"
        tabIndex={menuOpen ? 0 : -1}
        onClick={closeMenu}
      />

      <nav
        id="site-navigation"
        className={`nav-links${menuOpen ? " open" : ""}`}
        aria-label="Main navigation"
      >
        <div className="nav-links__sheet">
          <Link to="/platform" onClick={closeMenu}>
            Platform
          </Link>
          <ResourceDropdown onNavigate={closeMenu} />
          <CatalogDropdown onNavigate={closeMenu} />
          <Link to="/about" onClick={closeMenu}>
            About
          </Link>
          <AuthLinks className="mobile-only" onNavigate={closeMenu} />
          <Link className="header-cta nav-drawer-cta mobile-only" to="/request-demo" onClick={closeMenu}>
            Book a demo
          </Link>
        </div>
      </nav>

      <div className="header-end">
        <Link className="header-cta desktop-cta" to="/request-demo" onClick={closeMenu}>
          Book a demo
        </Link>
        <button
          type="button"
          className={`menu-button${menuOpen ? " is-open" : ""}`}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-controls="site-navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
    </header>
  );
}
