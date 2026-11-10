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
  const poll=async expression=>{for(let n=0;n<80;n++){if(await evaluate(expression))return;await pause(50);}throw new Error('Condition failed: '+expression);};
  for(const width of [1440,768,390,320]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:width===320?'reduce':'no-preference'}]});
    await call('Page.navigate',{url:'http://localhost:8080/'});
    await poll(`Boolean(document.querySelector('.landing-home .lh-hero'))`);
    await evaluate('scrollTo(0,0)');
    await pause(150);
    if(await evaluate(`!!document.querySelector('.home-demo-banner')`))throw new Error('Banner visible on hero');
    await evaluate(`scrollTo(0,document.querySelector('.lh-hero').getBoundingClientRect().bottom+scrollY+120)`);
    await poll(`!!document.querySelector('.home-demo-banner')`);
    const consentBlocked=await evaluate(`!document.querySelector('.consent-banner')||getComputedStyle(document.querySelector('.home-demo-banner')).display==='none'`);
    if(!consentBlocked)throw new Error('Cookie notice conflict');
    // Preview-only: hide the consent UI without changing consent choices or React-owned nodes.
    await evaluate(`(()=>{const el=document.querySelector('.consent-banner');if(el){el.classList.replace('consent-banner','preview-consent-banner');el.style.display='none';}})()`);
    await poll(`getComputedStyle(document.querySelector('.home-demo-banner')).display!=='none'`);
    await evaluate(`document.querySelector('.home-demo-banner img').decode()`);
    await evaluate(`Promise.all(document.querySelector('.home-demo-banner').getAnimations().map(a=>a.finished))`);
    if(width===320&&!await evaluate(`getComputedStyle(document.querySelector('.home-demo-banner')).animationName==='none'`))throw new Error('Reduced motion not respected');
    const state=await evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,banner:document.querySelector('.home-demo-banner').getBoundingClientRect().toJSON(),cta:document.querySelector('.home-demo-banner__cta').getBoundingClientRect().toJSON(),href:document.querySelector('.home-demo-banner__cta').getAttribute('href')})`);
    if(state.scrollWidth>width||state.banner.left<0||state.banner.right>width||state.cta.height<44||state.href!=='/request-demo')throw new Error(JSON.stringify(state));
    console.log(JSON.stringify(state));
    if(width===1440||width===390){
      const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      await writeFile(fileURLToPath(new URL(`home-demo-banner-${width}.png`,import.meta.url)),Buffer.from(shot.data,'base64'));
    }
    await evaluate(`document.querySelector('.lh-final').scrollIntoView()`);
    await poll(`!document.querySelector('.home-demo-banner')`);
    await evaluate(`scrollTo(0,document.querySelector('.lh-hero').getBoundingClientRect().bottom+scrollY+120)`);
    await poll(`!!document.querySelector('.home-demo-banner')`);
    if(width===320){
      await evaluate(`document.querySelector('.home-demo-banner__cta').click()`);
      await poll(`location.pathname==='/request-demo'`);
    }else{
      await evaluate(`document.querySelector('.home-demo-banner__close').click()`);
      await poll(`!document.querySelector('.home-demo-banner')`);
      await evaluate(`scrollBy(0,200)`);
      await pause(100);
      if(await evaluate(`!!document.querySelector('.home-demo-banner')`))throw new Error('Dismissal did not persist');
    }
  }
  console.log('Hero threshold, cookie priority, end-section suppression, dismissal and demo navigation passed.');
} finally {
  if (call && socket?.readyState === WebSocket.OPEN) { try { await call('Browser.close'); } catch {} }
  socket?.close();
  if (browser.exitCode === null) browser.kill();
}



