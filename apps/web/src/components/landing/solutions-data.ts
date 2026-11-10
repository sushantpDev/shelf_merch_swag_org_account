export type SolutionItem = {
  tab: string;
  title: string;
  body: string;
  points: string[];
  panelColor: string;
  artColor: string;
  label: string;
  image: string;
};

export const SOLUTIONS: SolutionItem[] = [
  {
    tab: "Admin",
    title: "Simplify procurement, budgets and approvals",
    body: "Give admin teams one source of truth for every branded item leaving the building.",
    points: [
      "Keep designs, vendors, and products in one place",
      "Set clear budgets for every department",
      "Get GST-ready invoices without chasing paperwork",
    ],
    panelColor: "#d6eaff",
    artColor: "#f9fafd",
    label: "6 teams on budget",
    image: "/images/landing/solutions/admin.png",
  },
  {
    tab: "Team Leads",
    title: "Build a team culture people want to stay for",
    body: "Make everyday recognition simple, visible and genuinely rewarding.",
    points: [
      "Set and track budgets for your team",
      "Send merch, kits, or points when someone does great work",
      "Make everyday recognition part of the culture",
    ],
    panelColor: "#c9b8ff",
    artColor: "#e1e0fd",
    label: "126 kudos this week",
    image: "/images/landing/solutions/team_leads.png",
  },
  {
    tab: "Marketing",
    title: "Keep your brand consistent everywhere it travels",
    body: "Give teams the freedom to order while approved products and artwork keep every touchpoint on-brand.",
    points: [
      "Keep approved logos and products together",
      "Spin up campaign and rebrand shops quickly",
      "Send thoughtful gifts around launches and renewals",
    ],
    panelColor: "#c9b8ff",
    artColor: "#dfd7fd",
    label: "42 approved SKUs",
    image: "/images/landing/solutions/marketing.png",
  },
  {
    tab: "Sales",
    title: "Give your sales team an edge",
    body: "Help reps open doors, nurture relationships and celebrate wins with thoughtful, well-timed gifting.",
    points: [
      "Send prospect gifts without waiting on operations",
      "Keep client gifts premium and on-brand",
      "Celebrate every big win while it is still fresh",
    ],
    panelColor: "#bfdcff",
    artColor: "#ddedfd",
    label: "18 gifts sent today",
    image: "/images/landing/solutions/sales.png",
  },
  {
    tab: "Human Resources",
    title: "Empower every stage of the employee journey",
    body: "Streamline onboarding, recognition, and milestone gifting, all from one HR-friendly dashboard.",
    points: [
      "Welcome new hires with thoughtful kits",
      "Automate birthday, anniversary, and milestone gifts",
      "Make appreciation visible across the company",
    ],
    panelColor: "#c9b8ff",
    artColor: "#dfd6fc",
    label: "87% redeemed this month",
    image: "/images/landing/solutions/hr.png",
  },
  {
    tab: "Events",
    title: "Make every offsite and conference count",
    body: "Plan, produce and distribute event merchandise before, during or after the experience.",
    points: [
      "Choose merchandise that fits each event",
      "Ship to the venue or straight to attendees",
      "Turn booth visits into leads with scan-for-swag",
    ],
    panelColor: "#d2c5ff",
    artColor: "#f4f2fd",
    label: "5 cities, one order",
    image: "/images/landing/solutions/events.png",
  },
];
