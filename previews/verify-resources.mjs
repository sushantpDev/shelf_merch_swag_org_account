import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = await mkdtemp(join(tmpdir(), 'shelfmerch-resources-'));
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
let socket, call;
const errors = [];
const report = [];
try {
  let port;
  for (let i = 0; i < 60; i++) {
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
    catch { await pause(200); }
  }
  if (!port) throw new Error('Headless browser did not start');
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
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
  const waitFor = async expression => {
    for (let i = 0; i < 80; i++) { if (await evaluate(expression)) return; await pause(200); }
    throw new Error(`UI not ready: ${expression}`);
  };
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Page.navigate', { url: 'http://localhost:8080/resources' });
  await waitFor('Boolean(document.querySelector(".rh-hero"))');
  await evaluate(`(() => { const style=document.createElement('style'); style.textContent='.consent-banner{display:none!important}'; document.head.append(style); document.querySelectorAll('.rh-main img').forEach(i=>i.loading='eager'); })()`);
  await evaluate('Promise.all(Array.from(document.querySelectorAll(".rh-main img"), i => i.decode().catch(() => null)))');
  for (const width of [1920, 1440, 1280, 1024, 768, 390, 320]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 760 });
    await evaluate('document.fonts.ready.then(() => scrollTo(0, 0))');
    await pause(250);
    const state = await evaluate(`({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, font: getComputedStyle(document.querySelector('.rh-main h1')).fontFamily, headings: document.querySelectorAll('main h1').length, images: Array.from(document.querySelectorAll('.rh-main img'), i=>({ src: i.getAttribute('src'), loaded: i.complete && i.naturalWidth > 0 })), links: Array.from(document.querySelectorAll('.rh-playbook__link'), a=>a.getAttribute('href')), demo: document.querySelector('.rh-cta .rh-button').getAttribute('href'), footer: getComputedStyle(document.querySelector('.site-footer')).backgroundColor })`);
    if (state.scrollWidth > width) throw new Error(`Overflow at ${width}: ${state.scrollWidth}`);
    if (state.images.some(i => !i.loaded)) throw new Error(`Broken image at ${width}`);
    report.push(state);
    const hero = await evaluate(`(() => { const r=document.querySelector('.rh-hero').getBoundingClientRect(); return {height:r.height, bottom:r.bottom}; })()`);
    state.heroHeight = hero.height;
    if (width === 1440) {
      const centeredHeading = await evaluate('getComputedStyle(document.querySelector(".rh-inspiration__heading")).textAlign === "center" && getComputedStyle(document.querySelector("#inspiration-title > span:last-child")).fontStyle === "italic"');
      if (!centeredHeading) throw new Error('Ribbon heading style does not match');
      const ribbonX = () => evaluate('new DOMMatrixReadOnly(getComputedStyle(document.querySelector(".rh-inspiration__track")).transform).m41');
      const startX = await ribbonX();
      await pause(250);
      if (await ribbonX() >= startX) throw new Error('Image ribbon is not moving right to left');
      if (await evaluate('Boolean(document.querySelector(".rh-inspiration button"))')) throw new Error('Unexpected ribbon control');
      await evaluate('scrollTo(0, document.querySelector(".rh-inspiration__viewport").getBoundingClientRect().top + scrollY - 200)');
      await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 720, y: 300 });
      if (!await evaluate('document.querySelector(".rh-inspiration__viewport").matches(":hover")')) throw new Error('Hover check did not reach ribbon');
      const hoverX = await ribbonX();
      await pause(250);
      if (await ribbonX() >= hoverX) throw new Error('Image ribbon stopped on hover');
      await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
      await evaluate('scrollTo(0, 0)');
      await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      const reducedMotion = await evaluate('getComputedStyle(document.querySelector(".rh-inspiration__track")).animationName === "none" && getComputedStyle(document.querySelector(".rh-inspiration__group[aria-hidden=true]")).display === "none"');
      if (!reducedMotion) throw new Error('Reduced motion is not respected');
      await call('Emulation.setEmulatedMedia', { features: [] });
      report.push({ centeredHeading: true, ribbonMovesLeft: true, continuesOnHover: true, noPauseButton: true, reducedMotion: true });
    }
    if (width === 1440 || width === 390) {
      const ribbonRect = await evaluate('(() => {const r=document.querySelector(".rh-inspiration").getBoundingClientRect(); return {top:r.top,height:r.height};})()');
      const ribbonShot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: Math.floor(ribbonRect.top), width, height: Math.ceil(ribbonRect.height + 20), scale: 1 } });
      await writeFile(fileURLToPath(new URL(`resources-ribbon-${width}.png`, import.meta.url)), Buffer.from(ribbonShot.data, 'base64'));
    }
    if (width === 1920 || width === 1440 || width === 390) {
      const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.ceil(hero.bottom + 100), scale: 1 } });
      await writeFile(fileURLToPath(new URL(`resources-hero-${width}.png`, import.meta.url)), Buffer.from(shot.data, 'base64'));
    }
    if (width === 1440 || width === 390) {
      const metrics = await call('Page.getLayoutMetrics');
      const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: metrics.cssContentSize.height, scale: 1 } });
      await writeFile(fileURLToPath(new URL(`resources-redesign-${width}.png`, import.meta.url)), Buffer.from(shot.data, 'base64'));
    }
  }
  await evaluate(`document.querySelector('.rh-team-nav a').click()`);
  await waitFor(`location.hash === '#playbook-hr'`);
  report.push({ anchor: await evaluate('location.hash') });
  await evaluate(`document.querySelector('.rh-playbook__link').click()`);
  await waitFor(`location.pathname === '/resources/hr' && Boolean(document.querySelector('.hr-hero'))`);
  report.push({ teamRoute: await evaluate('location.pathname'), hubStyleAbsent: await evaluate('!document.querySelector(".resources-hub")') });
  await call('Page.navigate', { url: 'http://localhost:8080/resources' });
  await waitFor('Boolean(document.querySelector(".rh-hero"))');
  await evaluate(`document.querySelector('.menu-button').click()`);
  await waitFor(`document.querySelector('.menu-button').getAttribute('aria-expanded') === 'true'`);
  await evaluate(`document.querySelector('.menu-button').click()`);
  await evaluate(`document.querySelector('.footer-acc__trigger').click()`);
  await waitFor(`document.querySelector('.footer-acc__trigger').getAttribute('aria-expanded') === 'true'`);
  report.push({ mobileMenuAndFooter: true, errors });
  await writeFile(fileURLToPath(new URL('resources-verification.json', import.meta.url)), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  if (call && socket?.readyState === WebSocket.OPEN) { try { await call('Browser.close'); } catch {} }
  socket?.close();
  if (browser.exitCode === null) browser.kill();
}
