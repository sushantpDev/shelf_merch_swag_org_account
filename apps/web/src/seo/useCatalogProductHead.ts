import { useEffect } from "react";
import { catalogProductMeta } from "../../../api/src/modules/seo/catalogProductDocument.js";
import catalog from "@/seo/publicPages.json";

export type CatalogHeadProduct = {
  id: string;
  name: string;
  description?: string;
  brand?: string;
  category?: string;
  image?: string;
};

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

/** Public product head after client navigations. Does not emit analytics or prices. */
export function useCatalogProductHead(product: CatalogHeadProduct | null, mode: "public" | "title" | "off") {
  const id = product?.id ?? "";
  const name = product?.name ?? "";
  const description = product?.description ?? "";
  const brand = product?.brand ?? "";
  const category = product?.category ?? "";
  const image = product?.image ?? "";

  useEffect(() => {
    if (mode === "off" || !id || !name) return;
    const meta = catalogProductMeta(
      { id, name, description, brand, category, image },
      catalog.origin,
    );
    document.title = meta.title;
    if (mode !== "public") return;
    upsertMeta("name", "description", meta.description);
    upsertMeta("name", "robots", "index, follow");
    upsertMeta("property", "og:title", meta.title);
    upsertMeta("property", "og:description", meta.description);
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:url", meta.canonical);
    if (meta.image) {
      upsertMeta("property", "og:image", meta.image);
      upsertMeta("name", "twitter:image", meta.image);
      upsertMeta("name", "twitter:card", "summary_large_image");
    }

    let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = meta.canonical;

    const existing = document.getElementById("seo-jsonld");
    if (!meta.jsonLd) {
      existing?.remove();
      return;
    }
    const script = existing ?? document.createElement("script");
    script.id = "seo-jsonld";
    script.setAttribute("type", "application/ld+json");
    script.textContent = JSON.stringify(meta.jsonLd).replace(/</g, "\\u003c");
    if (!script.parentNode) document.head.appendChild(script);
  }, [mode, id, name, description, brand, category, image]);
}
