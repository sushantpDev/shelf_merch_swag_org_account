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
  await call('Page.navigate',{url:'http://localhost:8080/login'});
  for(let n=0;n<100;n++) {
    if(await evaluate(`Boolean(document.querySelector('.auth-reference-kit')&&getComputedStyle(document.querySelector('.auth-simple-shell')).gap==='0px')`))break;
    await pause(100);
  }
  await evaluate(`(()=>{const s=document.createElement('style');s.textContent='.consent-banner{display:none!important}';document.head.append(s)})()`);
  await evaluate(`Promise.all([...document.querySelectorAll('img')].map(i=>i.decode()))`);
  for(const [width,height] of [[1672,942],[1280,580],[390,844]]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    const state=await evaluate(`({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,card:document.querySelector('.auth-simple-card').getBoundingClientRect().toJSON(),art:document.querySelector('.auth-simple-art').getBoundingClientRect().toJSON(),logo:getComputedStyle(document.querySelector('.auth-corner-logo-image')).filter})`);
    console.log(JSON.stringify(state));
    if(state.scrollWidth>width||state.card.right>width+1)throw new Error('Horizontal overflow');
    if(width>700&&state.scrollHeight>height+1)throw new Error('Desktop vertical overflow');
    const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(fileURLToPath(new URL(`auth-reference-${width}.png`,import.meta.url)),Buffer.from(shot.data,'base64'));
  }
  await evaluate(`document.querySelector('button[aria-label="Show password"]').click()`);
  if(!await evaluate(`document.getElementById('login-password').type==='text'`))throw new Error('Password toggle failed');
  await evaluate(`document.querySelector('button[aria-label="Hide password"]').click()`);
  console.log('Password visibility controls passed.');
} finally {
  if (call && socket?.readyState === WebSocket.OPEN) { try { await call('Browser.close'); } catch {} }
  socket?.close();
  if (browser.exitCode === null) browser.kill();
}



