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
  await call('Page.navigate',{url:'http://localhost:8080/privacy'});
  let ready=false;
  for(let n=0;n<100;n++) {
    ready=await evaluate(`Boolean(document.querySelector('.privacy-hero')&&getComputedStyle(document.querySelector('.privacy-layout')).display==='grid')`);
    if(ready)break;
    await pause(100);
  }
  if(!ready)throw new Error('Privacy page not ready');
  await evaluate(`(()=>{const s=document.createElement('style');s.textContent='.consent-banner{display:none!important}';document.head.append(s)})()`);
  const source=await readFile(fileURLToPath(new URL('../apps/web/src/features/marketing/pages/privacy.html',import.meta.url)),'utf8');
  const preserved=await evaluate(`(()=>{const source=new DOMParser().parseFromString(${JSON.stringify(source)},'text/html');const norm=t=>t.replace(/\\s+/g,' ').trim();return [...source.querySelectorAll('article.policy')].map(s=>({id:s.id,match:norm(s.querySelector('.copy').textContent)===norm(document.getElementById(s.id).querySelector('.privacy-policy-copy').textContent)}))})()`);
  if(preserved.length!==15||preserved.some(s=>!s.match))throw new Error('Policy wording changed: '+JSON.stringify(preserved));
  console.log('All 15 original policy sections preserved.');
  for(const width of [1440,1024,768,390,320]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    await evaluate('scrollTo(0,0)');
    const state=await evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,sections:document.querySelectorAll('.privacy-section').length,preferences:document.querySelectorAll('#cookie-preferences').length,checkboxes:document.querySelectorAll('#cookie-preferences input[type=checkbox]').length,essential:document.querySelector('#cookie-preferences input').disabled&&document.querySelector('#cookie-preferences input').checked,canonical:document.querySelector('link[rel=canonical]')?.href})`);
    if(state.scrollWidth>width||state.sections!==15||state.preferences!==1||state.checkboxes!==3||!state.essential)throw new Error(JSON.stringify(state));
    console.log(JSON.stringify(state));
    if(width===1440||width===390){
      const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      await writeFile(fileURLToPath(new URL(`privacy-${width}.png`,import.meta.url)),Buffer.from(shot.data,'base64'));
    }
  }
  await evaluate(`document.querySelector('.privacy-sidebar a[href="#rights"]').click()`);
  if(!await evaluate(`location.hash==='#rights'&&Math.abs(document.getElementById('rights').getBoundingClientRect().top-110)<3`))throw new Error('Policy anchor failed');
  await evaluate(`document.querySelector('.privacy-cookie-link').click()`);
  if(!await evaluate(`location.hash==='#cookie-preferences'&&Math.abs(document.getElementById('cookie-preferences').getBoundingClientRect().top-110)<3`))throw new Error('Cookie anchor failed');
  console.log('Policy index and cookie preference anchors passed.');
} finally {
  if (call && socket?.readyState === WebSocket.OPEN) { try { await call('Browser.close'); } catch {} }
  socket?.close();
  if (browser.exitCode === null) browser.kill();
}



