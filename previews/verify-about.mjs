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
  await call('Page.navigate',{url:'http://localhost:8080/about'});
  let ready=false;
  for(let i=0;i<100;i++){if(await evaluate('Boolean(document.querySelector(".ab-hero"))')){ready=true;break;}await pause(200);}
  if(!ready)throw new Error('About page did not render');
  await evaluate(`(async()=>{const style=document.createElement('style');style.textContent='.consent-banner{display:none!important}';document.head.append(style);await Promise.all([...document.querySelectorAll('.ab-main img')].map(async i=>{i.loading='eager';await i.decode();}));})()`);
  const report=[];
  for(const width of [1920,1440,1024,768,390,320]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<760});
    await pause(100);
    const state=await evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,h1:document.querySelectorAll('main h1').length,images:[...document.querySelectorAll('.ab-main img')].every(i=>i.complete&&i.naturalWidth>0),headings:[...document.querySelectorAll('.ab-main h2')].map(h=>getComputedStyle(h).fontSize),brokenAnchors:[...document.querySelectorAll('.ab-main a[href^="#"]')].filter(a=>!document.getElementById(a.hash.slice(1))).length,body:[...document.querySelectorAll('.ab-main p,.ab-main li')].map(p=>{const s=getComputedStyle(p);return {size:s.fontSize,font:s.fontFamily,leading:s.lineHeight};})})`);
    if(state.scrollWidth>width||state.h1!==1||!state.images||state.brokenAnchors||new Set(state.headings).size!==1||new Set(state.body.map(s=>JSON.stringify(s))).size!==1)throw new Error(JSON.stringify(state));
    state.body=state.body[0];report.push(state);
    for(const id of ['software','production','fulfilment']) {
      await evaluate(`document.getElementById('ab-model-tab-${id}').click()`);
      await evaluate(`document.querySelector('.ab-model-art img').decode()`);
      if(!(await evaluate(`document.getElementById('ab-model-tab-${id}').getAttribute('aria-selected')==='true'&&document.getElementById('ab-model-panel').getAttribute('aria-labelledby')==='ab-model-tab-${id}'&&document.documentElement.scrollWidth<=innerWidth`)))throw new Error('About model tab failed');
    }
    await evaluate(`document.getElementById('ab-model-tab-software').click();document.getElementById('ab-model-tab-software').focus()`);
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
    if(!(await evaluate(`document.activeElement.id==='ab-model-tab-production'&&document.getElementById('ab-model-tab-production').getAttribute('aria-selected')==='true'`)))throw new Error('About model keyboard navigation failed');
    await evaluate(`document.getElementById('ab-model-tab-software').click();scrollTo(0,0)`);

    await pause(100);
    if(width===1440||width===390){
      const hero=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:900,scale:1}});
      await writeFile(fileURLToPath(new URL(`ab-hero-${width}.png`,import.meta.url)),Buffer.from(hero.data,'base64'));
      const bounds=await evaluate(`(()=>{const r=document.querySelector('.ab-model').getBoundingClientRect();return {y:r.top+scrollY,height:r.height}})()`);
      const model=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:bounds.y,width,height:bounds.height,scale:1}});
      await writeFile(fileURLToPath(new URL(`about-model-${width}.png`,import.meta.url)),Buffer.from(model.data,'base64'));
      const height=await evaluate('document.documentElement.scrollHeight');
      const full=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height,scale:1}});
      await writeFile(fileURLToPath(new URL(`ab-page-${width}.png`,import.meta.url)),Buffer.from(full.data,'base64'));
    }
  }
  await evaluate(`document.querySelector('.ab-hero a[href="#our-model"]').click()`);await pause(100);
  if(!(await evaluate('location.hash==="#our-model"')))throw new Error('About anchor failed');
  await evaluate(`document.querySelector('.ab-next a[href="/request-demo"]').click()`);await pause(300);
  if(!(await evaluate('location.pathname==="/request-demo"')))throw new Error('About demo link failed');
  await writeFile(fileURLToPath(new URL('ab-verification.json',import.meta.url)),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} finally {
  if (call && socket?.readyState === WebSocket.OPEN) { try { await call('Browser.close'); } catch {} }
  socket?.close();
  if (browser.exitCode === null) browser.kill();
}


