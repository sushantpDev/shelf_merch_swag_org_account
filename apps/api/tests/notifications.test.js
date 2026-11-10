import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser, authHeader } from './helpers.js';
import { createApp } from '../src/app.js';
import { Notification } from '../src/modules/notifications/notification.model.js';
import { notify } from '../src/modules/notifications/notifications.service.js';

let app;
let tenant;
let userA;
let tokenA;
let tokenB;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  tenant = await makeTenant({ slug: 'notif-suite' });
  ({ user: userA, token: tokenA } = await makeUser(tenant, 'company_admin', 'tenant'));
  ({ token: tokenB } = await makeUser(tenant, 'company_admin', 'tenant', {
    email: 'other@notif-suite.io',
  }));

  await Notification.create([
    {
      userId: userA._id,
      tenantId: tenant._id,
      type: 'campaign_launched',
      title: 'Unread one',
      body: 'Hello',
      read: false,
    },
    {
      userId: userA._id,
      tenantId: tenant._id,
      type: 'order_status_changed',
      title: 'Read one',
      body: 'World',
      read: true,
    },
  ]);
});

describe('notifications API', () => {
  it('persists an in-app notification before notify resolves', async () => {
    await notify({
      tenantId: tenant._id,
      userId: userA._id,
      type: 'support_ticket_update',
      title: 'Support replied',
      body: 'We have an update for you.',
      link: '/app/support',
    });

    const notification = await Notification.findOne({
      userId: userA._id,
      type: 'support_ticket_update',
    }).lean();
    expect(notification?.title).toBe('Support replied');
    expect(notification?.link).toBe('/app/support');
  });

  it('lists notifications for the authenticated user with pagination', async () => {
    const res = await request(app)
      .get('/api/v1/notifications')
      .query({ page: 1, limit: 10 })
      .set(authHeader(tokenA));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.pagination.total).toBe(2);
  });

  it('filters unread notifications', async () => {
    const res = await request(app)
      .get('/api/v1/notifications')
      .query({ unread: true })
      .set(authHeader(tokenA));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].title).toBe('Unread one');
  });

  it('requires authentication (401)', async () => {
    const res = await request(app).get('/api/v1/notifications');
    expect(res.status).toBe(401);
  });

  it('marks a single notification read', async () => {
    const list = await request(app).get('/api/v1/notifications').set(authHeader(tokenA));
    const unread = list.body.items.find((n) => !n.read);
    const res = await request(app)
      .patch(`/api/v1/notifications/${unread._id}/read`)
      .set(authHeader(tokenA));
    expect(res.status).toBe(200);
    expect(res.body.read).toBe(true);
  });

  it('marks all notifications read', async () => {
    const res = await request(app)
      .patch('/api/v1/notifications/mark-all-read')
      .set(authHeader(tokenA));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const unread = await request(app)
      .get('/api/v1/notifications')
      .query({ unread: true })
      .set(authHeader(tokenA));
    expect(unread.body.items).toHaveLength(0);
  });

  it('returns 404 when marking another user notification', async () => {
    const list = await request(app).get('/api/v1/notifications').set(authHeader(tokenA));
    const id = list.body.items[0]._id;
    const res = await request(app)
      .patch(`/api/v1/notifications/${id}/read`)
      .set(authHeader(tokenB));
    expect(res.status).toBe(404);
  });

  it('returns 404 for unknown notification id', async () => {
    const res = await request(app)
      .patch(`/api/v1/notifications/${new mongoose.Types.ObjectId()}/read`)
      .set(authHeader(tokenA));
    expect(res.status).toBe(404);
  });
});
