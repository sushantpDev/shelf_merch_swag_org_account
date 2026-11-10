// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { StrictMode, type PropsWithChildren } from "react";
import { useCatalogFavicon } from "./useCatalogFavicon";

describe("catalog favicon", () => {
  it("replaces competing site icons while browsing and restores them when leaving", () => {
    const svg = document.createElement("link");
    svg.rel = "icon"; svg.href = "/favicon.svg"; svg.type = "image/svg+xml";
    const png = document.createElement("link");
    png.rel = "icon"; png.href = "/favicon-32x32.png";
    document.head.append(svg, png);
    const { unmount } = renderHook(useCatalogFavicon, {
      wrapper: ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>,
    });
    const icons = document.head.querySelectorAll('link[rel~="icon"]');
    expect(icons).toHaveLength(1);
    expect(icons[0].getAttribute("href")).toBe("/catalog-favicon.svg?v=2");
    unmount();
    expect(Array.from(document.head.querySelectorAll('link[rel~="icon"]'))).toEqual([svg, png]);
    svg.remove(); png.remove();
  });
});
