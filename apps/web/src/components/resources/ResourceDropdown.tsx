import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { Link, useLocation } from "react-router";
import { RESOURCE_NAV } from "./resources-data";
import kitsImage from "../../../assets/catalog-style-spotlight/kits.png";

export function ResourceDropdown({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLAnchorElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const panelId = useId();
  const catalogHome = pathname.startsWith("/apps/catalog") ? "/apps/catalog" : "/app/catalog";
  const cancelClose = () => clearTimeout(timer.current);
  function close() { cancelClose(); setOpen(false); }
  function navigate() { close(); onNavigate?.(); }

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (root.current?.contains(document.activeElement)) trigger.current?.focus();
        setOpen(false);
      }
    };
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", escape); document.removeEventListener("pointerdown", outside); };
  }, [open]);

  return (
    <div ref={root} className="resources-dropdown"
      onMouseEnter={() => { cancelClose(); if (window.matchMedia("(min-width: 861px)").matches) setOpen(true); }}
      onMouseLeave={() => { timer.current = setTimeout(() => setOpen(false), 160); }}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close(); }}>
      <div className="resources-trigger-row">
        <Link ref={trigger} className={`resources-trigger${pathname.startsWith("/resources") ? " active" : ""}${open ? " is-open" : ""}`}
          to="/resources" onClick={navigate} aria-expanded={open} aria-controls={panelId}
          onFocus={() => { cancelClose(); if (window.matchMedia("(min-width: 861px)").matches) setOpen(true); }}
          onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); } }}>
          Resources<ChevronDown className="resources-trigger-chevron" size={12} aria-hidden="true" />
        </Link>
        <button className="resources-mobile-toggle" type="button" aria-label="Toggle resources" aria-expanded={open} aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}><ChevronDown size={16} aria-hidden="true" /></button>
      </div>
      {open ? <div className="resources-menu" id={panelId} onMouseEnter={cancelClose}>
        <nav className="resources-menu-column" aria-label="Resource library">
          <p>Resources</p>
          <Link to="/resources" onClick={navigate}>All resources</Link>
          <Link to="/case-studies/zoho-people" onClick={navigate}>Case study<ArrowUpRight size={14} aria-hidden="true" /></Link>
          <Link to="/blog" reloadDocument onClick={navigate}>Blog &amp; guides</Link>
        </nav>
        <nav className="resources-menu-column" aria-label="Resources by team">
          <p>By team</p>
          {RESOURCE_NAV.map((item) => <Link key={item.slug} to={`/resources/${item.slug === "hr" ? "human-resources" : item.slug}`} onClick={navigate}>{item.label}</Link>)}
        </nav>
        <div className="resources-menu-feature">
          <p>Made for every team</p>
          <h2>Branded gifts.<br />Stronger connections.</h2>
          <Link to={`${catalogHome}/browse`} onClick={navigate}>Explore the catalog<ArrowUpRight size={13} aria-hidden="true" /></Link>
          <img src={kitsImage} alt="A collection of Shelfmerch branded gifts and accessories" />
        </div>
      </div> : null}
    </div>
  );
}
