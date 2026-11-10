import { useCallback, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ShelfMerchLogo } from "@/components/brand/ShelfMerchLogo";
import "./docs.css";

export const ZOHO_DOCS_NAV = [
  { to: "/docs/zoho-people", label: "Overview" },
  { to: "/docs/zoho-people/user-guide", label: "User Guide" },
  { to: "/docs/zoho-people/admin-guide", label: "Administrator Guide" },
  { to: "/case-studies/zoho-people", label: "Example Workflow" },
] as const;

type Crumb = { label: string; to?: string };

type DocsShellProps = {
  className?: string;
  activePath: string;
  breadcrumbs: Crumb[];
  children: ReactNode;
};

function NavLinks({ activePath }: { activePath: string }) {
  return (
    <>
      {ZOHO_DOCS_NAV.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          aria-current={item.to === activePath ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </>
  );
}

/** Shared chrome for public Zoho People documentation pages. */
export function DocsShell({ activePath, breadcrumbs, children, className = "" }: DocsShellProps) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className={`docs-shell ${className}`}>
      <header className="docs-top">
        <div className="docs-top-inner">
          <Link to="/" className="docs-logo-link" aria-label="ShelfMerch home">
            <ShelfMerchLogo height={32} />
          </Link>
          <nav className="docs-top-nav" aria-label="Site">
            <Link to="/docs/zoho-people">Docs</Link>
            <Link to="/legal/privacy-policy">Privacy</Link>
            <Link to="/legal/terms-of-service">Terms</Link>
            <a href="mailto:support@shelfmerch.com">Support</a>
          </nav>
        </div>
      </header>

      <div className="docs-layout">
        <aside className="docs-side" aria-label="Documentation">
          <h2>Zoho People</h2>
          <NavLinks activePath={activePath} />
        </aside>

        <div>
          <div className="docs-mobile-nav">
            <button
              type="button"
              className="docs-mobile-toggle"
              aria-expanded={navOpen}
              onClick={() => setNavOpen((v) => !v)}
            >
              {navOpen ? "Hide documentation menu" : "Documentation menu"}
            </button>
            {navOpen ? (
              <nav className="docs-mobile-panel" onClick={() => setNavOpen(false)}>
                <NavLinks activePath={activePath} />
              </nav>
            ) : null}
          </div>

          <main className="docs-main">
            <nav className="docs-crumbs" aria-label="Breadcrumb">
              {breadcrumbs.map((crumb, i) => (
                <span key={`${crumb.label}-${i}`} className="docs-crumb">
                  {i > 0 ? <span className="docs-crumb-sep">/</span> : null}
                  {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <span>{crumb.label}</span>}
                </span>
              ))}
            </nav>
            {children}
          </main>
        </div>
      </div>

      <footer className="docs-footer">
        <div className="docs-footer-links">
          <Link to="/docs/zoho-people">Documentation</Link>
          <Link to="/legal/privacy-policy">Privacy Policy</Link>
          <Link to="/legal/terms-of-service">Terms of Service</Link>
          <a href="mailto:support@shelfmerch.com">Contact Support</a>
        </div>
        <div>
          © 2026 Chitlu Innovations Private Limited · ShelfMerch ·{" "}
          <a href="https://shelfmerch.io">shelfmerch.io</a>
        </div>
      </footer>
    </div>
  );
}

/** Heading with optional copy-link control. */
export function DocsHeading({
  id,
  level = 2,
  children,
}: {
  id: string;
  level?: 2 | 3;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const Tag = level === 3 ? "h3" : "h2";

  const onCopy = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}#${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable.
    }
  }, [id]);

  return (
    <Tag id={id} className="docs-heading">
      <span>{children}</span>
      <button type="button" className="docs-copy-link" onClick={onCopy} aria-label={`Copy link to ${id}`}>
        {copied ? "Copied" : "Copy link"}
      </button>
    </Tag>
  );
}
