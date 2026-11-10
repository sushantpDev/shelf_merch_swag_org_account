// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProductImageMagnifier } from "./ProductImageMagnifier";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function open(matches = true) {
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches } as MediaQueryList);
  const { container } = render(<div className="catalog-pdp-main-media"><ProductImageMagnifier src="/product.png" alt="Original product photo" /></div>);
  const image = screen.getByRole("img", { name: "Original product photo" });
  Object.defineProperties(image, { naturalWidth: { value: 800, configurable: true }, naturalHeight: { value: 800, configurable: true } });
  const root = container.querySelector(".catalog-image-zoom")!;
  vi.spyOn(root, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 20, y: 20, width: 400, height: 400 }));
  vi.spyOn(container.firstElementChild!, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ width: 440, height: 440 }));
  return root;
}
describe("product image magnifier", () => {
  it("opens the enlarged crop on mouse hover, follows movement and closes on leave, Escape and scroll", () => {
    const root = open();
    const hover = () => fireEvent.pointerMove(root, { pointerType: "mouse", clientX: 220, clientY: 220 });
    hover();
    const preview = document.querySelector(".catalog-image-zoom__preview") as HTMLElement;
    expect(preview).toBeTruthy();
    expect(preview.style.left).toBe("440px");
    const crop = preview.querySelector("img")!;
    const firstPosition = crop.style.left;
    fireEvent.pointerMove(root, { pointerType: "mouse", clientX: 400, clientY: 220 });
    expect(crop.style.left).not.toBe(firstPosition);
    fireEvent.pointerLeave(root);
    expect(document.querySelector(".catalog-image-zoom__preview")).toBeNull();
    hover();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.querySelector(".catalog-image-zoom__preview")).toBeNull();
    hover();
    fireEvent.scroll(window);
    expect(document.querySelector(".catalog-image-zoom__preview")).toBeNull();
  });
  it("does not intercept touch interactions or activate on narrow screens", () => {
    const root = open();
    fireEvent.pointerMove(root, { pointerType: "touch", clientX: 220, clientY: 220 });
    expect(document.querySelector(".catalog-image-zoom__preview")).toBeNull();
    vi.mocked(window.matchMedia).mockReturnValue({ matches: false } as MediaQueryList);
    fireEvent.pointerMove(root, { pointerType: "mouse", clientX: 220, clientY: 220 });
    expect(document.querySelector(".catalog-image-zoom__preview")).toBeNull();
  });
});
