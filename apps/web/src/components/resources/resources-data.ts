export const RESOURCE_NAV = [
  {
    slug: "hr" as const,
    label: "Human Resource",
    blurb: "Onboarding, milestones & recognition",
    icon: "♙",
  },
  {
    slug: "sales" as const,
    label: "Sales & Marketing",
    blurb: "Prospects, clients & campaigns",
    icon: "✦",
  },
  {
    slug: "events" as const,
    label: "Events",
    blurb: "Conference swag, kits & merch bars",
    icon: "✦",
  },
];

export type TeamSlug = (typeof RESOURCE_NAV)[number]["slug"];

export type TeamContent = {
  slug: TeamSlug;
  name: string;
  icon: string;
  tone: "blue" | "coral" | "mint";
  eyebrow: string;
  titleBefore: string;
  titleEm: string;
  sub: string;
  proof: string;
  cta: string;
  stats: [string, string][];
  sectionBefore: string;
  sectionEm: string;
  body: string;
  moments: [string, string, string, string[]][];
  workflowBefore: string;
  workflowEm: string;
  steps: [string, string, string][];
  control: string;
  controlBody: string;
  controls: string[];
  dash: string[];
  floats: [string, string, string][];
};

export const TEAMS: Record<TeamSlug, TeamContent> = {
  hr: {
    slug: "hr",
    name: "Human Resources",
    icon: "♙",
    tone: "blue",
    eyebrow: "SHELF MERCH FOR HR",
    titleBefore: "Build a culture people",
    titleEm: "want to stay for.",
    sub: "Bring onboarding, milestones, recognition and employee gifting into one HR-friendly platform—without adding another operational burden.",
    proof: "✓ One employee journey. Every branded moment.",
    cta: "Build your employee program",
    stats: [
      ["87%", "program redemption"],
      ["12", "active people programs"],
      ["1", "dashboard for every team"],
    ],
    sectionBefore: "Every employee moment,",
    sectionEm: "thoughtfully handled.",
    body: "Create repeatable programs that feel personal to employees and stay easy to run for HR.",
    moments: [
      [
        "▣",
        "Onboarding without the admin spiral",
        "Give every joiner a consistent first-day experience, wherever they are in India.",
        [
          "Welcome kits or an onboarding store",
          "Collect sizes and addresses directly",
          "Track every order and delivery",
        ],
      ],
      [
        "✦",
        "Milestones that never slip",
        "Automate the dates that matter, with the right reward for every moment and tenure.",
        [
          "Birthdays and work anniversaries",
          "HRMS-triggered gifting rules",
          "Recipient choice or curated gifts",
        ],
      ],
      [
        "♡",
        "Kudos people actually use",
        "Make appreciation visible, values-led and rewarding across teams and locations.",
        ["Peer and manager recognition", "Points, badges and comments", "Redemption and engagement reports"],
      ],
    ],
    workflowBefore: "From people data",
    workflowEm: "to a delivered moment.",
    steps: [
      ["♙", "Connect your people", "Add employees or sync your HRMS."],
      ["✦", "Create the program", "Choose moments, rewards and rules."],
      ["₹", "Set budgets", "Allocate credits by team or cost centre."],
      ["⇢", "We fulfil", "Make, pack, ship and track pan-India."],
    ],
    control: "Culture, with controls built in.",
    controlBody:
      "HR gets the warm employee experience. Finance and admin get approved catalogues, clear budgets, consolidated invoices and reporting.",
    controls: ["Department budgets", "Approved collections", "HRMS integrations", "Redemption reporting"],
    dash: [
      "PEOPLE PROGRAMS",
      "Recognition pulse",
      "92%",
      "126",
      "Kudos",
      "18",
      "Milestones",
      "87%",
      "Redeemed",
      "RS",
      "Riya recognized Sameer",
      "Customer First · 2 min ago",
      "+250",
    ],
    floats: [
      ["✦", "18 milestones", "Ready this month"],
      ["⇢", "Welcome kit delivered", "Bengaluru · just now"],
    ],
  },
  sales: {
    slug: "sales",
    name: "Sales & Marketing",
    icon: "✦",
    tone: "coral",
    eyebrow: "SHELF MERCH FOR SALES & MARKETING",
    titleBefore: "Turn every gift",
    titleEm: "into momentum.",
    sub: "Run prospect gifting, client appreciation and branded campaigns at the speed of your pipeline—with every item on-brand and every rupee visible.",
    proof: "✓ Open doors. Build loyalty. Keep your brand consistent.",
    cta: "Plan your next campaign",
    stats: [
      ["18", "gifts sent today"],
      ["42", "approved campaign SKUs"],
      ["92%", "on-time delivery"],
    ],
    sectionBefore: "From first touch",
    sectionEm: "to lasting relationship.",
    body: "Give revenue teams a fast, repeatable way to create branded moments before, during and after the deal.",
    moments: [
      [
        "✦",
        "Prospect gifting that opens doors",
        "Send a relevant gift before a meeting, after a demo or inside an account-based campaign.",
        [
          "Personal gift links—no address chasing",
          "Recipient choice within a set budget",
          "Campaign redemption and delivery data",
        ],
      ],
      [
        "✦",
        "Client appreciation that lands",
        "Mark renewals, project wins and key relationships with premium, on-brand gifting.",
        ["Collections by client tier", "Premium packaging and notes", "One-off or recurring programs"],
      ],
      [
        "✦",
        "Campaign merch without brand drift",
        "Launch merchandise for product releases, communities, field teams and partner programs.",
        ["Approved artwork and products", "Campaign stores and landing links", "Bulk or on-demand production"],
      ],
    ],
    workflowBefore: "A campaign in motion,",
    workflowEm: "not in a spreadsheet.",
    steps: [
      ["✦", "Choose the audience", "Upload accounts, contacts or recipients."],
      ["▦", "Build the collection", "Curate approved gifts or merchandise."],
      ["✦", "Send your way", "Gift link, direct send or branded store."],
      ["▥", "Measure the moment", "See claims, delivery and spend together."],
    ],
    control: "Speed for teams. Guardrails for brands.",
    controlBody:
      "Reps can send quickly while marketing controls products, artwork, budgets and packaging across every region and campaign.",
    controls: ["Brand-approved catalogues", "Campaign budgets", "CRM-ready workflows", "Claim and delivery data"],
    dash: [
      "PIPELINE GIFTING",
      "Enterprise demo follow-up",
      "72%",
      "48",
      "Sent",
      "35",
      "Claimed",
      "31",
      "Delivered",
      "AK",
      "Arjun Khanna",
      "Gift claimed · Bengaluru",
      "Ready to ship",
    ],
    floats: [
      ["✦", "Gift claimed", "After today's demo"],
      ["▥", "14 opportunities", "Influenced this month"],
    ],
  },
  events: {
    slug: "events",
    name: "Events",
    icon: "✦",
    tone: "mint",
    eyebrow: "SHELF MERCH FOR EVENTS",
    titleBefore: "Make every event",
    titleEm: "worth showing up for.",
    sub: "Plan, produce and distribute event swag from one partner—from pre-event kits and conference merch bars to post-event lead gifting.",
    proof: "✓ One brief. Every item, kit, venue and attendee.",
    cta: "Plan your next event",
    stats: [
      ["5", "cities in one order"],
      ["3K", "kits packed at scale"],
      ["92%", "on-time fulfillment"],
    ],
    sectionBefore: "Before. During. After.",
    sectionEm: "Every touchpoint covered.",
    body: "Use merchandise to increase attendance, create energy in the room and keep the conversation going after the event.",
    moments: [
      [
        "▣",
        "Pre-event drops that build anticipation",
        "Send speakers, attendees or distributed teammates everything they need before day one.",
        ["Registration-triggered gift links", "Speaker and VIP kits", "Individual or venue delivery"],
      ],
      [
        "▦",
        "Merch bars people remember",
        "Bring a curated pick-your-own swag experience to conferences, offsites and celebrations.",
        ["On-site size and style choice", "Scan-for-swag lead capture", "Staffed or self-serve formats"],
      ],
      [
        "✦",
        "Follow-up gifting that converts",
        "Turn booth scans and attendee lists into timely, trackable post-event campaigns.",
        ["Personalized recipient links", "Branded thank-you notes", "Redemption and delivery reporting"],
      ],
    ],
    workflowBefore: "Big-event energy.",
    workflowEm: "One calm workflow.",
    steps: [
      ["✦", "Share the brief", "Audience, format, dates and budget."],
      ["✦", "Curate & approve", "Products, samples, artwork and packaging."],
      ["▣", "Produce & kit", "In-house print, embroidery and packing."],
      ["⇢", "Deliver everywhere", "Venue, hotel, office or attendee doorstep."],
    ],
    control: "Built for the deadline that cannot move.",
    controlBody:
      "Keep vendors, production, packing lists and deliveries under one roof—with live status and a single accountable partner.",
    controls: ["Production timelines", "Multi-location shipping", "Attendee-level tracking", "One consolidated invoice"],
    dash: [
      "EVENT COMMAND CENTRE",
      "India SaaS Summit",
      "24 AUG",
      "2,400",
      "Packed",
      "3",
      "Venues",
      "600",
      "VIP kits",
      "BLR",
      "Venue delivery",
      "3 locations · one dispatch",
      "On track",
    ],
    floats: [
      ["✦", "Scan for swag", "Lead capture ready"],
      ["▣", "600 VIP kits", "Labels verified"],
    ],
  },
};

export function isTeamSlug(value: string | undefined): value is TeamSlug {
  return value === "hr" || value === "sales" || value === "events";
}
