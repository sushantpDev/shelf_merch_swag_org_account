import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UiShop } from "@/services/mappers";
import {
  SHOP_BANNER_PRESETS,
  ShopBanner,
  bannerConfigFromSource,
  bannerImageUrlKey,
  bannerPresetKey,
  bannerThemeKey,
} from "./banner";
import { BannerCustomUpload } from "./BannerCustomUpload";
import { useUpdateShop } from "./model";

const LOGO_ACCEPT = /\.(svg|png|webp|jpe?g)$/i;
const LOGO_MAX = 5 * 1024 * 1024;

type EditorState = { theme: string; preset: string; imageUrl: string; logoUrl: string };

export function BannerEditorDialog({
  shop,
  onOpenChange,
}: {
  shop: UiShop | null;
  onOpenChange: (open: boolean) => void;
}) {
  const updateShop = useUpdateShop();
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<EditorState>({
    theme: "light",
    preset: "",
    imageUrl: "",
    logoUrl: "",
  });

  useEffect(() => {
    if (shop) {
      setState({
        theme: bannerThemeKey(shop),
        preset: bannerPresetKey(shop),
        imageUrl: bannerImageUrlKey(shop),
        logoUrl: shop.logoUrl || "",
      });
    }
  }, [shop]);

  function onPickLogo(file: File) {
    if (!LOGO_ACCEPT.test(file.name)) {
      toast.error("Use SVG, PNG, WEBP, or JPG");
      return;
    }
    if (file.size > LOGO_MAX) {
      toast.error("Maximum file size is 5 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setState((s) => ({ ...s, logoUrl: String(reader.result) }));
    reader.readAsDataURL(file);
  }

  async function onSave() {
    if (!shop) return;
    try {
      await updateShop.mutateAsync({
        shopId: shop.id,
        input: {
          logoUrl: state.logoUrl,
          bannerConfig: bannerConfigFromSource({
            bannerTheme: state.theme,
            bannerPreset: state.preset,
            bannerImageUrl: state.imageUrl,
          }),
        },
      });
      toast.success("Shop design updated");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update shop design");
    }
  }

  const previewSource = {
    bannerTheme: state.theme,
    bannerPreset: state.preset,
    bannerImageUrl: state.imageUrl,
    logoUrl: state.logoUrl,
  };

  return (
    <Dialog open={shop !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm-modal sm-banner-modal">
        {shop && (
          <div className="modal-pad">
            <DialogHeader>
              <DialogTitle>Edit shop look</DialogTitle>
              <DialogDescription className="muted" style={{ fontSize: "var(--workspace-font-caption, 13px)", marginTop: 4 }}>
                Update the banner and logo for <b>{shop.name}</b>.
              </DialogDescription>
            </DialogHeader>

            <div
              style={{
                margin: "16px 0 20px",
                borderRadius: "var(--r)",
                overflow: "hidden",
                border: "1px solid var(--line)",
              }}
            >
              <ShopBanner
                source={previewSource}
                height={108}
                layout="center"
                logoSize={48}
                radius={10}
              />
            </div>

            <BannerCustomUpload
              imageUrl={state.imageUrl}
              onChange={(imageUrl) =>
                setState((s) => ({
                  ...s,
                  imageUrl,
                  ...(imageUrl ? { preset: "" } : {}),
                }))
              }
            />

            <div className="lbl" style={{ marginTop: 18 }}>
              Banner library
            </div>
            <p className="mut3" style={{ fontSize: "var(--workspace-font-caption, 12px)", margin: "4px 0 8px" }}>
              Or pick a ready-made banner for your shop storefront.
            </p>
            <div
              className="grid"
              style={{
                gridTemplateColumns: "repeat(3,1fr)",
                gap: 10,
              }}
            >
              {SHOP_BANNER_PRESETS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`optcard banner-preset-card ${!state.imageUrl && state.preset === id ? "on" : ""}`}
                  aria-pressed={!state.imageUrl && state.preset === id}
                  onClick={() => setState((s) => ({ ...s, preset: id, imageUrl: "" }))}
                >
                  <img
                    src={`/shop-banners/${id}.png`}
                    alt={label}
                    loading="lazy"
                    className="banner-preset-thumb"
                    width={160}
                    height={52}
                  />
                  <span className="banner-preset-label">{label}</span>
                </button>
              ))}
            </div>

            <div className="lbl" style={{ marginTop: 18 }}>
              Solid
            </div>
            <div
              className="grid"
              style={{ gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginTop: 8 }}
            >
              <button
                type="button"
                className={`optcard banner-preset-card ${!state.imageUrl && state.preset === "solid-pattern" ? "on" : ""}`}
                aria-pressed={!state.imageUrl && state.preset === "solid-pattern"}
                onClick={() =>
                  setState((s) => ({ ...s, preset: "solid-pattern", theme: "dark", imageUrl: "" }))
                }
              >
                <img
                  src="/shop-banners/solid-pattern.png"
                  alt="Pattern"
                  loading="lazy"
                  className="banner-preset-thumb"
                  width={160}
                  height={52}
                />
                <span className="banner-preset-label">Pattern</span>
              </button>
            </div>

            <div className="lbl" style={{ marginTop: 18 }}>
              Shop logo
            </div>
            <div style={{ marginTop: 8 }}>
              {state.logoUrl ? (
                <div
                  className="row"
                  style={{
                    alignItems: "center",
                    justifyContent: "space-between",
                    border: "1px solid var(--brand)",
                    borderRadius: "var(--r-sm)",
                    padding: "12px 14px",
                    background: "var(--brand-50)",
                  }}
                >
                  <div className="row" style={{ gap: 10, alignItems: "center" }}>
                    <div
                      className="logo-chip"
                      style={{ width: 42, height: 42, overflow: "hidden", padding: 4 }}
                    >
                      <img
                        src={state.logoUrl}
                        alt="Shop logo"
                        style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                      />
                    </div>
                    <div className="mut3" style={{ fontSize: "var(--workspace-font-caption, 11px)" }}>
                      PNG, SVG, WEBP or JPEG · max 5 MB
                    </div>
                  </div>
                  <button
                    type="button"
                    className="xbtn"
                    aria-label="Remove logo"
                    onClick={() => setState((s) => ({ ...s, logoUrl: "" }))}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  style={{
                    width: "100%",
                    border: "1.5px dashed var(--line)",
                    borderRadius: "var(--r-sm)",
                    padding: 24,
                    textAlign: "center",
                    color: "var(--ink-2)",
                    background: "#fff",
                    cursor: "pointer",
                  }}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={20} />
                  <div style={{ fontWeight: "var(--font-weight-semibold)", marginTop: 6 }}>Upload shop logo</div>
                  <div className="mut3" style={{ fontSize: "var(--workspace-font-caption, 11.5px)", marginTop: 6 }}>
                    SVG, PNG, WEBP, JPEG · max 5 MB
                  </div>
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".svg,.png,.webp,.jpeg,.jpg,image/svg+xml,image/png,image/webp,image/jpeg"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPickLogo(f);
                  e.target.value = "";
                }}
              />
            </div>

            <div className="row" style={{ marginTop: 22 }}>
              <button
                type="button"
                className="btn btn-ghost btn-block"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-brand btn-block"
                disabled={updateShop.isPending}
                onClick={onSave}
              >
                {updateShop.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
