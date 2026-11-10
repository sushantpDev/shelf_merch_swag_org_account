// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import type { UiProduct } from "../model";
import { FeaturedCatalogProducts, selectFeaturedProducts } from "./FeaturedCatalogProducts";

const makeProduct = (id: string, category: string): UiProduct => ({ id, nm: `Product ${id}`, category: category === "Apparel" ? "Apparel" : "Accessories", subcategory: category, photoUrl: `/products/${id}.png`, brand: "Shelf Merch", g: "", price: "₹410", basePriceInr: 410, sw: 0 });
const products = [makeProduct("tee", "Apparel"), makeProduct("tee2", "Apparel"), makeProduct("bottle", "Drinkware"), makeProduct("diary", "Stationery"), makeProduct("speaker", "Electronics & Gadgets"), makeProduct("bag", "Bags")];
afterEach(cleanup);

describe("featured catalog products", () => {
  it("prefers the bamboo speaker and tote bag for the last two slots", () => {
    const speaker = { ...makeProduct("6a8c3ff29d19e345e7c3f5a2", "Electronics & Gadgets"), nm: "Bamboo Bluetooth Speaker" };
    const tote = { ...makeProduct("6a69a2a228d51c137c8e962b", "Bags"), nm: "Customized Tote Bag" };
    expect(selectFeaturedProducts([...products, tote, speaker]).map((product) => product.id))
      .toEqual(["tee", "bottle", "diary", speaker.id, tote.id]);
  });
  it("replaces pen packaging with the live Glimmer Diary, with a fallback when unavailable", () => {
    const packaging = makeProduct("6a82b7e5a03ad62bdb7f3c23", "Stationery");
    const glimmer = { ...makeProduct("6a69a2b128d51c137c8e964b", "Stationery"), nm: "Glimmer Diary" };
    expect(selectFeaturedProducts([packaging, ...products, glimmer])[2]).toBe(glimmer);
    expect(selectFeaturedProducts([packaging, ...products])[2].id).toBe("diary");
    expect(selectFeaturedProducts([packaging])).toEqual([]);
  });
  it("replaces the vacuum and massager with other live products, including during fallback selection", () => {
    const vacuum = { ...makeProduct("6ac49be66f87655fa994cfb0", "Home Appliances"), nm: "2-in-1 Stick & Handy Vacuum Cleaner with Hepa Filter" };
    const massager = { ...makeProduct("6abb6a21d602f72fd2df9100", "Travel Accessories"), nm: "Neck & Shoulder Massager" };
    expect(selectFeaturedProducts([vacuum, massager, ...products]).map((product) => product.id))
      .toEqual(["tee", "bottle", "diary", "speaker", "bag"]);
    expect(selectFeaturedProducts([vacuum, massager])).toEqual([]);
  });
  it("selects five distinct live products across categories instead of the first five from one category", () => {
    expect(selectFeaturedProducts(products).map((product) => product.id)).toEqual(["tee", "bottle", "diary", "speaker", "bag"]);
    expect(selectFeaturedProducts([products[0], products[0], products[1]]).map((product) => product.id)).toEqual(["tee", "tee2"]);
    expect(selectFeaturedProducts([{ ...products[0], id: undefined }])).toHaveLength(0);
  });
  it.each(["/app/catalog", "/apps/catalog"])("shows actual product details and working product/collection links under %s", (home) => {
    render(<MemoryRouter initialEntries={[home]}><Routes>
      <Route path={home} element={<FeaturedCatalogProducts products={products} />} />
      <Route path={`${home}/tee`} element={<h1>Selected product detail</h1>} />
    </Routes></MemoryRouter>);
    expect(screen.getAllByRole("img")).toHaveLength(5);
    expect(screen.getAllByText("SHELF MERCH", { exact: false })).toHaveLength(5);
    expect(screen.getAllByText("410")).toHaveLength(5);
    expect(screen.getByRole("link", { name: "Browse all products" }).getAttribute("href")).toBe(`${home}/category/all-products`);
    const productLink = screen.getByRole("link", { name: "View Product tee" });
    expect(productLink.getAttribute("href")).toBe(`${home}/tee`);
    fireEvent.click(productLink);
    expect(screen.getByRole("heading", { name: "Selected product detail" })).toBeTruthy();
  });
  it("handles loading and failure without displaying invented products", () => {
    const { rerender } = render(<MemoryRouter><FeaturedCatalogProducts products={[]} loading /></MemoryRouter>);
    expect(screen.getByLabelText("Loading catalog products")).toBeTruthy();
    rerender(<MemoryRouter><FeaturedCatalogProducts products={[]} error="Could not load products" /></MemoryRouter>);
    expect(screen.getByRole("alert").textContent).toBe("Could not load products");
    expect(screen.queryByRole("img")).toBeNull();
  });
});
