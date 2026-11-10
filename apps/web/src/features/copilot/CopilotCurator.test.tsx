// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { CuratorIntro, CuratorRecommendations, CuratorToolbar } from "./CopilotCurator";
import { shortlistSummary, type Curation, type CuratorItem } from "./curatorTypes";
const item: CuratorItem = { key: "product:one", id: "one", kind: "product", name: "Desk lamp", source: "shelfmerch", price: 1000, currency: "INR", availability: "In stock", imageUrl: "https://official.test/lamp.jpg" };
const curation: Curation = { brief: { company: "Toast", recipients: 10, budgetPerRecipient: 3000, currency: "INR", exclusions: ["mugs"], source: "shelfmerch" }, concepts: [{ id: "c1", name: "Day one", rationale: "Useful from the first day", packaging: "Reusable box", kind: "catalog_combination", items: [item], knownPerRecipient: 1000, completePrice: true, estimatedTotal: 10000, overBudget: false }], suggestions: ["Show different products"], externalResearchAvailable: false, imageGenerationAvailable: false };
afterEach(cleanup);
describe("gifting curator UI", () => {
  it("offers editable starter drafts without sending", () => {
    const onDraft = vi.fn(); render(<CuratorIntro onDraft={onDraft} />);
    fireEvent.click(screen.getByRole("button", { name: "Welcome kits for new employees" }));
    expect(onDraft).toHaveBeenCalledWith("Welcome kits for new employees");
  });
  it("selects, compares, removes and totals actual products", () => {
    render(<MemoryRouter><CuratorRecommendations curation={curation} busy={false} onDraft={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole("img", { name: "Desk lamp" })).toHaveAttribute("src", "https://official.test/lamp.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Select Desk lamp" }));
    expect(screen.getByLabelText("Gift shortlist")).toHaveTextContent("₹10,000");
    expect(screen.getByLabelText("Gift shortlist")).toHaveTextContent("₹2,000 under budget");
    fireEvent.click(screen.getByRole("button", { name: "Compare selected items" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Desk lamp" }));
    expect(screen.queryByLabelText("Gift shortlist")).not.toBeInTheDocument();
  });
  it("retains partial estimates and separates currencies", () => {
    expect(shortlistSummary([item, { ...item, key: "idea", price: null, currency: null }], curation.brief)).toEqual({ totals: { INR: 1000 }, missing: 1, difference: null });
    expect(shortlistSummary([item, { ...item, key: "usd", price: 20, currency: "USD" }], curation.brief)).toEqual({ totals: { INR: 1000, USD: 20 }, missing: 0, difference: null });
  });
  it("drafts source changes and refinements, and supports normal chat", () => {
    const onDraft = vi.fn(); const onExit = vi.fn();
    render(<><CuratorToolbar onExit={onExit} busy={false} /><MemoryRouter><CuratorRecommendations curation={curation} busy={false} onDraft={onDraft} /></MemoryRouter></>);
    fireEvent.click(screen.getByRole("button", { name: "Beyond ShelfMerch" }));
    expect(onDraft).toHaveBeenCalledWith(expect.stringContaining("outside ShelfMerch"));
    fireEvent.click(screen.getByRole("button", { name: "Show different products" }));
    expect(onDraft).toHaveBeenCalledWith("Show different products");
    fireEvent.click(screen.getByRole("button", { name: /Normal Copilot/ })); expect(onExit).toHaveBeenCalledOnce();
  });
});
