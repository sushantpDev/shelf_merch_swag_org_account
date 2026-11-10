/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ContactFormDialog } from "./ContactFormDialog";

const mutations = vi.hoisted(() => ({ add: vi.fn(), update: vi.fn(), import: vi.fn() }));
vi.mock("./model", () => ({
  useAddContact: () => ({ isPending: false, mutateAsync: mutations.add }),
  useUpdateContact: () => ({ isPending: false, mutateAsync: mutations.update }),
  useImportContacts: () => ({ isPending: false, mutateAsync: mutations.import }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  mutations.add.mockReset().mockResolvedValue({});
  mutations.update.mockReset().mockResolvedValue({});
  mutations.import.mockReset().mockResolvedValue({ status: "done", validCount: 1, totalRows: 1, errorCount: 0, errors: [] });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

async function choose(label: string, option: string) {
  fireEvent.keyDown(screen.getByRole("combobox", { name: label }), { key: "ArrowDown" });
  const item = await screen.findByRole("option", { name: option });
  fireEvent.keyDown(item, { key: "Enter" });
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
}

it("submits the selected role and country through the existing validated form", async () => {
  render(<ContactFormDialog open mode="add" onOpenChange={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Alex" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "alex@company.com" } });
  await choose("Role", "Admin");
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Country" }), { key: "ArrowDown" });
  const search = await screen.findByRole("combobox", { name: "Search countries" });
  fireEvent.change(search, { target: { value: "Japan" } });
  await screen.findByRole("option", { name: "Japan" });
  fireEvent.keyDown(search, { key: "Enter" });
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Add contacts" }));
  await waitFor(() =>
    expect(mutations.add).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: "Alex",
        email: "alex@company.com",
        role: "Admin",
        country: "JP",
      }),
    ),
  );
});

it("keeps Role read-only for users without permission to change contact roles", () => {
  render(
    <ContactFormDialog open mode="add" canManageContactRoles={false} onOpenChange={vi.fn()} />,
  );
  expect(screen.queryByRole("combobox", { name: "Role" })).toBeNull();
  expect((screen.getByLabelText("Role") as HTMLInputElement).readOnly).toBe(true);
  expect(screen.getByRole("combobox", { name: "Country" })).toBeTruthy();
});

it("supports country aliases, flags, and an empty search result", async () => {
  render(<ContactFormDialog open mode="add" onOpenChange={vi.fn()} />);
  const country = screen.getByRole("combobox", { name: "Country" });
  expect(country.querySelector("img")?.getAttribute("src")).toBe("/flags/in.svg");
  fireEvent.click(country);
  const search = await screen.findByRole("combobox", { name: "Search countries" });
  fireEvent.change(search, { target: { value: "UAE" } });
  const uae = await screen.findByRole("option", { name: "United Arab Emirates" });
  expect(uae.querySelector("img")?.getAttribute("src")).toBe("/flags/ae.svg");
  fireEvent.change(search, { target: { value: "NoSuchCountryXYZ" } });
  await screen.findByText("No countries found.");
});

it("can select, remove, and import a contact file from the upload view", async () => {
  render(<ContactFormDialog open mode="add" initialTab="csv" onOpenChange={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Download template" })).toBeTruthy();
  const action = screen.getByRole("button", { name: "Import contacts" }) as HTMLButtonElement;
  expect(action.disabled).toBe(true);
  const file = new File(["First Name,Email\nAlex,alex@company.com"], "contacts.csv", { type: "text/csv" });
  fireEvent.change(screen.getByLabelText("Choose contacts file"), { target: { files: [file] } });
  expect(screen.getByText("contacts.csv")).toBeTruthy();
  expect(action.disabled).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Remove file" }));
  expect(action.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Choose contacts file"), { target: { files: [file] } });
  fireEvent.click(action);
  await screen.findByText("Import complete");
  expect(mutations.import).toHaveBeenCalledWith(expect.objectContaining({ file }));
});
