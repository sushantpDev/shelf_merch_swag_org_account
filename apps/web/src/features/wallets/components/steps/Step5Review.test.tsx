/** @vitest-environment happy-dom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { seedNewWizard } from "../../reducer";
import { Step5Review } from "./Step5Review";

afterEach(cleanup);

function renderReview(amount: number, seedAllocated = 0) {
  const initial = seedNewWizard();
  return render(<Step5Review account="Corro Health" dispatch={vi.fn()} state={{
    ...initial, flow: "allocate", step: 5,
    wallet: { ...initial.wallet, amount: 100000 },
    departments: [{ id: 1, name: "Operations", selected: true, desc: "", users: 1, color: "#2eb5df",
      allocated: amount, seedAllocated,
      mgr: { name: "Tom", email: "tom@company.com", role: "Manager", mobile: "", invite: true } }],
  }} />);
}

it("shows the remaining budget and draws a 4% segment instead of a full ring", () => {
  renderReview(4000);
  const card = screen.getByRole("complementary", { name: "Budget distribution" });
  expect(within(card).getByText("4%")).toBeTruthy();
  expect(within(card).getByText("96%")).toBeTruthy();
  expect(within(card).getByText("Other budget")).toBeTruthy();
  expect(within(card).getByText("Department")).toBeTruthy();
  expect(card.querySelector<HTMLElement>(".donut")?.style.background).toContain("0% 4%");
});

it("includes existing allocations and omits the remainder when fully allocated", () => {
  renderReview(4000, 96000);
  const card = screen.getByRole("complementary", { name: "Budget distribution" });
  expect(within(card).getByText("100%")).toBeTruthy();
  expect(within(card).queryByText("Other budget")).toBeNull();
});
