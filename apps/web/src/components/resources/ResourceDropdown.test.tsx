// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ResourceDropdown } from "./ResourceDropdown";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function open(desktop = true) {
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: desktop } as MediaQueryList);
  const navigate = vi.fn();
  render(<MemoryRouter><ResourceDropdown onNavigate={navigate} /></MemoryRouter>);
  return navigate;
}
describe("Resources mega menu", () => {
  it("opens on hover and links to the existing resource pages and catalog", () => {
    const navigate = open();
    const trigger = screen.getByRole("link", { name: "Resources" });
    fireEvent.mouseEnter(trigger.closest(".resources-dropdown")!);
    expect(screen.getByRole("navigation", { name: "Resource library" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Resources by team" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Case study" }).getAttribute("href")).toBe("/case-studies/zoho-people");
    expect(screen.getByRole("link", { name: "Human Resource" }).getAttribute("href")).toBe("/resources/human-resources");
    expect(screen.getByRole("link", { name: "Explore the catalog" }).getAttribute("href")).toBe("/app/catalog/browse");
    fireEvent.click(screen.getByRole("link", { name: "Human Resource" }));
    expect(navigate).toHaveBeenCalledOnce();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
  it("supports keyboard focus, Escape and outside clicks", () => {
    open();
    const trigger = screen.getByRole("link", { name: "Resources" });
    fireEvent.focus(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.pointerDown(document.body);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
  it("expands on mobile using a separate toggle", () => {
    open(false);
    const trigger = screen.getByRole("link", { name: "Resources" });
    fireEvent.focus(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Toggle resources" }));
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Toggle resources" }));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});
