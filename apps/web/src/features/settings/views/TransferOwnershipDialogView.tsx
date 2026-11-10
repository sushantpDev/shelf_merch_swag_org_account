import { Link } from "react-router";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, ShieldAlert, Users } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { TransferOwnershipVm } from "../controllers/useTransferOwnershipController";

/* ── helpers ─────────────────────────────────────────────────────── */

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const AVATAR_PALETTES: [string, string][] = [
  ["var(--brand-50)", "var(--brand)"],
  ["#EAF1FB", "#2563C9"],
  ["#F5EAF5", "#7C3A9E"],
  ["#FFF3E0", "#C97A20"],
];

function UserAvatar({ name, size = 36 }: { name: string; size?: number }) {
  const [bg, fg] = AVATAR_PALETTES[name.charCodeAt(0) % AVATAR_PALETTES.length];
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        color: fg,
        display: "grid",
        placeItems: "center",
        fontWeight: "var(--font-weight-bold)",
        fontSize: Math.round(size * 0.36),
        flexShrink: 0,
        letterSpacing: "0.02em",
      }}
    >
      {getInitials(name)}
    </div>
  );
}

/* ── view ────────────────────────────────────────────────────────── */

export function TransferOwnershipDialogView(vm: TransferOwnershipVm) {
  const { currentOwner, selected, confirming, pending, loadingUsers, eligible } = vm;

  return (
    <AlertDialog open={vm.open} onOpenChange={vm.onOpenChange}>
      <AlertDialogContent
        style={{
          maxWidth: 480,
          padding: 0,
          overflow: "hidden",
          borderRadius: "var(--r-lg, 22px)",
          border: "1px solid var(--line)",
          boxShadow: "var(--sh-3)",
        }}
      >
        {/* ── Gradient header ───────────────────────────────────── */}
        <div
          style={{
            background: confirming
              ? "linear-gradient(135deg, #FBEDEB 0%, #FFF7F6 100%)"
              : "linear-gradient(135deg, var(--brand-50) 0%, #ffffff 100%)",
            padding: "24px 28px 20px",
            borderBottom: "1px solid var(--line-2)",
            transition: "background 0.3s ease",
          }}
        >
          <AlertDialogHeader>
            {/* Icon badge */}
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: confirming ? "#FBEDEB" : "var(--brand-50)",
                border: `1.5px solid ${confirming ? "#F5C5C0" : "var(--brand-100)"}`,
                display: "grid",
                placeItems: "center",
                marginBottom: 14,
                transition: "all 0.3s ease",
              }}
            >
              {confirming ? (
                <ShieldAlert size={22} style={{ color: "var(--danger)" }} />
              ) : (
                <Users size={22} style={{ color: "var(--brand)" }} />
              )}
            </div>

            <AlertDialogTitle
              style={{
                fontSize: 18,
                fontFamily: "var(--font-family-primary)",
                fontWeight: "var(--font-weight-bold)",
                color: "var(--ink)",
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
              }}
            >
              {confirming ? "Confirm transfer" : "Transfer workspace ownership"}
            </AlertDialogTitle>

            <p
              style={{
                fontSize: "var(--workspace-font-body, 13.5px)",
                color: "var(--ink-2)",
                lineHeight: 1.6,
                marginTop: 6,
              }}
            >
              {confirming && selected ? (
                <>
                  You are about to transfer ownership to{" "}
                  <strong style={{ color: "var(--ink)" }}>{selected.name}</strong>. You will remain
                  a company admin but will lose owner privileges.
                </>
              ) : (
                <>
                  Choose an active company admin to become the new workspace owner. Billing and
                  wallet notifications will move to the new owner.
                </>
              )}
            </p>
          </AlertDialogHeader>
        </div>

        {/* ── Body ──────────────────────────────────────────────── */}
        <div style={{ padding: "20px 28px" }}>
          {!confirming ? (
            /* Step 1 — pick a user */
            <>
              {loadingUsers ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    color: "var(--ink-3)",
                    fontSize: "var(--workspace-font-body, 13.5px)",
                    padding: "8px 0",
                  }}
                >
                  <Loader2 size={16} style={{ animation: "tod-spin 1s linear infinite" }} />
                  Loading admins…
                </div>
              ) : eligible.length === 0 ? (
                <div
                  style={{
                    background: "var(--info-50)",
                    border: "1px solid #C7DBF7",
                    borderRadius: "var(--r-sm)",
                    padding: "14px 16px",
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                  }}
                >
                  <AlertTriangle
                    size={16}
                    style={{ color: "var(--info)", flexShrink: 0, marginTop: 2 }}
                  />
                  <p style={{ fontSize: "var(--workspace-font-body, 13.5px)", color: "var(--ink-2)", lineHeight: 1.6 }}>
                    No other active company admins in this workspace.{" "}
                    <Link to="/app/contacts" className="lnk" onClick={vm.onInviteAdmin}>
                      Invite an admin
                    </Link>{" "}
                    first, then return here to transfer ownership.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="lbl" style={{ marginBottom: 8 }}>
                    New owner
                  </label>
                  {/* Radio-card list */}
                  <div
                    role="listbox"
                    aria-label="Select new owner"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      maxHeight: 224,
                      overflowY: "auto",
                    }}
                  >
                    {eligible.map((u) => {
                      const isSelected = u.id === vm.selectedId;
                      return (
                        <button
                          key={u.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => vm.onSelect(u.id)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            padding: "10px 14px",
                            borderRadius: "var(--r-sm)",
                            border: `1.5px solid ${isSelected ? "var(--brand)" : "var(--line)"}`,
                            background: isSelected ? "var(--brand-50)" : "#fff",
                            cursor: "pointer",
                            textAlign: "left",
                            transition: "all 0.15s ease",
                            width: "100%",
                            boxShadow: isSelected ? "0 0 0 3px var(--brand-100)" : "none",
                          }}
                        >
                          <UserAvatar name={u.name} size={36} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: "var(--font-weight-semibold)",
                                fontSize: "var(--workspace-font-body, 13.5px)",
                                color: "var(--ink)",
                                lineHeight: 1.3,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {u.name}
                            </div>
                            <div
                              style={{
                                fontSize: "var(--workspace-font-caption, 12px)",
                                color: "var(--ink-3)",
                                marginTop: 2,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {u.email}
                            </div>
                          </div>
                          {isSelected && (
                            <CheckCircle2
                              size={18}
                              style={{ color: "var(--brand)", flexShrink: 0 }}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Current owner footer strip */}
              {!loadingUsers && (
                <div
                  style={{
                    marginTop: 18,
                    paddingTop: 18,
                    borderTop: "1px solid var(--line-2)",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: "var(--workspace-font-caption, 11px)",
                      color: "var(--ink-3)",
                      fontWeight: "var(--font-weight-bold)",
                      letterSpacing: "0.07em",
                      textTransform: "uppercase",
                      flexShrink: 0,
                    }}
                  >
                    Current owner
                  </span>
                  <UserAvatar name={currentOwner.name} size={22} />
                  <span
                    style={{
                      fontSize: "var(--workspace-font-body, 13px)",
                      color: "var(--ink-2)",
                      fontWeight: "var(--font-weight-semibold)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {currentOwner.name}
                  </span>
                </div>
              )}
            </>
          ) : (
            /* Step 2 — confirm */
            selected && (
              <div
                style={{
                  background: "#FFF7F6",
                  border: "1px solid #F5C5C0",
                  borderRadius: "var(--r-sm)",
                  padding: "16px 18px",
                }}
              >
                {/* Transfer ownership diagram */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    marginBottom: 16,
                  }}
                >
                  <div style={{ textAlign: "center" }}>
                    <UserAvatar name={currentOwner.name} size={42} />
                    <div
                      style={{
                        fontSize: "var(--workspace-font-caption, 11px)",
                        color: "var(--ink-3)",
                        marginTop: 5,
                        fontWeight: "var(--font-weight-semibold)",
                      }}
                    >
                      You (owner)
                    </div>
                  </div>
                  <ArrowRight size={20} style={{ color: "var(--danger)", flexShrink: 0 }} />
                  <div style={{ textAlign: "center" }}>
                    <UserAvatar name={selected.name} size={42} />
                    <div
                      style={{
                        fontSize: "var(--workspace-font-caption, 11px)",
                        color: "var(--brand-d)",
                        marginTop: 5,
                        fontWeight: "var(--font-weight-semibold)",
                      }}
                    >
                      New owner
                    </div>
                  </div>
                </div>

                {/* Warning box */}
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    padding: "10px 12px",
                    background: "rgba(193,59,48,.07)",
                    borderRadius: 8,
                    border: "1px solid rgba(193,59,48,.15)",
                  }}
                >
                  <AlertTriangle
                    size={14}
                    style={{ color: "var(--danger)", flexShrink: 0, marginTop: 1 }}
                  />
                  <p style={{ fontSize: "var(--workspace-font-body, 12.5px)", color: "#8B2520", lineHeight: 1.6 }}>
                    This action <strong>cannot be undone</strong>. <strong>{selected.name}</strong>{" "}
                    ({selected.email}) will become the new workspace owner.
                  </p>
                </div>
              </div>
            )
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────── */}
        <AlertDialogFooter
          style={{
            padding: "14px 28px 22px",
            display: "flex",
            flexDirection: "row",
            justifyContent: "flex-end",
            gap: 10,
            borderTop: "1px solid var(--line-2)",
          }}
        >
          {confirming ? (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={pending}
                onClick={vm.onBack}
                style={{ minWidth: 80 }}
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={pending}
                onClick={vm.onConfirm}
                style={{
                  background: "var(--danger)",
                  color: "#fff",
                  minWidth: 160,
                  justifyContent: "center",
                }}
              >
                {pending ? (
                  <>
                    <Loader2 size={14} style={{ animation: "tod-spin 1s linear infinite" }} />
                    Transferring…
                  </>
                ) : (
                  <>
                    <ShieldAlert size={14} />
                    Transfer ownership
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => vm.onOpenChange(false)}
                style={{ minWidth: 80 }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-brand btn-sm"
                disabled={!selected || loadingUsers}
                onClick={vm.onContinue}
                style={{ minWidth: 110, justifyContent: "center" }}
              >
                Continue
                <ArrowRight size={14} />
              </button>
            </>
          )}
        </AlertDialogFooter>

        <style>{`
          @keyframes tod-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
        `}</style>
      </AlertDialogContent>
    </AlertDialog>
  );
}
