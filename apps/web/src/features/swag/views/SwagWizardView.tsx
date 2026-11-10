import { LoadingState } from "@/components/LoadingState";
import { NextStepDialog } from "@/components/NextStepDialog";
import { WizardChrome } from "../wizard/WizardChrome";
import { NameStep } from "../wizard/NameStep";
import { CatalogStep } from "../wizard/CatalogStep";
import { ArtworkStep } from "../wizard/ArtworkStep";
import { AddToShopStep } from "../wizard/AddToShopStep";
import type { SwagWizardVm } from "../controllers/useSwagWizardController";
import type { SwagDraft } from "../swagDraft";

const STEPS = ["Collection", "Products", "Artwork", "Add to shop"];

/** Design-swag wizard shell; all state and actions come from the controller. */
export function SwagWizardView(vm: SwagWizardVm) {
  const { draft, dispatch } = vm;

  if (vm.isLoading) {
    return <LoadingState message="Loading catalog…" fullScreen={false} />;
  }
  if (vm.isWorking) {
    return <LoadingState message={vm.workingLabel} fullScreen={false} />;
  }

  const publishReadyDialog = (
    <NextStepDialog
      open={vm.publishReadyOpen}
      title="Your swag is ready!"
      description="Your products have been successfully published to your shop."
      primaryLabel="Add contacts"
      onPrimary={vm.onPublishReadyPrimary}
      onSecondary={vm.onPublishReadyLater}
    />
  );

  const backLink = (label: string, step: SwagDraft["step"]) => (
    <button
      type="button"
      className="lnk"
      style={{ background: "none", border: "none", cursor: "pointer" }}
      onClick={() => vm.onStep(step)}
    >
      {label}
    </button>
  );

  if (draft.step === 0) {
    return (
      <WizardChrome
        title="Design swag"
        steps={STEPS}
        activeIndex={0}
        onExit={vm.onExit}
        exitLabel="Back to my swag"
        footer={
          <>
            <button
              type="button"
              className="lnk"
              style={{ background: "none", border: "none", cursor: "pointer" }}
              onClick={vm.onExit}
            >
              Cancel
            </button>
            <button type="button" className="btn btn-brand" onClick={vm.onSubmitName}>
              Next
            </button>
          </>
        }
      >
        <NameStep
          name={draft.name}
          shopName={vm.shopName}
          onChange={(name) => dispatch({ type: "setName", name })}
        />
      </WizardChrome>
    );
  }

  if (draft.step === 1) {
    return (
      <WizardChrome
        title="Design swag"
        steps={STEPS}
        activeIndex={1}
        onExit={vm.onExit}
        footer={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <div className="row" style={{ gap: 12, alignItems: "center" }}>
              <b style={{ fontSize: "var(--workspace-font-body, 15px)" }}>{draft.name}</b>
              <span className="tag tag-soft" style={{ fontWeight: "var(--font-weight-bold)" }}>
                {draft.picked.length} item{draft.picked.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="row" style={{ gap: 12, alignItems: "center" }}>
              {backLink("Back", 0)}
              <button
                type="button"
                className="btn btn-brand"
                disabled={!draft.picked.length}
                onClick={() => vm.onStep(2)}
              >
                Add Products
              </button>
            </div>
          </div>
        }
      >
        <CatalogStep
          catalog={vm.catalog}
          picked={draft.picked}
          onToggle={(index) => dispatch({ type: "togglePick", index })}
        />
      </WizardChrome>
    );
  }

  if (draft.step === 2) {
    return (
      <WizardChrome
        title="Design swag"
        steps={STEPS}
        activeIndex={2}
        onExit={vm.onExit}
        exitLabel="Back to my swag"
        footer={
          <>
            <div className="row" style={{ gap: 12, alignItems: "center" }}>
              <b style={{ fontSize: "var(--workspace-font-body, 15px)" }}>{draft.name}</b>
              <span className="tag tag-soft" style={{ fontWeight: "var(--font-weight-bold)" }}>
                {vm.pickedProducts.length} item{vm.pickedProducts.length === 1 ? "" : "s"} selected
              </span>
            </div>
            <div className="row" style={{ gap: 12, alignItems: "center" }}>
              {backLink("Back to products", 1)}
              <button
                type="button"
                className="btn btn-ghost"
                disabled={vm.isWorking || !vm.pickedProducts.length}
                onClick={vm.onSaveDesign}
              >
                Save design
              </button>
              <button
                type="button"
                className="btn btn-brand"
                onClick={() => vm.onStep(3)}
              >
                Next
              </button>
            </div>
          </>
        }
      >
        <ArtworkStep
          products={vm.pickedProducts}
          previousUploads={vm.previousUploads}
          art={draft.art}
          areaArts={draft.areaArts || {}}
          placements={draft.placements}
          placementEpoch={draft.placementEpoch}
          onSetArt={(art) => dispatch({ type: "setArt", art })}
          onClearArt={() => dispatch({ type: "clearArt" })}
          onSetAreaArt={(key, art) => dispatch({ type: "setAreaArt", key, art })}
          onSetAreaArts={(keys, art) => dispatch({ type: "setAreaArts", keys, art })}
          onClearAreaArt={(key) => dispatch({ type: "clearAreaArt", key })}
          onResetPlacements={() => dispatch({ type: "resetPlacements" })}
          onPlacementChange={(key, placement) => dispatch({ type: "setPlacement", key, placement })}
        />
      </WizardChrome>
    );
  }

  return (
    <>
      <WizardChrome
        title="Design swag"
        steps={STEPS}
        activeIndex={3}
        onExit={vm.onExit}
        exitLabel="Back to my swag"
        footer={
          <>
            <div className="row" style={{ gap: 12, alignItems: "center" }}>
              <b style={{ fontSize: "var(--workspace-font-body, 15px)" }}>{draft.name}</b>
              <span className="tag tag-soft" style={{ fontWeight: "var(--font-weight-bold)" }}>
                {vm.pickedProducts.length} item{vm.pickedProducts.length === 1 ? "" : "s"}
              </span>
              {vm.pickedShops.size > 0 ? (
                <span className="tag tag-live">
                  <span className="dot" />
                  {vm.pickedShops.size} {vm.pickedShops.size === 1 ? "shop" : "shops"}
                </span>
              ) : null}
            </div>
            <div className="row" style={{ gap: 12, alignItems: "center" }}>
              {backLink("Back to artwork", 2)}
              <button
                type="button"
                className="btn btn-ghost"
                disabled={vm.isWorking || !vm.pickedProducts.length}
                onClick={vm.onSaveDesign}
              >
                Save design
              </button>
              <button
                type="button"
                className="btn btn-brand"
                disabled={vm.isWorking || vm.pickedShops.size === 0}
                onClick={vm.onPublish}
              >
                Publish
              </button>
            </div>
          </>
        }
      >
        <AddToShopStep
          collectionName={draft.name}
          products={vm.pickedProducts}
          placements={draft.placements}
          areaArts={draft.areaArts || {}}
          shops={vm.shops}
          picked={vm.pickedShops}
          onToggle={vm.onToggleShop}
        />
      </WizardChrome>
      {publishReadyDialog}
    </>
  );
}
