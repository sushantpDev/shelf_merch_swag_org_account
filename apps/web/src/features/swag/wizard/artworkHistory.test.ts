import { beforeEach, describe, expect, it } from "vitest";
import {
  buildPreviousUploads,
  clearDefaultArtwork,
  getDefaultArtwork,
  loadArtworkHistory,
  rememberArtwork,
  resolveDefaultArtwork,
  setDefaultArtwork,
} from "./artworkHistory";

describe("artworkHistory and default artwork source of truth", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stores and retrieves default artwork", () => {
    expect(getDefaultArtwork()).toBeNull();

    setDefaultArtwork({
      id: "logo-1",
      name: "Acme Logo.png",
      preview: "data:image/png;base64,acme",
      fileType: "PNG",
      source: "shop-logo",
    });

    const current = getDefaultArtwork();
    expect(current).not.toBeNull();
    expect(current?.name).toBe("Acme Logo.png");
    expect(current?.preview).toBe("data:image/png;base64,acme");
    expect(current?.source).toBe("shop-logo");

    // Also automatically remembered in history
    const history = loadArtworkHistory();
    expect(history.length).toBe(1);
    expect(history[0].preview).toBe("data:image/png;base64,acme");
  });

  it("clears default artwork when requested", () => {
    setDefaultArtwork({
      id: "logo-1",
      name: "Acme Logo.png",
      preview: "data:image/png;base64,acme",
      fileType: "PNG",
    });

    clearDefaultArtwork();
    expect(getDefaultArtwork()).toBeNull();
  });

  it("resolves default artwork prioritizing explicitly saved default artwork", () => {
    setDefaultArtwork({
      id: "custom-shop-logo",
      name: "Custom Shop Logo",
      preview: "data:image/png;base64,custom",
      fileType: "PNG",
      source: "shop-logo",
    });

    const resolved = resolveDefaultArtwork({
      shop: { id: "s1", name: "Shop 1", logoUrl: "/shops/s1.png" },
      workspace: { logoUrl: "/workspace.png" },
    });

    expect(resolved?.preview).toBe("data:image/png;base64,custom");
    expect(resolved?.name).toBe("Custom Shop Logo");
  });

  it("resolves default artwork from active shop logo when no explicit default exists", () => {
    const resolved = resolveDefaultArtwork({
      shop: { id: "s1", name: "My Store", logoUrl: "https://cdn.example.com/store-logo.png" },
    });

    expect(resolved?.preview).toBe("https://cdn.example.com/store-logo.png");
    expect(resolved?.name).toBe("My Store Logo");
    expect(resolved?.source).toBe("shop-logo");
    expect(getDefaultArtwork()?.preview).toBe("https://cdn.example.com/store-logo.png");
  });

  it("resolves default artwork from workspace shops or workspace logo fallback", () => {
    const resolved = resolveDefaultArtwork({
      workspace: {
        logoUrl: "https://cdn.example.com/workspace.png",
        shops: [{ id: "ws-1", name: "Alpha", logoUrl: "https://cdn.example.com/alpha.png" }],
      },
    });

    expect(resolved?.preview).toBe("https://cdn.example.com/alpha.png");
    expect(resolved?.name).toBe("Alpha Logo");
  });

  it("includes default artwork at the top of buildPreviousUploads", () => {
    setDefaultArtwork({
      id: "brand-logo",
      name: "Brand Logo",
      preview: "data:image/png;base64,brand",
      fileType: "PNG",
    });

    rememberArtwork({
      id: "art-prev",
      name: "Old Design.png",
      preview: "data:image/png;base64,old",
      fileType: "PNG",
    });

    const uploads = buildPreviousUploads(
      [{ id: "col-1", name: "Collection Art", artworkUrl: "https://cdn.example.com/c1.png" }],
      [{ id: "kit-1", name: "Kit Art", artworkUrl: "https://cdn.example.com/k1.png" }],
      [{ id: "shop-1", name: "Shop One", logoUrl: "https://cdn.example.com/s1.png" }],
      "https://cdn.example.com/w1.png",
    );

    expect(uploads.length).toBe(6);
    expect(uploads[0].preview).toBe("data:image/png;base64,brand");
    expect(uploads[0].name).toBe("Brand Logo");
  });
});
