import { useReducer, useRef, useState, type Dispatch } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useInvalidateWorkspace } from "@/hooks/useWorkspace";
import {
  clearDefaultArtwork,
  fileTypeFromName,
  setDefaultArtwork,
} from "@/features/swag/wizard/artworkHistory";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { readArtworkFile } from "@/lib/artworkValidation";
import { bannerConfigFromSource } from "../banner";
import { useCreateShop } from "../model";
import { markShopCelebration } from "../shopCelebration";
import {
  INITIAL_SHOP_DRAFT,
  shopDraftReducer,
  type ShopDraft,
  type ShopDraftAction,
} from "../shopDraft";

export type CreateShopVm = {
  draft: ShopDraft;
  dispatch: Dispatch<ShopDraftAction>;
  publishing: boolean;
  validatingLogo: boolean;
  onExit: () => void;
  onNext: () => void;
  onPickLogo: (file: File) => Promise<void>;
  onRemoveLogo: () => void;
  onPublish: () => void;
};

/** Controller for the create-shop wizard: draft reducer, logo upload, publish flow. */
export function useCreateShopController(): CreateShopVm {
  const navigate = useNavigate();
  const createShop = useCreateShop();
  const invalidateWorkspace = useInvalidateWorkspace();
  const [draft, dispatch] = useReducer(shopDraftReducer, INITIAL_SHOP_DRAFT);
  const [validatingLogo, setValidatingLogo] = useState(false);
  const logoReadId = useRef(0);

  function onNext() {
    if (!draft.name.trim()) {
      toast.error("Enter a shop name");
      return;
    }
    dispatch({ type: "set", patch: { step: 1 } });
  }

  async function onPickLogo(file: File) {
    const readId = ++logoReadId.current;
    setValidatingLogo(true);
    try {
      const { preview } = await readArtworkFile(file);
      if (readId !== logoReadId.current) return;
      dispatch({ type: "set", patch: { logoUrl: preview } });
      setDefaultArtwork({
        id: `shop-logo-${Date.now()}`,
        name: file.name || "Shop Logo",
        preview,
        fileType: fileTypeFromName(file.name),
        source: "shop-logo",
      });
    } catch (err) {
      if (readId === logoReadId.current) {
        toast.error(err instanceof Error ? err.message : "Could not read logo. Please try again.");
      }
    } finally {
      if (readId === logoReadId.current) setValidatingLogo(false);
    }
  }

  function onRemoveLogo() {
    logoReadId.current++;
    setValidatingLogo(false);
    dispatch({ type: "set", patch: { logoUrl: "" } });
    clearDefaultArtwork();
  }

  async function onPublish() {
    if (validatingLogo) return;
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
    validatingLogo,
    onExit: () => navigate("/app/shops"),
    onNext,
    onPickLogo,
    onRemoveLogo,
    onPublish,
  };
}
