// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { toast } from "sonner";
import type { UiProduct } from "@/services/mappers";
import type { SendKitVm } from "../controllers/useSendKitController";
import { initialSendKitDraft } from "../send/sendDraft";
import { SendKitView } from "./SendKitView";

vi.mock("../model", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../model")>()),
  usePlatformKits: () => ({ data: [] }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function product(id: string, variants?: UiProduct["variants"]): UiProduct {
  return { id, nm: id, g: "tee", brand: "", price: "", sw: 1, variants };
}

function renderRecipients(products: UiProduct[]) {
  const dispatch = vi.fn();
  const vm = {
    step: 1,
    draft: {
      ...initialSendKitDraft(products.map((_, index) => index), "none", ["one"], "Team"),
      mode: "surprise",
    },
    dispatch,
    catalog: products,
    kit: { name: "Example kit" },
    totals: { qty: 1, total: 100, pkgCost: 0 },
    walletAvailable: () => 0,
    pickerContacts: [
      { id: "one", name: "One", email: "one@example.com" },
      { id: "two", name: "Two", email: "two@example.com" },
    ],
    surpriseMissing: [],
  } as unknown as SendKitVm;
  return { ...render(<SendKitView {...vm} />), dispatch };
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("Send Kit bulk variant selection", () => {
  it("omits products without options from a mixed kit's bulk controls", () => {
    const { baseElement, dispatch } = renderRecipients([
      product("Missing variants"),
      product("Empty variants", []),
      product("No size or color", [{}]),
      product("Blank variants", [{ size: " ", color: "\t" }]),
      product("Size only", [{ size: "M" }]),
      product("Color only", [{ color: "Red" }]),
    ]);

    const items = baseElement.querySelectorAll<HTMLElement>(".sk-recip-bulk-strip__item");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Size only");
    expect(items[1].textContent).toContain("Color only");

    fireEvent.change(within(items[0]).getByRole("combobox"), { target: { value: "M" } });
    fireEvent.click(within(items[0]).getByRole("button", { name: "Apply" }));
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "applyVariantToAll",
      contactIds: ["one", "two"],
      productId: "Size only",
      patch: { size: "M" },
    });

    fireEvent.click(within(items[1]).getByRole("button", { name: /Color/ }));
    fireEvent.click(within(items[1]).getByText("Red"));
    fireEvent.click(within(items[1]).getByRole("button", { name: "Apply" }));
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "applyVariantToAll",
      contactIds: ["one", "two"],
      productId: "Color only",
      patch: { color: "Red" },
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows no bulk Apply action when every product has no options", () => {
    const { baseElement, queryByRole } = renderRecipients([
      product("Plain product"),
      product("Blank variants", [{ size: " ", color: " " }]),
    ]);
    expect(baseElement.querySelector(".sk-recip-bulk-strip")).toBeNull();
    expect(queryByRole("button", { name: "Apply" })).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("still asks for a selection when applying a product with real options", () => {
    const { getByRole, dispatch } = renderRecipients([product("Size only", [{ size: "M" }])]);
    fireEvent.click(getByRole("button", { name: "Apply" }));
    expect(toast.error).toHaveBeenCalledWith("Select a size or color first");
    expect(dispatch).not.toHaveBeenCalled();
  });
});
