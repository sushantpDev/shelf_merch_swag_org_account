import { Link, useLocation } from "react-router";
import { RESOURCE_NAV } from "./resources-data";

type ResourceDropdownProps = {
  onNavigate?: () => void;
};

function ChevronDownIcon() {
  return (
    <svg
      className="resources-trigger-chevron"
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function ResourceDropdown({ onNavigate }: ResourceDropdownProps) {
  const { pathname } = useLocation();
  const isActive = pathname.startsWith("/resources");

  return (
    <div className="resources-dropdown">
      <Link
        className={`resources-trigger${isActive ? " active" : ""}`}
        to="/resources"
        onClick={onNavigate}
      >
        Resources
        <ChevronDownIcon />
      </Link>
      <div className="resources-menu">
        <small>BY TEAM</small>
        {RESOURCE_NAV.map((item) => (
          <Link key={item.slug} to={`/resources/${item.slug}`} onClick={onNavigate}>
            <i>{item.icon}</i>
            <span>
              <b>{item.label}</b>
              <em>{item.blurb}</em>
            </span>
            <strong>→</strong>
          </Link>
        ))}
        <a href="/blog" onClick={onNavigate}>
          <i>✎</i><span><b>Blog</b><em>Ideas, guides and stories</em></span><strong>→</strong>
        </a>
      </div>
    </div>
  );
}
