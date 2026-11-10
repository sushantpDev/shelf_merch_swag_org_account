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
  const sourceTerms=await readFile(fileURLToPath(new URL('../apps/web/src/features/marketing/pages/terms.html',import.meta.url)),'utf8');
  const poll=async expression=>{for(let i=0;i<80;i++){if(await evaluate(expression))return;await pause(100);}throw new Error('Condition failed: '+expression);};
  for(const width of [1440,1024,768,390,320]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    await call('Page.navigate',{url:'http://localhost:8080/terms'});
    await poll(`document.querySelectorAll('.terms-article').length===13`);
    await evaluate(`(()=>{const c=document.querySelector('.consent-banner');if(c)c.style.display='none';})()`);
    const preserved=await evaluate(`(()=>{const doc=new DOMParser().parseFromString(${JSON.stringify(sourceTerms)},'text/html');return {sections:[...doc.querySelectorAll('main article')].every(s=>{const rendered=document.querySelector('.terms-article#'+s.id);return rendered.querySelector('h3').textContent===s.querySelector('h2').textContent&&rendered.querySelector('.terms-article-summary').textContent===s.querySelector('.title em').textContent&&rendered.querySelector('.terms-copy').innerHTML===s.querySelector('.copy').innerHTML;}),note:document.querySelector('.terms-legal-note').textContent===doc.querySelector('.legal-note').textContent,date:document.querySelector('.terms-document-meta').textContent.includes(doc.querySelector('.date').textContent)};})()`);
    if(!preserved.sections||!preserved.note||!preserved.date)throw new Error('Source terms mismatch');
    const state=await evaluate(`(()=>{const root=document.querySelector('.terms-page');const ids=[...root.querySelectorAll('[id]')].map(el=>el.id);return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,sections:root.querySelectorAll('.terms-article').length,directory:root.querySelectorAll('.terms-directory a').length,duplicateIds:ids.length!==new Set(ids).size,missingTargets:[...root.querySelectorAll('a[href^="#"]')].filter(a=>!document.getElementById(a.hash.slice(1))).length,overflow:[...root.querySelectorAll('h1,h2,h3,p,a')].filter(el=>el.getBoundingClientRect().right>innerWidth+1||el.scrollWidth>el.clientWidth+2).map(el=>el.className)};})()`);
    console.log(JSON.stringify({...state,preserved}));
    if(state.scrollWidth>width||state.overflow.length||state.duplicateIds||state.missingTargets)throw new Error('Terms responsive check failed');
    if(width===1440||width===390){const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:width===1440?1500:1000,scale:1}});await writeFile(fileURLToPath(new URL(`terms-redesign-${width}.png`,import.meta.url)),Buffer.from(shot.data,'base64'));}
    await evaluate(`document.querySelector('.terms-directory a[href="#delivery"]').click()`);
    await poll(`location.hash==='#delivery'`);
    await poll(`document.getElementById('delivery').getBoundingClientRect().top>=document.querySelector('.terms-chapter-nav').getBoundingClientRect().bottom-1&&document.getElementById('delivery').getBoundingClientRect().top<300`);
    if(width===1440){const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(fileURLToPath(new URL('terms-reading-desktop.png',import.meta.url)),Buffer.from(shot.data,'base64'));}
    await evaluate(`document.querySelector('.terms-chapter-nav a[href="#terms-responsibilities"]').click()`);
    await poll(`location.hash==='#terms-responsibilities'`);
  }
  await call('Page.navigate',{url:'http://localhost:8080/terms#returns'});
  await poll(`!!document.querySelector('.terms-article#returns')`);
  await poll(`document.getElementById('returns').getBoundingClientRect().top>=document.querySelector('.terms-chapter-nav').getBoundingClientRect().bottom-1&&document.getElementById('returns').getBoundingClientRect().top<300`);
  console.log('All 13 original legal sections, summaries, dates and legal note preserved. Directory, chapter links, direct hash links and responsive checks passed.');
} finally {
  if (call && socket?.readyState === WebSocket.OPEN) { try { await call('Browser.close'); } catch {} }
  socket?.close();
  if (browser.exitCode === null) browser.kill();
}




