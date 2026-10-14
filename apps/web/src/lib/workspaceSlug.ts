/**
 * Derive a URL-safe workspace slug from the tenant / account name.
 *
 * Examples:
 *   "Shelf Merch"  → "shelfmerch"
 *   "Acme Corp"    → "acmecorp"
 *   "My-Company"   → "my-company"
 *
 * The slug is persisted in localStorage so it's available synchronously
 * before the workspace API response arrives.
 */

const SLUG_STORAGE_KEY = "sm_workspace_slug";

/** Normalise an account name into a URL-safe slug. */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "") // strip spaces & special chars
    .replace(/-{2,}/g, "-")       // collapse consecutive dashes
    .replace(/^-|-$/g, "");       // trim leading/trailing dashes
}

/** Read the cached workspace slug (available synchronously). */
export function getWorkspaceSlug(): string {
  try {
    return localStorage.getItem(SLUG_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

/** Persist the workspace slug so it's available on next page load. */
export function setWorkspaceSlug(slug: string) {
  try {
    localStorage.setItem(SLUG_STORAGE_KEY, slug);
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Build a tenant-area path using the workspace slug.
 *
 * `tenantPath("/shops")` → `"/shelfmerch/shops"`
 * `tenantPath("")`       → `"/shelfmerch"`   (dashboard root)
 *
 * Falls back to `/dashboard/...` if no slug is cached yet.
 */
export function tenantPath(subPath = ""): string {
  const slug = getWorkspaceSlug();
  const base = slug ? `/${slug}` : "/dashboard";
  if (!subPath || subPath === "/") return base;
  const normalised = subPath.startsWith("/") ? subPath : `/${subPath}`;
  return `${base}${normalised}`;
}
