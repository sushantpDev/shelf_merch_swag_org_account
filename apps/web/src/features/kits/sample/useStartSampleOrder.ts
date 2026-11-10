import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useEnsureCuratedKit, type PlatformKitTemplate } from "../model";
import type { UiKit } from "../model";

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

  return productRefs;
}

/** Navigate into the existing kit sample wizard without a confirmation modal. */
export function useStartSampleOrder() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: workspace } = useWorkspace();
  const ensureCuratedKit = useEnsureCuratedKit();

  const from = `${location.pathname}${location.search}`;

  const go = useCallback(
    (kitId: string) => {
      navigate(`/app/kits/${kitId}/sample`, { state: { from } });
    },
    [navigate, from],
  );

  const startFromWorkspaceKit = useCallback(
    (kit: UiKit | undefined) => {
      if (!kit?.id) {
        toast.error("This kit is unavailable");
        return;
      }
      go(kit.id);
    },
    [go],
  );

  const startFromPlatformKit = useCallback(
    async (kit: PlatformKitTemplate, existing?: UiKit) => {
      if (existing?.id) {
        go(existing.id);
        return;
      }
      const catalog = workspace?.catalogProducts ?? [];
      const productRefs = buildProductRefs(kit, catalog);
      try {
        const ensured = await ensureCuratedKit.mutateAsync({
          platformKitId: kit._id,
          productRefs: productRefs.length ? productRefs : undefined,
        });
        go(ensured.id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not prepare sample");
      }
    },
    [workspace?.catalogProducts, ensureCuratedKit, go],
  );

  return {
    startFromWorkspaceKit,
    startFromPlatformKit,
    pending: ensureCuratedKit.isPending,
    pendingKitId: ensureCuratedKit.isPending
      ? (ensureCuratedKit.variables?.platformKitId ?? null)
      : null,
  };
}
