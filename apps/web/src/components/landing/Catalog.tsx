import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowIcon } from "./icons";
import { CATALOG_ITEMS } from "./catalog-data";

const CATALOG_ICONS: Record<string, ReactNode> = {
  Apparel: <path d="M8 4l4 2 4-2 5 3-3 5-2-1v10H8V11l-2 1-3-5 5-3z" />,
  Drinkware: (
    <>
      <path d="M3 9h18v12H3z" />
      <path d="M2 5h20v4H2z" />
      <path d="M12 5v16" />
      <path d="M12 5c-1-4-6-4-6-1s4 2 6 1zm0 0c1-4 6-4 6-1s-4 2-6 1z" />
    </>
  ),
  "Tech Accessories": (
    <>
      <path d="M8 3v6M16 3v6" />
      <path d="M6 9h12v2a6 6 0 01-12 0V9z" />
      <path d="M12 17v4" />
    </>
  ),
  "Bags & Travel": (
    <>
      <path d="M4 7l8-4 8 4-8 4-8-4z" />
      <path d="M4 7v10l8 4 8-4V7" />
      <path d="M12 11v10" />
    </>
  ),
  Accessories: (
    <>
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
      <path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" />
    </>
  ),
  "Office Supplies": (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 3v4m10-4v4M3 10h18" />
      <path d="M8 15l2 2 5-5" />
    </>
  ),
  "Festival Hampers": (
    <>
      <path d="M3 9h18v12H3z" />
      <path d="M2 5h20v4H2z" />
      <path d="M12 5v16" />
      <path d="M12 5c-1-4-6-4-6-1s4 2 6 1zm0 0c1-4 6-4 6-1s-4 2-6 1z" />
    </>
  ),
  "Made-to-Order": (
    <>
      <path d="M4 10v10h16V10" />
      <path d="M3 10l2-6h14l2 6" />
      <path d="M8 20v-6h8v6" />
      <path d="M3 10c0 2 4 2 4 0 0 2 4 2 4 0 0 2 4 2 4 0 0 2 4 2 4 0" />
    </>
  ),
};

function CatalogArrow() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function Catalog() {
  return (
    <section className="section catalog-section" id="catalog">
      <div className="section-heading centered catalog-heading">
        <span className="kicker">SOMETHING FOR EVERYONE</span>
        <h2>
          One catalog <em>for every occasion</em>
        </h2>
        <Link to="/app/catalog" className="text-link catalog-link">
          <span className="catalog-link-label desktop-only">View full catalog</span>
          <span className="catalog-link-label mobile-only">See all</span>
          <span className="catalog-link-icon">
            <ArrowIcon />
          </span>
        </Link>
      </div>
      <div className="catalog-grid">
        {CATALOG_ITEMS.map((item) => (
          <Link
            key={item.count}
            to={item.to}
            className={`${item.className}${item.image ? " has-image" : ""}`}
          >
            {item.image ? (
              <img
                className="catalog-photo"
                src={item.image}
                alt={item.imageAlt ?? item.title}
                loading="lazy"
              />
            ) : null}
            <span className="catalog-count">{item.count}</span>
            <div className="catalog-icon">
              <svg
                aria-hidden="true"
                width={item.iconSize}
                height={item.iconSize}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {CATALOG_ICONS[item.title]}
              </svg>
            </div>
            <h3>{item.title}</h3>
            <span className="round-arrow">{item.image ? <CatalogArrow /> : "→"}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
