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
  for (const width of [1440, 1080, 768, 390, 320]) {
    await call('Emulation.setDeviceMetricsOverride', {width, height:900, deviceScaleFactor:1, mobile:false});
    await call('Page.navigate', {url:'http://localhost:8080/request-demo'});
    for(let n=0;n<80;n++) { if(await evaluate(`!!document.querySelector('.request-demo__intro h1 em')`)) break; await pause(100); }
    const result = await evaluate(`(() => {
      const root=document.querySelector('.request-demo');
      const heading=root.querySelector('h1');
      const styles=el=>{const s=getComputedStyle(el);return {font:s.fontFamily,size:s.fontSize,weight:s.fontWeight,lineHeight:s.lineHeight};};
      return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,hero:styles(heading),accent:styles(heading.querySelector('em')),section:styles(root.querySelector('.request-demo__section h2')),body:styles(root.querySelector('.request-demo__lead')),input:styles(root.querySelector('input')),overflow:[...root.querySelectorAll('h1,h2,h3,p,input,button')].filter(el=>el.getBoundingClientRect().right>innerWidth+1||el.scrollWidth>el.clientWidth+2).map(el=>({tag:el.tagName,class:el.className,text:el.textContent?.slice(0,50)}))};
    })()`);
    console.log(JSON.stringify(result));
    if(result.scrollWidth>width||result.overflow.length)throw new Error('Typography overflow');
    if(width===1440||width===390){
      const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      await writeFile(fileURLToPath(new URL(`request-demo-type-${width}.png`,import.meta.url)),Buffer.from(shot.data,'base64'));
    }
  }
} finally {
  if (call && socket?.readyState === WebSocket.OPEN) { try { await call('Browser.close'); } catch {} }
  socket?.close();
  if (browser.exitCode === null) browser.kill();
}




