// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { UiProduct } from "../model";
import { LatestProductCarousel } from "./LatestProductCarousel";

const products: UiProduct[] = Array.from({ length: 6 }, (_, index) => ({ id: String(index + 1), nm: `Product ${index + 1}`, brand: "Example Brand", g: "", price: "₹500", sw: 0 }));
function open() { return render(<MemoryRouter><LatestProductCarousel id="latest" title="The latest in Electronics & Gadgets" products={products} home="/app/catalog" fromCatalog="/app/catalog/category/electronics-and-gadgets" viewAll="/app/catalog/category/electronics-and-gadgets?view=products" loading={false} error={null} /></MemoryRouter>); }
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("latest product carousel", () => {
  it("paginates four desktop cards with arrows and dots while retaining product links and prices", () => {
    open();
    expect(screen.getByRole("link", { name: "View Product 1" }).getAttribute("href")).toBe("/app/catalog/1");
    expect(screen.queryByRole("link", { name: "View Product 5" })).toBeNull();
    expect(screen.getAllByText("AS LOW AS")).toHaveLength(4);
    expect(screen.getAllByText("Example Brand")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Next products" }));
    expect(screen.getByRole("link", { name: "View Product 5" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "View Product 1" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next products" })).toBeNull();
    expect(screen.getByRole("button", { name: "Go to product page 2" }).getAttribute("aria-current")).toBe("page");
    fireEvent.click(screen.getByRole("button", { name: "Previous products" }));
    expect(screen.getByRole("link", { name: "View Product 1" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Go to product page 2" }));
    expect(screen.getByText("Products 5 to 6 of 6")).toBeTruthy();
  });

  it("shows two cards per mobile page and supports swipe navigation", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
    const { container } = open();
    expect(screen.getAllByText("AS LOW AS")).toHaveLength(2);
    const body = container.querySelector(".sm-latest-carousel__body")!;
    fireEvent.touchStart(body, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(body, { changedTouches: [{ clientX: 60 }] });
    expect(screen.getByRole("link", { name: "View Product 3" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "View Product 1" })).toBeNull();
    expect(screen.getByText("Products 3 to 4 of 6")).toBeTruthy();
  });
});
