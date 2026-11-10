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
  for(const width of [1440,768,390,320]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    await call('Page.navigate',{url:'http://localhost:8080/'});
    await poll(`!!document.querySelector('.consent-banner')`);
    const savedBefore=await evaluate(`JSON.stringify(localStorage)`);
    for(const expanded of [false,true]) {
      if(expanded)await evaluate(`document.querySelector('.consent-banner__links button').click()`);
      await poll(`Boolean(document.querySelector('.consent-banner__prefs'))===${expanded}`);
      const state=await evaluate(`(()=>{const panel=document.querySelector('.consent-banner');const r=panel.getBoundingClientRect();return {width:innerWidth,expanded:${expanded},x:r.x,y:r.y,widthPanel:r.width,height:r.height,scrollWidth:panel.scrollWidth,clientWidth:panel.clientWidth,modal:panel.getAttribute('aria-modal'),backgroundLocked:[...document.body.children].filter(e=>e instanceof HTMLElement&&!e.classList.contains('consent-overlay')).every(e=>e.inert),choices:[...panel.querySelectorAll('input')].map(i=>({checked:i.checked,disabled:i.disabled})),bodyOverflow:document.body.style.overflow};})()`);
      console.log(JSON.stringify(state));
      if(state.x<0||state.y<0||state.x+state.widthPanel>width||state.y+state.height>901||state.scrollWidth>state.clientWidth||state.modal!=='true'||!state.backgroundLocked)throw new Error('Consent layout failed');
      if(expanded&&(state.choices.length!==3||!state.choices[0].checked||!state.choices[0].disabled||state.choices[1].checked||state.choices[2].checked))throw new Error('Unexpected consent defaults');
      if((width===1440||width===390)&&!expanded){const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(fileURLToPath(new URL(`consent-modal-${width}.png`,import.meta.url)),Buffer.from(shot.data,'base64'));}
    }
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await poll(`!document.querySelector('.consent-banner')`);
    if(await evaluate(`document.body.style.overflow==='hidden'||[...document.body.children].some(e=>e instanceof HTMLElement&&e.inert)`))throw new Error('Page lock not restored');
    if(await evaluate(`JSON.stringify(localStorage)`)!==savedBefore)throw new Error('Dismissing saved consent');
    await evaluate(`window.dispatchEvent(new Event('shelfmerch:open-consent'))`);
    await poll(`!!document.querySelector('.consent-banner__prefs')`);
  }
  console.log('Centered popup, responsive overflow, preference defaults, Escape dismissal, footer reopening and no saved choice verified.');
} finally {
  if (call && socket?.readyState === WebSocket.OPEN) { try { await call('Browser.close'); } catch {} }
  socket?.close();
  if (browser.exitCode === null) browser.kill();
}




