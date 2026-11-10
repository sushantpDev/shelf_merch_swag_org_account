import path from 'node:path';
import fs from 'node:fs/promises';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { Notification } from '../src/modules/notifications/notification.model.js';
import { signAccessToken } from '../src/modules/auth/auth.service.js';
import { LOCAL_UPLOAD_DIR } from '../src/services/storage.service.js';

let app;
let tenantA;
let tenantB;
let adminA; // company_admin of tenant A
let adminB; // company_admin of tenant B
let agent; // platform_support_agent

const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function makeUser({ tenantId, name, role, scopeType }) {
  const user = await User.create({
    tenantId,
    name,
    email: `${name}-${Math.random().toString(36).slice(2)}@test.io`,
    status: 'active',
  });
  const assignment = await RoleAssignment.create({ tenantId, userId: user._id, role, scopeType });
  return { user, token: signAccessToken(user, assignment) };
}

/** Support notifications are fire-and-forget — poll briefly instead of racing them. */
async function eventually(assertFn, { timeout = 1500, step = 50 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      return await assertFn();
    } catch (err) {
      if (Date.now() > deadline) throw err;
      await new Promise((r) => setTimeout(r, step));
    }
  }
}

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  tenantA = await Tenant.create({ name: 'Acme', slug: 'acme', status: 'active' });
  tenantB = await Tenant.create({ name: 'Rubix', slug: 'rubix', status: 'active' });
  adminA = await makeUser({ tenantId: tenantA._id, name: 'AdminA', role: 'company_admin', scopeType: 'tenant' });
  adminB = await makeUser({ tenantId: tenantB._id, name: 'AdminB', role: 'company_admin', scopeType: 'tenant' });
  agent = await makeUser({ tenantId: null, name: 'Agent', role: 'platform_support_agent', scopeType: 'platform' });
});
afterEach(async () => {
  // Remove only THIS test tenant's attachment dir (a fresh ObjectId each run) —
  // never the shared uploads root, which holds committed demo assets.
  if (tenantA?._id) {
    await fs.rm(path.join(LOCAL_UPLOAD_DIR, String(tenantA._id)), { recursive: true, force: true });
  }
});

async function raiseTicket(subject = 'Order stuck in transit') {
  const res = await request(app)
    .post('/api/v1/support-tickets')
    .set(auth(adminA.token))
    .send({ subject, description: 'AWB shows no movement for a week', type: 'delivery_issue' });
  expect(res.status).toBe(201);
  return res.body;
}

describe('support feature end to end', () => {
  it('tenant raises a ticket, lists it, and support staff are notified in-app', async () => {
    const ticket = await raiseTicket();
    expect(ticket.status).toBe('open');
    expect(ticket.source).toBe('tenant');

    const mine = await request(app).get('/api/v1/support-tickets').set(auth(adminA.token));
    expect(mine.status).toBe(200);
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0].subject).toBe('Order stuck in transit');

    await eventually(async () => {
      const pings = await Notification.find({ userId: agent.user._id, type: 'support_ticket' });
      expect(pings.length).toBe(1);
      expect(pings[0].title).toContain('Order stuck in transit');
    });
  });

  it('tenants are isolated: B sees no A tickets and cannot read them by id', async () => {
    const ticket = await raiseTicket();

    const listB = await request(app).get('/api/v1/support-tickets').set(auth(adminB.token));
    expect(listB.status).toBe(200);
    expect(listB.body.items).toHaveLength(0);

    const getB = await request(app)
      .get(`/api/v1/support-tickets/${ticket._id}`)
      .set(auth(adminB.token));
    expect(getB.status).toBe(404);

    const replyB = await request(app)
      .post(`/api/v1/support-tickets/${ticket._id}/messages`)
      .set(auth(adminB.token))
      .send({ body: 'sneaky' });
    expect(replyB.status).toBe(404);
  });

  it('platform queue lists the ticket with the tenant name resolved', async () => {
    await raiseTicket();
    const queue = await request(app)
      .get('/api/v1/platform/support-tickets')
      .set(auth(agent.token));
    expect(queue.status).toBe(200);
    expect(queue.body.items).toHaveLength(1);
    expect(queue.body.items[0].tenantName).toBe('Acme');
  });

  it('internal notes never reach the tenant; public replies do and notify the raiser', async () => {
    const ticket = await raiseTicket();

    const internalRes = await request(app)
      .post(`/api/v1/platform/support-tickets/${ticket._id}/messages`)
      .set(auth(agent.token))
      .send({ body: 'internal: courier lost it', internal: true });
    expect(internalRes.status).toBe(200);

    const publicRes = await request(app)
      .post(`/api/v1/platform/support-tickets/${ticket._id}/messages`)
      .set(auth(agent.token))
      .send({ body: 'We are shipping a replacement.' });
    expect(publicRes.status).toBe(200);

    const mine = await request(app)
      .get(`/api/v1/support-tickets/${ticket._id}`)
      .set(auth(adminA.token));
    expect(mine.status).toBe(200);
    expect(mine.body.messages).toHaveLength(1);
    expect(mine.body.messages[0].body).toBe('We are shipping a replacement.');
    expect(mine.body.messages[0].fromPlatform).toBe(true);
    expect(mine.body.messages[0].authorName).toBe('Agent');

    // The platform view keeps both, flagged.
    const full = await request(app)
      .get(`/api/v1/platform/support-tickets/${ticket._id}`)
      .set(auth(agent.token));
    expect(full.body.messages).toHaveLength(2);
    expect(full.body.tenantName).toBe('Acme');
    expect(full.body.raisedByName).toBe('AdminA');

    const pings = await Notification.find({
      userId: adminA.user._id,
      type: 'support_ticket_update',
    });
    expect(pings.length).toBe(1);
    expect(pings[0].title).toContain('Support replied');
  });

  it('tenant reply reopens a waiting ticket and pings the support desk', async () => {
    const ticket = await raiseTicket();

    // open → in_progress → waiting_on_customer
    await request(app)
      .patch(`/api/v1/platform/support-tickets/${ticket._id}/assign`)
      .set(auth(agent.token))
      .send({ userId: String(agent.user._id) })
      .expect(200);
    await request(app)
      .patch(`/api/v1/platform/support-tickets/${ticket._id}/status`)
      .set(auth(agent.token))
      .send({ status: 'waiting_on_customer' })
      .expect(200);

    const reply = await request(app)
      .post(`/api/v1/support-tickets/${ticket._id}/messages`)
      .set(auth(adminA.token))
      .send({ body: 'Still nothing delivered.' });
    expect(reply.status).toBe(200);
    expect(reply.body.status).toBe('in_progress');
    expect(reply.body.messages.at(-1).fromPlatform).toBe(false);
    expect(reply.body.messages.at(-1).authorName).toBe('AdminA');

    await eventually(async () => {
      const pings = await Notification.find({
        userId: agent.user._id,
        type: 'support_ticket',
        title: { $regex: 'Customer replied' },
      });
      expect(pings.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('admin replies notify support only — not the department handler', async () => {
    const ticket = await raiseTicket();
    const production = await makeUser({
      tenantId: null,
      name: 'ProdMgr',
      role: 'platform_production_manager',
      scopeType: 'platform',
    });

    await request(app)
      .patch(`/api/v1/platform/support-tickets/${ticket._id}/assign`)
      .set(auth(agent.token))
      .send({ userId: String(production.user._id) })
      .expect(200);
    await request(app)
      .patch(`/api/v1/platform/support-tickets/${ticket._id}/status`)
      .set(auth(agent.token))
      .send({ status: 'waiting_on_customer' })
      .expect(200);

    // Clear assign noise so we only assert on the reply ping.
    await Notification.deleteMany({});

    await request(app)
      .post(`/api/v1/support-tickets/${ticket._id}/messages`)
      .set(auth(adminA.token))
      .send({ body: 'Any update on the replacement?' })
      .expect(200);

    await eventually(async () => {
      const supportPings = await Notification.find({
        userId: agent.user._id,
        type: 'support_ticket',
        title: { $regex: 'Customer replied' },
      });
      expect(supportPings.length).toBe(1);
    });

    const handlerPings = await Notification.find({
      userId: production.user._id,
      type: 'support_ticket',
      title: { $regex: 'Customer replied' },
    });
    expect(handlerPings).toHaveLength(0);
  });

  it('closed tickets refuse tenant replies', async () => {
    const ticket = await raiseTicket();
    await request(app)
      .patch(`/api/v1/platform/support-tickets/${ticket._id}/status`)
      .set(auth(agent.token))
      .send({ status: 'closed' })
      .expect(200);

    const reply = await request(app)
      .post(`/api/v1/support-tickets/${ticket._id}/messages`)
      .set(auth(adminA.token))
      .send({ body: 'one more thing' });
    expect(reply.status).toBe(422);
    expect(reply.body.code ?? reply.body.error?.code).toBeDefined();
  });

  it('accepts an optional image attachment and shows it to tenant and platform', async () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64),
    ]);
    const res = await request(app)
      .post('/api/v1/support-tickets')
      .set(auth(adminA.token))
      .field('subject', 'Broken mug — photo attached')
      .field('description', 'See the attached evidence')
      .field('type', 'replacement')
      .attach('attachment', png, { filename: 'evidence.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.attachments).toHaveLength(1);
    const att = res.body.attachments[0];
    expect(att.name).toBe('evidence.png');
    expect(att.contentType).toBe('image/png');
    expect(att.size).toBe(png.length);
    // Stored under a random hex key, never the user-supplied filename.
    expect(att.url).toMatch(/\/attachment\/[a-f0-9]{24}\.png$/);
    expect(att.url).not.toContain('evidence');

    const mine = await request(app)
      .get(`/api/v1/support-tickets/${res.body._id}`)
      .set(auth(adminA.token));
    expect(mine.body.attachments).toHaveLength(1);

    const full = await request(app)
      .get(`/api/v1/platform/support-tickets/${res.body._id}`)
      .set(auth(agent.token));
    expect(full.body.attachments).toHaveLength(1);
    expect(full.body.attachments[0].url).toBe(att.url);
  });

  it('rejects script-capable uploads (svg / html) with 415', async () => {
    for (const [filename, contentType] of [
      ['payload.svg', 'image/svg+xml'],
      ['payload.html', 'text/html'],
    ]) {
      const res = await request(app)
        .post('/api/v1/support-tickets')
        .set(auth(adminA.token))
        .field('subject', 'sneaky upload')
        .attach('attachment', Buffer.from('<svg onload=alert(1)>'), { filename, contentType });
      expect(res.status).toBe(415);
    }
    // Nothing persisted from the rejected requests.
    const list = await request(app).get('/api/v1/support-tickets').set(auth(adminA.token));
    expect(list.body.items).toHaveLength(0);
  });

  it('rejects extension/MIME spoofing (html renamed to .png)', async () => {
    const res = await request(app)
      .post('/api/v1/support-tickets')
      .set(auth(adminA.token))
      .field('subject', 'spoofed file')
      .attach('attachment', Buffer.from('<script>alert(1)</script>'), {
        filename: 'evil.png',
        contentType: 'text/html',
      });
    expect(res.status).toBe(415);
  });

  it('assignment notifies the assignee, leaves an internal trail, and shows in the queue', async () => {
    const ticket = await raiseTicket();
    const teammate = await makeUser({
      tenantId: null,
      name: 'Teammate',
      role: 'platform_support_agent',
      scopeType: 'platform',
    });

    const res = await request(app)
      .patch(`/api/v1/platform/support-tickets/${ticket._id}/assign`)
      .set(auth(agent.token))
      .send({ userId: String(teammate.user._id) });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('in_progress');

    // Internal trail message records who assigned whom.
    const trail = res.body.messages.at(-1);
    expect(trail.internal).toBe(true);
    expect(trail.body).toContain('Assigned to Teammate');
    expect(trail.body).toContain('by Agent');

    await eventually(async () => {
      const pings = await Notification.find({
        userId: teammate.user._id,
        type: 'support_ticket_assigned',
      });
      expect(pings.length).toBe(1);
      expect(pings[0].title).toContain('assigned to you');
    });

    const queue = await request(app)
      .get('/api/v1/platform/support-tickets')
      .set(auth(agent.token));
    expect(queue.body.items[0].assigneeName).toBe('Teammate');

    const mine = await request(app)
      .get(`/api/v1/platform/support-tickets?assignedToUserId=${teammate.user._id}`)
      .set(auth(agent.token));
    expect(mine.body.items).toHaveLength(1);
    const unassigned = await request(app)
      .get('/api/v1/platform/support-tickets?unassigned=true')
      .set(auth(agent.token));
    expect(unassigned.body.items).toHaveLength(0);
  });

  it('internal notes ping the assignee but never the customer', async () => {
    const ticket = await raiseTicket();
    const teammate = await makeUser({
      tenantId: null,
      name: 'Teammate',
      role: 'platform_support_agent',
      scopeType: 'platform',
    });
    await request(app)
      .patch(`/api/v1/platform/support-tickets/${ticket._id}/assign`)
      .set(auth(agent.token))
      .send({ userId: String(teammate.user._id) })
      .expect(200);

    // Agent (not the assignee) writes an internal note.
    await request(app)
      .post(`/api/v1/platform/support-tickets/${ticket._id}/messages`)
      .set(auth(agent.token))
      .send({ body: 'please pick this up today', internal: true })
      .expect(200);

    await eventually(async () => {
      const pings = await Notification.find({
        userId: teammate.user._id,
        type: 'support_ticket_update',
      });
      expect(pings.length).toBe(1);
      expect(pings[0].title).toContain('Internal note');
      expect(pings[0].body).toContain('please pick this up today');
    });
    // The raiser gets nothing for internal notes.
    const raiserPings = await Notification.find({
      userId: adminA.user._id,
      type: 'support_ticket_update',
    });
    expect(raiserPings).toHaveLength(0);
  });

  it('a public agent reply moves the ticket to waiting_on_customer', async () => {
    const ticket = await raiseTicket();
    const res = await request(app)
      .post(`/api/v1/platform/support-tickets/${ticket._id}/messages`)
      .set(auth(agent.token))
      .send({ body: 'We are looking into it.' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('waiting_on_customer');
  });

  it('customer confirms a resolved ticket → closed, agent notified; unresolved → 422', async () => {
    const ticket = await raiseTicket();

    const early = await request(app)
      .post(`/api/v1/support-tickets/${ticket._id}/confirm`)
      .set(auth(adminA.token));
    expect(early.status).toBe(422);

    await request(app)
      .patch(`/api/v1/platform/support-tickets/${ticket._id}/assign`)
      .set(auth(agent.token))
      .send({ userId: String(agent.user._id) })
      .expect(200);
    await request(app)
      .patch(`/api/v1/platform/support-tickets/${ticket._id}/status`)
      .set(auth(agent.token))
      .send({ status: 'resolved' })
      .expect(200);

    const res = await request(app)
      .post(`/api/v1/support-tickets/${ticket._id}/confirm`)
      .set(auth(adminA.token));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('closed');
    expect(res.body.messages.at(-1).body).toContain('issue is resolved');
    expect(res.body.messages.at(-1).fromPlatform).toBe(false);

    await eventually(async () => {
      const pings = await Notification.find({
        userId: agent.user._id,
        type: 'support_ticket',
        title: { $regex: 'Resolution confirmed' },
      });
      expect(pings.length).toBe(1);
    });
  });

  it('tenant list filter by status works and platform filters by tenant', async () => {
    await raiseTicket('First');
    await raiseTicket('Second');

    const open = await request(app)
      .get('/api/v1/support-tickets?status=open')
      .set(auth(adminA.token));
    expect(open.body.items).toHaveLength(2);

    const filtered = await request(app)
      .get(`/api/v1/platform/support-tickets?tenantId=${tenantB._id}`)
      .set(auth(agent.token));
    expect(filtered.body.items).toHaveLength(0);
  });

  it('assigned production manager can post internal notes and Support is notified', async () => {
    const ticket = await raiseTicket('Damage Product');
    const production = await makeUser({
      tenantId: null,
      name: 'ProdMgr',
      role: 'platform_production_manager',
      scopeType: 'platform',
    });

    await request(app)
      .patch(`/api/v1/platform/support-tickets/${ticket._id}/assign`)
      .set(auth(agent.token))
      .send({ userId: String(production.user._id) })
      .expect(200);

    await Notification.deleteMany({});

    const res = await request(app)
      .post(`/api/v1/platform/support-tickets/${ticket._id}/messages`)
      .set(auth(production.token))
      .send({ body: 'Replacement kit is ready to ship', internal: true });
    expect(res.status).toBe(200);
    const last = res.body.messages.at(-1);
    expect(last.internal).toBe(true);
    expect(last.body).toContain('Replacement kit');

    await eventually(async () => {
      const pings = await Notification.find({
        userId: agent.user._id,
        type: 'support_ticket',
        title: { $regex: 'Department replied' },
      });
      expect(pings.length).toBe(1);
      expect(pings[0].body).toContain('Replacement kit');
    });
  });

  it('assignee cannot post a public (customer-visible) reply', async () => {
    const ticket = await raiseTicket();
    const production = await makeUser({
      tenantId: null,
      name: 'ProdMgr',
      role: 'platform_production_manager',
      scopeType: 'platform',
    });
    await request(app)
      .patch(`/api/v1/platform/support-tickets/${ticket._id}/assign`)
      .set(auth(agent.token))
      .send({ userId: String(production.user._id) })
      .expect(200);

    const res = await request(app)
      .post(`/api/v1/platform/support-tickets/${ticket._id}/messages`)
      .set(auth(production.token))
      .send({ body: 'Hello customer', internal: false });
    expect(res.status).toBe(403);
  });

  it('assignee cannot update status — status stays with Support', async () => {
    const ticket = await raiseTicket();
    const production = await makeUser({
      tenantId: null,
      name: 'ProdMgr',
      role: 'platform_production_manager',
      scopeType: 'platform',
    });
    await request(app)
      .patch(`/api/v1/platform/support-tickets/${ticket._id}/assign`)
      .set(auth(agent.token))
      .send({ userId: String(production.user._id) })
      .expect(200);

    const res = await request(app)
      .patch(`/api/v1/platform/support-tickets/${ticket._id}/status`)
      .set(auth(production.token))
      .send({ status: 'resolved' });
    expect(res.status).toBe(403);
  });

  it('assignee ticket detail shows only the internal Support thread', async () => {
    const ticket = await raiseTicket();
    const production = await makeUser({
      tenantId: null,
      name: 'ProdMgr',
      role: 'platform_production_manager',
      scopeType: 'platform',
    });
    await request(app)
      .patch(`/api/v1/platform/support-tickets/${ticket._id}/assign`)
      .set(auth(agent.token))
      .send({ userId: String(production.user._id) })
      .expect(200);
    await request(app)
      .post(`/api/v1/platform/support-tickets/${ticket._id}/messages`)
      .set(auth(agent.token))
      .send({ body: 'public reply to customer' })
      .expect(200);
    await request(app)
      .post(`/api/v1/platform/support-tickets/${ticket._id}/messages`)
      .set(auth(agent.token))
      .send({ body: 'please pick this up', internal: true })
      .expect(200);

    const detail = await request(app)
      .get(`/api/v1/platform/support-tickets/${ticket._id}`)
      .set(auth(production.token));
    expect(detail.status).toBe(200);
    expect(detail.body.messages.every((m) => m.internal)).toBe(true);
    expect(detail.body.messages.some((m) => m.body.includes('please pick this up'))).toBe(true);
    expect(detail.body.messages.some((m) => m.body.includes('public reply'))).toBe(false);
  });

  it('non-assignee department user cannot message or change status', async () => {
    const ticket = await raiseTicket();
    const production = await makeUser({
      tenantId: null,
      name: 'ProdMgr',
      role: 'platform_production_manager',
      scopeType: 'platform',
    });
    const other = await makeUser({
      tenantId: null,
      name: 'Logistics',
      role: 'platform_logistics_manager',
      scopeType: 'platform',
    });
    await request(app)
      .patch(`/api/v1/platform/support-tickets/${ticket._id}/assign`)
      .set(auth(agent.token))
      .send({ userId: String(production.user._id) })
      .expect(200);

    const msg = await request(app)
      .post(`/api/v1/platform/support-tickets/${ticket._id}/messages`)
      .set(auth(other.token))
      .send({ body: 'not my ticket', internal: true });
    expect(msg.status).toBe(403);

    const status = await request(app)
      .patch(`/api/v1/platform/support-tickets/${ticket._id}/status`)
      .set(auth(other.token))
      .send({ status: 'resolved' });
    expect(status.status).toBe(403);
  });

  it('production and logistics only see tickets assigned to them', async () => {
    const ticketA = await raiseTicket('Prod handoff');
    const ticketB = await raiseTicket('Logistics handoff');
    const production = await makeUser({
      tenantId: null,
      name: 'ProdMgr',
      role: 'platform_production_manager',
      scopeType: 'platform',
    });
    const logistics = await makeUser({
      tenantId: null,
      name: 'LogMgr',
      role: 'platform_logistics_manager',
      scopeType: 'platform',
    });

    await request(app)
      .patch(`/api/v1/platform/support-tickets/${ticketA._id}/assign`)
      .set(auth(agent.token))
      .send({ userId: String(production.user._id) })
      .expect(200);
    await request(app)
      .patch(`/api/v1/platform/support-tickets/${ticketB._id}/assign`)
      .set(auth(agent.token))
      .send({ userId: String(logistics.user._id) })
      .expect(200);

    const prodQueue = await request(app)
      .get('/api/v1/platform/support-tickets')
      .set(auth(production.token));
    expect(prodQueue.status).toBe(200);
    expect(prodQueue.body.items).toHaveLength(1);
    expect(prodQueue.body.items[0].subject).toBe('Prod handoff');

    const logQueue = await request(app)
      .get('/api/v1/platform/support-tickets')
      .set(auth(logistics.token));
    expect(logQueue.status).toBe(200);
    expect(logQueue.body.items).toHaveLength(1);
    expect(logQueue.body.items[0].subject).toBe('Logistics handoff');

    // Even with query params, department users cannot broaden the queue.
    const sneak = await request(app)
      .get('/api/v1/platform/support-tickets?unassigned=true')
      .set(auth(production.token));
    expect(sneak.body.items).toHaveLength(1);
    expect(sneak.body.items[0].subject).toBe('Prod handoff');

    const otherDetail = await request(app)
      .get(`/api/v1/platform/support-tickets/${ticketB._id}`)
      .set(auth(production.token));
    expect(otherDetail.status).toBe(403);
  });
});
