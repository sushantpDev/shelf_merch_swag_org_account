import { Link } from "react-router";
import { ArrowLeft, Coins } from "lucide-react";
import { LoadingState } from "@/components/LoadingState";
import { sendFlowTitle } from "@/lib/storeCurrency";
import { ShopBanner } from "../banner";
import { ShopWelcomeDialog } from "../ShopWelcomeDialog";
import { BrandedSwagTab } from "../tabs/BrandedSwagTab";
import { ShopCatalogTab } from "../tabs/ShopCatalogTab";
import { SentGiftsTab } from "../tabs/SentGiftsTab";
import { ShopLayoutTab } from "../tabs/ShopLayoutTab";
import { ReportsTab } from "../tabs/ReportsTab";
import { GeneralSettingsTab } from "../tabs/GeneralSettingsTab";
import type { ShopDetailVm } from "../controllers/useShopDetailController";

/** Shop detail page: banner header, tab bar, and the active tab's content. */
export function ShopDetailView(vm: ShopDetailVm) {
  const welcome = (
    <ShopWelcomeDialog
      open={vm.showWelcome}
      shopName={vm.welcomeShopName}
      onDone={vm.onDismissWelcome}
    />
  );

  if (vm.isLoading) {
    return (
      <>
        {welcome}
        <LoadingState message="Loading shop…" fullScreen={false} />
      </>
    );
  }
  if (vm.errorMessage) {
    return (
      <>
        {welcome}
        <div className="card" style={{ padding: 16, color: "var(--danger)" }}>
          {vm.errorMessage}
        </div>
      </>
    );
  }

  const { shop } = vm;
  if (!shop) {
    return (
      <>
        {welcome}
        <div className="card empty" style={{ padding: 48 }}>
          <h3>Shop not found</h3>
          <p>This shop may have been removed.</p>
          <Link to="/app/shops" className="btn btn-soft" style={{ marginTop: 14 }}>
            Back to shops
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      {welcome}

      <Link
        to="/app/shops"
        className="lnk"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 14 }}
      >
        <ArrowLeft size={15} /> Back to shops
      </Link>

      <div className="shop-detail-head">
        <div className="shop-detail-banner">
          <ShopBanner source={shop} aspect="3 / 1" layout="center" logoSize={40} radius={10} />
        </div>
        <div className="shop-detail-head-info">
          <h1 className="shop-detail-head-title">{shop.name}</h1>
          <div className="shop-detail-head-meta">
            {shop.live ? (
              <span className="tag tag-live">
                <span className="dot" />
                Live
              </span>
            ) : vm.canEditShop ? (
              <button type="button" className="btn btn-brand btn-sm" onClick={vm.onPublishShop}>
                Publish
              </button>
            ) : (
              <span className="mut3" style={{ fontSize: "var(--workspace-font-caption, 13px)" }}>
                Publish to view shop
              </span>
            )}
          </div>
        </div>
        <div className="shop-detail-head-actions">
          {shop.live ? (
            <button type="button" className="btn btn-ghost shop-detail-head-action" onClick={vm.onViewLiveShop}>
              View shop
            </button>
          ) : null}
          {vm.canSendPoints ? (
            <button type="button" className="btn btn-brand shop-detail-head-action" onClick={() => vm.onSendPoints()}>
              <Coins size={16} /> {sendFlowTitle(shop.currencyMode)}
            </button>
          ) : null}
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 22 }} role="tablist" aria-label="Shop sections">
        {vm.visibleTabs.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={t === vm.tab}
            className={t === vm.tab ? "on" : ""}
            onClick={() => vm.onSelectTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {vm.tab === "Branded Swag" && (
        <BrandedSwagTab
          shop={shop}
          collections={vm.collections}
          canDesignSwag={vm.canDesignSwag}
          onStartDesigning={vm.onStartDesigning}
        />
      )}
      {vm.tab === "Shop Catalog" && (
        <ShopCatalogTab shop={shop} listings={vm.shopListings} canEditShop={vm.canEditShop} />
      )}
      {vm.tab === "Sent Gifts" && (
        <SentGiftsTab
          shop={shop}
          canSendPoints={vm.canSendPoints}
          onSendPoints={vm.onSendPoints}
        />
      )}
      {vm.tab === "Layout" && vm.canEditShop && <ShopLayoutTab shop={shop} />}
      {vm.tab === "Reports" && <ReportsTab shop={shop} />}
      {vm.tab === "Settings" && vm.canEditShop && <GeneralSettingsTab shop={shop} />}
    </>
  );
}
