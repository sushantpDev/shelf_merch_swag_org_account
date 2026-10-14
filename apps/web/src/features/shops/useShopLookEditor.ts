import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { UiShop } from "@/services/mappers";
import {
  fileTypeFromName,
  setDefaultArtwork,
} from "@/features/swag/wizard/artworkHistory";
import {
  bannerConfigFromSource,
  bannerImageUrlKey,
  bannerPresetKey,
  bannerThemeKey,
} from "./banner";
import { useUpdateShop } from "./model";

const LOGO_ACCEPT = /\.(svg|png|webp|jpe?g)$/i;
const LOGO_MAX = 5 * 1024 * 1024;

export type ShopLookState = {
  theme: string;
  preset: string;
  imageUrl: string;
  logoUrl: string;
};

export function useShopLookEditor(shop: UiShop) {
  const updateShop = useUpdateShop();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ShopLookState>({
    theme: "light",
    preset: "",
    imageUrl: "",
    logoUrl: "",
  });

  useEffect(() => {
    setState({
      theme: bannerThemeKey(shop),
      preset: bannerPresetKey(shop),
      imageUrl: bannerImageUrlKey(shop),
      logoUrl: shop.logoUrl || "",
    });
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
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setState((s) => ({ ...s, logoUrl: dataUrl }));
      setDefaultArtwork({
        id: `shop-${shop.id}`,
        name: file.name || `${shop.name} Logo`,
        preview: dataUrl,
        fileType: fileTypeFromName(file.name),
        source: "shop-logo",
      });
    };
    reader.readAsDataURL(file);
  }

  async function onSave() {
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
      toast.success("Layout saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save layout");
    }
  }

  const previewSource = {
    bannerTheme: state.theme,
    bannerPreset: state.preset,
    bannerImageUrl: state.imageUrl,
    logoUrl: state.logoUrl,
  };

  return {
    state,
    setState,
    onPickLogo,
    onSave,
    previewSource,
    logoInputRef,
    isPending: updateShop.isPending,
  };
}
