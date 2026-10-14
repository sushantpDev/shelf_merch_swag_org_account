import { useRef } from "react";
import { ExternalLink, Upload } from "lucide-react";
import { PageHeader } from "@/components/tenant/PageHeader";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import type { SettingsVm } from "../controllers/useSettingsController";
import { TransferOwnershipDialog } from "../TransferOwnershipDialog";
import "../settings-page.css";

function ownerInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Settings screen: side tabs + workspace form or SSO instructions. */
export function SettingsView(vm: SettingsVm) {
  return (
    <div className="settings-page">
      <PageHeader
        title="Settings"
        subtitle="Manage your workspace, ownership, currency and single sign-on."
      />

      <div className="settings-layout">
        <div className="subrail settings-rail" role="tablist" aria-label="Settings sections">
          {(
            [
              ["workspace", "Workspace settings"],
              ["sso", "SSO"],
            ] as const
          ).map(([key, label]) => (
            <button
              type="button"
              key={key}
              role="tab"
              aria-selected={vm.tab === key}
              className={`item${vm.tab === key ? " on" : ""}`}
              onClick={() => vm.onTab(key)}
            >
              <span className="item-label">{label}</span>
            </button>
          ))}
        </div>

        <div className="settings-main">
          {vm.tab === "workspace" ? <WorkspaceSettingsView {...vm} /> : <SsoSettingsView {...vm} />}
        </div>
      </div>
    </div>
  );
}

function WorkspaceSettingsView(vm: SettingsVm) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="settings-panel">
      <div className="settings-panel__head">
        <h2 className="settings-panel__title">Workspace Settings</h2>
        <p className="settings-panel__sub">
          Update how your company appears across Shelf Merch for every member.
        </p>
      </div>

      <section className="settings-section">
        <label className="settings-section__label" htmlFor="ws-name">
          Workspace name
        </label>
        <div className="settings-field">
          <input
            id="ws-name"
            className="inp"
            value={vm.name}
            onChange={(e) => vm.onName(e.target.value)}
            readOnly={!vm.canEditWorkspace}
          />
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section__label">Workspace icon</div>
        <p className="settings-section__hint">
          Used as the company icon on member profiles across the workspace.
        </p>
        <div className="settings-section__body">
          {vm.logoUrl ? (
            <div className="settings-logo" style={{ padding: 6 }}>
              <img src={resolveMediaUrl(vm.logoUrl)} alt="Workspace icon" />
            </div>
          ) : null}
          {vm.canEditWorkspace ? (
            <button
              type="button"
              className="settings-upload"
              disabled={vm.isUploading}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={15} /> {vm.isUploading ? "Uploading…" : "Upload"}
            </button>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept=".svg,.png,.webp,.jpeg,.jpg,image/svg+xml,image/png,image/webp,image/jpeg"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) vm.onPickLogo(file);
              e.target.value = "";
            }}
          />
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section__label">Owner</div>
        <div className="settings-section__body">
          {vm.displayOwner ? (
            <div className="settings-owner">
              <span className="settings-owner__avatar" aria-hidden="true">
                {ownerInitials(vm.displayOwner.name)}
              </span>
              <div className="settings-owner__meta">
                <span className="settings-owner__name">{vm.displayOwner.name}</span>
                {vm.displayOwner.email ? (
                  <span className="settings-owner__email">{vm.displayOwner.email}</span>
                ) : null}
              </div>
            </div>
          ) : (
            <span className="muted" style={{ fontSize: 14 }}>
              No owner assigned
            </span>
          )}
          {vm.isCurrentOwner && vm.displayOwner && vm.canEditWorkspace ? (
            <button type="button" className="settings-link" onClick={() => vm.onTransferOpenChange(true)}>
              Transfer ownership <ExternalLink size={14} />
            </button>
          ) : null}
        </div>

        {vm.displayOwner && vm.isCurrentOwner ? (
          <TransferOwnershipDialog
            open={vm.transferOpen}
            onOpenChange={vm.onTransferOpenChange}
            currentOwner={vm.displayOwner}
          />
        ) : null}
      </section>

      <section className="settings-section">
        <div className="settings-section__label">Workspace currency</div>
        <p className="settings-section__hint">
          Default currency for the main workspace wallet and any refunds.
        </p>
        <div className="settings-section__body">
          <span className="settings-currency">INR</span>
          <button type="button" className="settings-link" onClick={vm.onChangeCurrency}>
            Change <ExternalLink size={14} />
          </button>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section__label">Workspace URL</div>
        <div className="settings-url">
          <span className="settings-url__prefix">app.shelfmerch.io/</span>
          <input
            aria-label="Workspace URL slug"
            className="inp"
            value={vm.slug}
            onChange={(e) => vm.onSlug(e.target.value)}
            readOnly={!vm.canEditWorkspace}
          />
        </div>
      </section>

      {vm.canEditWorkspace ? (
        <div className="settings-actions">
          <button
            type="button"
            className="btn btn-brand"
            disabled={vm.isSaving || vm.isUploading}
            onClick={vm.onSave}
          >
            {vm.isSaving ? "Saving…" : "Save changes"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SsoSettingsView(vm: SettingsVm) {
  return (
    <div className="settings-panel">
      <div className="settings-panel__head">
        <h2 className="settings-panel__title">SSO</h2>
        <p className="settings-panel__sub">
          Enable single sign-on for a faster, more secure login. Available on enterprise packages or
          as an add-on.
        </p>
      </div>

      <div className="settings-section">
        <p className="settings-sso__intro">
          Follow these steps to connect your identity provider.{" "}
          <button type="button" className="settings-link" onClick={vm.onSsoLearnMore}>
            Learn more <ExternalLink size={14} />
          </button>
        </p>

        <ol className="settings-sso__steps">
          <li className="settings-sso__step">
            Find our metadata at{" "}
            <a
              className="settings-link"
              href="https://account.shelfmerch.io/saml/metadata"
              target="_blank"
              rel="noreferrer"
            >
              https://account.shelfmerch.io/saml/metadata
            </a>
          </li>
          <li className="settings-sso__step">
            Create a custom SSO app on your IdP (Okta, Azure, etc.) using the ACS URL, Entity ID,
            Certificate and Attributes listed in the metadata above.
          </li>
          <li className="settings-sso__step">
            Once the app setup is done, email <b>sso@shelfmerch.io</b> with:
            <ul className="settings-sso__list">
              <li>Single Sign-On URL</li>
              <li>Single Logout URL (optional)</li>
              <li>Entity ID</li>
              <li>Certificate</li>
            </ul>
          </li>
          <li className="settings-sso__step">
            Leave everything else to us. After we receive the details, we&apos;ll configure SSO in
            our backend, typically <b>4 to 6 business days</b>. Once enabled for your email domain,
            users on that domain are redirected to your IdP immediately.
          </li>
        </ol>

        <p className="settings-sso__note">
          For further queries, please{" "}
          <button type="button" className="settings-link" onClick={vm.onSsoContact}>
            contact us
          </button>
          .
        </p>
      </div>
    </div>
  );
}
