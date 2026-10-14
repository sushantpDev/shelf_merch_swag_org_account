import { describe, expect, it } from "vitest";
import { initialSendPointsDraft, sendPointsReducer } from "./pointsDraft";

describe("sendPointsReducer recipient remapping", () => {
  it("keeps a newly saved contact selected without duplicating it", () => {
    const draft = {
      ...initialSendPointsDraft(),
      selRecips: ["email:ada@example.com", "contact-1"],
    };

    expect(
      sendPointsReducer(draft, {
        type: "remapRecipId",
        fromId: "email:ada@example.com",
        toId: "contact-1",
      }).selRecips,
    ).toEqual(["contact-1"]);
  });
});
