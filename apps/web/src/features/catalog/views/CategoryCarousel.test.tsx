// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CategoryCarousel } from "./CategoryCarousel";

const carousel = vi.hoisted(() => {
  let page = 0;
  const listeners = new Map<string, Set<() => void>>();
  const select = (next: number) => {
    page = next;
    listeners.get("select")?.forEach((listener) => listener());
  };
  return {
    reset: () => { page = 0; listeners.clear(); },
    ref: () => {},
    api: {
      scrollSnapList: () => [0, 0.5, 1],
      selectedScrollSnap: () => page,
      canScrollNext: () => page < 2,
      canScrollPrev: () => page > 0,
      scrollNext: () => select(Math.min(2, page + 1)),
      scrollPrev: () => select(Math.max(0, page - 1)),
      scrollTo: select,
      on: (event: string, listener: () => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(listener);
      },
      off: (event: string, listener: () => void) => { listeners.get(event)?.delete(listener); },
    },
  };
});
vi.mock("embla-carousel-react", () => ({ default: () => [carousel.ref, carousel.api] }));
afterEach(() => { cleanup(); carousel.reset(); });

describe("category carousel controls", () => {
  it("enables the back arrow after advancing and updates both arrows when selecting pages", () => {
    render(<CategoryCarousel title="Choose your style" viewAllLabel="All categories" items={[]} onViewAll={() => {}} onSelect={() => {}} />);
    const previous = screen.getByRole("button", { name: "Previous categories" }) as HTMLButtonElement;
    const next = screen.getByRole("button", { name: "Next categories" }) as HTMLButtonElement;
    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    fireEvent.click(next);
    expect(previous.disabled).toBe(false);
    expect(next.disabled).toBe(false);
    fireEvent.click(next);
    expect(next.disabled).toBe(true);
    expect(previous.disabled).toBe(false);
    fireEvent.click(previous);
    expect(next.disabled).toBe(false);
    expect(screen.getByRole("tab", { name: "Show page 2" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Show page 1" }));
    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(false);
  });
});
