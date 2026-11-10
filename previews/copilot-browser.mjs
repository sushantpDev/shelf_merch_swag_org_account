// Real Edge rendering with isolated browser-only API fixtures; never contacts the AI provider.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoveryForUser } from '../apps/api/src/modules/copilot/copilotDiscovery.js';

const discoveryProfiles = {
  company_admin: discoveryForUser({ role: 'company_admin', scopeType: 'tenant' }),
  entity_manager: discoveryForUser({ role: 'entity_manager', scopeType: 'entity' }),
};

const out = new URL('./copilot/', import.meta.url);
await mkdir(out, { recursive: true });
const pause = ms => new Promise(r => setTimeout(r, ms));
const profile = await mkdtemp(join(tmpdir(), 'shelfmerch-copilot-'));
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket;
let shutdown;
const errors = [];
try {
  let port;
  for (let i = 0; i < 60; i++) {
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await pause(200); }
  }
  if (!port) throw Error('Edge failed to start');
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => socket.addEventListener('open', r, { once: true }));
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const msg = JSON.parse(String(event.data));
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    const req = pending.get(msg.id);
    if (req) { pending.delete(msg.id); clearTimeout(req.timer); msg.error ? req.reject(Error(msg.error.message)) : req.resolve(msg.result); }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => reject(Error(`Timeout: ${method}`)), 20000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  shutdown = () => call('Browser.close');
  const evaluate = async expression => {
    const res = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    return res.result.value;
  };
  const poll = async expression => {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await pause(100); }
    throw Error(`Condition failed: ${expression}. ${await evaluate('document.body.innerText.slice(0,1000)')}`);
  };
  const shot = async name => {
    await evaluate('document.fonts.ready');
    await pause(250);
    const res = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(new URL(name + '.png', out), Buffer.from(res.data, 'base64'));
  };
  console.log('Connected to Edge CDP', target.id);
  console.log(await call('Browser.getVersion'));
  await call('Page.enable'); await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
  // Check the real route before installing fixtures: preserve the actual authentication boundary.
  await call('Page.navigate', { url: 'http://localhost:8080/husain/copilot' });
  await poll('document.readyState === "complete"'); await pause(1200);
  const realRoute = await evaluate('({url:location.href,text:document.body.innerText.slice(0,300)})');
  await shot('authentication-boundary');
  const fixture = () => {
    localStorage.setItem('sm_access', 'browser-verification-fixture');
    localStorage.setItem('sm_user', JSON.stringify({ id: 'preview-user', tenantId: 'preview-tenant', name: 'Husain', email: 'preview@example.test', role: 'company_admin', scopeType: 'tenant', assignedEntityIds: [] }));
    localStorage.setItem('sm_workspace_slug', 'husain');
    localStorage.setItem('shelfmerch.sidebar.expanded', 'true');
    localStorage.setItem('shelfmerch.consent', JSON.stringify({ v: 1, analytics: false, advertising: false }));
    sessionStorage.setItem('sm-new-user-welcome-dismissed', '1');
    window.__copilotTest = { provider: 'openai', role: 'company_admin', fail: false, requests: [] };
    const capabilities = [
      ['explore_catalog', 'Explore Product Catalog', 'Find merchandise for employee gifting.'],
      ['explore_kits', 'Explore Customized & Curated Kits', 'Explore gift kits for new hires.'],
      ['check_budget', 'Check Wallet / Department Budget', 'Summarize my available budget.'],
      ['gifting_ideas', 'Corporate Gifting Ideas', 'Help me plan employee gifts.'],
      ['campaign_status', 'Campaign Status', 'Show recent campaigns and their status.'],
      ['find_contacts', 'Find Contacts / Employees', 'Find employees in my workspace.'],
    ].map(([id, title, prompt]) => ({ id, title, prompt, group: 'Discover' }));
    const conversations = [
      { id: 'welcome-kits', title: 'New hire welcome kits', updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() },
      { id: 'gifting-plan', title: 'Planning our year-end gifting', updatedAt: '2026-11-08T09:00:00Z', createdAt: '2026-11-08T09:00:00Z' },
      { id: 'campaigns', title: 'Campaign activity overview', updatedAt: '2026-11-06T09:00:00Z', createdAt: '2026-11-06T09:00:00Z' },
    ];
    const messages = [{ role: 'user', content: 'Help me plan welcome kits for our new hires.' }, { role: 'assistant', content: 'A thoughtful welcome kit makes the first day feel personal. Start with a few everyday essentials, then add something that reflects your team.\n\n**A useful starting point**\n\n• An everyday essential, such as a notebook or bottle\n• A personal welcome note from the team\n• A practical item for their workspace\n\nHow many people are joining, and what budget do you have in mind per person?' }];
    const original = window.fetch;
    window.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
      if (!url.pathname.startsWith('/api/')) return original(input, init);
      const path = url.pathname.replace('/api/v1', '');
      window.__copilotTest.requests.push({ path, method: init.method || 'GET', body: init.body });
      const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
      if (path === '/copilot/status') return json({ enabled: true, provider: window.__copilotTest.provider, role: window.__copilotTest.role, capabilities, discovery: window.__copilotDiscoveryProfiles[window.__copilotTest.role], writeToolsEnabled: false });
      if (path === '/copilot/conversations' && init.method === 'POST') {
        const row = { id: `chat-${conversations.length}`, title: 'New conversation', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        conversations.unshift(row); return json(row);
      }
      if (path === '/copilot/conversations') return json({ items: conversations });
      if (path.endsWith('/messages') && JSON.parse(init.body || '{}').mode === 'curator') {
        const request = JSON.parse(init.body);
        window.__curatorExternal = /outside ShelfMerch/.test(request.content) || window.__curatorExternal;
        const external = window.__curatorExternal;
        const items = external ? [{ key: 'idea:wellness', kind: 'idea', name: 'A shared wellness experience', description: 'A guided session to help the team recharge.', source: 'inspiration', price: null, currency: null, availability: 'Availability unknown' }] : [
          { key: 'product:fixture-desk', id: 'fixture-desk', kind: 'product', name: 'Desk focus set ? QA fixture', description: 'Isolated browser test fixture. No live product availability is implied.', source: 'shelfmerch', price: 1200, currency: 'INR', availability: 'In stock' },
          { key: 'product:fixture-notes', id: 'fixture-notes', kind: 'product', name: 'Notebook ? QA fixture', description: 'Image intentionally unavailable in this test fixture.', source: 'shelfmerch', price: 450, currency: 'INR', availability: 'In stock' },
        ];
        const curation = { brief: { company: 'Toast', occasion: 'Welcome / Onboarding', recipients: 10, budgetPerRecipient: 3000, currency: 'INR', exclusions: ['mugs','bottles','apparel'], source: external ? 'external' : 'shelfmerch', style: 'Unique and practical' }, concepts: [{ id: 'qa-concept', name: external ? 'A moment to recharge' : 'First-day focus', rationale: external ? 'An experience that makes appreciation feel personal.' : 'Useful everyday essentials for a thoughtful start.', packaging: 'A reusable presentation box', kind: external ? 'inspiration' : 'catalog_combination', items, knownPerRecipient: external ? 0 : 1650, completePrice: !external, estimatedTotal: external ? null : 16500, overBudget: false }], suggestions: ['Show different products', 'Something more premium within my budget'], externalResearchAvailable: false, imageGenerationAvailable: false };
        const events = [{ type: 'delta', text: external ? 'Ideas for inspiration ? availability and pricing not verified.' : 'Here are thoughtful options for your team. Select the items that feel right.' }, { type: 'artifacts', artifacts: [{ kind: 'curation', curation }] }, { type: 'done', conversationId: path.split('/')[3], title: 'Welcome gifts for Toast' }];
        return new Response(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } });
      }
      if (path.endsWith('/messages')) {
        if (window.__copilotTest.fail) return new Response(JSON.stringify({ error: { message: 'AI provider rate limit — try again shortly' } }), { status: 429 });
        const id = path.split('/')[3];
        const encoder = new TextEncoder();
        const stream = new ReadableStream({ async start(controller) {
          const push = value => controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
          push({ type: 'tool', name: 'search_catalog', status: 'running' });
          await new Promise(r => setTimeout(r, 700));
          push({ type: 'tool', name: 'search_catalog', status: 'done' });
          for (const text of ['Let’s plan a thoughtful welcome experience. ', 'What is your preferred budget per person, ', 'and how many employees will receive a gift?']) {
            push({ type: 'delta', text }); await new Promise(r => setTimeout(r, 240));
          }
          push({ type: 'done', conversationId: id, title: 'Employee gifting ideas' }); controller.close();
        } });
        return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
      }
      if (path.startsWith('/copilot/conversations/')) {
        const id = path.split('/').pop();
        if (init.method === 'DELETE') { conversations.splice(conversations.findIndex(c => c.id === id), 1); return json({ ok: true }); }
        return json({ id, title: conversations.find(c => c.id === id)?.title, messages });
      }
      if (path === '/tenants/me') return json({ name: 'Husain', slug: 'husain' });
      if (path === '/notifications') return json({ items: [], unreadCount: 0 });
      if (path === '/catalog/products' || path === '/orders') return json({ items: [] });
      if (path === '/auth/me') return json(JSON.parse(localStorage.getItem('sm_user')));
      return json([]);
    };
  };
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `window.__copilotDiscoveryProfiles = ${JSON.stringify(discoveryProfiles)}; (${fixture.toString()})()` });
  await call('Page.navigate', { url: 'http://localhost:8080/husain/copilot' });
  await poll('!!document.querySelector(".sm-copilot-welcome")');
  await pause(500);
  if (process.argv.includes('--curator')) {
    await evaluate(`document.querySelector('.sm-curator-entry').click()`);
    await poll('!!document.querySelector(".sm-curator-active")');
    await shot('curator-desktop-welcome');
    const send = async text => {
      await evaluate(`(() => { const input = document.getElementById('copilot-input'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, ${JSON.stringify(text)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await pause(150); await evaluate(`document.querySelector('[aria-label="Send message"]').click()`);
      await poll('!!document.querySelector(".sm-curator-concept") && !document.querySelector(".sm-curator-active").getAttribute("aria-busy").includes("true")');
    };
    await send('Unique welcome gifts for 10 Toast employees, ?3,000 each. No mugs, bottles or apparel.');
    await shot('curator-desktop-recommendations');
    await evaluate(`document.querySelector('.sm-curator-select').click()`);
    await poll('!!document.querySelector(".sm-curator-shortlist")');
    await evaluate(`document.querySelector('.sm-curator-results-wrap').scrollTop = document.querySelector('.sm-curator-results-wrap').scrollHeight`);
    await shot('curator-desktop-shortlist');
    const shortlist = await evaluate(`document.querySelector('.sm-curator-shortlist').innerText.includes('12,000')`);
    if (!shortlist) throw Error('Shortlist total missing');
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate(`document.getElementById('curator-chat-tab').click()`); await shot('curator-mobile-conversation');
    await evaluate(`document.getElementById('curator-results-tab').click(); document.querySelector('.sm-curator-results-wrap').scrollTop = 0`); await shot('curator-mobile-recommendations');
    const overflow = await evaluate('document.documentElement.scrollWidth > innerWidth');
    if (overflow) throw Error('Mobile curator overflows');
    await evaluate(`Array.from(document.querySelectorAll('.sm-curator-sources button')).find(b => b.textContent === 'Beyond ShelfMerch').click()`);
    await poll(`document.getElementById('copilot-input').value.includes('outside ShelfMerch')`);
    await evaluate(`document.querySelector('[aria-label="Send message"]').click()`);
    await poll(`document.body.innerText.includes('Ideas for inspiration')`);
    await evaluate(`document.getElementById('curator-results-tab').click()`); await shot('curator-mobile-external');
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
    await evaluate(`document.querySelector('.sm-curator-results-wrap').scrollTop = 0`); await shot('curator-desktop-external');
    await evaluate(`document.querySelector('.sm-curator-toolbar button').click()`);
    await poll('!document.querySelector(".sm-curator-active")');
    if (errors.length) throw Error(JSON.stringify(errors));
    await writeFile(new URL('curator-browser-results.json', out), JSON.stringify({ fixtureMode: true, productImagesIntentionallyUnavailable: true, realRoute, desktopSplit: true, mobileTabs: true, shortlist, overflow, sourceDrafted: true, normalChatRestored: true, errors }, null, 2));
    console.log('Curator browser checks passed');
  }
  else if (process.argv.includes('--baseline')) { await shot('before'); console.log(JSON.stringify({ realRoute, errors })); }
  else {
    await shot('welcome');
    if (await evaluate(`document.querySelectorAll('[data-category-id]').length`) !== 6) throw Error('Company Admin should see six categories');
    const category = async id => { await evaluate(`document.querySelector('[data-category-id=${JSON.stringify(id)}]').click()`); await pause(150); };
    const allCapabilities = async () => { await evaluate(`Array.from(document.querySelectorAll('.sm-copilot-discovery__back')).find(button => button.textContent.includes('All capabilities')).click()`); };
    await category('products_kits'); await shot('products-kits');
    await evaluate(`document.querySelector('[aria-label="Explore products"]').click()`);
    const actionDraftedOnly = await evaluate(`document.activeElement.id === 'copilot-input' && !!document.getElementById('copilot-input').value && !window.__copilotTest.requests.some(request => request.method === 'POST')`);
    if (!actionDraftedOnly) throw Error('Action selection submitted instead of drafting');
    await allCapabilities();
    await category('budgets_wallet');
    await evaluate(`document.querySelector('[aria-label="Check my available budget"]').click()`);
    await shot('budgets-wallet'); await shot('company-admin-capabilities');
    if (!await evaluate(`document.querySelector('[aria-label="Allocate budget to a department"]').disabled`)) throw Error('Pending write is executable');
    await allCapabilities(); await category('stores_collections');
    await evaluate(`document.querySelector('[aria-label="View my stores"]').click()`);
    await shot('stores-collections');
    const role = async roleName => {
      await call('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { window.__copilotTest.role = ${JSON.stringify(roleName)}; const fixtureUser = JSON.parse(localStorage.getItem('sm_user')); fixtureUser.role = ${JSON.stringify(roleName)}; fixtureUser.scopeType = ${JSON.stringify(roleName === 'entity_manager' ? 'entity' : 'tenant')}; localStorage.setItem('sm_user', JSON.stringify(fixtureUser)); })();` });
      await call('Page.reload'); await poll(`document.querySelectorAll('[data-category-id]').length === 6`);
    };
    await role('entity_manager'); await category('budgets_wallet'); await shot('entity-manager-capabilities');
    const managerRestricted = await evaluate(`!document.querySelector('[aria-label="Allocate budget to a department"]') && !document.querySelector('[aria-label="View wallet balance and transactions"]') && !document.querySelector('[aria-label="Add funds to the organization wallet"]')`);
    if (!managerRestricted) throw Error('Entity Manager discovered restricted wallet operations');
    await allCapabilities(); await category('stores_collections'); await shot('entity-manager-stores');
    if (await evaluate(`!!document.querySelector('[aria-label="Create a new store"]')`)) throw Error('Entity Manager discovered store creation');
    await role('company_admin');
    const desktopTypography = await evaluate(`(() => { const style = getComputedStyle(document.querySelector('.sm-copilot-welcome__sub')); return { family: style.fontFamily, size: style.fontSize }; })()`);
    if (!desktopTypography.family.includes('Arial') || desktopTypography.size !== '19px') throw Error('Desktop typography does not match the reference');
    const composerHeight = await evaluate(`document.querySelector('.sm-copilot-composer').getBoundingClientRect().height`);
    if (composerHeight > 56) throw Error('Empty composer is taller than the compact single-row design');
    const closeButton = await evaluate(`(() => { const button = document.querySelector('[aria-label="Close Copilot"]'); const rect = button.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; })()`);
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...closeButton });
    await shot('close-button-hover');
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 });
    const dashboardSidebarHidden = await evaluate(`!document.querySelector('.sidebar-rail') && !document.querySelector('.sidebar-rail__toggle')`);
    if (!dashboardSidebarHidden) throw Error('Dashboard sidebar is still present inside Copilot');
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 768, deviceScaleFactor: 1, mobile: false });
    await pause(300);
    const shortWelcome = await evaluate(`(() => {
      const heading = document.getElementById('copilot-title').getBoundingClientRect();
      const scroll = document.querySelector('.sm-copilot-messages');
      const area = scroll.getBoundingClientRect();
      const panel = document.querySelector('.sm-copilot-page');
      return { scrollTop: scroll.scrollTop, headingVisible: heading.top >= area.top && heading.bottom <= area.bottom, radius: getComputedStyle(panel).borderRadius, animation: getComputedStyle(panel).animationName };
    })()`);
    if (!shortWelcome.headingVisible || shortWelcome.scrollTop !== 0) throw Error('Welcome heading clipped in a short window');
    await shot('welcome-short-desktop');
    await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const reducedMotion = await evaluate(`getComputedStyle(document.querySelector('.sm-copilot-page')).animationName === 'none'`);
    await call('Emulation.setEmulatedMedia', { features: [] });
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
    await evaluate(`document.querySelector('[aria-label="Collapse conversation history"]').click()`);
    await poll('!!document.querySelector(".sm-copilot-page--collapsed")'); await shot('history-collapsed');
    const railWidth = await evaluate(`document.querySelector('.sm-copilot-sidebar').getBoundingClientRect().width`);
    if (Math.abs(railWidth - 64) > 1) throw Error('Collapsed history did not become a 64px rail');
    await evaluate(`document.querySelector('[aria-label="Expand conversation history"]').click()`);
    await evaluate(`document.querySelector('[aria-label="Collapse conversation history"]').click()`);
    await evaluate(`document.querySelector('.sm-copilot-sidebar [aria-label="Search saved conversations"]').click()`);
    await poll(`document.activeElement?.getAttribute('aria-label') === 'Search saved chats'`);
    await call('Input.insertText', { text: 'welcome' });
    await poll(`document.querySelectorAll('.sm-copilot-sidebar [data-conversation-id]').length === 1`);
    await shot('history-search');
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await poll(`!document.querySelector('.sm-copilot-sidebar input') && !!document.querySelector('.sm-copilot-page')`);
    await evaluate('document.querySelector(".sm-copilot-sidebar button[data-conversation-id]").click()');
    await poll('document.body.innerText.includes("A thoughtful welcome kit")');
    await shot('history');
    await evaluate('document.getElementById("copilot-input").focus()');
    await call('Input.insertText', { text: 'Our team has 20 new employees joining.' });
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await poll('!!document.querySelector(".sm-copilot-thinking")');
    await shot('streaming');
    await poll('!document.querySelector(".sm-copilot-chat").getAttribute("aria-busy") || document.querySelector(".sm-copilot-chat").getAttribute("aria-busy") === "false"');
    await shot('chat-composer');
    await evaluate('document.getElementById("copilot-input").focus()');
    await call('Input.insertText', { text: 'First line' });
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 8, text: '\r' });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 8 });
    await call('Input.insertText', { text: 'Second line' });
    const multiline = await evaluate('document.getElementById("copilot-input").value.includes("\\n")');
    if (!multiline) throw Error('Shift+Enter did not preserve the newline');
    const expandedComposerHeight = await evaluate(`document.querySelector('.sm-copilot-composer').getBoundingClientRect().height`);
    if (expandedComposerHeight <= composerHeight) throw Error('Composer did not grow for a multiline message');
    await shot('composer-expanded');
    await evaluate(`Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(document.getElementById('copilot-input'), ''); document.getElementById('copilot-input').dispatchEvent(new Event('input', { bubbles: true }));`);
    const desktopOverflow = await evaluate('document.documentElement.scrollWidth > innerWidth');
    await evaluate('document.documentElement.classList.add("dark")'); await shot('dark');
    await evaluate('document.documentElement.classList.remove("dark")');
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await pause(300);
    await shot('mobile');
    const mobileHeaderClean = await evaluate(`getComputedStyle(document.querySelector('.tenant-shell > .topbar')).display === 'none' && getComputedStyle(document.querySelector('.sm-copilot-mobile-brand')).display !== 'none'`);
    if (!mobileHeaderClean) throw Error('Mobile Copilot is still showing dashboard budget/profile chrome');
    const mobileOverflow = await evaluate('document.documentElement.scrollWidth > innerWidth');
    await evaluate('document.querySelector(".sm-copilot-mobile-only button").click()');
    await poll('!!document.querySelector("[role=dialog]")'); await pause(600); await shot('mobile-history');
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
    await evaluate('window.__copilotTest.fail = true; document.getElementById("copilot-input").focus()');
    await call('Input.insertText', { text: 'Retry this message' });
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await poll('!!document.querySelector("[role=alert]")'); await shot('error');
    const errorAligned = await evaluate(`(() => { const error = document.querySelector('[role=alert]').getBoundingClientRect(); const composer = document.querySelector('.sm-copilot-composer').getBoundingClientRect(); return Math.abs(error.left - composer.left) < 1 && Math.abs(error.width - composer.width) < 1; })()`);
    if (!errorAligned) throw Error('Error banner is not aligned with the composer');
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await shot('mobile-error');
    const mobileErrorAligned = await evaluate(`(() => { const error = document.querySelector('[role=alert]').getBoundingClientRect(); const composer = document.querySelector('.sm-copilot-composer').getBoundingClientRect(); return Math.abs(error.left - composer.left) < 1 && Math.abs(error.width - composer.width) < 1; })()`);
    if (!mobileErrorAligned) throw Error('Mobile error banner is not aligned with the composer');
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
    await evaluate('document.querySelector("[data-action=retry]").click()');
    const retryDraft = await evaluate('document.getElementById("copilot-input").value');
    await evaluate(`document.querySelector('[aria-label="Delete conversation"]').click()`);
    await poll('!!document.querySelector("[role=alertdialog]")');
    await shot('delete-confirmation');
    await evaluate(`Array.from(document.querySelectorAll('[role=alertdialog] button')).find(button => button.textContent === 'Delete conversation').click()`);
    await poll('!!document.querySelector(".sm-copilot-welcome")');
    const deleted = await evaluate(`!document.querySelector('[data-conversation-id="welcome-kits"]')`);
    await evaluate('document.querySelector("[data-action=new-chat]").click()');
    await poll('!!document.querySelector(".sm-copilot-welcome")');
    const newChat = await evaluate('document.getElementById("copilot-input").value === ""');
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await shot('mobile-welcome');
    await category('budgets_wallet'); await shot('mobile-category-selection');
    await evaluate(`document.querySelector('[aria-label="Check my available budget"]').click()`);
    if (!await evaluate(`document.activeElement.id === 'copilot-input' && !!document.getElementById('copilot-input').value`)) throw Error('Mobile task did not focus the draft');
    await allCapabilities();
    await evaluate(`document.querySelector('[aria-label="Close Copilot"]').click()`);
    await poll(`location.pathname === '/husain' && !!document.querySelector('.topbar') && getComputedStyle(document.querySelector('.topbar')).display !== 'none'`);
    await evaluate(`document.querySelector('.sm-copilot-launcher').click()`);
    await poll(`!!document.querySelector('.sm-copilot-welcome')`);
    const mobileTypography = await evaluate(`(() => { const style = getComputedStyle(document.querySelector('.sm-copilot-welcome__sub')); return { family: style.fontFamily, size: style.fontSize }; })()`);
    if (!mobileTypography.family.includes('Arial') || mobileTypography.size !== '18px') throw Error('Mobile typography does not match the reference');
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
    await evaluate(`document.querySelector('[aria-label="Close Copilot"]').click()`);
    await poll('!!document.querySelector(".sm-copilot-launcher")');
    await shot('dashboard-launcher');
    await evaluate('document.querySelector(".sm-copilot-launcher").click()');
    await poll('!!document.querySelector(".sm-copilot-welcome")');
    const launcherHidden = await evaluate('!document.querySelector(".sm-copilot-launcher")');
    await evaluate(`document.querySelector('[aria-label="Close Copilot"]').click()`);
    await poll('location.pathname === "/husain"');
    const closeReturned = await evaluate('location.pathname === "/husain"');
    await poll('!!document.querySelector(".sidebar-rail--expanded")');
    const dashboardSidebarRestored = await evaluate(`!!document.querySelector('.sidebar-rail--expanded')`);
    if (!dashboardSidebarRestored) throw Error('Closing Copilot did not restore the expanded dashboard sidebar');
    await evaluate('document.querySelector(".sm-copilot-launcher").click()');
    await poll('!!document.querySelector(".sm-copilot-welcome")');
    await evaluate('window.__copilotTest.provider = "disabled"');
    // Refetch status by navigating into a fresh document with a disabled fixture override.
    await call('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__copilotTest.provider = "disabled"' });
    await call('Page.reload'); await poll('document.body.innerText.includes("Chat is currently unavailable")');
    await shot('provider-disabled');
    await category('products_kits');
    await evaluate(`document.querySelector('[aria-label="Explore products"]').click()`);
    await shot('provider-disabled-discovery');
    const disabledComposer = await evaluate(`document.querySelector('[aria-label="Send message"]').disabled && !document.getElementById('copilot-input').disabled && !!document.getElementById('copilot-input').value`);
    if (!disabledComposer) throw Error('Provider-disabled discovery cannot prepare a draft safely');
    await writeFile(new URL('browser-results.json', out), JSON.stringify({ fixtureMode: true, realRoute, discovery: { adminCategoryCount: discoveryProfiles.company_admin.categories.length, actionDraftedOnly, managerRestricted, mobileHeaderClean, providerDisabledDrafting: disabledComposer }, dashboardSidebarHidden, dashboardSidebarRestored, shortWelcome, reducedMotion, closeReturned, desktopOverflow, mobileOverflow, multiline, retryDraft, deleted, newChat, launcherHidden, disabledComposer, errors }, null, 2));
    console.log(JSON.stringify({ dashboardSidebarHidden, dashboardSidebarRestored, shortWelcome, reducedMotion, closeReturned, desktopOverflow, mobileOverflow, multiline, retryDraft, deleted, newChat, launcherHidden, disabledComposer, errors }));
  }
} finally { try { await shutdown?.(); } catch {} socket?.close(); browser.kill(); }
