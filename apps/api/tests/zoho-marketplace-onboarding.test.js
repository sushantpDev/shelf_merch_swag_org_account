import { describe, expect, it } from 'vitest';
import { getDocsHtml } from '../src/modules/docs/docs.controller.js';

describe('Zoho Marketplace website onboarding HTML', () => {
  it('uses a distinct content-specific illustration on each public Zoho page', () => {
    const paths = ['/docs/zoho-people', '/docs/zoho-people/user-guide', '/docs/zoho-people/admin-guide', '/case-studies/zoho-people'];
    const illustrations = paths.map(path => {
      const html = getDocsHtml(path);
      expect(html).not.toContain('zoho-onboarding-hero.webp');
      return html.match(/src="(\/images\/resources\/zoho\/zoho-[^"]+-hero-v1\.png)"/)?.[1];
    });
    expect(illustrations.every(Boolean)).toBe(true);
    expect(new Set(illustrations).size).toBe(4);
  });
  it('serves both existing account routes and preserves guide destinations', () => {
    const html = getDocsHtml('/docs/zoho-people');
    expect(html).toContain('href="/signup">Create ShelfMerch Account');
    expect(html).toContain('href="/login">Log In to ShelfMerch');
    expect(html).toContain('Integrations → Zoho People → Connect');
    expect(html).toContain('Employees are not synced automatically.');
    expect(html).toContain('a Zoho Web Tab is not required.');
    for (const path of ['/docs/zoho-people/user-guide', '/docs/zoho-people/admin-guide', '/case-studies/zoho-people']) {
      expect(html).toContain(`href="${path}"`);
    }
  });
  it.each(['/docs/zoho-people/user-guide', '/docs/zoho-people/admin-guide'])('%s uses the website flow and manual sync', path => {
    const html = getDocsHtml(path);
    expect(html).toContain('Integrations → Zoho People → Connect');
    expect(html).toContain('Sync now');
    expect(html).not.toContain('from the Web Tab');
    expect(html).not.toContain('Open the ShelfMerch Web Tab');
  });
});
