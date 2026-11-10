import { describe, expect, it } from 'vitest';
import { formatAssistantTextForCards, toolContentForModel } from '../src/modules/copilot/copilotResponseFormat.js';

describe('formatAssistantTextForCards', () => {
  it('removes product markdown tables and image URLs when product artifacts exist', () => {
    const text = [
      'Here are five apparel options.',
      '',
      '| Name | SKU | Price | Image |',
      '| --- | --- | --- | --- |',
      '| Tee | T1 | 499 | https://cdn.example.com/a.png |',
      '',
      'Want details on any of them?',
    ].join('\n');
    const cleaned = formatAssistantTextForCards(text, [
      { kind: 'product', product: { id: '1', name: 'Tee' } },
    ]);
    expect(cleaned).toContain('Here are five apparel options.');
    expect(cleaned).toContain('Want details on any of them?');
    expect(cleaned).not.toContain('|');
    expect(cleaned).not.toContain('https://cdn.example.com');
  });

  it('removes kit tables when kit artifacts exist', () => {
    const cleaned = formatAssistantTextForCards(
      'Kits:\n| Kit | Image |\n| --- | --- |\n| Welcome | https://cdn.example.com/k.png |',
      [{ kind: 'kit', kit: { id: 'k1', name: 'Welcome' } }],
    );
    expect(cleaned).toContain('Kits:');
    expect(cleaned).not.toContain('cdn.example.com');
  });

  it('keeps financial markdown tables when only wallet artifacts exist', () => {
    const text = [
      'Department allocation:',
      '| Department | Allocated |',
      '| --- | --- |',
      '| Marketing | 5000 |',
    ].join('\n');
    const cleaned = formatAssistantTextForCards(text, [
      {
        kind: 'wallet_balance',
        wallet: { balance: 20000, allocatedAmount: 7000, unallocatedAmount: 13000 },
      },
    ]);
    expect(cleaned).toContain('| Department | Allocated |');
    expect(cleaned).toContain('| Marketing | 5000 |');
  });
});

describe('toolContentForModel', () => {
  it('returns short catalog summaries when product cards were emitted', () => {
    const search = toolContentForModel(
      'catalog_search',
      {
        items: [{ id: '1', name: 'Tee', primaryImageUrl: 'https://cdn.example.com/t.png', variants: [{ stock: 99 }] }],
        pagination: { page: 1, totalPages: 3, total: 40 },
      },
      [{ kind: 'product', product: { id: '1', name: 'Tee' } }],
    );
    expect(search).toContain('catalog product card');
    expect(search).not.toContain('cdn.example.com');
    expect(search).not.toContain('stock');

    const detail = toolContentForModel(
      'catalog_get_product',
      { id: '1', name: 'Tee', primaryImageUrl: 'https://cdn.example.com/t.png' },
      [{ kind: 'product', product: { id: '1', name: 'Tee' } }],
    );
    expect(detail).toContain('catalog product card');
    expect(detail).not.toContain('cdn.example.com');
  });

  it('returns short kit summaries when kit cards were emitted', () => {
    const text = toolContentForModel(
      'kits_list',
      { items: [{ id: 'k1', name: 'Welcome', imageUrl: 'https://cdn.example.com/k.png' }] },
      [{ kind: 'kit', kit: { id: 'k1', name: 'Welcome' } }],
    );
    expect(text).toContain('kit card');
    expect(text).not.toContain('cdn.example.com');
  });

  it('keeps JSON for non-card tools and errors', () => {
    const shops = toolContentForModel('shops_list', { shops: [{ id: '1', name: 'A' }] }, []);
    expect(shops).toContain('"shops"');
    const err = toolContentForModel('catalog_search', { error: 'boom' }, [{ kind: 'product', product: { id: '1' } }]);
    expect(err).toContain('boom');
  });
});