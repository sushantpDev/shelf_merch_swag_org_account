import { describe, expect, it } from 'vitest';
import { mergeBrowserTagCsp, mergeOpenAiPixelCsp } from '../src/config/openaiPixelCsp.js';

describe('OpenAI measurement pixel CSP', () => {
  it('adds the documented script, connect, and image hosts without replacing existing sources', () => {
    const merged = mergeOpenAiPixelCsp({
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", 'https:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
    });

    expect(merged.scriptSrc).toEqual(["'self'", 'https://bzrcdn.openai.com']);
    expect(merged.connectSrc).toEqual([
      "'self'",
      'https:',
      'https://bzr.openai.com',
      'https://bzrcdn.openai.com',
    ]);
    expect(merged.imgSrc).toEqual([
      "'self'",
      'data:',
      'blob:',
      'https:',
      'https://bzr.openai.com',
    ]);
    expect(merged.connectSrc).toContain('https:');
    expect(merged.scriptSrc).not.toContain('https://www.googletagmanager.com');
    expect(merged.scriptSrcElem).toBeUndefined();
  });

  it('allows the existing GTM, GA4, and Meta script hosts without removing self', () => {
    const merged = mergeBrowserTagCsp({ scriptSrc: ["'self'"] });
    expect(merged.scriptSrc).toEqual([
      "'self'",
      'https://www.googletagmanager.com',
      'https://www.google-analytics.com',
      'https://connect.facebook.net',
    ]);
  });
});
