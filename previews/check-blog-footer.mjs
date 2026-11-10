import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import { blogFooter } from '../apps/api/src/modules/blog/blogFooterView.js';

const html = blogFooter();
const window = new Window();
window.document.body.innerHTML = html;
const doc = window.document;
assert.equal(doc.querySelectorAll('.journal-footer__col').length, 5);
assert.equal(doc.querySelectorAll('.journal-footer__accordion details').length, 5);
assert.equal(doc.querySelectorAll('.journal-footer__socials a').length, 4);
assert.equal(doc.querySelectorAll('.journal-footer__contact').length, 3);
const existing = await readFile('apps/web/src/components/landing/Footer.tsx', 'utf8');
for (const [, href] of existing.matchAll(/(?:href|to)="([^"]+)"/g)) {
  assert(html.includes(`href="${href}"`), `Main-site footer link missing: ${href}`);
}
assert(doc.body.textContent.includes('Human Resource'));
assert(doc.body.textContent.includes('9515888515'));
assert(doc.body.textContent.includes('Mon to Fri, 9:00 AM to 6:00 PM'));
const live = await fetch('http://localhost:8080/blog');
assert.equal(live.status, 200);
const response = await live.text();
assert(response.includes('class="journal-footer"'));
assert(!response.includes('<footer class="blog-footer">'));
console.log('Blog footer matches all main-site links, five sections, social icons, contact details and mobile accordions. Live /blog returned the new footer.');
window.happyDOM.abort();
