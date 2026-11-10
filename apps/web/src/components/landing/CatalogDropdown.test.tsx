// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { CatalogDropdown } from "./CatalogDropdown";

vi.mock("@/features/catalog/model", () => ({ useCatalogCategoryTree: () => ({ data: [
  { name: "Apparel", slug: "apparel", children: [{ name: "Apparel", slug: "apparel", children: [{ name: "Crew Neck", slug: "crew-neck", children: [] }] }] },
  { name: "Accessories", slug: "accessories", children: [{ name: "Stationery", slug: "stationery", children: [{ name: "Diaries", slug: "diaries", children: [] }] }] },
] }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function open(desktop = true, home = "/app/catalog") {
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: desktop } as MediaQueryList);
  const navigate = vi.fn();
  render(<MemoryRouter initialEntries={[`${home}/browse`]}><CatalogDropdown onNavigate={navigate} /></MemoryRouter>);
  return navigate;
}
describe("Catalog mega menu", () => {
  it("opens the catalog landing page when Catalog is clicked from Home", () => {
    render(<MemoryRouter initialEntries={["/"]}><Routes>
      <Route path="/" element={<CatalogDropdown onNavigate={() => {}} />} />
      <Route path="/app/catalog" element={<h1>Catalog landing</h1>} />
    </Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole("link", { name: "Catalog" }));
    expect(screen.getByRole("heading", { name: "Catalog landing" })).toBeTruthy();
  });
  it.each(["/app/catalog", "/apps/catalog"])("opens on hover, changes category previews, and uses real category links under %s", (home) => {
    const navigate = open(true, home);
    const trigger = screen.getByRole("link", { name: "Catalog" });
    fireEvent.mouseEnter(trigger.parentElement!.parentElement!);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: "Crew Neck" }).getAttribute("href")).toBe(`${home}/category/crew-neck`);
    const categories = screen.getByRole("navigation", { name: "Catalog categories" });
    fireEvent.mouseEnter(within(categories).getByRole("link", { name: "Stationery" }));
    expect(screen.getByRole("img", { name: "Stationery" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Diaries" }).getAttribute("href")).toBe(`${home}/category/diaries`);
    fireEvent.click(screen.getByRole("link", { name: "Diaries" }));
    expect(navigate).toHaveBeenCalledOnce();
    expect(screen.queryByRole("navigation", { name: "Catalog categories" })).toBeNull();
  });
  it("opens through keyboard focus and closes with Escape or an outside pointer", () => {
    open();
    const trigger = screen.getByRole("link", { name: "Catalog" });
    fireEvent.focus(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.pointerDown(document.body);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
  it("expands using the mobile toggle while preserving the Catalog destination", () => {
    open(false);
    const trigger = screen.getByRole("link", { name: "Catalog" });
    fireEvent.focus(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("href")).toBe("/app/catalog/browse");
    fireEvent.click(screen.getByRole("button", { name: "Toggle catalog categories" }));
    expect(screen.getByRole("navigation", { name: "Catalog categories" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Toggle catalog categories" }));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});
