import { createServer } from 'node:http';
import { catalogProductCardHtml } from '../src/modules/mcp/catalogProductCard.js';
import { kitCatalogCardHtml } from '../src/modules/mcp/kitCatalogCard.js';

const port = Number(process.env.MCP_PREVIEW_PORT || 1797);
const csp = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src https: data:',
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const productImage = 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png';
const kitImage = productImage;

function products(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `507f1f77bcf86cd7994390${String(10 + index).padStart(2, '0')}`,
    name: count === 1 ? 'Travel Pack' : `Apparel Product ${index + 1}`,
    description: 'Official catalog preview item.',
    sellingPriceInr: count === 1 ? 700 : 390 + index * 10,
    primaryImageUrl: index % 7 === 6 ? '' : productImage,
    productUrl: `https://app.shelfmerch.io/catalog/${10 + index}`,
    variants: [
      { sku: `SKU-${index}-BL`, color: 'Blue', size: 'M', sellingPriceInr: 700, stock: 3 },
      { sku: `SKU-${index}-RD`, color: 'Red', size: 'M', sellingPriceInr: 700, stock: index % 4 === 0 ? 0 : 2 },
    ],
  }));
}

function kitProducts() {
  return [
    {
      id: 'p1',
      name: '2 Slice Pop-Up Toaster',
      quantity: 1,
      brand: 'Philips',
      imageUrl: productImage,
      colors: ['Black', 'White'],
      sizes: [],
      stockLabel: 'In stock',
      selectedVariant: null,
    },
    {
      id: 'p2',
      name: '2-in-1 Stick & Handy Vacuum Cleaner with HEPA Filter',
      quantity: 1,
      brand: 'Eureka',
      imageUrl: productImage,
      colors: ['Grey'],
      sizes: [],
      stockLabel: 'In stock',
      selectedVariant: null,
    },
    {
      id: 'p3',
      name: 'ActiveDry Polo',
      quantity: 1,
      brand: 'ShelfMerch',
      imageUrl: productImage,
      colors: ['Navy', 'White', 'Black'],
      sizes: ['S', 'M', 'L', 'XL'],
      stockLabel: 'In stock',
      selectedVariant: null,
    },
  ];
}

function kits(count, type = 'customized') {
  return Array.from({ length: count }, (_, index) => ({
    id: `kit-${index + 1}`,
    name: count === 1 ? 'Welcome Kit' : `${type === 'curated' ? 'Curated' : 'Custom'} Kit ${index + 1}`,
    type,
    status: index % 5 === 0 ? 'draft' : 'active',
    description: 'Corporate welcome kit with curated essentials.',
    packaging: 'Premium gift box',
    priceInr: type === 'curated' ? 1200 + index * 25 : 900 + index * 20,
    itemCount: 3,
    imageUrl: index % 8 === 7 ? '' : kitImage,
    products: kitProducts(),
  }));
}

function payload(kind, count) {
  if (kind === 'product') {
    const items = products(count);
    return {
      content: [{ type: 'text', text: 'catalog search' }],
      structuredContent: { items, pagination: { page: 1, limit: count, total: count, hasMore: false } },
    };
  }
  if (kind === 'kit-detail') {
    const kit = kits(1, 'customized')[0];
    return {
      content: [{ type: 'text', text: 'kit detail' }],
      structuredContent: kit,
    };
  }
  const type = kind === 'curated' ? 'curated' : 'customized';
  const items = kits(count, type);
  return {
    content: [{ type: 'text', text: 'kit list' }],
    structuredContent: {
      items,
      view: { type, limit: count },
      pagination: { page: 1, limit: count, total: count, hasMore: false },
    },
  };
}

function hostPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>MCP Apps compact preview</title>
<style>
  html { color-scheme: light; } body { margin: 0; font: 14px/1.4 Segoe UI, system-ui, sans-serif; background: #f3f5f9; color: #1c1d24; }
  header { padding: 16px 20px; background: #fff; border-bottom: 1px solid #d8dee9; }
  h1 { margin: 0 0 8px; font-size: 1.2rem; }
  .controls { display: flex; flex-wrap: wrap; gap: 8px; }
  button { font: inherit; border: 1px solid #c9d1e0; background: #fff; border-radius: 999px; padding: 8px 12px; cursor: pointer; }
  button[aria-pressed="true"] { background: #3D5FD9; color: #fff; border-color: #3D5FD9; }
  main { padding: 16px 20px 28px; display: grid; gap: 12px; }
  .frame-wrap { background: #fff; border: 1px solid #d8dee9; border-radius: 14px; overflow: hidden; }
  .label { padding: 10px 12px; border-bottom: 1px solid #e7ebf3; color: #5c6370; }
  iframe { width: 100%; height: 720px; border: 0; display: block; background: #fff; color-scheme: light; }
  .narrow iframe { width: 360px; max-width: 100%; margin: 0 auto; }
</style>
</head>
<body>
<header>
  <h1>MCP Apps compact preview</h1>
  <div class="controls" id="controls"></div>
</header>
<main>
  <div class="frame-wrap">
    <div class="label" id="label">Choose a scenario</div>
    <iframe id="view" title="MCP widget" src="/card/product"></iframe>
  </div>
  <div class="frame-wrap narrow">
    <div class="label">Narrow width check</div>
    <iframe id="narrow" title="Narrow MCP widget" src="/card/product"></iframe>
  </div>
</main>
<script>
const scenarios = [
  { id: 'product-1', label: '1 product', card: 'product', kind: 'product' },
  { id: 'product-5', label: '5 products', card: 'product', kind: 'product' },
  { id: 'product-10', label: '10 products', card: 'product', kind: 'product' },
  { id: 'kit-5', label: '5 curated', card: 'kit', kind: 'curated' },
  { id: 'kit-3', label: '3 customized', card: 'kit', kind: 'customized' },
  { id: 'kit-detail', label: 'Kit detail', card: 'kit', kind: 'kit-detail' },
  { id: 'kit-12', label: '12 curated', card: 'kit', kind: 'curated' },
];
const controls = document.getElementById('controls');
const label = document.getElementById('label');
const view = document.getElementById('view');
const narrow = document.getElementById('narrow');
let ready = { view: false, narrow: false };
let queued = null;

function deliver(target, data) {
  target.contentWindow.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: data }, '*');
}

function show(scenario) {
  queued = scenario;
  label.textContent = scenario.label + ' · ' + scenario.card + ' card';
  for (const button of controls.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', button.dataset.id === scenario.id ? 'true' : 'false');
  }
  view.src = '/card/' + scenario.card + '?t=' + Date.now();
  narrow.src = '/card/' + scenario.card + '?t=' + Date.now();
  ready = { view: false, narrow: false };
}

window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.jsonrpc !== '2.0') return;
  if (data.method === 'ui/initialize') {
    event.source.postMessage({
      jsonrpc: '2.0',
      id: data.id,
      result: { protocolVersion: '2026-01-26', hostCapabilities: {}, hostContext: { availableDisplayModes: ['inline'] } },
    }, '*');
  }
  if (data.method === 'ui/notifications/initialized') {
    const target = event.source === view.contentWindow ? 'view' : event.source === narrow.contentWindow ? 'narrow' : null;
    if (!target || !queued) return;
    ready[target] = true;
    deliver(target === 'view' ? view : narrow, queued.payload);
  }
});

for (const scenario of scenarios) {
  scenario.payload = null;
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.id = scenario.id;
  button.textContent = scenario.label;
  button.addEventListener('click', () => {
    fetch('/payload/' + scenario.id).then((res) => res.json()).then((payload) => {
      scenario.payload = payload;
      show(scenario);
    });
  });
  controls.append(button);
}
</script>
</body>
</html>`;
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/card/product') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': csp });
    res.end(catalogProductCardHtml());
    return;
  }
  if (url.pathname === '/card/kit') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': csp });
    res.end(kitCatalogCardHtml());
    return;
  }
  if (url.pathname.startsWith('/payload/')) {
    const id = url.pathname.slice('/payload/'.length);
    const map = {
      'product-1': payload('product', 1),
      'product-5': payload('product', 5),
      'product-10': payload('product', 10),
      'kit-5': payload('curated', 5),
      'kit-3': payload('customized', 3),
      'kit-detail': payload('kit-detail', 1),
      'kit-12': payload('curated', 12),
    };
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(map[id] || {}));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(hostPage());
});

server.listen(port, '127.0.0.1', () => {
  console.log(`adaptive preview http://127.0.0.1:${port}`);
});