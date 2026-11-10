/** @vitest-environment happy-dom */
import { useReducer } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { seedAllocateWizard, seedNewWizard, wizardReducer } from "../../reducer";
import { selectedDepartments, type OrgSnapshot } from "../../types";
import { Step2Departments } from "./Step2Departments";

afterEach(cleanup);

const org: OrgSnapshot = {
  active: true, done: true, inWizard: false,
  wallet: { ...seedNewWizard().wallet, amount: 100000 },
  departments: ["Marketing", "Sales"].map((name, index) => ({
    id: String(index + 1), name, desc: "", users: 10, allocated: (index + 1) * 1000,
    spent: 0, color: "#2eb5df",
    mgr: { name: "Tom", email: "tom@company.com", mobile: "", role: "Manager", invite: false, inviteStatus: "active" },
  })),
};

function Harness() {
  const [state, dispatch] = useReducer(wizardReducer, org, seedAllocateWizard);
  return <Step2Departments state={state} dispatch={dispatch} />;
}

it("opens with no departments selected and preserves existing budgets and managers", () => {
  const state = seedAllocateWizard(org);
  expect(selectedDepartments(state.departments)).toHaveLength(0);
  expect(state.departments.map((d) => d.seedAllocated)).toEqual([1000, 2000]);
  expect(state.departments.every((d) => d.allocated === 0)).toBe(true);
  expect(state.departments[0].mgr.email).toBe("tom@company.com");
  expect(org.departments.map((d) => d.allocated)).toEqual([1000, 2000]);
});

it("selects and deselects every department in one click, including partial selections", () => {
  render(<Harness />);
  const marketing = screen.getByRole("checkbox", { name: "Select Marketing" }) as HTMLInputElement;
  const sales = screen.getByRole("checkbox", { name: "Select Sales" }) as HTMLInputElement;
  expect(marketing.checked).toBe(false);
  expect(sales.checked).toBe(false);
  fireEvent.click(marketing);
  expect(marketing.checked).toBe(true);
  expect(sales.checked).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Select all" }));
  expect(marketing.checked).toBe(true);
  expect(sales.checked).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
  expect(marketing.checked).toBe(false);
  expect(sales.checked).toBe(false);
  expect(screen.getByText("Select at least one department to continue.")).toBeTruthy();
});

it("clears only draft additions when deselecting and preserves current budgets on reselect", () => {
  let state = seedAllocateWizard(org);
  state = wizardReducer(state, { type: "setAllDeptSelected", selected: true });
  state = wizardReducer(state, { type: "setAlloc", id: "1", amount: 500 });
  state = wizardReducer(state, { type: "setAllDeptSelected", selected: false });
  expect(state.departments.map((d) => d.allocated)).toEqual([0, 0]);
  state = wizardReducer(state, { type: "setAllDeptSelected", selected: true });
  expect(selectedDepartments(state.departments)).toHaveLength(2);
  expect(state.departments.map((d) => d.seedAllocated)).toEqual([1000, 2000]);
  expect(state.departments.map((d) => d.allocated)).toEqual([0, 0]);
});

it("adds custom departments from the toolbar alongside suggestions", () => {
  render(<Harness />);
  expect(screen.getByText("Suggestions")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Add department" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Department name"), { target: { value: "Product" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add department" }));
  const checkbox = screen.getByRole("checkbox", { name: "Select Product" }) as HTMLInputElement;
  expect(checkbox.checked).toBe(true);
  expect(screen.getByRole("table", { name: "Departments" })).toBeTruthy();
});

it("suggestion tiles toggle selection and add departments without duplicates", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Select Marketing department" }));
  expect((screen.getByRole("checkbox", { name: "Select Marketing" }) as HTMLInputElement).checked).toBe(true);
  expect(screen.getByRole("button", { name: "Deselect Marketing department" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Deselect Marketing department" }));
  expect((screen.getByRole("checkbox", { name: "Select Marketing" }) as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Add Engineering" }));
  expect((screen.getByRole("checkbox", { name: "Select Engineering" }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Deselect Engineering department" }));
  fireEvent.click(screen.getByRole("button", { name: "Select Engineering department" }));
  expect(screen.getAllByRole("checkbox", { name: "Select Engineering" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Select all" }));
  expect(screen.getByRole("button", { name: "Deselect Sales department" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
  expect(screen.getByRole("button", { name: "Select Sales department" }).getAttribute("aria-pressed")).toBe("false");
});
