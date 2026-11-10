import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = await mkdtemp(join(tmpdir(), 'shelfmerch-slack-terms-'));
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
let socket, call;
const browserErrors = [];
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
    if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') browserErrors.push(message.params.args.map(arg => arg.description || arg.value).join(' '));
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
  const poll = async expression => {
    for (let i = 0; i < 80; i++) { if (await evaluate(expression)) return; await pause(100); }
    throw new Error('Condition failed: ' + expression + '; browser errors: ' + JSON.stringify(browserErrors) + '; rendered state: ' + await evaluate(`document.body.innerText.slice(0, 700)`));
  };
  const screenshot = async name => {
    const result = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(fileURLToPath(new URL(name, import.meta.url)), Buffer.from(result.data, 'base64'));
  };
  await call('Page.enable');
  await call('Runtime.enable');
  const source = await readFile(new URL('../apps/api/src/static/slack-terms-content.html', import.meta.url), 'utf8');
  for (const mode of ['server', 'react']) {
    for (const width of [1440, 1024, 768, 390, 320]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height: 1100, deviceScaleFactor: 1, mobile: width < 700 });
      const url = `http://127.0.0.1:8097/legal/slack-terms-of-service${mode === 'react' ? '?spa=1' : ''}`;
      await call('Page.navigate', { url });
      await poll(`document.querySelectorAll('.slt-document section').length === 13`);
      await poll(`document.querySelectorAll('.site-header').length === 1`);
      await poll(`Array.from(document.querySelectorAll('.slack-terms img')).every(img => img.complete && img.naturalWidth > 0)`);
      if (await evaluate(`Boolean(document.querySelector('#root .site-header'))`)) {
        // Close the existing app-wide preferences dialog without saving a
        // consent choice. Direct server delivery never loads that dialog.
        await evaluate(`document.querySelector('button[aria-label="Close cookie preferences"]')?.click()`);
        await poll(`!document.querySelector('.consent-overlay')`);
      }
      // Ignore whitespace normalization, compare all legal sections, not just headings.
      const state = await evaluate(`(() => {
        const source = new DOMParser().parseFromString(${JSON.stringify(source)}, 'text/html');
        const norm = text => text.replace(/\\s+/g, ' ').trim();
        const contentMatches = [...source.querySelectorAll('.slt-document section')].every(section => norm(section.textContent) === norm(document.getElementById(section.id).textContent));
        return {
          width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
          contentMatches, title: document.title,
          canonical: document.querySelector('link[rel="canonical"]')?.href,
          robots: document.querySelector('meta[name="robots"]')?.content,
          missingAnchors: [...document.querySelectorAll('.slack-terms a[href^="#"]')].filter(a => !document.getElementById(a.hash.slice(1))).length,
          overflow: [...document.querySelectorAll('.slack-terms h1,.slack-terms h2,.slack-terms p,.slack-terms code')].filter(el => el.scrollWidth > el.clientWidth + 2).map(el => el.tagName),
        };
      })()`);
      if (!state.contentMatches || state.scrollWidth > width || state.missingAnchors || state.overflow.length) throw new Error(JSON.stringify({ mode, ...state }));
      if (state.canonical !== 'https://shelfmerch.io/legal/slack-terms-of-service' || state.robots !== 'noindex, follow' || !state.title.includes('Slack Integration Terms')) throw new Error('Incorrect metadata: ' + JSON.stringify(state));
      console.log(JSON.stringify({ mode, ...state }));
      if ([1440, 390].includes(width)) await screenshot(`slack-terms-${mode}-${width}.png`);
      if (width === 390) {
        await evaluate(`document.querySelector('.site-header button[aria-label="Open menu"]').click()`);
        await poll(`Boolean(document.querySelector('.site-header.menu-open'))`);
        await evaluate(`document.querySelector('.site-header button.menu-button[aria-label="Close menu"]').click()`);
        await poll(`!document.querySelector('.site-header.menu-open')`);
      }
      if (mode === 'server' && width === 1440) {
        await evaluate(`document.querySelector('.slt-sidebar a[href="#slack-permissions"]').click()`);
        await pause(150);
        const top = await evaluate(`document.getElementById('slack-permissions').getBoundingClientRect().top`);
        if (top < 0 || top > 100) throw new Error('Section navigation did not reach permissions');
        await screenshot('slack-terms-permissions-1440.png');
      }
    }
  }
  // Browser navigation with page scripts disabled: document is still complete.
  await call('Emulation.setScriptExecutionDisabled', { value: true });
  await call('Page.navigate', { url: 'http://127.0.0.1:8097/legal/slack-terms-of-service' });
  await poll(`document.querySelectorAll('.slt-document section').length === 13`);
  const noJs = await evaluate(`({count: document.querySelectorAll('.slt-document section').length, visible: document.querySelector('#slack-disconnect').getBoundingClientRect().height > 0, scripts: document.scripts.length})`);
  if (noJs.count !== 13 || !noJs.visible) throw new Error('No-JS check failed');
  console.log('JavaScript disabled: all 13 sections present and rendered.');
  if (browserErrors.length) throw new Error('Browser exceptions: ' + JSON.stringify(browserErrors));
} finally {
  if (call && socket?.readyState === WebSocket.OPEN) { try { await call('Browser.close'); } catch {} }
  socket?.close();
  if (browser.exitCode === null) browser.kill();
}
