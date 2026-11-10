import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, ChevronRight } from "lucide-react";
import { Link, useLocation } from "react-router";
import { useCatalogCategoryTree } from "@/features/catalog/model";
import { FALLBACK_CATALOG_NODES, catalogCategorySlug, type CatalogCategoryNode } from "@/features/catalog/types";
import { browseCatalogEntries, buildCatalogOverviewTiles } from "@/features/catalog/views/catalog-navigation";
import "./catalog-dropdown.css";
import apparelMenuModels from "../../../assets/catalog/apparel-menu-models.png";

function normalize(nodes: readonly { name: string; slug: string; children?: readonly unknown[] }[]): CatalogCategoryNode[] {
  return nodes.map((node) => ({ ...node, children: normalize((node.children ?? []) as Parameters<typeof normalize>[0]) }));
}

export function CatalogDropdown({ onNavigate }: { onNavigate: () => void }) {
  const { pathname } = useLocation();
  const home = pathname.startsWith("/apps/catalog") ? "/apps/catalog" : "/app/catalog";
  const catalogDestination = /^\/(?:app|apps)\/catalog(?:\/|$)/.test(pathname) ? `${home}/browse` : home;
  const [open, setOpen] = useState(false);
  const tree = useCatalogCategoryTree(open);
  const nodes = useMemo(() => tree.data?.length ? normalize(tree.data) : FALLBACK_CATALOG_NODES, [tree.data]);
  const categories = useMemo(() => browseCatalogEntries(nodes), [nodes]);
  const images = useMemo(() => buildCatalogOverviewTiles(nodes, []), [nodes]);
  const [activeName, setActiveName] = useState("Apparel");
  const active = categories.find((category) => category.name === activeName) ?? categories[0];
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLAnchorElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const panelId = useId();

  function cancelClose() { clearTimeout(closeTimer.current); }
  function close() { cancelClose(); setOpen(false); }
  function navigate() { close(); onNavigate(); }

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (root.current?.contains(document.activeElement)) trigger.current?.focus();
      setOpen(false);
    };
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", escape);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);

  const categoryPath = (name: string) => `${home}/category/${catalogCategorySlug(name)}`;

  return (
    <div ref={root} className="catalog-dropdown"
      onMouseEnter={() => { cancelClose(); if (window.matchMedia("(min-width: 861px)").matches) setOpen(true); }}
      onMouseLeave={() => { closeTimer.current = setTimeout(() => setOpen(false), 160); }}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close(); }}>
      <div className="catalog-dropdown__trigger-row">
        <Link ref={trigger} className={`catalog-dropdown__trigger${open ? " is-open" : ""}`} to={catalogDestination}
          aria-expanded={open} aria-controls={panelId} onFocus={() => { cancelClose(); if (window.matchMedia("(min-width: 861px)").matches) setOpen(true); }}
          onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); } }} onClick={navigate}>Catalog</Link>
        <button className="catalog-dropdown__toggle" type="button" aria-label="Toggle catalog categories" aria-expanded={open} aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}><ChevronDown size={16} aria-hidden="true" /></button>
      </div>
      {open && active ? (
        <div className="catalog-dropdown__panel" id={panelId} onMouseEnter={cancelClose}>
          <nav className="catalog-dropdown__categories" aria-label="Catalog categories">
            {categories.map((category) => <Link key={category.name} to={categoryPath(category.name)}
              className={active.name === category.name ? "is-selected" : ""}
              onMouseEnter={() => setActiveName(category.name)} onFocus={() => setActiveName(category.name)}
              onKeyDown={(event) => { if (event.key === "ArrowRight") { event.preventDefault(); root.current?.querySelector<HTMLAnchorElement>(".catalog-dropdown__types a")?.focus(); } }}
              onClick={navigate}>{category.name}<ChevronRight size={14} aria-hidden="true" /></Link>)}
            <Link className="catalog-dropdown__view-all" to={`${home}/browse`} onClick={navigate}>View all categories<ArrowUpRight size={14} aria-hidden="true" /></Link>
          </nav>
          <div className="catalog-dropdown__details">
            <nav className="catalog-dropdown__types" aria-label={`${active.name} product types`}
              style={{ gridTemplateRows: `repeat(${Math.max(1, Math.ceil((active.children?.length ?? 0) * .65))}, min-content)` }}>
              {(active.children ?? []).filter((child) => child.name !== "Others").map((child) => <div key={child.name}>
                <Link to={categoryPath(child.name)} onClick={navigate}>{child.name}</Link>
                {child.children?.filter((leaf) => leaf.name !== "Others").map((leaf) => <Link className="catalog-dropdown__leaf" key={leaf.name} to={categoryPath(leaf.name)} onClick={navigate}>{leaf.name}</Link>)}
              </div>)}
              {!active.children?.length ? <Link to={categoryPath(active.name)} onClick={navigate}>Shop {active.name}<ArrowUpRight size={15} aria-hidden="true" /></Link> : null}
            </nav>
            <div className="catalog-dropdown__details-head"><Link to={categoryPath(active.name)} onClick={navigate}>Quick links {active.name}</Link></div>
          </div>
          <Link className="catalog-dropdown__preview" to={categoryPath(active.name)} onClick={navigate}>
            <img src={active.name === "Apparel" ? apparelMenuModels : images.find((tile) => tile.name === active.name)?.image} alt={active.name} />
            <span>Discover {active.name}<ArrowUpRight size={16} aria-hidden="true" /></span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
