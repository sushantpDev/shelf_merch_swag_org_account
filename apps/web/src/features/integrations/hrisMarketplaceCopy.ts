import { isMergeHrisIntegration } from "@/services/merge-api";

export type HrisMarketplaceProfile = {
  categories: readonly [string, string];
  websiteLabel: string;
  websiteUrl: string;
  tagline: string;
  about: string;
  overview: readonly string[];
  setup: string;
  highlights: readonly string[];
  permissions: string;
};

type ProfileInput = {
  name: string;
  categories: readonly [string, string];
  websiteLabel: string;
  websiteUrl: string;
  tagline: string;
  noun: string;
};

function profile(input: ProfileInput): HrisMarketplaceProfile {
  const { name, noun } = input;
  return {
    categories: input.categories,
    websiteLabel: input.websiteLabel,
    websiteUrl: input.websiteUrl,
    tagline: input.tagline,
    about: `Use ${name} with Shelf Merch to keep ${noun} current for gifting, kits, and recognition.`,
    overview: [
      `Import people from ${name} so Shelf Merch knows who to gift.`,
      "Automatic sync keeps names, emails, and employment changes up to date.",
      "Open the employee directory and use synced people as Workspace Contacts.",
      "Disconnect anytime. Other Shelf Merch integrations stay intact.",
    ],
    setup: `Click Connect and authorize ShelfMerch with ${name}. Syncing starts automatically. Sync now is optional.`,
    highlights: [
      `Sync ${noun} from ${name} into Shelf Merch.`,
      "Keep Workspace Contacts ready for gifting after each sync.",
      "Automatic sync stays on. Sync now is only for an immediate refresh.",
    ],
    permissions: `Read the ${noun} you authorize from ${name}. Shelf Merch does not change records in ${name}.`,
  };
}

const HRIS = ["HRIS", "People management"] as const;

const PROFILES: Record<string, HrisMarketplaceProfile> = {
  workday: profile({
    name: "Workday",
    categories: HRIS,
    websiteLabel: "workday.com",
    websiteUrl: "https://www.workday.com",
    tagline: "Enterprise workforce platform",
    noun: "employee records",
  }),
  bamboohr: profile({
    name: "BambooHR",
    categories: HRIS,
    websiteLabel: "bamboohr.com",
    websiteUrl: "https://www.bamboohr.com",
    tagline: "HR software for growing teams",
    noun: "employee records",
  }),
  gusto: profile({
    name: "Gusto",
    categories: HRIS,
    websiteLabel: "gusto.com",
    websiteUrl: "https://www.gusto.com",
    tagline: "Payroll, benefits, and HR",
    noun: "employee profiles",
  }),
  keka: profile({
    name: "Keka",
    categories: HRIS,
    websiteLabel: "keka.com",
    websiteUrl: "https://www.keka.com",
    tagline: "Modern HR and payroll",
    noun: "people data",
  }),
  deel: profile({
    name: "Deel",
    categories: HRIS,
    websiteLabel: "deel.com",
    websiteUrl: "https://www.deel.com",
    tagline: "Global hiring and compliance",
    noun: "employee and contractor records",
  }),
  "ukg-pro": profile({
    name: "UKG Pro",
    categories: HRIS,
    websiteLabel: "ukg.com",
    websiteUrl: "https://www.ukg.com",
    tagline: "Workforce management suite",
    noun: "employee and org data",
  }),
  hibob: profile({
    name: "HiBob",
    categories: HRIS,
    websiteLabel: "hibob.com",
    websiteUrl: "https://www.hibob.com",
    tagline: "HR platform for modern companies",
    noun: "people data",
  }),
  "google-workspace": profile({
    name: "Google Workspace",
    categories: ["Directory", "App provisioning & SSO"],
    websiteLabel: "workspace.google.com",
    websiteUrl: "https://workspace.google.com",
    tagline: "Directory and productivity suite",
    noun: "directory users",
  }),
  "zoho-people": {
    ...profile({
      name: "Zoho People",
      categories: HRIS,
      websiteLabel: "zoho.com/people",
      websiteUrl: "https://www.zoho.com/people",
      tagline: "HR software for people operations",
      noun: "employee records",
    }),
    overview: [
      "Import people from Zoho People so Shelf Merch knows who to gift.",
      "After you connect, an administrator starts employee sync manually. Shelf Merch does not sync Zoho People on a schedule.",
      "Open the employee directory and use synced people as Workspace Contacts.",
      "Disconnect anytime. Other Shelf Merch integrations stay intact. Previously imported contacts are kept.",
    ],
    setup:
      "Click Connect and authorize ShelfMerch with Zoho People. Then click Sync now to import employees. Sync does not start by itself.",
    highlights: [
      "Sync employee records from Zoho People into Shelf Merch when you choose.",
      "Keep Workspace Contacts ready for gifting after each manual sync.",
      "Run Sync now whenever you want a fresh import. There is no automatic Zoho People sync.",
    ],
  },
};

export function isHrisMarketplaceTile(id: string) {
  return id === "zoho-people" || isMergeHrisIntegration(id);
}

export function getHrisMarketplaceProfile(id: string): HrisMarketplaceProfile | null {
  return PROFILES[id] ?? null;
}
