import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link, useLocation } from "react-router";
import type { CatalogVm } from "../controllers/useCatalogController";
import { browseCatalogEntries, buildCatalogOverviewTiles } from "./catalog-navigation";
import {
  catalogCategorySlug,
  type CatalogCategoryChild,
} from "../types";
import "./catalog-view.css";
export function catalogHomePath(pathname: string) {
  const match = pathname.match(/^(.*\/catalog)(?:\/|$)/);
  return match?.[1] ?? "/app/catalog";
}

function CategoryBranch({
  name,
  children,
  home,
  depth,
}: {
  name: string;
  children: readonly CatalogCategoryChild[];
  home: string;
  depth: number;
}) {
  const [open, setOpen] = useState(false);
  const hasChildren = children.length > 0;
  const href = `${home}/category/${catalogCategorySlug(name)}`;

  return (
    <div className={`sm-browse__branch${open ? " is-open" : ""}`}>
      <div className="sm-browse__row" style={{ paddingLeft: 4 + depth * 14 }}>
        <Link to={href}>{name}</Link>
        {hasChildren ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} ${name} categories`}
            onClick={() => setOpen((value) => !value)}
          >
            <ChevronDown aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {open
        ? children.map((child) => (
            <CategoryBranch
              key={child.slug || child.name}
              name={child.name}
              children={child.children ?? []}
              home={home}
              depth={depth + 1}
            />
          ))
        : null}
    </div>
  );
}

export function CatalogBrowseView({ categoryNodes, stylePreviewProducts }: CatalogVm) {
  const { pathname } = useLocation();
  const home = catalogHomePath(pathname);

  const entries = useMemo(() => browseCatalogEntries(categoryNodes), [categoryNodes]);

  const tiles = useMemo(
    () => buildCatalogOverviewTiles(categoryNodes, stylePreviewProducts).map((tile) => ({
      ...tile, href: `${home}/category/${catalogCategorySlug(tile.name)}`,
    })),
    [categoryNodes, home, stylePreviewProducts],
  );

  return (
    <div className="sm-browse">
      <div className="sm-browse__head">
        <p className="sm-browse__crumb">
          <Link to={home}>Home</Link>
          <span aria-hidden="true">/</span>
          Catalog
        </p>
        <h1>Catalog</h1>
      </div>
      <div className="sm-browse__layout">
        <aside className="sm-browse__nav" aria-label="Catalog categories">
          {entries.map((entry) => (
            <CategoryBranch
              key={entry.slug || entry.name}
              name={entry.name}
              children={entry.children ?? []}
              home={home}
              depth={0}
            />
          ))}
        </aside>
        <div className="sm-browse__grid">
          {tiles.map((tile) => (
            <Link className="sm-browse__tile" key={tile.name} to={tile.href}>
              <span className="sm-browse__media">
                <img src={tile.image} alt="" />
              </span>
              <span>{tile.name}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
