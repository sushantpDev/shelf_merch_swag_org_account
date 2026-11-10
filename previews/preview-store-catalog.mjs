// Render the real store components with local fixtures; no API writes or payments.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const web = join(root, 'apps/web');
const htmlPath = join(web, '__store-catalog-preview.html');
const sourcePath = join(web, 'src/__store-catalog-preview.tsx');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = await mkdtemp(join(tmpdir(), 'shelfmerch-store-preview-'));
let server;
let browser;
let socket;
try {
  await writeFile(htmlPath, '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div><script type="module" src="/src/__store-catalog-preview.tsx"></script></body></html>', { flag: 'wx' });
  await writeFile(sourcePath, `
import ReactDOM from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import StoreShell from './components/store/StoreShell';
import './styles.css';
import shirt from '../assets/catalog/category-tiles/apparel/t-shirts.png';
import hoodie from '../assets/catalog/apparel-editorial/hoodie.png';
import mug from '../assets/mug.png';
import tote from '../assets/tote.png';
const images = [shirt, hoodie, mug, tote, shirt, hoodie, mug, tote, shirt];
const products = images.map((image, i) => ({
  _id: 'product-' + i, name: ['Classic Crew Neck', 'Everyday Hoodie', 'Ceramic Coffee Mug', 'Everyday Tote', 'Essential Crew Neck', 'Signature Hoodie', 'Travel Mug', 'Canvas Tote', 'Premium Crew Neck'][i],
  brand: 'Shelf Merch', category: ['Apparel', 'Apparel', 'Drinkware', 'Bags'][i % 4],
  subcategory: ['Crew Neck', 'Hoodies & Sweatshirts', 'Mugs', 'Tote Bags'][i % 4],
  basePriceInr: 410 + i * 50, primaryImageUrl: image, baseImageUrl: image,
}));
const orders = [{ orderNumber: 'SM-1024', status: 'placed', createdAt: '2026-10-28T10:00:00Z', total: 410,
  items: [{ name: 'Classic Crew Neck', qty: 1, unitPriceInr: 410, imageUrl: shirt, catalogProductId: 'product-0' }],
  shippingAddress: { name: 'Alex', line1: '12 Park Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400001', country: 'IN' },
  statusHistory: [{ status: 'placed', at: '2026-10-28T10:00:00Z' }],
}];
ReactDOM.createRoot(document.getElementById('root')!).render(<MemoryRouter><StoreShell
  shop={{ name: 'Shelf Merch', bannerPreset: 'welcome' }} products={products} mode="store" currency="points"
  authenticated creditInr={5000} recipientName="Alex Morgan" recipientEmail="alex@example.test"
  onLogout={() => {}} onFetchOrders={async () => ({ orders, creditAmount: 5000 })}
  onFetchTickets={async () => ({ items: [] })} onCheckout={async () => ({ orderNumber: 'SM-PREVIEW', remainingCredit: 4590 })}
/></MemoryRouter>);
`, { flag: 'wx' });
  server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '8181', '--strictPort'], { cwd: web, windowsHide: true, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch('http://127.0.0.1:8181/__store-catalog-preview.html')).ok) break; } catch {}
    if (i === 79) throw new Error('Preview server did not start');
    await pause(200);
  }
  browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', '--disable-extensions', '--hide-scrollbars', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let port;
  for (let i = 0; i < 80; i++) {
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch {}
    await pause(200);
  }
  if (!port) throw new Error('Preview browser did not start');
  const tab = await (await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' })).json();
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  const errors = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    const request = pending.get(message.id);
    if (request) { pending.delete(message.id); clearTimeout(request.timer); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result); }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Timed out: ' + method)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Page evaluation failed');
    return result.result.value;
  };
  const waitFor = async (expression) => {
    for (let i = 0; i < 80; i++) { if (await evaluate('Boolean(' + expression + ')')) return; await pause(150); }
    throw new Error('UI not ready: ' + expression);
  };
  const click = async (selector) => { await evaluate('document.querySelector(' + JSON.stringify(selector) + ')?.click()'); await pause(180); };
  const capture = async (name) => {
    await evaluate('document.fonts.ready');
    await pause(250);
    const overflow = await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})');
    const { data } = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(root, 'previews/store-' + name + '.png'), Buffer.from(data, 'base64'));
    if (overflow.scroll > overflow.width) {
      const overflowing = await evaluate('Array.from(document.querySelectorAll(".sf-root *")).filter(el => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 1 && r.width > 0; }).slice(0, 12).map(el => ({class: el.className, width: Math.round(el.getBoundingClientRect().width),right:Math.round(el.getBoundingClientRect().right)}))');
      throw new Error(name + ' overflows: ' + JSON.stringify({ ...overflow, overflowing }));
    }
    console.log('Captured ' + name + '; no horizontal overflow');
  };
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: 'http://127.0.0.1:8181/__store-catalog-preview.html' });
  await waitFor('document.querySelectorAll(".sf-pcard").length > 0');
  await capture('home-desktop');
  await click('.sf-store-nav button:nth-child(2)');
  await waitFor('document.querySelectorAll(".sf-plp-grid .sf-pcard").length === 9');
  const columns = await evaluate('getComputedStyle(document.querySelector(".sf-plp-grid")).gridTemplateColumns.split(" ").length');
  if (columns !== 3) throw new Error('Expected three desktop columns, got ' + columns);
  await capture('products-desktop');
  await evaluate('document.querySelector(".sf-plp-sort select").value = "price-desc"; document.querySelector(".sf-plp-sort select").dispatchEvent(new Event("change", {bubbles:true})); void 0');
  await waitFor('document.querySelector(".sf-plp-grid .sf-pcard-name").textContent === "Premium Crew Neck"');
  await click('[aria-label="List view"]');
  await waitFor('document.querySelector(".sf-plp-grid--list")');
  await click('[aria-label="Grid view"]');
  console.log('Price sorting and list/grid switching pass');
  await click('.sf-plp-cat-item--parent');
  await waitFor('document.querySelectorAll(".sf-plp-grid .sf-pcard").length === 5');
  console.log('Category filter narrows nine products to five');
  await click('.sf-plp-cat-item');
  await click('.sf-plp-grid .sf-pcard-media');
  await waitFor('document.querySelector(".sf-pdp-title")');
  await capture('product-desktop');
  await click('.sf-pdp-add-btn');
  await waitFor('document.querySelector(".sf-bag-added")');
  await click('.sf-bag-added-view');
  await waitFor('document.querySelector(".sf-bag-summary")');
  await capture('cart-desktop');
  await click('.sf-bag-checkout-btn');
  await waitFor('document.querySelector(".sf-checkout-page")');
  await capture('checkout-desktop');
  await click('.sf-store-nav button:nth-child(3)');
  await waitFor('document.querySelector(".sf-my-order-card")');
  await capture('orders-desktop');
  await click('.sf-my-order-card');
  await waitFor('document.querySelector(".sf-order-detail-page")');
  await capture('order-detail-desktop');
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await click('.sf-store-nav button:first-child');
  await capture('home-mobile');
  await click('.sf-store-nav button:nth-child(2)');
  await waitFor('document.querySelector(".sf-plp-grid")');
  if (await evaluate('getComputedStyle(document.querySelector(".sf-plp-sidebar-card")).display') !== 'none') throw new Error('Mobile filters should start collapsed');
  await capture('products-mobile');
  await click('.sf-mobile-filter-toggle');
  await waitFor('getComputedStyle(document.querySelector(".sf-plp-sidebar-card")).display !== "none"');
  await capture('filters-mobile');
  await click('.sf-mobile-filter-toggle');
  await click('.sf-plp-grid .sf-pcard-media');
  await capture('product-mobile');
  await click('.sf-topbar-cart');
  await capture('cart-mobile');
  await click('.sf-bag-checkout-btn');
  await capture('checkout-mobile');
  await click('.sf-store-nav button:nth-child(3)');
  await waitFor('document.querySelector(".sf-my-order-card")');
  await capture('orders-mobile');
  await click('.sf-topbar-user');
  await click('.sf-account-menu-link:last-child');
  await waitFor('document.body.textContent.includes("Support")');
  await capture('support-mobile');
  for (const width of [320, 768, 1024]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await click('.sf-store-nav button:first-child');
    await capture('home-' + width);
    await click('.sf-store-nav button:nth-child(2)');
    await capture('products-' + width);
  }
  if (errors.length) throw new Error('Browser errors: ' + errors.join('; '));
  console.log('PASS: real store components, desktop/mobile layout, navigation, category filter, product, cart, checkout, orders, order detail, support. Local fixtures only.');
} finally {
  socket?.close();
  browser?.kill();
  server?.kill();
  await Promise.all([unlink(htmlPath).catch(() => {}), unlink(sourcePath).catch(() => {})]);
}
