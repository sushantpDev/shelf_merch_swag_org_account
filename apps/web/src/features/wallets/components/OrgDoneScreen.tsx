import { type ReactNode } from "react";
import { Box, Check, Send, Store, Users, Wallet } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { inr } from "@/components/platform/platform-ui";
import walletIconImg from "../../../../assets/wallet-icon.svg";
import { selectedDepartments, type WizardState } from "../types";

function StatusTag({ label, tone = "live" }: { label: string; tone?: "live" | "warn" }) {
  return (
    <span className={tone === "warn" ? "tag tag-warn" : "tag tag-live"}>
      {tone === "live" ? <span className="dot" /> : null}
      {label}
    </span>
  );
}

function StatCard({
  icon,
  label,
  value,
  meta,
  tag,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  meta: string;
  tag?: ReactNode;
}) {
  return (
    <div className="wallet-done-stat">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div className="wallet-done-stat__icon">{icon}</div>
        {tag}
      </div>
      <div className="wallet-done-stat__label">{label}</div>
      <div className="wallet-done-stat__value num">{value}</div>
      <div className="wallet-done-stat__meta">{meta}</div>
    </div>
  );
}

/** Success screen after wallet create or allocate-funds wizard. */
export function OrgDoneScreen({
  account,
  state,
  onGoToDashboard,
}: {
  account: string;
  state: WizardState;
  onGoToDashboard: () => void;
}) {
  const o = state.wallet;
  const isWalletFlow = state.flow === "wallet";
  const depts = selectedDepartments(state.departments);
  const invited = depts.filter(
    (d) => Boolean(d.mgr.email?.trim()) && d.mgr.inviteStatus !== "active",
  ).length;
  const budgetNotified = depts.filter((d) => d.mgr.inviteStatus === "active" && d.mgr.email).length;
  const inviteLinks = state.sentInvites.filter((i) => i.inviteToken);
  const totalAllocated = depts.reduce((sum, d) => sum + (d.allocated || 0), 0);

  function copyInvite(token: string) {
    const link = `${location.origin}/accept-invite?token=${encodeURIComponent(token)}`;
    navigator.clipboard?.writeText(link).then(
      () => toast.success("Invite link copied"),
      () => toast.error("Could not copy link"),
    );
  }

  if (isWalletFlow) {
    const isTopup = state.successSource === "topup";

    if (isTopup) {
      return (
        <div className="funding-success funding-success--topup fade-in">
          <div className="funding-success__copy">
            <div className="funding-success__icon" aria-hidden="true">
              <Check strokeWidth={2.6} />
            </div>
            <p className="funding-success__eyebrow">
              <span className="funding-success__eyebrow-dot" aria-hidden="true" />
              Request received
            </p>
            <h1 className="funding-success__title">
              Funding request <em>submitted.</em>
            </h1>
            <p className="funding-success__lead">
              Our team will review and once approved, funds will be added to{" "}
              <strong>{o.name || "your"}</strong> wallet.
            </p>
            <div className="funding-success__actions">
              <button type="button" className="btn btn-brand btn-lg" onClick={onGoToDashboard}>
                Go to budget dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="funding-success fade-in">
        <div className="funding-success__layout">
          <div className="funding-success__copy">
            <div className="funding-success__icon" aria-hidden="true">
              <Check strokeWidth={2.6} />
            </div>
            <p className="funding-success__eyebrow">
              <span className="funding-success__eyebrow-dot" aria-hidden="true" />
              Request received
            </p>
            <h1 className="funding-success__title">
              Funding request <em>submitted.</em>
            </h1>
            <p className="funding-success__lead">
              ShelfMerch finance is reviewing your purchase order. Once approved,{" "}
              <strong>{inr(o.amount)}</strong> will be added to <strong>{o.name}</strong> and you can
              allocate funds across departments.
            </p>

            <div className="funding-success__amount">
              <span className="funding-success__amount-icon" aria-hidden="true">
                <Wallet size={17} strokeWidth={2} />
              </span>
              <span>
                <strong className="num">{inr(o.amount)}</strong> pending approval
              </span>
            </div>

            <div className="funding-success__actions">
              <Link to="/app/shops/new" className="btn btn-brand btn-lg">
                Create store <Send size={15} />
              </Link>
              <button type="button" className="btn btn-ghost btn-lg" onClick={onGoToDashboard}>
                Go to budget dashboard
              </button>
            </div>

            <div className="funding-success__note">
              <strong>What happens next</strong>
              <p>
                We verify your PO, credit your organization budget, and notify you when you&apos;re
                ready to allocate funds and launch your shop.
              </p>
            </div>
          </div>

          <div className="funding-success__visual" aria-hidden="true">
            <div className="funding-success__shape funding-success__shape--coral" />
            <div className="funding-success__shape funding-success__shape--yellow" />
            <div className="funding-success__shape funding-success__shape--blue" />
            <article className="funding-success__card">
              <span className="funding-success__card-label">Organization budget</span>
              <h3>
                Your merch
                <br />
                wallet
              </h3>
              <div className="funding-success__card-icon">
                <img src={walletIconImg} alt="" />
              </div>
              <div className="funding-success__meter">
                <div>
                  <span className="num">{inr(o.amount)}</span>
                  <small>Requested</small>
                </div>
                <div>
                  <b>Pending</b>
                  <small>Finance review</small>
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wallet-done fade-in">
      <header className="wallet-done-hero">
        <div className="wallet-done-hero__icon" aria-hidden="true">
          <Check />
        </div>
        <div>
          <h1>Allocation complete</h1>
          <p>
            Your organization budget is split across {depts.length} department
            {depts.length === 1 ? "" : "s"}. <strong>{account}</strong> is ready to launch
            campaigns.
          </p>
        </div>
      </header>

      <div className="wallet-done-grid">
        <div>
          <div className="wallet-done-stats">
            <StatCard
              icon={<Wallet size={18} />}
              label="Organization budget"
              value={inr(o.amount)}
              meta={o.name}
              tag={<StatusTag label="Active" />}
            />
            <StatCard
              icon={<Box size={18} />}
              label="Allocated"
              value={inr(totalAllocated)}
              meta={`Across ${depts.length} department${depts.length === 1 ? "" : "s"}`}
              tag={<StatusTag label="Done" />}
            />
            <StatCard
              icon={<Users size={18} />}
              label="Managers"
              value={String(depts.filter((d) => d.mgr.email).length)}
              meta={
                invited && budgetNotified
                  ? `${invited} invitation${invited === 1 ? "" : "s"} · ${budgetNotified} budget notification${budgetNotified === 1 ? "" : "s"}`
                  : invited
                    ? "Invitation emails sent — check spam if not received"
                    : budgetNotified
                      ? "Budget allocation emails sent to active managers"
                      : "No manager emails sent"
              }
              tag={
                invited > 0 || budgetNotified > 0 ? (
                  <StatusTag label={invited > 0 ? "Sent" : "Notified"} />
                ) : undefined
              }
            />
          </div>

          {depts.length > 0 && (
            <div className="wallet-done-panel card">
              <div className="wallet-done-panel__head">Department breakdown</div>
              {depts.map((d) => (
                <div key={String(d.id)} className="wallet-done-dept">
                  <div className="wallet-done-dept__name">
                    <span className="wallet-done-dept__sw" style={{ background: d.color }} />
                    {d.name}
                  </div>
                  <div className="num">{inr(d.allocated)}</div>
                  <div className="muted" style={{ fontSize: "var(--workspace-font-caption, 12.5px)" }}>
                    {d.mgr.name || d.mgr.email || "Manager not assigned"}
                  </div>
                  <div>
                    {d.mgr.inviteStatus === "active" && d.mgr.email ? (
                      <StatusTag label="Budget allocated" />
                    ) : d.mgr.email ? (
                      <StatusTag label="Invited" />
                    ) : (
                      <span className="tag tag-draft">No manager</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {inviteLinks.length > 0 && (
            <div className="wallet-done-panel card" style={{ marginTop: 18 }}>
              <div className="wallet-done-panel__head">Invite links (dev)</div>
              <div className="wallet-done-invites">
                <p className="mut3" style={{ fontSize: "var(--workspace-font-caption, 12px)", margin: "0 0 12px" }}>
                  Gmail often filters localhost invite links to spam. Share these links directly if
                  needed.
                </p>
                {inviteLinks.map((i) => (
                  <div key={i.inviteToken} className="wallet-done-invite">
                    <div style={{ fontWeight: "var(--font-weight-semibold)", fontSize: "var(--workspace-font-body, 13px)", marginBottom: 4 }}>
                      {i.name || i.email} · {i.entityName}
                    </div>
                    <div className="mut3" style={{ fontSize: "var(--workspace-font-caption, 11.5px)", wordBreak: "break-all" }}>
                      {`${location.origin}/accept-invite?token=${i.inviteToken}`}
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ marginTop: 8 }}
                      onClick={() => copyInvite(i.inviteToken!)}
                    >
                      Copy invite link
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="wallet-done-aside">
          <div className="wallet-done-next">
            <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
              <div className="logo-chip" style={{ width: 40, height: 40, flex: "none" }}>
                <Store size={20} color="var(--brand)" />
              </div>
              <div>
                <div className="wallet-done-next__k">Recommended next step</div>
                <div className="wallet-done-next__title">Create your company store</div>
                <p className="wallet-done-next__body">
                  Set up a storefront so departments can send kits, points, and gifts to recipients.
                </p>
              </div>
            </div>
          </div>

          <div className="wallet-done-actions">
            <Link to="/app/shops/new" className="btn btn-brand btn-lg">
              Create store <Send size={15} />
            </Link>
            <button type="button" className="btn btn-ghost btn-lg" onClick={onGoToDashboard}>
              Go to wallet dashboard
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
