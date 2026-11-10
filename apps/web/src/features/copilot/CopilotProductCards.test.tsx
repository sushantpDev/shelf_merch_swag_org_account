// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopilotArtifacts } from "./CopilotProductCards";
import { CopilotMarkdown } from "./CopilotMarkdown";

vi.mock("@/lib/workspaceSlug", () => ({
  tenantPath: (path: string) => `/acme${path}`,
}));

vi.mock("@/lib/mediaUrl", () => ({
  resolveMediaUrl: (url: string) => url || "",
}));

afterEach(() => cleanup());

describe("Copilot product/kit cards", () => {
  it("renders product cards with View details navigation and no raw table", () => {
    const artifacts = [
      {
        kind: "product" as const,
        product: {
          id: "507f1f77bcf86cd799439011",
          name: "Navy Tee",
          sellingPriceInr: 499,
          primaryImageUrl: "https://cdn.example.com/navy.png",
          variants: [{ stock: 12 }],
        },
      },
    ];
    const dump = `| Name | Image |\n| --- | --- |\n| Navy Tee | https://cdn.example.com/navy.png |`;
    render(
      <MemoryRouter>
        <CopilotMarkdown content={dump} artifacts={artifacts} />
        <CopilotArtifacts artifacts={artifacts} />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/cdn\.example\.com/)).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    const link = screen.getByRole("link", { name: /View Navy Tee/i });
    expect(link).toHaveAttribute("href", "/acme/catalog/507f1f77bcf86cd799439011");
    expect(screen.getByText("Navy Tee")).toBeInTheDocument();
    expect(screen.getByText(/₹499/)).toBeInTheDocument();
  });

  it("renders kit cards using imageUrl from MCP kit summaries", () => {
    const artifacts = [
      {
        kind: "kit" as const,
        kit: {
          id: "507f1f77bcf86cd799439033",
          name: "Colorful Diwali Celebration Kit",
          type: "curated",
          curated: true,
          priceInr: 1549,
          imageUrl: "https://cdn.example.com/diwali.png",
        },
      },
    ];
    render(
      <MemoryRouter>
        <CopilotArtifacts artifacts={artifacts} />
      </MemoryRouter>,
    );
    const img = document.querySelector(".sm-copilot-product__img img") as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toContain("cdn.example.com/diwali.png");
    expect(screen.queryByLabelText(/No kit image available/i)).toBeNull();
  });

  it("renders kit cards with details navigation", () => {
    const artifacts = [
      {
        kind: "kit" as const,
        kit: {
          id: "507f1f77bcf86cd799439022",
          name: "Onboarding Kit",
          status: "live",
          type: "customized",
          priceInr: 1500,
          heroImage: "https://cdn.example.com/kit.png",
        },
      },
    ];
    render(
      <MemoryRouter>
        <CopilotMarkdown
          content={"Kits:\n| Name | Image |\n| --- | --- |\n| Onboarding Kit | https://cdn.example.com/kit.png |"}
          artifacts={artifacts}
        />
        <CopilotArtifacts artifacts={artifacts} />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/cdn\.example\.com/)).toBeNull();
    const link = screen.getByRole("link", { name: /View Onboarding Kit/i });
    expect(link).toHaveAttribute("href", "/acme/kits/507f1f77bcf86cd799439022");
  });

  it("renders safe markdown for normal assistant replies", () => {
    render(
      <MemoryRouter>
        <CopilotMarkdown content={"Allocate **budget** to Marketing.\n\n- Step one\n- Step two"} />
      </MemoryRouter>,
    );
    expect(screen.getByText("budget").tagName).toBe("STRONG");
    expect(screen.getByText("Step one")).toBeInTheDocument();
  });
  it("renders GitHub-flavored markdown tables safely", () => {
    render(
      <MemoryRouter>
        <CopilotMarkdown
          content={[
            "Department allocation:",
            "",
            "| Department | Allocated | Remaining |",
            "| --- | --- | --- |",
            "| Marketing | ₹5,000 | ₹4,500 |",
          ].join("\n")}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Marketing")).toBeInTheDocument();
    expect(screen.queryByText(/\| Department \|/)).toBeNull();
  });

  it("renders wallet balance card from backend figures", () => {
    render(
      <MemoryRouter>
        <CopilotMarkdown content={"Your available balance is ₹13,000."} artifacts={[{
          kind: "wallet_balance",
          wallet: {
            id: "w1",
            name: "Primary wallet",
            balance: 20000,
            allocatedAmount: 7000,
            unallocatedAmount: 13000,
          },
          reconciliation: {
            ok: false,
            warning: "Wallet allocated total does not match the sum of department remaining budgets by ₹1,000. Showing backend figures without adjustment.",
          },
        }]} />
        <CopilotArtifacts artifacts={[{
          kind: "wallet_balance",
          wallet: {
            id: "w1",
            name: "Primary wallet",
            balance: 20000,
            allocatedAmount: 7000,
            unallocatedAmount: 13000,
          },
          reconciliation: {
            ok: false,
            warning: "Wallet allocated total does not match the sum of department remaining budgets by ₹1,000. Showing backend figures without adjustment.",
          },
        }]} />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("Wallet balance")).toBeInTheDocument();
    expect(screen.getByText("Available ₹13,000")).toBeInTheDocument();
    expect(screen.getByText(/₹1,000/)).toBeInTheDocument();
  });

  it("renders department budgets for entity managers without org wallet cash", () => {
    render(
      <MemoryRouter>
        <CopilotArtifacts
          artifacts={[
            {
              kind: "department_budgets",
              departments: [
                { name: "Marketing", allocatedAmount: 5000, remainingAmount: 4500 },
              ],
            },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("Department budgets")).toBeInTheDocument();
    expect(screen.getByText("Available ₹4,500")).toBeInTheDocument();
    expect(screen.queryByText("Total balance")).toBeNull();
  });
});
