import { useEffect, useMemo, useReducer, useState, type Dispatch } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { useWorkspace } from "@/hooks/useWorkspace";
import { sumKitProductPrices } from "@/features/send/money";
import {
  bakeMockupLayers,
  collectAreaPlacements,
  collectBakeLayers,
  exportDesignOnly,
  listPrintAreas,
  primaryAreaKey,
  type MockupUploadItem,
} from "@/features/swag/mockup-bake";
import { resolveDefaultArtwork } from "@/features/swag/wizard/artworkHistory";
import { kitDefaultSeedKeysForProducts } from "../kitPrintArea";
import { usePlatformKits, useCreateKit } from "../model";
import type { UiProduct } from "../model";
import { kitReducer, type KitAction, type KitDraft } from "../wizard/kitDraft";

export type KitWizardStep = 0 | 1 | 2 | 3;

const INITIAL: KitDraft = {
  name: "Welcome Kit",
  desc: "",
  picked: [],
  art: null,
  areaArts: {},
  placements: {},
  placementEpoch: 0,
  notes: "",
  packaging: "box",
};

export type KitWizardVm = {
  isLoading: boolean;
  isPublishing: boolean;
  publishedKit: { id: string; name: string } | null;
  step: KitWizardStep;
  draft: KitDraft;
  dispatch: Dispatch<KitAction>;
  catalog: UiProduct[];
  pickedProducts: UiProduct[];
  onExit: () => void;
  onNext: () => void;
  onStep: (step: KitWizardStep) => void;
  onPublish: () => void;
  onSendPublishedKit: () => void;
  onRequestSamplePublished: () => void;
  onGoToKits: () => void;
};

/** Map a platform template's product list onto catalog indices. */
function templateIndices(items: Array<{ catalogProductId: string }>, catalog: UiProduct[]) {
  const indices: number[] = [];
  for (const item of items) {
    const pid = String(item.catalogProductId ?? "");
    if (!pid) continue;
    const idx = catalog.findIndex((p) => p.id === pid);
    if (idx >= 0 && !indices.includes(idx)) indices.push(idx);
  }
  return indices;
}

/** Controller for the create-kit wizard: template seeding, draft reducer, publish flow. */
export function useKitWizardController(): KitWizardVm {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const template = searchParams.get("template") ?? undefined;
  const { data: workspace, isLoading } = useWorkspace();
  const { data: platformKits } = usePlatformKits();
  const createKit = useCreateKit();
  const [step, setStep] = useState<KitWizardStep>(0);
  const [publishing, setPublishing] = useState(false);
  const [publishedKit, setPublishedKit] = useState<{ id: string; name: string } | null>(null);

  const catalog: UiProduct[] = useMemo(() => workspace?.catalogProducts ?? [], [workspace]);

  // Seed the draft from a pre-designed template when one is selected.
  const seeded = useMemo<KitDraft>(() => {
    const tpl = template
      ? platformKits?.find((k) => String(k._id) === String(template))
      : undefined;
    if (!tpl || !catalog.length) return INITIAL;
    const picked = templateIndices(tpl.items ?? [], catalog);
    return {
      ...INITIAL,
      name: tpl.name || INITIAL.name,
      desc: tpl.description || "",
      picked: picked.length ? picked : INITIAL.picked,
      packaging: tpl.packaging === "none" ? "none" : "box",
    };
  }, [template, platformKits, catalog]);

  const [draft, dispatch] = useReducer(kitReducer, seeded);

  const pickedProducts = draft.picked.map((i) => catalog[i]).filter(Boolean) as UiProduct[];
  const defaultArt = useMemo(
    () => resolveDefaultArtwork({ workspace }),
    [workspace],
  );

  useEffect(() => {
    if (!draft.art && defaultArt) {
      dispatch({
        type: "setArt",
        art: { name: defaultArt.name, preview: defaultArt.preview },
      });
    }
  }, [defaultArt, draft.art]);

  useEffect(() => {
    const effectiveArt =
      draft.art || (defaultArt ? { name: defaultArt.name, preview: defaultArt.preview } : null);
    if (
      effectiveArt &&
      pickedProducts.length > 0 &&
      Object.keys(draft.areaArts || {}).length === 0
    ) {
      const keys = kitDefaultSeedKeysForProducts(pickedProducts);
      if (keys.length) {
        dispatch({ type: "setAreaArts", keys, art: effectiveArt });
      }
    }
  }, [pickedProducts, draft.art, draft.areaArts, defaultArt]);

  function onNext() {
    if (step === 0) {
      if (draft.name.trim().length < 4) {
        toast.error("Kit name must be at least 4 characters");
        return;
      }
      setStep(1);
    } else if (step === 1) {
      if (!draft.picked.length) {
        toast.error("Select at least one product");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  }

  async function onPublish() {
    setPublishing(true);
    try {
      const kitPrice = sumKitProductPrices(pickedProducts);
      let mockups: MockupUploadItem[] | undefined;

      const fallbackArt = draft.art?.preview || "";
      const hasAreaArt = Object.keys(draft.areaArts || {}).length > 0;
      if (fallbackArt || hasAreaArt) {
        const baked = await Promise.all(
          draft.picked.map(async (i, idx) => {
            const cp = catalog[i];
            const layers = collectBakeLayers(
              cp,
              draft.placements,
              draft.areaArts || {},
              idx,
              fallbackArt,
            );
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
              exportDesignOnly(
                cp,
                primaryLayer.artUrl,
                primaryLayer.placement,
                primaryLayer.areaKey,
              ),
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
        mockups = draft.picked
          .map((i, idx): MockupUploadItem | null => {
            const cp = catalog[i];
            const row = baked[idx];
            if (!cp?.id || !row?.dataUrl) return null;
            return {
              catalogProductId: cp.id,
              dataUrl: row.dataUrl,
              ...(row.backDataUrl ? { backDataUrl: row.backDataUrl } : {}),
              placement: row.placement,
              ...(row.placements?.length ? { placements: row.placements } : {}),
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
          .filter((m): m is MockupUploadItem => m != null);

        // Skip products with no catalog print areas; only require a bake for
        // products that can be branded.
        const brandableCount = draft.picked.reduce((n, i) => {
          return n + (listPrintAreas(catalog[i]).length > 0 ? 1 : 0);
        }, 0);
        if (brandableCount > 0 && mockups.length < brandableCount) {
          throw new Error("Failed to generate mockups for all kit products. Try again");
        }
      }

      const created = await createKit.mutateAsync({
        name: draft.name || "New Kit",
        description: draft.desc || "",
        pickedIndices: draft.picked,
        catalog,
        packaging: "box",
        designNotes: draft.notes,
        kitPrice,
        artwork: draft.art
          ? { file: draft.art.file, preview: draft.art.preview, name: draft.art.name }
          : undefined,
        mockups,
      });
      toast.success(`Kit "${created.name}" saved`);
      setPublishedKit({ id: created.id, name: created.name });
      setPublishing(false);
    } catch (err) {
      setPublishing(false);
      toast.error(err instanceof Error ? err.message : "Failed to save kit");
    }
  }

  return {
    isLoading: isLoading && !workspace,
    isPublishing: publishing || createKit.isPending,
    publishedKit,
    step,
    draft,
    dispatch,
    catalog,
    pickedProducts,
    onExit: () => navigate("/app/kits"),
    onNext,
    onStep: setStep,
    onPublish,
    onSendPublishedKit: () => {
      if (publishedKit) navigate(`/app/kits/${publishedKit.id}/send`);
    },
    onRequestSamplePublished: () => {
      if (publishedKit) navigate(`/app/kits/${publishedKit.id}/sample`);
    },
    onGoToKits: () => navigate("/app/kits"),
  };
}
