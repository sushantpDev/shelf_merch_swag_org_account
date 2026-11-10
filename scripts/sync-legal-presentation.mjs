import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// Share presentation with the React pages while preserving each static document verbatim.
const root = new URL('../', import.meta.url);
const css = await readFile(new URL('apps/web/src/features/legal/legal.css', root), 'utf8');
const fonts = ':root{--font-family-public-sans:Arial,Helvetica,sans-serif;--font-family-public-serif:Georgia,"Times New Roman",serif;--font-weight-semibold:600;--font-weight-medium:500;}body{margin:0}';

for (const [name, variant, eyebrow, title] of [
  ['privacy-policy', 'privacy', 'YOUR DATA, EXPLAINED CLEARLY', 'Privacy <em>Policy</em>'],
  ['terms-of-service', 'terms', 'THE DETAILS, MADE CLEAR', 'Terms of <em>Service</em>'],
]) {
  const file = new URL(`apps/api/src/static/${name}.html`, root);
  let html = await readFile(file, 'utf8');
  const originalArticle = html.match(/<article class="legal-article">([\s\S]*?)<\/article>/)?.[1];
  assert.ok(originalArticle, `Missing legal article: ${name}`);
  html = html.replace(/<style>[\s\S]*?<\/style>/, `<style>${fonts}\n${css}</style>`);
  if (!html.includes('<div class="legal-reading-layout">')) {
    const date = originalArticle.match(/<p class="legal-updated">[\s\S]*?<\/p>/)?.[0];
    assert.ok(date, `Missing update date: ${name}`);
    const content = originalArticle.replace(/\s*<h1>[\s\S]*?<\/h1>\s*<p class="legal-updated">[\s\S]*?<\/p>/, '');
    const headings = [...content.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)];
    assert.ok(headings.length, `Missing section anchors: ${name}`);
    const nav = headings.map(([, id, label]) => `<a href="#${id}">${label}</a>`).join('\n');
    html = html.replace('class="legal-shell"', `class="legal-shell legal-shell--${variant}"`)
      .replace('<a class="legal-logo" href="/">ShelfMerch</a>', '<a class="legal-logo-link" href="/" aria-label="ShelfMerch home"><img src="/images/logo/shelfmerch-wordmark.png" alt="Shelf Merch" height="36" /></a>')
      .replace(/<article class="legal-article">[\s\S]*?<\/article>/,
        `<header class="legal-hero"><span class="legal-eyebrow">${eyebrow}</span><h1>${title}</h1>${date}</header><div class="legal-reading-layout"><aside class="legal-contents"><details${variant === 'privacy' ? ' open' : ''}><summary>IN THIS DOCUMENT</summary><nav aria-label="Document sections">${nav}</nav></details></aside><article class="legal-article">${content}</article></div>`);
    assert.equal(html.match(/<article class="legal-article">([\s\S]*?)<\/article>/)?.[1], content);
    assert.ok(html.includes(date));
  } else {
    assert.equal(html.match(/<article class="legal-article">([\s\S]*?)<\/article>/)?.[1], originalArticle);
  }
  await writeFile(file, html);
  console.log(`${fileURLToPath(file)}: presentation synced; legal article preserved`);
}
