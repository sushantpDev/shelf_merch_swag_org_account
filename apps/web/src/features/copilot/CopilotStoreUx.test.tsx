// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopilotWriteSuccess } from "./CopilotConfirmationCard";
import { stockLabel } from "./CopilotProductCards";
import { sanitizeCopilotAssistantText } from "./sanitizeCopilotText";
import { buildWriteSuccessArtifact } from "./writeSuccess";

vi.mock("@/lib/workspaceSlug", () => ({
  tenantPath: (path: string) => `/acme${path}`,
}));

vi.mock("@/lib/shopRedeemUrl", () => ({
  shopStorefrontHref: (shop: { id: string; slug?: string }) =>
    shop.slug ? `https://staging.example/s/${shop.slug}` : `https://staging.example/shop/${shop.id}`,
}));

afterEach(() => cleanup());

describe("Copilot store UX polish", () => {
  it("reports confirmed creation as live and offers View Store without another publish step", () => {
    const artifact = buildWriteSuccessArtifact("shops.create", {
      id: "507f1f77bcf86cd799439011", name: "Rewards", status: "live", slug: "rewards",
    });
    render(<MemoryRouter><CopilotWriteSuccess artifact={artifact} /></MemoryRouter>);
    expect(screen.getByText("Rewards is now Live.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Store" })).toBeInTheDocument();
    expect(screen.queryByText(/draft|setup|publish/i)).not.toBeInTheDocument();
  });
  it("shows friendly stock labels without exact counts", () => {
    expect(stockLabel({ variants: [{ stock: 34999996 }] })).toBe("In stock");
    expect(stockLabel({ variants: [{ stock: 0 }] })).toBe("Out of stock");
    expect(stockLabel({ variants: [] })).toBe("Availability unknown");
  });

  it("removes duplicate product names and links when cards exist", () => {
    const cleaned = sanitizeCopilotAssistantText(
      "Here are options.\n- Navy Tee\n[Navy Tee](https://cdn.example.com/navy.png)\nWant another color?",
      [{ kind: "product", product: { id: "1", name: "Navy Tee" } }],
    );
    expect(cleaned).toContain("Here are options.");
    expect(cleaned).toContain("Want another color?");
    expect(cleaned).not.toContain("cdn.example.com");
    expect(cleaned).not.toMatch(/Navy Tee/);
  });

  it("renders publish success with View Store and Manage Store actions", () => {
    const artifact = buildWriteSuccessArtifact(
      "shops.publish",
      {
        id: "507f1f77bcf86cd799439011",
        name: "AI Employee Rewards Store",
        status: "live",
        slug: "ai-employee-rewards-store",
        currencyMode: "points",
        storefrontUrl: "https://staging.example/s/ai-employee-rewards-store",
      },
    );
    render(
      <MemoryRouter>
        <CopilotWriteSuccess artifact={artifact} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Store published successfully/i)).toBeInTheDocument();
    expect(screen.getByText(/AI Employee Rewards Store is now Live/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View Store/i })).toHaveAttribute(
      "href",
      "https://staging.example/s/ai-employee-rewards-store",
    );
    expect(screen.getByRole("link", { name: /Manage Store/i })).toHaveAttribute(
      "href",
      "/acme/shops/507f1f77bcf86cd799439011",
    );
  });
});
