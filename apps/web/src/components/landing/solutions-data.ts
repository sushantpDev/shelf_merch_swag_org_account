export type SolutionItem = {
  tab: string;
  title: string;
  body: string;
  points: string[];
  color: "blue" | "coral" | "mint" | "yellow" | "lilac";
  label: string;
  image: string;
};

export const SOLUTIONS: SolutionItem[] = [
  {
    tab: "Team Leads",
    title: "Build a team culture people want to stay for",
    body: "Make everyday recognition simple, visible and genuinely rewarding.",
    points: [
      "Allocate and track team budgets",
      "Reward great work with merch, kits or points",
      "Build morale with lightweight peer recognition",
    ],
    color: "lilac",
    label: "126 kudos this week",
    image: "/images/landing/solutions/team_leads.png",
  },
  {
    tab: "Marketing",
    title: "Keep your brand consistent everywhere it travels",
    body: "Give teams the freedom to order while approved products and artwork keep every touchpoint on-brand.",
    points: [
      "Centralize approved logos and products",
      "Launch shops for campaigns or rebrands",
      "Run client gifting around launches and renewals",
    ],
    color: "coral",
    label: "42 approved SKUs",
    image: "/images/landing/solutions/marketing.png",
  },
  {
    tab: "Admin",
    title: "Simplify procurement, budgets and approvals",
    body: "Give admin teams one source of truth for every branded item leaving the building.",
    points: [
      "One place for designs, vendors and SKUs",
      "Department wallets with clear controls",
      "GST-ready invoices and consolidated reports",
    ],
    color: "mint",
    label: "6 teams on budget",
    image: "/images/landing/solutions/admin.png",
  },
  {
    tab: "Sales",
    title: "Give your sales team an edge",
    body: "Help reps open doors, nurture relationships and celebrate wins with thoughtful, well-timed gifting.",
    points: [
      "Prospect gifts without operational delays",
      "Premium, on-brand client appreciation",
      "Instant recognition after every big win",
    ],
    color: "yellow",
    label: "18 gifts sent today",
    image: "/images/landing/solutions/sales.png",
  },
  {
    tab: "Human Resources",
    title: "Empower every stage of the employee journey",
    body: "Streamline onboarding, recognition, and milestone gifting, all from one HR-friendly dashboard.",
    points: [
      "Welcome kits or a dedicated onboarding shop",
      "Automated anniversary, birthday and milestone gifts",
      "Company-wide kudos that strengthens culture",
    ],
    color: "blue",
    label: "87% redeemed this month",
    image: "/images/landing/solutions/hr.png",
  },
  {
    tab: "Events",
    title: "Make every offsite and conference count",
    body: "Plan, produce and distribute event merchandise before, during or after the experience.",
    points: [
      "Match any event with curated merchandise",
      "Ship to venues or individual attendees",
      "Capture booth leads with scan-for-swag",
    ],
    color: "blue",
    label: "5 cities, one order",
    image: "/images/landing/solutions/marketing.png",
  },
];
