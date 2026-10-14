import { useMemo, useReducer, useState, type Dispatch } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useUpdateKit } from "../model";
import type { UiKit, UiProduct } from "../model";
import { areaPlacementKey } from "@/features/swag/mockup-bake";
import { resolveDefaultArtwork } from "@/features/swag/wizard/artworkHistory";
import { kitPreferredPrintAreaKey } from "../kitPrintArea";
import { kitReducer, kitPickedIndices, type KitAction, type KitDraft } from "../wizard/kitDraft";

export type EditKitStep = 0 | 1;

export type EditKitVm = {
  isLoading: boolean;
  isSaving: boolean;
  notFound: boolean;
  kit: UiKit | undefined;
  step: EditKitStep;
  draft: KitDraft;
  dispatch: Dispatch<KitAction>;
  catalog: UiProduct[];
  selected: UiProduct[];
  onExit: () => void;
  onStep: (step: EditKitStep) => void;
  onSave: () => void;
};

const EMPTY_DRAFT: KitDraft = {
  name: "",
  desc: "",
  picked: [],
  art: null,
  areaArts: {},
  placements: {},
  placementEpoch: 0,
  notes: "",
  packaging: "box",
};

/** Controller for the edit-kit wizard: seed draft from the kit, save flow. */
export function useEditKitController(): EditKitVm {
  const navigate = useNavigate();
  const { id } = useParams() as { id: string };
  const { data: workspace, isLoading } = useWorkspace();
  const updateKit = useUpdateKit();
  const [step, setStep] = useState<EditKitStep>(0);
  const [saving, setSaving] = useState(false);

  const catalog: UiProduct[] = useMemo(() => workspace?.catalogProducts ?? [], [workspace]);
  const kit = workspace?.kits.find((k) => k.id === id);

  const initial = useMemo<KitDraft>(() => {
    if (!kit) return EMPTY_DRAFT;
    const picked = kitPickedIndices(kit, catalog);
    const artPreview = kit.artworkUrl
      ? resolveMediaUrl(kit.artworkUrl) || kit.artworkUrl
      : "";
    const defaultArt = resolveDefaultArtwork({ workspace });
    const effectivePreview = artPreview || defaultArt?.preview || "";
    const art = effectivePreview
      ? {
          name: artPreview ? "Kit artwork" : (defaultArt?.name || "Shop Logo"),
          preview: effectivePreview,
          existing: Boolean(artPreview),
        }
      : null;
    const areaArts: KitDraft["areaArts"] = {};
    if (art) {
      for (let idx = 0; idx < picked.length; idx++) {
        const p = catalog[picked[idx]];
        if (!p) continue;
        const key = areaPlacementKey(p, idx, kitPreferredPrintAreaKey(p));
        areaArts[key] = art;
      }
    }
    return {
      name: kit.name,
      desc: "",
      picked,
      art,
      areaArts,
      placements: {},
      placementEpoch: 0,
      notes: kit.designNotes || "",
      packaging: kit.packaging === "none" ? "none" : "box",
    };
  }, [kit, catalog]);

  const [draft, dispatch] = useReducer(kitReducer, initial);

  const selected = draft.picked.map((i) => catalog[i]).filter(Boolean) as UiProduct[];

  function onExit() {
    navigate("/app/kits");
  }

  async function onSave() {
    if (!draft.picked.length) {
      toast.error("Add at least one product to the kit");
      return;
    }
    setSaving(true);
    try {
      await updateKit.mutateAsync({
        id,
        name: draft.name,
        pickedIndices: draft.picked,
        catalog,
        designNotes: draft.notes,
        artwork: draft.art?.file
          ? { file: draft.art.file, preview: draft.art.preview, name: draft.art.name }
          : undefined,
      });
      toast.success("Kit updated");
      onExit();
    } catch (err) {
      setSaving(false);
      toast.error(err instanceof Error ? err.message : "Failed to update kit");
    }
  }

  return {
    isLoading: isLoading && !workspace,
    isSaving: saving || updateKit.isPending,
    notFound: !isLoading && !!workspace && !kit,
    kit,
    step,
    draft,
    dispatch,
    catalog,
    selected,
    onExit,
    onStep: setStep,
    onSave,
  };
}
