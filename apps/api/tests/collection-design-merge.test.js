import { describe, expect, it } from 'vitest';
import {
  isCollectionLinkedToAnyShop,
  mergeProductRefsPreservingDesign,
} from '../src/modules/collections/collectionQueries.js';

describe('mergeProductRefsPreservingDesign', () => {
  it('preserves mockup and placement when the client omits design fields', () => {
    const existing = [{
      catalogProductId: 'p1',
      name: 'Mug',
      mockupUrl: 'https://cdn.test/old-mock.png',
      designOnlyImageUrl: 'https://cdn.test/old-design.png',
      placement: { xPct: 11, yPct: 22, wPct: 33, rot: 0 },
      placements: [{ key: 'front', xPct: 11, yPct: 22, wPct: 33, rot: 0 }],
      printSpec: { widthIn: 4, heightIn: 3, dpi: 300, widthPx: 1200, heightPx: 900 },
    }];
    const incoming = [{ catalogProductId: 'p1', name: 'Mug Renamed', brand: 'Acme', group: 'mug' }];
    const merged = mergeProductRefsPreservingDesign(existing, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      name: 'Mug Renamed',
      brand: 'Acme',
      mockupUrl: 'https://cdn.test/old-mock.png',
      designOnlyImageUrl: 'https://cdn.test/old-design.png',
      placement: { xPct: 11, yPct: 22, wPct: 33, rot: 0 },
      printSpec: { widthIn: 4, heightIn: 3, dpi: 300, widthPx: 1200, heightPx: 900 },
    });
    expect(merged[0].placements[0].key).toBe('front');
  });

  it('keeps explicit incoming design fields instead of restoring stale ones', () => {
    const existing = [{
      catalogProductId: 'p1',
      name: 'Mug',
      mockupUrl: 'https://cdn.test/old-mock.png',
      placement: { xPct: 1, yPct: 2, wPct: 3, rot: 0 },
    }];
    const incoming = [{
      catalogProductId: 'p1',
      name: 'Mug',
      mockupUrl: 'https://cdn.test/new-mock.png',
      placement: { xPct: 9, yPct: 8, wPct: 7, rot: 5 },
    }];
    const merged = mergeProductRefsPreservingDesign(existing, incoming);
    expect(merged[0].mockupUrl).toBe('https://cdn.test/new-mock.png');
    expect(merged[0].placement).toMatchObject({ xPct: 9, yPct: 8, wPct: 7, rot: 5 });
  });

  it('does not invent design data for newly added products', () => {
    const existing = [{ catalogProductId: 'p1', name: 'Old', mockupUrl: 'https://cdn.test/a.png' }];
    const incoming = [
      { catalogProductId: 'p1', name: 'Old' },
      { catalogProductId: 'p2', name: 'New' },
    ];
    const merged = mergeProductRefsPreservingDesign(existing, incoming);
    expect(merged[1]).toEqual({ catalogProductId: 'p2', name: 'New' });
    expect(merged[0].mockupUrl).toBe('https://cdn.test/a.png');
  });
});

describe('isCollectionLinkedToAnyShop', () => {
  it('detects shopIds, legacy shopId, and shopPublish', () => {
    expect(isCollectionLinkedToAnyShop({ shopIds: ['a'] })).toBe(true);
    expect(isCollectionLinkedToAnyShop({ shopId: 'b', shopIds: [] })).toBe(true);
    expect(isCollectionLinkedToAnyShop({ shopPublish: [{ shopId: 'c' }] })).toBe(true);
    expect(isCollectionLinkedToAnyShop({ shopIds: [], shopId: null })).toBe(false);
  });
});
