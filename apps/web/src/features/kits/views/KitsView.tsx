import { type CSSProperties, type ReactNode, useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router";
import {
  ArrowRight,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  Star,
  Users,
  Box,
} from "lucide-react";
import { toast } from "sonner";
import { LoadingState } from "@/components/LoadingState";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  useUpdateKit,
  useCreateKit,
  useEnsureCuratedKit,
  usePlatformKits,
  type PlatformKitTemplate,
  type UiKit,
} from "../model";
import { kitPickedIndices } from "../wizard/kitDraft";
import {
  KitPreviewDialog,
  buildKitPreviewFromPlatform,
  buildKitPreviewFromWorkspace,
  type KitPreviewData,
} from "../KitPreviewDialog";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import type { KitsVm } from "../controllers/useKitsController";
import { useStartSampleOrder } from "../sample/useStartSampleOrder";
import { KitsEmptyState } from "./KitsEmptyState";
import kitPreviewImg from "../../../../assets/kit-preview.png";
import noKitsYetImg from "../../../../assets/no-kits-yet.png";
import "../kits-page.css";

function KitsSectionEmptyState({
  title,
  description,
  secondary,
  illustration = true,
  action,
}: {
  title: string;
  description: string;
  secondary?: string;
  illustration?: boolean;
  action?: ReactNode;
}) {
  return (
    <div
      className="card"
      style={{
        padding: "48px 32px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-card)",
        border: "1px solid var(--line)",
        borderRadius: 12,
        minHeight: 280,
      }}
    >
      {illustration ? (
        <img
          src={noKitsYetImg}
          alt=""
          style={{ maxHeight: 140, marginBottom: 20, objectFit: "contain" }}
        />
      ) : null}
      <h3
        style={{
          fontSize: 18,
          fontWeight: "var(--font-weight-bold)",
          color: "var(--ink)",
          margin: "0 0 8px",
        }}
      >
        {title}
      </h3>
      <p className="muted" style={{ fontSize: 14, lineHeight: 1.55, margin: 0, maxWidth: 420 }}>
        {description}
      </p>
      {secondary ? (
        <p
          className="muted"
          style={{
            fontSize: "var(--workspace-font-caption, 13px)",
            lineHeight: 1.5,
            margin: "10px 0 0",
            maxWidth: 420,
          }}
        >
          {secondary}
        </p>
      ) : null}
      {action ? <div style={{ marginTop: 18 }}>{action}</div> : null}
    </div>
  );
}

const previewBtnStyle: CSSProperties = {
  flex: 1,
  border: "1px solid var(--line)",
  height: 32,
  fontSize: 13,
  fontWeight: "var(--font-weight-bold)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 6,
  color: "var(--ink)",
  background: "transparent",
  cursor: "pointer",
};

const sendBtnStyle: CSSProperties = {
  flex: 1,
  height: 32,
  fontSize: 13,
  fontWeight: "var(--font-weight-bold)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 6,
};

type StatCardProps = {
  label: string;
  value: string;
  hint: string;
  tone: "slate" | "blue" | "amber" | "green";
  live?: boolean;
};

type KitRow = {
  id: string;
  name: string;
  description: string;
  audience: string;
  image: string;
  items: number;
  status: "live" | "draft" | "archived";
  lastSent: string;
  sentDate: string;
  lastSentAt?: string;
  featured?: boolean;
  /** Present only for real workspace kits; absent for default sample rows. */
  kit?: UiKit;
  platformKit?: PlatformKitTemplate;
};

type LastSentFilter = "any" | "never" | "7d" | "30d" | "90d";

const LAST_SENT_FILTER_OPTIONS: { id: LastSentFilter; label: string }[] = [
  { id: "any", label: "Any time" },
  { id: "never", label: "Never sent" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
];

function formatKitLastSent(iso?: string): { primary: string; secondary: string } {
  if (!iso) return { primary: "—", secondary: "Never sent" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { primary: "—", secondary: "Never sent" };
  return {
    primary: d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    secondary: d.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    }),
  };
}

function matchesLastSentFilter(iso: string | undefined, filter: LastSentFilter) {
  if (filter === "any") return true;
  if (filter === "never") return !iso;
  if (!iso) return false;
  const sentAt = new Date(iso).getTime();
  if (Number.isNaN(sentAt)) return false;
  const days = filter === "7d" ? 7 : filter === "30d" ? 30 : 90;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return sentAt >= cutoff;
}

function getCuratedKitMeta(kit: any) {
  try {
    if (!kit.designNotes) return null;
    const parsed = JSON.parse(kit.designNotes);
    if (parsed && parsed.curated) {
      return parsed;
    }
  } catch (e) {}
  return null;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, hint, tone, live = false }: StatCardProps) {
  return (
    <div className={`kits-kpi__item kits-kpi__item--${tone}`}>
      <span className="kits-kpi__content">
        <span className="kits-kpi__label">{label}</span>
        <span className="kits-kpi__line">
          {live ? <span className="kits-kpi__dot" aria-hidden="true" /> : null}
          <span className="kits-kpi__value">{value}</span>
        </span>
        <span className="kits-kpi__hint">{hint}</span>
      </span>
    </div>
  );
}

// function ProgressBanner() {
//   return (
//     <div
//       style={{
//         background: "var(--gray-50)",
//         border: "1px solid var(--line)",
//         borderRadius: 12,
//         padding: "16px 24px",
//         display: "flex",
//         alignItems: "center",
//         justifyContent: "space-between",
//         gap: 16,
//         marginBottom: 24,
//         flexWrap: "wrap",
//       }}
//     >
{
  /* <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 220 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "#eef7f2",
            color: "var(--brand)",
            display: "grid",
            placeItems: "center",
            fontWeight: 700,
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          1
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Box size={18} color="var(--brand)" />
        </div> */
}
{
  /* <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#101a15" }}>Create a kit</div>
          <div style={{ fontSize: 11, color: "#5b665f", lineHeight: 1.3 }}>
            Choose products from catalog and name kit.
          </div>
        </div>
      </div>
      <div style={{ color: "#d9e0dc", fontSize: 20, fontWeight: 300, userSelect: "none" }}>›</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 220 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "#eef7f2",
            color: "var(--brand)",
            display: "grid",
            placeItems: "center",
            fontWeight: 700,
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          2
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Users size={18} color="var(--brand)" />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#101a15" }}>Add recipients</div>
          <div style={{ fontSize: 11, color: "#5b665f", lineHeight: 1.3 }}>
            Select employees or import contacts.
          </div>
        </div>
      </div>
      <div style={{ color: "#d9e0dc", fontSize: 20, fontWeight: 300, userSelect: "none" }}>›</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 220 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "#eef7f2",
            color: "var(--brand)",
            display: "grid",
            placeItems: "center",
            fontWeight: 700,
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          3
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Send size={18} color="var(--brand)" />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#101a15" }}>Send &amp; track</div>
          <div style={{ fontSize: 11, color: "#5b665f", lineHeight: 1.3 }}>
            Launch your kit and monitor delivery status.
          </div>
        </div> */
}
{
  /* </div>
    </div> */
}
// );
// }

// ─── Main view ───────────────────────────────────────────────────────────────

export function KitsView(vm: KitsVm) {
  const navigate = useNavigate();
  const { data: workspace } = useWorkspace();
  const updateKit = useUpdateKit();
  const createKit = useCreateKit();
  const ensureCuratedKit = useEnsureCuratedKit();
  const sampleOrder = useStartSampleOrder();
  const { data: platformKits } = usePlatformKits();
  const catalog = workspace?.catalogProducts ?? [];

  const [kitPreview, setKitPreview] = useState<KitPreviewData | null>(null);

  const [recentTab, setRecentTab] = useState<"all" | "live" | "draft" | "archived">("all");
  const [recentSearch, setRecentSearch] = useState("");
  const [recentSort, setRecentSort] = useState<"name" | "items" | "newest">("newest");
  const [lastSentFilter, setLastSentFilter] = useState<LastSentFilter>("any");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [recentPage, setRecentPage] = useState(1);

  useEffect(() => {
    if (!filtersOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest(".kits-tool-btn, .kits-filter-menu")) return;
      setFiltersOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [filtersOpen]);

  const { canCreateKits, canSendKits } = vm;

  /** Map real workspace kits into KitRow shape */
  const workspaceRows = useMemo<KitRow[]>(() => {
    return vm.kits
      .filter((kit) => !getCuratedKitMeta(kit))
      .map((kit): KitRow => {
        const sent = formatKitLastSent(kit.lastSentAt);
        return {
          id: kit.id,
          name: kit.name,
          description: kit.description?.trim() || "Custom kit created in your workspace.",
          audience: "Customised",
          image: kit.artworkUrl ? resolveMediaUrl(kit.artworkUrl) : kitPreviewImg,
          items: kit.items,
          status: kit.status === "live" ? "live" : kit.status === "archived" ? "archived" : "draft",
          lastSent: sent.primary,
          sentDate: sent.secondary,
          lastSentAt: kit.lastSentAt,
          kit,
        };
      });
  }, [vm.kits]);

  /** Map platform curated kits into KitRow shape */
  const curatedKitsRows = useMemo<KitRow[]>(() => {
    if (!platformKits) return [];
    return platformKits.map((kit): KitRow => {
      const coverImg = kit.heroImage
        ? resolveMediaUrl(kit.heroImage)
        : kit.imageUrls?.[0]
          ? resolveMediaUrl(kit.imageUrls[0])
          : kitPreviewImg;
      const matchedWk = vm.kits.find((wk) => {
        const meta = getCuratedKitMeta(wk);
        return meta?.originalId === kit._id;
      });

      // Prefer explicit itemImages; fall back to workspace clone / legacy gallery count.
      const imageItemCount =
        Array.isArray(kit.itemImages) && kit.itemImages.length
          ? kit.itemImages.length
          : (kit.imageUrls?.length ?? 0) > 1
            ? kit.imageUrls!.length - 1
            : (kit.imageUrls?.length ?? 0) === 1
              ? 1
              : 0;
      const itemCount =
        (kit.items?.length && kit.items.length > 0
          ? kit.items.length
          : matchedWk?.items && matchedWk.items > 0
            ? matchedWk.items
            : imageItemCount) || 0;

      const sent = formatKitLastSent(matchedWk?.lastSentAt);
      return {
        id: matchedWk ? matchedWk.id : kit._id,
        name: matchedWk ? matchedWk.name : kit.name,
        description: kit.description || "",
        audience: "Curated",
        image: coverImg,
        items: itemCount,
        status: matchedWk
          ? matchedWk.status === "live"
            ? "live"
            : matchedWk.status === "archived"
              ? "archived"
              : "draft"
          : "live",
        lastSent: sent.primary,
        sentDate: sent.secondary,
        lastSentAt: matchedWk?.lastSentAt,
        platformKit: kit,
        kit: matchedWk,
      };
    });
  }, [platformKits, vm.kits]);

  /** Workspace kits first, then the curated templates. */
  const allKits = useMemo<KitRow[]>(
    () => [...workspaceRows, ...curatedKitsRows],
    [workspaceRows, curatedKitsRows],
  );

  const stats = useMemo(() => {
    const live = allKits.filter((k) => k.status === "live").length;
    const drafts = allKits.filter((k) => k.status === "draft").length;
    const archived = allKits.filter((k) => k.status === "archived").length;
    return { total: live + drafts + archived, live, drafts, archived };
  }, [allKits]);

  // Filtered & Sorted kit list (custom + curated)
  const processedRecentRows = useMemo(() => {
    let list = [...allKits];
    if (recentTab === "all") {
      list = list.filter((r) => r.status !== "archived");
    } else {
      list = list.filter((r) => r.status === recentTab);
    }
    if (recentSearch.trim()) {
      const q = recentSearch.toLowerCase();
      list = list.filter(
        (r) => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q),
      );
    }
    if (lastSentFilter !== "any") {
      list = list.filter((r) => matchesLastSentFilter(r.lastSentAt, lastSentFilter));
    }
    if (recentSort === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (recentSort === "items") {
      list.sort((a, b) => b.items - a.items);
    } else {
      // newest — sent date descending
      list.sort((a, b) => {
        const ta = a.lastSentAt ? new Date(a.lastSentAt).getTime() : 0;
        const tb = b.lastSentAt ? new Date(b.lastSentAt).getTime() : 0;
        return tb - ta;
      });
    }
    return list;
  }, [allKits, recentTab, recentSearch, recentSort, lastSentFilter]);

  const RECENT_ITEMS_PER_PAGE = 8;

  const recentTotalPages = Math.max(
    1,
    Math.ceil(processedRecentRows.length / RECENT_ITEMS_PER_PAGE),
  );
  const paginatedRecentRows = useMemo(() => {
    const start = (recentPage - 1) * RECENT_ITEMS_PER_PAGE;
    return processedRecentRows.slice(start, start + RECENT_ITEMS_PER_PAGE);
  }, [processedRecentRows, recentPage]);

  const firstLiveKitId = useMemo(() => vm.kits.find((k) => k.status === "live")?.id, [vm.kits]);

  // ── Handlers for Curated Action & Send ──

  const openRowPreview = (row: KitRow) => {
    const curatedMeta = row.kit ? getCuratedKitMeta(row.kit) : null;
    const resolvedPlatformKit =
      row.platformKit ||
      (curatedMeta?.originalId && platformKits
        ? platformKits.find((k) => String(k._id) === String(curatedMeta.originalId))
        : undefined);

    if (resolvedPlatformKit) {
      setKitPreview(buildKitPreviewFromPlatform(resolvedPlatformKit, catalog, row.image));
      return;
    }
    if (row.kit) {
      setKitPreview(buildKitPreviewFromWorkspace(row.kit, catalog, row.image, platformKits));
      return;
    }
    setKitPreview({
      name: row.name,
      description: row.description || "No description available.",
      coverImage: row.image,
      products: [],
    });
  };

  const handleSendWorkspaceKit = (kit: UiKit | undefined) => {
    if (!kit?.id) {
      toast.error("This kit can no longer be sent");
      return;
    }
    navigate(`/app/kits/${kit.id}/send`);
  };

  const handleSendCuratedKit = async (kit: PlatformKitTemplate, _existing?: UiKit) => {
    const catalogProducts = workspace?.catalogProducts ?? [];
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

    // Always hit from-platform (reuse + sync requireLogo) even when a clone exists.

    try {
      const ensured = await ensureCuratedKit.mutateAsync({
        platformKitId: kit._id,
        productRefs: productRefs.length ? productRefs : undefined,
      });
      navigate(`/app/kits/${ensured.id}/send`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not prepare kit");
    }
  };

  const handleCuratedAction = async (
    kit: PlatformKitTemplate,
    status: "archived" | "draft" | "live",
  ) => {
    const catalogProducts = workspace?.catalogProducts ?? [];
    const pickedIndices: number[] = [];
    if (kit.items) {
      for (const item of kit.items) {
        const pid = String(item.catalogProductId ?? "");
        if (!pid) continue;
        const idx = catalogProducts.findIndex((p) => p.id === pid);
        if (idx >= 0 && !pickedIndices.includes(idx)) pickedIndices.push(idx);
      }
    }
    if (pickedIndices.length === 0 && catalogProducts.length > 0) {
      pickedIndices.push(0);
    }
    const packaging = kit.packaging === "none" ? "none" : "box";
    const designNotes = JSON.stringify({
      curated: true,
      originalId: kit._id,
      description: kit.description || "",
      approxValueInr: Math.round(Number(kit.approxValueInr) || 0),
      imageUrls: kit.imageUrls || [],
      heroImage: kit.heroImage || kit.imageUrls?.[0] || "",
      itemImages: kit.itemImages || [],
      variantImages: kit.variantImages || [],
      requireLogo: kit.rules?.requireLogo !== false,
    });

    try {
      const created = await createKit.mutateAsync({
        name: kit.name,
        pickedIndices,
        catalog: catalogProducts,
        packaging,
        designNotes,
      });
      await updateKit.mutateAsync({
        id: created.id,
        pickedIndices,
        catalog: catalogProducts,
        status,
      });
      toast.success(`Kit marked ${status}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update kit status");
    }
  };

  // ── Early returns ──
  if (vm.isLoading)
    return <LoadingState message="Loading kits..." fullScreen={false} variant="page" />;
  if (vm.errorMessage) {
    return (
      <div className="card" style={{ padding: 16, color: "var(--danger)" }}>
        {vm.errorMessage}
      </div>
    );
  }

  if (vm.isEmpty && canCreateKits) {
    return <KitsEmptyState contactCount={vm.contactCount} canCreateKits={vm.canCreateKits} />;
  }

  // Nested actions component for row options (manage actions require kits write)
  function ThreeDotMenu({ kitRow }: { kitRow: KitRow }) {
    const [open, setOpen] = useState(false);

    const handleAction = async (status: "archived" | "draft" | "live") => {
      if (!canCreateKits) {
        toast.info("Admin access required");
        return;
      }
      setOpen(false);

      if (kitRow.platformKit && !kitRow.kit) {
        handleCuratedAction(kitRow.platformKit, status);
        return;
      }

      const activeKit = kitRow.kit;
      if (!activeKit) {
        toast.info("Available for custom kits only");
        return;
      }
      try {
        const catalogProducts = workspace?.catalogProducts ?? [];
        const pickedIndices = kitPickedIndices(activeKit, catalogProducts);
        await updateKit.mutateAsync({
          id: activeKit.id,
          pickedIndices,
          catalog: catalogProducts,
          status,
        });
        toast.success(`Kit marked ${status}`);
      } catch (err) {
        toast.error("Failed to update kit status");
      }
    };

    return (
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => {
            if (!canCreateKits) {
              toast.info("Admin access required");
              return;
            }
            setOpen(!open);
          }}
          style={{
            background: "transparent",
            border: "1px solid var(--line)",
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 6,
            cursor: "pointer",
          }}
          aria-label="Kit options"
        >
          <MoreVertical size={16} />
        </button>
        {open && (
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 90 }}
              onClick={() => setOpen(false)}
            />
            <div
              style={{
                position: "absolute",
                right: 0,
                bottom: "100%",
                marginBottom: 4,
                background: "var(--bg-card)",
                border: "1px solid var(--line)",
                borderRadius: 6,
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                zIndex: 100,
                minWidth: 140,
                display: "flex",
                flexDirection: "column",
                padding: 4,
              }}
            >
              {kitRow.kit && !kitRow.platformKit && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    navigate(`/app/kits/${kitRow.kit!.id}/edit`);
                  }}
                  style={{
                    padding: "8px 12px",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    fontSize: "var(--workspace-font-body, 13px)",
                    cursor: "pointer",
                    borderRadius: 4,
                  }}
                >
                  Edit kit
                </button>
              )}
              {kitRow.status !== "archived" && (
                <button
                  type="button"
                  onClick={() => handleAction("archived")}
                  style={{
                    padding: "8px 12px",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    fontSize: "var(--workspace-font-body, 13px)",
                    cursor: "pointer",
                    borderRadius: 4,
                  }}
                >
                  Archive
                </button>
              )}
              {kitRow.status !== "draft" && (
                <button
                  type="button"
                  onClick={() => handleAction("draft")}
                  style={{
                    padding: "8px 12px",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    fontSize: "var(--workspace-font-body, 13px)",
                    cursor: "pointer",
                    borderRadius: 4,
                  }}
                >
                  Mark as Draft
                </button>
              )}
              {kitRow.status !== "live" && (
                <button
                  type="button"
                  onClick={() => handleAction("live")}
                  style={{
                    padding: "8px 12px",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    fontSize: "var(--workspace-font-body, 13px)",
                    cursor: "pointer",
                    borderRadius: 4,
                  }}
                >
                  Mark as Live
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <section className="kits-dashboard" aria-label="Kits and Items dashboard">
      <header className="kits-hero">
        <div className="kits-hero__copy">
          <h1>Kits &amp; Items</h1>
          <p className="kits-hero__sub">
            {canCreateKits
              ? "Create reusable gift kits with your products and send them at scale."
              : "Browse custom and curated kits, then send them to your team."}
          </p>
        </div>
        <div className="kits-hero__actions">
          <Link to="/app/catalog/category/kits" className="kits-hero__cta kits-hero__cta--ghost">
            View all kits
          </Link>
          {canCreateKits ? (
            <Link to="/app/kits/new" className="kits-hero__cta">
              <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
              Create a kit
            </Link>
          ) : null}
        </div>
      </header>

      <div className="kits-kpi" aria-label="Kit metrics">
        <StatCard
          label="Total kits"
          value={String(stats.total)}
          hint="Across custom and curated"
          tone="slate"
        />
        <StatCard
          label="Live kits"
          value={String(stats.live)}
          hint="Ready to send"
          tone="blue"
          live
        />
        <StatCard
          label="Drafts"
          value={String(stats.drafts)}
          hint="Still in progress"
          tone="amber"
        />
        <StatCard
          label="Recipients"
          value={vm.contactCount.toLocaleString("en-IN")}
          hint="People you can reach"
          tone="green"
        />
      </div>

      {allKits.length === 0 ? (
        <KitsSectionEmptyState
          title="No kits yet"
          description="Create a custom kit or send a curated kit to get started."
          action={
            canSendKits || canCreateKits ? (
              <Link
                to={firstLiveKitId ? `/app/kits/${firstLiveKitId}/send` : "/app/kits/new"}
                className="btn btn-brand"
              >
                Send Your First Kit
              </Link>
            ) : null
          }
        />
      ) : (
        <div className="kits-list-card">
          {/* Toolbar */}
          <div className="kits-list-toolbar">
            <div className="kits-tabs" aria-label="Kit filters">
              {(["all", "live", "draft", "archived"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`kits-tab${recentTab === tab ? " kits-tab--active" : ""}`}
                  onClick={() => {
                    setRecentTab(tab);
                    setRecentPage(1);
                  }}
                >
                  {tab === "all"
                    ? "All kits"
                    : tab === "draft"
                      ? "Drafts"
                      : tab.charAt(0).toUpperCase() + tab.slice(1)}
                  <span>
                    {tab === "all"
                      ? allKits.filter((r) => r.status !== "archived").length
                      : allKits.filter((r) => r.status === tab).length}
                  </span>
                </button>
              ))}
            </div>

            <div className="kits-tools">
              <div className="kits-search">
                <Search size={16} aria-hidden="true" />
                <input
                  placeholder="Search kits"
                  value={recentSearch}
                  onChange={(e) => {
                    setRecentSearch(e.target.value);
                    setRecentPage(1);
                  }}
                />
              </div>
              <div className="kits-filter-wrap">
                <button
                  type="button"
                  className={`kits-tool-btn${lastSentFilter !== "any" ? " kits-tool-btn--active" : ""}`}
                  aria-expanded={filtersOpen}
                  onClick={() => setFiltersOpen((o) => !o)}
                >
                  <SlidersHorizontal size={16} />
                  {lastSentFilter === "any"
                    ? "Filters"
                    : LAST_SENT_FILTER_OPTIONS.find((o) => o.id === lastSentFilter)?.label ||
                      "Filters"}
                </button>
                {filtersOpen ? (
                  <>
                    <button
                      type="button"
                      className="menu-dismiss-scrim"
                      aria-label="Close filters"
                      onClick={() => setFiltersOpen(false)}
                    />
                    <div className="kits-filter-menu" role="menu">
                      <div className="kits-filter-menu__label">Last sent</div>
                      {LAST_SENT_FILTER_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          role="menuitem"
                          className={lastSentFilter === opt.id ? "on" : ""}
                          onClick={() => {
                            setLastSentFilter(opt.id);
                            setFiltersOpen(false);
                            setRecentPage(1);
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <select
                  value={recentSort}
                  onChange={(e) => {
                    setRecentSort(e.target.value as any);
                    setRecentPage(1);
                  }}
                  style={{
                    padding: "0 28px 0 12px",
                    borderRadius: 8,
                    border: "1px solid var(--line)",
                    background: "var(--bg-card)",
                    fontSize: "var(--workspace-font-body, 13px)",
                    fontWeight: "var(--font-weight-bold)",
                    height: 40,
                    appearance: "none",
                    cursor: "pointer",
                  }}
                >
                  <option value="newest">Newest</option>
                  <option value="name">Name</option>
                  <option value="items">Items</option>
                </select>
                <ChevronDown
                  size={14}
                  style={{
                    position: "absolute",
                    right: 10,
                    pointerEvents: "none",
                    color: "var(--ink-2)",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="kits-table" role="table" aria-label="Kits list">
            {paginatedRecentRows.length > 0 ? (
              paginatedRecentRows.map((row) => (
                <div className="kits-table__row" role="row" key={row.id}>
                  <div className="kits-kit-cell">
                    {row.kit ? (
                      <Link to={`/app/kits/${row.id}`}>
                        <img src={row.image} alt="" />
                      </Link>
                    ) : (
                      <img src={row.image} alt="" />
                    )}
                    <div>
                      <div className="kits-kit-title">
                        {row.kit ? (
                          <Link to={`/app/kits/${row.id}`} className="lnk">
                            {row.name}
                          </Link>
                        ) : (
                          <span>{row.name}</span>
                        )}
                        {row.featured && (
                          <span className="kits-featured">
                            <Star size={11} fill="currentColor" /> Featured
                          </span>
                        )}
                      </div>
                      <span className="kits-audience">{row.audience}</span>
                    </div>
                  </div>

                  <div className="kits-metric-cell">
                    <span>Items</span>
                    <strong>{row.items}</strong>
                  </div>

                  <div className="kits-metric-cell">
                    <span>Status</span>
                    <strong className={`kits-status kits-status--${row.status}`}>
                      <i />
                      {row.status === "live"
                        ? "Live"
                        : row.status === "archived"
                          ? "Archived"
                          : "Draft"}
                    </strong>
                  </div>

                  <div className="kits-sent-cell">
                    <span>Last sent</span>
                    <strong>{row.lastSent}</strong>
                    <em>{row.sentDate}</em>
                  </div>

                  <div className="kits-row-actions">
                    <button
                      type="button"
                      className="kits-row-btn"
                      onClick={() => openRowPreview(row)}
                    >
                      Preview
                    </button>

                    {canSendKits && (
                      <button
                        type="button"
                        className="kits-row-btn"
                        onClick={() => {
                          if (row.platformKit) {
                            void sampleOrder.startFromPlatformKit(row.platformKit, row.kit);
                          } else {
                            sampleOrder.startFromWorkspaceKit(row.kit);
                          }
                        }}
                        disabled={sampleOrder.pendingKitId === row.platformKit?._id}
                        aria-busy={sampleOrder.pendingKitId === row.platformKit?._id}
                      >
                        {sampleOrder.pendingKitId === row.platformKit?._id
                          ? "Opening…"
                          : "Request a Sample"}
                      </button>
                    )}

                    {canSendKits && (
                      <button
                        type="button"
                        className="kits-send-btn"
                        onClick={() => {
                          if (row.platformKit) {
                            handleSendCuratedKit(row.platformKit, row.kit);
                          } else {
                            handleSendWorkspaceKit(row.kit);
                          }
                        }}
                        style={{
                          height: 36,
                          padding: "0 16px",
                          fontSize: "var(--workspace-font-body, 13px)",
                        }}
                        disabled={
                          ensureCuratedKit.isPending &&
                          ensureCuratedKit.variables?.platformKitId === row.platformKit?._id
                        }
                        aria-busy={
                          ensureCuratedKit.isPending &&
                          ensureCuratedKit.variables?.platformKitId === row.platformKit?._id
                        }
                      >
                        {ensureCuratedKit.isPending &&
                        ensureCuratedKit.variables?.platformKitId === row.platformKit?._id
                          ? "Opening…"
                          : "Send"}
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: 40, textAlign: "center", color: "var(--gray-500)" }}>
                No kits match the current filters.
              </div>
            )}
          </div>

          {/* Pagination footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px 20px",
              borderTop: "1px solid var(--line)",
            }}
          >
            <span
              style={{ fontSize: "var(--workspace-font-body, 13px)", color: "var(--gray-500)" }}
            >
              Showing{" "}
              {processedRecentRows.length > 0 ? (recentPage - 1) * RECENT_ITEMS_PER_PAGE + 1 : 0} to{" "}
              {Math.min(processedRecentRows.length, recentPage * RECENT_ITEMS_PER_PAGE)} of{" "}
              {processedRecentRows.length} records
            </span>
            {recentTotalPages > 1 && (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  disabled={recentPage === 1}
                  onClick={() => setRecentPage(recentPage - 1)}
                  style={{
                    padding: "6px 12px",
                    border: "1px solid var(--line)",
                    background: "transparent",
                    borderRadius: 6,
                    fontSize: "var(--workspace-font-body, 13px)",
                    fontWeight: "var(--font-weight-bold)",
                    cursor: recentPage === 1 ? "not-allowed" : "pointer",
                    opacity: recentPage === 1 ? 0.5 : 1,
                  }}
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={recentPage === recentTotalPages}
                  onClick={() => setRecentPage(recentPage + 1)}
                  style={{
                    padding: "6px 12px",
                    border: "1px solid var(--line)",
                    background: "transparent",
                    borderRadius: 6,
                    fontSize: "var(--workspace-font-body, 13px)",
                    fontWeight: "var(--font-weight-bold)",
                    cursor: recentPage === recentTotalPages ? "not-allowed" : "pointer",
                    opacity: recentPage === recentTotalPages ? 0.5 : 1,
                  }}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <KitPreviewDialog
        data={kitPreview}
        open={kitPreview !== null}
        onOpenChange={(open) => {
          if (!open) setKitPreview(null);
        }}
      />
    </section>
  );
}
