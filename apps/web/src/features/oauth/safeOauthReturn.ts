/** Same-origin return path after login. Only the OAuth consent page is allowed. */
export function safeOauthReturnPath(value: string | null): string | null {
  if (!value || !value.startsWith("/oauth/consent")) return null;
  if (value.startsWith("//") || value.includes("\\") || value.includes("@")) return null;
  try {
    const url = new URL(value, "http://shelfmerch.local");
    if (url.origin !== "http://shelfmerch.local") return null;
    if (url.pathname !== "/oauth/consent") return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

/** Resume URL produced by the authorization server, on this page's origin. */
export function isSafeResumeUrl(value: string, pageOrigin: string): boolean {
  try {
    const url = new URL(value, pageOrigin);
    if (url.origin !== pageOrigin) return false;
    if (url.username || url.password) return false;
    return url.pathname.startsWith("/auth/");
  } catch {
    return false;
  }
}
