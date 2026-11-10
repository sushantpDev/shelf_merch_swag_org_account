import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { AuditLog } from '../src/modules/auditLogs/auditLog.model.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { makeTenant, makeUser } from './helpers.js';
import {
  DEFAULT_STORE_BANNER_CONFIG,
  executeShopCreate,
  executeShopUpdate,
  prepareShopCreate,
  prepareShopUpdate,
} from '../src/modules/mcp/shopsWrite.js';
import {
  completeShopAssetUpload,
  prepareShopAssetUpload,
  getShopAssetUpload,
} from '../src/modules/mcp/shopsAssetUpload.js';
import { McpShopAssetTicket } from '../src/modules/mcp/mcpShopAssetTicket.model.js';
import { McpWriteConfirmation } from '../src/modules/mcp/mcpWriteConfirmation.model.js';
import { DEFAULT_STORE_BUILDER_CATEGORIES } from '../src/modules/shops/storeBuilderCategories.js';
import { validateArtworkBytes } from '../src/utils/artworkValidation.js';
import { deflateSync } from 'node:zlib';

let app;
let tenant;
let admin;

function crc(buf) {
  let c = 0xffffffff;
  for (const b of buf) {
    c ^= b;
    for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([t, data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
}

/** Minimal valid 300 DPI PNG for logo handoff tests. */
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

const BANNER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAC4jAAAuIwF4pT92AAAAFElEQVR4nGP4z8DAAMIM////ZwAAHu8E/KPItPcAAAAASUVORK5CYII=',
  'base64',
);

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});

afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  clearTenantLimitCache();
  tenant = await makeTenant({ slug: 'shops-lifecycle' });
  admin = await makeUser(tenant, 'company_admin', 'tenant');
});

describe('store create lifecycle parity', () => {
  it('creates Points and INR live stores with default banner and categories', async () => {
    const pointsPrepared = await prepareShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Points Shop', currencyMode: 'points' },
    });
    expect(pointsPrepared.preview).toMatchObject({
      status: 'live',
      currencyMode: 'points',
      categories: DEFAULT_STORE_BUILDER_CATEGORIES,
      bannerConfig: DEFAULT_STORE_BANNER_CONFIG,
      logoUrl: '',
    });
    expect(await Shop.countDocuments({ tenantId: tenant._id })).toBe(0);

    const points = await executeShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Points Shop', currencyMode: 'points' },
      confirmationId: pointsPrepared.confirmationId,
      idempotencyKey: 'life-points-1',
    });
    expect(points).toMatchObject({
      status: 'live',
      currencyMode: 'points',
      categories: DEFAULT_STORE_BUILDER_CATEGORIES,
      bannerConfig: DEFAULT_STORE_BANNER_CONFIG,
    });

    const inrPrepared = await prepareShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'INR Shop', currencyMode: 'inr' },
    });
    const inr = await executeShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'INR Shop', currencyMode: 'inr' },
      confirmationId: inrPrepared.confirmationId,
      idempotencyKey: 'life-inr-1',
    });
    expect(inr).toMatchObject({
      status: 'live',
      currencyMode: 'inr',
      bannerConfig: DEFAULT_STORE_BANNER_CONFIG,
    });
    expect(await Shop.countDocuments({ tenantId: tenant._id })).toBe(2);
  });

  it('rejects missing/invalid name and treats currency as immutable after create', async () => {
    await expect(prepareShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: '  ' },
    })).rejects.toMatchObject({ code: 'VALIDATION' });

    const prepared = await prepareShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Currency Locked', currencyMode: 'points' },
    });
    const created = await executeShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Currency Locked', currencyMode: 'points' },
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'life-currency-1',
    });

    await expect(prepareShopUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: created.id, currencyMode: 'inr' },
    })).rejects.toMatchObject({ code: 'VALIDATION' });

    await expect(prepareShopCreate({ tenantId: tenant._id, actorUserId: admin.user._id, input: { name: 'Currency Locked', currencyMode: 'inr' } })).rejects.toMatchObject({ code: 'SHOP_EXISTS' });

    expect((await Shop.findOne({ _id: created.id, tenantId: tenant._id })).currencyMode).toBe('points');
  });

  it('supports optional logo skip and secure logo upload handoff', async () => {
    const skipPrepared = await prepareShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'No Logo Shop', currencyMode: 'points' },
    });
    const skipped = await executeShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'No Logo Shop', currencyMode: 'points' },
      confirmationId: skipPrepared.confirmationId,
      idempotencyKey: 'life-logo-skip',
    });
    expect(skipped.logoUrl).toBe('');

    const ticket = await prepareShopAssetUpload({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { kind: 'logo', originalName: 'logo.png' },
    });
    expect(ticket.uploadPageUrl).toContain('#uploadToken=');
    expect(await Shop.countDocuments({ tenantId: tenant._id })).toBe(1);

    await completeShopAssetUpload({
      ticketId: ticket.ticketId,
      uploadToken: ticket.uploadToken,
      file: {
        buffer: makeLogoPng(),
        originalname: 'logo.png',
        mimetype: 'image/png',
      },
    });
    const ready = await getShopAssetUpload({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      ticketId: ticket.ticketId,
    });
    expect(ready.status).toBe('ready');
    expect(ready.assetUrl).toMatch(/^(?:\/uploads\/|https:\/\/)/);

    const withLogoPrepared = await prepareShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Logo Shop', currencyMode: 'inr', logoTicketId: ticket.ticketId },
    });
    expect(withLogoPrepared.preview.logoUrl).toBe(ready.assetUrl);
    expect(await McpShopAssetTicket.findOne({ tenantId: tenant._id, ticketId: ticket.ticketId })).toMatchObject({
      status: 'ready',
    });

    const withLogo = await executeShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Logo Shop', currencyMode: 'inr', logoTicketId: ticket.ticketId },
      confirmationId: withLogoPrepared.confirmationId,
      idempotencyKey: 'life-logo-upload',
    });
    expect(withLogo.logoUrl).toBe(ready.assetUrl);
    expect((await McpShopAssetTicket.findOne({ tenantId: tenant._id, ticketId: ticket.ticketId })).status).toBe('consumed');
  });

  it('initializes default banner and allows optional banner customization', async () => {
    const prepared = await prepareShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Banner Default', currencyMode: 'points' },
    });
    const created = await executeShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Banner Default', currencyMode: 'points' },
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'life-banner-default',
    });
    expect(created.bannerConfig).toEqual(DEFAULT_STORE_BANNER_CONFIG);

    const customPrepared = await prepareShopUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: {
        shopId: created.id,
        bannerConfig: { theme: 'brand', preset: 'welcome' },
      },
    });
    const customized = await executeShopUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: {
        shopId: created.id,
        bannerConfig: { theme: 'brand', preset: 'welcome' },
      },
      confirmationId: customPrepared.confirmationId,
      idempotencyKey: 'life-banner-custom',
    });
    expect(customized.bannerConfig).toEqual({ theme: 'brand', preset: 'welcome' });

    const bannerTicket = await prepareShopAssetUpload({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { kind: 'banner' },
    });
    const uploaded = await completeShopAssetUpload({
      ticketId: bannerTicket.ticketId,
      uploadToken: bannerTicket.uploadToken,
      file: {
        buffer: BANNER_PNG,
        originalname: 'banner.png',
        mimetype: 'image/png',
      },
    });
    const imagePrepared = await prepareShopUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: created.id, bannerTicketId: bannerTicket.ticketId },
    });
    expect(imagePrepared.preview.shop.bannerConfig).toEqual({
      imageUrl: uploaded.assetUrl,
      theme: 'dark',
    });
    const imaged = await executeShopUpdate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { shopId: created.id, bannerTicketId: bannerTicket.ticketId },
      confirmationId: imagePrepared.confirmationId,
      idempotencyKey: 'life-banner-image',
    });
    expect(imaged.bannerConfig).toEqual({ imageUrl: uploaded.assetUrl, theme: 'dark' });
  });

  it('publishes with and without optional branding during confirmed create', async () => {
    const barePrepared = await prepareShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Publish Bare', currencyMode: 'points' },
    });
    const bare = await executeShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Publish Bare', currencyMode: 'points' },
      confirmationId: barePrepared.confirmationId,
      idempotencyKey: 'life-publish-bare-create',
    });
    expect(bare.status).toBe('live');

    const logoTicket = await prepareShopAssetUpload({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { kind: 'logo' },
    });
    const logo = await completeShopAssetUpload({
      ticketId: logoTicket.ticketId,
      uploadToken: logoTicket.uploadToken,
      file: { buffer: makeLogoPng(), originalname: 'logo.png', mimetype: 'image/png' },
    });
    const brandedPrepared = await prepareShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: {
        name: 'Publish Branded',
        currencyMode: 'inr',
        logoTicketId: logoTicket.ticketId,
        bannerConfig: { theme: 'blue', preset: 'happy-summer' },
      },
    });
    const branded = await executeShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: {
        name: 'Publish Branded',
        currencyMode: 'inr',
        logoTicketId: logoTicket.ticketId,
        bannerConfig: { theme: 'blue', preset: 'happy-summer' },
      },
      confirmationId: brandedPrepared.confirmationId,
      idempotencyKey: 'life-publish-branded-create',
    });
    expect(branded.logoUrl).toBe(logo.assetUrl);
    expect(branded.status).toBe('live');
  });

  it('enforces cross-tenant isolation, confirmation safety, and prepare side-effect freeness', async () => {
    const other = await makeTenant({ slug: 'shops-lifecycle-other' });
    const outsider = await makeUser(other, 'company_admin', 'tenant');
    const manager = await makeUser(tenant, 'entity_manager', 'entity', { assignedEntityIds: [] });

    await expect(prepareShopCreate({
      tenantId: tenant._id,
      actorUserId: manager.user._id,
      input: { name: 'Denied' },
    })).rejects.toMatchObject({ status: 403 });

    await expect(prepareShopAssetUpload({
      tenantId: tenant._id,
      actorUserId: outsider.user._id,
      input: { kind: 'logo' },
    })).rejects.toMatchObject({ status: 403 });

    const prepared = await prepareShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Safety Shop', currencyMode: 'points' },
    });
    expect(await Shop.countDocuments({ tenantId: tenant._id })).toBe(0);

    await McpWriteConfirmation.updateOne(
      { confirmationId: prepared.confirmationId, tenantId: tenant._id },
      { expiresAt: new Date(Date.now() - 60_000) },
    );
    await expect(executeShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Safety Shop', currencyMode: 'points' },
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'life-expired',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_EXPIRED' });
    expect(await Shop.countDocuments({ tenantId: tenant._id })).toBe(0);

    const fresh = await prepareShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Safety Shop', currencyMode: 'points' },
    });
    await expect(executeShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Safety Shop', currencyMode: 'inr' },
      confirmationId: fresh.confirmationId,
      idempotencyKey: 'life-mismatch',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_MISMATCH' });

    const ok = await executeShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Safety Shop', currencyMode: 'points' },
      confirmationId: fresh.confirmationId,
      idempotencyKey: 'life-ok',
    });
    const replay = await executeShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Safety Shop', currencyMode: 'points' },
      confirmationId: fresh.confirmationId,
      idempotencyKey: 'life-ok',
    });
    expect(replay.id).toBe(ok.id);
    expect(await Shop.countDocuments({ tenantId: tenant._id })).toBe(1);

    await expect(prepareShopUpdate({
      tenantId: other._id,
      actorUserId: outsider.user._id,
      input: { shopId: ok.id, name: 'Stolen' },
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const audits = JSON.stringify(await AuditLog.find({ tenantId: tenant._id }).lean());
    expect(audits).toContain('shop.create');
  });

  it('serves the browser upload handoff page for shop assets', async () => {
    const ticket = await prepareShopAssetUpload({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { kind: 'logo' },
    });
    const page = await request(app).get(`/api/v1/mcp/shop-assets/${ticket.ticketId}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain('Upload store logo');
    expect(page.text).toContain('300 DPI');
    expect(page.headers['cache-control'] || '').toMatch(/no-store/i);
    expect(page.headers['referrer-policy']).toBe('no-referrer');
    expect(page.headers['content-security-policy'] || '').toMatch(/default-src 'none'/);
  });

  it('rejects query-string upload tokens and keeps tickets actor-bound', async () => {
    const otherAdmin = await makeUser(tenant, 'company_admin', 'tenant', {
      email: `other-admin-${tenant.slug}@test.io`,
    });
    const ticket = await prepareShopAssetUpload({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { kind: 'logo' },
    });
    expect(ticket.uploadPageUrl).toContain('#uploadToken=');
    expect(ticket.uploadPageUrl).not.toContain('?uploadToken=');

    const queryRejected = await request(app)
      .post(`/api/v1/mcp/shop-assets/${ticket.ticketId}?uploadToken=${encodeURIComponent(ticket.uploadToken)}`)
      .attach('asset', makeLogoPng(), { filename: 'logo.png', contentType: 'image/png' });
    expect(queryRejected.status).toBe(401);

    const uploaded = await completeShopAssetUpload({
      ticketId: ticket.ticketId,
      uploadToken: ticket.uploadToken,
      file: { buffer: makeLogoPng(), originalname: 'logo.png', mimetype: 'image/png' },
    });
    expect(uploaded.status).toBe('ready');

    await expect(getShopAssetUpload({
      tenantId: tenant._id,
      actorUserId: otherAdmin.user._id,
      ticketId: ticket.ticketId,
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await expect(prepareShopCreate({
      tenantId: tenant._id,
      actorUserId: otherAdmin.user._id,
      input: { name: 'Stolen Logo Store', logoTicketId: ticket.ticketId },
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('does not consume upload tickets on confirmation mismatch or failed execute', async () => {
    const ticket = await prepareShopAssetUpload({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { kind: 'logo' },
    });
    const uploaded = await completeShopAssetUpload({
      ticketId: ticket.ticketId,
      uploadToken: ticket.uploadToken,
      file: { buffer: makeLogoPng(), originalname: 'logo.png', mimetype: 'image/png' },
    });

    const prepared = await prepareShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Ticket Safe', currencyMode: 'points', logoTicketId: ticket.ticketId },
    });
    expect(prepared.preview.logoUrl).toBe(uploaded.assetUrl);
    expect(await Shop.countDocuments({ tenantId: tenant._id })).toBe(0);

    await expect(executeShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Ticket Safe', currencyMode: 'inr', logoTicketId: ticket.ticketId },
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'life-ticket-mismatch',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_MISMATCH' });

    const stillReady = await McpShopAssetTicket.findOne({
      tenantId: tenant._id,
      ticketId: ticket.ticketId,
    });
    expect(stillReady.status).toBe('ready');
    expect(await Shop.countDocuments({ tenantId: tenant._id })).toBe(0);

    const ok = await executeShopCreate({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Ticket Safe', currencyMode: 'points', logoTicketId: ticket.ticketId },
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'life-ticket-ok',
    });
    expect(ok.logoUrl).toBe(uploaded.assetUrl);
    expect(ok.status).toBe('live');
    expect((await McpShopAssetTicket.findOne({
      tenantId: tenant._id,
      ticketId: ticket.ticketId,
    })).status).toBe('consumed');
  });
});
