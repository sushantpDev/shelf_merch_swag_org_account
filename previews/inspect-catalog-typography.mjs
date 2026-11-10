import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = await mkdtemp(join(tmpdir(), 'shelfmerch-catalog-type-'));
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
let socket, call;
try {
  let port;
  for (let i = 0; i < 60; i++) {
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
    catch { await pause(200); }
  }
  if (!port) throw new Error('Browser did not start');
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    const request = pending.get(message.id);
    if (request) { pending.delete(message.id); clearTimeout(request.timer); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result); }
  });
  call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: 'http://localhost:8080/apps/catalog' });
  let ready = false;
  for (let i = 0; i < 100; i++) { if (await evaluate('Boolean(document.getElementById("sm-featured-products-title"))')) { ready = true; break; } await pause(200); }
  if (!ready) throw new Error('Catalog headings did not render');
  await evaluate(`(() => { const style = document.createElement('style'); style.textContent = '.consent-banner{display:none!important}'; document.head.append(style); })()`);
  const report = [];
  for (const width of [1440, 1024, 768, 390, 320]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 760 });
    await evaluate('document.fonts.ready');
    await pause(150);
    const state = await evaluate(`({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, headings: Array.from(document.querySelectorAll('.sm-cat--landing h2'), h => {const s=getComputedStyle(h); const r=h.getBoundingClientRect(); return { id:h.id, text:h.textContent.trim(), size:s.fontSize, font:s.fontFamily, weight:s.fontWeight, lineHeight:s.lineHeight, left:r.left, right:r.right, overflow:h.scrollWidth>h.clientWidth+1 };}), heroSize:getComputedStyle(document.querySelector('.sm-cat--landing h1')).fontSize })`);
    report.push(state);
    if (new Set(state.headings.map(h => h.size)).size !== 1) throw new Error(`Inconsistent section heading sizes at ${width}`);
    if (new Set(state.headings.map(h => h.lineHeight)).size !== 1) throw new Error(`Inconsistent section heading leading at ${width}`);
    if (state.headings.some(h => h.overflow)) throw new Error(`Heading overflow at ${width}`);
    if (width === 1440 || width === 390) {
      const area = await evaluate(`(() => {const r=document.querySelector('.sm-featured-products').getBoundingClientRect(); return {top:r.top+scrollY,height:r.height};})()`);
      const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: Math.floor(area.top), width, height: Math.min(900, Math.ceil(area.height)), scale: 1 } });
      await writeFile(fileURLToPath(new URL(`catalog-products-typography-${width}.png`, import.meta.url)), Buffer.from(shot.data, 'base64'));
    }
  }
  await writeFile(fileURLToPath(new URL('catalog-typography-report.json', import.meta.url)), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  if (call && socket?.readyState === WebSocket.OPEN) { try { await call('Browser.close'); } catch {} }
  socket?.close();
  if (browser.exitCode === null) browser.kill();
}
