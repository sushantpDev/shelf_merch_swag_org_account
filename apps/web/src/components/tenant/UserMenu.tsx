import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Check, Globe, HelpCircle, User } from "lucide-react";
import { toast } from "sonner";
import { logout, logoutEverywhere } from "@/services/api-bridge";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { tenantPath } from "@/lib/workspaceSlug";

function TopbarChevron({ open }: { open: boolean }) {
  return (
    <svg
      className="topbar-chevron"
      width={11}
      height={11}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      aria-hidden="true"
      style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s ease" }}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

type UserMenuProps = {
  userName: string;
  userEmail: string;
  workspaceName: string;
  workspaceLogoUrl: string;
  initials: string;
  truncName: string;
};

export function UserMenu({
  userName,
  userEmail,
  workspaceName,
  workspaceLogoUrl,
  initials,
  truncName,
}: UserMenuProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    setOpen(false);
  }

  function onLogout() {
    close();
    void logout();
  }

  function onLogoutEverywhere() {
    close();
    void logoutEverywhere();
  }

  const workspaceLabel = workspaceName.toLowerCase();

  return (
    <div className="user-menu-wrap">
      <button
        type="button"
        className="topbar-user"
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="topbar-user-avatar">{initials}</span>
        <span className="topbar-user-copy">
          <span className="topbar-user-name">{truncName}</span>
          <span className="topbar-user-sub">{workspaceLabel}</span>
        </span>
        <TopbarChevron open={open} />
      </button>

      {open ? (
        <>
          <button type="button" className="user-menu-scrim" aria-label="Close menu" onClick={close} />
          <div className="user-menu-panel" role="menu" onClick={(e) => e.stopPropagation()}>
            <div className="user-menu-head">
              <div className="user-menu-name">{userName}</div>
              <div className="user-menu-email">{userEmail}</div>
            </div>

            <div className="user-menu-body">
              <Link to={tenantPath("/settings")} className="user-menu-link" role="menuitem" onClick={close}>
                Account Settings
              </Link>
              <button
                type="button"
                className="user-menu-link"
                role="menuitem"
                onClick={() => {
                  close();
                  toast("Accessibility support: contact support@shelfmerch.com");
                }}
              >
                Accessibility Support
              </button>

              <div className="user-menu-divider" />

              <button type="button" className="user-menu-ws on" role="menuitem">
                <span className="user-menu-ws-icon">
                  {workspaceLogoUrl ? (
                    <img
                      src={resolveMediaUrl(workspaceLogoUrl)}
                      alt=""
                      style={{ width: 18, height: 18, objectFit: "contain" }}
                    />
                  ) : (
                    <Globe size={16} strokeWidth={2} />
                  )}
                </span>
                <span className="user-menu-ws-label">{workspaceLabel}</span>
                <span className="user-menu-ws-meta">
                  Default <Check size={14} strokeWidth={2.5} />
                </span>
              </button>

              {/* <button
                type="button"
                className="user-menu-ws"
                role="menuitem"
                onClick={() => {
                  close();
                  toast("Personal workspace coming soon");
                }}
              >
                <span className="user-menu-ws-icon">
                  <User size={16} strokeWidth={2} />
                </span>
                <span className="user-menu-ws-label">Personal Workspace</span>
              </button> */}

              {/* <button
                type="button"
                className="user-menu-create"
                onClick={() => {
                  close();
                  toast("Workspace creation coming soon");
                }}
              >
                + Create new workspace
              </button> */}
            </div>

            <div className="user-menu-foot">
              <button
                type="button"
                className="user-menu-help"
                onClick={() => {
                  close();
                  window.location.href = "mailto:support@shelfmerch.com";
                }}
              >
                <HelpCircle />
                Help center
              </button>
              <button type="button" className="user-menu-logout" onClick={onLogout}>
                Logout
              </button>
              <button type="button" className="user-menu-logout" onClick={onLogoutEverywhere}>
                Log out all devices
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
