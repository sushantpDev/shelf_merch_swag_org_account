import { describe, expect, it } from "vitest";
import { initialSendKitDraft } from "./sendDraft";

describe("initialSendKitDraft", () => {
  it("leaves the optional sender and recipient message empty", () => {
    const draft = initialSendKitDraft([], "box", [], "Zira");

    expect(draft.from).toBe("");
    expect(draft.msg).toBe("");
  });
});
