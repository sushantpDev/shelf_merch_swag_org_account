export type SpaSeo = {
  mode: "public" | "private" | "preserve" | "unknown";
  title: string | null;
  description: string | null;
  robots: string | null;
  canonical: string | null;
  image: string | null;
  ogType: string;
  jsonLd: unknown;
};

export function normalizePath(input: string): string;
export function resolveSpaSeo(catalog: unknown, pathname: string): SpaSeo;
export function applySpaSeo(html: string, seo: SpaSeo): string;
export function applyPrivateShell(html: string): string;