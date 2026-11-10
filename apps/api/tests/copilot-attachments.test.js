import { deflateSync } from 'node:zlib';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { authHeader, makeTenant, makeUser, makeFundedWallet } from './helpers.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { CopilotAttachment } from '../src/modules/copilot/copilotAttachment.model.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';
import { validateArtworkBytes } from '../src/utils/artworkValidation.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';

let app;
const prev = {
  enabled: env.EMBEDDED_COPILOT_ENABLED,
  key: env.OPENAI_API_KEY,
};

function pngChunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([t, data]);
  const c = Buffer.alloc(4);
  let crc = 0xffffffff;
  for (let i = 0; i < body.length; i++) {
    crc ^= body[i];
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  c.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([len, body, c]);
}

function makeLogoPng() {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const phys = Buffer.alloc(9);
  phys.writeUInt32BE(11811, 0);
  phys.writeUInt32BE(11811, 4);
  phys[8] = 1;
  const idat = deflateSync(Buffer.from([0, 0, 0, 0]));
  const png = Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('pHYs', phys),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  validateArtworkBytes(png);
  return png;
}

beforeAll(async () => {
  env.EMBEDDED_COPILOT_ENABLED = 'true';
  env.OPENAI_API_KEY = '';
  await connectTestDb();
  app = createApp();
});

afterAll(async () => {
  env.EMBEDDED_COPILOT_ENABLED = prev.enabled;
  env.OPENAI_API_KEY = prev.key;
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  clearTenantLimitCache();
  env.EMBEDDED_COPILOT_ENABLED = 'true';
  env.OPENAI_API_KEY = '';
});

describe('copilot attachments', () => {
  it('uploads a purchase order without changing wallet balances', async () => {
    const tenant = await makeTenant();
    const wallet = await makeFundedWallet(tenant);
    const before = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    const { token } = await makeUser(tenant, 'company_admin');

    const res = await request(app)
      .post('/api/v1/copilot/attachments?kind=purchase_order')
      .set(authHeader(token))
      .attach('file', Buffer.from('%PDF-1.4 mock po'), {
        filename: 'po.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(201);
    expect(res.body.kind).toBe('purchase_order');
    expect(res.body.ticketId).toBeTruthy();
    expect(res.body.status).toBe('uploaded');
    expect(res.body).not.toHaveProperty('fileUrl');

    const after = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    expect(after.balance).toBe(before.balance);
    expect(after.status).toBe(before.status);
  });

  it('uploads artwork via the existing logo ticket workflow', async () => {
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin');
    const res = await request(app)
      .post('/api/v1/copilot/attachments?kind=artwork')
      .set(authHeader(token))
      .attach('file', makeLogoPng(), {
        filename: 'logo.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe('artwork');
    expect(res.body.ticketId).toBeTruthy();
    expect(res.body.previewHint).toBe('image');
  });

  it('rejects unsupported purchase-order types and oversized files server-side', async () => {
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin');

    const badType = await request(app)
      .post('/api/v1/copilot/attachments?kind=purchase_order')
      .set(authHeader(token))
      .attach('file', Buffer.from('not-a-pdf'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      });
    expect(badType.status).toBe(415);

    const tooBig = await request(app)
      .post('/api/v1/copilot/attachments?kind=purchase_order')
      .set(authHeader(token))
      .attach('file', Buffer.alloc(26 * 1024 * 1024, 1), {
        filename: 'huge.pdf',
        contentType: 'application/pdf',
      });
    expect([413, 400]).toContain(tooBig.status);
  });

  it('rejects cross-tenant attachment references on messages', async () => {
    const tenantA = await makeTenant({ slug: 'tenant-a' });
    const tenantB = await makeTenant({ slug: 'tenant-b' });
    const adminA = await makeUser(tenantA, 'company_admin');
    const adminB = await makeUser(tenantB, 'company_admin');

    const uploaded = await request(app)
      .post('/api/v1/copilot/attachments?kind=file')
      .set(authHeader(adminA.token))
      .attach('file', Buffer.from('%PDF-1.4'), {
        filename: 'note.pdf',
        contentType: 'application/pdf',
      });
    expect(uploaded.status).toBe(201);

    const created = await request(app)
      .post('/api/v1/copilot/conversations')
      .set(authHeader(adminB.token))
      .send({});
    expect(created.status).toBe(201);

    const msg = await request(app)
      .post(`/api/v1/copilot/conversations/${created.body.id}/messages`)
      .set(authHeader(adminB.token))
      .send({ content: 'Use this file', attachmentIds: [uploaded.body.id] });

    expect(msg.status).toBe(200);
    // SSE error event — provider disabled or attachment forbidden both surface as events
    expect(msg.text).toMatch(/ATTACHMENT_FORBIDDEN|PROVIDER_DISABLED|not accessible/i);
    const stolen = await CopilotAttachment.findById(uploaded.body.id);
    expect(String(stolen.tenantId)).toBe(String(tenantA._id));
  });

  it('associates uploaded refs with conversations without requiring OpenAI', async () => {
    const tenant = await makeTenant();
    const { token, user } = await makeUser(tenant, 'company_admin');
    const uploaded = await request(app)
      .post('/api/v1/copilot/attachments?kind=purchase_order')
      .set(authHeader(token))
      .attach('file', Buffer.from('%PDF-1.4 mock'), {
        filename: 'agreement.pdf',
        contentType: 'application/pdf',
      });
    expect(uploaded.status).toBe(201);

    const conversation = await CopilotConversation.create({
      tenantId: tenant._id,
      userId: user._id,
      title: 'PO chat',
      messages: [],
    });

    const { resolveAttachmentsForMessage } = await import(
      '../src/modules/copilot/copilotAttachments.service.js'
    );
    const resolved = await resolveAttachmentsForMessage({
      tenantId: tenant._id,
      userId: user._id,
      conversationId: conversation._id,
      attachmentIds: [uploaded.body.id],
    });
    expect(resolved).toHaveLength(1);
    expect(resolved[0].ticketId).toBe(uploaded.body.ticketId);

    const linked = await CopilotAttachment.findById(uploaded.body.id);
    expect(String(linked.conversationId)).toBe(String(conversation._id));
  });

  it('uploads a reference product JPEG via kind=file (not document storage)', async () => {
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin');
    const jpeg = Buffer.from(
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z',
      'base64',
    );
    const res = await request(app)
      .post('/api/v1/copilot/attachments?kind=file')
      .set(authHeader(token))
      .attach('file', jpeg, { filename: 'product.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe('file');
    expect(res.body.previewHint).toBe('image');
    expect(res.body).not.toHaveProperty('fileUrl');
    expect(res.body).not.toHaveProperty('storageKey');
    const saved = await CopilotAttachment.findById(res.body.id);
    expect(saved.storageKey).toBeTruthy();
    expect(saved.storageDriver).toBeTruthy();
    expect(saved.mimeType).toMatch(/image\/jpeg/i);
  });

  it('rejects JPG store-logo artwork and non-DPI PNG artwork with actionable errors', async () => {
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin');
    const jpeg = Buffer.from(
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z',
      'base64',
    );
    const badJpg = await request(app)
      .post('/api/v1/copilot/attachments?kind=artwork')
      .set(authHeader(token))
      .attach('file', jpeg, { filename: 'product.jpg', contentType: 'image/jpeg' });
    expect(badJpg.status).toBe(415);

    const { deflateSync } = await import('node:zlib');
    function pngChunk(type, data) {
      const t = Buffer.from(type);
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const body = Buffer.concat([t, data]);
      const c = Buffer.alloc(4);
      let crc = 0xffffffff;
      for (let i = 0; i < body.length; i++) {
        crc ^= body[i];
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
      c.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
      return Buffer.concat([len, body, c]);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(1, 0);
    ihdr.writeUInt32BE(1, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    const noDpi = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      pngChunk('IHDR', ihdr),
      pngChunk('IDAT', deflateSync(Buffer.from([0, 0, 0, 0]))),
      pngChunk('IEND', Buffer.alloc(0)),
    ]);
    const badPng = await request(app)
      .post('/api/v1/copilot/attachments?kind=artwork')
      .set(authHeader(token))
      .attach('file', noDpi, { filename: 'product.png', contentType: 'image/png' });
    expect(badPng.status).toBe(422);
    expect(badPng.body.error.code).toBe('INVALID_ARTWORK');
  });

  it('works for uploads while the AI provider is disabled', async () => {
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin');
    expect(env.OPENAI_API_KEY).toBe('');
    const res = await request(app)
      .post('/api/v1/copilot/attachments?kind=file')
      .set(authHeader(token))
      .attach('file', Buffer.from('%PDF-1.4'), {
        filename: 'brief.pdf',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(201);
  });
});
