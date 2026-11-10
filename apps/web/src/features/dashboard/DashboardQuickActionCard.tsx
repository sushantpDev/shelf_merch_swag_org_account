import { ArrowRight, ChevronRight, Plus, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import "./dashboard-quick-actions.css";

type QuickAction = { label: string; href: string; icon: LucideIcon };

export function DashboardQuickActionCard({
  title, description, icon: Icon, image, tone, items, browse, action,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  image: string;
  tone: "campaigns" | "swag";
  items: QuickAction[];
  browse: { label: string; href: string };
  action: { label: string; href: string };
}) {
  return (
    <section className={`dash-quick-card dash-quick-card--${tone}`} aria-labelledby={`dash-${tone}-title`}>
      <header className="dash-quick-card__header">
        <div className="dash-quick-card__intro">
          <span className="dash-quick-card__icon"><Icon size={20} aria-hidden="true" /></span>
          <h3 id={`dash-${tone}-title`}>{title}</h3>
          <p>{description}</p>
        </div>
        <img className="dash-quick-card__art" src={image} alt="" />
      </header>
      <ul className="dash-quick-card__links">
        {items.map(({ label, href, icon: ItemIcon }) => (
          <li key={label}>
            <Link to={href}>
              <ItemIcon size={18} aria-hidden="true" />
              <span>{label}</span>
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <footer className="dash-quick-card__footer">
        <Link className="dash-quick-card__browse" to={browse.href}>{browse.label}<ArrowRight size={15} aria-hidden="true" /></Link>
        <Link className="dash-quick-card__action" to={action.href}><Plus size={16} aria-hidden="true" />{action.label}</Link>
      </footer>
    </section>
  );
}
