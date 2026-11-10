import { describe, expect, it } from "vitest";
import { DESIGN_SAVED_PUBLISH_FAILED_MESSAGE } from "./designSaveMessages";

describe("designSaveMessages", () => {
  it("tells the user the design was kept when publish fails", () => {
    expect(DESIGN_SAVED_PUBLISH_FAILED_MESSAGE).toContain("Design saved successfully");
    expect(DESIGN_SAVED_PUBLISH_FAILED_MESSAGE).toContain("publishing failed");
    expect(DESIGN_SAVED_PUBLISH_FAILED_MESSAGE).toContain("retry publishing");
  });
});
