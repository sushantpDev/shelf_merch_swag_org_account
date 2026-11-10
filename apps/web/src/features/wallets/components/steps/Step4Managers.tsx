import { useState } from "react";
import { inr } from "@/components/platform/platform-ui";
import { managerMobileDigits, validateManager, type ManagerField } from "../../managerValidation";
import { ORG_ROLES, selectedDepartments, wizardTargetAllocation } from "../../types";
import type { StepProps } from "./StepProps";

function managerFooter(inviteStatus: string | undefined, hasEmail: boolean) {
  if (inviteStatus === "active") {
    return {
      title: "Budget will be allocated",
      detail:
        "This manager already has an active account. Extra budget is added to their wallet. They keep the same password and do not set a new one.",
      badge: "Active",
      badgeClass: "tag-live",
      showInviteToggle: false,
    } as const;
  }
  if (hasEmail) {
    return {
      title: "Send invitation",
      detail: "Email the manager an invite to activate their account",
      badge: "Invite",
      badgeClass: "tag-ready",
      showInviteToggle: true,
    } as const;
  }
  return null;
}

export function Step4Managers({ state, dispatch, showErrors = false }: StepProps & { showErrors?: boolean }) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  return (
    <>
      {selectedDepartments(state.departments).map((d) => {
        const hasEmail = Boolean(d.mgr.email?.trim());
        const active = d.mgr.inviteStatus === "active";
        const footer = managerFooter(d.mgr.inviteStatus, hasEmail);
        const errors = validateManager(d.mgr);
        const fieldProps = (field: ManagerField) => {
          const id = `mgr-${field}-${d.id}`;
          const invalid = Boolean(errors[field] && (showErrors || touched[id]));
          return {
            "aria-invalid": invalid,
            "aria-describedby": invalid ? `${id}-error` : undefined,
            onBlur: () => setTouched((previous) => ({ ...previous, [id]: true })),
          };
        };
        const fieldError = (field: ManagerField) => fieldProps(field)["aria-invalid"] ? (
          <p id={`mgr-${field}-${d.id}-error`} className="mgr-field-error" role="alert">{errors[field]}</p>
        ) : null;
        return (
        <div key={d.id} className="mgr-card">
          <div className="mgr-head">
            <div
              className="dc-swatch"
              style={{ background: d.color, width: 30, height: 30, fontSize: 13 }}
            >
              {d.name.charAt(0)}
            </div>
            <div style={{ fontWeight: "var(--font-weight-bold)", fontSize: 18 }}>{d.name}</div>
            <div className="mb">
              Budget <b>{inr(wizardTargetAllocation(d))}</b>
            </div>
            {footer && <span className={`tag ${footer.badgeClass}`} style={{ marginLeft: 8 }}>
              {footer.badge}
            </span>}
          </div>
          <div className="mgr-body" style={{ display: "block", padding: 18 }}>
            <div className="mgr-fields" style={{ marginBottom: 14 }}>
              <div className="field" style={{ flex: 1, margin: 0 }}>
                <label className="lbl" htmlFor={`mgr-name-${d.id}`}>
                  Manager name
                </label>
                <input
                  id={`mgr-name-${d.id}`}
                  {...fieldProps("name")}
                  required
                  maxLength={100}
                  autoComplete="name"
                  className="inp"
                  value={d.mgr.name}
                  placeholder="Full name"
                  onChange={(e) =>
                    dispatch({ type: "mgrField", id: d.id, field: "name", value: e.target.value })
                  }
                />
                {fieldError("name")}
              </div>
              <div className="field" style={{ flex: 1, margin: 0 }}>
                <label className="lbl" htmlFor={`mgr-role-${d.id}`}>
                  Role
                </label>
                <input
                  id={`mgr-role-${d.id}`}
                  {...fieldProps("role")}
                  maxLength={100}
                  className="inp"
                  list={`mgr-role-options-${d.id}`}
                  value={d.mgr.role}
                  placeholder="Select or type a role"
                  autoComplete="off"
                  onChange={(e) =>
                    dispatch({ type: "mgrField", id: d.id, field: "role", value: e.target.value })
                  }
                />
                <datalist id={`mgr-role-options-${d.id}`}>
                  {ORG_ROLES.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
                {fieldError("role")}
              </div>
            </div>
            <div className="mgr-fields">
              <div className="field" style={{ flex: 1, margin: 0 }}>
                <label className="lbl" htmlFor={`mgr-email-${d.id}`}>
                  Email
                </label>
                <input
                  id={`mgr-email-${d.id}`}
                  {...fieldProps("email")}
                  required
                  maxLength={254}
                  autoComplete="email"
                  className="inp"
                  type="email"
                  value={d.mgr.email}
                  placeholder="name@company.net"
                  disabled={active}
                  onChange={(e) =>
                    dispatch({ type: "mgrField", id: d.id, field: "email", value: e.target.value })
                  }
                />
                {fieldError("email")}
              </div>
              <div className="field" style={{ flex: 1, margin: 0 }}>
                <label className="lbl" htmlFor={`mgr-mobile-${d.id}`}>
                  Mobile
                </label>
                <div className="mgr-mobile-control" data-invalid={fieldProps("mobile")["aria-invalid"]}>
                  <span className="mgr-mobile-prefix" aria-hidden="true">+91</span>
                <input
                  id={`mgr-mobile-${d.id}`}
                  {...fieldProps("mobile")}
                  aria-label="Mobile number, country code +91"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  value={managerMobileDigits(d.mgr.mobile)}
                  placeholder="98765 43210"
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!/^[\d\s()+-]*$/.test(value)) return;
                    const digits = managerMobileDigits(value);
                    if (!/^\d{0,10}$/.test(digits)) return;
                    dispatch({ type: "mgrField", id: d.id, field: "mobile", value: digits });
                  }}
                />
                </div>
                {fieldError("mobile")}
              </div>
            </div>
          </div>
          {footer && <div
            className="row"
            style={{
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
              padding: "14px 18px",
              borderTop: "1px solid var(--line)",
              background: "#fff",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: "var(--font-weight-semibold)", fontSize: 16 }}>{footer.title}</div>
              <div className="mut3" style={{ fontSize: 14, marginTop: 4, lineHeight: 1.45 }}>
                {footer.detail}
              </div>
            </div>
            {footer.showInviteToggle ? (
              <button
                type="button"
                role="switch"
                aria-checked={d.mgr.invite !== false}
                aria-label={`Send invitation to ${d.name} manager`}
                className={`switch ${d.mgr.invite !== false ? "on" : ""}`}
                onClick={() => dispatch({ type: "toggleInvite", id: d.id })}
              />
            ) : (
              <span className={`tag ${footer.badgeClass}`} style={{ flexShrink: 0 }}>
                {footer.badge}
              </span>
            )}
          </div>}
        </div>
        );
      })}
    </>
  );
}
