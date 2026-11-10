export type GiftingBrief = {
  company?: string; occasion?: string; recipients?: number; budgetPerRecipient?: number; totalBudget?: number;
  currency?: string; exclusions?: string[]; style?: string; source?: "shelfmerch" | "external";
};
export type CuratorItem = {
  key: string; id?: string; kind: "product" | "kit" | "idea"; source: "shelfmerch" | "inspiration";
  name: string; description?: string; imageUrl?: string; price: number | null; currency: string | null;
  availability: string; curated?: boolean; products?: Array<{ name: string; quantity?: number }>;
};
export type CuratorConcept = {
  id: string; name: string; rationale: string; packaging: string;
  kind: "existing_kit" | "catalog_combination" | "inspiration"; items: CuratorItem[];
  knownPerRecipient: number; completePrice: boolean; estimatedTotal: number | null; overBudget: boolean;
};
export type Curation = {
  brief: GiftingBrief; concepts: CuratorConcept[]; suggestions: string[];
  generatedAt?: string; externalResearchAvailable: boolean; imageGenerationAvailable: boolean;
};
export function shortlistSummary(items: CuratorItem[], brief: GiftingBrief) {
  const totals: Record<string, number> = {};
  let missing = 0;
  for (const item of items) {
    if (item.price == null || !Number.isFinite(item.price) || !item.currency) { missing += 1; continue; }
    totals[item.currency] = (totals[item.currency] || 0) + item.price;
  }
  const comparable = !missing && Object.keys(totals).length === 1 && Boolean(brief.currency && totals[brief.currency] != null);
  const difference = comparable && brief.budgetPerRecipient != null ? brief.budgetPerRecipient - totals[brief.currency!] : null;
  return { totals, missing, difference };
}
/** Integration contract only. No image generation provider is currently installed. */
export interface GiftConceptImageProvider {
  generate(input: { theme: string; company?: string; officialProductImages: string[]; signal?: AbortSignal }): Promise<{
    imageUrl: string; provenance: "generated-concept"; generatedAt: string;
  }>;
}
/** Future verified external research must supply provenance, not model-invented shopping data. */
export interface ExternalGiftResearchProvider {
  search(input: { query: string; currency?: string; signal?: AbortSignal }): Promise<Array<{
    name: string; source: string; productUrl: string; imageUrl?: string; price?: number; currency?: string;
    availability?: string; merchant?: string; retrievedAt: string;
  }>>;
}
