import { useEffect, useMemo, useReducer, useRef, useState, type Dispatch } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { refreshCatalogProducts } from "@/services/api-bridge";
import { useWorkspace } from "@/hooks/useWorkspace";
import { draftFromCollection } from "../draftFromCollection";
import {
  bakeMockupLayers,
  collectAreaPlacements,
  collectBakeLayers,
  exportDesignOnly,
  listPrintAreas,
  primaryAreaKey,
  type MockupUploadItem,
} from "../mockup-bake";
import {
  buildPreviousUploads,
  resolveDefaultArtwork,
  type PreviousArtwork,
} from "../wizard/artworkHistory";
import { defaultSeedKeysForProducts } from "../wizard/artworkStepModel";
import { useCreateCollection, useSyncCollectionPublish, useUpdateCollection } from "../model";
import type { UiProduct, UiShop } from "../model";
import {
  INITIAL_SWAG_DRAFT,
  swagDraftReducer,
  type SwagAction,
  type SwagDraft,
} from "../swagDraft";
import { acquirePublishLock, releasePublishLock } from "./publishLock";

export type SwagWizardVm = {
  isLoading: boolean;
  isWorking: boolean;
  workingLabel: string;
  isEditing: boolean;
  draft: SwagDraft;
  dispatch: Dispatch<SwagAction>;
  catalog: UiProduct[];
  pickedProducts: UiProduct[];
  previousUploads: PreviousArtwork[];
  shops: UiShop[];
  pickedShops: Set<string>;
  shopName?: string;
  publishReadyOpen: boolean;
  onExit: () => void;
  onStep: (step: SwagDraft["step"]) => void;
  onSubmitName: () => void;
  onToggleShop: (shopId: string) => void;
  onPublish: () => void;
  onPublishReadyPrimary: () => void;
  onPublishReadyLater: () => void;
};

/** Controller for the design-swag wizard: draft reducer, mockup baking, save + publish flow. */
export function useSwagWizardController(): SwagWizardVm {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const shopId = searchParams.get("shop") ?? undefined;
  const editCollectionId = searchParams.get("edit") ?? undefined;
  const { data: workspace, isLoading } = useWorkspace();
  const createCollection = useCreateCollection();
  const updateCollection = useUpdateCollection();
  const syncPublish = useSyncCollectionPublish();
  const [working, setWorking] = useState(false);
  const [workingLabel, setWorkingLabel] = useState("Publishing…");
  const [publishReadyOpen, setPublishReadyOpen] = useState(false);
  const publishingRef = useRef(false);
  const [pickedShops, setPickedShops] = useState<Set<string>>(() =>
    shopId ? new Set([shopId]) : new Set(),
  );
  const [draft, dispatch] = useReducer(swagDraftReducer, INITIAL_SWAG_DRAFT);
  const hydratedEditId = useRef<string | null>(null);

  const workspaceCatalog: UiProduct[] = workspace?.catalogProducts ?? [];
  const { data: refreshedCatalog, isLoading: isRefreshingCatalog } = useQuery({
    queryKey: ["catalog", "all"],
    queryFn: () => refreshCatalogProducts(),
    staleTime: 30_000,
    placeholderData: workspace
      ? { items: workspaceCatalog, total: workspace.catalogTotal ?? workspaceCatalog.length }
      : undefined,
  });
  const catalog: UiProduct[] = refreshedCatalog?.items ?? workspaceCatalog;
  const shops = workspace?.shops ?? [];
  const editCollection = editCollectionId
    ? workspace?.collections.find((c) => c.id === editCollectionId)
    : undefined;

  useEffect(() => {
    if (!editCollection || !catalog.length || hydratedEditId.current === editCollection.id) return;
    if (editCollection.status !== "draft") {
      toast.error("Only draft collections can be edited");
      navigate("/app/swag");
      return;
    }
    dispatch({ type: "hydrate", draft: draftFromCollection(editCollection, catalog) });
    hydratedEditId.current = editCollection.id;
    const linked = editCollection.shopIds.length
      ? editCollection.shopIds
      : editCollection.shopId
        ? [editCollection.shopId]
        : [];
    const available = new Set(shops.map((s) => s.id));
    const validLinked = linked.filter((id) => available.has(id));
    if (validLinked.length) setPickedShops(new Set(validLinked));
  }, [editCollection, catalog, navigate, shops]);

  const pickedProducts = draft.picked.map((i) => catalog[i]).filter(Boolean) as UiProduct[];
  const shopName = shopId ? workspace?.shops.find((s) => s.id === shopId)?.name : undefined;
  const currentShop = shopId ? shops.find((s) => s.id === shopId) : (shops[0] ?? null);
  const defaultArt = useMemo(
    () => resolveDefaultArtwork({ shop: currentShop, workspace }),
    [currentShop, workspace],
  );

  useEffect(() => {
    if (!editCollectionId && !draft.art && defaultArt) {
      dispatch({
        type: "setArt",
        art: { name: defaultArt.name, preview: defaultArt.preview },
      });
    }
  }, [editCollectionId, defaultArt, draft.art]);

  useEffect(() => {
    if (editCollectionId) return;
    const effectiveArt =
      draft.art || (defaultArt ? { name: defaultArt.name, preview: defaultArt.preview } : null);
    if (
      effectiveArt &&
      pickedProducts.length > 0 &&
      Object.keys(draft.areaArts || {}).length === 0
    ) {
      const keys = defaultSeedKeysForProducts(pickedProducts);
      if (keys.length) {
        dispatch({ type: "setAreaArts", keys, art: effectiveArt });
      }
    }
  }, [editCollectionId, pickedProducts, draft.art, draft.areaArts, defaultArt]);

  const previousUploads = buildPreviousUploads(
    workspace?.collections ?? [],
    workspace?.kits ?? [],
    workspace?.shops ?? [],
    workspace?.logoUrl,
  );

  function onExit() {
    if (shopId) navigate(`/app/shops/${shopId}`);
    else navigate("/app/swag");
  }

  function onSubmitName() {
    if (!draft.name.trim()) {
      toast.error("Enter a collection name");
      return;
    }
    dispatch({ type: "setStep", step: 1 });
  }

  function onToggleShop(id: string) {
    setPickedShops((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onPublish() {
    if (!acquirePublishLock(publishingRef)) return;
    if (!pickedShops.size) {
      releasePublishLock(publishingRef);
      toast.error("Select at least one shop");
      return;
    }

    setWorkingLabel("Generating product designs…");
    setWorking(true);
    try {
      const fallbackArt = draft.art?.preview || "";
      const baked = await Promise.all(
        draft.picked.map(async (i, idx) => {
          const cp = catalog[i];
          const layers = collectBakeLayers(cp, draft.placements, draft.areaArts || {}, idx, fallbackArt);
          if (!layers.length) return null;
          const areaKey = primaryAreaKey(cp);
          const primaryLayer = layers.find((l) => l.areaKey === areaKey) || layers[0];
          const areaPlacements = collectAreaPlacements(
            cp,
            draft.placements,
            idx,
            draft.areaArts || {},
          );
          const [frontDataUrl, backDataUrl, design] = await Promise.all([
            bakeMockupLayers(cp, layers, 1000, false, "front"),
            bakeMockupLayers(cp, layers, 1000, false, "back"),
            exportDesignOnly(cp, primaryLayer.artUrl, primaryLayer.placement, primaryLayer.areaKey),
          ]);
          const dataUrl = frontDataUrl || backDataUrl;
          if (!dataUrl) return null;
          return {
            dataUrl,
            backDataUrl: frontDataUrl && backDataUrl ? backDataUrl : undefined,
            design,
            placement: primaryLayer.placement,
            placements: areaPlacements,
          };
        }),
      );
      const mockups: MockupUploadItem[] = draft.picked
        .map((i, idx): MockupUploadItem | null => {
          const cp = catalog[i];
          const row = baked[idx];
          if (!cp?.id || !row?.dataUrl) return null;
          return {
            catalogProductId: cp.id,
            dataUrl: row.dataUrl,
            ...(row.backDataUrl ? { backDataUrl: row.backDataUrl } : {}),
            placement: row.placement,
            placements: row.placements?.length ? row.placements : undefined,
            ...(row.design.dataUrl
              ? {
                  designOnlyDataUrl: row.design.dataUrl,
                  printSpec: {
                    widthIn: row.design.widthIn,
                    heightIn: row.design.heightIn,
                    dpi: row.design.dpi,
                    widthPx: row.design.widthPx,
                    heightPx: row.design.heightPx,
                  },
                }
              : {}),
          };
        })
        .filter((m): m is MockupUploadItem => m !== null);

      // Products with no catalog print areas are intentionally skipped (no fake
      // placeholders). Only require a bake for products that can be branded.
      const brandableCount = draft.picked.reduce((n, i) => {
        return n + (listPrintAreas(catalog[i]).length > 0 ? 1 : 0);
      }, 0);
      if (brandableCount > 0 && mockups.length < brandableCount) {
        throw new Error(
          mockups.length
            ? "Failed to generate designs for all products. Try again"
            : "Failed to generate designs. Try again",
        );
      }

      const shopIds = [...pickedShops].filter((id) => shops.some((s) => s.id === id));
      if (!shopIds.length) {
        throw new Error("Select at least one shop");
      }

      const payload = {
        name: draft.name || "New collection",
        pickedIndices: draft.picked,
        catalog,
        artwork: draft.art
          ? { file: draft.art.file, preview: draft.art.preview, name: draft.art.name }
          : undefined,
        mockups,
      };

      setWorkingLabel(
        mockups.length > 1 ? "Saving product designs…" : "Saving product design…",
      );

      const col = editCollectionId
        ? await updateCollection.mutateAsync({ collectionId: editCollectionId, ...payload })
        : await createCollection.mutateAsync({ ...payload, shopIds });

      if (editCollectionId) {
        setWorkingLabel("Publishing to shop…");
        await syncPublish.mutateAsync({
          collectionId: col.id,
          shopIds,
        });
      }

      const publishedCount = shopIds.length;
      toast.success(
        publishedCount === 1 ? "Published to 1 shop 🎉" : `Published to ${publishedCount} shops 🎉`,
      );
      setPublishReadyOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate and publish");
    } finally {
      releasePublishLock(publishingRef);
      setWorking(false);
    }
  }

  function onPublishReadyPrimary() {
    setPublishReadyOpen(false);
    navigate("/app/contacts");
  }

  function onPublishReadyLater() {
    setPublishReadyOpen(false);
    onExit();
  }

  return {
    isLoading:
      (isLoading && !workspace) ||
      (isRefreshingCatalog && catalog.length === 0) ||
      (Boolean(editCollectionId) && !hydratedEditId.current && Boolean(editCollection)),
    isWorking: working,
    workingLabel,
    isEditing: Boolean(editCollectionId),
    draft,
    dispatch,
    catalog,
    pickedProducts,
    previousUploads,
    shops,
    pickedShops,
    shopName,
    publishReadyOpen,
    onExit,
    onStep: (step) => dispatch({ type: "setStep", step }),
    onSubmitName,
    onToggleShop,
    onPublish,
    onPublishReadyPrimary,
    onPublishReadyLater,
  };
}
