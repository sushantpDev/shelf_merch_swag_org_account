/** Presentation only: preserve the documentation body and onboarding instructions. */
const artworkByPath = {
  '/docs/zoho-people': ['overview', 'Colleagues connecting an employee directory with merchandise programs'],
  '/docs/zoho-people/user-guide': ['user-guide', 'A colleague connecting and checking employee records from a laptop'],
  '/docs/zoho-people/admin-guide': ['admin-guide', 'An administrator reviewing security settings and employee data controls'],
  '/case-studies/zoho-people': ['case-study', 'HR and operations colleagues preparing a welcome kit for a new employee'],
};

export function presentZohoDocs(bodyHtml, activePath) {
  const artwork = artworkByPath[activePath];
  if (!artwork) return bodyHtml;
  const [kind, alt] = artwork;
  const headings = {
    overview: 'ShelfMerch for <em>Zoho People</em>',
    'user-guide': 'User <em>guide.</em>',
    'admin-guide': 'Administrator <em>guide.</em>',
    'case-study': 'A connected <em>employee welcome.</em>',
  };
  return bodyHtml.replace(/<h1>([\s\S]*?)<\/h1>(\s*<p class="docs-sub">[\s\S]*?<\/p>)?/, (_, title, subtitle = '') =>
    `<header class="zag-hero"><div class="zag-hero-copy"><span class="zag-eyebrow">SHELFMERCH + ZOHO PEOPLE</span><h1>${headings[kind] || title}</h1>${subtitle}</div>
    <div class="zag-hero-visual"><div class="zag-partner-logos"><img src="/images/logos/zoho-people.png" alt="Zoho People" /><span aria-hidden="true">+</span><img src="/images/logo/shelfmerch-wordmark.png" alt="Shelf Merch" /></div>
    <img class="zag-welcome-art" src="/images/resources/zoho/zoho-${kind}-hero-v1.png" alt="${alt}" width="1536" height="1024" /></div></header>`);
}
