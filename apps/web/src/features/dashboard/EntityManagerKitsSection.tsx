import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { tenantPath } from "@/lib/workspaceSlug";
import { useTenantAccess } from "@/hooks/useTenantAccess";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  KitPreviewDialog,
  buildKitPreviewFromPlatform,
  type KitPreviewData,
} from "@/features/kits/KitPreviewDialog";
import {
  useEnsureCuratedKit,
  usePlatformKits,
  type PlatformKitTemplate,
  type UiKit,
} from "@/features/kits/model";
import noKitsYetImg from "../../../assets/no-kits-yet.png";
import kitPreviewImg from "../../../assets/kit-preview.png";

function isCuratedWorkspaceKit(kit: UiKit) {
  try {
    if (!kit.designNotes) return false;
    const parsed = JSON.parse(kit.designNotes);
    return !!(parsed && parsed.curated);
  } catch {
    return false;
  }
}

function curatedCover(kit: PlatformKitTemplate) {
  if (kit.heroImage) return resolveMediaUrl(kit.heroImage) || kitPreviewImg;
  return kit.imageUrls?.[0] ? resolveMediaUrl(kit.imageUrls[0]) : kitPreviewImg;
}

function findWorkspaceClone(kits: UiKit[], platformKitId: string) {
  return kits.find((wk) => {
    try {
      const meta = wk.designNotes ? JSON.parse(wk.designNotes) : null;
      return meta?.curated && meta?.originalId === platformKitId;
    } catch {
      return false;
    }
  });
}

/**
 * Entity Manager home widgets: Customised Kits empty/list + always-on Curated Kits.
 * Preview/Send reuse the same curated flow as /dashboard/kits — no permission changes.
 */
export function EntityManagerKitsSection() {
  const navigate = useNavigate();
  const { canOperateCampaigns } = useTenantAccess();
  const canSendKits = canOperateCampaigns();
  const { data: workspace } = useWorkspace();
  const { data: platformKits, isLoading } = usePlatformKits();
  const ensureCuratedKit = useEnsureCuratedKit();
  const [kitPreview, setKitPreview] = useState<KitPreviewData | null>(null);

  const catalog = workspace?.catalogProducts ?? [];
  const workspaceKits = workspace?.kits ?? [];
  const customKits = useMemo(
    () => workspaceKits.filter((k) => !isCuratedWorkspaceKit(k)),
    [workspaceKits],
  );
  const curated = platformKits ?? [];

  const handleSendCurated = async (kit: PlatformKitTemplate) => {
    if (!canSendKits) {
      toast.info("Campaign access required");
      return;
    }

    const existing = findWorkspaceClone(workspaceKits, kit._id);
    if (existing?.id) {
      navigate(`${tenantPath("/kits")}/${existing.id}/send`);
      return;
    }

    const productRefs: Array<{
      catalogProductId: string;
      brand?: string;
      name: string;
      group?: string;
    }> = [];

    for (const item of kit.items || []) {
      const pid = String(item.catalogProductId ?? "");
      if (!pid) continue;
      const product = catalog.find((p) => p.id === pid);
      if (!product?.id) continue;
      if (productRefs.some((r) => r.catalogProductId === product.id)) continue;
      productRefs.push({
        catalogProductId: product.id,
        brand: product.brand || "",
        name: product.nm || "Product",
        group: product.g || product.category || "",
      });
    }

    if (productRefs.length === 0 && catalog.length > 0) {
      const fallbackCount = Math.max(1, (kit.imageUrls?.length || 1) - 1 || 1);
      for (const product of catalog.slice(0, fallbackCount)) {
        if (!product.id) continue;
        productRefs.push({
          catalogProductId: product.id,
          brand: product.brand || "",
          name: product.nm || "Product",
          group: product.g || product.category || "",
        });
      }
    }

    try {
      const ensured = await ensureCuratedKit.mutateAsync({
        platformKitId: kit._id,
        productRefs: productRefs.length ? productRefs : undefined,
      });
      navigate(`${tenantPath("/kits")}/${ensured.id}/send`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not prepare kit");
    }
  };

  return (
    <section className="dash-em-kits" aria-label="Kits for entity managers">
      <div className="dash-em-kits__custom card dash-card">
        <div className="dash-section-head">
          <h2>Customised Kits</h2>
          <Link to={`${tenantPath("/kits")}?tab=customized`} className="dash-inline-action">
            View all
          </Link>
        </div>

        {customKits.length > 0 ? (
          <ul className="dash-em-kits__list">
            {customKits.slice(0, 3).map((kit) => (
              <li key={kit.id}>
                <Link to={`${tenantPath("/kits")}/${kit.id}`} className="dash-em-kits__row">
                  <img
                    src={kit.artworkUrl ? resolveMediaUrl(kit.artworkUrl) : kitPreviewImg}
                    alt=""
                  />
                  <span>
                    <strong>{kit.name}</strong>
                    <small>{kit.items} items</small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="dash-em-kits__empty">
            <img src={noKitsYetImg} alt="" />
            <p className="dash-em-kits__empty-title">
              No kits have been created by your Company Admin yet.
            </p>
            <p className="dash-empty-note">You can still browse and send Curated Kits.</p>
            <Link to={`${tenantPath("/kits")}?tab=curated`} className="btn btn-ghost btn-sm">
              Browse Curated Kits
            </Link>
          </div>
        )}
      </div>

      <div className="dash-em-kits__curated card dash-card">
        <div className="dash-section-head">
          <h2>Curated Kits</h2>
          <Link to={`${tenantPath("/kits")}?tab=curated`} className="dash-inline-action">
            View all
          </Link>
        </div>

        {isLoading ? (
          <p className="dash-empty-note">Loading curated kits…</p>
        ) : curated.length === 0 ? (
          <p className="dash-empty-note">No curated kits available yet.</p>
        ) : (
          <div className="dash-em-kits__grid">
            {curated.slice(0, 4).map((kit) => (
              <article key={kit._id} className="dash-em-kit-card">
                <div className="dash-em-kit-card__media">
                  <img src={curatedCover(kit)} alt="" />
                </div>
                <div className="dash-em-kit-card__body">
                  <strong>{kit.name}</strong>
                  <small>
                    {(kit.items?.length ?? 0) > 0
                      ? `${kit.items!.length} items`
                      : "Curated bundle"}
                  </small>
                  <div className="dash-em-kit-card__actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        setKitPreview(buildKitPreviewFromPlatform(kit, catalog, curatedCover(kit)))
                      }
                    >
                      Preview
                    </button>
                    {canSendKits ? (
                      <button
                        type="button"
                        className="btn btn-brand btn-sm"
                        disabled={ensureCuratedKit.isPending}
                        onClick={() => void handleSendCurated(kit)}
                      >
                        Send
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <KitPreviewDialog
        open={!!kitPreview}
        onOpenChange={(open) => {
          if (!open) setKitPreview(null);
        }}
        data={kitPreview}
      />
    </section>
  );
}
