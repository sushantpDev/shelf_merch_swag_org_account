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
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:'http://localhost:8080/'});
  let ready=false;
  for(let i=0;i<100;i++){if(await evaluate('Boolean(document.querySelector(".lh-hero"))')){ready=true;break;}await pause(200);}
  if(!ready)throw new Error('Home page did not render');
  await evaluate(`(async()=>{const style=document.createElement('style');style.textContent='.consent-banner{display:none!important}';document.head.append(style);await Promise.all([...document.querySelectorAll('.lh-main img')].map(async i=>{i.loading='eager';await i.decode();}));})()`);

  for(const width of [1440,390,320]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<760});
    const box=await evaluate(`(()=>{const s=document.querySelector('[aria-labelledby="lh-resources-title"]');const r=s.getBoundingClientRect();return {x:r.x,y:r.y+scrollY,width:r.width,height:r.height,overflow:document.documentElement.scrollWidth>innerWidth,images:[...s.querySelectorAll('img')].every(i=>i.complete&&i.naturalWidth>0),links:[...s.querySelectorAll('a')].map(a=>a.getAttribute('href'))};})()`);
    if(box.overflow||!box.images||box.links.length!==4)throw new Error(JSON.stringify(box));
    const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:box.x,y:box.y,width:box.width,height:box.height,scale:1}});
    await writeFile(fileURLToPath(new URL(`lh-resources-${width}.png`,import.meta.url)),Buffer.from(shot.data,'base64'));
    console.log(JSON.stringify({width,...box}));
  }
} finally {
  if (call && socket?.readyState === WebSocket.OPEN) { try { await call('Browser.close'); } catch {} }
  socket?.close();
  if (browser.exitCode === null) browser.kill();
}




