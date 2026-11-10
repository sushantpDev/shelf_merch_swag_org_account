// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CopilotWelcome } from "./CopilotWelcome";
import { discoveryCategories } from "./discovery.testFixtures";

afterEach(cleanup);
function Discovery({ onPrompt }: { onPrompt: (prompt: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <CopilotWelcome
      categories={discoveryCategories}
      selectedCategoryId={selected}
      onCategory={setSelected}
      onPrompt={onPrompt}
    />
  );
}
describe("Capability discovery", () => {
  it("opens a category before offering a prompt and lets users return to all capabilities", () => {
    const onPrompt = vi.fn();
    render(<Discovery onPrompt={onPrompt} />);
    expect(screen.queryByRole("button", { name: "Explore products" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Stores & Collections" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Products & Kits" }));
    expect(onPrompt).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "What would you like to explore?" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Explore products" }));
    expect(onPrompt).toHaveBeenCalledExactlyOnceWith("Show apparel");
    fireEvent.click(screen.getByRole("button", { name: "All capabilities" }));
    expect(screen.getByRole("button", { name: "Budgets & Wallet" })).toBeTruthy();
  });
  it("marks pending actions without inserting an executable prompt", () => {
    const onPrompt = vi.fn();
    render(<Discovery onPrompt={onPrompt} />);
    fireEvent.click(screen.getByRole("button", { name: "Budgets & Wallet" }));
    const pending = screen.getByRole("button", { name: "Allocate budget to a department" });
    expect(pending).toBeDisabled();
    expect(pending).toHaveTextContent("Coming to Copilot");
    fireEvent.click(pending);
    expect(onPrompt).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Check my available budget" }));
    expect(onPrompt).toHaveBeenCalledWith("Show my current available budget.");
  });
  it("offers a reload instead of inventing capabilities if discovery is missing", () => {
    const reload = vi.fn();
    render(
      <CopilotWelcome
        categories={[]}
        selectedCategoryId={null}
        onCategory={vi.fn()}
        onPrompt={vi.fn()}
        onReload={reload}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reload capabilities" }));
    expect(reload).toHaveBeenCalledOnce();
  });
});
