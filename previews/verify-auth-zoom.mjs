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
  const report=[];
  for (const route of ['login','signup']) {
    await call('Page.navigate',{url:`http://localhost:8080/${route}`});
    for(let i=0;i<100;i++) {
      if(await evaluate(`Boolean(document.querySelector('.auth-simple-card')&&document.querySelector('.auth-simple-label')&&getComputedStyle(document.querySelector('.auth-simple-label')).position==='static')`))break;
      await pause(100);
    }
    await evaluate(`(()=>{const s=document.createElement('style');s.textContent='.consent-banner{display:none!important}';document.head.append(s)})()`);
    for(const [width,height] of [[1920,820],[1536,656],[1280,546],[1097,469],[960,410],[390,780],[320,568]]) {
      await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await evaluate('document.fonts.ready');
      const state=await evaluate(`({width:innerWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight,scrollWidth:document.documentElement.scrollWidth,card:document.querySelector('.auth-simple-card').getBoundingClientRect().toJSON(),art:getComputedStyle(document.querySelector('.auth-simple-art')).display,inputs:[...document.querySelectorAll('.auth-simple-input')].map(e=>({height:e.offsetHeight,bottom:e.getBoundingClientRect().bottom})),submit:document.querySelector('.auth-simple-submit').getBoundingClientRect().bottom})`);
      const mustFit=width>=701||route==='login';
      if(width>=701&&state.art==='none')throw new Error('Desktop artwork hidden');
      if(state.scrollWidth>width||(mustFit&&(state.scrollHeight>height+1||state.card.top<0||state.card.bottom>height+1||state.submit>height)))throw new Error('Auth layout overflow: '+JSON.stringify({route,...state}));
      report.push({route,...state});
      console.log(JSON.stringify({route,...state}));
      if(width===960||width===1536){
        const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
        await writeFile(fileURLToPath(new URL(`auth-zoom-${route}-${width}.png`,import.meta.url)),Buffer.from(shot.data,'base64'));
      }
    }
  }
  await writeFile(fileURLToPath(new URL('auth-zoom-verification.json',import.meta.url)),JSON.stringify(report,null,2));
} finally {
  if (call && socket?.readyState === WebSocket.OPEN) { try { await call('Browser.close'); } catch {} }
  socket?.close();
  if (browser.exitCode === null) browser.kill();
}



