import { ArrowRight } from "lucide-react";
import { LoadingState } from "@/components/LoadingState";
import { WizardChrome } from "@/features/swag/wizard/WizardChrome";
import { CatalogStep } from "@/features/swag/wizard/CatalogStep";
import type { KitWizardVm } from "../controllers/useKitWizardController";
import { KitNameStep } from "./KitNameStep";
import { KitBrandingStep } from "./KitBrandingStep";
import { KitReviewPricingStep } from "./KitReviewPricingStep";
import { KitPublishedSuccess } from "./KitPublishedSuccess";

const STEPS = ["Name", "Products", "Branding", "Review"];

/** Create-kit wizard shell; all state and actions come from the controller. */
export function KitWizardView(vm: KitWizardVm) {
  const { draft, dispatch } = vm;

  if (vm.isLoading) {
    return <LoadingState message="Loading catalog…" fullScreen={false} />;
  }
  if (vm.isPublishing) {
    return <LoadingState message="Publishing kit…" fullScreen={false} />;
  }
  if (vm.publishedKit) {
    return (
      <KitPublishedSuccess
        kitName={vm.publishedKit.name}
        onSendKit={vm.onSendPublishedKit}
        onRequestSample={vm.onRequestSamplePublished}
        onGoToKits={vm.onGoToKits}
      />
    );
  }

  const backLink = (label: string, to: 0 | 1 | 2) => (
    <button
      type="button"
      className="lnk"
      style={{ background: "none", border: "none", cursor: "pointer" }}
      onClick={() => vm.onStep(to)}
    >
      {label}
    </button>
  );

  const kitTag = (suffix?: string) => (
    <span className="tag tag-soft" style={{ fontWeight: "var(--font-weight-bold)" }}>
      {draft.picked.length} item{draft.picked.length === 1 ? "" : "s"}
      {suffix ? ` · ${suffix}` : ""}
    </span>
  );

  const summaryFoot = (back: React.ReactNode, action: React.ReactNode, suffix?: string) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
      }}
    >
      <div className="row" style={{ gap: 12, alignItems: "center" }}>
        <b style={{ fontSize: "var(--workspace-font-body, 15px)", color: "var(--ink)" }}>{draft.name}</b>
        {kitTag(suffix)}
      </div>
      <div className="row" style={{ gap: 12, alignItems: "center" }}>
        {back}
        {action}
      </div>
    </div>
  );

  if (vm.step === 0) {
    return (
      <WizardChrome
        title="Create a kit"
        steps={STEPS}
        activeIndex={0}
        onExit={vm.onExit}
        exitLabel="Cancel"
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
            <button
              type="button"
              className="lnk"
              style={{ background: "none", border: "none", cursor: "pointer" }}
              onClick={vm.onExit}
            >
              Cancel
            </button>
            <button type="button" className="btn btn-dark" onClick={vm.onNext}>
              Next
            </button>
          </div>
        }
      >
        <KitNameStep
          name={draft.name}
          desc={draft.desc}
          onName={(name) => dispatch({ type: "setName", name })}
          onDesc={(desc) => dispatch({ type: "setDesc", desc })}
        />
      </WizardChrome>
    );
  }

  if (vm.step === 1) {
    return (
      <WizardChrome
        title="Create a kit"
        steps={STEPS}
        activeIndex={1}
        onExit={vm.onExit}
        exitLabel="Cancel"
        footer={summaryFoot(
          backLink("Back", 0),
          <button
            type="button"
            className="btn btn-dark"
            disabled={!draft.picked.length}
            onClick={vm.onNext}
          >
            Next
          </button>,
        )}
      >
        <CatalogStep
          catalog={vm.catalog}
          picked={draft.picked}
          onToggle={(index) => dispatch({ type: "togglePick", index })}
          title={`Choose products for "${draft.name}"`}
          subtitle="Select the items to include. You can brand them in the next step."
        />
      </WizardChrome>
    );
  }

  if (vm.step === 2) {
    return (
      <WizardChrome
        title="Create a kit"
        steps={STEPS}
        activeIndex={2}
        onExit={vm.onExit}
        exitLabel="Cancel"
        footer={summaryFoot(
          backLink("Back to products", 1),
          <button type="button" className="btn btn-brand" onClick={vm.onNext}>
            Continue <ArrowRight size={14} />
          </button>,
          undefined,
        )}
      >
        <KitBrandingStep
          stepBadge="Step 3 of 4 · Branding"
          products={vm.pickedProducts}
          art={draft.art}
          areaArts={draft.areaArts}
          placements={draft.placements}
          placementEpoch={draft.placementEpoch}
          notes={draft.notes}
          onSetArt={(art) => dispatch({ type: "setArt", art })}
          onClearArt={() => dispatch({ type: "clearArt" })}
          onSetAreaArt={(key, art) => dispatch({ type: "setAreaArt", key, art })}
          onSetAreaArts={(keys, art) => dispatch({ type: "setAreaArts", keys, art })}
          onClearAreaArt={(key) => dispatch({ type: "clearAreaArt", key })}
          onResetPlacements={() => dispatch({ type: "resetPlacements" })}
          onPlacementChange={(key, placement) => dispatch({ type: "setPlacement", key, placement })}
          onNotes={(notes) => dispatch({ type: "setNotes", notes })}
        />
      </WizardChrome>
    );
  }

  return (
    <WizardChrome
      title="Create a kit"
      steps={STEPS}
      activeIndex={3}
      onExit={vm.onExit}
      exitLabel="Cancel"
      footer={summaryFoot(
        backLink("Back to branding", 2),
        <button type="button" className="btn btn-brand" onClick={vm.onPublish}>
          Publish kit &amp; send
        </button>,
      )}
    >
      <KitReviewPricingStep
        kitName={draft.name}
        products={vm.pickedProducts}
        artworkUrl={draft.art?.preview}
        placements={draft.placements}
      />
    </WizardChrome>
  );
}
