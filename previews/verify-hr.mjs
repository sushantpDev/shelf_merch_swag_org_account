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
  await call('Emulation.setDeviceMetricsOverride', {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate', {url:'http://localhost:8080/resources/hr'});
  let ready=false;
  for(let i=0;i<100;i++){if(await evaluate('Boolean(document.querySelector(".hr-hero"))')){ready=true;break;}await pause(200);}
  if(!ready) throw new Error('HR page did not render');
  await evaluate(`(async()=>{const style=document.createElement('style');style.textContent='.consent-banner{display:none!important}';document.head.append(style);await Promise.all([...document.querySelectorAll('.hr-page img')].map(async img=>{img.loading='eager';await img.decode();}));})()`);
  const report=[];
  for(const width of [1440,1024,768,390,320]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<760});
    await pause(150);
    const state=await evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,background:getComputedStyle(document.querySelector('.hr-hero')).backgroundColor,h1:document.querySelectorAll('main h1').length,images:[...document.querySelectorAll('.hr-page img')].every(i=>i.complete&&i.naturalWidth>0),headings:[...document.querySelectorAll('.hr-page h2')].map(h=>getComputedStyle(h).fontSize),brokenAnchors:[...document.querySelectorAll('.hr-page a[href^="#"]')].filter(a=>!document.getElementById(a.hash.slice(1))).length})`);
    if(state.scrollWidth>width||!state.images||state.h1!==1||state.brokenAnchors||new Set(state.headings).size!==1)throw new Error(JSON.stringify(state));
    const bodyStyles=await evaluate(`Array.from(document.querySelectorAll('.hr-hero__intro,.hb-heading > p:not(.hr-eyebrow),.hb-benefit__copy > p,.hb-benefit li,.hb-tool-panel > div > p,.hb-tool-panel li,.hr-centered > p:not(.hr-eyebrow),.hr-steps p,.hr-workflow__foot p,.hr-controls > div > p:not(.hr-eyebrow),.hr-accordions details p,.hr-next > div:first-child > p:not(.hr-eyebrow)'),p=>{const s=getComputedStyle(p);return {size:s.fontSize,family:s.fontFamily,leading:s.lineHeight,weight:s.fontWeight};})`);
    if(new Set(bodyStyles.map(s=>JSON.stringify(s))).size!==1)throw new Error(`Inconsistent HR body typography at ${width}: ${JSON.stringify(bodyStyles)}`);
    state.bodyTypography=bodyStyles[0];
    report.push(state);
    if(width===1440||width===390){
      const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:1000,scale:1}});
      await writeFile(fileURLToPath(new URL(`hr-hero-${width}.png`,import.meta.url)),Buffer.from(shot.data,'base64'));
      const height=await evaluate('document.documentElement.scrollHeight');
      const full=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height,scale:1}});
      await writeFile(fileURLToPath(new URL(`hr-page-${width}.png`,import.meta.url)),Buffer.from(full.data,'base64'));
    }
  }
  await evaluate(`document.querySelectorAll('.hr-accordions summary')[1].click()`);
  if (!(await evaluate(`document.querySelectorAll('.hr-accordions details')[1].open`))) throw new Error('Controls accordion did not open');
  for (const width of [1440,390,320]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<760});
    for (const kind of ['data','store','teams']) {
      await evaluate(`document.getElementById('hb-tab-${kind}').click()`);
      await pause(80);
      const tabState=await evaluate(`({selected:document.getElementById('hb-tab-${kind}').getAttribute('aria-selected'),label:document.getElementById('hb-tool-panel').getAttribute('aria-labelledby'),overflow:document.documentElement.scrollWidth>innerWidth})`);
      if(tabState.selected!=='true'||tabState.label!==`hb-tab-${kind}`||tabState.overflow)throw new Error(JSON.stringify(tabState));
    }
    await evaluate(`document.getElementById('hb-tab-data').click();document.getElementById('hb-tab-data').focus()`);
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
    await pause(80);
    if(!(await evaluate(`document.activeElement.id==='hb-tab-store' && document.getElementById('hb-tab-store').getAttribute('aria-selected')==='true'`)))throw new Error('Tab keyboard navigation failed');
    if(width!==320){
      const area=await evaluate(`(()=>{const r=document.querySelector('.hb-benefits').getBoundingClientRect();return {y:Math.floor(r.top+scrollY),height:Math.ceil(r.height)};})()`);
      const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:area.y,width,height:Math.min(area.height,1300),scale:1}});
      await writeFile(fileURLToPath(new URL(`hr-benefits-${width}.png`,import.meta.url)),Buffer.from(shot.data,'base64'));
    }
  }
  await evaluate(`document.querySelector('.hr-hero a[href="#hr-programs"]').click()`);
  await pause(400);
  if(!(await evaluate('location.hash==="#hr-programs"')))throw new Error('Program anchor failed');
  await evaluate(`document.querySelector('.hr-hero a[href="/request-demo"]').click()`);
  await pause(500);
  if(!(await evaluate('location.pathname==="/request-demo"')))throw new Error('Demo link failed');
  await writeFile(fileURLToPath(new URL('hr-verification.json',import.meta.url)),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
} finally {
  if (call && socket?.readyState === WebSocket.OPEN) { try { await call('Browser.close'); } catch {} }
  socket?.close();
  if (browser.exitCode === null) browser.kill();
}

