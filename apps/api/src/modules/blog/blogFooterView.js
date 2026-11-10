const sections = [
  ['Platform', [['Features', '/platform'], ['Integrations', '/platform#connects']]],
  ['Resources', [['Blog', '/blog'], ['Human Resource', '/resources/human-resources'], ['Sales &amp; Marketing', '/resources/sales'], ['Events', '/resources/events']]],
  ['Catalog', [['All Products', '/apps/catalog'], ['Apparel', '/apps/catalog?category=Apparel'], ['Drinkware', '/apps/catalog?category=Drinkware'], ['Office Supplies', '/apps/catalog?category=Office%20Supplies'], ['Tech Accessories', '/apps/catalog?category=Technology'], ['Kits', '/apps/catalog']]],
  ['About Us', [['Book a Demo', '/request-demo'], ['Careers', '/careers']]],
  ['Legal', [['Terms &amp; Conditions', '/terms-condition'], ['Privacy Policy', '/privacy'], ['Cookie preferences', '/privacy#cookie-preferences'], ['Refund Policy'], ['Shipping Policy'], ['Cookie Policy']]],
];

const icon = (body, filled = false) => `<svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="${filled ? 'currentColor' : 'none'}" stroke="${filled ? 'none' : 'currentColor'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const socials = [
  ['Facebook', 'https://www.facebook.com/people/Shelfmerch/100085365945333/', icon('<path d="M14 8h3V4h-3c-2.8 0-5 2.2-5 5v2H6v4h3v7h4v-7h3.2L17 11h-4V9c0-.6.4-1 1-1Z"/>', true)],
  ['Instagram', 'https://www.instagram.com/shelfmerch/', icon('<rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.5"/><circle cx="17.2" cy="6.8" r=".8" fill="currentColor" stroke="none"/>')],
  ['LinkedIn', 'https://in.linkedin.com/company/shelfmerch', icon('<path d="M6.5 9H3.7v11h2.8V9ZM5.1 4C4.1 4 3.3 4.8 3.3 5.8S4.1 7.6 5.1 7.6 6.9 6.8 6.9 5.8 6.1 4 5.1 4ZM20.3 13.4c0-3.1-1.6-4.6-3.9-4.6-1.8 0-2.6 1-3.1 1.7V9H10.5c0 1.3 0 11 0 11h2.8v-6.1c.2-.7.8-1.6 1.9-1.6 1.3 0 2.3.9 2.3 2.8V20h2.8v-6.6Z"/>', true)],
  ['YouTube', 'https://www.youtube.com/@shelfmerch', icon('<path d="M21.6 7.2a2.7 2.7 0 0 0-1.9-1.9C18 5 12 5 12 5s-6 0-7.7.3A2.7 2.7 0 0 0 2.4 7.2 28 28 0 0 0 2 12a28 28 0 0 0 .4 4.8 2.7 2.7 0 0 0 1.9 1.9C6 19 12 19 12 19s6 0 7.7-.3a2.7 2.7 0 0 0 1.9-1.9A28 28 0 0 0 22 12a28 28 0 0 0-.4-4.8ZM10 15.4V8.6L15.5 12 10 15.4Z"/>', true)],
];

const links = items => items.map(([label, href]) => href ? `<a href="${href}">${label}</a>` : `<span>${label}</span>`).join('');

export function blogFooter() {
  return `<footer class="journal-footer" aria-label="Site footer">
    <div class="journal-footer__top">
      <div class="journal-footer__brand"><a class="journal-footer__logo" href="/" aria-label="Shelf Merch home"><img src="/images/logo/shelfmerch-wordmark-white.png" alt="Shelf Merch" width="160" height="28" /></a><p>Merch. Gifting. Recognition.<br />Made and delivered across India.</p><div class="journal-footer__socials" aria-label="Social media">${socials.map(([label, href, svg]) => `<a href="${href}" target="_blank" rel="noopener noreferrer" aria-label="Shelf Merch on ${label}">${svg}</a>`).join('')}</div></div>
      ${sections.map(([title, items]) => `<div class="journal-footer__col"><h4>${title}</h4>${links(items)}</div>`).join('')}
    </div>
    <div class="journal-footer__accordion">${sections.map(([title, items]) => `<details name="journal-footer-sections"><summary>${title}</summary><div>${links(items)}</div></details>`).join('')}</div>
    <div class="journal-footer__bottom">
      <div class="journal-footer__contact"><span class="journal-footer__contact-icon">${icon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>')}</span><p><small>Need help?</small><a href="mailto:support@shelfmerch.com">support@shelfmerch.com</a></p></div>
      <div class="journal-footer__contact"><span class="journal-footer__contact-icon">${icon('<path d="M7 3h3l1.5 4-2 1.2a12 12 0 0 0 6.3 6.3L17 12.5l4 1.5v3A16 16 0 0 1 7 3Z"/>')}</span><p><small>Call us</small><a href="tel:+919515888515">9515888515</a></p></div>
      <div class="journal-footer__contact"><span class="journal-footer__contact-icon">${icon('<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 3.5"/>')}</span><p><small>Mon to Fri, 9:00 AM to 6:00 PM</small><strong>We’re here to help</strong></p></div>
      <span class="journal-footer__copyright">© ${new Date().getUTCFullYear()} ShelfMerch. All rights reserved.</span>
    </div>
  </footer>`;
}

export const BLOG_FOOTER_STYLES = `
.journal-footer{display:flex;flex-direction:column;background:#111;color:#fff;padding:56px 5.1vw 28px;font-family:Arial,Helvetica,sans-serif}
.journal-footer__top{display:grid;grid-template-columns:minmax(180px,1.4fr) repeat(5,minmax(0,1fr));gap:32px clamp(28px,4.5vw,72px);align-items:start;width:100%;padding-bottom:36px;border-bottom:1px solid #ffffff1f}
.journal-footer__logo{display:inline-flex;align-items:center;margin-bottom:16px}.journal-footer__logo img{height:28px;width:auto;max-width:220px;object-fit:contain}
.journal-footer .journal-footer__brand>p{margin:0 0 20px;color:#9a9a9a;font-size:13px;line-height:1.6}
.journal-footer__socials{display:flex;gap:10px}.journal-footer__socials a,.journal-footer__contact-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#2a2a2a;color:#fff;text-decoration:none;flex-shrink:0}
.journal-footer__col h4{margin:0 0 14px;font-size:14px;font-weight:700;color:#fff;line-height:1.4}.journal-footer__col>a,.journal-footer__col>span{display:block;margin:0 0 9px;color:#9a9a9a;font-size:13px;line-height:1.4;text-decoration:none}.journal-footer a:hover{color:#fff;text-decoration:underline;text-underline-offset:4px}
.journal-footer__bottom{display:grid;grid-template-columns:1fr 1fr 1.2fr auto;gap:18px 24px;align-items:center;padding-top:22px}.journal-footer__contact{display:flex;align-items:center;gap:12px;min-width:0;padding-right:18px;border-right:1px solid #ffffff1f}.journal-footer__contact:nth-child(3){border:0}.journal-footer__contact-icon{width:36px;height:36px}.journal-footer__contact p{margin:0;line-height:1.6}.journal-footer__contact small{display:block;font-size:12px;color:#9a9a9a}.journal-footer__contact a,.journal-footer__contact strong{display:block;color:#fff;font-size:13px;font-weight:600;text-decoration:none}.journal-footer__copyright{justify-self:end;font-size:12px;color:#8a8a8a;white-space:nowrap}.journal-footer__accordion{display:none}
@media(max-width:1100px){.journal-footer__top{grid-template-columns:repeat(3,minmax(0,1fr));column-gap:32px}.journal-footer__brand{grid-column:1/-1}.journal-footer__bottom{grid-template-columns:1fr}.journal-footer__contact{border:0;padding-right:0}.journal-footer__copyright{justify-self:start;white-space:normal}}
@media(max-width:860px){.journal-footer{padding:28px 16px 24px}.journal-footer__top{display:block;padding-bottom:20px;border:0}.journal-footer__col{display:none}.journal-footer__brand{margin-bottom:8px}.journal-footer__accordion{display:block;border-top:1px solid #ffffff1f;margin-bottom:20px}.journal-footer__accordion details{border-bottom:1px solid #ffffff1f}.journal-footer__accordion summary{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:52px;list-style:none;font-size:15px;font-weight:700;line-height:1.4;cursor:pointer}.journal-footer__accordion summary::-webkit-details-marker{display:none}.journal-footer__accordion summary:after{content:'+';font-size:22px;font-weight:400;opacity:.8}.journal-footer__accordion details[open]>summary:after{content:'−'}.journal-footer__accordion details>div{display:grid;gap:10px;padding-bottom:16px}.journal-footer__accordion a,.journal-footer__accordion div>span{display:block;min-height:28px;color:#9a9a9a;font-size:14px;text-decoration:none;line-height:1.5}.journal-footer__bottom{gap:16px;padding-top:8px}.journal-footer__copyright{margin-top:4px}}
`;
