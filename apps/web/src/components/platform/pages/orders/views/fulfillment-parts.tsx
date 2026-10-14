import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { mediaUrlForCanvas, resolveMediaUrl } from "@/lib/mediaUrl";
import { TintedGarment } from "@/components/store/TintedGarment";
import {
  defaultPlacement,
  pickPrintArea,
  type Placement,
} from "@/features/swag/mockup-bake";
import type { UiProduct } from "@/services/mappers";
import type { OrderItemProduct, PrintArea, ProductVariant } from "../model";

type AssetPreview = {
  title: string;
  downloadUrl?: string;
  downloadName: string;
  /** Full-size preview rendered in the modal. */
  body: ReactNode;
};

export type OrderItem = {
  name?: string;
  sku?: string;
  qty?: number;
  unitPriceInr?: number;
  imageUrl?: string;
  artworkUrl?: string;
  /** Saved Konva placement from the design wizard (collection/kit productRef). */
  placement?: Placement | null;
  /** Per print-area artwork/placements snapshotted from the selected listing. */
  placements?: Array<{ key?: string; artworkUrl?: string } & Partial<Placement>>;
  variant?: { size?: string; color?: string };
  product?: OrderItemProduct | null;
};

export function matchVariantHex(
  product: OrderItemProduct | null | undefined,
  variant?: { size?: string; color?: string },
) {
  if (!product?.variants?.length || !variant) return undefined;
  const match = product.variants.find(
    (v: ProductVariant) =>
      (!variant.size || v.size === variant.size) &&
      (!variant.color || v.color?.toLowerCase() === variant.color.toLowerCase()),
  );
  return match?.colorHex;
}

/** Infer a safe download filename that keeps the uploaded file extension. */
export function artworkDownloadFilename(url: string, fallbackBase: string, blobType?: string) {
  const base = (fallbackBase || "artwork").replace(/\.[^.]+$/, "") || "artwork";
  try {
    const pathOnly = new URL(url, "https://local.invalid").pathname;
    const fromUrl = pathOnly.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
    if (fromUrl && fromUrl !== "bin") return `${base}.${fromUrl}`;
  } catch {
    /* ignore */
  }
  const mime = (blobType || "").toLowerCase();
  if (mime.includes("png")) return `${base}.png`;
  if (mime.includes("jpeg") || mime.includes("jpg")) return `${base}.jpg`;
  if (mime.includes("webp")) return `${base}.webp`;
  if (mime.includes("gif")) return `${base}.gif`;
  if (mime.includes("svg")) return `${base}.svg`;
  if (mime.includes("pdf")) return `${base}.pdf`;
  return `${base}.png`;
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

/** Polished download control used under fulfilment asset tiles and in the lightbox. */
export function DownloadAssetButton({
  url,
  filename,
  block = false,
  stopPropagation = false,
}: {
  url: string;
  filename: string;
  block?: boolean;
  stopPropagation?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      className={`pf-asset-download${block ? " pf-asset-download--block" : ""}`}
      disabled={busy || !url}
      aria-busy={busy}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        if (busy || !url) return;
        setBusy(true);
        void downloadArtwork(url, filename).finally(() => setBusy(false));
      }}
    >
      {busy ? (
        <span className="pf-asset-download-spinner" aria-hidden="true" />
      ) : (
        <DownloadIcon />
      )}
      <span>{busy ? "Downloading…" : "Download"}</span>
    </button>
  );
}

/** Triggers a real file download (uses same-origin media proxy for remote assets). */
export async function downloadArtwork(url: string, filename: string) {
  const resolved = resolveMediaUrl(url);
  if (!resolved) return;

  const candidates: string[] = [];
  const proxied = mediaUrlForCanvas(resolved);
  // Prefer proxy for remote URLs so CORS cannot block the blob download.
  if (proxied && proxied !== resolved) candidates.push(proxied);
  candidates.push(resolved);

  let lastError: unknown;
  for (const fetchUrl of candidates) {
    try {
      const res = await fetch(fetchUrl, {
        credentials: fetchUrl.startsWith("/") ? "same-origin" : "omit",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (!blob || blob.size === 0) throw new Error("Empty file");
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = artworkDownloadFilename(resolved, filename, blob.type);
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke after the browser has started the download.
      window.setTimeout(() => URL.revokeObjectURL(href), 2_000);
      return;
    } catch (err) {
      lastError = err;
    }
  }

  console.warn("Artwork download failed; opening in a new tab", lastError);
  window.open(resolved, "_blank", "noopener,noreferrer");
}

/** Minimal UiProduct so mockup-bake helpers can resolve print-area defaults. */
function toUiProduct(product: OrderItemProduct | null | undefined, areas: PrintArea[]): UiProduct {
  return {
    id: product?._id,
    g: "",
    brand: "",
    nm: product?.name ?? "",
    price: "",
    sw: 0,
    maskImageUrl: product?.maskImageUrl,
    baseImageUrl: product?.baseImageUrl,
    printAreas: areas.map((a) => ({
      key: a.key,
      label: a.label,
      mockupImageUrl: a.mockupImageUrl,
      xIn: a.xIn,
      yIn: a.yIn,
      widthIn: a.widthIn,
      heightIn: a.heightIn,
      box: a.box,
      maxWidthCm: a.maxWidthCm,
      maxHeightCm: a.maxHeightCm,
      dpi: a.dpi,
      methods: a.methods,
    })),
  };
}

/** Artwork position as % of the square stage — same coords as Konva / bakeMockup. */
function artworkPlacementStyle(pl: Placement, artAspect: number): CSSProperties {
  return {
    position: "absolute",
    left: `${pl.xPct}%`,
    top: `${pl.yPct}%`,
    width: `${pl.wPct}%`,
    height: "auto",
    aspectRatio: `${1 / Math.max(artAspect, 0.01)}`,
    transform: `translate(-50%, -50%) rotate(${pl.rot || 0}deg)`,
    transformOrigin: "center center",
    objectFit: "contain",
    pointerEvents: "none",
    zIndex: 2,
    opacity: 1,
  };
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function artworkFabricFx(tintHex?: string): {
  opacity: number;
  mixBlendMode: CSSProperties["mixBlendMode"];
} {
  if (!tintHex || !/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(tintHex)) {
    return { opacity: 1, mixBlendMode: "normal" };
  }
  const [r, g, b] = hexToRgbTuple(tintHex);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const warm = (r - b) / 255 > 0.1;
  if (lum >= 0.62) return { opacity: 0.96, mixBlendMode: "multiply" };
  if (lum <= 0.32) return { opacity: warm ? 0.94 : 0.9, mixBlendMode: "normal" };
  return { opacity: warm ? 0.94 : 0.92, mixBlendMode: "multiply" };
}

function isPlacement(value: Partial<Placement> | null | undefined): value is Placement {
  return (
    typeof value?.xPct === "number" &&
    typeof value.yPct === "number" &&
    typeof value.wPct === "number"
  );
}

function areaArtworkEntries(
  placements: Array<{ key?: string; artworkUrl?: string } & Partial<Placement>> | undefined,
  areas: PrintArea[],
) {
  if (!Array.isArray(placements)) return [];
  return placements
    .map((placement, index) => {
      const artworkUrl = resolveMediaUrl(placement.artworkUrl);
      if (!artworkUrl) return null;
      const key = String(placement.key || areas[index]?.key || `area_${index + 1}`);
      const area =
        areas.find((a) => String(a.key || "") === String(placement.key || "")) ?? areas[index];
      return {
        key,
        label: area?.label || key.replace(/_/g, " "),
        artworkUrl,
        placement: isPlacement(placement) ? placement : null,
      };
    })
    .filter(Boolean) as Array<{
      key: string;
      label: string;
      artworkUrl: string;
      placement: Placement | null;
    }>;
}

export function PrintAreaPreview({
  mockup,
  areas,
  tintHex,
  artworkUrl,
  placement,
  placements,
  product,
  onOpen,
  large,
}: {
  mockup: string;
  areas: PrintArea[];
  tintHex?: string;
  artworkUrl?: string;
  /** Saved wizard placement; falls back to centering in the print-area box. */
  placement?: Placement | null;
  placements?: Array<{ key?: string; artworkUrl?: string } & Partial<Placement>>;
  product?: OrderItemProduct | null;
  /** When set, the preview is clickable (e.g. open lightbox). */
  onOpen?: () => void;
  /** Larger stage for the lightbox. */
  large?: boolean;
}) {
  const resolvedMockup = resolveMediaUrl(mockup);
  const resolvedArtwork = artworkUrl ? resolveMediaUrl(artworkUrl) : "";
  const [artAspect, setArtAspect] = useState(1);

  const uiProduct = toUiProduct(product, areas);
  const primaryArea = pickPrintArea(uiProduct);
  const areaArtwork = areaArtworkEntries(placements, areas);
  const visible = areas.filter((a) => {
    if (!a.mockupImageUrl) return true;
    return resolveMediaUrl(a.mockupImageUrl) === resolvedMockup;
  });

  const artPlacement =
    areaArtwork.find((entry) => entry.placement)?.placement ??
    placement ??
    product?.placement ??
    (resolvedArtwork ? defaultPlacement(uiProduct, artAspect) : null);
  const primaryArtworkUrl = areaArtwork[0]?.artworkUrl || resolvedArtwork;
  const artFx = artworkFabricFx(tintHex);

  return (
    <div
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
      aria-label={onOpen ? "Open reference mockup full view" : undefined}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "1 / 1",
        maxWidth: large ? 560 : undefined,
        margin: large ? "0 auto" : undefined,
        background: "var(--surface-2)",
        border: "1px solid var(--line)",
        borderRadius: 10,
        overflow: "hidden",
        isolation: "isolate",
        cursor: onOpen ? "zoom-in" : undefined,
      }}
    >
      <div style={{ position: "absolute", inset: 0 }}>
        <TintedGarment
          src={mockup}
          hex={tintHex}
          alt="Design mockup"
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        />
      </div>

      {/* Artwork on the square stage (Konva centre + width %), not stretched to the box. */}
      {primaryArtworkUrl && artPlacement && (
        <img
          src={primaryArtworkUrl}
          alt="Artwork"
          style={{
            ...artworkPlacementStyle(artPlacement, artAspect),
            opacity: artFx.opacity,
            mixBlendMode: artFx.mixBlendMode,
          }}
          onLoad={(e) => {
            const img = e.currentTarget;
            const aspect = (img.naturalHeight || 1) / (img.naturalWidth || 1);
            if (aspect > 0) setArtAspect(aspect);
          }}
        />
      )}

      {/* Print-area placeholders — outline only so vendors see the printable zone. */}
      {visible.map((a, i) => {
        const isPrimary = primaryArea && (a.key ? a.key === primaryArea.key : i === 0);
        return (
          <div
            key={a.key ?? i}
            style={{
              position: "absolute",
              left: `${a.box.xPct}%`,
              top: `${a.box.yPct}%`,
              width: `${a.box.widthPct}%`,
              height: `${a.box.heightPct}%`,
              // Match Konva's top-left rotation origin so the editor and this
              // preview show the print area at the same angle.
              transform: a.rotationDeg ? `rotate(${a.rotationDeg}deg)` : undefined,
              transformOrigin: "top left",
              border: isPrimary
                ? "1.5px dashed rgba(46,160,103,.85)"
                : "1.5px dashed rgba(46,160,103,.45)",
              background: "transparent",
              boxSizing: "border-box",
              pointerEvents: "none",
              zIndex: 3,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: 2,
                fontSize: 10,
                fontWeight: 700,
                color: "var(--ink)",
                background: "rgba(255,255,255,.92)",
                padding: "1px 5px",
                borderRadius: 4,
                whiteSpace: "nowrap",
              }}
            >
              {a.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Small rounded pill for order/line-item metadata. */
export function Chip({ children, mono }: { children: ReactNode; mono?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 12,
        fontWeight: 600,
        color: "var(--ink-2)",
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 999,
        padding: "3px 9px",
        whiteSpace: "nowrap",
        fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
      }}
    >
      {children}
    </span>
  );
}

/** A labelled square asset tile used in the fulfilment image strip. */
export function FulfillmentTile({
  label,
  children,
  footer,
  onOpen,
}: {
  label: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Opens a full-view lightbox when the preview is clicked. */
  onOpen?: () => void;
}) {
  return (
    <div>
      <div className="lbl" style={{ marginBottom: 6, fontSize: 10.5, letterSpacing: ".05em" }}>
        {label}
      </div>
      <div
        role={onOpen ? "button" : undefined}
        tabIndex={onOpen ? 0 : undefined}
        onClick={onOpen}
        onKeyDown={
          onOpen
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpen();
                }
              }
            : undefined
        }
        aria-label={onOpen ? `Open ${label} full view` : undefined}
        style={{
          aspectRatio: "1 / 1",
          background: "var(--surface-2)",
          border: "1px solid var(--line)",
          borderRadius: 8,
          overflow: "hidden",
          display: "grid",
          placeItems: "center",
          cursor: onOpen ? "zoom-in" : undefined,
        }}
      >
        {children}
      </div>
      {footer && <div style={{ marginTop: 8 }}>{footer}</div>}
    </div>
  );
}

/** Full-view lightbox for a fulfilment asset — preview + download. */
export function FulfillmentAssetModal({
  title,
  downloadUrl,
  downloadName,
  onClose,
  children,
}: {
  title: string;
  downloadUrl?: string;
  downloadName: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.5)",
        display: "grid",
        placeItems: "center",
        zIndex: 50,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{
          padding: 20,
          maxWidth: 720,
          width: "100%",
          maxHeight: "92vh",
          overflowY: "auto",
        }}
      >
        <div
          className="row"
          style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}
        >
          <h3 style={{ fontSize: 17, margin: 0 }}>{title}</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--line)",
            borderRadius: 10,
            padding: 16,
            minHeight: 280,
            display: "grid",
            placeItems: "center",
          }}
        >
          {children}
        </div>
        <div className="row" style={{ gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
          {downloadUrl ? (
            <DownloadAssetButton url={downloadUrl} filename={downloadName} />
          ) : null}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/** Production asset strip: artwork / base / mask / reference mockup with lightbox. */
export function FulfillmentAssetStrip({
  artworkUrl,
  baseImg,
  maskUrl,
  tintHex,
  variantColor,
  mockup,
  printAreas,
  placement,
  placements,
  product,
  designedMockupUrl,
  referenceArtworkUrl,
  sku,
}: {
  artworkUrl: string;
  baseImg: string;
  maskUrl: string;
  tintHex?: string;
  variantColor?: string;
  mockup: string;
  printAreas: PrintArea[];
  placement?: Placement | null;
  placements?: Array<{ key?: string; artworkUrl?: string } & Partial<Placement>>;
  product?: OrderItemProduct | null;
  designedMockupUrl?: string;
  referenceArtworkUrl?: string;
  sku?: string;
}) {
  const [preview, setPreview] = useState<AssetPreview | null>(null);
  const fileBase = sku || "asset";
  const resolvedMask = maskUrl ? resolveMediaUrl(maskUrl) : "";
  const resolvedDesigned = designedMockupUrl ? resolveMediaUrl(designedMockupUrl) : "";
  const areaArtwork = areaArtworkEntries(placements, printAreas);
  const primaryArtworkUrl = artworkUrl || areaArtwork[0]?.artworkUrl || "";
  const overlayArtworkUrl = referenceArtworkUrl ?? artworkUrl;
  const hasReferenceMockup = Boolean(primaryArtworkUrl || resolvedDesigned);
  const referencePlacements = resolvedDesigned ? undefined : placements;
  const artworkTiles = areaArtwork.length
    ? areaArtwork
    : primaryArtworkUrl
      ? [{ key: "artwork", label: "to print", artworkUrl: primaryArtworkUrl, placement: null }]
      : [];

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          gap: 14,
          marginBottom: printAreas.length ? 16 : 0,
        }}
      >
        {artworkTiles.map((entry) => (
          <FulfillmentTile
            key={entry.key}
            label={areaArtwork.length > 1 ? `Logo / artwork: ${entry.label}` : "Logo / artwork to print"}
            onOpen={() =>
              setPreview({
                title: areaArtwork.length > 1 ? `Logo / artwork: ${entry.label}` : "Logo / artwork to print",
                downloadUrl: entry.artworkUrl,
                downloadName: `${fileBase}-${entry.key}-logo`,
                body: (
                  <img
                    src={entry.artworkUrl}
                    alt="Artwork"
                    style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain" }}
                  />
                ),
              })
            }
            footer={
              <DownloadAssetButton
                url={entry.artworkUrl}
                filename={`${fileBase}-${entry.key}-logo`}
                block
                stopPropagation
              />
            }
          >
            <img
              src={entry.artworkUrl}
              alt="Artwork"
              style={{ maxWidth: "82%", maxHeight: "82%", objectFit: "contain" }}
            />
          </FulfillmentTile>
        ))}
        {mockup && printAreas.length === 0 && (
          <FulfillmentTile
            label={variantColor ? `Variant: ${variantColor}` : "Variant image"}
            onOpen={() =>
              setPreview({
                title: variantColor ? `Variant: ${variantColor}` : "Variant image",
                downloadUrl: mockup,
                downloadName: `${fileBase}-variant`,
                body: (
                  <img
                    src={mockup}
                    alt="Selected variant"
                    style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain" }}
                  />
                ),
              })
            }
            footer={
              <DownloadAssetButton
                url={mockup}
                filename={`${fileBase}-variant`}
                block
                stopPropagation
              />
            }
          >
            <img
              src={mockup}
              alt="Selected variant"
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
            />
          </FulfillmentTile>
        )}
        <FulfillmentTile
          label="Base production"
          onOpen={
            baseImg
              ? () =>
                  setPreview({
                    title: "Base production",
                    downloadUrl: baseImg,
                    downloadName: `${fileBase}-base`,
                    body: (
                      <img
                        src={baseImg}
                        alt="Base"
                        style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain" }}
                      />
                    ),
                  })
              : undefined
          }
        >
          {baseImg ? (
            <img
              src={baseImg}
              alt="Base"
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          ) : (
            <span className="mut3" style={{ fontSize: 12 }}>
              Not available
            </span>
          )}
        </FulfillmentTile>
        <FulfillmentTile
          label="Mask tinted"
          onOpen={
            resolvedMask
              ? () =>
                  setPreview({
                    title: "Mask tinted",
                    downloadUrl: resolvedMask,
                    downloadName: `${fileBase}-mask`,
                    body: (
                      <div style={{ width: "min(100%, 480px)", aspectRatio: "1 / 1" }}>
                        <TintedGarment
                          src={maskUrl}
                          hex={tintHex}
                          alt={`${variantColor ?? "Garment"} mask`}
                        />
                      </div>
                    ),
                  })
              : undefined
          }
        >
          <TintedGarment
            src={maskUrl || undefined}
            hex={tintHex}
            alt={`${variantColor ?? "Garment"} mask`}
          />
        </FulfillmentTile>
        {printAreas.length > 0 && mockup && (
          <div>
            <div className="lbl" style={{ marginBottom: 6, fontSize: 10.5, letterSpacing: ".05em" }}>
              {hasReferenceMockup ? "Reference mockup" : "Print areas"}
            </div>
            <PrintAreaPreview
              mockup={mockup}
              areas={printAreas}
              tintHex={tintHex}
              artworkUrl={overlayArtworkUrl || undefined}
              placements={referencePlacements}
              placement={placement}
              product={product}
              onOpen={() =>
                setPreview({
                  title: hasReferenceMockup ? "Reference mockup" : "Print areas",
                  downloadUrl: resolvedDesigned || primaryArtworkUrl || mockup,
                  downloadName: `${fileBase}-mockup`,
                  body: (
                    <PrintAreaPreview
                      mockup={mockup}
                      areas={printAreas}
                      tintHex={tintHex}
                      artworkUrl={overlayArtworkUrl || undefined}
                      placements={referencePlacements}
                      placement={placement}
                      product={product}
                      large
                    />
                  ),
                })
              }
            />
          </div>
        )}
      </div>

      {printAreas.length > 0 && <PrintSpecTable areas={printAreas} />}

      {preview && (
        <FulfillmentAssetModal
          title={preview.title}
          downloadUrl={preview.downloadUrl}
          downloadName={preview.downloadName}
          onClose={() => setPreview(null)}
        >
          {preview.body}
        </FulfillmentAssetModal>
      )}
    </>
  );
}

/** Production print spec: one row per print area. */
export function PrintSpecTable({ areas }: { areas: PrintArea[] }) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <table className="tbl" style={{ fontSize: 12.5, margin: 0 }}>
        <thead>
          <tr>
            <th>Print area</th>
            <th>Method</th>
            <th>Print size</th>
            <th>Export px</th>
            <th>DPI</th>
          </tr>
        </thead>
        <tbody>
          {areas.map((a, i) => {
            const wIn = Number(a.widthIn) || 0;
            const hIn = Number(a.heightIn) || 0;
            const dpi = Number(a.dpi) || 300;
            const hasIn = wIn > 0 && hIn > 0;
            return (
              <tr key={a.key ?? i}>
                <td style={{ fontWeight: 600 }}>{a.label}</td>
                <td style={{ textTransform: "uppercase", letterSpacing: ".03em" }}>
                  {a.methods?.length ? a.methods.join(", ") : "N/A"}
                </td>
                <td style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                  {hasIn
                    ? `${wIn}×${hIn} in`
                    : a.maxWidthCm || a.maxHeightCm
                      ? `${a.maxWidthCm ?? "N/A"}×${a.maxHeightCm ?? "N/A"} cm`
                      : "N/A"}
                </td>
                <td style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                  {hasIn ? `${Math.round(wIn * dpi)}×${Math.round(hIn * dpi)}` : "N/A"}
                </td>
                <td style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                  {a.dpi ?? "N/A"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
