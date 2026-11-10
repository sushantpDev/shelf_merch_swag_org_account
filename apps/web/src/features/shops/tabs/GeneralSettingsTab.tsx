import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { UiShop } from "@/services/mappers";
import { useUpdateShop } from "../model";

const SETTINGS_SECTIONS = [
  "General Settings",
  "Swag Settings",
  "SEO",
  "Integrations",
  "Link & Privacy",
  "Customizations",
  "Shop Users",
] as const;

function normalizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/^@/, "");
}

export function GeneralSettingsTab({ shop }: { shop: UiShop }) {
  const updateShop = useUpdateShop();
  const [name, setName] = useState(shop.name);
  const [companyEmailDomain, setCompanyEmailDomain] = useState(shop.companyEmailDomain || "");

  useEffect(() => {
    setName(shop.name);
    setCompanyEmailDomain(shop.companyEmailDomain || "");
  }, [shop]);

  const dirty =
    name.trim() !== shop.name ||
    normalizeDomain(companyEmailDomain) !== normalizeDomain(shop.companyEmailDomain || "");
  const currencyDescription =
    shop.currencyMode === "inr"
      ? "Product prices in this store are shown in Indian Rupees (₹). Recipients see Credits."
      : "Product prices in this store are shown in Points.";

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Shop name is required");
      return;
    }
    const domain = normalizeDomain(companyEmailDomain);
    if (domain && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
      toast.error("Enter a valid domain, like company.com");
      return;
    }
    try {
      await updateShop.mutateAsync({
        shopId: shop.id,
        input: { name: trimmed, companyEmailDomain: domain },
      });
      toast.success("Shop settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    }
  }

  return (
    <div
      className="card"
      style={{
        padding: 24,
        display: "grid",
        gridTemplateColumns: "220px minmax(0, 1fr)",
        gap: 28,
        alignItems: "start",
      }}
    >
      <div
        style={{
          borderRight: "1px solid var(--line)",
          paddingRight: 18,
        }}
      >
        {SETTINGS_SECTIONS.map((section) => {
          const active = section === "General Settings";
          return (
            <div
              key={section}
              style={{
                padding: "11px 14px",
                borderRadius: 10,
                marginBottom: 6,
                fontSize: "var(--workspace-font-caption, 12px)",
                fontWeight: active ? "var(--font-weight-bold)" : "var(--font-weight-semibold)",
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: active ? "var(--ink)" : "var(--ink-3)",
                background: active ? "var(--surface-2)" : "transparent",
              }}
            >
              {section}
            </div>
          );
        })}
      </div>

      <div style={{ maxWidth: 560 }}>
        <h3 style={{ fontSize: 28, marginBottom: 26 }}>General Settings</h3>

        <div className="field">
          <label className="lbl">Shop Name</label>
          <input className="inp" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="field" style={{ marginTop: 18 }}>
          <label className="lbl">Store currency</label>
          <input className="inp" value={shop.currency} readOnly disabled />
        </div>

        <div className="muted" style={{ fontSize: "var(--workspace-font-caption, 12px)", margin: "2px 0 22px", lineHeight: 1.55 }}>
          {currencyDescription} Store currency is locked and cannot be changed after creation.
        </div>

        <div className="field">
          <label className="lbl">Company email domain</label>
          <input
            className="inp"
            value={companyEmailDomain}
            placeholder="company.com"
            onChange={(e) => setCompanyEmailDomain(e.target.value.replace(/^@/, ""))}
          />
        </div>
        <div className="muted" style={{ fontSize: "var(--workspace-font-caption, 12px)", margin: "2px 0 22px", lineHeight: 1.55 }}>
          Public storefront signups must use an email at this domain. Platform allowlisted emails
          can always create accounts on any store. Leave blank to disable public signup until set.
        </div>

        <button
          type="button"
          className="btn btn-brand"
          disabled={!dirty || updateShop.isPending}
          onClick={save}
        >
          {updateShop.isPending ? "Saving..." : "Save changes"}
        </button>
      </div>
    </div>
  );
}
