import { useEffect, type ReactNode } from "react";
import { Link, Outlet, useLocation } from "react-router";
import {
  getStoredUser,
  isAuthenticated,
  isPlatformUser,
  logout,
  logoutEverywhere,
} from "@/services/api-bridge";
import { navItemsForRole, type PlatformNavItem } from "@/services/platform-access";
import { ShelfMerchLogo } from "@/components/brand/ShelfMerchLogo";
import { NotificationBell } from "@/components/notifications/NotificationBell";

type NavGroup = { section: string | null; items: PlatformNavItem[] };

function groupNavItems(items: PlatformNavItem[]): NavGroup[] {
  const groups: NavGroup[] = [];
  for (const item of items) {
    const section = item.section ?? null;
    const last = groups[groups.length - 1];
    if (last && last.section === section) {
      last.items.push(item);
    } else {
      groups.push({ section, items: [item] });
    }
  }
  return groups;
}

function NavLink({ item, active }: { item: PlatformNavItem; active: boolean }) {
  return (
    <Link to={item.path} className={`nav-item${active ? " on" : ""}`}>
      <span className="nav-item-label">{item.label}</span>
    </Link>
  );
}

export default function PlatformLayout() {
  const user = getStoredUser();
  const pathname = useLocation().pathname;
  const navItems = navItemsForRole(user?.role);
  const groups = groupNavItems(navItems);

  useEffect(() => {
    if (!isAuthenticated() || !isPlatformUser(user)) {
      window.location.href = "/";
    }
  }, [user?.id, user?.role, user?.scopeType]);

  async function onLogout() {
    await logout().catch(() => {});
  }

  async function onLogoutEverywhere() {
    await logoutEverywhere().catch(() => {});
  }

  if (!user || !isPlatformUser(user)) return null;

  return (
    <div id="app" style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <header className="topbar">
        <div className="brandmark">
          <ShelfMerchLogo height={32} />
          <div>
            <div className="v" style={{ fontFamily: "var(--font-family-primary)", fontWeight: "var(--font-weight-bold)", fontSize: 16 }}>
              Control Plane
            </div>
          </div>
        </div>
        <div className="spacer" />
        <NotificationBell />
        <div className="acct">
          <div>
            <div className="k">Signed in</div>
            <div className="v" style={{ fontSize: 14 }}>
              {user.name}
            </div>
          </div>
          <div className="avatar">{user.name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")}</div>
        </div>
        <Link to="/" className="btn btn-ghost btn-sm">
          Tenant app
        </Link>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onLogout}>
          Sign out
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onLogoutEverywhere}>
          Sign out all devices
        </button>
      </header>

      <div className="body">
        <aside className="sidebar scroll" aria-label="Platform navigation">
          {groups.map((group) => {
            const links: ReactNode = group.items.map((item) => {
              const active = pathname === item.path || pathname.startsWith(`${item.path}/`);
              return <NavLink key={item.path} item={item} active={active} />;
            });

            if (!group.section) {
              return (
                <div key="top" className="sidebar-group sidebar-group--top">
                  {links}
                </div>
              );
            }

            return (
              <div key={group.section} className="sidebar-group">
                <div className="nav-sec" role="presentation">
                  {group.section}
                </div>
                <div className="sidebar-group-links">{links}</div>
              </div>
            );
          })}
        </aside>

        <main className="main scroll">
          <div className="wrap">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
