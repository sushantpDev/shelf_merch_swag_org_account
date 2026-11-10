import { useQuery, useQueryClient } from "@tanstack/react-query";
import { hydrateWorkspace, isAuthenticated } from "@/services/api-bridge";
import type { WorkspaceSnapshot } from "@/services/workspace-api";
import { slugify, setWorkspaceSlug, getWorkspaceSlug } from "@/lib/workspaceSlug";

/** Single cache key for the whole tenant workspace snapshot. */
export const WORKSPACE_QUERY_KEY = ["workspace"] as const;

/**
 * The tenant app's single source of truth. `hydrateWorkspace()` fans out to all
 * tenant endpoints and returns one typed snapshot; features select slices from
 * it and invalidate this key after mutations.
 *
 * On success, also caches the workspace slug so navigation paths resolve
 * dynamically to `/{slug}/...`.
 */
export function useWorkspace() {
  return useQuery<WorkspaceSnapshot>({
    queryKey: WORKSPACE_QUERY_KEY,
    queryFn: async () => {
      const snapshot = await hydrateWorkspace();
      // Prefer the canonical tenant slug returned by the API.
      if (snapshot.slug || snapshot.account) {
        const slug = snapshot.slug || slugify(snapshot.account);
        if (slug) setWorkspaceSlug(slug);
      }
      return snapshot;
    },
    staleTime: 30_000,
    enabled: isAuthenticated(),
  });
}

/** Imperative refresh of the workspace snapshot — call after a mutation. */
export function useInvalidateWorkspace() {
  const queryClient = useQueryClient();
  return () => queryClient.refetchQueries({ queryKey: WORKSPACE_QUERY_KEY });
}

/** Convenience: returns the current workspace slug (reads from localStorage). */
export function useWorkspaceSlug(): string {
  const { data } = useWorkspace();
  if (data?.slug) return data.slug;
  // Re-derive from live data if available, fall back to cached.
  if (data?.account) return slugify(data.account);
  return getWorkspaceSlug();
}
