// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { flatCategories, flatProducts } from "../catalogPresentationTree.fixtures";
import { useCatalogController } from "../controllers/useCatalogController";
import { CatalogCategoryView } from "./CatalogCategoryView";
import { CatalogBrowseView } from "./CatalogBrowseView";

vi.mock("@/hooks/useWorkspace", () => ({ useWorkspace: () => ({ data: undefined }) }));
vi.mock("@/services/api-bridge", async (original) => ({
  ...await original<typeof import("@/services/api-bridge")>(),
  fetchPublicCatalogCategories: async () => flatCategories,
  refreshCatalogProducts: async () => ({ items: flatProducts, total: flatProducts.length }),
}));
vi.mock("../controllers/useCatalogKitsController", () => ({
  useCatalogKitsController: () => ({ allKits: [], kits: [], isLoading: false }),
}));
vi.mock("./CatalogKitsGrid", () => ({ CatalogKitsGrid: () => null }));

function Category() { return <CatalogCategoryView {...useCatalogController()} />; }
function Browse() { return <CatalogBrowseView {...useCatalogController()} />; }
function open(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/app/catalog/category/:category" element={<Category />} />
    <Route path="/app/catalog/browse" element={<Browse />} />
  </Routes></MemoryRouter></QueryClientProvider>);
  return { ...result, client };
}
afterEach(cleanup);

describe("production category tree through the real controller", () => {
  it.each([
    ["apparel", "Apparel", "apparel-editorial", "Team Tee"],
    ["bags", "Bags", "bags-editorial", "Laptop Backpack"],
    ["drinkware", "Drinkware", "drinkware-editorial", "Ceramic Mug"],
    ["office", "Office", "stationery-editorial", "Linen Diary"],
    ["technology", "Technology", "electronics-editorial", "Wireless Dock"],
  ])("renders the designed %s banner, then opens only that collection's products", async (slug, name, imageFolder, productName) => {
    const { container, client } = open(`/app/catalog/category/${slug}`);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(name));
    await waitFor(() => expect(container.querySelector('.sm-cat-page__hero-visual img')?.getAttribute('src')).toContain(imageFolder));
    fireEvent.click(screen.getByRole("link", { name: `View all ${name}` }));
    const listing = await screen.findByRole("region", { name: `${name} products` });
    await waitFor(() => expect(within(listing).getByRole("status").textContent).toBe("1 product"));
    expect(within(listing).getByRole("link", { name: `View ${productName}` })).toBeTruthy();
    for (const other of flatProducts.filter((p) => p.nm !== productName)) {
      expect(within(listing).queryByRole("link", { name: `View ${other.nm}` })).toBeNull();
    }
    client.clear();
  });

  it("keeps Office product-type links and the real flat overview names", async () => {
    const { client } = open("/app/catalog/category/office");
    await screen.findByRole("link", { name: "Diaries category Diaries" });
    fireEvent.click(screen.getByRole("link", { name: "Diaries category Diaries" }));
    const listing = await screen.findByRole("region", { name: "Diaries products" });
    expect(within(listing).getByRole("link", { name: "View Linen Diary" })).toBeTruthy();
    fireEvent.click(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("link", { name: "Catalog" }));
    await screen.findByRole("heading", { name: "Catalog" });
    for (const name of ["Apparel", "Bags", "Drinkware", "Office", "Technology", "Kits"]) {
      expect(screen.getAllByRole("link", { name }).length).toBeGreaterThan(0);
    }
    expect(screen.queryByRole("link", { name: "Kitchenware" })).toBeNull();
    client.clear();
  });
});
