import { useRef, useState } from "react";
import { TintedGarment } from "@/components/store/TintedGarment";

function UploadIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 16V4M8 8l4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </svg>
  );
}

export function MasterImageUpload({
  label,
  hint,
  accept,
  imageUrl,
  tintHex,
  disabled,
  onFile,
}: {
  label: string;
  hint: string;
  accept: string;
  imageUrl?: string;
  tintHex?: string;
  disabled?: boolean;
  onFile: (file: File | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [hover, setHover] = useState(false);
  const [fileName, setFileName] = useState("");

  const pick = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setFileName(file.name);
    onFile(file);
  };

  return (
    <div style={{ flex: "1 1 200px", maxWidth: 220 }}>
      <label className="lbl">{label}</label>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        style={{ display: "none" }}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={pick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled) handleFiles(e.dataTransfer.files);
        }}
        style={{
          display: "block",
          width: "100%",
          padding: 0,
          border: `1.5px dashed ${dragOver ? "var(--brand)" : imageUrl ? "var(--line)" : "var(--line)"}`,
          borderRadius: 10,
          background: dragOver ? "var(--brand-50)" : "#fff",
          cursor: disabled ? "not-allowed" : "pointer",
          textAlign: "left",
          overflow: "hidden",
          boxShadow: dragOver ? "0 0 0 2px var(--brand-50)" : undefined,
        }}
      >
        <div
          style={{
            width: "100%",
            height: 168,
            background: "var(--surface-2)",
            position: "relative",
            display: "grid",
            placeItems: "center",
          }}
        >
          {imageUrl ? (
            <div style={{ width: "100%", height: "100%" }}>
              <TintedGarment src={imageUrl} hex={tintHex} />
            </div>
          ) : (
            <div style={{ textAlign: "center", color: "var(--ink-3)", padding: "0 16px" }}>
              <div style={{ color: "var(--brand)", display: "grid", placeItems: "center", marginBottom: 8 }}>
                <UploadIcon />
              </div>
              <div style={{ fontWeight: "var(--font-weight-semibold)", fontSize: 13, color: "var(--ink-2)" }}>Upload image</div>
              <div style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.45 }}>
                Click or drag &amp; drop
              </div>
            </div>
          )}
          {imageUrl && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.45)",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                opacity: disabled ? 0.6 : hover ? 1 : 0,
                transition: "opacity 0.15s",
                fontSize: 12,
                fontWeight: "var(--font-weight-semibold)",
                gap: 6,
              }}
              className="master-upload-replace"
            >
              <UploadIcon />
              Replace image
            </div>
          )}
        </div>
        <div style={{ padding: "10px 12px", borderTop: "1px solid var(--line)", background: "#fff" }}>
          <div style={{ fontSize: 12, fontWeight: "var(--font-weight-semibold)", color: "var(--ink-2)" }}>
            {imageUrl ? "Change file" : "Choose file"}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2, lineHeight: 1.4 }}>{hint}</div>
          {fileName && (
            <div style={{ fontSize: 11, color: "var(--brand-d)", marginTop: 4, wordBreak: "break-all" }}>
              {fileName}
            </div>
          )}
        </div>
      </button>
    </div>
  );
}

/** Read-only gallery of all imported Shopify / marketing product images. */
export function MarketingImageGallery({
  imageUrls,
  selectedIndex,
  onSelect,
}: {
  imageUrls: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const active = imageUrls[selectedIndex] || imageUrls[0];

  return (
    <div style={{ width: "100%", marginBottom: 22 }}>
      <label className="lbl">Shopify marketing images</label>
      <p className="muted" style={{ fontSize: 12, margin: "0 0 10px" }}>
        All imported product photos · read-only · selected image is used as the mask fallback if a
        transparent mask image is not uploaded for the front view
      </p>
      {!imageUrls.length ? (
        <p className="muted" style={{ fontSize: 13 }}>
          No Shopify product images were imported.
        </p>
      ) : (
        <div className="row" style={{ gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div
            style={{
              width: 220,
              height: 220,
              borderRadius: 10,
              border: "1px solid var(--line)",
              background: "var(--surface-2)",
              overflow: "hidden",
              display: "grid",
              placeItems: "center",
              flex: "0 0 auto",
            }}
          >
            {active ? (
              <img
                src={active}
                alt={`Shopify product ${selectedIndex + 1}`}
                style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
              />
            ) : null}
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", flex: 1, minWidth: 160 }}>
            {imageUrls.map((url, idx) => {
              const selected = idx === selectedIndex;
              return (
                <button
                  type="button"
                  key={url}
                  onClick={() => onSelect(idx)}
                  title={`Image ${idx + 1}`}
                  aria-pressed={selected}
                  style={{
                    width: 72,
                    height: 72,
                    padding: 0,
                    borderRadius: 8,
                    overflow: "hidden",
                    cursor: "pointer",
                    background: "var(--surface-2)",
                    border: selected ? "2px solid var(--brand)" : "1px solid var(--line)",
                  }}
                >
                  <img
                    src={url}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
