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
  const poll=async expression=>{for(let i=0;i<80;i++){if(await evaluate(expression))return;await pause(100);}throw new Error('Condition failed: '+expression);};
  for(const width of [1440,1024,768,390,320]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    await call('Page.navigate',{url:'http://localhost:8080/support'});
    await poll(`!!document.querySelector('.public-support__faqs')`);
    await evaluate(`(()=>{const c=document.querySelector('.consent-banner');if(c)c.style.display='none';})()`);
    const state=await evaluate(`(()=>{const main=document.querySelector('.public-support main');return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,title:document.title,cards:main.querySelectorAll('.public-support__topic').length,faq:main.querySelectorAll('details').length,mail:[...main.querySelectorAll('a[href^="mailto:"]')].every(a=>a.getAttribute('href').startsWith('mailto:support@shelfmerch.com')),overflow:[...main.querySelectorAll('h1,h2,h3,p,a,address')].filter(el=>el.getBoundingClientRect().right>innerWidth+1||el.scrollWidth>el.clientWidth+2).map(el=>el.className),height:document.documentElement.scrollHeight};})()`);
    console.log(JSON.stringify(state));
    if(state.scrollWidth>width||state.overflow.length||state.cards!==4||state.faq!==4||!state.mail)throw new Error('Support layout check failed');
    if(width===1440||width===390){
      const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:state.height,scale:1}});
      await writeFile(fileURLToPath(new URL(`support-redesign-${width}.png`,import.meta.url)),Buffer.from(shot.data,'base64'));
    }
    await evaluate(`document.querySelector('.public-support__faqs summary').click()`);
    await poll(`document.querySelector('.public-support__faqs details').open`);
    await evaluate(`document.querySelector('.public-support__text-link').click()`);
    await poll(`location.hash==='#support-topics'`);
    await evaluate(`document.querySelector('.public-support__faqs details:nth-child(2)').open=true;document.querySelector('.public-support__faqs a[href="/login"]').click()`);
    await poll(`location.pathname==='/login'`);
  }
  console.log('Responsive layout, email targets, FAQ toggles, topic jump and login navigation passed. No email sent or consent preferences changed.');
} finally {
  if (call && socket?.readyState === WebSocket.OPEN) { try { await call('Browser.close'); } catch {} }
  socket?.close();
  if (browser.exitCode === null) browser.kill();
}




