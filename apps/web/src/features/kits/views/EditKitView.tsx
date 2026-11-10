import { LoadingState } from "@/components/LoadingState";
import { ProductThumb } from "@/features/shops/ProductThumb";
import { WizardChrome } from "@/features/swag/wizard/WizardChrome";
import { CatalogStep } from "@/features/swag/wizard/CatalogStep";
import type { EditKitVm } from "../controllers/useEditKitController";
import { KitBrandingStep } from "./KitBrandingStep";

const STEPS = ["Products", "Branding"];

/** Edit-kit wizard shell; all state and actions come from the controller. */
export function EditKitView(vm: EditKitVm) {
  const { draft, dispatch, catalog, selected } = vm;

  if (vm.isLoading) {
    return <LoadingState message="Loading kit…" fullScreen={false} />;
  }
  if (vm.notFound) {
    return (
      <div className="card" style={{ padding: 16 }}>
        Kit not found.{" "}
        <button type="button" className="lnk" onClick={vm.onExit}>
          Back to kits
        </button>
      </div>
    );
  }
  if (vm.isSaving) {
    return <LoadingState message="Saving kit…" fullScreen={false} />;
  }

  if (vm.step === 0) {
    return (
      <WizardChrome
        title="Edit kit"
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
            <button
              type="button"
              className="btn btn-dark"
              disabled={!draft.picked.length}
              onClick={() => vm.onStep(1)}
            >
              Next
            </button>
          </div>
        }
      >
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h1 style={{ fontSize: 26, marginBottom: 6 }}>Edit kit</h1>
          <p className="muted" style={{ marginBottom: 20 }}>
            Update the kit name and choose which catalog products to include.
          </p>
          <div className="field" style={{ maxWidth: 420, marginBottom: 24 }}>
            <label className="lbl">Kit name</label>
            <input
              className="inp"
              value={draft.name}
              onChange={(e) => dispatch({ type: "setName", name: e.target.value })}
            />
          </div>

          {selected.length ? (
            <div style={{ marginBottom: 22 }}>
              <div className="lbl" style={{ marginBottom: 10 }}>
                Current items ({selected.length})
              </div>
              <div
                className="grid"
                style={{ gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))" }}
              >
                {draft.picked.map((catIdx) => {
                  const p = catalog[catIdx];
                  if (!p) return null;
                  return (
                    <div key={catIdx} className="pcard" style={{ position: "relative" }}>
                      <ProductThumb product={p} />
                      <div className="meta">
                        {p.brand && <div className="brand">{p.brand}</div>}
                        <div className="nm">{p.nm}</div>
                      </div>
                      <button
                        type="button"
                        className="xbtn"
                        style={{
                          position: "absolute",
                          top: 8,
                          right: 8,
                          background: "#fff",
                          boxShadow: "0 1px 4px rgba(0,0,0,.12)",
                        }}
                        aria-label="Remove"
                        onClick={() => dispatch({ type: "removePick", index: catIdx })}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="banner" style={{ marginBottom: 18 }}>
              No products in this kit yet. Add items from the catalog below.
            </div>
          )}

          <CatalogStep
            catalog={catalog}
            picked={draft.picked}
            onToggle={(index) => dispatch({ type: "togglePick", index })}
            title="Add from catalog"
            subtitle="Tap a product to add or remove it from this kit."
          />
        </div>
      </WizardChrome>
    );
  }

  return (
    <WizardChrome
      title="Edit kit"
      steps={STEPS}
      activeIndex={1}
      onExit={vm.onExit}
      exitLabel="Cancel"
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
            <b style={{ fontSize: "var(--workspace-font-body, 15px)", color: "var(--ink)" }}>{draft.name}</b>
            <span className="tag tag-soft" style={{ fontWeight: "var(--font-weight-bold)" }}>
              {draft.picked.length} item{draft.picked.length === 1 ? "" : "s"} selected
            </span>
          </div>
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <button
              type="button"
              className="lnk"
              style={{ background: "none", border: "none", cursor: "pointer" }}
              onClick={() => vm.onStep(0)}
            >
              Back to products
            </button>
            <button type="button" className="btn btn-brand" onClick={vm.onSave}>
              Save changes
            </button>
          </div>
        </div>
      }
    >
      <KitBrandingStep
        stepBadge="Step 2 of 2 · Branding"
        products={selected}
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
