import { useEffect, useState, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import type { UiWallet } from "@/services/mappers";
import { tenantPath } from "@/lib/workspaceSlug";
import walletIconImg from "../../../assets/wallet-icon.svg";

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

type Props = {
  wallets: UiWallet[];
  totalLabel: string;
  hasBudget?: boolean;
  /** Short topbar title above the amount (e.g. Organization / My budget). */
  budgetTitle?: string;
  balanceCaption?: string;
  canRequestTopup?: boolean;
};

export function WalletBalanceMenu({
  wallets,
  totalLabel,
  hasBudget = wallets.length > 0,
  budgetTitle = "Organization budget",
  balanceCaption = "Available balance",
  canRequestTopup = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const primaryWallet = wallets[0];

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

  function openBudget() {
    close();
    void navigate(tenantPath("/wallets"));
  }

  function openTopup(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    close();
    const walletId = primaryWallet?.id;
    void navigate(walletId ? `${tenantPath("/wallets")}?wallet=${encodeURIComponent(walletId)}&addFunds=1` : tenantPath("/wallets"));
  }

  return (
    <div className="wallet-menu-wrap">
      <button
        type="button"
        className="topbar-wallet"
        aria-label={budgetTitle}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="topbar-wallet-icon">
          <img src={walletIconImg} alt="" className="topbar-wallet-img" aria-hidden="true" />
        </span>
        <span className="topbar-wallet-copy">
          <span className="k">{budgetTitle}</span>
          <span className="v">
            {totalLabel}
            <TopbarChevron open={open} />
          </span>
        </span>
      </button>

      {open ? (
        <>
          <button type="button" className="user-menu-scrim" aria-label="Close menu" onClick={close} />
          <div className="wallet-menu-panel" role="menu" onClick={(e) => e.stopPropagation()}>
            <div className="wallet-menu-body">
              {!hasBudget ? (
                <div className="wallet-menu-empty">
                  <p className="mb-3 text-sm text-muted-foreground">
                    {budgetTitle === "Organization budget"
                      ? "No organization budget yet."
                      : "No budget allocated yet."}
                  </p>
                  {budgetTitle === "Organization budget" ? (
                    <Button size="sm" asChild onClick={close}>
                      <Link to={tenantPath("/wallets")} state={{ startCreateWallet: true }}>
                        Setup budget
                      </Link>
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="wallet-menu-item on" role="menuitem">
                  <button type="button" className="wallet-menu-item-open" onClick={openBudget}>
                    <span className="wallet-menu-item-name">{budgetTitle}</span>
                    <span className="wallet-menu-item-bal">
                      {balanceCaption}: {totalLabel}
                    </span>
                  </button>
                  {canRequestTopup ? (
                    <button type="button" className="wallet-menu-item-funds" onClick={openTopup}>
                      Request top-up
                    </button>
                  ) : null}
                </div>
              )}
            </div>
            <div className="wallet-menu-foot">
              <Link to={tenantPath("/wallets")} className="wallet-menu-create" onClick={close}>
                {hasBudget ? "View budget dashboard" : budgetTitle === "Organization budget" ? "Setup budget" : "View budget"}
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
