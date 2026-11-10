/**
 * Inch-accurate print-area coordinates — single source of truth for admin,
 * designer, export, and mockup composite. Physical inches drive geometry;
 * editor pixels and print-DPI pixels are derived.
 *
 * See docs/print-coordinate-systems.md
 */

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;
export const CANVAS_PADDING = 40;
export const EFFECTIVE_W = CANVAS_WIDTH - 2 * CANVAS_PADDING; // 720
export const EFFECTIVE_H = CANVAS_HEIGHT - 2 * CANVAS_PADDING; // 520

/** Flat garment / product shot that fills most of the mockup frame. */
export const DEFAULT_PHYSICAL = { width: 20, height: 24, length: 18 } as const;
/** Typical adult tee chest width — used for on-canvas scale guidance. */
export const TYPICAL_CHEST_WIDTH_IN = 18;
export const DEFAULT_DPI = 300;
export const DEFAULT_PLACEHOLDER_IN = 6;
/** Warn in the designer when artwork effective DPI falls below this. */
export const MIN_EFFECTIVE_DPI = 300;

export type PhysicalDimensions = {
  width: number;
  height: number;
  length?: number;
};

export type PlaceholderInches = {
  id?: string;
  key?: string;
  name?: string;
  label?: string;
  xIn: number;
  yIn: number;
  widthIn: number;
  heightIn: number;
  rotationDeg?: number;
  /** Visual-only scale; does not change print inches or export size. */
  scale?: number;
  /** When true, transform updates `scale` only — inches stay fixed. */
  lockSize?: boolean;
  shapeType?: "rect" | "polygon";
  polygonPoints?: Array<{ xIn: number; yIn: number }>;
};

export type StagePixels = {
  x: number;
  y: number;
  w: number;
  h: number;
  pxPerInch: number;
};

/**
 * Where the product mockup image sits on the editor stage, and how inches map
 * onto that displayed image (image size is never shrunk by physical dims).
 */
export type PhysicalFrameStage = {
  frameX: number;
  frameY: number;
  frameW: number;
  frameH: number;
  /** px per inch along X (frameW / physicalWidth). */
  pxPerInchX: number;
  /** px per inch along Y (frameH / physicalHeight). */
  pxPerInchY: number;
  /** min(pxPerInchX, pxPerInchY) — for DPI warnings / uniform helpers. */
  pxPerInch: number;
  padding: number;
  canvasWidth: number;
  canvasHeight: number;
};

export type CanvasOpts = {
  canvasWidth?: number;
  canvasHeight?: number;
  padding?: number;
  /** When set, inches map onto the object-fit rect of this image. */
  imageNaturalWidth?: number;
  imageNaturalHeight?: number;
  /** How the mockup image fills the padded canvas. Default contain. */
  imageFit?: "contain" | "cover";
};

/** object-fit: contain/cover rect for a mockup inside the padded canvas. */
export function imageContainRect(
  imageNaturalWidth: number,
  imageNaturalHeight: number,
  opts: CanvasOpts = {},
): { x: number; y: number; w: number; h: number } {
  const canvasWidth = opts.canvasWidth ?? CANVAS_WIDTH;
  const canvasHeight = opts.canvasHeight ?? CANVAS_HEIGHT;
  const padding = opts.padding ?? CANVAS_PADDING;
  const effW = canvasWidth - 2 * padding;
  const effH = canvasHeight - 2 * padding;
  const iw = Math.max(imageNaturalWidth, 1);
  const ih = Math.max(imageNaturalHeight, 1);
  const scale =
    opts.imageFit === "cover" ? Math.max(effW / iw, effH / ih) : Math.min(effW / iw, effH / ih);
  const w = iw * scale;
  const h = ih * scale;
  return {
    x: padding + (effW - w) / 2,
    y: padding + (effH - h) / 2,
    w,
    h,
  };
}

export function resolvePhysical(
  phys?: Partial<PhysicalDimensions> | null,
): PhysicalDimensions {
  return {
    width: positive(phys?.width, DEFAULT_PHYSICAL.width),
    height: positive(phys?.height, DEFAULT_PHYSICAL.height),
    length: positive(phys?.length, DEFAULT_PHYSICAL.length),
  };
}

/**
 * Physical frame for a view. Side views (left/right) use length × height
 * so the inch grid matches the garment silhouette.
 */
export function physicalFrameForView(
  phys: Partial<PhysicalDimensions> | null | undefined,
  viewKey?: string,
): PhysicalDimensions {
  const p = resolvePhysical(phys);
  const key = (viewKey || "").toLowerCase();
  if (key === "left" || key === "right" || key.includes("side")) {
    return { width: p.length ?? DEFAULT_PHYSICAL.length, height: p.height, length: p.length };
  }
  return p;
}

export function calculatePxPerInch(
  physW: number,
  physH: number,
  effectiveW: number = EFFECTIVE_W,
  effectiveH: number = EFFECTIVE_H,
): number {
  const w = Math.max(physW, 1e-6);
  const h = Math.max(physH, 1e-6);
  return Math.min(effectiveW / w, effectiveH / h);
}

export function inchesToPx(inches: number, pxPerInch: number): number {
  return inches * pxPerInch;
}

export function pxToInches(px: number, pxPerInch: number): number {
  return px / Math.max(pxPerInch, 1e-6);
}

/** Production export size: inches × print DPI (not editor PX_PER_INCH). */
export function inchesToPrintPixels(inches: number, dpi: number = DEFAULT_DPI): number {
  return Math.round(inches * Math.max(dpi, 1));
}

export function printExportSize(
  widthIn: number,
  heightIn: number,
  dpi: number = DEFAULT_DPI,
): { widthPx: number; heightPx: number } {
  return {
    widthPx: inchesToPrintPixels(widthIn, dpi),
    heightPx: inchesToPrintPixels(heightIn, dpi),
  };
}

/** Scale factor from editor stage pixels → print-DPI canvas. */
export function editorToPrintDrawScale(dpi: number, pxPerInch: number): number {
  return Math.max(dpi, 1) / Math.max(pxPerInch, 1e-6);
}

/**
 * Displayed mockup bounds on the stage. The product image keeps its natural
 * contain/cover size; physical inches map onto that rect (widthIn/physW of image width).
 */
export function physicalFrameStageRect(
  phys: Partial<PhysicalDimensions> | null | undefined,
  opts: CanvasOpts = {},
): PhysicalFrameStage {
  const canvasWidth = opts.canvasWidth ?? CANVAS_WIDTH;
  const canvasHeight = opts.canvasHeight ?? CANVAS_HEIGHT;
  const padding = opts.padding ?? CANVAS_PADDING;
  const frame = resolvePhysical(phys);
  const host =
    opts.imageNaturalWidth && opts.imageNaturalHeight
      ? imageContainRect(opts.imageNaturalWidth, opts.imageNaturalHeight, opts)
      : {
          x: padding,
          y: padding,
          w: canvasWidth - 2 * padding,
          h: canvasHeight - 2 * padding,
        };
  const pxPerInchX = host.w / Math.max(frame.width, 1e-6);
  const pxPerInchY = host.h / Math.max(frame.height, 1e-6);
  return {
    frameX: host.x,
    frameY: host.y,
    frameW: host.w,
    frameH: host.h,
    pxPerInchX,
    pxPerInchY,
    pxPerInch: Math.min(pxPerInchX, pxPerInchY),
    padding,
    canvasWidth,
    canvasHeight,
  };
}

export function placeholderToStagePixels(
  ph: PlaceholderInches,
  phys: Partial<PhysicalDimensions> | null | undefined,
  opts: CanvasOpts = {},
): StagePixels {
  const { frameX, frameY, pxPerInchX, pxPerInchY, pxPerInch } = physicalFrameStageRect(phys, opts);
  const visualScale = ph.scale && ph.scale > 0 ? ph.scale : 1;
  return {
    x: frameX + ph.xIn * pxPerInchX,
    y: frameY + ph.yIn * pxPerInchY,
    w: ph.widthIn * pxPerInchX * visualScale,
    h: ph.heightIn * pxPerInchY * visualScale,
    pxPerInch,
  };
}

/** Inverse: stage top-left + size → inches (ignores visual scale for size). */
export function stagePixelsToPlaceholderInches(
  stage: { x: number; y: number; w: number; h: number },
  phys: Partial<PhysicalDimensions> | null | undefined,
  opts: CanvasOpts = {},
  existing?: Pick<PlaceholderInches, "scale" | "lockSize" | "rotationDeg">,
): Pick<PlaceholderInches, "xIn" | "yIn" | "widthIn" | "heightIn"> {
  const { frameX, frameY, pxPerInchX, pxPerInchY } = physicalFrameStageRect(phys, opts);
  const visualScale = existing?.scale && existing.scale > 0 ? existing.scale : 1;
  return {
    xIn: roundIn((stage.x - frameX) / pxPerInchX),
    yIn: roundIn((stage.y - frameY) / pxPerInchY),
    widthIn: roundIn(stage.w / pxPerInchX / visualScale),
    heightIn: roundIn(stage.h / pxPerInchY / visualScale),
  };
}

export function defaultCenteredPlaceholder(
  phys: Partial<PhysicalDimensions> | null | undefined,
  sizeIn: number = DEFAULT_PLACEHOLDER_IN,
): Pick<PlaceholderInches, "xIn" | "yIn" | "widthIn" | "heightIn"> {
  const frame = resolvePhysical(phys);
  const side = Math.min(sizeIn, frame.width, frame.height);
  return {
    xIn: roundIn((frame.width - side) / 2),
    yIn: roundIn((frame.height - side) / 2),
    widthIn: roundIn(side),
    heightIn: roundIn(side),
  };
}

/** Derived % box for legacy CSS overlays (relative to full canvas). */
export function placeholderToLegacyBoxPct(
  ph: PlaceholderInches,
  phys: Partial<PhysicalDimensions> | null | undefined,
  opts: CanvasOpts = {},
): { xPct: number; yPct: number; widthPct: number; heightPct: number } {
  const canvasWidth = opts.canvasWidth ?? CANVAS_WIDTH;
  const canvasHeight = opts.canvasHeight ?? CANVAS_HEIGHT;
  const stage = placeholderToStagePixels(ph, phys, opts);
  return {
    xPct: roundPct((stage.x / canvasWidth) * 100),
    yPct: roundPct((stage.y / canvasHeight) * 100),
    widthPct: roundPct((stage.w / canvasWidth) * 100),
    heightPct: roundPct((stage.h / canvasHeight) * 100),
  };
}

/**
 * Normalize a stored print area (inches preferred; legacy % / cm supported).
 * Always returns inch fields as the source of truth.
 */
export function normalizePlaceholder(
  raw: Record<string, unknown> | null | undefined,
  phys: Partial<PhysicalDimensions> | null | undefined,
): PlaceholderInches & {
  box: { xPct: number; yPct: number; widthPct: number; heightPct: number };
  maxWidthCm: number;
  maxHeightCm: number;
} {
  const frame = resolvePhysical(phys);
  const box = (raw?.box as { xPct?: number; yPct?: number; widthPct?: number; heightPct?: number }) || {};
  let xIn = num(raw?.xIn);
  let yIn = num(raw?.yIn);
  let widthIn = num(raw?.widthIn);
  let heightIn = num(raw?.heightIn);

  if (!(widthIn > 0 && heightIn > 0)) {
    const maxWcm = num(raw?.maxWidthCm);
    const maxHcm = num(raw?.maxHeightCm);
    if (maxWcm > 0 && maxHcm > 0) {
      widthIn = cmToIn(maxWcm);
      heightIn = cmToIn(maxHcm);
      xIn = num(box.xPct) > 0 || num(box.yPct) > 0
        ? (num(box.xPct) / 100) * frame.width
        : (frame.width - widthIn) / 2;
      yIn = num(box.xPct) > 0 || num(box.yPct) > 0
        ? (num(box.yPct) / 100) * frame.height
        : (frame.height - heightIn) / 2;
    } else if (num(box.widthPct) > 0 && num(box.heightPct) > 0) {
      xIn = (num(box.xPct) / 100) * frame.width;
      yIn = (num(box.yPct) / 100) * frame.height;
      widthIn = (num(box.widthPct) / 100) * frame.width;
      heightIn = (num(box.heightPct) / 100) * frame.height;
    } else {
      const d = defaultCenteredPlaceholder(frame);
      xIn = d.xIn;
      yIn = d.yIn;
      widthIn = d.widthIn;
      heightIn = d.heightIn;
    }
  }

  const ph: PlaceholderInches = {
    id: str(raw?.id) || str(raw?.key) || undefined,
    key: str(raw?.key) || undefined,
    name: str(raw?.name) || str(raw?.label) || undefined,
    label: str(raw?.label) || str(raw?.name) || undefined,
    xIn: roundIn(xIn),
    yIn: roundIn(yIn),
    widthIn: roundIn(Math.max(widthIn, 0.1)),
    heightIn: roundIn(Math.max(heightIn, 0.1)),
    rotationDeg: num(raw?.rotationDeg),
    scale: num(raw?.scale) > 0 ? num(raw?.scale) : 1,
    lockSize: Boolean(raw?.lockSize),
    shapeType: raw?.shapeType === "polygon" ? "polygon" : "rect",
    polygonPoints: Array.isArray(raw?.polygonPoints)
      ? (raw!.polygonPoints as Array<{ xIn: number; yIn: number }>)
      : undefined,
  };

  const legacyBox = placeholderToLegacyBoxPct(ph, frame);
  return {
    ...ph,
    box: legacyBox,
    maxWidthCm: roundCm(ph.widthIn * 2.54),
    maxHeightCm: roundCm(ph.heightIn * 2.54),
  };
}

/**
 * Effective print DPI of artwork given its natural pixel width and on-canvas
 * display width in editor pixels.
 * effectiveDpi = naturalWidth / displayWidthInches
 */
export function effectiveArtworkDpi(
  imageNaturalWidth: number,
  displayWidthPx: number,
  pxPerInch: number,
): number {
  const displayIn = pxToInches(displayWidthPx, pxPerInch);
  if (!(displayIn > 0) || !(imageNaturalWidth > 0)) return 0;
  return imageNaturalWidth / displayIn;
}

/**
 * Place a print-DPI design (or editor artwork) onto a mockup bitmap using inches.
 * Returns top-left + size in mockup image pixels (fill into placeholder).
 */
export function designPlacementOnMockup(args: {
  mockupWidthPx: number;
  mockupHeightPx: number;
  placeholder: PlaceholderInches;
  physicalDimensions?: Partial<PhysicalDimensions> | null;
  viewKey?: string;
}): {
  x: number;
  y: number;
  w: number;
  h: number;
  pxPerInch: number;
  rotationDeg: number;
} {
  const frame = physicalFrameForView(args.physicalDimensions, args.viewKey);
  // The editor maps each physical axis across the displayed image. Use the
  // same mapping when baking artwork into the image's native pixel bounds.
  const stage = placeholderToStagePixels(args.placeholder, frame, {
    canvasWidth: args.mockupWidthPx,
    canvasHeight: args.mockupHeightPx,
    padding: 0,
  });
  return {
    x: stage.x,
    y: stage.y,
    w: stage.w,
    h: stage.h,
    pxPerInch: stage.pxPerInch,
    rotationDeg: args.placeholder.rotationDeg || 0,
  };
}

/**
 * Map a point in print-area local space (origin = unrotated top-left) into
 * parent space. Rotation matches Konva / CSS `transform-origin: top left`.
 */
export function printLocalToParent(
  localX: number,
  localY: number,
  originX: number,
  originY: number,
  rotationDeg = 0,
): { x: number; y: number } {
  const rad = ((rotationDeg || 0) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return {
    x: originX + localX * c - localY * s,
    y: originY + localX * s + localY * c,
  };
}

/** Inverse of `printLocalToParent`. */
export function parentToPrintLocal(
  parentX: number,
  parentY: number,
  originX: number,
  originY: number,
  rotationDeg = 0,
): { x: number; y: number } {
  return printLocalToParent(parentX - originX, parentY - originY, 0, 0, -(rotationDeg || 0));
}

export function cmToIn(cm: number): number {
  return cm / 2.54;
}

export function inToCm(inches: number): number {
  return inches * 2.54;
}

/**
 * Artwork placement. Print-area % (`printCxPct` / `printCyPct` / `printWPct`)
 * is the source of truth; canvas % is mirrored for legacy CSS thumbs.
 */
export type ArtworkPlacement = {
  printCxPct?: number;
  printCyPct?: number;
  printWPct?: number;
  xPct: number;
  yPct: number;
  wPct: number;
  rot: number;
};

export type PrintStageRect = { x: number; y: number; w: number; h: number };

export function hasPrintRelativePlacement(
  pl: Partial<ArtworkPlacement> | null | undefined,
): pl is ArtworkPlacement & { printCxPct: number; printCyPct: number; printWPct: number } {
  return (
    !!pl &&
    Number.isFinite(pl.printCxPct) &&
    Number.isFinite(pl.printCyPct) &&
    Number.isFinite(pl.printWPct)
  );
}

/** Resolve artwork center/size on the editor stage from a placement. */
export function placementToStagePixels(
  pl: ArtworkPlacement,
  printStage: PrintStageRect,
  canvasW = CANVAS_WIDTH,
  canvasH = CANVAS_HEIGHT,
): { cx: number; cy: number; w: number; rot: number } {
  if (hasPrintRelativePlacement(pl)) {
    return {
      cx: printStage.x + (pl.printCxPct / 100) * printStage.w,
      cy: printStage.y + (pl.printCyPct / 100) * printStage.h,
      w: (pl.printWPct / 100) * printStage.w,
      rot: pl.rot || 0,
    };
  }
  return {
    cx: (pl.xPct / 100) * canvasW,
    cy: (pl.yPct / 100) * canvasH,
    w: (pl.wPct / 100) * canvasW,
    rot: pl.rot || 0,
  };
}

/** Persist placement relative to the print area, with canvas % mirrored. */
export function stagePixelsToArtworkPlacement(
  cx: number,
  cy: number,
  w: number,
  rot: number,
  printStage: PrintStageRect,
  canvasW = CANVAS_WIDTH,
  canvasH = CANVAS_HEIGHT,
): ArtworkPlacement {
  const printCxPct = printStage.w > 0 ? ((cx - printStage.x) / printStage.w) * 100 : 50;
  const printCyPct = printStage.h > 0 ? ((cy - printStage.y) / printStage.h) * 100 : 50;
  const printWPct = printStage.w > 0 ? (w / printStage.w) * 100 : 90;
  return {
    printCxPct: roundPct(printCxPct),
    printCyPct: roundPct(printCyPct),
    printWPct: roundPct(printWPct),
    xPct: roundPct((cx / canvasW) * 100),
    yPct: roundPct((cy / canvasH) * 100),
    wPct: roundPct((w / canvasW) * 100),
    rot: Math.round(rot || 0),
  };
}

/** Fractions of the print plate (0–1) — used by bake/export. */
export function placementPrintFractions(
  pl: ArtworkPlacement,
  printStage: PrintStageRect,
  canvasW = CANVAS_WIDTH,
  canvasH = CANVAS_HEIGHT,
): { cx: number; cy: number; w: number; rot: number } {
  if (hasPrintRelativePlacement(pl)) {
    return {
      cx: pl.printCxPct / 100,
      cy: pl.printCyPct / 100,
      w: pl.printWPct / 100,
      rot: pl.rot || 0,
    };
  }
  const artCx = (pl.xPct / 100) * canvasW;
  const artCy = (pl.yPct / 100) * canvasH;
  const artW = (pl.wPct / 100) * canvasW;
  return {
    cx: printStage.w > 0 ? (artCx - printStage.x) / printStage.w : 0.5,
    cy: printStage.h > 0 ? (artCy - printStage.y) / printStage.h : 0.5,
    w: printStage.w > 0 ? artW / printStage.w : 0.9,
    rot: pl.rot || 0,
  };
}

function positive(n: unknown, fallback: number): number {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function num(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function roundIn(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function roundPct(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundCm(n: number): number {
  return Math.round(n * 10) / 10;
}
