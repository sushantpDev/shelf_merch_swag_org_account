import { Link } from "react-router";
import { Plus } from "lucide-react";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/tenant/PageHeader";
import { ShopCard } from "../ShopCard";
import type { ShopsVm } from "../controllers/useShopsController";
import shopsEmptyArt from "../../../../assets/shops-empty.svg";

/** Shops list: empty state or a grid of shop cards. */
export function ShopsView(vm: ShopsVm) {
  if (vm.isLoading) {
    return <LoadingState message="Loading shops…" fullScreen={false} />;
  }
  if (vm.errorMessage) {
    return (
      <div className="card" style={{ padding: 16, color: "var(--danger)" }}>
        {vm.errorMessage}
      </div>
    );
  }

  const createAction = vm.canCreateShop ? (
    <Link to="/app/shops/new" className="btn btn-brand">
      <Plus size={16} /> Create shop
    </Link>
  ) : undefined;

  if (vm.shops.length === 0) {
    return (
      <>
        <PageHeader
          title="Shops"
          subtitle="Branded storefronts your recipients shop from."
          actions={createAction}
        />
        <div className="card empty shops-empty">
          <img src={shopsEmptyArt} alt="" aria-hidden="true" className="shops-empty__art" />
          <h3>No shops yet</h3>
          <p>Create one to celebrate a moment.</p>
          {vm.canCreateShop ? (
            <button
              type="button"
              className="btn btn-brand"
              style={{ marginTop: 14 }}
              onClick={vm.onCreateShop}
            >
              Create your first shop
            </button>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Shops"
        subtitle="Branded storefronts your recipients redeem points in."
        actions={createAction}
      />
      <div className="shops-grid stagger">
        {vm.shops.map((shop) => (
          <ShopCard key={shop.id} shop={shop} fallbackUser={vm.fallbackUser} />
        ))}
      </div>
    </>
  );
}
