import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Konva from "konva";
import { Stage, Layer, Rect, Transformer, Label, Tag, Text } from "react-konva";
import type { PhysicalDimensions, PrintArea } from "@/services/platform-api";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import {
  CANVAS_HEIGHT,
  CANVAS_PADDING,
  CANVAS_WIDTH,
  DEFAULT_DPI,
  DEFAULT_PHYSICAL,
  TYPICAL_CHEST_WIDTH_IN,
  defaultCenteredPlaceholder,
  inchesToPrintPixels,
  normalizePlaceholder,
  physicalFrameForView,
  physicalFrameStageRect,
  placeholderToStagePixels,
  resolvePhysical,
  stagePixelsToPlaceholderInches,
  type CanvasOpts,
  type PlaceholderInches,
} from "@/lib/printCoords";
import { TintedGarment } from "../store/TintedGarment";

export const CUSTOMIZATION_METHODS = [
  "screen_print",
  "dtf",
  "embroidery",
  "engraving",
  "sublimation",
  "uv_print",
] as const;

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

function uniquePrintAreaKey(areas: PrintArea[], preferred: string, selfIndex = -1): string {
  const base = slug(preferred) || `area_${areas.length + 1}`;
  const used = new Set(
    areas
      .map((a, i) => (i === selfIndex ? "" : (a.key || "").trim()))
      .filter(Boolean),
  );
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

function uniquePrintAreaLabel(areas: PrintArea[], preferred: string, selfIndex = -1): string {
  const used = new Set(
    areas
      .map((a, i) => (i === selfIndex ? "" : (a.label || "").trim().toLowerCase()))
      .filter(Boolean),
  );
  if (!used.has(preferred.toLowerCase())) return preferred;
  let n = 2;
  while (used.has(`${preferred} ${n}`.toLowerCase())) n += 1;
  return `${preferred} ${n}`;
}

const SNAP = 6;
const MIN_PX = 16;
const BRAND = "#3D5FD9";

function areaToInches(a: PrintArea, phys: PhysicalDimensions): PlaceholderInches {
  const n = normalizePlaceholder(a as unknown as Record<string, unknown>, physicalFrameForView(phys, a.key));
  return {
    xIn: n.xIn,
    yIn: n.yIn,
    widthIn: n.widthIn,
    heightIn: n.heightIn,
    rotationDeg: a.rotationDeg ?? 0,
    scale: a.scale && a.scale > 0 ? a.scale : 1,
    lockSize: Boolean(a.lockSize),
  };
}

function patchFromInches(
  a: PrintArea,
  inches: PlaceholderInches,
  phys: PhysicalDimensions,
): PrintArea {
  const frame = physicalFrameForView(phys, a.key);
  const n = normalizePlaceholder(
    {
      ...a,
      xIn: inches.xIn,
      yIn: inches.yIn,
      widthIn: inches.widthIn,
      heightIn: inches.heightIn,
      scale: inches.scale ?? 1,
      lockSize: inches.lockSize,
      rotationDeg: inches.rotationDeg ?? a.rotationDeg ?? 0,
    },
    frame,
  );
  return {
    ...a,
    xIn: n.xIn,
    yIn: n.yIn,
    widthIn: n.widthIn,
    heightIn: n.heightIn,
    scale: n.scale,
    lockSize: n.lockSize,
    rotationDeg: n.rotationDeg,
    box: n.box,
    maxWidthCm: n.maxWidthCm,
    maxHeightCm: n.maxHeightCm,
  };
}

/**
 * POD design-placeholder editor. Geometry is stored in inches; the Konva
 * stage is a fixed 800×600 logical canvas with uniform inch→px mapping.
 */
export function PrintAreaEditor({
  images,
  maskImageUrl,
  imageViews,
  untintedImageUrls = [],
  colors = [],
  value,
  onChange,
  physicalDimensions,
  onPhysicalDimensionsChange,
  dpi = DEFAULT_DPI,
  onDpiChange,
}: {
  images: string[];
  maskImageUrl?: string;
  /** Optional Front/Back (etc.) labels keyed to mockup image URLs. */
  imageViews?: Array<{ url: string; key: string; label: string }>;
  /** Images that should render exactly as uploaded, without preview tinting. */
  untintedImageUrls?: string[];
  colors?: { name: string; hex: string }[];
  value: PrintArea[];
  onChange: (areas: PrintArea[]) => void;
  physicalDimensions?: PhysicalDimensions;
  onPhysicalDimensionsChange?: (d: PhysicalDimensions) => void;
  dpi?: number;
  onDpiChange?: (dpi: number) => void;
}) {
  const phys = resolvePhysical(physicalDimensions);
  const productDpi = dpi > 0 ? dpi : DEFAULT_DPI;

  const resolvedImages = images.map((u) => resolveMediaUrl(u)).filter(Boolean);
  const resolvedMask = maskImageUrl
    ? resolveMediaUrl(maskImageUrl)
    : resolvedImages[resolvedImages.length - 1] ?? "";
  const untintedImages = useMemo(
    () => new Set(untintedImageUrls.map((u) => resolveMediaUrl(u)).filter(Boolean)),
    [untintedImageUrls.join("|")],
  );
  const [mockup, setMockup] = useState(resolvedImages[resolvedImages.length - 1] ?? "");
  const [tintHex, setTintHex] = useState("");
  const [selected, setSelected] = useState(0);
  const [fitScale, setFitScale] = useState(1);
  const [imageNatural, setImageNatural] = useState<{ w: number; h: number } | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const rectRefs = useRef<(Konva.Rect | null)[]>([]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setFitScale(w / CANVAS_WIDTH);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!resolvedImages.length) return;
    setMockup((cur) => (resolvedImages.includes(cur) ? cur : resolvedImages[resolvedImages.length - 1]));
  }, [resolvedImages.join("|")]);

  const displaySrc = mockup || resolvedMask;
  const displayUsesRawImage = Boolean(displaySrc && untintedImages.has(displaySrc));

  useEffect(() => {
    if (!displaySrc) {
      setImageNatural(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setImageNatural({
        w: img.naturalWidth || img.width,
        h: img.naturalHeight || img.height,
      });
    };
    img.onerror = () => {
      if (!cancelled) setImageNatural(null);
    };
    img.src = displaySrc;
    return () => {
      cancelled = true;
    };
  }, [displaySrc]);

  const canvasOpts: CanvasOpts = useMemo(
    () =>
      imageNatural?.w && imageNatural?.h
        ? { imageNaturalWidth: imageNatural.w, imageNaturalHeight: imageNatural.h }
        : {},
    [imageNatural?.w, imageNatural?.h],
  );

  const update = (index: number, patch: Partial<PrintArea>) => {
    const next = value.map((a, i) => {
      if (i !== index) return a;
      const merged = { ...a, ...patch };
      return patchFromInches(merged, areaToInches(merged, phys), phys);
    });
    onChange(next);
  };

  const updateInches = (index: number, inchesPatch: Partial<PlaceholderInches>) => {
    const a = value[index];
    if (!a) return;
    const cur = areaToInches(a, phys);
    onChange(
      value.map((row, i) =>
        i === index ? patchFromInches(row, { ...cur, ...inchesPatch }, phys) : row,
      ),
    );
  };

  const isVisible = (a: PrintArea) => !a.mockupImageUrl || resolveMediaUrl(a.mockupImageUrl) === mockup;

  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const node = rectRefs.current[selected];
    const a = value[selected];
    if (node && a && isVisible(a)) {
      tr.nodes([node]);
    } else {
      tr.nodes([]);
    }
    tr.getLayer()?.batchDraw();
  }, [selected, value, mockup, phys.width, phys.height, phys.length, imageNatural?.w, imageNatural?.h]);

  function removeArea(index: number) {
    if (index < 0 || index >= value.length) return;
    const next = value.filter((_, i) => i !== index);
    onChange(next);
    if (!next.length) {
      setSelected(0);
      return;
    }
    if (selected > index) setSelected(selected - 1);
    else if (selected === index) setSelected(Math.min(index, next.length - 1));
  }

  function addArea() {
    const n = value.length + 1;
    const view = imageViews?.find((v) => resolveMediaUrl(v.url) === mockup);
    const key = uniquePrintAreaKey(value, view?.key || `area_${n}`);
    const label = uniquePrintAreaLabel(value, view?.label || `Area ${n}`);
    const frame = physicalFrameForView(phys, view?.key || key);
    const centered = defaultCenteredPlaceholder(frame);
    const draft: PrintArea = {
      key,
      label,
      mockupImageUrl: mockup,
      xIn: centered.xIn,
      yIn: centered.yIn,
      widthIn: centered.widthIn,
      heightIn: centered.heightIn,
      rotationDeg: 0,
      scale: 1,
      lockSize: false,
      box: { xPct: 0, yPct: 0, widthPct: 1, heightPct: 1 },
      dpi: productDpi,
      methods: ["dtf"],
    };
    onChange([...value, patchFromInches(draft, { ...centered, scale: 1, lockSize: false, rotationDeg: 0 }, phys)]);
    setSelected(value.length);
  }

  const pxBox = (a: PrintArea) => {
    const inches = areaToInches(a, phys);
    const frame = physicalFrameForView(phys, a.key);
    return placeholderToStagePixels(inches, frame, canvasOpts);
  };

  function commitNode(i: number, node: Konva.Rect) {
    const a = value[i];
    if (!a) return;
    const cur = areaToInches(a, phys);
    const locked = Boolean(cur.lockSize);
    const sx = node.scaleX();
    const sy = node.scaleY();
    const rawW = Math.max(MIN_PX, node.width() * sx);
    const rawH = Math.max(MIN_PX, node.height() * sy);
    node.scaleX(1);
    node.scaleY(1);
    const frame = physicalFrameForView(phys, a.key);

    if (locked) {
      const base = placeholderToStagePixels({ ...cur, scale: 1 }, frame, canvasOpts);
      const nextScale = Math.max(0.05, rawW / Math.max(base.w, 1e-6));
      node.width(base.w * nextScale);
      node.height(base.h * nextScale);
      const inches = stagePixelsToPlaceholderInches(
        { x: node.x(), y: node.y(), w: base.w, h: base.h },
        frame,
        canvasOpts,
        { scale: 1 },
      );
      updateInches(i, {
        xIn: inches.xIn,
        yIn: inches.yIn,
        widthIn: cur.widthIn,
        heightIn: cur.heightIn,
        scale: Math.round(nextScale * 1000) / 1000,
        rotationDeg: Math.round(node.rotation()),
      });
      return;
    }

    node.width(rawW);
    node.height(rawH);
    const inches = stagePixelsToPlaceholderInches(
      { x: node.x(), y: node.y(), w: rawW, h: rawH },
      frame,
      canvasOpts,
      { scale: 1 },
    );
    updateInches(i, {
      ...inches,
      scale: 1,
      rotationDeg: Math.round(node.rotation()),
    });
  }

  function snapDrag(node: Konva.Rect) {
    if (node.rotation() !== 0) return;
    const cx = node.x() + node.width() / 2;
    const cy = node.y() + node.height() / 2;
    if (Math.abs(cx - CANVAS_WIDTH / 2) < SNAP) node.x(CANVAS_WIDTH / 2 - node.width() / 2);
    if (Math.abs(cy - CANVAS_HEIGHT / 2) < SNAP) node.y(CANVAS_HEIGHT / 2 - node.height() / 2);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const a = value[selected];
    if (!a) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      removeArea(selected);
      return;
    }
    const stepIn = e.shiftKey ? 0.5 : 0.1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-stepIn, 0],
      ArrowRight: [stepIn, 0],
      ArrowUp: [0, -stepIn],
      ArrowDown: [0, stepIn],
    };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      const cur = areaToInches(a, phys);
      const frame = physicalFrameForView(phys, a.key);
      updateInches(selected, {
        xIn: Math.min(frame.width - cur.widthIn, Math.max(0, cur.xIn + m[0])),
        yIn: Math.min(frame.height - cur.heightIn, Math.max(0, cur.yIn + m[1])),
      });
    }
  }

  const area = value[selected];
  const areaIn = area ? areaToInches(area, phys) : null;
  const exportPreview = useMemo(() => {
    if (!areaIn) return null;
    return {
      w: inchesToPrintPixels(areaIn.widthIn, area?.dpi || productDpi),
      h: inchesToPrintPixels(areaIn.heightIn, area?.dpi || productDpi),
    };
  }, [areaIn, area?.dpi, productDpi]);
  const frameLooksLikePrintSize =
    areaIn != null &&
    phys.width <= areaIn.widthIn + 0.05 &&
    phys.height <= areaIn.heightIn + 0.05;
  const printPctOfMockup =
    areaIn != null && phys.width > 0 ? (areaIn.widthIn / phys.width) * 100 : 0;
  /** On a real adult chest (~18″), a 4.5″ print is ~25% of chest — not of the photo. */
  const expectedPctOfChest =
    areaIn != null ? (areaIn.widthIn / TYPICAL_CHEST_WIDTH_IN) * 100 : 0;
  const looksOversizedOnGarment =
    areaIn != null &&
    !frameLooksLikePrintSize &&
    printPctOfMockup > expectedPctOfChest * 1.35;
  const scaleFrame = physicalFrameStageRect(phys, canvasOpts);
  const inchTickPx = scaleFrame.pxPerInchX;

  return (
    <div className="row" style={{ gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 360px", minWidth: 320 }}>
        <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
          <strong style={{ color: "var(--ink)", fontWeight: 600 }}>Mockup image size (inches)</strong>{" "}
          is the real-world size of the <em>flat garment mockup</em> (default{" "}
          {DEFAULT_PHYSICAL.width}×{DEFAULT_PHYSICAL.height}″), not the print plate. Print areas are
          mapped as a fraction of that width.
        </p>
        <div className="row" style={{ gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <div className="field" style={{ flex: "1 1 90px" }}>
            <label className="lbl">Mockup W (in)</label>
            <input
              className="inp"
              type="number"
              min={1}
              step={0.1}
              value={phys.width}
              onChange={(e) =>
                onPhysicalDimensionsChange?.({
                  ...phys,
                  width: Number(e.target.value) || DEFAULT_PHYSICAL.width,
                })
              }
              disabled={!onPhysicalDimensionsChange}
            />
          </div>
          <div className="field" style={{ flex: "1 1 90px" }}>
            <label className="lbl">Mockup H (in)</label>
            <input
              className="inp"
              type="number"
              min={1}
              step={0.1}
              value={phys.height}
              onChange={(e) =>
                onPhysicalDimensionsChange?.({
                  ...phys,
                  height: Number(e.target.value) || DEFAULT_PHYSICAL.height,
                })
              }
              disabled={!onPhysicalDimensionsChange}
            />
          </div>
          <div className="field" style={{ flex: "1 1 90px" }}>
            <label className="lbl">Length (in)</label>
            <input
              className="inp"
              type="number"
              min={1}
              step={0.1}
              value={phys.length ?? DEFAULT_PHYSICAL.length}
              onChange={(e) =>
                onPhysicalDimensionsChange?.({
                  ...phys,
                  length: Number(e.target.value) || DEFAULT_PHYSICAL.length,
                })
              }
              disabled={!onPhysicalDimensionsChange}
            />
          </div>
          <div className="field" style={{ flex: "1 1 90px" }}>
            <label className="lbl">Print DPI</label>
            <input
              className="inp"
              type="number"
              min={72}
              step={1}
              value={productDpi}
              onChange={(e) => onDpiChange?.(Number(e.target.value) || DEFAULT_DPI)}
              disabled={!onDpiChange}
            />
          </div>
        </div>
        {onPhysicalDimensionsChange && (
          <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                onPhysicalDimensionsChange({
                  width: DEFAULT_PHYSICAL.width,
                  height: DEFAULT_PHYSICAL.height,
                  length: DEFAULT_PHYSICAL.length,
                })
              }
            >
              Flat mockup {DEFAULT_PHYSICAL.width}×{DEFAULT_PHYSICAL.height}
            </button>
          </div>
        )}
        {areaIn && (
          <p className="muted" style={{ fontSize: 12, margin: "0 0 10px" }}>
            This {areaIn.widthIn.toFixed(2)}″ area is{" "}
            <strong style={{ color: "var(--ink)" }}>{printPctOfMockup.toFixed(0)}%</strong> of mockup
            width ({phys.width}″). On a ~{TYPICAL_CHEST_WIDTH_IN}″ adult chest it should look about{" "}
            {expectedPctOfChest.toFixed(0)}% of the shirt.
          </p>
        )}
        {frameLooksLikePrintSize && (
          <p style={{ fontSize: 12, color: "#b45309", margin: "0 0 10px" }}>
            Mockup size matches this print area, so {areaIn!.widthIn}″ fills the whole image. Set
            Mockup W/H to the flat garment size ({DEFAULT_PHYSICAL.width}×{DEFAULT_PHYSICAL.height}
            ″).
          </p>
        )}
        {looksOversizedOnGarment && onPhysicalDimensionsChange && (
          <p style={{ fontSize: 12, color: "#b45309", margin: "0 0 10px" }}>
            {areaIn!.widthIn}″ looks large relative to Mockup W ({phys.width}″). Use a flat measured
            mockup and set Mockup W/H to {DEFAULT_PHYSICAL.width}×{DEFAULT_PHYSICAL.height}.{" "}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: 4, verticalAlign: "baseline" }}
              onClick={() =>
                onPhysicalDimensionsChange({
                  width: DEFAULT_PHYSICAL.width,
                  height: DEFAULT_PHYSICAL.height,
                  length: DEFAULT_PHYSICAL.length,
                })
              }
            >
              Use flat {DEFAULT_PHYSICAL.width}×{DEFAULT_PHYSICAL.height}
            </button>
          </p>
        )}

        {resolvedImages.length > 1 && (
          <div className="field">
            <label className="lbl">Mockup image</label>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {resolvedImages.map((src) => {
                const view = imageViews?.find((v) => resolveMediaUrl(v.url) === src);
                return (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setMockup(src)}
                    title={view?.label || "Mockup"}
                    style={{
                      width: 48,
                      height: 48,
                      padding: 0,
                      border: mockup === src ? "2px solid var(--brand)" : "1px solid var(--line)",
                      borderRadius: 6,
                      overflow: "hidden",
                      cursor: "pointer",
                      background: "#fff",
                      position: "relative",
                    }}
                  >
                    <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    {view?.label && (
                      <span
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          bottom: 0,
                          fontSize: 9,
                          fontWeight: 700,
                          textAlign: "center",
                          background: "rgba(0,0,0,.55)",
                          color: "#fff",
                          lineHeight: "14px",
                        }}
                      >
                        {view.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="muted" style={{ fontSize: 11, margin: "6px 0 0" }}>
              Switch mockups to place design placeholders on the front or back. New areas bind to the
              selected image.
            </p>
          </div>
        )}

        {colors.length > 0 && !displayUsesRawImage && (
          <div className="field" style={{ marginTop: 8 }}>
            <label className="lbl">Preview colour</label>
            <p className="muted" style={{ fontSize: 11, margin: "0 0 6px" }}>
              Recolours the garment only. Background stays transparent.
            </p>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <button
                type="button"
                className={tintHex === "" ? "btn btn-dark btn-sm" : "btn btn-ghost btn-sm"}
                onClick={() => setTintHex("")}
              >
                None
              </button>
              {colors.map((c) => (
                <button
                  key={c.hex + c.name}
                  type="button"
                  title={c.name}
                  onClick={() => setTintHex(c.hex)}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    background: c.hex,
                    cursor: "pointer",
                    border: tintHex === c.hex ? "2px solid var(--brand)" : "1px solid var(--line)",
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div
          ref={wrapRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
            background: "var(--surface-2)",
            border: "1px solid var(--line)",
            borderRadius: 10,
            overflow: "hidden",
            outline: "none",
            marginTop: 10,
          }}
        >
          {displaySrc ? (
            <div
              style={{
                position: "absolute",
                left: CANVAS_PADDING * fitScale,
                top: CANVAS_PADDING * fitScale,
                right: CANVAS_PADDING * fitScale,
                bottom: CANVAS_PADDING * fitScale,
                pointerEvents: "none",
              }}
            >
              <TintedGarment src={displaySrc} hex={displayUsesRawImage ? undefined : tintHex} alt="mockup" />
            </div>
          ) : (
            <div className="muted" style={{ padding: 24, textAlign: "center" }}>
              Upload a production mask to place print areas.
            </div>
          )}

          {fitScale > 0 && displaySrc && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                transform: `scale(${fitScale})`,
                transformOrigin: "top left",
                width: CANVAS_WIDTH,
                height: CANVAS_HEIGHT,
              }}
            >
              <Stage
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                onMouseDown={(e) => {
                  if (e.target === e.target.getStage()) wrapRef.current?.focus();
                }}
              >
                <Layer>
                  {/* 1″ scale bar — calibrate Mockup W until this matches a real inch on the garment. */}
                  {inchTickPx > 4 && (
                    <>
                      <Rect
                        x={scaleFrame.frameX + 8}
                        y={scaleFrame.frameY + scaleFrame.frameH - 22}
                        width={inchTickPx}
                        height={3}
                        fill={BRAND}
                        listening={false}
                      />
                      <Text
                        x={scaleFrame.frameX + 8}
                        y={scaleFrame.frameY + scaleFrame.frameH - 38}
                        text="1 in"
                        fontSize={11}
                        fill={BRAND}
                        fontStyle="bold"
                        listening={false}
                      />
                    </>
                  )}
                  {value.map((a, i) => {
                    if (!isVisible(a)) {
                      rectRefs.current[i] = null;
                      return null;
                    }
                    const b = pxBox(a);
                    const isSel = i === selected;
                    const inches = areaToInches(a, phys);
                    return (
                      <Rect
                        key={i}
                        ref={(node) => {
                          rectRefs.current[i] = node;
                        }}
                        x={b.x}
                        y={b.y}
                        width={b.w}
                        height={b.h}
                        rotation={inches.rotationDeg ?? 0}
                        draggable
                        stroke={isSel ? BRAND : "rgba(0,0,0,.45)"}
                        strokeWidth={isSel ? 2 : 1.5}
                        dash={isSel ? undefined : [5, 4]}
                        fill={isSel ? "rgba(61,95,217,.12)" : "rgba(0,0,0,.04)"}
                        onMouseDown={() => setSelected(i)}
                        onTap={() => setSelected(i)}
                        onDragMove={(e) => snapDrag(e.target as Konva.Rect)}
                        onDragEnd={(e) => {
                          setSelected(i);
                          commitNode(i, e.target as Konva.Rect);
                        }}
                        onTransformEnd={(e) => commitNode(i, e.target as Konva.Rect)}
                      />
                    );
                  })}

                  {value.map((a, i) => {
                    if (!isVisible(a)) return null;
                    const b = pxBox(a);
                    const inches = areaToInches(a, phys);
                    const sc = inches.scale && inches.scale > 0 ? inches.scale : 1;
                    const label =
                      inches.lockSize && Math.abs(sc - 1) > 0.02
                        ? `${a.label}  ${inches.widthIn.toFixed(2)}×${inches.heightIn.toFixed(2)} in · preview ×${sc.toFixed(2)}`
                        : `${a.label}  ${inches.widthIn.toFixed(2)}×${inches.heightIn.toFixed(2)} in`;
                    return (
                      <Label
                        key={`lbl-${i}`}
                        x={b.x}
                        y={Math.max(0, b.y - 22)}
                        rotation={inches.rotationDeg ?? 0}
                        listening={false}
                      >
                        <Tag fill="#fff" stroke="var(--line)" cornerRadius={3} />
                        <Text text={label} fontSize={11} fontStyle="bold" padding={3} fill="#1c1c1c" />
                      </Label>
                    );
                  })}

                  <Transformer
                    ref={trRef}
                    rotateEnabled
                    keepRatio={Boolean(areaIn?.lockSize)}
                    rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
                    anchorSize={9}
                    anchorStroke={BRAND}
                    borderStroke={BRAND}
                    boundBoxFunc={(oldBox, newBox) =>
                      newBox.width < MIN_PX || newBox.height < MIN_PX ? oldBox : newBox
                    }
                  />
                </Layer>
              </Stage>
            </div>
          )}
        </div>

        <div className="row" style={{ gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
          {value.length > 0 && (
            <div className="row" style={{ gap: 6, flexWrap: "wrap", flex: "1 1 auto" }}>
              {value.map((a, i) => {
                const label = a.label || `Area ${i + 1}`;
                return (
                  <div
                    key={`${a.key || a.label || "area"}_${i}`}
                    className={i === selected ? "btn btn-dark btn-sm" : "btn btn-ghost btn-sm"}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      paddingRight: 6,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(i);
                        if (a.mockupImageUrl) {
                          const src = resolveMediaUrl(a.mockupImageUrl);
                          if (src && resolvedImages.includes(src)) setMockup(src);
                        }
                      }}
                      title={
                        a.widthIn && a.heightIn ? `${a.widthIn}×${a.heightIn} in` : label
                      }
                      style={{
                        background: "none",
                        border: "none",
                        color: "inherit",
                        font: "inherit",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      {label}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${label}`}
                      title={`Remove ${label}`}
                      onClick={() => removeArea(i)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "inherit",
                        cursor: "pointer",
                        padding: 0,
                        lineHeight: 1,
                        fontSize: 16,
                        opacity: 0.75,
                      }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <button type="button" className="btn btn-soft btn-sm" onClick={addArea}>
            + Add print area
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            Inches are source of truth · drag / resize / rotate · arrows nudge 0.1″ · × removes an
            area
          </span>
        </div>
      </div>

      <div style={{ flex: "1 1 300px", minWidth: 280 }}>
        {!value.length && (
          <p className="muted">No print areas yet. Add one to define where artwork can be placed.</p>
        )}
        {area && areaIn && (
          <div className="card" style={{ padding: 16 }}>
            <div className="field">
              <label className="lbl">Label</label>
              <input
                className="inp"
                value={area.label}
                onChange={(e) => {
                  const label = e.target.value;
                  update(selected, {
                    label,
                    key: uniquePrintAreaKey(value, slug(label) || `area_${selected + 1}`, selected),
                  });
                }}
              />
            </div>
            <div className="row" style={{ gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label className="lbl">X (in)</label>
                <input
                  className="inp"
                  type="number"
                  step={0.1}
                  value={areaIn.xIn}
                  onChange={(e) => updateInches(selected, { xIn: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label className="lbl">Y (in)</label>
                <input
                  className="inp"
                  type="number"
                  step={0.1}
                  value={areaIn.yIn}
                  onChange={(e) => updateInches(selected, { yIn: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="row" style={{ gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label className="lbl">Width (in)</label>
                <input
                  className="inp"
                  type="number"
                  step={0.1}
                  min={0.1}
                  value={areaIn.widthIn}
                  disabled={Boolean(areaIn.lockSize)}
                  onChange={(e) => updateInches(selected, { widthIn: Number(e.target.value) || 0.1 })}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label className="lbl">Height (in)</label>
                <input
                  className="inp"
                  type="number"
                  step={0.1}
                  min={0.1}
                  value={areaIn.heightIn}
                  disabled={Boolean(areaIn.lockSize)}
                  onChange={(e) => updateInches(selected, { heightIn: Number(e.target.value) || 0.1 })}
                />
              </div>
            </div>
            <label className="row" style={{ gap: 8, alignItems: "center", margin: "8px 0" }}>
              <input
                type="checkbox"
                checked={Boolean(areaIn.lockSize)}
                onChange={(e) => {
                  const locked = e.target.checked;
                  if (locked) {
                    // Freeze current print inches; further transforms only change preview scale.
                    updateInches(selected, { lockSize: true, scale: areaIn.scale && areaIn.scale > 0 ? areaIn.scale : 1 });
                    return;
                  }
                  // Unlock: bake preview scale into print inches so the box stays the same size.
                  const sc = areaIn.scale && areaIn.scale > 0 ? areaIn.scale : 1;
                  updateInches(selected, {
                    lockSize: false,
                    widthIn: Math.round(areaIn.widthIn * sc * 1000) / 1000,
                    heightIn: Math.round(areaIn.heightIn * sc * 1000) / 1000,
                    scale: 1,
                  });
                }}
              />
              <span style={{ fontSize: 13 }}>Lock print size (resize changes preview scale only)</span>
            </label>
            {areaIn.lockSize && (
              <p className="muted" style={{ fontSize: 12, margin: "0 0 10px" }}>
                Print stays {areaIn.widthIn.toFixed(2)}×{areaIn.heightIn.toFixed(2)}″ (
                {exportPreview ? `${exportPreview.w}×${exportPreview.h} px` : "—"}). Expanding the
                box only changes preview scale
                {areaIn.scale && Math.abs(areaIn.scale - 1) > 0.02
                  ? ` (now ×${areaIn.scale.toFixed(2)})`
                  : ""}
                Production file size does not grow.
              </p>
            )}
            <div className="row" style={{ gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label className="lbl">Rotation (°)</label>
                <input
                  className="inp"
                  type="number"
                  value={Math.round(areaIn.rotationDeg ?? 0)}
                  onChange={(e) => updateInches(selected, { rotationDeg: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label className="lbl">Area DPI</label>
                <input
                  className="inp"
                  type="number"
                  value={area.dpi ?? productDpi}
                  onChange={(e) => update(selected, { dpi: Number(e.target.value) || productDpi })}
                />
              </div>
            </div>
            {exportPreview && !areaIn.lockSize && (
              <p className="muted" style={{ fontSize: 12, margin: "0 0 10px" }}>
                Export preview: {exportPreview.w}×{exportPreview.h} px
              </p>
            )}
            <div className="field">
              <label className="lbl">Allowed methods</label>
              <div className="row" style={{ flexWrap: "wrap", gap: 0 }}>
                {CUSTOMIZATION_METHODS.map((m) => {
                  const on = (area.methods ?? []).includes(m);
                  return (
                    <button
                      type="button"
                      key={m}
                      className="chip"
                      style={on ? { borderColor: "var(--brand)", color: "var(--brand-d)" } : undefined}
                      onClick={() =>
                        update(selected, {
                          methods: on
                            ? (area.methods ?? []).filter((x) => x !== m)
                            : [...(area.methods ?? []), m],
                        })
                      }
                    >
                      {m.replace(/_/g, " ")}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-danger-ghost"
              onClick={() => removeArea(selected)}
            >
              Remove this area
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
