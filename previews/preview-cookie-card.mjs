import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = await mkdtemp(join(tmpdir(), 'shelfmerch-zoom-'));
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket;
let call;
try {
  let port;
  for (let i = 0; i < 60; i++) {
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await pause(250); }
  }
  if (!port) throw new Error('Browser did not start');
  const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    const request = pending.get(message.id);
    if (request) { pending.delete(message.id); clearTimeout(request.timer); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result); }
  });
  call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true });
    if (result.exceptionDetails) throw new Error('Page evaluation failed');
    return result.result.value;
  };


  const waitFor=async expression=>{for(let i=0;i<75;i++){if(await evaluate(expression))return;await pause(200)}throw new Error('UI not ready: '+expression)};
  const capture=async name=>{const {data}=await call('Page.captureScreenshot',{format:'png'});await writeFile(fileURLToPath(new URL(name,import.meta.url)),Buffer.from(data,'base64'))};
  await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:'http://127.0.0.1:8080/'});
  await waitFor('Boolean(document.querySelector(".site-header"))');
  await waitFor('document.fonts.status==="loaded"');
  await pause(1000);
  await evaluate("(() => {const s=document.createElement('style');s.textContent=\".consent-banner{display:none!important}\\n.cookie-preview-card,.cookie-preview-card *{box-sizing:border-box}\\n.cookie-preview-card{position:fixed;left:24px;bottom:24px;width:400px;padding:22px;background:#fff;color:#171717;border:1px solid #e8e8e8;border-radius:16px;box-shadow:0 8px 32px #0000001a;z-index:99999;font-family:var(--font-family-public-sans,Arial,sans-serif)}\\n.cookie-preview-card h2{margin:0 0 10px;font-size:20px;font-weight:700;line-height:1.3;letter-spacing:-.025em}\\n.cookie-preview-card p{margin:0 0 18px;color:#606060;font-size:13px;line-height:1.65;font-weight:400}\\n.cookie-preview-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}\\n.cookie-preview-actions button{height:42px;padding:0 14px;border:1px solid #222;border-radius:8px;background:#222;color:#fff;font:600 13px var(--font-family-public-sans,Arial,sans-serif);cursor:pointer}\\n.cookie-preview-actions button+button{background:#fff;color:#222}\\n.cookie-preview-links{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:16px}\\n.cookie-preview-links button,.cookie-preview-links a{padding:0;border:0;background:none;color:#515151;font:400 12px var(--font-family-public-sans,Arial,sans-serif);text-decoration:underline;text-underline-offset:3px;cursor:pointer}\\n@media(max-width:600px){.cookie-preview-card{left:12px;right:12px;bottom:12px;width:auto;padding:20px;border-radius:14px}.cookie-preview-card h2{font-size:19px}.cookie-preview-card p{font-size:13px}}\\n\";document.head.append(s);const d=document.createElement('div');d.innerHTML=\"<div class=\\\"cookie-preview-card\\\" role=\\\"dialog\\\" aria-labelledby=\\\"cookie-preview-title\\\">\\n<h2 id=\\\"cookie-preview-title\\\">Your privacy choices</h2>\\n<p>We use essential cookies to keep Shelfmerch working. With your permission, we also use cookies for analytics and advertising.</p>\\n<div class=\\\"cookie-preview-actions\\\"><button type=\\\"button\\\">Accept all</button><button type=\\\"button\\\">Reject optional</button></div>\\n<div class=\\\"cookie-preview-links\\\"><button type=\\\"button\\\">Manage preferences</button><a href=\\\"/privacy#cookie-preferences\\\">Privacy policy</a></div>\\n</div>\";document.body.append(d);})()");
  await pause(200);
  await capture('cookie-card-preview-desktop.png');
  await call('Emulation.setDeviceMetricsOverride',{width:500,height:1000,deviceScaleFactor:1,mobile:true});
  await evaluate('scrollTo({top:0,behavior:"instant"})');
  await pause(300);
  await capture('cookie-card-preview-mobile.png');
  console.log('Preview screenshots created. No application files or consent settings were changed.');
}finally{
  if(call&&socket?.readyState===WebSocket.OPEN){try{await call('Browser.close')}catch{}}
  socket?.close();if(browser.exitCode===null)browser.kill();
}

