import { useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { usePlatformKits, useEnsureCuratedKit, type PlatformKitTemplate } from "../model";
import { useTenantAccess } from "@/hooks/useTenantAccess";
import { useWorkspace } from "@/hooks/useWorkspace";
import { buildKitPreviewFromPlatform, type KitPreviewData } from "../KitPreviewDialog";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { useStartSampleOrder } from "../sample/useStartSampleOrder";
import noKitsYetImg from "../../../../assets/no-kits-yet.png";

export type PreDesignedKitsVm = {
  isLoading: boolean;
  kits: PlatformKitTemplate[] | undefined;
  canSendKits: boolean;
  kitPreview: KitPreviewData | null;
  onPreviewOpenChange: (open: boolean) => void;
  onPreview: (kit: PlatformKitTemplate) => void;
  onSend: (kit: PlatformKitTemplate) => void;
  onRequestSample: (kit: PlatformKitTemplate) => void;
  sendPendingId: string | null;
  samplePendingId: string | null;
};

function templateImage(kit: PlatformKitTemplate): string {
  if (kit.heroImage) return resolveMediaUrl(kit.heroImage) || noKitsYetImg;
  return resolveMediaUrl(kit.imageUrls?.[0]) || noKitsYetImg;
}

function buildProductRefs(
  kit: PlatformKitTemplate,
  catalogProducts: Array<{
    id?: string;
    brand?: string;
    nm?: string;
    g?: string;
    category?: string;
  }>,
) {
  const productRefs: Array<{
    catalogProductId: string;
    brand?: string;
    name: string;
    group?: string;
  }> = [];

  for (const item of kit.items || []) {
    const pid = String(item.catalogProductId ?? "");
    if (!pid) continue;
    const product = catalogProducts.find((p) => p.id === pid);
    if (!product?.id) continue;
    if (productRefs.some((r) => r.catalogProductId === product.id)) continue;
    productRefs.push({
      catalogProductId: product.id,
      brand: product.brand || "",
      name: product.nm || "Product",
      group: product.g || product.category || "",
    });
  }

  // Curated templates may have no catalog items — keep productRefs empty so
  // fulfillment uses curated designNotes (itemImages / approxValueInr).

  return productRefs;
}

/** Controller for the pre-designed kits widget: platform kit templates query. */
export function usePreDesignedKitsController(options?: {
  /** When true, allow entering send even if wallet balance/approval would block. */
  skipWalletGate?: boolean;
  onBeforeSend?: () => void;
}): PreDesignedKitsVm {
  const navigate = useNavigate();
  const { data: kits, isLoading } = usePlatformKits();
  const { canSendKits } = useTenantAccess();
  const { data: workspace } = useWorkspace();
  const ensureCuratedKit = useEnsureCuratedKit();
  const sampleOrder = useStartSampleOrder();
  const [kitPreview, setKitPreview] = useState<KitPreviewData | null>(null);
  const onBeforeSend = options?.onBeforeSend;

  const catalog = workspace?.catalogProducts ?? [];

  const onPreview = useCallback(
    (kit: PlatformKitTemplate) => {
      setKitPreview(buildKitPreviewFromPlatform(kit, catalog, templateImage(kit)));
    },
    [catalog],
  );

  const onSend = useCallback(
    async (kit: PlatformKitTemplate) => {
      if (!workspace) {
        toast.error("Workspace is still loading");
        return;
      }

      const productRefs = buildProductRefs(kit, catalog);
      try {
        const ensured = await ensureCuratedKit.mutateAsync({
          platformKitId: kit._id,
          productRefs: productRefs.length ? productRefs : undefined,
        });
        onBeforeSend?.();
        navigate(`/app/kits/${ensured.id}/send`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not prepare kit");
      }
    },
    [workspace, catalog, ensureCuratedKit, navigate, onBeforeSend],
  );

  const onRequestSample = useCallback(
    (kit: PlatformKitTemplate) => {
      void sampleOrder.startFromPlatformKit(kit);
    },
    [sampleOrder],
  );

  return {
    isLoading,
    kits,
    canSendKits: canSendKits(),
    kitPreview,
    onPreviewOpenChange: (open) => {
      if (!open) setKitPreview(null);
    },
    onPreview,
    onSend,
    onRequestSample,
    sendPendingId: ensureCuratedKit.isPending
      ? (ensureCuratedKit.variables?.platformKitId ?? null)
      : null,
    samplePendingId: sampleOrder.pendingKitId,
  };
}
