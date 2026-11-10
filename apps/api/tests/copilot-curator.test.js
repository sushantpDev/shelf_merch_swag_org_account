import { describe, it, expect } from 'vitest';
import { mergeBrief, curatorSource, eligibleCandidate, buildConcepts, boundedCuratorHistory, CURATOR_LIMITS } from '../src/modules/copilot/curator.js';
import { readCuratorCandidates } from '../src/modules/copilot/copilotCurator.service.js';
const request = 'I need unique welcome gifts for 10 Toast employees, ₹3,000 each. Avoid mugs, bottles, apparel and bags.';
describe('curator constraints and provenance', () => {
  it('retains Toast, occasion, count, budget and explicit exclusions across refinements', () => {
    const brief = mergeBrief({}, { style: 'unique' }, request);
    expect(brief).toMatchObject({ company: 'Toast', occasion: 'Welcome / Onboarding', recipients: 10, currency: 'INR', budgetPerRecipient: 3000, exclusions: ['mugs', 'bottles', 'apparel', 'bags'] });
    expect(mergeBrief(brief, { style: 'premium' }, 'Something more premium')).toMatchObject({ ...brief, style: 'premium' });
  });
  it('keeps external source for follow-ups until explicitly changed', () => {
    expect(curatorSource('Show me products not from ShelfMerch')).toBe('external');
    expect(curatorSource('Show more unusual products', 'external')).toBe('external');
    expect(curatorSource('Switch to ShelfMerch catalog', 'external')).toBe('shelfmerch');
  });
  it('does not call any catalog reader for external inspiration', async () => {
    let called = false;
    expect(await readCuratorCandidates({ brief: { source: 'external' }, queries: [], read: async () => { called = true; } })).toEqual([]);
    expect(called).toBe(false);
  });
  it('filters exclusion aliases, stock, expensive products and kits with unverified contents', () => {
    const brief = mergeBrief({}, {}, request);
    for (const name of ['Ceramic Mug', 'Steel Flask', 'Cotton Tee', 'Laptop Backpack']) expect(eligibleCandidate({ id: 'x', name, sellingPriceInr: 500 }, brief)).toBe(false);
    expect(eligibleCandidate({ id: 'x', name: 'Desk lamp', sellingPriceInr: 4000 }, brief)).toBe(false);
    expect(eligibleCandidate({ id: 'x', name: 'Desk lamp', variants: [{ stock: 0 }] }, brief)).toBe(false);
    expect(eligibleCandidate({ id: 'x', name: 'Mystery kit', kind: 'kit', products: [] }, brief)).toBe(false);
    expect(eligibleCandidate({ id: 'x', name: 'Desk lamp', sellingPriceInr: 1000 }, brief)).toBe(true);
  });
  it('builds meaningful concepts only from fetched IDs and computes authoritative totals', () => {
    const item = { key: 'product:real', id: 'real', name: 'Desk lamp', price: 1000, currency: 'INR', source: 'shelfmerch', sellingPriceInr: 1000, kind: 'product', imageUrl: 'https://official.test/lamp.jpg' };
    const concepts = buildConcepts({ concepts: [{ name: 'Premium desk', rationale: 'Practical for day one', packaging: 'Reusable box', itemIds: ['product:real', 'product:invented'] }] }, [item], { source: 'shelfmerch', recipients: 10, budgetPerRecipient: 3000, currency: 'INR' });
    expect(concepts[0]).toMatchObject({ knownPerRecipient: 1000, estimatedTotal: 10000, completePrice: true, kind: 'catalog_combination', items: [item] });
  });
  it('external ideas cannot carry fabricated prices, links or images', () => {
    const concepts = buildConcepts({ concepts: [{ name: 'Wellness', rationale: 'Quiet moments', packaging: 'Box', itemIds: ['fake'], ideas: [{ name: 'Massage voucher ₹500', description: 'https://fake.test/item USD 20' }] }] }, [], { source: 'external', recipients: 10 });
    expect(concepts[0]).toMatchObject({ completePrice: false, estimatedTotal: null });
    expect(concepts[0].items[0]).toMatchObject({ price: null, currency: null, source: 'inspiration' });
    expect(JSON.stringify(concepts)).not.toMatch(/fake.test|₹500|USD 20|imageUrl/);
  });
  it('keeps unknown prices partial and never mixes currencies into verified totals', () => {
    const items = [{ key: 'known', id: '1', name: 'Known', price: 100, currency: 'INR' }, { key: 'unknown', id: '2', name: 'Unknown', price: null, currency: null }];
    const [concept] = buildConcepts({ concepts: [{ name: 'Mix', itemIds: ['known', 'unknown'] }] }, items, { source: 'shelfmerch', recipients: 5 });
    expect(concept).toMatchObject({ knownPerRecipient: 100, estimatedTotal: 500, completePrice: false });
  });
  it('bounds history and catalog result requests', async () => {
    expect(boundedCuratorHistory(Array.from({ length: 100 }, () => ({ role: 'user', content: 'x'.repeat(20000) }))).reduce((n, m) => n + m.content.length, 0)).toBeLessThanOrEqual(CURATOR_LIMITS.historyChars);
    const calls = [];
    await readCuratorCandidates({ brief: { source: 'shelfmerch' }, queries: ['a', 'b', 'c', 'd'], role: 'company_admin', read: async (name, ctx, args) => { calls.push({ name, args }); return { result: { items: [] } }; } });
    expect(calls.filter(c => c.name === 'catalog_search')).toHaveLength(3);
    expect(calls.every(c => !/prepare|execute|wallet|campaign/.test(c.name))).toBe(true);
    expect(calls.every(c => c.args.limit <= 12)).toBe(true);
  });
});
