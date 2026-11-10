import { useRef } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import {
  BANNER_IMAGE_ACCEPT_ATTR,
  BANNER_IMAGE_DIMENSIONS,
  readBannerImageFile,
} from "./banner";

/** Shared custom-banner upload control for builder, edit dialog, and layout settings. */
export function BannerCustomUpload({
  imageUrl,
  onChange,
  compact = false,
}: {
  imageUrl: string;
  onChange: (imageUrl: string) => void;
  compact?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(file: File) {
    try {
      const dataUrl = await readBannerImageFile(file);
      onChange(dataUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload banner");
    }
  }

  return (
    <div style={{ marginTop: compact ? 12 : 0 }}>
      <div className="lbl" style={compact ? undefined : { marginTop: 16 }}>
        Custom banner
      </div>
      <p className="mut3" style={{ fontSize: "var(--workspace-font-caption, 12px)", margin: "4px 0 8px" }}>
        Upload your own image. Recommended size: <b>{BANNER_IMAGE_DIMENSIONS}</b> · PNG, WEBP or
        JPEG · max 10 MB
      </p>
      {imageUrl ? (
        <div
          className="row"
          style={{
            alignItems: "center",
            justifyContent: "space-between",
            border: "1px solid var(--brand)",
            borderRadius: "var(--r-sm)",
            padding: "10px 12px",
            background: "var(--brand-50)",
            gap: 10,
          }}
        >
          <div className="row" style={{ gap: 10, alignItems: "center", minWidth: 0, flex: 1 }}>
            <img
              src={imageUrl}
              alt="Custom banner"
              style={{
                width: 120,
                height: 30,
                objectFit: "cover",
                borderRadius: 6,
                border: "1px solid var(--line)",
                flex: "none",
              }}
            />
            <div className="mut3" style={{ fontSize: "var(--workspace-font-caption, 11px)" }}>
              Custom image · {BANNER_IMAGE_DIMENSIONS}
            </div>
          </div>
          <div className="row" style={{ gap: 6, flex: "none" }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => fileRef.current?.click()}
            >
              Replace
            </button>
            <button
              type="button"
              className="xbtn"
              aria-label="Remove custom banner"
              onClick={() => onChange("")}
            >
              ✕
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          style={{
            width: "100%",
            border: "1.5px dashed var(--line)",
            borderRadius: "var(--r-sm)",
            padding: compact ? 16 : 20,
            textAlign: "center",
            color: "var(--ink-2)",
            background: "#fff",
            cursor: "pointer",
          }}
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={18} />
          <div style={{ fontWeight: "var(--font-weight-semibold)", marginTop: 6 }}>Upload custom banner</div>
          <div className="mut3" style={{ fontSize: "var(--workspace-font-caption, 11.5px)", marginTop: 4 }}>
            {BANNER_IMAGE_DIMENSIONS} · PNG, WEBP, JPEG · max 10 MB
          </div>
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={BANNER_IMAGE_ACCEPT_ATTR}
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onPick(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
