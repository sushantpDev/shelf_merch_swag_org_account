import { catalogProductCardResourceDomains } from './catalogProductCard.js';
import { kitImageResourceOrigins } from './kitsRead.js';

export const KIT_CATALOG_CARD_URI = 'ui://shelfmerch/catalog-kit-card-v5.html';
export const KIT_CATALOG_CARD_MIME = 'text/html;profile=mcp-app';
const KIT_PAGE = 6;

export function kitCatalogCardToolMeta() {
  return {
    ui: { resourceUri: KIT_CATALOG_CARD_URI },
    'openai/outputTemplate': KIT_CATALOG_CARD_URI,
  };
}

export function kitCatalogCardResourceDomains() {
  const domains = [...catalogProductCardResourceDomains()];
  for (const origin of kitImageResourceOrigins()) {
    if (!domains.includes(origin)) domains.push(origin);
  }
  return domains;
}

export function kitCatalogCardResourceMeta() {
  return {
    ui: {
      prefersBorder: true,
      csp: { resourceDomains: kitCatalogCardResourceDomains() },
    },
  };
}

function kitCatalogCardHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kit catalog</title>
<style>
  body { margin: 0; font: 13px/1.35 "Segoe UI", system-ui, sans-serif; color: var(--color-text-primary, #1c1d24); background: var(--color-background-primary, #fff); overflow-x: hidden; }
  #message { padding: 12px; }
  button, input, a { font: inherit; }
  button { cursor: pointer; }
  button:focus-visible, input:focus-visible, a:focus-visible { outline: 2px solid #3D5FD9; outline-offset: 2px; }
  .stage { display: grid; gap: 0; padding: 4px 2px 8px; container-type: inline-size; }
  .toolbar, .note, .more { grid-column: 1 / -1; }
  .toolbar { display: grid; gap: 8px; padding: 4px 4px 10px; }
  .filters, .search { display: flex; flex-wrap: wrap; gap: 6px; }
  .search input { flex: 1 1 140px; min-width: 0; border: 1px solid var(--color-border-primary, #d5dbe8); background: var(--color-background-primary, #fff); color: inherit; border-radius: 999px; padding: 7px 11px; }
  .chip, .more, .back { border: 1px solid var(--color-border-primary, #d5dbe8); background: var(--color-background-primary, #fff); color: inherit; border-radius: 999px; padding: 5px 10px; transition: background-color .15s ease, border-color .15s ease, color .15s ease; }
  .chip:hover, .more:hover, .back:hover { background: var(--color-background-secondary, #eef2fb); }
  .chip[aria-pressed="true"] { background: #3D5FD9; color: #fff; border-color: #3D5FD9; }
  .row, .card, .kit, .product, .kit-product { min-width: 0; }
  .row, .kit-product { display: flex; align-items: flex-start; gap: 12px; padding: 10px 4px; border-bottom: 1px solid var(--color-border-primary, #e7ebf3); background: transparent; }
  .row:last-of-type, .kit-product:last-of-type { border-bottom: 0; }
  .media { position: relative; overflow: hidden; background: #fff; border-radius: 10px; border: 1px solid var(--color-border-primary, #e7ebf3); flex: 0 0 auto; }
  .row-media, .kit-product-media { width: 100px; min-width: 100px; height: 110px; }
  .media.large { width: 100%; max-width: 220px; height: 160px; margin: 0 0 10px; }
  .media img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; }
  .image-fallback { margin: 0; padding: 10px; text-align: center; font-size: 12px; color: var(--color-text-secondary, #5c6370); }
  .body { min-width: 0; flex: 1 1 auto; padding: 0; }
  .kit, .product { padding: 10px 4px 14px; }
  .kit-products { margin-top: 12px; display: grid; gap: 0; }
  h1, h2, p { margin: 0; overflow-wrap: anywhere; }
  h1 { font-size: 1.15rem; }
  .row h2, .kit-product h2 { color: inherit; font-size: 0.95rem; font-weight: 700; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .section-title { margin: 14px 0 6px; font-size: 0.8rem; letter-spacing: .04em; text-transform: uppercase; color: var(--color-text-secondary, #5c6370); }
  .badge { display: inline-flex; align-items: center; margin-top: 6px; padding: 2px 8px; border-radius: 999px; font-size: 11px; line-height: 1.3; background: var(--color-background-secondary, #eef2fb); color: var(--color-text-secondary, #3d4658); }
  .badge.curated { background: #e8f6ed; color: #146c2e; }
  .badge.customized { background: #eef2fb; color: #2f3f74; }
  .meta-line, .stock, .swatches, .hint, .note, .information, .variants p, .meta p { margin-top: 4px; color: var(--color-text-secondary, #5c6370); font-size: 12px; }
  .price { margin-top: 5px; font-weight: 700; font-size: 0.92rem; }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 7px; }
  .details, .external, .linkish { border: 0; background: transparent; padding: 2px 4px; min-height: 0; border-radius: 6px; color: #3D5FD9; text-decoration: underline; text-underline-offset: 2px; transition: color .15s ease, background-color .15s ease; }
  .details:hover, .external:hover, .linkish:hover { color: #243ea8; background: rgba(61, 95, 217, 0.1); }
  .details:active, .external:active, .linkish:active { color: #1c3186; background: rgba(61, 95, 217, 0.16); }
  .external::after { content: " ↗"; }
  .more, .back { margin-top: 8px; min-height: 34px; }
  .list-stage { grid-template-columns: 1fr; }
  .colors { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
  .colors button { border: 1px solid var(--color-border-primary, #d5dbe8); background: var(--color-background-primary, #fff); color: inherit; border-radius: 999px; padding: 4px 9px; transition: background-color .15s ease, border-color .15s ease, color .15s ease; }
  .colors button:hover { background: var(--color-background-secondary, #eef2fb); }
  .colors button[aria-pressed="true"] { background: #3D5FD9; color: #fff; border-color: #3D5FD9; }
  .meta { margin-top: 12px; }
  @container (max-width: 360px) {
    .row, .kit-product { gap: 8px; }
    .row-media, .kit-product-media { width: 88px; min-width: 88px; height: 98px; }
  }
  @media (prefers-color-scheme: dark) {
    body { color: var(--color-text-primary, #f4f4f5); background: var(--color-background-primary, #111114); }
    .chip, .more, .back, .search input, .colors button { background: var(--color-background-primary, #1c1c1f); border-color: var(--color-border-primary, #3a3a40); }
    .chip:hover, .more:hover, .back:hover, .colors button:hover { background: #2a2a30; }
    .chip[aria-pressed="true"], .colors button[aria-pressed="true"] { background: #3D5FD9; color: #fff; }
    .row, .kit-product { border-bottom-color: var(--color-border-primary, #2f2f35); }
    .media { background: #111114; border-color: #2f2f35; }
    .badge { background: #22232a; color: #c9cdd8; }
    .badge.curated { background: #16361f; color: #b6f0c6; }
    .badge.customized { background: #222846; color: #c9d4ff; }
    .meta-line, .stock, .swatches, .hint, .note, .information, .variants p, .meta p, .image-fallback, .section-title { color: var(--color-text-secondary, #c4c4cc); }
    .details, .external, .linkish { color: #8fa4ff; }
    .details:hover, .external:hover, .linkish:hover { color: #b6c4ff; background: rgba(143, 164, 255, 0.12); }
  }
</style>
</head>
<body>
<p id="message" aria-live="polite">Waiting for kits.</p>
<div id="cards" hidden></div>
<script>
const PAGE = ${KIT_PAGE};
const message = document.getElementById('message');
const cards = document.getElementById('cards');
let session = { mode: 'grid', kits: [] };
let typeId = 'all';
let statusId = 'all';
let query = '';
let refocusSearch = false;
function initialVisibleCount(session) {
  const requested = Number(session && session.limit);
  if (Number.isFinite(requested) && requested > 0 && requested <= PAGE) return Math.round(requested);
  return PAGE;
}
let shown = PAGE;
let detailId = '';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function httpsImage(value) {
  const raw = text(value);
  if (!raw || raw.length > 2000) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}

function money(kit) {
  const amount = Number(kit.priceInr);
  if (!Number.isFinite(amount) || amount <= 0) return 'Price unavailable';
  return '₹' + Math.round(amount);
}

function priceLabel(kit) {
  const kind = kit.type === 'curated' ? 'Estimated card price' : 'Listed price';
  return kind + ' ' + money(kit);
}

function showMessage(value) {
  message.hidden = false;
  message.textContent = value;
  cards.hidden = true;
  cards.replaceChildren();
}

function readBody(result) {
  const source = result && typeof result === 'object' ? result : {};
  if (source.structuredContent && typeof source.structuredContent === 'object') return source.structuredContent;
  return source;
}

function requestedType(body) {
  const value = body && body.view && typeof body.view.type === 'string' ? body.view.type : '';
  if (value === 'customized' || value === 'curated' || value === 'all') return value;
  return '';
}

function readSession(result) {
  const body = readBody(result);
  if (Array.isArray(body.items)) {
    return { mode: 'grid', kits: body.items, type: requestedType(body) || 'all', limit: Number(body.view && body.view.limit) };
  }
  if (body && (body.name || body.imageUrl || body.id)) {
    return { mode: 'detail', kits: [body], type: body.type === 'curated' ? 'curated' : body.type === 'customized' ? 'customized' : 'all', limit: undefined };
  }
  return { mode: 'grid', kits: [], type: 'all', limit: undefined };
}

function optionCounts(key) {
  const counts = new Map();
  for (const kit of session.kits) {
    const label = text(kit[key]);
    if (!label) continue;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.keys()].sort((a, b) => a.localeCompare(b)).map((label) => ({ id: label, label, count: counts.get(label) }));
}

function matches(kit) {
  if (typeId !== 'all' && kit.type !== typeId) return false;
  if (statusId !== 'all' && kit.status !== statusId) return false;
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [kit.name, kit.description, kit.type, kit.status].map(text).join(' ').toLowerCase();
  return haystack.includes(needle);
}

function filtered() {
  return session.kits.filter(matches);
}

function paintImage(media, kit) {
  function unavailable() {
    media.replaceChildren();
    const fallback = document.createElement('p');
    fallback.className = 'image-fallback';
    fallback.textContent = 'Image unavailable';
    media.append(fallback);
  }
  const src = httpsImage(kit.imageUrl);
  if (!src) {
    unavailable();
    return;
  }
  const image = document.createElement('img');
  image.alt = text(kit.name) || 'Kit';
  image.addEventListener('error', unavailable, { once: true });
  image.src = src;
  media.append(image);
}

function layoutMode() {
  return 'list';
}

function paintSummary(kit) {
  const article = document.createElement('article');
  article.className = 'row';
  const media = document.createElement('div');
  media.className = 'media row-media';
  paintImage(media, kit);
  const body = document.createElement('div');
  body.className = 'body';
  const name = document.createElement('h2');
  name.textContent = text(kit.name) || 'Kit';
  const badge = document.createElement('span');
  badge.className = 'badge ' + (kit.type === 'curated' ? 'curated' : 'customized');
  badge.textContent = (kit.type === 'curated' ? 'Curated' : 'Customized') + (kit.status ? ' · ' + kit.status : '');
  const price = document.createElement('p');
  price.className = 'price';
  price.textContent = priceLabel(kit);
  const count = document.createElement('p');
  count.className = 'meta-line';
  count.textContent = (Number(kit.itemCount) || 0) + ' items';
  body.append(name, badge, price, count);
  const actions = document.createElement('div');
  actions.className = 'actions';
  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'details linkish';
  action.textContent = 'View details';
  action.addEventListener('click', () => {
    detailId = text(kit.id);
    paintDetail();
  });
  actions.append(action);
  body.append(actions);
  article.append(media, body);
  return article;
}

function paintChips(group, label, options, current, choose) {
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  for (const option of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.textContent = option.label + ' (' + option.count + ')';
    button.setAttribute('aria-pressed', option.id === current ? 'true' : 'false');
    button.addEventListener('click', () => choose(option.id));
    group.append(button);
  }
}

function paintGrid() {
  const rows = filtered();
  message.hidden = true;
  cards.hidden = false;
    cards.className = 'stage list-stage';
  cards.replaceChildren();
  const bar = document.createElement('div');
  bar.className = 'toolbar';
  const search = document.createElement('div');
  search.className = 'search';
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Filter loaded kits';
  input.setAttribute('aria-label', 'Filter loaded kits');
  input.value = query;
  input.addEventListener('input', () => {
    query = input.value;
    shown = PAGE;
    refocusSearch = true;
    paintGrid();
  });
  search.append(input);
  bar.append(search);
  const types = optionCounts('type');
  const typeOptions = session.type === 'all'
    ? [{ id: 'all', label: 'All', count: session.kits.length }, ...types]
    : types;
  if (typeOptions.length > 1) {
    const group = document.createElement('div');
    group.className = 'filters';
    paintChips(group, 'Kit type', typeOptions, typeId, (id) => {
      typeId = id;
      shown = PAGE;
      paintGrid();
    });
    bar.append(group);
  }
  const statuses = optionCounts('status');
  if (statuses.length > 1) {
    const group = document.createElement('div');
    group.className = 'filters';
    paintChips(group, 'Kit status', [{ id: 'all', label: 'All statuses', count: session.kits.length }, ...statuses], statusId, (id) => {
      statusId = id;
      shown = PAGE;
      paintGrid();
    });
    bar.append(group);
  }
  cards.append(bar);
  if (refocusSearch) {
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
    refocusSearch = false;
  }
  if (!session.kits.length) {
    showMessage('No matching kits.');
    return;
  }
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'note';
    empty.textContent = 'No kits in this group on the loaded page.';
    cards.append(empty);
    return;
  }
    const visible = rows.slice(0, shown);
  for (const kit of visible) cards.append(paintSummary(kit));
  const status = document.createElement('p');
  status.className = 'note';
  status.textContent = 'Showing ' + Math.min(shown, rows.length) + ' of ' + rows.length + ' loaded.';
  cards.append(status);
  if (rows.length > shown) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'more';
    more.textContent = 'Show more';
    more.addEventListener('click', () => {
      shown += PAGE;
      paintGrid();
    });
    cards.append(more);
  }
}

function paintProductRow(product) {
  const article = document.createElement('article');
  article.className = 'kit-product';
  const media = document.createElement('div');
  media.className = 'media kit-product-media';
  paintImage(media, { imageUrl: product && product.imageUrl, name: product && product.name });
  const body = document.createElement('div');
  body.className = 'body';
  const name = document.createElement('h2');
  name.textContent = text(product && product.name) || 'Product';
  body.append(name);
  const qty = Number(product && product.quantity);
  const metaBits = [];
  if (Number.isFinite(qty) && qty > 0) metaBits.push('Qty ' + Math.round(qty));
  if (text(product && product.brand)) metaBits.push(text(product.brand));
  if (text(product && product.stockLabel)) metaBits.push(text(product.stockLabel));
  if (metaBits.length) {
    const meta = document.createElement('p');
    meta.className = 'meta-line';
    meta.textContent = metaBits.join(' · ');
    body.append(meta);
  }
  const colors = Array.isArray(product && product.colors) ? product.colors.map((value) => text(value)).filter(Boolean) : [];
  const sizes = Array.isArray(product && product.sizes) ? product.sizes.map((value) => text(value)).filter(Boolean) : [];
  if (colors.length) {
    const line = document.createElement('p');
    line.className = 'swatches';
    line.textContent = 'Colors: ' + colors.slice(0, 8).join(', ') + (colors.length > 8 ? '…' : '');
    body.append(line);
  }
  if (sizes.length) {
    const line = document.createElement('p');
    line.className = 'meta-line';
    line.textContent = 'Sizes: ' + sizes.slice(0, 10).join(', ') + (sizes.length > 10 ? '…' : '');
    body.append(line);
  }
  article.append(media, body);
  return article;
}

function paintDetail() {
  const kit = session.kits.find((item) => text(item.id) === detailId) || session.kits[0];
  if (!kit) {
    showMessage('Kit not found.');
    return;
  }
  message.hidden = true;
  cards.hidden = false;
  cards.className = 'detail';
  cards.replaceChildren();
  if (session.mode === 'grid') {
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'back';
    back.textContent = 'Back';
    back.addEventListener('click', () => paintGrid());
    cards.append(back);
  }
  const article = document.createElement('article');
  article.className = 'kit';
  const media = document.createElement('div');
  media.className = 'media large';
  paintImage(media, kit);
  const name = document.createElement('h1');
  name.textContent = text(kit.name) || 'Kit';
  const badge = document.createElement('span');
  badge.className = 'badge ' + (kit.type === 'curated' ? 'curated' : 'customized');
  badge.textContent = (kit.type === 'curated' ? 'Curated' : 'Customized') + (kit.status ? ' · ' + kit.status : '');
  const price = document.createElement('p');
  price.className = 'price';
  price.textContent = priceLabel(kit);
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Stored card price, not the checkout total.';
  article.append(media, name, badge, price, hint);
  if (text(kit.packaging)) {
    const packaging = document.createElement('p');
    packaging.className = 'meta-line';
    packaging.textContent = 'Packaging: ' + text(kit.packaging);
    article.append(packaging);
  }
  const description = text(kit.description);
  if (description) {
    const heading = document.createElement('h2');
    heading.className = 'section-title';
    heading.textContent = 'Description';
    const copy = document.createElement('p');
    copy.textContent = description;
    article.append(heading, copy);
  }
  const products = Array.isArray(kit.products) ? kit.products : [];
  const heading = document.createElement('h2');
  heading.className = 'section-title';
  heading.textContent = 'Included products';
  article.append(heading);
  const box = document.createElement('div');
  box.className = 'kit-products';
  if (!products.length) {
    const empty = document.createElement('p');
    empty.className = 'note';
    empty.textContent = (Number(kit.itemCount) || 0) + ' items';
    box.append(empty);
  } else {
    for (const product of products) box.append(paintProductRow(product));
  }
  article.append(box);
  cards.append(article);
}

function renderResult(params) {
  const result = params && typeof params === 'object' ? params : {};
  if (result.isError) {
    const block = Array.isArray(result.content) ? result.content.find((item) => item && item.type === 'text' && item.text) : null;
    showMessage(block ? block.text : 'Kit not found.');
    return;
  }
  session = readSession(result);
  typeId = session.type || 'all';
  statusId = 'all';
  query = '';
  shown = PAGE;
  detailId = session.mode === 'detail' && session.kits[0] ? text(session.kits[0].id) : '';
  if (!session.kits.length) {
    showMessage('No matching kits.');
    return;
  }
  if (session.mode === 'detail') paintDetail();
  else paintGrid();
}

const pending = new Map();
let nextId = 1;
window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.jsonrpc !== '2.0') return;
  if (data.id != null && pending.has(data.id)) {
    const waiter = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) waiter.reject(data.error);
    else waiter.resolve(data.result);
    return;
  }
  if (data.method === 'ui/notifications/tool-result') renderResult(data.params);
});

function request(method, params) {
  const id = nextId;
  nextId += 1;
  window.parent.postMessage({ jsonrpc: '2.0', id, method, params }, '*');
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
}

function renderHostOutput() {
  const output = window.openai && window.openai.toolOutput;
  if (output && typeof output === 'object') renderResult(output);
}

request('ui/initialize', {
  protocolVersion: '2026-01-26',
  appInfo: { name: 'shelfmerch-catalog-kit-card', version: '0.5.0' },
  appCapabilities: { availableDisplayModes: ['inline'] },
}).then((result) => {
  const variables = result?.hostContext?.styles?.variables;
  if (variables && typeof variables === 'object') {
    for (const [key, value] of Object.entries(variables)) {
      if (typeof key === 'string' && key.startsWith('--') && typeof value === 'string') {
        document.documentElement.style.setProperty(key, value);
      }
    }
  }
  window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/initialized' }, '*');
  renderHostOutput();
}).catch(() => {
  renderHostOutput();
});
</script>
</body>
</html>`;
}

export function readKitCatalogCard() {
  return {
    contents: [
      {
        uri: KIT_CATALOG_CARD_URI,
        mimeType: KIT_CATALOG_CARD_MIME,
        text: kitCatalogCardHtml(),
        _meta: kitCatalogCardResourceMeta(),
      },
    ],
  };
}

export { kitCatalogCardHtml };
