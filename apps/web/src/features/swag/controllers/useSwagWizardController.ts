import { useEffect, useMemo, useReducer, useRef, useState, type Dispatch } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { refreshCatalogProducts } from "@/services/api-bridge";
import { useWorkspace } from "@/hooks/useWorkspace";
import { draftFromCollection } from "../draftFromCollection";
import { bakeCollectionDesignMockups } from "../bakeCollectionDesign";
import { collectionEditableInWizard } from "../collectionEditability";
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
import { DESIGN_SAVED_PUBLISH_FAILED_MESSAGE } from "../designSaveMessages";
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
  onSaveDesign: () => void;
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
    if (!collectionEditableInWizard(editCollection)) {
      toast.error("Only unpublished collections can be edited");
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

  async function persistDesign(options: { publish: boolean }) {
    if (!acquirePublishLock(publishingRef)) return;
    if (options.publish && !pickedShops.size) {
      releasePublishLock(publishingRef);
      toast.error("Select at least one shop");
      return;
    }
    if (!draft.picked.length) {
      releasePublishLock(publishingRef);
      toast.error("Select at least one product");
      return;
    }
    if (!draft.name.trim()) {
      releasePublishLock(publishingRef);
      toast.error("Enter a collection name");
      return;
    }

    setWorkingLabel("Generating product designs…");
    setWorking(true);
    try {
      const mockups = await bakeCollectionDesignMockups({ draft, catalog });
      const shopIds = options.publish
        ? [...pickedShops].filter((id) => shops.some((s) => s.id === id))
        : [];
      if (options.publish && !shopIds.length) {
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

      const existingId = editCollectionId || hydratedEditId.current || undefined;
      let col;
      if (existingId) {
        col = await updateCollection.mutateAsync({ collectionId: existingId, ...payload });
      } else {
        // Omit shopIds so createCollectionApi persists artwork/mockups without publishing.
        col = await createCollection.mutateAsync({ ...payload });
        hydratedEditId.current = col.id;
        const params = new URLSearchParams(searchParams);
        params.set("edit", col.id);
        navigate(`/app/swag/new?${params.toString()}`, { replace: true });
      }

      if (options.publish) {
        setWorkingLabel("Publishing to shop…");
        try {
          await syncPublish.mutateAsync({
            collectionId: col.id,
            shopIds,
          });
        } catch (publishErr) {
          toast.error(DESIGN_SAVED_PUBLISH_FAILED_MESSAGE);
          return;
        }
        const publishedCount = shopIds.length;
        toast.success(
          publishedCount === 1
            ? "Published to 1 shop 🎉"
            : `Published to ${publishedCount} shops 🎉`,
        );
        setPublishReadyOpen(true);
      } else {
        toast.success("Design saved. You can publish from MCP or choose Publish when ready.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save design");
    } finally {
      releasePublishLock(publishingRef);
      setWorking(false);
    }
  }

  async function onPublish() {
    await persistDesign({ publish: true });
  }

  async function onSaveDesign() {
    await persistDesign({ publish: false });
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
    onSaveDesign,
    onPublishReadyPrimary,
    onPublishReadyLater,
  };
}
