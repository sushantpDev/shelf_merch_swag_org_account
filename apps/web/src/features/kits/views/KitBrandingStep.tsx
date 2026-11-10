import {
  ARTWORK_ACCEPT,
  ARTWORK_REQUIREMENTS,
  readArtworkFile,
} from "@/lib/artworkValidation";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Check, Eye, Image as ImageIcon, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { mediaUrlForCanvas, resolveMediaUrl } from "@/lib/mediaUrl";
import type { UiProduct } from "@/services/mappers";
import { ProductThumb } from "@/features/shops/ProductThumb";
import { MockupCanvas, buildMockupLayers } from "@/features/swag/MockupCanvas";
import { MockupViewGallery } from "@/features/swag/MockupViewGallery";
import {
  areaPlacementKey,
  designImgUrlForView,
  listPrintAreas,
  listProductViews,
  placementKey,
  printAreaKey,
  type Placement,
  type ProductViewKey,
} from "@/features/swag/mockup-bake";
import {
  defaultWhiteColorIndex,
  getMockupTintHex,
  productColorHex,
  productColorNames,
} from "@/features/swag/colors";
import { DesignedProductThumb } from "@/features/swag/DesignedProductThumb";
import {
  buildPreviousUploads,
  getDefaultArtwork,
  loadArtworkHistory,
  rememberArtwork,
  resolveDefaultArtwork,
  type PreviousArtwork,
} from "@/features/swag/wizard/artworkHistory";
import {
  areaKeysForProduct,
  areaLabelForKey,
  areasForMockupView,
  editorViewForArea,
  frontAreaKeysForProduct,
  productArtworkCommitPlan,
  productHasArtwork,
  sliceProductAreaArts,
  sliceProductPlacements,
} from "@/features/swag/wizard/artworkStepModel";
import { kitDefaultSeedKeysForProducts, kitPreferredPrintAreaKey } from "../kitPrintArea";
import type { KitArtFile } from "../wizard/kitDraft";

type ArtTab = "upload" | "previous";
type PrintQuality = "good" | "poor";

/**
 * Kit branding step (parity with Design Swag artwork step):
 * - Left panel upload + Add artwork seeds one default placeholder per product.
 * - Click a product to edit placement / add or remove logos on other placeholders.
 * - Per-product edits never rewrite other products.
 */
export function KitBrandingStep({
  products,
  art,
  areaArts,
  placements,
  placementEpoch,
  notes,
  onSetArt,
  onClearArt,
  onSetAreaArt,
  onSetAreaArts,
  onClearAreaArt,
  onResetPlacements,
  onPlacementChange,
  onNotes,
}: {
  stepBadge?: string;
  products: UiProduct[];
  art: KitArtFile | null;
  areaArts: Record<string, KitArtFile>;
  placements: Record<string, Placement>;
  placementEpoch: number;
  notes: string;
  onSetArt: (art: KitArtFile) => void;
  onClearArt: () => void;
  onSetAreaArt: (key: string, art: KitArtFile) => void;
  onSetAreaArts: (keys: string[], art: KitArtFile) => void;
  onClearAreaArt: (key: string) => void;
  onResetPlacements: () => void;
  onPlacementChange: (key: string, placement: Placement) => void;
  onNotes: (notes: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<ArtTab>("upload");
  const [dragging, setDragging] = useState(false);
  const defaultArt = useMemo(() => resolveDefaultArtwork(), []);
  const initialStaging =
    art || (defaultArt ? { name: defaultArt.name, preview: defaultArt.preview } : null);
  const [staging, setStaging] = useState<KitArtFile | null>(initialStaging);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [previousUploads, setPreviousUploads] = useState<PreviousArtwork[]>(() =>
    buildPreviousUploads([], [], [], undefined),
  );
  const [editIdx, setEditIdx] = useState<number | null>(null);

  useEffect(() => {
    if (art) {
      setStaging(art);
    } else {
      const def = getDefaultArtwork();
      if (def) {
        setStaging({ name: def.name, preview: def.preview });
      }
    }
  }, [art]);

  useEffect(() => {
    const effective =
      staging || (defaultArt ? { name: defaultArt.name, preview: defaultArt.preview } : null);
    if (!art && effective && products.length > 0 && Object.keys(areaArts).length === 0) {
      onSetArt(effective);
      const keys = kitDefaultSeedKeysForProducts(products);
      if (keys.length) {
        onSetAreaArts(keys, effective);
      }
    }
  }, [art, staging, products, areaArts, onSetArt, onSetAreaArts, defaultArt]);

  const designedCount = products.reduce(
    (n, p, idx) => n + (productHasArtwork(p, idx, areaArts) ? 1 : 0),
    0,
  );

  function clearStaging() {
    setStaging(null);
  }

  async function onPick(file: File) {
    try {
      const artwork = await readArtworkFile(file);
      setStaging(artwork);
      setTab("upload");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read artwork");
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onPick(file);
  }

  /** Apply library artwork to each product's default kit placeholder (polo → left). */
  function confirmLibraryArt() {
    if (!staging) return;
    const keys = kitDefaultSeedKeysForProducts(products);
    onSetArt(staging);
    if (keys.length) onSetAreaArts(keys, staging);
    rememberArtwork({
      id: staging.preview,
      name: staging.name,
      preview: staging.preview,
      fileType: fileTypeFromName(staging.name),
    });
    setPreviousUploads((prev) => [
      {
        id: staging.preview,
        name: staging.name,
        preview: staging.preview,
        fileType: fileTypeFromName(staging.name),
      },
      ...prev.filter((h) => h.preview !== staging.preview),
    ]);
    toast.success(products.length === 1 ? "Artwork applied to 1 product" : `Artwork applied to ${products.length} products`);
  }

  function selectPrevious(item: PreviousArtwork) {
    if (staging?.preview === item.preview) {
      setStaging(null);
      return;
    }
    setStaging({ name: item.name, preview: item.preview });
  }

  const editingProduct = editIdx != null ? products[editIdx] : null;

  return (
    <div className="sw-art-studio">
      <div className="sw-art-layout">
        <header className="sw-art-page-head">
          <p className="sw-art-eyebrow">Step 3 of 4</p>
          <h1>Brand your kit</h1>
          <p className="sw-art-page-lead">
            Upload artwork and place it on each product. You can refine placement anytime before
            publishing.
          </p>
        </header>

        {!designedCount && !bannerDismissed ? (
          <div className="sw-art-alert">
            <div className="sw-art-alert__main">
              <p className="sw-art-alert__text">
                Add artwork on the left to preview it on every product, all colour variants
                included. Click a product to fine-tune placement.
              </p>
              <button
                type="button"
                className="sw-art-alert__cta"
                onClick={() => {
                  setTab("upload");
                  setBannerDismissed(true);
                }}
              >
                Get started
              </button>
            </div>
            <div className="sw-art-alert__visual" aria-hidden="true">
              <span className="sw-art-alert__blob" />
              <span className="sw-art-alert__badge">
                <ImageIcon size={22} strokeWidth={1.75} />
              </span>
            </div>
            <button
              type="button"
              className="sw-art-alert-close"
              aria-label="Dismiss"
              onClick={() => setBannerDismissed(true)}
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        ) : null}

        <aside className="sw-art-panel">
          <h2 className="sw-art-panel-title">Artwork</h2>

          <div className="sw-art-tabs" role="tablist" aria-label="Artwork source">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "upload"}
              className={`sw-art-tab${tab === "upload" ? " on" : ""}`}
              onClick={() => setTab("upload")}
            >
              Upload
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "previous"}
              className={`sw-art-tab${tab === "previous" ? " on" : ""}`}
              onClick={() => setTab("previous")}
            >
              Previous
            </button>
          </div>

          {tab === "upload" ? (
            <div className="sw-art-tab-body sw-art-upload-body">
              {staging ? (
                <ArtworkPickRow
                  preview={staging.preview}
                  name={staging.name}
                  fileType={fileTypeFromName(staging.name)}
                  selected
                  displayOnly
                  onRemove={clearStaging}
                />
              ) : (
                <button
                  type="button"
                  className={`sw-art-upload-area${dragging ? " drag" : ""}`}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                >
                  <span className="sw-art-upload-icon">
                    <Upload size={18} strokeWidth={2} />
                  </span>
                  <span className="sw-art-upload-title">Drag and drop, or browse</span>
                  <span className="sw-art-upload-sub">{ARTWORK_REQUIREMENTS}</span>
                </button>
              )}
            </div>
          ) : (
            <div className="sw-art-prev-scroll">
              <div className="sw-art-tab-body sw-art-prev-list">
                {previousUploads.length ? (
                  previousUploads.map((item) => (
                    <ArtworkPickRow
                      key={item.id}
                      preview={item.preview}
                      name={item.name}
                      fileType={item.fileType}
                      selected={staging?.preview === item.preview}
                      onSelect={() => selectPrevious(item)}
                      onRemove={staging?.preview === item.preview ? clearStaging : undefined}
                    />
                  ))
                ) : (
                  <div className="sw-art-prev-empty mut3">
                    No previous uploads yet. Upload from your device first.
                  </div>
                )}
              </div>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept={ARTWORK_ACCEPT}
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f);
              e.target.value = "";
            }}
          />

          <p className="sw-art-quality-tip">
            {ARTWORK_REQUIREMENTS} Use a transparent background for logos.
          </p>

          <button
            type="button"
            className="btn btn-block sw-art-add-btn"
            disabled={!staging}
            onClick={confirmLibraryArt}
          >
            Add artwork
          </button>

          <div className="field sw-art-notes-field">
            <label className="lbl" htmlFor="kit-brand-notes">
              Notes for design team
              <span className="sw-art-optional">Optional</span>
            </label>
            <textarea
              id="kit-brand-notes"
              className="inp sw-art-notes-input"
              rows={3}
              placeholder="e.g. White logo on the chest, full colour on mugs"
              value={notes}
              onChange={(e) => onNotes(e.target.value)}
            />
          </div>

          {Object.keys(areaArts).length > 0 || art ? (
            <button
              type="button"
              className="btn btn-ghost btn-block btn-sm sw-art-reset"
              onClick={() => {
                onClearArt();
                onResetPlacements();
                setStaging(null);
                toast.success("Artwork cleared");
              }}
            >
              Clear all artwork
            </button>
          ) : null}
        </aside>

        <div className="sw-art-preview-stage">
          <div className="sw-art-preview-head">
            <div>
              <div className="sw-art-preview-title">Products</div>
              <div className="mut3 sw-art-preview-hint">
                Click a product to edit placement and placeholders
              </div>
            </div>
            {designedCount > 0 ? (
              <span className="sw-art-applied-badge">
                <Check size={13} strokeWidth={2.5} />
                {designedCount} designed
              </span>
            ) : null}
          </div>

          <div className="sw-art-preview-scroll">
            <div className="sw-mockups">
              {products.map((p, idx) => {
                const productKey = placementKey(p, idx);
                const designed = productHasArtwork(p, idx, areaArts);
                const frontKeys = new Set(frontAreaKeysForProduct(p));
                const layers = buildMockupLayers(p, {
                  idx,
                  areaArts,
                  placements,
                }).filter((layer) => frontKeys.has(layer.areaKey));
                // Production mask/stage only — skip marketing photos with baked placeholders.
                const maskThumb =
                  resolveMediaUrl(p.maskImageUrl) ||
                  resolveMediaUrl(p.baseImageUrl) ||
                  "";
                return (
                  <div
                    key={productKey}
                    className="pcard mockup-card sw-mockup-card sw-mockup-card--editable"
                  >
                    <button
                      type="button"
                      className="sw-mockup-menu"
                      aria-label={`Preview branding for ${p.nm}`}
                      onClick={() => setEditIdx(idx)}
                    >
                      <Eye size={16} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className="sw-mockup-card-hit"
                      onClick={() => setEditIdx(idx)}
                      aria-label={`Edit branding for ${p.nm}`}
                    >
                      {designed ? (
                        <MockupCanvas product={p} layers={layers} previewMode view="front" />
                      ) : (
                        <div className="sw-mockup-card-empty">
                          {maskThumb ? (
                            <img src={maskThumb} alt="" className="sw-mockup-card-empty-img" />
                          ) : (
                            <ProductThumb product={p} />
                          )}
                        </div>
                      )}
                    </button>
                    <div className="meta">
                      {p.brand ? <div className="brand">{p.brand}</div> : null}
                      <div className="nm">{p.nm}</div>
                      {listPrintAreas(p).length ? (
                        <div className={`sw-mockup-card-status${designed ? " is-designed" : ""}`}>
                          {designed ? "Designed" : "Not designed"}
                        </div>
                      ) : (
                        <div className="mut3 sw-mockup-card-status">Logo Branding unavailable for this product.</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {editingProduct && editIdx != null ? (
        <KitProductBrandingModal
          product={editingProduct}
          productIdx={editIdx}
          libraryArt={art || staging}
          areaArts={areaArts}
          placements={placements}
          placementEpoch={placementEpoch}
          previousUploads={previousUploads}
          open
          onOpenChange={(open) => {
            if (!open) setEditIdx(null);
          }}
          onSave={({ setArts, clearKeys, setPlacements }) => {
            for (const row of setArts) onSetAreaArt(row.key, row.art);
            for (const key of clearKeys) onClearAreaArt(key);
            for (const row of setPlacements) onPlacementChange(row.key, row.placement);
            toast.success(`Branding saved for ${editingProduct.nm}`);
            setEditIdx(null);
          }}
        />
      ) : null}
    </div>
  );
}

function KitProductBrandingModal({
  product,
  productIdx,
  libraryArt,
  areaArts,
  placements,
  placementEpoch,
  previousUploads,
  open,
  onOpenChange,
  onSave,
}: {
  product: UiProduct;
  productIdx: number;
  libraryArt: KitArtFile | null;
  areaArts: Record<string, KitArtFile>;
  placements: Record<string, Placement>;
  placementEpoch: number;
  previousUploads: PreviousArtwork[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (plan: ReturnType<typeof productArtworkCommitPlan>) => void;
}) {
  const views = listProductViews(product);
  const colorNames = productColorNames(product);
  const colorNamesKey = colorNames.join("|");
  const productKeys = useMemo(
    () => areaKeysForProduct(product, productIdx),
    [product, productIdx],
  );
  const preferredKey = kitPreferredPrintAreaKey(product);

  const [draftArts, setDraftArts] = useState<Record<string, KitArtFile>>({});
  const [draftPlacements, setDraftPlacements] = useState<Record<string, Placement>>({});
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [view, setView] = useState<ProductViewKey>("front");
  const [colorIdx, setColorIdx] = useState(() => defaultWhiteColorIndex(colorNames));
  const [hasPickedColor, setHasPickedColor] = useState(false);
  const [activeAreaKey, setActiveAreaKey] = useState(preferredKey);
  const modalFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraftArts(sliceProductAreaArts(areaArts, product, productIdx));
    setDraftPlacements(sliceProductPlacements(placements, product, productIdx));
    setMode("edit");
    setView("front");
    setActiveAreaKey(kitPreferredPrintAreaKey(product));
    setColorIdx(defaultWhiteColorIndex(colorNamesKey ? colorNamesKey.split("|") : []));
    setHasPickedColor(false);
  }, [open, product, productIdx, areaArts, placements, colorNamesKey]);

  const title = product.brand ? `${product.brand} ${product.nm}` : product.nm;
  const tintHex = getMockupTintHex(
    colorNames[colorIdx] ? productColorHex(product, colorNames[colorIdx]) : undefined,
    hasPickedColor,
  );
  const allAreas = listPrintAreas(product);
  const areasForView = areasForMockupView(product, view);
  const backMaskMissing = view === "back" && !designImgUrlForView(product, "back");
  const activeDraftKey = areaPlacementKey(product, productIdx, activeAreaKey);
  const activeArt = draftArts[activeDraftKey];
  const activeLabel = areaLabelForKey(product, activeAreaKey);
  const activeArea = allAreas.find((a, i) => printAreaKey(product, a, i) === activeAreaKey);
  const activeAreaDims =
    activeArea?.widthIn && activeArea?.heightIn
      ? `${Number(activeArea.widthIn).toFixed(2)}" × ${Number(activeArea.heightIn).toFixed(2)}" · 300 DPI`
      : null;

  const layers = buildMockupLayers(product, {
    idx: productIdx,
    areaArts: draftArts,
    placements: draftPlacements,
    activeAreaKey,
  }).filter((layer) => areasForView.some((a) => {
    const key = printAreaKey(product, a, Math.max(0, allAreas.indexOf(a)));
    return key === layer.areaKey;
  }));

  function layersForView(v: ProductViewKey) {
    const areas = areasForMockupView(product, v);
    return buildMockupLayers(product, {
      idx: productIdx,
      areaArts: draftArts,
      placements: draftPlacements,
    }).filter((layer) =>
      areas.some(
        (a) => printAreaKey(product, a, Math.max(0, allAreas.indexOf(a))) === layer.areaKey,
      ),
    );
  }

  const previewProduct: UiProduct = {
    ...product,
    areaPlacements: Object.fromEntries(
      productKeys.map((draftKey) => {
        const areaKey = draftKey.includes("::")
          ? draftKey.slice(draftKey.indexOf("::") + 2)
          : preferredKey;
        const art = draftArts[draftKey];
        const pl = draftPlacements[draftKey];
        return [
          areaKey,
          {
            xPct: pl?.xPct ?? 50,
            yPct: pl?.yPct ?? 40,
            wPct: pl?.wPct ?? 28,
            rot: pl?.rot ?? 0,
            printCxPct: pl?.printCxPct,
            printCyPct: pl?.printCyPct,
            printWPct: pl?.printWPct,
            ...(art?.preview ? { artworkUrl: art.preview } : {}),
          },
        ];
      }),
    ),
    mockupUrl: undefined,
    mockupBackUrl: undefined,
  };

  function selectView(next: ProductViewKey) {
    setView(next);
    const keys = areasForMockupView(product, next).map((a) =>
      printAreaKey(product, a, Math.max(0, allAreas.indexOf(a))),
    );
    if (!keys.includes(activeAreaKey)) {
      setActiveAreaKey(keys[0] || kitPreferredPrintAreaKey(product));
    }
  }

  function assignArtToActive(file: KitArtFile) {
    if (!listPrintAreas(product).length) {
      toast.error("Logo Branding unavailable for this product.");
      return;
    }
    if (!activeAreaKey) {
      toast.error("Select a placeholder first");
      return;
    }
    setDraftArts((prev) => ({ ...prev, [activeDraftKey]: file }));
    toast.success(`Artwork added to ${activeLabel}`);
  }

  function removeActiveArt() {
    setDraftArts((prev) => {
      const next = { ...prev };
      delete next[activeDraftKey];
      return next;
    });
    setDraftPlacements((prev) => {
      const next = { ...prev };
      delete next[activeDraftKey];
      return next;
    });
    toast.success(`Removed artwork from ${activeLabel}`);
  }

  function addLibraryToPreferred() {
    if (!listPrintAreas(product).length) {
      toast.error("Logo Branding unavailable for this product.");
      return;
    }
    if (!libraryArt) {
      toast.error("Upload artwork first");
      return;
    }
    const key = kitPreferredPrintAreaKey(product);
    const draftKey = areaPlacementKey(product, productIdx, key);
    setActiveAreaKey(key);
    setView("front");
    setDraftArts((prev) => ({ ...prev, [draftKey]: libraryArt }));
    toast.success(`Artwork added to ${areaLabelForKey(product, key)}`);
  }

  async function onModalPick(file: File) {
    try {
      assignArtToActive(await readArtworkFile(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read artwork");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm-modal sw-brand-modal">
        <div className="sw-brand-modal__body">
          <DialogHeader className="sw-brand-modal__head">
            <DialogTitle style={{ fontSize: 18 }}>{title}</DialogTitle>
            <DialogDescription className="sr-only">
              Edit logo placement for {title}
            </DialogDescription>
          </DialogHeader>

          <div className={`sw-brand-modal__main sw-brand-modal__main--${mode}`}>
            <div className="sw-brand-modal__stage">
              {mode === "edit" ? (
                allAreas.length ? (
                  <p className="mut3 sw-brand-modal__hint">
                    Click a placeholder · drag to move · corners to scale
                  </p>
                ) : null
              ) : (
                <p className="mut3 sw-brand-modal__hint">Final preview — no guides or handles</p>
              )}
              <div className="sw-brand-modal__stage-inner">
                {mode === "preview" ? (
                  tintHex ? (
                    <div className="sw-brand-modal__canvas-wrap sw-brand-modal__canvas-wrap--preview">
                      <DesignedProductThumb
                        product={previewProduct}
                        artworkUrl={Object.values(draftArts)[0]?.preview}
                        tintHex={tintHex}
                        preferBakedMockup={false}
                        view={view}
                        onViewChange={setView}
                        viewTogglePlacement="below"
                      />
                    </div>
                  ) : (
                    <MockupViewGallery
                      views={views}
                      activeView={view}
                      onChange={selectView}
                      labeledViews
                      style={{ width: "100%", height: "100%" }}
                      mediaClassName="sw-brand-modal__canvas-wrap"
                      renderThumb={(v) => (
                        <MockupCanvas
                          product={product}
                          layers={layersForView(v)}
                          view={v}
                          previewMode
                        />
                      )}
                    >
                      <MockupCanvas
                        product={product}
                        layers={layersForView(view)}
                        view={view}
                        previewMode
                        fillContainer
                      />
                    </MockupViewGallery>
                  )
                ) : (
                  <MockupViewGallery
                    views={views}
                    activeView={view}
                    onChange={selectView}
                    labeledViews
                    style={{ width: "100%", height: "100%" }}
                    mediaClassName="sw-brand-modal__canvas-wrap"
                    renderThumb={(v) => (
                      <MockupCanvas
                        product={product}
                        layers={layersForView(v)}
                        view={v}
                        previewMode
                      />
                    )}
                  >
                    {backMaskMissing ? (
                      <div className="sw-brand-modal__empty mut3">
                        No back production mask on this catalog product yet.
                      </div>
                    ) : (
                      <MockupCanvas
                        product={product}
                        layers={layers}
                        activeAreaKey={activeAreaKey}
                        view={view}
                        resetEpoch={placementEpoch}
                        fillContainer
                        onSelectArea={(areaKey) => {
                          const area = allAreas.find(
                            (a, i) => printAreaKey(product, a, i) === areaKey,
                          );
                          setActiveAreaKey(areaKey);
                          setView(editorViewForArea(product, area));
                        }}
                        onChange={(next, areaKey) => {
                          const draftKey = areaPlacementKey(product, productIdx, areaKey);
                          if (!draftArts[draftKey]) return;
                          setDraftPlacements((prev) => ({ ...prev, [draftKey]: next }));
                        }}
                      />
                    )}
                  </MockupViewGallery>
                )}
              </div>
              {/* {!allAreas.length ? (
                <p className="mut3 sw-brand-modal__no-placeholder">Logo Branding unavailable for this product.</p>
              ) : null} */}
              {mode === "edit" ? (
                <button
                  type="button"
                  className="sw-brand-modal__preview-fab"
                  onClick={() => setMode("preview")}
                >
                  <Eye size={15} strokeWidth={2.25} aria-hidden />
                  Preview
                </button>
              ) : (
                <button
                  type="button"
                  className="sw-brand-modal__preview-fab"
                  onClick={() => setMode("edit")}
                >
                  Back to edit
                </button>
              )}
            </div>

            <aside className="sw-brand-modal__side">
              {mode === "edit" ? (
                <div className="sw-art-panel sw-art-panel--side">
                  <h2 className="sw-art-panel-title">Artwork</h2>

                  <div className={`sw-art-selected-box${activeArt ? " is-ready" : ""}`}>
                    <div className="mut3 sw-art-selected-label">Selected placeholder</div>
                    <div className="sw-art-selected-title">
                      {allAreas.length ? activeLabel || "None" : "Logo Branding unavailable for this product."}
                    </div>
                    {activeAreaDims ? (
                      <div className="mut3 sw-art-selected-dims">{activeAreaDims}</div>
                    ) : null}
                    {areasForView.length > 1 ? (
                      <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                        {areasForView.map((a) => {
                          const key = printAreaKey(product, a, Math.max(0, allAreas.indexOf(a)));
                          const filled = Boolean(
                            draftArts[areaPlacementKey(product, productIdx, key)],
                          );
                          return (
                            <button
                              key={key}
                              type="button"
                              className={`btn btn-sm${activeAreaKey === key ? " btn-soft" : " btn-ghost"}`}
                              onClick={() => setActiveAreaKey(key)}
                            >
                              {a.label || key}
                              {filled ? " ·" : ""}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  {activeArt ? (
                    <div className="sw-brand-modal__art-row">
                      <ArtworkPickRow
                        preview={activeArt.preview}
                        name={activeArt.name}
                        fileType={fileTypeFromName(activeArt.name)}
                        selected
                        displayOnly
                        onRemove={removeActiveArt}
                      />
                      <p className="mut3" style={{ fontSize: "var(--workspace-font-caption, 12px)", marginTop: 8 }}>
                        Drag the logo on the mockup to reposition. Remove to clear this placeholder
                        only.
                      </p>
                    </div>
                  ) : (
                    <>
                      {libraryArt ? (
                        <button
                          type="button"
                          className="btn btn-brand btn-block"
                          onClick={() => assignArtToActive(libraryArt)}
                        >
                          Use uploaded artwork
                        </button>
                      ) : null}
                      {!activeArt && libraryArt && activeAreaKey !== preferredKey ? (
                        <button
                          type="button"
                          className="btn btn-soft btn-block btn-sm"
                          onClick={addLibraryToPreferred}
                        >
                          Add to {areaLabelForKey(product, preferredKey)} instead
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="sw-art-upload-area"
                        onClick={() => modalFileRef.current?.click()}
                      >
                        <Upload size={18} />
                        <span>Upload artwork for {activeLabel || "placeholder"}</span>
                        <span className="sw-art-upload-sub">{ARTWORK_REQUIREMENTS}</span>
                      </button>
                    </>
                  )}

                  {previousUploads.length > 0 ? (
                    <div className="sw-art-prev-block">
                      <div className="mut3 sw-art-prev-heading">PREVIOUS UPLOADS</div>
                      <div className="sw-art-prev-scroll">
                        <div className="sw-art-tab-body sw-art-prev-list">
                          {previousUploads.map((item) => (
                            <ArtworkPickRow
                              key={item.id}
                              preview={item.preview}
                              name={item.name}
                              fileType={item.fileType}
                              selected={activeArt?.preview === item.preview}
                              onSelect={() =>
                                assignArtToActive({ name: item.name, preview: item.preview })
                              }
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <input
                    ref={modalFileRef}
                    type="file"
                    accept={ARTWORK_ACCEPT}
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onModalPick(f);
                      e.target.value = "";
                    }}
                  />

                  <div className="sw-brand-modal__side-foot">
                    {colorNames.length > 0 ? (
                      <div className="sw-brand-modal__colors">
                        <div className="lbl" style={{ marginBottom: 6 }}>
                          Colour variants
                        </div>
                        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                          {colorNames.map((c, i) => (
                            <button
                              key={c}
                              type="button"
                              title={c}
                              aria-label={c}
                              aria-pressed={colorIdx === i}
                              onClick={() => {
                                setHasPickedColor(true);
                                setColorIdx(i);
                              }}
                              className="sw"
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: "50%",
                                background: productColorHex(product, c),
                                outline:
                                  colorIdx === i
                                    ? "2px solid var(--brand)"
                                    : "1px solid var(--line)",
                                outlineOffset: 1,
                                cursor: "pointer",
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="sw-brand-modal__side-actions">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => onOpenChange(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn-brand"
                        onClick={() =>
                          onSave(
                            productArtworkCommitPlan(
                              product,
                              productIdx,
                              sliceProductAreaArts(areaArts, product, productIdx),
                              draftArts,
                              draftPlacements,
                            ),
                          )
                        }
                      >
                        Save changes
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="sw-art-panel sw-art-panel--side">
                  <h2 className="sw-art-panel-title">Preview</h2>
                  <p className="mut3" style={{ fontSize: "var(--workspace-font-caption, 13px)" }}>
                    Clean product view with logos applied. Return to edit to adjust placement or
                    placeholders.
                  </p>
                  {colorNames.length > 0 ? (
                    <div className="sw-brand-modal__colors">
                      <div className="lbl" style={{ marginBottom: 6 }}>
                        Colour variants
                      </div>
                      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                        {colorNames.map((c, i) => (
                          <button
                            key={c}
                            type="button"
                            title={c}
                            aria-label={c}
                            aria-pressed={colorIdx === i}
                            onClick={() => {
                              setHasPickedColor(true);
                              setColorIdx(i);
                            }}
                            className="sw"
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: "50%",
                              background: productColorHex(product, c),
                              outline:
                                colorIdx === i ? "2px solid var(--brand)" : "1px solid var(--line)",
                              outlineOffset: 1,
                              cursor: "pointer",
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="sw-brand-modal__side-foot">
                    <div className="sw-brand-modal__side-actions">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => onOpenChange(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn-brand"
                        onClick={() =>
                          onSave(
                            productArtworkCommitPlan(
                              product,
                              productIdx,
                              sliceProductAreaArts(areaArts, product, productIdx),
                              draftArts,
                              draftPlacements,
                            ),
                          )
                        }
                      >
                        Save changes
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </aside>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ArtworkPickRow({
  preview,
  name,
  fileType,
  selected,
  displayOnly,
  onSelect,
  onRemove,
}: {
  preview: string;
  name?: string;
  fileType: string;
  selected: boolean;
  displayOnly?: boolean;
  onSelect?: () => void;
  onRemove?: () => void;
}) {
  const [quality, setQuality] = useState<PrintQuality | null>(null);

  useEffect(() => {
    let cancelled = false;
    assessPrintQuality(preview).then((q) => {
      if (!cancelled) setQuality(q);
    });
    return () => {
      cancelled = true;
    };
  }, [preview]);

  void quality;

  return (
    <div
      className={`sw-art-pick-row${selected ? " on" : ""}${displayOnly ? " static" : ""}${onRemove ? " has-delete" : ""}`}
    >
      <div className="sw-art-pick-main-wrap">
        {displayOnly ? (
          <div className="sw-art-pick-main">
            <span className="sw-art-pick-thumb">
              <img src={preview} alt="" />
            </span>
            <span className="sw-art-pick-meta">
              {name ? <span className="sw-art-pick-name">{name}</span> : null}
              <span className="mut3 sw-art-pick-type">File Type: {fileType}</span>
            </span>
          </div>
        ) : (
          <button type="button" className="sw-art-pick-main" onClick={onSelect}>
            <span className="sw-art-pick-thumb">
              <img src={preview} alt="" />
            </span>
            <span className="sw-art-pick-meta">
              {name ? <span className="sw-art-pick-name">{name}</span> : null}
              <span className="mut3 sw-art-pick-type">File Type: {fileType}</span>
            </span>
          </button>
        )}
        {onRemove ? (
          <button
            type="button"
            className="sw-art-pick-remove"
            aria-label="Remove artwork from placeholder"
            title="Remove"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <Trash2 size={18} strokeWidth={2} aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function fileTypeFromName(name: string) {
  const ext = name.split(".").pop()?.toUpperCase();
  return ext || "PNG";
}

function assessPrintQuality(preview: string): Promise<PrintQuality> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      resolve(img.naturalWidth >= 800 && img.naturalHeight >= 800 ? "good" : "poor");
    };
    img.onerror = () => resolve("poor");
    img.src = mediaUrlForCanvas(preview) || preview;
  });
}
