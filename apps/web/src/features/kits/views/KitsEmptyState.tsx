import { Link } from "react-router";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/tenant/PageHeader";
import { PreDesignedKits } from "../PreDesignedKits";
import { usePlatformKits } from "../model";
import kitsHeroBannerImg from "../../../../assets/kits-hero-banner-generated.png";

type KitsEmptyStateProps = {
  /** Workspace contacts available to send kits to. */
  contactCount?: number;
  canCreateKits?: boolean;
};

export function KitsEmptyState({ canCreateKits = true }: KitsEmptyStateProps) {
  const { data: preDesignedKits, isLoading: preDesignedLoading } = usePlatformKits();
  const hasPreDesigned = !preDesignedLoading && (preDesignedKits?.length ?? 0) > 0;

  return (
    <>
      <PageHeader
        title="Kits"
        actions={
          <>
            <Link to="/app/catalog/category/kits" className="btn btn-ghost">
              View all kits
            </Link>
            {canCreateKits ? (
              <Link to="/app/kits/new" className="btn btn-dark">
                <Plus size={16} /> Create a kit
              </Link>
            ) : null}
          </>
        }
      />
      <div
        className="kits-empty-hero"
        style={{ "--kits-empty-hero-bg": `url(${kitsHeroBannerImg})` } as React.CSSProperties}
        aria-labelledby="kits-empty-title"
      >
        <div className="kits-empty-hero__copy">
          <h1 id="kits-empty-title">Kits &amp; Items</h1>
          <p>
            Bundle catalog products into reusable kits and send them to employees at scale for any
            occasion.
          </p>
          <div className="kits-empty-hero__actions">
            {canCreateKits ? (
              <Link
                to="/app/kits/new"
                className="kits-empty-hero__button kits-empty-hero__button--primary"
              >
                Create your first kit
              </Link>
            ) : null}
            {hasPreDesigned ? (
              <button
                type="button"
                className="kits-empty-hero__button kits-empty-hero__button--secondary"
                onClick={() =>
                  document
                    .getElementById("pre-designed-section")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                View sample kits
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {hasPreDesigned ? (
      <div
        id="pre-designed-section"
        className="card"
        style={{ marginTop: 24, padding: 24, background: "var(--bg-card)" }}
      >
        <div
          className="row"
          style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}
        >
          <div>
            <h3 style={{ fontSize: "var(--workspace-font-heading, 16px)", fontWeight: "var(--font-weight-bold)", color: "var(--ink)", marginBottom: 3 }}>
              Pre-designed kits
            </h3>
            <div className="muted" style={{ fontSize: "var(--workspace-font-caption, 12px)" }}>
              Choose a ready-made template and customize it.
            </div>
          </div>
        </div>
        <PreDesignedKits />
      </div>
      ) : null}
    </>
  );
}
