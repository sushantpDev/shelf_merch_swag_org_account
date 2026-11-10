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

  for(const width of [1440,390]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<760});
    await call('Page.reload');
    let initial;
    for(let n=0;n<80;n++) {
      initial=await evaluate(`({pending:document.querySelectorAll('[data-lh-reveal="pending"]').length,hero:!!document.querySelector('.lh-hero')})`);
      if(initial.hero&&initial.pending>0)break;
      await pause(100);
    }
    if(!initial.pending)throw new Error('Missing pending reveal elements');
    await evaluate(`document.querySelector('.lh-moment-grid article').scrollIntoView({block:'center',behavior:'instant'})`);
    let visible=false;
    for(let n=0;n<40;n++) {
      visible=await evaluate(`(()=>{const a=document.querySelector('.lh-moment-grid article');return a.dataset.lhReveal==='visible'&&getComputedStyle(a).opacity==='1';})()`);
      if(visible)break;
      await pause(50);
    }
    if(!visible)throw new Error('Scroll reveal did not finish');
    await evaluate('scrollTo({top:0,behavior:"instant"})');
    if(!await evaluate(`document.querySelector('.lh-moment-grid article').dataset.lhReveal==='visible'`))throw new Error('Reveal reset after scroll');
    console.log(JSON.stringify({width,pending:initial.pending,revealed:true,staysVisible:true}));
  }
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await call('Page.reload');
  let reduced=false;
  for(let n=0;n<80;n++) {
    reduced=await evaluate(`(()=>{const a=document.querySelector('.lh-moment-grid article');return !!a&&matchMedia('(prefers-reduced-motion: reduce)').matches&&document.querySelectorAll('[data-lh-reveal]').length===0&&getComputedStyle(a).opacity==='1';})()`);
    if(reduced)break;
    await pause(100);
  }
  if(!reduced)throw new Error('Reduced motion failed');
  console.log('Reduced motion: all content visible, no reveal animations');
} finally {
  if (call && socket?.readyState === WebSocket.OPEN) { try { await call('Browser.close'); } catch {} }
  socket?.close();
  if (browser.exitCode === null) browser.kill();
}



