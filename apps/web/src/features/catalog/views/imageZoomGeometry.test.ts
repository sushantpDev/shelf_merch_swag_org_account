import { describe, expect, it } from "vitest";
import { imageZoomGeometry } from "./imageZoomGeometry";

const input = { imageBox: { left: 100, top: 100, width: 600, height: 600 }, frameBox: { left: 78, top: 78, width: 644, height: 644 }, naturalWidth: 1200, naturalHeight: 1200, clientX: 400, clientY: 400, viewportWidth: 1440 };
describe("product magnifier geometry", () => {
  it("aligns a two-times crop with the centre of the lens", () => {
    const result = imageZoomGeometry(input)!;
    expect(result.panel).toEqual({ left: 722, top: 78, width: 644, height: 644 });
    expect(result.lens).toEqual({ left: 139, top: 139, width: 322, height: 322 });
    expect(result.enlarged).toEqual({ width: 1200, height: 1200, left: -278, top: -278 });
  });
  it("clamps the lens at both image edges", () => {
    expect(imageZoomGeometry({ ...input, clientX: 100, clientY: 100 })!.lens.left).toBe(0);
    const edge = imageZoomGeometry({ ...input, clientX: 700, clientY: 700 })!;
    expect(edge.lens.left + edge.lens.width).toBe(600);
    expect(edge.lens.top + edge.lens.height).toBe(600);
    expect(edge.enlarged.left + edge.enlarged.width).toBe(edge.panel.width);
  });
  it("ignores portrait letterboxing and keeps the crop inside the actual image", () => {
    expect(imageZoomGeometry({ ...input, naturalWidth: 600, clientX: 110 })).toBeNull();
    const portrait = imageZoomGeometry({ ...input, naturalWidth: 600 })!;
    expect(portrait.lens.left).toBe(150);
    expect(portrait.lens.width).toBeCloseTo(300);
    expect(portrait.enlarged.width).toBeCloseTo(portrait.panel.width);
  });
  it("does not open for unloaded images or when there is no room for the preview", () => {
    expect(imageZoomGeometry({ ...input, naturalWidth: 0 })).toBeNull();
    expect(imageZoomGeometry({ ...input, viewportWidth: 900 })).toBeNull();
  });
});
