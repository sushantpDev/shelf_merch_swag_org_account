// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { ZohoPeopleDocsHomePage } from "./ZohoPeopleDocsHomePage";

afterEach(cleanup);

function renderPage() {
  return render(<MemoryRouter initialEntries={["/docs/zoho-people"]}><Routes>
    <Route path="/docs/zoho-people" element={<ZohoPeopleDocsHomePage />} />
    <Route path="/signup" element={<h1>Signup destination</h1>} />
    <Route path="/login" element={<h1>Login destination</h1>} />
  </Routes></MemoryRouter>);
}

describe("Zoho Marketplace onboarding", () => {
  it.each([
    ["Create ShelfMerch Account", "/signup", "Signup destination"],
    ["Log In to ShelfMerch", "/login", "Login destination"],
  ])("takes %s to the existing account route", (label, destination, heading) => {
    renderPage();
    const link = screen.getByRole("link", { name: label });
    expect(link.getAttribute("href")).toBe(destination);
    fireEvent.click(link);
    expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
  });

  it("explains website authorization and manual sync while retaining documentation", () => {
    renderPage();
    const onboarding = screen.getByRole("region", { name: "Your people. Connected to ShelfMerch." });
    expect(onboarding.textContent).toContain("Integrations → Zoho People → Connect");
    expect(onboarding.textContent).toContain("Authorize with Zoho OAuth");
    expect(onboarding.textContent).toContain("Employees are not synced automatically");
    expect(onboarding.textContent).toContain("a Zoho Web Tab is not required");
    expect(within(onboarding).getByRole("list").children).toHaveLength(3);
    for (const name of ["User Guide", "Administrator Guide", "Installation and Connection", "Employee Synchronisation"]) {
      expect(screen.getAllByRole("link", { name: new RegExp(name) }).length).toBeGreaterThan(0);
    }
  });
});
