import { useEffect } from "react";

/** Use the catalog mark while this layout is mounted; restore site icons on exit. */
export function useCatalogFavicon() {
  useEffect(() => {
    const originalIcons = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
    originalIcons.forEach((icon) => icon.remove());
    const catalogIcon = document.createElement("link");
    catalogIcon.rel = "icon";
    catalogIcon.type = "image/svg+xml";
    catalogIcon.href = "/catalog-favicon.svg?v=2";
    document.head.append(catalogIcon);

    return () => {
      catalogIcon.remove();
      originalIcons.forEach((icon) => document.head.append(icon));
    };
  }, []);
}
