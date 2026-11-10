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
  const source = await readFile('apps/web/src/features/marketing/pages/careers.html','utf8');
  for(const width of [1440,1024,768,390,320]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    await call('Page.navigate',{url:'http://localhost:8080/careers'});
    await poll(`!!document.querySelector('.careers-page') && document.querySelector('.careers-hero img').complete`);
    await evaluate(`document.querySelector('.consent-banner__close')?.click()`);
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    const preserved=await evaluate(`(()=>{const d=new DOMParser().parseFromString(${JSON.stringify(source)},'text/html');return [...d.querySelectorAll('.job')].every((j,i)=>j.querySelector('.job-body').innerHTML===document.querySelectorAll('.careers-job-body')[i].innerHTML);})()`);
    if(!preserved)throw new Error('Job details changed');
    for(const index of [1,2,3,0]){
      await evaluate(`document.querySelectorAll('.careers-filters button')[${index}].click()`);
      await poll(`document.querySelectorAll('.careers-job').length===${index===0?6:2}`);
    }
    await evaluate(`document.querySelector('.careers-job summary').click()`);
    const result=await evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,roles:document.querySelectorAll('.careers-job').length,expanded:document.querySelector('.careers-job').open,imageLoaded:document.querySelector('.careers-hero img').naturalWidth>0,applications:[...document.querySelectorAll('.careers-job-body .apply-link')].map(a=>a.getAttribute('href'))})`);
    console.log(JSON.stringify(result));
    if(result.scrollWidth>width||result.roles!==6||!result.expanded||!result.imageLoaded||result.applications.length!==6)throw new Error('Responsive/job check failed');
    await evaluate(`window.scrollTo(0,0)`);
    if(width===1440||width===390){const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:width===1440?2200:1800,scale:1}});await writeFile(fileURLToPath(new URL(`careers-${width}.png`,import.meta.url)),Buffer.from(shot.data,'base64'));}
  }
  console.log('Six original role descriptions and application links preserved. Filters, expansion and five responsive sizes passed.');
} finally {
  if (call && socket?.readyState === WebSocket.OPEN) { try { await call('Browser.close'); } catch {} }
  socket?.close();
  if (browser.exitCode === null) browser.kill();
}





