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
  const poll=async expression=>{for(let i=0;i<80;i++){if(await evaluate(expression))return;await pause(100);}throw new Error(expression);};
  for(const [width,height] of [[320,667],[375,812],[390,844],[430,932],[1440,900]]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await call('Page.navigate',{url:'http://localhost:8080/login'});
    await poll(`!!document.querySelector('.auth-simple-card') && document.querySelector('.auth-reference-kit').complete`);
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    const state=await evaluate(`(()=>{const button=document.querySelector('button[type=submit]'),card=document.querySelector('.auth-simple-card');return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,buttonBottom:button.getBoundingClientRect().bottom,cardTop:card.getBoundingClientRect().top,cardBottom:card.getBoundingClientRect().bottom,pills:getComputedStyle(document.querySelector('.auth-reference-pills')).display,inputFont:getComputedStyle(document.querySelector('input')).fontSize}})()`);
    console.log(JSON.stringify(state));
    if(state.scrollWidth>width||Number.parseFloat(state.inputFont)<16)throw new Error('Overflow or small input text');
    if(width<701 && (state.buttonBottom>height||state.pills!=='none'))throw new Error('Mobile login button below fold');
    if(width===390||width===1440){const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(fileURLToPath(new URL(`auth-mobile-fix-${width}.png`,import.meta.url)),Buffer.from(shot.data,'base64'));}
  }
} finally {
  if (call && socket?.readyState === WebSocket.OPEN) { try { await call('Browser.close'); } catch {} }
  socket?.close();
  if (browser.exitCode === null) browser.kill();
}






