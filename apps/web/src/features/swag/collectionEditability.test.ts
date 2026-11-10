import { describe, expect, it } from "vitest";
import {
  collectionEditableInWizard,
  collectionLinkedToShop,
} from "./collectionEditability";

describe("collectionEditableInWizard", () => {
  it("allows draft collections with no shop link", () => {
    expect(collectionEditableInWizard({ status: "draft", shopIds: [], shopId: "" })).toBe(true);
  });

  it("allows ready unpublished collections so Save Design can be refined", () => {
    expect(collectionEditableInWizard({ status: "ready", shopIds: [], shopId: "" })).toBe(true);
  });

  it("blocks published collections even when status is still draft-like", () => {
    expect(collectionEditableInWizard({ status: "ready", shopIds: ["shop-1"], shopId: "" })).toBe(
      false,
    );
    expect(collectionEditableInWizard({ status: "draft", shopIds: [], shopId: "shop-1" })).toBe(
      false,
    );
  });

  it("blocks archived collections", () => {
    expect(collectionEditableInWizard({ status: "archived", shopIds: [], shopId: "" })).toBe(false);
  });
});

describe("collectionLinkedToShop", () => {
  it("detects shopIds or legacy shopId", () => {
    expect(collectionLinkedToShop({ shopIds: ["a"], shopId: "" })).toBe(true);
    expect(collectionLinkedToShop({ shopIds: [], shopId: "b" })).toBe(true);
    expect(collectionLinkedToShop({ shopIds: [], shopId: "" })).toBe(false);
  });
});
