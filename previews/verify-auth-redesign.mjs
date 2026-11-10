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
  for(const route of ['login','signup']) {
    await call('Page.navigate',{url:`http://localhost:8080/${route}`});
    let ready=false;
    for(let n=0;n<100;n++) {
      ready=await evaluate(`Boolean(document.querySelector('.auth-welcome-redesign')&&document.querySelector('.auth-simple-input')&&getComputedStyle(document.querySelector('.auth-simple-input')).fontSize==='16px'&&getComputedStyle(document.querySelector('.auth-simple-field .auth-simple-label')).position==='static'&&document.querySelector('h1')?.textContent.includes('${route==='login'?'Welcome back':'Create your account'}'))`);
      if(ready)break;
      await pause(100);
    }
    if(!ready){console.log(await evaluate(`({url:location.href,root:document.querySelector('.auth-simple')?.className,label:[...document.querySelectorAll('label')].map(l=>({text:l.textContent,position:getComputedStyle(l).position,opacity:getComputedStyle(l).opacity})),input:[...document.querySelectorAll('input')].map(i=>({font:getComputedStyle(i).fontSize})),styles:[...document.styleSheets].map(s=>s.href||s.ownerNode?.getAttribute('data-vite-dev-id'))})`));throw new Error(`Auth page did not render: ${route}`);}
    await evaluate(`(()=>{const s=document.createElement('style');s.textContent='.consent-banner{display:none!important}';document.head.append(s)})()`);
    await evaluate(`Promise.all([...document.querySelectorAll('.auth-welcome-redesign img')].map(i=>i.decode()))`);
    for(const width of [1920,1440,1024,768,390,320]) {
      await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<700});
      const state=await evaluate(`({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,radius:getComputedStyle(document.querySelector('.auth-simple-card')).borderRadius,labels:[...document.querySelectorAll('.auth-simple-field .auth-simple-label')].every(l=>getComputedStyle(l).opacity==='1'&&getComputedStyle(l).position==='static'),inputs:[...document.querySelectorAll('.auth-simple-input')].every(i=>getComputedStyle(i).fontSize==='16px'),images:[...document.querySelectorAll('.auth-welcome-redesign img')].every(i=>i.complete&&i.naturalWidth>0),title:document.querySelector('h1').textContent})`);
      if(state.overflow||state.radius!=='8px'||!state.labels||!state.inputs||!state.images)throw new Error(JSON.stringify({route,...state}));
      report.push({route,...state});
      if([1440,390].includes(width)) {
        await evaluate('scrollTo(0,0)');
        const height=await evaluate('document.documentElement.scrollHeight');
        const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height,scale:1}});
        await writeFile(fileURLToPath(new URL(`auth-${route}-${width}.png`,import.meta.url)),Buffer.from(shot.data,'base64'));
      }
    }
    if(route==='login') {
      for(const [width,height] of [[1920,820],[1440,720],[1366,650],[1024,700]]) {
        await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
        await evaluate('document.fonts.ready');
        const fit=await evaluate(`({width:innerWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight,scrollWidth:document.documentElement.scrollWidth,labels:[...document.querySelectorAll('.auth-art-labels span')].map(e=>e.textContent),logo:!!document.querySelector('.auth-corner-logo'),artBottom:document.querySelector('.auth-welcome-art-copy').getBoundingClientRect().bottom,cardBottom:document.querySelector('.auth-simple-card').getBoundingClientRect().bottom})`);
        if(fit.scrollHeight>height+1||fit.scrollWidth>width||fit.artBottom>height||fit.cardBottom>height||!fit.logo||fit.labels.join(',')!=='Merch,Gifting,Recognition')throw new Error('Desktop fit failed: '+JSON.stringify(fit));
        console.log('Desktop fit: '+JSON.stringify(fit));
        if(width===1440) {
          const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
          await writeFile(fileURLToPath(new URL('auth-login-desktop-fit.png',import.meta.url)),Buffer.from(shot.data,'base64'));
        }
      }

      await evaluate(`document.querySelector('button[aria-label="Show password"]').click()`);
      if(!await evaluate(`document.getElementById('login-password').type==='text'&&!!document.querySelector('button[aria-label="Hide password"]')`))throw new Error('Password visibility toggle failed');
      await evaluate(`document.querySelector('button[aria-label="Hide password"]').click()`);
      if(!await evaluate(`document.getElementById('login-password').type==='password'`))throw new Error('Password hiding failed');
      await evaluate(`document.querySelector('.auth-forgot-below').click()`);
      for(let n=0;n<40;n++){if(await evaluate(`location.pathname==='/forgot-password'`))break;await pause(100);}
      if(!await evaluate(`location.pathname==='/forgot-password'`))throw new Error('Forgot password link failed');
    }
  }
  await evaluate(`document.querySelector('.auth-simple-switch-link').click()`);
  for(let n=0;n<40;n++){if(await evaluate(`location.pathname==='/login'`))break;await pause(100);}
  if(!await evaluate(`location.pathname==='/login'`))throw new Error('Login switch link failed');
  await writeFile(fileURLToPath(new URL('auth-redesign-verification.json',import.meta.url)),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
  console.log('Password show/hide, forgot password, and login switch links passed. No credentials submitted.');
} finally {
  if (call && socket?.readyState === WebSocket.OPEN) { try { await call('Browser.close'); } catch {} }
  socket?.close();
  if (browser.exitCode === null) browser.kill();
}



