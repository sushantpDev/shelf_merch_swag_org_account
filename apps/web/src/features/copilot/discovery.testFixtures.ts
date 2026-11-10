import type { CopilotCategory } from "./api";

// UI contract examples only. Authorization is tested against the server resolver.
export const discoveryCategories: CopilotCategory[] = [
  {
    id: "products_kits",
    title: "Products & Kits",
    description: "Discover merchandise and gift kits",
    heading: "What would you like to explore?",
    actions: [
      {
        id: "products_explore",
        title: "Explore products",
        description: "Browse real inventory.",
        availability: "available",
        prompt: "Show apparel",
      },
    ],
  },
  {
    id: "budgets_wallet",
    title: "Budgets & Wallet",
    description: "View available funds",
    heading: "How can I help with your budget?",
    actions: [
      {
        id: "budget_available",
        title: "Check my available budget",
        description: "",
        availability: "available",
        prompt: "Show my current available budget.",
      },
      {
        id: "budget_allocate",
        title: "Allocate budget to a department",
        description: "",
        availability: "integration_pending",
        explanation: "Coming to Copilot; this action cannot run here yet.",
      },
    ],
  },
];
