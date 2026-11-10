import { afterEach, expect, it, vi } from "vitest";
import { apiFetch } from "./api";
import { refreshCatalogProducts } from "./api-bridge";

vi.mock("./api", async (importOriginal) => ({
  ...await importOriginal<typeof import("./api")>(), apiFetch: vi.fn(),
}));

afterEach(() => vi.mocked(apiFetch).mockReset());

it("loads category products beyond the first 100 while keeping the category on every page", async () => {
  vi.mocked(apiFetch).mockImplementation(async (path) => {
    const url = new URL(String(path), "https://local.test");
    expect(url.searchParams.get("category")).toBe("Apparel");
    const page = Number(url.searchParams.get("page") ?? 1);
    return {
      items: Array.from({ length: page === 3 ? 5 : 100 }, (_, index) => ({ _id: `${page}-${index}`, name: `Tee ${page}-${index}`, category: "Apparel" })),
      pagination: { total: 205, limit: 100 },
    };
  });
  const result = await refreshCatalogProducts("Apparel");
  expect(result.total).toBe(205);
  expect(result.items).toHaveLength(205);
  expect(result.items.at(-1)?.nm).toBe("Tee 3-4");
  expect(apiFetch).toHaveBeenCalledTimes(3);
});

it("does not fetch additional pages for an empty catalog", async () => {
  vi.mocked(apiFetch).mockResolvedValue({ items: [], pagination: { total: 0, limit: 100 } });
  expect((await refreshCatalogProducts()).items).toEqual([]);
  expect(apiFetch).toHaveBeenCalledTimes(1);
});
