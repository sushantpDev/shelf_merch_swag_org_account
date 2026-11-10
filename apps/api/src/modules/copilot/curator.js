import { z } from 'zod';

export const CURATOR_LIMITS = Object.freeze({ modelCalls: 2, searches: 3, pageSize: 12, candidates: 24, concepts: 3, historyChars: 7200 });
const text = z.string().trim().max(240);
export const briefPlanSchema = z.object({
  brief: z.object({
    company: text.optional(), occasion: text.optional(), recipients: z.number().int().min(1).max(100000).optional(),
    budgetPerRecipient: z.number().positive().max(10000000).optional(), totalBudget: z.number().positive().max(1000000000).optional(),
    currency: z.enum(['INR', 'USD', 'EUR', 'GBP']).optional(), exclusions: z.array(text).max(12).optional(),
    style: text.optional(),
  }).strict(),
  queries: z.array(z.string().max(80)).max(3).default([]),
  replaceExclusions: z.boolean().default(false),
}).strict();
export const conceptPlanSchema = z.object({
  concepts: z.array(z.object({
    name: z.string().max(80), rationale: text, packaging: text,
    itemIds: z.array(z.string().max(100)).max(5).default([]),
    ideas: z.array(z.object({ name: z.string().max(80), description: text })).max(5).default([]),
  }).strict()).max(3),
}).strict();

export function curatorSource(content, previous = 'shelfmerch') {
  if (/\b(?:outside|beyond|not (?:from|on)|other than)\s+shelf\s?merch\b|\bexternal\b|\bother brands\b/i.test(content)) return 'external';
  if (/\b(?:use|show|from|only|back to|switch to)\s+(?:the\s+)?shelf\s?merch\b|\bshelf\s?merch (?:catalog|only)\b/i.test(content)) return 'shelfmerch';
  return previous;
}
const aliases = {
  mugs: ['mug', 'mugs', 'cup', 'cups'], bottles: ['bottle', 'bottles', 'flask', 'flasks', 'tumbler', 'tumblers'],
  apparel: ['apparel', 'clothing', 't-shirt', 'tee', 'shirt', 'hoodie', 'jacket', 'socks', 'cap', 'polo', 'sweatshirt'],
  bags: ['bag', 'bags', 'backpack', 'backpacks', 'tote', 'totes', 'pouch'],
};
export function exclusionTerms(exclusions = []) {
  return [...new Set(exclusions.flatMap(value => {
    const lower = value.toLowerCase();
    return [lower, ...Object.entries(aliases).filter(([key, values]) => key === lower || values.includes(lower)).flatMap(([, values]) => values)];
  }))];
}
export function excluded(item, exclusions) {
  const hay = [item.name, item.category, item.subcategory, item.childCategory, ...(item.products || []).map(p => p.name)].filter(Boolean).join(' ').toLowerCase();
  return exclusionTerms(exclusions).some(term => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(hay);
  });
}
export function mergeBrief(previous = {}, patch = {}, content = '', replace = false) {
  const brief = { ...previous, ...patch };
  brief.exclusions = replace && /\b(?:allow|include|remove|instead|change|stop excluding|no longer|only exclude)\b/i.test(content) ? patch.exclusions || [] : [...new Set([...(previous.exclusions || []), ...(patch.exclusions || [])])].slice(0, 12);
  brief.source = curatorSource(content, previous.source || 'shelfmerch');
  // Deterministic preservation of explicit common constraints, even if extraction misses them.
  const recipients = content.match(/\b(?:for|to)\s+(\d[\d,]*)\s+(?:(?:[A-Z][\w-]*)\s+)?(?:employees?|people|recipients?|staff|new hires?)\b/i);
  if (recipients) brief.recipients = Number(recipients[1].replaceAll(',', ''));
  const company = content.match(/\b(?:at|from)\s+([A-Z][\w&.-]*(?:\s+[A-Z][\w&.-]*){0,2})(?=[,.]|\s+(?:with|under|for|employees)|$)/) || content.match(/\b\d+\s+([A-Z][\w&.-]*)\s+employees\b/);
  if (company) brief.company = company[1];
  const money = content.match(/(?:₹|INR\s*|Rs\.?\s*)([\d,]+(?:\.\d+)?)/i);
  if (patch.totalBudget && !patch.budgetPerRecipient && brief.recipients) brief.budgetPerRecipient = patch.totalBudget / brief.recipients;
  if (money) {
    const amount = Number(money[1].replaceAll(',', ''));
    if (amount > 0) { brief.currency = 'INR'; if (/\btotal(?: budget)?\b|\boverall\b/i.test(content) && !/per (?:employee|person|recipient)|each/i.test(content)) { brief.totalBudget = amount; if (brief.recipients) brief.budgetPerRecipient = amount / brief.recipients; } else brief.budgetPerRecipient = amount; }
  }
  if (/\bwelcome|onboarding|new hires?\b/i.test(content)) brief.occasion = 'Welcome / Onboarding';
  const no = content.match(/\b(?:avoid|no|exclude|excluding|without)\s+([^.!?]+)/i);
  if (no) {
    const found = Object.entries(aliases).filter(([key, terms]) => [key, ...terms].some(t => new RegExp(`\\b${t}\\b`, 'i').test(no[1]))).map(([key]) => key);
    brief.exclusions = [...new Set([...brief.exclusions, ...found])];
  }
  if (brief.totalBudget && brief.recipients && !brief.budgetPerRecipient) brief.budgetPerRecipient = brief.totalBudget / brief.recipients;
  return brief;
}
export function missingBrief(brief) {
  return [!brief.occasion && 'occasion', !brief.recipients && 'recipient count', !brief.budgetPerRecipient && 'budget per person'].filter(Boolean);
}
export function eligibleCandidate(item, brief) {
  if (!item?.id || !item.name || excluded(item, brief.exclusions)) return false;
  if (item.kind === 'kit' && brief.exclusions?.length && !(item.products || []).length) return false;
  if (item.kind === 'kit' && item.status && item.status !== 'live') return false;
  if (item.variants?.length && item.variants.every(v => typeof v.stock === 'number' && v.stock <= 0)) return false;
  const price = item.sellingPriceInr ?? item.priceInr;
  return !(brief.currency === 'INR' && Number.isFinite(price) && price > brief.budgetPerRecipient);
}
function cleanIdea(value) {
  return String(value || '').replace(/https?:\/\/\S+|www\.\S+/gi, '').replace(/(?:₹|\$|€|£|INR|USD|EUR|GBP)\s*[\d,.]+/gi, '').trim().slice(0, 240);
}
export function buildConcepts(plan, candidates, brief) {
  const byId = new Map(candidates.map(item => [item.key, item]));
  return plan.concepts.slice(0, 3).map((concept, index) => {
    const external = brief.source === 'external';
    const items = external
      ? concept.ideas.filter(idea => !excluded(idea, brief.exclusions)).map((idea, n) => ({ key: `idea:${index}:${n}`, kind: 'idea', source: 'inspiration', name: cleanIdea(idea.name), description: cleanIdea(idea.description), currency: null, price: null, availability: 'Availability unknown' })).filter(i => i.name)
      : [...new Set(concept.itemIds)].map(id => byId.get(id)).filter(item => item && eligibleCandidate(item, brief));
    const known = items.filter(i => i.currency === 'INR' && Number.isFinite(i.price));
    const perRecipient = known.reduce((sum, i) => sum + i.price, 0);
    const complete = known.length === items.length && items.length > 0;
    return {
      id: `concept:${index}`, name: cleanIdea(concept.name), rationale: cleanIdea(concept.rationale), packaging: cleanIdea(concept.packaging),
      kind: external ? 'inspiration' : items.length === 1 && items[0].kind === 'kit' ? 'existing_kit' : 'catalog_combination',
      items, knownPerRecipient: perRecipient, completePrice: complete,
      estimatedTotal: brief.recipients && known.length ? Math.round(perRecipient * brief.recipients * 100) / 100 : null,
      overBudget: brief.currency === 'INR' && Boolean(brief.budgetPerRecipient) && perRecipient > brief.budgetPerRecipient,
    };
  }).filter(c => c.items.length);
}
export function boundedCuratorHistory(messages) {
  let left = CURATOR_LIMITS.historyChars;
  const result = [];
  for (const row of [...messages].reverse()) {
    if (!['user', 'assistant'].includes(row.role) || !left) continue;
    const content = String(row.content || '').slice(0, Math.min(1200, left));
    left -= content.length;
    if (content) result.unshift({ role: row.role, content });
    if (result.length >= 6) break;
  }
  return result;
}
