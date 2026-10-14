import { useReducer, type Dispatch } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useInvalidateWorkspace } from "@/hooks/useWorkspace";
import {
  clearDefaultArtwork,
  fileTypeFromName,
  setDefaultArtwork,
} from "@/features/swag/wizard/artworkHistory";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { bannerConfigFromSource } from "../banner";
import { useCreateShop } from "../model";
import { markShopCelebration } from "../shopCelebration";
import {
  INITIAL_SHOP_DRAFT,
  shopDraftReducer,
  type ShopDraft,
  type ShopDraftAction,
} from "../shopDraft";

const LOGO_ACCEPT = /\.(svg|png|webp|jpe?g)$/i;
const LOGO_MAX = 5 * 1024 * 1024;

export type CreateShopVm = {
  draft: ShopDraft;
  dispatch: Dispatch<ShopDraftAction>;
  publishing: boolean;
  onExit: () => void;
  onNext: () => void;
  onPickLogo: (file: File) => void;
  onRemoveLogo: () => void;
  onPublish: () => void;
};

/** Controller for the create-shop wizard: draft reducer, logo upload, publish flow. */
export function useCreateShopController(): CreateShopVm {
  const navigate = useNavigate();
  const createShop = useCreateShop();
  const invalidateWorkspace = useInvalidateWorkspace();
  const [draft, dispatch] = useReducer(shopDraftReducer, INITIAL_SHOP_DRAFT);

  function onNext() {
    if (!draft.name.trim()) {
      toast.error("Enter a shop name");
      return;
    }
    dispatch({ type: "set", patch: { step: 1 } });
  }

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
      const preview = String(reader.result);
      dispatch({ type: "set", patch: { logoUrl: preview } });
      setDefaultArtwork({
        id: `shop-logo-${Date.now()}`,
        name: file.name || "Shop Logo",
        preview,
        fileType: fileTypeFromName(file.name),
        source: "shop-logo",
      });
    };
    reader.readAsDataURL(file);
  }

  function onRemoveLogo() {
    dispatch({ type: "set", patch: { logoUrl: "" } });
    clearDefaultArtwork();
  }

  async function onPublish() {
    const name = draft.name.trim();
    if (!name) {
      toast.error("Enter a shop name");
      dispatch({ type: "set", patch: { step: 0 } });
      return;
    }
    try {
      const shop = await createShop.mutateAsync({
        name,
        currency: draft.currency,
        categories: draft.categories,
        companyEmailDomain: draft.companyEmailDomain.trim().replace(/^@/, "").toLowerCase(),
        logoUrl: draft.logoUrl,
        bannerConfig: bannerConfigFromSource({
          bannerTheme: draft.bannerTheme,
          bannerPreset: draft.bannerPreset,
          bannerImageUrl: draft.bannerImageUrl,
        }),
      });

      markShopCelebration({ shopId: shop.id, shopName: shop.name });
      toast.success(`"${shop.name}" is live! 🎉`);

      if (shop.logoUrl || draft.logoUrl) {
        const logoPreview =
          resolveMediaUrl(shop.logoUrl || draft.logoUrl) || shop.logoUrl || draft.logoUrl;
        setDefaultArtwork({
          id: `shop-${shop.id}`,
          name: `${shop.name} Logo`,
          preview: logoPreview,
          fileType: fileTypeFromName(draft.logoUrl || "logo.png"),
          source: "shop-logo",
        });
      }

      // Ensure the new shop is in the workspace cache before opening detail.
      await invalidateWorkspace();
      navigate(`/app/shops/${shop.id}?welcome=1`, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to publish shop");
    }
  }

  return {
    draft,
    dispatch,
    publishing: createShop.isPending,
    onExit: () => navigate("/app/shops"),
    onNext,
    onPickLogo,
    onRemoveLogo,
    onPublish,
  };
}
