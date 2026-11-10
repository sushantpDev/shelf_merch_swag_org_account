// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopilotHistory } from "./CopilotHistory";

afterEach(cleanup);
const rows = [
  { id: "kits", title: "Welcome kits", updatedAt: "2026-11-09", createdAt: "2026-11-09" },
  { id: "budget", title: "Department budget", updatedAt: "2026-11-08", createdAt: "2026-11-08" },
];
const props = () => ({
  conversations: rows,
  activeId: "kits",
  loading: false,
  error: null,
  locked: false,
  onSelect: vi.fn(),
  onNew: vi.fn(),
  onReload: vi.fn(),
  onExpand: vi.fn(),
  onCollapse: vi.fn(),
});

describe("Copilot history navigation", () => {
  it("filters saved conversations locally and restores the list when search closes", () => {
    const actions = props();
    render(<CopilotHistory {...actions} />);
    fireEvent.click(screen.getByRole("button", { name: "Search saved conversations" }));
    const input = screen.getByRole("searchbox", { name: "Search saved chats" });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "BUDGET" } });
    expect(screen.queryByRole("button", { name: /Welcome kits/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Department budget/ }));
    expect(actions.onSelect).toHaveBeenCalledWith("budget");
    fireEvent.click(screen.getByRole("button", { name: "Close conversation search" }));
    expect(screen.getByRole("button", { name: /Welcome kits/ })).toBeTruthy();
  });
  it("keeps new chat and expansion actions working in the collapsed rail", () => {
    const actions = props();
    render(<CopilotHistory {...actions} collapsed />);
    expect(screen.queryByRole("button", { name: /Welcome kits/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    expect(actions.onNew).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Expand conversation history" }));
    expect(actions.onExpand).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Back to dashboard" })).toBeNull();
  });
  it("expands and focuses search when the search icon is used from the rail", () => {
    const actions = props();
    const view = render(<CopilotHistory {...actions} collapsed />);
    fireEvent.click(screen.getByRole("button", { name: "Search saved conversations" }));
    expect(actions.onExpand).toHaveBeenCalledOnce();
    view.rerender(<CopilotHistory {...actions} collapsed={false} />);
    expect(screen.getByRole("searchbox", { name: "Search saved chats" })).toHaveFocus();
  });
});
