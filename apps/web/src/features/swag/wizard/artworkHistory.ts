import { resolveMediaUrl } from "@/lib/mediaUrl";

export type PreviousArtwork = {
  id: string;
  name: string;
  preview: string;
  fileType: string;
};

export type DefaultArtwork = {
  id: string;
  name: string;
  preview: string;
  fileType: string;
  source?: "shop-logo" | "workspace-logo" | "upload";
};

const HISTORY_KEY = "swag-artwork-history";
const HISTORY_LIMIT = 24;
const DEFAULT_ARTWORK_KEY = "shelf-merch-default-artwork";

export function fileTypeFromName(name: string): string {
  const ext = name.split("?")[0].split(".").pop()?.toUpperCase();
  return ext && ext.length <= 5 ? ext : "PNG";
}

export function loadArtworkHistory(): PreviousArtwork[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PreviousArtwork[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function rememberArtwork(item: PreviousArtwork) {
  if (!item.preview) return;
  const next = [
    item,
    ...loadArtworkHistory().filter((h) => h.preview !== item.preview),
  ].slice(0, HISTORY_LIMIT);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }
}

export function getDefaultArtwork(): DefaultArtwork | null {
  try {
    const raw = localStorage.getItem(DEFAULT_ARTWORK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DefaultArtwork;
    if (parsed && typeof parsed.preview === "string" && parsed.preview.length > 0) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function setDefaultArtwork(item: DefaultArtwork | null) {
  try {
    if (!item || !item.preview) {
      localStorage.removeItem(DEFAULT_ARTWORK_KEY);
      return;
    }
    localStorage.setItem(DEFAULT_ARTWORK_KEY, JSON.stringify(item));
    rememberArtwork({
      id: item.id || `default-${Date.now()}`,
      name: item.name || "Default Logo",
      preview: item.preview,
      fileType: item.fileType || "PNG",
    });
  } catch {
    // Ignore storage quota errors
  }
}

export function clearDefaultArtwork() {
  setDefaultArtwork(null);
}

export type ResolveDefaultArtworkOptions = {
  shop?: { id?: string; name?: string; logoUrl?: string } | null;
  workspace?: {
    logoUrl?: string;
    shops?: Array<{ id?: string; name?: string; logoUrl?: string }>;
  } | null;
};

/**
 * Single source of truth resolver for the brand / default artwork:
 * 1. Explicitly stored default artwork (from CreateShopView or user upload)
 * 2. Active shop logo
 * 3. Any shop logo in workspace
 * 4. Workspace brand icon
 * 5. Most recent upload from history
 */
export function resolveDefaultArtwork(
  options?: ResolveDefaultArtworkOptions,
): DefaultArtwork | null {
  const current = getDefaultArtwork();
  if (current?.preview) {
    return current;
  }

  // Active shop logo
  if (options?.shop?.logoUrl) {
    const preview = resolveMediaUrl(options.shop.logoUrl) || options.shop.logoUrl;
    const item: DefaultArtwork = {
      id: options.shop.id ? `shop-${options.shop.id}` : "shop-logo",
      name: options.shop.name ? `${options.shop.name} Logo` : "Shop Logo",
      preview,
      fileType: fileTypeFromName(options.shop.logoUrl),
      source: "shop-logo",
    };
    setDefaultArtwork(item);
    return item;
  }

  // Any workspace shop logo
  const shopWithLogo = options?.workspace?.shops?.find((s) => Boolean(s.logoUrl));
  if (shopWithLogo?.logoUrl) {
    const preview = resolveMediaUrl(shopWithLogo.logoUrl) || shopWithLogo.logoUrl;
    const item: DefaultArtwork = {
      id: shopWithLogo.id ? `shop-${shopWithLogo.id}` : "shop-logo",
      name: shopWithLogo.name ? `${shopWithLogo.name} Logo` : "Shop Logo",
      preview,
      fileType: fileTypeFromName(shopWithLogo.logoUrl),
      source: "shop-logo",
    };
    setDefaultArtwork(item);
    return item;
  }

  // Workspace brand logo
  if (options?.workspace?.logoUrl) {
    const preview = resolveMediaUrl(options.workspace.logoUrl) || options.workspace.logoUrl;
    const item: DefaultArtwork = {
      id: "workspace-logo",
      name: "Workspace Logo",
      preview,
      fileType: fileTypeFromName(options.workspace.logoUrl),
      source: "workspace-logo",
    };
    setDefaultArtwork(item);
    return item;
  }

  // Fallback to most recent upload
  const history = loadArtworkHistory();
  if (history.length > 0 && history[0].preview) {
    return {
      id: history[0].id,
      name: history[0].name,
      preview: history[0].preview,
      fileType: history[0].fileType,
      source: "upload",
    };
  }

  return null;
}

function fileTypeFromUrl(url: string) {
  return fileTypeFromName(url);
}

function labelFromUrl(url: string, fallback: string) {
  try {
    // Keep the extension — publish re-uploads previous artwork as a File and
    // the API allowlist requires both MIME and a matching extension.
    const file = url.split("?")[0].split("/").pop() || "";
    return decodeURIComponent(file) || fallback;
  } catch {
    return fallback;
  }
}

function sourceItems(
  collections: Array<{ id: string; name: string; artworkUrl?: string }> = [],
  kits: Array<{ id: string; name: string; artworkUrl?: string }> = [],
  shops: Array<{ id?: string; name?: string; logoUrl?: string }> = [],
  workspaceLogoUrl?: string,
): PreviousArtwork[] {
  const rows: PreviousArtwork[] = [];
  for (const s of shops) {
    if (!s.logoUrl) continue;
    const preview = resolveMediaUrl(s.logoUrl) || s.logoUrl;
    rows.push({
      id: s.id ? `shop-${s.id}` : `shop-logo-${s.name || ""}`,
      name: s.name ? `${s.name} Logo` : "Shop Logo",
      preview,
      fileType: fileTypeFromName(s.logoUrl),
    });
  }
  if (workspaceLogoUrl) {
    const preview = resolveMediaUrl(workspaceLogoUrl) || workspaceLogoUrl;
    rows.push({
      id: "workspace-logo",
      name: "Workspace Logo",
      preview,
      fileType: fileTypeFromName(workspaceLogoUrl),
    });
  }
  for (const c of collections) {
    if (!c.artworkUrl) continue;
    const preview = resolveMediaUrl(c.artworkUrl) || c.artworkUrl;
    rows.push({
      id: `collection-${c.id}`,
      name: labelFromUrl(c.artworkUrl, c.name),
      preview,
      fileType: fileTypeFromUrl(c.artworkUrl),
    });
  }
  for (const k of kits) {
    if (!k.artworkUrl) continue;
    const preview = resolveMediaUrl(k.artworkUrl) || k.artworkUrl;
    rows.push({
      id: `kit-${k.id}`,
      name: labelFromUrl(k.artworkUrl, k.name),
      preview,
      fileType: fileTypeFromUrl(k.artworkUrl),
    });
  }
  return rows;
}

export function buildPreviousUploads(
  collections: Array<{ id: string; name: string; artworkUrl?: string }> = [],
  kits: Array<{ id: string; name: string; artworkUrl?: string }> = [],
  shops: Array<{ id?: string; name?: string; logoUrl?: string }> = [],
  workspaceLogoUrl?: string,
): PreviousArtwork[] {
  const seen = new Set<string>();
  const defaultArt = getDefaultArtwork();
  const initialItems: PreviousArtwork[] = [];
  if (defaultArt && defaultArt.preview) {
    initialItems.push({
      id: defaultArt.id || "default-brand-artwork",
      name: defaultArt.name || "Default Logo",
      preview: defaultArt.preview,
      fileType: defaultArt.fileType || "PNG",
    });
  }
  const merged = [
    ...initialItems,
    ...loadArtworkHistory(),
    ...sourceItems(collections, kits, shops, workspaceLogoUrl),
  ];
  return merged.filter((item) => {
    if (!item.preview || seen.has(item.preview)) return false;
    seen.add(item.preview);
    return true;
  });
}

