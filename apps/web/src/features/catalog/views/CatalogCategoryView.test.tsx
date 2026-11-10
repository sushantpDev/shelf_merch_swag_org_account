// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router";
import { CatalogCategoryView } from "./CatalogCategoryView";
import { CatalogBrowseView } from "./CatalogBrowseView";
import { Header } from "../../../components/landing/Header";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FALLBACK_CATALOG_NODES, resolveCatalogBrowseTarget } from "../types";
import type { CatalogVm } from "../controllers/useCatalogController";
import type { UiProduct } from "../model";

vi.mock("../controllers/useCatalogKitsController", () => ({
  useCatalogKitsController: () => ({ allKits: [], kits: [], isLoading: false }),
}));
vi.mock("./CatalogKitsGrid", () => ({ CatalogKitsGrid: () => null }));

const products: UiProduct[] = [
  { id: "tee1", g: "", brand: "Cotton Co", nm: "Classic Tee", category: "Apparel", subcategory: "Apparel", childCategory: "T-Shirts", price: "₹500", basePriceInr: 500, sw: 1, colors: ["Black"], variants: [{ size: "M", color: "Black", material: "Cotton" }] },
  { id: "tee2", g: "", brand: "Everyday", nm: "Premium Tee", category: "Apparel", subcategory: "Apparel", childCategory: "T-Shirts", price: "₹900", basePriceInr: 900, sw: 1, colors: ["Blue"], variants: [{ size: "L", color: "Blue", material: "Cotton" }] },
  { id: "polo", g: "", brand: "Cotton Co", nm: "Team Polo", category: "Apparel", subcategory: "Apparel", childCategory: "Polo Shirts", price: "₹700", sw: 0 },
  { id: "mug", createdAt: "2025-01-01T00:00:00Z", g: "", brand: "", nm: "Ceramic Mug", category: "Accessories", subcategory: "Drinkware", childCategory: "Mugs", price: "₹300", sw: 0 },
  { id: "bottle", createdAt: "2026-01-01T00:00:00Z", g: "", brand: "", nm: "Blue Bottle", category: "Accessories", subcategory: "Drinkware", childCategory: "Bottles", price: "₹500", sw: 0 },
  { id: "diary", g: "", brand: "", nm: "Linen Diary", category: "Accessories", subcategory: "Stationery", childCategory: "Diaries", price: "₹400", sw: 0 },
  { id: "pen", g: "", brand: "", nm: "Metal Pen", category: "Accessories", subcategory: "Stationery", childCategory: "Pens & Pencils", price: "₹200", sw: 0 },
  { id: "tote", g: "", brand: "", nm: "Canvas Tote", category: "Accessories", subcategory: "Bags", childCategory: "Totes", price: "₹400", sw: 0 },
  { id: "laptop-bag", g: "", brand: "", nm: "Work Laptop Bag", category: "Accessories", subcategory: "Bags", childCategory: "Laptop Bags", price: "₹1200", sw: 0 },
  { id: "generic-bag", g: "", brand: "", nm: "Everyday Carry", category: "Accessories", subcategory: "Bags", price: "₹800", sw: 0 },
  { id: "massager", g: "", brand: "", nm: "Neck & Shoulder Massager", category: "Accessories", subcategory: "Travel Accessories", price: "₹1500", sw: 0 },
  { id: "toaster", g: "", brand: "", nm: "Pop-Up Toaster", category: "Home & Living", subcategory: "Kitchenware", price: "₹1800", sw: 0 },
  { id: "kettle", g: "", brand: "", nm: "Glass Kettle", category: "Home & Living", subcategory: "Kitchenware", price: "₹1400", sw: 0 },
  { id: "vacuum", g: "", brand: "", nm: "Stick Vacuum", category: "Home & Living", subcategory: "Home Appliances", price: "₹4000", sw: 0 },
  { id: "steamer", g: "", brand: "", nm: "Garment Steamer", category: "Home & Living", subcategory: "Home Appliances", price: "₹2000", sw: 0 },
  { id: "charger", g: "", brand: "", nm: "Wireless Charging Dock", category: "Accessories", subcategory: "Electronics & Gadgets", categoryLabels: ["Accessories", "Electronics & Gadgets", "Gadgets", "Wireless Chargers"], price: "₹1400", sw: 0 },
  { id: "tech-pouch", g: "", brand: "", nm: "Cable Organiser", category: "Accessories", subcategory: "Electronics & Gadgets", categoryLabels: ["Accessories", "Electronics & Gadgets", "Gadget Organisers"], price: "₹600", sw: 0 },
];

const categoryNodes = [...FALLBACK_CATALOG_NODES.map((node) => node.name !== "Accessories" ? node : {
  ...node, children: node.children.map((child) => child.name !== "Electronics & Gadgets" ? child : {
    ...child, slug: "electronics-gadgets", children: [
      { name: "Gadgets", slug: "gadgets", children: [] },
      { name: "Gadget Organisers", slug: "gadget-organisers", children: [] },
    ],
  }),
}), {
  name: "Home & Living", slug: "home-living", children: [
    { name: "Kitchenware", slug: "kitchenware", children: [] },
    { name: "Home Appliances", slug: "home-appliances", children: [] },
  ],
}];

function Page() {
  const { category } = useParams();
  const browse = resolveCatalogBrowseTarget(category, categoryNodes);
  const vm: CatalogVm = {
    ...browse, isCategorySelected: true, categories: categoryNodes.map((node) => node.name),
    categoryNodes,
    categoriesByParent: Object.fromEntries(categoryNodes.map((node) => [node.name, node.children])),
    subcategoriesByCategory: {}, items: browse.parent === "All Products" ? products : products.filter((product) => product.category === browse.parent),
    stylePreviewProducts: [], count: products.length, isSkeleton: false, errorMessage: null, onCategory: vi.fn(),
  };
  return category ? <CatalogCategoryView {...vm} /> : <CatalogBrowseView {...vm} />;
}

function open(path = "/apps/catalog/category/apparel") {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/apps/catalog/category/:category" element={<Page />} /><Route path="/app/catalog/category/:category" element={<Page />} /></Routes></MemoryRouter>);
}
afterEach(cleanup);

describe("category shopping flow", () => {
  it.each(["/app/catalog", "/apps/catalog"])("returns to category overview from Apparel navigation under %s", (home) => {
    render(<MemoryRouter initialEntries={[`${home}/category/apparel`]}><Routes>
      <Route path={`${home}/category/:category`} element={<><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { enabled: false } } })}><Header /></QueryClientProvider><Page /></>} />
      <Route path={`${home}/browse`} element={<Page />} />
    </Routes></MemoryRouter>);
    const headerCatalog = within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Catalog" });
    const breadcrumbCatalog = within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("link", { name: "Catalog" });
    expect(breadcrumbCatalog.getAttribute("href")).toBe(`${home}/browse`);
    expect(headerCatalog.getAttribute("href")).toBe(`${home}/browse`);
    fireEvent.click(headerCatalog);
    expect(screen.getByRole("heading", { name: "Catalog" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "All Products" })).toBeTruthy();
    const kitsLinks = screen.getAllByRole("link", { name: "Kits" });
    expect(kitsLinks).toHaveLength(2);
    for (const link of kitsLinks) expect(link.getAttribute("href")).toBe(`${home}/category/kits`);
  });
  it.each(["/app/catalog", "/apps/catalog"])("opens every product from the All Products tile under %s", (home) => {
    render(<MemoryRouter initialEntries={[`${home}/browse`]}><Routes>
      <Route path={`${home}/browse`} element={<Page />} />
      <Route path={`${home}/category/:category`} element={<Page />} />
    </Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole("link", { name: "All Products" }));
    const listing = screen.getByRole("region", { name: "All Products products" });
    expect(within(listing).getByRole("heading", { name: "All Products" })).toBeTruthy();
    expect(within(listing).getByRole("status").textContent).toBe(`${products.length} products`);
    for (const product of products) expect(within(listing).getByText(product.nm)).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Classic Tee" } });
    expect(within(listing).getByRole("status").textContent).toBe("1 product");
  });
  it.each(["/app/catalog", "/apps/catalog"])("supports Electronics groups, featured products and both category slugs under %s", (home) => {
    open(`${home}/category/electronics-gadgets`);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Electronics & Gadgets");
    const featured = screen.getByRole("region", { name: "The latest in Electronics & Gadgets" });
    expect(within(featured).getByRole("link", { name: "View Wireless Charging Dock" }).getAttribute("href")).toBe(`${home}/charger`);
    expect(within(featured).queryByRole("link", { name: "View Linen Diary" })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Gadgets category Gadgets" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Gadgets");
    expect(screen.getByRole("link", { name: "View Wireless Charging Dock" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "View Cable Organiser" })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Electronics & Gadgets" }));
    fireEvent.click(screen.getByRole("link", { name: "View all Electronics & Gadgets" }));
    expect(screen.getByRole("status").textContent).toBe("2 products");
    expect(screen.getByRole("link", { name: "View Cable Organiser" })).toBeTruthy();
  });
  it.each(["/app/catalog", "/apps/catalog"])("keeps Home Appliances separate from Kitchenware under %s", (home) => {
    open(`${home}/category/home-appliances`);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Home Appliances");
    const collection = screen.getByRole("region", { name: "Home Appliances collection" });
    expect(within(collection).getByRole("link", { name: "View Stick Vacuum" }).getAttribute("href")).toBe(`${home}/vacuum`);
    expect(within(collection).queryByRole("link", { name: "View Pop-Up Toaster" })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "View all Home Appliances" }));
    expect(screen.getByRole("status").textContent).toBe("2 products");
    expect(screen.getByRole("link", { name: "View Garment Steamer" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "View Glass Kettle" })).toBeNull();
  });
  it.each(["/app/catalog", "/apps/catalog"])("shows the Kitchenware landing and scopes all products under %s", (home) => {
    open(`${home}/category/kitchenware`);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Kitchenware");
    const collection = screen.getByRole("region", { name: "Kitchenware collection" });
    expect(within(collection).getByRole("link", { name: "View Pop-Up Toaster" }).getAttribute("href")).toBe(`${home}/toaster`);
    expect(within(collection).queryByRole("link", { name: "View Stick Vacuum" })).toBeNull();
    expect(screen.getByRole("link", { name: /Explore custom kits/ }).getAttribute("href")).toBe(`${home}/category/kits`);
    fireEvent.click(screen.getByRole("link", { name: "View all Kitchenware" }));
    expect(screen.getByRole("status").textContent).toBe("2 products");
    expect(screen.getByRole("link", { name: "View Glass Kettle" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "View Stick Vacuum" })).toBeNull();
  });
  it.each(["/app/catalog", "/apps/catalog"])("opens the flat Travel Accessories collection and its products under %s", (home) => {
    open(`${home}/category/travel-accessories`);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Travel Accessories");
    const essentials = screen.getByRole("region", { name: "Travel essentials" });
    expect(within(essentials).getByRole("link", { name: "View Neck & Shoulder Massager" }).getAttribute("href")).toBe(`${home}/massager`);
    expect(within(essentials).queryByRole("link", { name: "View Ceramic Mug" })).toBeNull();
    expect(screen.getByRole("link", { name: /Explore custom kits/ }).getAttribute("href")).toBe(`${home}/category/kits`);
    fireEvent.click(screen.getByRole("link", { name: "View all Travel Accessories" }));
    expect(screen.getByRole("status").textContent).toBe("1 product");
    expect(screen.getByRole("link", { name: "View Neck & Shoulder Massager" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "View Work Laptop Bag" })).toBeNull();
  });
  it.each(["/app/catalog", "/apps/catalog"])("supports Bags types, promotions and all products under %s", (home) => {
    open(`${home}/category/bags`);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Bags");
    expect(screen.queryByRole("link", { name: "Bags category Bags" })).toBeNull();
    expect(screen.getByRole("link", { name: /Shop by use case/ }).getAttribute("href")).toBe("/request-demo");
    expect(screen.getByRole("link", { name: /Explore swag management/ }).getAttribute("href")).toBe("/platform");
    expect(screen.getByRole("link", { name: /Explore custom kits/ }).getAttribute("href")).toBe(`${home}/category/kits`);
    fireEvent.click(screen.getByRole("link", { name: "Totes category Totes" }));
    expect(screen.getByRole("link", { name: "View Canvas Tote" }).getAttribute("href")).toBe(`${home}/tote`);
    expect(screen.queryByRole("link", { name: "View Work Laptop Bag" })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Bags" }));
    fireEvent.click(screen.getByRole("link", { name: "View all Bags" }));
    expect(screen.getByRole("status").textContent).toBe("3 products");
    expect(screen.getByRole("link", { name: "View Everyday Carry" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "View Ceramic Mug" })).toBeNull();
  });
  it.each(["/app/catalog", "/apps/catalog"])("shows real Drinkware arrivals and opens newest products under %s", (home) => {
    open(`${home}/category/drinkware`);
    const latest = screen.getByRole("region", { name: "The latest in Drinkware" });
    expect(within(latest).getAllByRole("link", { name: /View (Blue Bottle|Ceramic Mug)/ }).map((link) => link.getAttribute("href"))).toEqual([`${home}/bottle`, `${home}/mug`]);
    expect(within(latest).queryByRole("link", { name: "View Linen Diary" })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: /New arrivals/ }));
    expect(screen.getByRole("combobox", { name: "Sort by" }).textContent).toBe("Newest arrivals");
    expect(screen.getByRole("status").textContent).toBe("2 products");
    const results = screen.getByRole("region", { name: "Drinkware products" });
    expect(within(results).getAllByRole("link")[0].getAttribute("href")).toBe(`${home}/bottle`);
  });
  it.each(["/app/catalog", "/apps/catalog"])("supports the Stationery editorial flow under %s", (home) => {
    open(`${home}/category/stationery`);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Stationery");
    expect(screen.getByRole("link", { name: /Explore custom kits/ }).getAttribute("href")).toBe(`${home}/category/kits`);
    fireEvent.click(screen.getByRole("link", { name: "Diaries category Diaries" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Diaries");
    expect(screen.getByRole("link", { name: "View Linen Diary" }).getAttribute("href")).toBe(`${home}/diary`);
    expect(screen.queryByRole("link", { name: "View Metal Pen" })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Stationery" }));
    fireEvent.click(screen.getByRole("link", { name: "View all Stationery" }));
    expect(screen.getByRole("status").textContent).toBe("2 products");
    expect(screen.queryByRole("link", { name: "View Ceramic Mug" })).toBeNull();
  });
  it.each(["/app/catalog", "/apps/catalog"])("keeps the Accessories overview distinct from Stationery under %s", (home) => {
    open(`${home}/category/accessories`);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Accessories");
    expect(screen.queryByRole("link", { name: "View all Stationery" })).toBeNull();
    const overviewNavigation = screen.getByRole("navigation", { name: "Product types" });
    fireEvent.click(within(overviewNavigation).getByRole("link", { name: "Stationery" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Stationery");
    const stationeryNavigation = screen.getByRole("navigation", { name: "Product types" });
    expect(within(stationeryNavigation).getByRole("link", { name: "All Stationery" })).toBeTruthy();
    expect(within(stationeryNavigation).getByRole("link", { name: "Diaries" })).toBeTruthy();
    expect(within(stationeryNavigation).getByRole("link", { name: "Pens & Pencils" })).toBeTruthy();
    for (const name of ["Bags", "Travel Accessories", "Drinkware", "Electronics & Gadgets"]) {
      expect(within(stationeryNavigation).queryByRole("link", { name })).toBeNull();
    }
    expect(screen.queryByRole("link", { name: "Bags category Bags" })).toBeNull();
  });
  it("opens T-Shirts from the Apparel image card and shows only T-shirts", () => {
    open();
    fireEvent.click(screen.getByRole("link", { name: "T-Shirts category T-Shirts" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("T-Shirts");
    expect(screen.getByRole("status").textContent).toBe("2 products");
    expect(screen.queryByRole("link", { name: "View Team Polo" })).toBeNull();
    expect(screen.getByRole("link", { name: "View Classic Tee" }).getAttribute("href")).toBe("/apps/catalog/tee1");
    fireEvent.click(screen.getByRole("link", { name: "Polo Shirts" }));
    expect(screen.getByRole("link", { name: "View Team Polo" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "View Classic Tee" })).toBeNull();
  });

  it("supports search, price sorting, attribute filters and clearing", () => {
    open("/apps/catalog/category/t-shirts");
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Sort by" }), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("option", { name: "Price: high to low" }), { key: "Enter" });
    const results = screen.getByRole("region", { name: "T-Shirts products" });
    expect(within(results).getAllByRole("link")[0].textContent).toContain("Premium Tee");
    fireEvent.click(screen.getByRole("checkbox", { name: "Black" }));
    expect(screen.getByRole("status").textContent).toBe("1 product");
    expect(screen.queryByRole("link", { name: "View Premium Tee" })).toBeNull();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no such tee" } });
    expect(screen.getByRole("heading", { name: "No products found" })).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
    expect(screen.getByRole("status").textContent).toBe("2 products");
    fireEvent.change(screen.getByRole("spinbutton", { name: "Max" }), { target: { value: "600" } });
    expect(screen.getByRole("status").textContent).toBe("1 product");
  });

  it("View all Apparel opens products rather than category cards", () => {
    open();
    fireEvent.click(screen.getByRole("link", { name: "View all Apparel" }));
    expect(screen.getByRole("status").textContent).toBe("3 products");
    expect(screen.getByRole("link", { name: "View Team Polo" })).toBeTruthy();
  });

  it("supports the same flow for Drinkware and Mugs", () => {
    open("/apps/catalog/category/drinkware");
    fireEvent.click(screen.getByRole("link", { name: "Mugs category Mugs" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Mugs");
    expect(screen.getByRole("link", { name: "View Ceramic Mug" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "View Classic Tee" })).toBeNull();
  });
});
