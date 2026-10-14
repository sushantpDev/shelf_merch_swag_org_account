import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type Konva from "konva";
import type { UiProduct } from "@/services/mappers";
import {
  CANVAS_HEIGHT,
  CANVAS_PADDING,
  CANVAS_WIDTH,
  MIN_EFFECTIVE_DPI,
  effectiveArtworkDpi,
  hasPrintRelativePlacement,
  parentToPrintLocal,
  placementToStagePixels,
  printLocalToParent,
  stagePixelsToArtworkPlacement,
} from "@/lib/printCoords";
import {
  areaPlacementKey,
  buildRealisticArtwork,
  designImgUrl,
  designImgUrlForView,
  listPrintAreas,
  listPrintAreasForView,
  loadImageEl,
  placementKey,
  primaryAreaKey,
  printAreaKey as catalogPrintAreaKey,
  printAreaViewKey,
  productHasPrintArea,
  resolveMediaSrc,
  resolvePrintAreaStage,
  type Placement,
  type ProductViewKey,
} from "./mockup-bake";

const MIN_ART_PX = 16;
const BRAND = "#3D5FD9";

type PrintBoxPx = { bx: number; by: number; bw: number; bh: number };
type StageFit = { fit: number; offsetX: number; offsetY: number; drawnW: number; drawnH: number };

/** One print-area layer on the shared mockup image. */
export type MockupAreaLayer = {
  areaKey: string;
  label: string;
  artUrl?: string;
  placement?: Placement;
};

function rotatedHalfExtents(w: number, h: number, rotDeg: number) {
  const rad = (rotDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  return {
    halfW: (w * c + h * s) / 2,
    halfH: (w * s + h * c) / 2,
  };
}

function maxFitWidth(aspect: number, rotDeg: number, bw: number, bh: number) {
  const rad = (rotDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const denomW = c + aspect * s;
  const denomH = s + aspect * c;
  const maxW = Math.min(denomW > 0 ? bw / denomW : bw, denomH > 0 ? bh / denomH : bh);
  return Math.max(MIN_ART_PX, maxW);
}

function clampCenter(x: number, y: number, w: number, h: number, rotDeg: number, box: PrintBoxPx) {
  const { halfW, halfH } = rotatedHalfExtents(w, h, rotDeg);
  const minX = box.bx + halfW;
  const maxX = box.bx + box.bw - halfW;
  const minY = box.by + halfH;
  const maxY = box.by + box.bh - halfH;
  return {
    x: minX > maxX ? box.bx + box.bw / 2 : Math.min(maxX, Math.max(minX, x)),
    y: minY > maxY ? box.by + box.bh / 2 : Math.min(maxY, Math.max(minY, y)),
  };
}

function layersSignature(layers: MockupAreaLayer[], includePlacements = false): string {
  // Art URLs + area keys by default — placements update via Konva while editing.
  // Preview cards must include placement so saved position redraws after modal save.
  return layers
    .map((l) => {
      const base = `${l.areaKey}:${l.artUrl || ""}`;
      if (!includePlacements) return base;
      const p = l.placement;
      if (!p) return `${base}:default`;
      return `${base}:${p.xPct.toFixed(3)}:${p.yPct.toFixed(3)}:${p.wPct.toFixed(3)}:${Number(p.rot || 0).toFixed(2)}`;
    })
    .join("|");
}

export function mockupStageFit(
  containerWidth: number,
  containerHeight: number,
  mode: "contain" | "cover" = "contain",
): StageFit | null {
  if (containerWidth < 8 || containerHeight < 8) return null;
  const fit =
    mode === "cover"
      ? Math.max(containerWidth / CANVAS_WIDTH, containerHeight / CANVAS_HEIGHT)
      : Math.min(containerWidth / CANVAS_WIDTH, containerHeight / CANVAS_HEIGHT);
  if (!Number.isFinite(fit) || fit <= 0) return null;
  const drawnW = CANVAS_WIDTH * fit;
  const drawnH = CANVAS_HEIGHT * fit;
  return {
    fit,
    drawnW,
    drawnH,
    offsetX: (containerWidth - drawnW) / 2,
    offsetY: (containerHeight - drawnH) / 2,
  };
}

function stageFitTransform(fit: StageFit) {
  return `translate(${fit.offsetX}px, ${fit.offsetY}px) scale(${fit.fit})`;
}

function localPrintStage(box: PrintBoxPx) {
  return { x: 0, y: 0, w: box.bw, h: box.bh };
}

function localBox(box: PrintBoxPx): PrintBoxPx {
  return { bx: 0, by: 0, bw: box.bw, bh: box.bh };
}

function placementToLocalPixels(
  pl: Placement,
  box: PrintBoxPx,
  plateRot: number,
  printStage: { x: number; y: number; w: number; h: number },
) {
  if (hasPrintRelativePlacement(pl)) {
    return placementToStagePixels(pl, localPrintStage(box));
  }
  const stagePx = placementToStagePixels(pl, printStage);
  const local = parentToPrintLocal(stagePx.cx, stagePx.cy, box.bx, box.by, plateRot);
  return { ...stagePx, cx: local.x, cy: local.y };
}

function localPixelsToPlacement(
  localCx: number,
  localCy: number,
  w: number,
  artRot: number,
  box: PrintBoxPx,
  plateRot: number,
): Placement {
  const pl = stagePixelsToArtworkPlacement(localCx, localCy, w, artRot, localPrintStage(box));
  const abs = printLocalToParent(localCx, localCy, box.bx, box.by, plateRot);
  const canvas = stagePixelsToArtworkPlacement(abs.x, abs.y, w, artRot, {
    x: box.bx,
    y: box.by,
    w: box.bw,
    h: box.bh,
  });
  return { ...pl, xPct: canvas.xPct, yPct: canvas.yPct, wPct: canvas.wPct };
}

/**
 * Live mockup: garment mask + all print-area placeholders on one image.
 * Active area artwork is editable; other areas show placed art read-only.
 */
export function MockupCanvas({
  product,
  layers: layersProp,
  artUrl,
  placement,
  printAreaKey,
  activeAreaKey: activeAreaKeyProp,
  view: viewProp,
  resetEpoch = 0,
  fillContainer = false,
  /** Hide print-area guides, handles, and drag — clean final product look. */
  previewMode = false,
  /**
   * Scale the stage to cover the container (no letterbox bars).
   * Default false — contain keeps the full product visible (not zoomed/cropped).
   */
  coverFit,
  onChange,
  onSelectArea,
}: {
  product: UiProduct;
  /** All print areas to draw on this image. When omitted, falls back to single-area props. */
  layers?: MockupAreaLayer[];
  artUrl?: string;
  placement?: Placement;
  printAreaKey?: string | null;
  activeAreaKey?: string | null;
  /** Force front/back garment image (and only that view's print areas when layers omit filter). */
  view?: ProductViewKey;
  resetEpoch?: number;
  /** Stretch to parent height/width (artwork studio canvas). */
  fillContainer?: boolean;
  /** Hide print-area guides, handles, and drag — clean final product look. */
  previewMode?: boolean;
  /** Cover the container instead of letterboxing. Opt-in only — default is contain. */
  coverFit?: boolean;
  onChange?: (placement: Placement, areaKey: string) => void;
  onSelectArea?: (areaKey: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageBoxRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const onSelectRef = useRef(onSelectArea);
  const layersRef = useRef(layersProp);
  onChangeRef.current = onChange;
  onSelectRef.current = onSelectArea;
  layersRef.current = layersProp;
  const [dpiWarn, setDpiWarn] = useState<number | null>(null);
  const [wrapSize, setWrapSize] = useState({ w: 0, h: 0 });

  const branded = productHasPrintArea(product);
  const useCoverFit = Boolean(coverFit);

  // Never invent a placeholder — only catalog print areas from the superadmin.
  const layers: MockupAreaLayer[] =
    layersProp && layersProp.length
      ? layersProp
      : branded
        ? [
            {
              areaKey: printAreaKey || "area_1",
              label: printAreaKey || "Area 1",
              artUrl,
              placement,
            },
          ]
        : [];

  const activeAreaKey =
    activeAreaKeyProp || printAreaKey || (layersProp?.length ? undefined : layers[0]?.areaKey);
  const activeArea = activeAreaKey
    ? listPrintAreas(product).find((a, i) => catalogPrintAreaKey(product, a, i) === activeAreaKey)
    : null;
  const resolvedView: ProductViewKey =
    viewProp || (activeArea ? printAreaViewKey(product, activeArea) : "front");
  const maskSrc = resolveMediaSrc(
    designImgUrlForView(product, resolvedView) || designImgUrl(product, activeAreaKey),
  );
  const sig = layersSignature(layers, previewMode);
  const stageFit = mockupStageFit(wrapSize.w, wrapSize.h, useCoverFit ? "cover" : "contain");

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const update = () => {
      const w = Math.round(wrap.clientWidth);
      const h = Math.round(wrap.clientHeight);
      setWrapSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [fillContainer]);

  useEffect(() => {
    const host = hostRef.current;
    const wrap = wrapRef.current;
    const stageBox = stageBoxRef.current;
    if (!host || !wrap || !stageBox) return;
    let stage: Konva.Stage | null = null;
    let cancelled = false;

    const currentLayers: MockupAreaLayer[] =
      layersRef.current && layersRef.current.length
        ? layersRef.current
        : branded
          ? [
              {
                areaKey: printAreaKey || "area_1",
                label: printAreaKey || "Area 1",
                artUrl,
                placement,
              },
            ]
          : [];

    (async () => {
      const fit = mockupStageFit(wrap.clientWidth, wrap.clientHeight, useCoverFit ? "cover" : "contain");
      if (!fit) return;
      const Konva = (await import("konva")).default;
      if (cancelled || !host.isConnected) return;

      const maskImg = maskSrc ? await loadImageEl(maskSrc, true).catch(() => null) : null;
      if (cancelled || !host.isConnected) return;

      const artEntries = await Promise.all(
        currentLayers.map(async (l) => ({
          ...l,
          artImg: l.artUrl ? await loadImageEl(l.artUrl).catch(() => null) : null,
        })),
      );
      if (cancelled || !host.isConnected) return;

      host.innerHTML = "";
      stageBox.style.transform = stageFitTransform(fit);

      stage = new Konva.Stage({ container: host, width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
      const layer = new Konva.Layer();
      stage.add(layer);

      const canvasOpts =
        maskImg && maskImg.naturalWidth > 0 && maskImg.naturalHeight > 0
          ? {
              imageNaturalWidth: maskImg.naturalWidth,
              imageNaturalHeight: maskImg.naturalHeight,
              imageFit: (useCoverFit ? "cover" : "contain") as "cover" | "contain",
            }
          : { imageFit: (useCoverFit ? "cover" : "contain") as "cover" | "contain" };

      type AreaGeom = {
        areaKey: string;
        label: string;
        printStage: ReturnType<typeof resolvePrintAreaStage>["stage"];
        ph: ReturnType<typeof resolvePrintAreaStage>["ph"];
        box: PrintBoxPx;
        plateRot: number;
        ppi: number;
        artImg: HTMLImageElement | HTMLCanvasElement | null;
        placement?: Placement;
      };

      const geoms: AreaGeom[] = artEntries.map((entry) => {
        const resolved = resolvePrintAreaStage(product, canvasOpts, entry.areaKey);
        return {
          areaKey: entry.areaKey,
          label: entry.label,
          printStage: resolved.stage,
          ph: resolved.ph,
          box: {
            bx: resolved.stage.x,
            by: resolved.stage.y,
            bw: resolved.stage.w,
            bh: resolved.stage.h,
          },
          plateRot: resolved.ph.rotationDeg || 0,
          ppi: resolved.stage.pxPerInch,
          artImg: entry.artImg,
          placement: entry.placement,
        };
      });

      const plates = new Map<string, Konva.Group>();
      const editable = !previewMode;

      // Draw all placeholder boxes first (inactive under art). Rotation matches
      // Edit Catalog (Konva top-left origin). Skipped in previewMode for a clean product look.
      for (const g of geoms) {
        const isActive = g.areaKey === activeAreaKey;
        const hasActive = Boolean(activeAreaKey);
        const dimmed = hasActive && !isActive;
        const plate = new Konva.Group({
          x: g.box.bx,
          y: g.box.by,
          rotation: g.plateRot,
          name: `plate:${g.areaKey}`,
        });
        if (editable) {
          plate.add(
            new Konva.Rect({
              x: 0,
              y: 0,
              width: g.box.bw,
              height: g.box.bh,
              stroke: isActive ? BRAND : dimmed ? "rgba(61,95,217,.22)" : "rgba(61,95,217,.55)",
              strokeWidth: isActive ? 3 : 1.75,
              dash: isActive ? [7, 4] : [5, 4],
              fill: isActive
                ? "rgba(61,95,217,.12)"
                : dimmed
                  ? "rgba(15,23,42,.04)"
                  : "rgba(61,95,217,.04)",
              opacity: dimmed ? 0.72 : 1,
              listening: true,
              hitStrokeWidth: 14,
              name: `box:${g.areaKey}`,
            }),
          );
        }
        layer.add(plate);
        plates.set(g.areaKey, plate);
        if (editable) {
          layer.add(
            new Konva.Text({
              x: g.box.bx,
              y: Math.max(0, g.box.by - 18),
              rotation: g.plateRot,
              text: `${g.label} · ${g.ph.widthIn.toFixed(2)}×${g.ph.heightIn.toFixed(2)} in`,
              fontSize: isActive ? 12 : 11,
              fill: isActive ? BRAND : dimmed ? "rgba(61,95,217,.4)" : "rgba(61,95,217,.85)",
              fontStyle: isActive ? "bold" : "normal",
              listening: false,
              opacity: dimmed ? 0.7 : 1,
            }),
          );
        }
      }

      let activeNode: Konva.Image | null = null;
      let activeGeom: AreaGeom | null = null;
      let activeAspect = 1;
      let activeNaturalW = 0;
      let transformer: Konva.Transformer | null = null;

      for (const g of geoms) {
        if (!g.artImg) continue;
        const isActive = g.areaKey === activeAreaKey;
        const { bw, bh } = g.box;
        const plate = plates.get(g.areaKey);
        if (!plate) continue;
        const bounds = localBox(g.box);
        const artNaturalWidth = (g.artImg as HTMLImageElement).naturalWidth || g.artImg.width || 0;
        const aspect =
          ((g.artImg as HTMLImageElement).naturalHeight || g.artImg.height || 1) /
          Math.max(artNaturalWidth, 1);

        let pl = g.placement;
        if (!pl) {
          const fitW = Math.min(bw * 0.92, (bh * 0.92) / aspect);
          pl = localPixelsToPlacement(bw / 2, bh / 2, fitW, 0, g.box, g.plateRot);
          // Persist defaults for every filled area while editing so Save keeps the on-canvas look.
          if (editable) onChangeRef.current?.(pl, g.areaKey);
        }

        const stagePx = placementToLocalPixels(pl, g.box, g.plateRot, g.printStage);
        const rot0 = stagePx.rot || 0;
        let w0 = stagePx.w;
        const maxW0 = maxFitWidth(aspect, rot0, bw, bh);
        if (w0 > maxW0) w0 = maxW0;
        let h0 = w0 * aspect;
        const center0 = clampCenter(stagePx.cx, stagePx.cy, w0, h0, rot0, bounds);
        if (
          editable &&
          isActive &&
          (Math.abs(center0.x - stagePx.cx) > 0.5 ||
            Math.abs(center0.y - stagePx.cy) > 0.5 ||
            Math.abs(w0 - stagePx.w) > 0.5)
        ) {
          pl = localPixelsToPlacement(center0.x, center0.y, w0, rot0, g.box, g.plateRot);
          onChangeRef.current?.(pl, g.areaKey);
        }

        if (editable && isActive) {
          const effDpi = effectiveArtworkDpi(artNaturalWidth, w0, g.ppi);
          setDpiWarn(effDpi > 0 && effDpi < MIN_EFFECTIVE_DPI ? Math.round(effDpi) : null);
        }

        const realArt = buildRealisticArtwork(g.artImg as HTMLImageElement, product?.g);
        const clipGroup = new Konva.Group({
          clipFunc: (ctx) => {
            ctx.rect(0, 0, bw, bh);
          },
          name: `clip:${g.areaKey}`,
        });
        const canEditArt = editable && isActive;
        const node = new Konva.Image({
          image: realArt,
          x: center0.x,
          y: center0.y,
          width: w0,
          height: h0,
          offsetX: w0 / 2,
          offsetY: h0 / 2,
          rotation: rot0,
          draggable: canEditArt,
          listening: canEditArt,
          globalCompositeOperation: "multiply",
          opacity: canEditArt ? 0.96 : 0.9,
          name: `art:${g.areaKey}`,
          // Konva passes/expects absolute stage position; clamp in plate-local space.
          dragBoundFunc: canEditArt
            ? (pos) => {
                const w = Math.abs(node.width() * node.scaleX());
                const h = Math.abs(node.height() * node.scaleY());
                const local = parentToPrintLocal(pos.x, pos.y, g.box.bx, g.box.by, g.plateRot);
                const clamped = clampCenter(local.x, local.y, w, h, node.rotation(), bounds);
                return printLocalToParent(clamped.x, clamped.y, g.box.bx, g.box.by, g.plateRot);
              }
            : undefined,
        });
        clipGroup.add(node);
        plate.add(clipGroup);

        if (canEditArt) {
          activeNode = node;
          activeGeom = g;
          activeAspect = aspect;
          activeNaturalW = artNaturalWidth;
        }
      }

      if (editable && activeNode && activeGeom) {
        const node = activeNode;
        const g = activeGeom;
        const { bw, bh } = g.box;
        const bounds = localBox(g.box);
        const aspect = activeAspect;

        function confineNode() {
          const rot = node.rotation();
          const maxW = maxFitWidth(aspect, rot, bw, bh);
          let w = Math.abs(node.width() * node.scaleX());
          let h = Math.abs(node.height() * node.scaleY());
          if (w > maxW) {
            const sx = maxW / Math.max(node.width(), 1e-6);
            node.scaleX(sx);
            node.scaleY(sx);
            w = maxW;
            h = maxW * aspect;
          }
          const pos = clampCenter(node.x(), node.y(), w, h, rot, bounds);
          node.position(pos);
        }

        transformer = new Konva.Transformer({
          nodes: [node],
          rotateEnabled: true,
          keepRatio: true,
          enabledAnchors: ["top-left", "top-right", "bottom-left", "bottom-right"],
          rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
          anchorSize: 9,
          anchorStroke: BRAND,
          borderStroke: BRAND,
          boundBoxFunc: (o, n) => {
            if (n.width < MIN_ART_PX || n.height < MIN_ART_PX) return o;
            const nAspect = n.height / Math.max(n.width, 1e-6);
            const artRot = n.rotation - g.plateRot;
            const maxW = maxFitWidth(nAspect, artRot, bw, bh);
            if (n.width > maxW + 0.5) return o;
            const { halfW, halfH } = rotatedHalfExtents(n.width, n.height, artRot);
            const local = parentToPrintLocal(
              n.x + n.width / 2,
              n.y + n.height / 2,
              g.box.bx,
              g.box.by,
              g.plateRot,
            );
            if (
              local.x - halfW < -0.5 ||
              local.y - halfH < -0.5 ||
              local.x + halfW > bw + 0.5 ||
              local.y + halfH > bh + 0.5
            ) {
              return o;
            }
            return n;
          },
        });
        layer.add(transformer);

        function commit() {
          confineNode();
          const nw = Math.max(MIN_ART_PX, Math.abs(node.width() * node.scaleX()));
          const nh = Math.max(MIN_ART_PX, Math.abs(node.height() * node.scaleY()));
          node.scaleX(1);
          node.scaleY(1);
          node.width(nw);
          node.height(nh);
          node.offsetX(nw / 2);
          node.offsetY(nh / 2);
          const pos = clampCenter(node.x(), node.y(), nw, nh, node.rotation(), bounds);
          node.position(pos);
          const nextEff = effectiveArtworkDpi(activeNaturalW, nw, g.ppi);
          setDpiWarn(nextEff > 0 && nextEff < MIN_EFFECTIVE_DPI ? Math.round(nextEff) : null);
          onChangeRef.current?.(
            localPixelsToPlacement(
              pos.x,
              pos.y,
              nw,
              Math.round(node.rotation()),
              g.box,
              g.plateRot,
            ),
            g.areaKey,
          );
          transformer?.forceUpdate();
          layer.batchDraw();
        }
        node.on("transform", () => {
          confineNode();
          transformer?.forceUpdate();
          layer.batchDraw();
        });
        node.on("transformend", commit);
        node.on("dragend", commit);
      } else {
        setDpiWarn(null);
      }

      if (editable) {
        stage.on("mousedown touchstart", (e) => {
          const name = String(e.target.name?.() || "");
          const boxMatch = name.match(/^box:(.+)$/);
          const artMatch = name.match(/^art:(.+)$/);
          const selectedKey = boxMatch?.[1] || artMatch?.[1];
          if (selectedKey && selectedKey !== activeAreaKey) {
            onSelectRef.current?.(selectedKey);
            return;
          }
          if (transformer && activeNode) {
            transformer.nodes(e.target === stage || boxMatch ? [] : [activeNode]);
            layer.batchDraw();
          }
        });
      } else {
        setDpiWarn(null);
      }

      layer.draw();
    })();

    return () => {
      cancelled = true;
      try {
        stage?.destroy();
      } catch {
        /* noop */
      }
    };
  }, [product, sig, resetEpoch, maskSrc, activeAreaKey, wrapSize.w, wrapSize.h, previewMode, useCoverFit]);

  return (
    <div
      className={`img${branded ? " img-mockup" : ""}${fillContainer ? " img-mockup-fill" : ""}${useCoverFit ? " img-mockup-cover" : ""}`}
      ref={wrapRef}
      style={
        fillContainer
          ? {
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              overflow: "hidden",
              background: "#fff",
              contain: "strict",
            }
          : {
              position: "relative",
              width: "100%",
              aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
              overflow: "hidden",
              background: "#fff",
              flexShrink: 0,
            }
      }
    >
      {/* Logical 800×600 stage. Same padded mockup frame as Edit Catalog. */}
      <div
        ref={stageBoxRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          transform: stageFit ? stageFitTransform(stageFit) : undefined,
          transformOrigin: "top left",
          visibility: stageFit ? "visible" : "hidden",
          willChange: "transform",
          zIndex: 0,
        }}
      >
        {maskSrc ? (
          <img
            src={maskSrc}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              left: CANVAS_PADDING,
              top: CANVAS_PADDING,
              width: CANVAS_WIDTH - 2 * CANVAS_PADDING,
              height: CANVAS_HEIGHT - 2 * CANVAS_PADDING,
              objectFit: useCoverFit ? "cover" : "contain",
              objectPosition: "center center",
              pointerEvents: "none",
            }}
          />
        ) : null}
        <div
          ref={hostRef}
          style={{
            position: "absolute",
            inset: 0,
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            zIndex: 1,
            pointerEvents: "auto",
            /* Do not use contain:paint — CSS scale must not clip Konva overlays. */
          }}
        />
      </div>
      {dpiWarn != null && (
        <div
          style={{
            position: "absolute",
            left: 8,
            bottom: 8,
            zIndex: 2,
            fontSize: 11,
            background: "rgba(180,83,9,.92)",
            color: "#fff",
            padding: "4px 8px",
            borderRadius: 4,
            pointerEvents: "none",
          }}
        >
          Active area ~{dpiWarn} DPI. Aim for {MIN_EFFECTIVE_DPI}+
        </div>
      )}
    </div>
  );
}

/** Build MockupAreaLayer list from catalog print areas + draft arts/placements. */
export function buildMockupLayers(
  product: UiProduct,
  args: {
    idx: number;
    areaArts: Record<string, { preview?: string }>;
    placements: Record<string, Placement>;
    stagingPreview?: string;
    activeAreaKey?: string;
    /** When set, only include print areas for this garment view. */
    view?: ProductViewKey;
  },
): MockupAreaLayer[] {
  const areas = args.view ? listPrintAreasForView(product, args.view) : listPrintAreas(product);
  if (!areas.length) return [];
  const primary = primaryAreaKey(product);
  const productKey = placementKey(product, args.idx);
  const allAreas = listPrintAreas(product);
  return areas.map((a) => {
    const i = Math.max(0, allAreas.indexOf(a));
    const areaKey = catalogPrintAreaKey(product, a, i);
    const draftKey = areaPlacementKey(product, args.idx, areaKey);
    const artUrl =
      args.areaArts[draftKey]?.preview ||
      (areaKey === args.activeAreaKey ? args.stagingPreview : undefined) ||
      undefined;
    const placement =
      args.placements[draftKey] ?? (areaKey === primary ? args.placements[productKey] : undefined);
    return {
      areaKey,
      label: a?.label || `Area ${i + 1}`,
      artUrl,
      placement,
    };
  });
}
