import { describe, expect, it } from "vitest";
import {
  containsRawImageUrl,
  looksLikeRawProductTable,
  sanitizeCopilotAssistantText,
} from "./sanitizeCopilotText";

const productArtifacts = [
  {
    kind: "product" as const,
    product: {
      id: "p1",
      name: "Navy Tee",
      sellingPriceInr: 499,
      primaryImageUrl: "https://cdn.example.com/navy.png",
    },
  },
];

const kitArtifacts = [
  {
    kind: "kit" as const,
    kit: { id: "k1", name: "Welcome Kit", curated: true, approxValueInr: 1200 },
  },
];

describe("sanitizeCopilotAssistantText", () => {
  it("strips markdown product tables and image URLs when product cards exist", () => {
    const raw = [
      "Here are some options:",
      "",
      "| Name | SKU | Price | Image |",
      "| --- | --- | --- | --- |",
      "| Navy Tee | SKU-1 | ₹499 | https://cdn.example.com/navy.png |",
      "| Grey Hoodie | SKU-2 | ₹999 | https://cdn.example.com/grey.jpg |",
      "",
      "Tell me if you want details on any of these.",
    ].join("\n");

    const cleaned = sanitizeCopilotAssistantText(raw, productArtifacts);
    expect(cleaned).toContain("Here are some options");
    expect(cleaned).toContain("Tell me if you want details");
    expect(looksLikeRawProductTable(cleaned)).toBe(false);
    expect(cleaned).not.toMatch(/https?:\/\//);
    expect(cleaned).not.toContain("SKU-1");
  });

  it("strips kit dump tables when kit cards exist", () => {
    const raw = [
      "Curated kits:",
      "| Kit | Value | Image |",
      "| --- | --- | --- |",
      "| Welcome Kit | ₹1200 | https://cdn.example.com/kit.png |",
    ].join("\n");
    const cleaned = sanitizeCopilotAssistantText(raw, kitArtifacts);
    expect(cleaned).toContain("Curated kits");
    expect(cleaned).not.toContain("https://cdn.example.com/kit.png");
    expect(looksLikeRawProductTable(cleaned)).toBe(false);
  });

  it("keeps normal markdown prose when no card artifacts", () => {
    const raw = "You can allocate **budget** to Marketing.\n\n1. Open Budgets\n2. Choose the department";
    const cleaned = sanitizeCopilotAssistantText(raw, []);
    expect(cleaned).toContain("**budget**");
    expect(cleaned).toContain("Open Budgets");
  });

  it("detects raw image URLs for regression guards", () => {
    expect(containsRawImageUrl("see https://cdn.example.com/x.png")).toBe(true);
    expect(containsRawImageUrl("no urls here")).toBe(false);
  });
  it("keeps financial markdown tables when no product/kit artifacts", () => {
    const raw = [
      "Here is the department allocation:",
      "",
      "| Department | Allocated | Remaining |",
      "| --- | --- | --- |",
      "| Marketing | ₹5,000 | ₹4,500 |",
      "| Sales | ₹3,000 | ₹2,500 |",
    ].join("\n");
    const cleaned = sanitizeCopilotAssistantText(raw, [
      {
        kind: "wallet_balance",
        wallet: {
          balance: 20000,
          allocatedAmount: 7000,
          unallocatedAmount: 13000,
        },
      },
    ]);
    expect(cleaned).toContain("| Department | Allocated | Remaining |");
    expect(looksLikeRawProductTable(cleaned)).toBe(true);
  });
});
