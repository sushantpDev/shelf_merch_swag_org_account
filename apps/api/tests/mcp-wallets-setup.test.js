import { createHash, createHmac, randomBytes } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';
import { Payment } from '../src/modules/payments/payment.model.js';
import { OauthGrantBinding } from '../src/modules/oauth/oauthGrantBinding.model.js';
import { McpWriteIdempotency } from '../src/modules/mcp/mcpWriteIdempotency.model.js';
import { McpWriteConfirmation } from '../src/modules/mcp/mcpWriteConfirmation.model.js';
import {
  LOCAL_OAUTH_CLIENT_ID,
  LOCAL_OAUTH_REDIRECT_URI,
  mcpResourceUrl,
} from '../src/modules/oauth/oauth.config.js';
import { OPTIONAL_WRITE_SCOPES, RESOURCE_SCOPES } from '../src/modules/oauth/oauthScopes.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { env } from '../src/config/env.js';
import { authHeader, makeTenant, makeUser } from './helpers.js';
import {
  executeWalletPaymentOrder,
  executeWalletPaymentVerify,
  executeWalletSetup,
  prepareWalletPaymentOrder,
  prepareWalletPaymentVerify,
  prepareWalletSetup,
} from '../src/modules/mcp/walletsSetupWrite.js';
import {
  completeWalletDocumentUpload,
  getWalletDocumentUpload,
  prepareWalletDocumentUpload,
} from '../src/modules/mcp/walletsDocumentUpload.js';
import { McpWalletDocumentTicket } from '../src/modules/mcp/mcpWalletDocumentTicket.model.js';
import { assertTenantDocumentUrl } from '../src/modules/wallets/wallets.service.js';

const razorpayOrders = vi.hoisted(() => ({
  create: vi.fn(),
  fetchPayment: vi.fn(),
}));

vi.mock('../src/services/razorpay.service.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isRazorpayConfigured: () => true,
    getRazorpayClient: () => ({
      orders: { create: razorpayOrders.create },
      payments: { fetch: razorpayOrders.fetchPayment },
    }),
  };
});

const PROTOCOL = '2026-07-28';

const CONTACT = {
  address: '12 MG Road',
  pinCode: '560001',
  mobileNumber: '9876543210',
  gstin: '29ABCDE1234F1Z5',
};

let app;
let tenant;
let admin;
let otherTenant;
let otherAdmin;

function s256(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

function signPayment(orderId, paymentId) {
  return createHmac('sha256', env.RAZORPAY_KEY_SECRET || 'test-key-secret')
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

async function issueOauth(session, scope) {
  const agent = request.agent(app);
  const verifier = randomBytes(32).toString('base64url');
  const started = await agent.get('/auth').redirects(0).query({
    client_id: LOCAL_OAUTH_CLIENT_ID,
    redirect_uri: LOCAL_OAUTH_REDIRECT_URI,
    response_type: 'code',
    scope,
    resource: mcpResourceUrl(),
    state: 'wallet-setup',
    code_challenge: s256(verifier),
    code_challenge_method: 'S256',
  });
  expect([302, 303]).toContain(started.status);
  const decision = await agent
    .post('/oauth/consent/decision')
    .set(authHeader(session.token))
    .send({ decision: 'allow', tenantId: String(tenant._id) });
  expect(decision.status, JSON.stringify(decision.body)).toBe(200);
  const resumed = await agent.get(new URL(decision.body.resumeUrl).pathname).redirects(0);
  const redirected = new URL(resumed.headers.location, 'http://127.0.0.1');
  const exchanged = await request(app).post('/token').type('form').send({
    grant_type: 'authorization_code',
    code: redirected.searchParams.get('code'),
    redirect_uri: LOCAL_OAUTH_REDIRECT_URI,
    client_id: LOCAL_OAUTH_CLIENT_ID,
    code_verifier: verifier,
    resource: mcpResourceUrl(),
  });
  expect(exchanged.status, JSON.stringify(exchanged.body)).toBe(200);
  return exchanged.body.access_token;
}

function mcpRequest(token, method, params = {}) {
  const req = request(app)
    .post('/mcp')
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .set('MCP-Protocol-Version', PROTOCOL)
    .set('mcp-method', method);
  if (typeof params.name === 'string') req.set('Mcp-Name', params.name);
  if (token) req.set(authHeader(token));
  return req.send({
    jsonrpc: '2.0',
    id: 1,
    method,
    params: {
      ...params,
      _meta: {
        'io.modelcontextprotocol/protocolVersion': PROTOCOL,
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    },
  });
}

function rpcBody(res) {
  if (res.body && typeof res.body.jsonrpc === 'string') return res.body;
  const text = res.text || '';
  const line = text.split(/\r?\n/).find((row) => row.startsWith('data: '));
  if (!line) return null;
  return JSON.parse(line.slice('data: '.length));
}

function toolResult(res) {
  const body = rpcBody(res);
  expect(body?.result, JSON.stringify(body)).toBeTruthy();
  return body.result;
}

async function uploadPo(actorUserId) {
  const ticket = await prepareWalletDocumentUpload({
    tenantId: tenant._id,
    actorUserId,
  });
  const uploaded = await request(app)
    .post(`/api/v1/mcp/wallet-documents/${ticket.ticketId}`)
    .set('X-Mcp-Upload-Token', ticket.uploadToken)
    .attach('document', Buffer.from('%PDF-1.4 mock po'), {
      filename: 'po.pdf',
      contentType: 'application/pdf',
    });
  expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201);
  expect(uploaded.body.documentUrl).toMatch(/document/);
  return {
    ticketId: ticket.ticketId,
    documentUrl: uploaded.body.documentUrl,
  };
}

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});

afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  clearTenantLimitCache();
  razorpayOrders.create.mockReset();
  razorpayOrders.fetchPayment.mockReset();
  tenant = await makeTenant({ slug: 'wallet-setup' });
  admin = await makeUser(tenant, 'company_admin', 'tenant');
  otherTenant = await makeTenant({ slug: 'wallet-setup-other' });
  otherAdmin = await makeUser(otherTenant, 'company_admin', 'tenant');
});

describe('MCP organization wallet setup', () => {
  it('sets up a PO-funded wallet with document reference and leaves finance pending', async () => {
    const { documentUrl, ticketId } = await uploadPo(admin.user._id);
    const prepared = await prepareWalletSetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: {
        name: 'Org Budget 2026',
        amount: 50_000,
        fundingMethod: 'po_upload',
        docType: 'PO',
        docNumber: 'PO-100',
        documentUrl,
        documentTicketId: ticketId,
        ...CONTACT,
      },
    });
    expect(prepared.preview.financeApprovalRequired).toBe(true);
    expect(prepared.preview.documentReady).toBe(true);

    const result = await executeWalletSetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'setup-po-1',
      input: {
        name: 'Org Budget 2026',
        amount: 50_000,
        fundingMethod: 'po_upload',
        docType: 'PO',
        docNumber: 'PO-100',
        documentUrl,
        documentTicketId: ticketId,
        ...CONTACT,
      },
    });

    expect(result.fundingPending).toBe(true);
    expect(result.fundingApprovalStatus).toBe('pending');
    expect(result.balance).toBe(0);
    expect(result.nextStep).toBe('finance_approval');
    expect(result.documentAttached).toBe(true);

    const wallet = await Wallet.findOne({ _id: result.walletId, tenantId: tenant._id });
    expect(wallet.fundingDocument.fileUrl).toBe(documentUrl);
    expect(wallet.fundingDocument.approvalStatus).toBe('pending');
    expect(wallet.fundingDocument.requestedAmount).toBe(50_000);
    expect(Number(wallet.balance)).toBe(0);
  });

  it('rejects missing or invalid document references', async () => {
    await expect(
      prepareWalletSetup({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: {
          name: 'Needs Doc',
          amount: 10_000,
          fundingMethod: 'po_upload',
          ...CONTACT,
        },
      }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_REQUIRED' });

    await expect(
      prepareWalletSetup({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: {
          name: 'Bad Doc',
          amount: 10_000,
          fundingMethod: 'po_upload',
          documentUrl: `/uploads/${otherTenant._id}/document/x.pdf`,
          ...CONTACT,
        },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_DOCUMENT_URL' });
  });

  it('rejects insufficient contact input', async () => {
    await expect(
      prepareWalletSetup({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: {
          name: 'Bad GST',
          amount: 1_000,
          fundingMethod: 'online',
          address: 'x',
          pinCode: '560001',
          mobileNumber: '9876543210',
          gstin: 'not-a-gstin',
        },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('creates an online wallet then verifies Razorpay without auto-approving funds', async () => {
    const prepared = await prepareWalletSetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: {
        name: 'Online Budget',
        amount: 25_000,
        fundingMethod: 'online',
        ...CONTACT,
      },
    });
    const setup = await executeWalletSetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'setup-online-1',
      input: {
        name: 'Online Budget',
        amount: 25_000,
        fundingMethod: 'online',
        ...CONTACT,
      },
    });
    expect(setup.nextStep).toBe('payment_required');
    expect(setup.fundingPending).toBe(false);
    expect(setup.balance).toBe(0);

    razorpayOrders.create.mockResolvedValue({
      id: 'order_test_1',
      amount: 2_500_000,
      currency: 'INR',
    });

    const orderPrep = await prepareWalletPaymentOrder({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { walletId: setup.walletId, amount: 25_000 },
    });
    const order = await executeWalletPaymentOrder({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: orderPrep.confirmationId,
      idempotencyKey: 'pay-order-1',
      input: { walletId: setup.walletId, amount: 25_000 },
    });
    expect(order.orderId).toBe('order_test_1');
    expect(order.checkoutHosted).toBe(true);
    expect(order.keyId).toBeTruthy();
    expect(razorpayOrders.create).toHaveBeenCalledTimes(1);

    const paymentId = 'pay_test_1';
    const signature = signPayment(order.orderId, paymentId);
    razorpayOrders.fetchPayment.mockResolvedValue({
      status: 'captured',
      order_id: order.orderId,
      amount: 2_500_000,
    });

    const verifyPrep = await prepareWalletPaymentVerify({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: {
        walletId: setup.walletId,
        razorpayOrderId: order.orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      },
    });
    const verified = await executeWalletPaymentVerify({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: verifyPrep.confirmationId,
      idempotencyKey: 'pay-verify-1',
      input: {
        walletId: setup.walletId,
        razorpayOrderId: order.orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      },
    });
    expect(verified.verified).toBe(true);
    expect(verified.pendingApproval).toBe(true);
    expect(verified.status).toBe('pending_approval');
    expect(verified.balance).toBe(0);

    const wallet = await Wallet.findOne({ _id: setup.walletId, tenantId: tenant._id });
    expect(wallet.fundingDocument.approvalStatus).toBe('pending');
    expect(Number(wallet.balance)).toBe(0);

    // Idempotent verify replay — no double settle.
    const verifyAgain = await executeWalletPaymentVerify({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: verifyPrep.confirmationId,
      idempotencyKey: 'pay-verify-1',
      input: {
        walletId: setup.walletId,
        razorpayOrderId: order.orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      },
    });
    expect(verifyAgain.verified).toBe(true);
    expect(verifyAgain.balance).toBe(0);
  });

  it('rejects failed payments and invalid signatures', async () => {
    const prepared = await prepareWalletSetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: {
        name: 'Fail Pay',
        amount: 5_000,
        fundingMethod: 'online',
        ...CONTACT,
      },
    });
    const setup = await executeWalletSetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'setup-fail-pay',
      input: {
        name: 'Fail Pay',
        amount: 5_000,
        fundingMethod: 'online',
        ...CONTACT,
      },
    });

    razorpayOrders.create.mockResolvedValue({ id: 'order_fail', amount: 500_000, currency: 'INR' });
    const orderPrep = await prepareWalletPaymentOrder({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { walletId: setup.walletId, amount: 5_000 },
    });
    const order = await executeWalletPaymentOrder({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: orderPrep.confirmationId,
      idempotencyKey: 'order-fail',
      input: { walletId: setup.walletId, amount: 5_000 },
    });

    await expect(
      executeWalletPaymentVerify({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        confirmationId: (
          await prepareWalletPaymentVerify({
            tenantId: tenant._id,
            actorUserId: admin.user._id,
            input: {
              walletId: setup.walletId,
              razorpayOrderId: order.orderId,
              razorpayPaymentId: 'pay_bad',
              razorpaySignature: 'deadbeef',
            },
          })
        ).confirmationId,
        idempotencyKey: 'verify-bad-sig',
        input: {
          walletId: setup.walletId,
          razorpayOrderId: order.orderId,
          razorpayPaymentId: 'pay_bad',
          razorpaySignature: 'deadbeef',
        },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PAYMENT_SIGNATURE' });

    await Payment.updateOne(
      { tenantId: tenant._id, razorpayOrderId: order.orderId },
      { $set: { status: 'failed' } },
    );
    const paymentId = 'pay_fail';
    const signature = signPayment(order.orderId, paymentId);
    await expect(
      executeWalletPaymentVerify({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        confirmationId: (
          await prepareWalletPaymentVerify({
            tenantId: tenant._id,
            actorUserId: admin.user._id,
            input: {
              walletId: setup.walletId,
              razorpayOrderId: order.orderId,
              razorpayPaymentId: paymentId,
              razorpaySignature: signature,
            },
          })
        ).confirmationId,
        idempotencyKey: 'verify-failed',
        input: {
          walletId: setup.walletId,
          razorpayOrderId: order.orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: signature,
        },
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_FAILED' });
  });

  it('replays duplicate setup submissions without creating a second wallet', async () => {
    const { documentUrl, ticketId } = await uploadPo(admin.user._id);
    const input = {
      name: 'Dup Budget',
      amount: 12_000,
      fundingMethod: 'po_upload',
      documentUrl,
      documentTicketId: ticketId,
      ...CONTACT,
    };
    const prepared = await prepareWalletSetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
    });
    const first = await executeWalletSetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'dup-setup',
      input,
    });
    const second = await executeWalletSetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'dup-setup',
      input,
    });
    expect(second.walletId).toBe(first.walletId);
    expect(await Wallet.countDocuments({ tenantId: tenant._id, name: 'Dup Budget' })).toBe(1);
  });

  it('blocks cross-tenant document URLs and unauthorized roles', async () => {
    const managerEntityTenant = tenant;
    const { user: manager } = await makeUser(managerEntityTenant, 'entity_manager', 'tenant');
    await expect(
      prepareWalletSetup({
        tenantId: tenant._id,
        actorUserId: manager._id,
        input: {
          name: 'Nope',
          amount: 1_000,
          fundingMethod: 'online',
          ...CONTACT,
        },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const { documentUrl } = await uploadPo(admin.user._id);
    await expect(
      prepareWalletSetup({
        tenantId: otherTenant._id,
        actorUserId: otherAdmin.user._id,
        input: {
          name: 'Stolen Doc',
          amount: 1_000,
          fundingMethod: 'po_upload',
          documentUrl,
          ...CONTACT,
        },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_DOCUMENT_URL' });
  });

  it('rejects expired confirmations', async () => {
    const prepared = await prepareWalletSetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: {
        name: 'Expired',
        amount: 2_000,
        fundingMethod: 'online',
        ...CONTACT,
      },
    });
    await McpWriteConfirmation.updateOne(
      { tenantId: tenant._id, confirmationId: prepared.confirmationId },
      { expiresAt: new Date(0) },
    );
    await expect(
      executeWalletSetup({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        confirmationId: prepared.confirmationId,
        idempotencyKey: 'expired-setup',
        input: {
          name: 'Expired',
          amount: 2_000,
          fundingMethod: 'online',
          ...CONTACT,
        },
      }),
    ).rejects.toMatchObject({ code: 'CONFIRMATION_EXPIRED' });
  });

  it('exposes wallets:setup tools over MCP with OAuth scope gating', async () => {
    expect(OPTIONAL_WRITE_SCOPES).toContain('wallets:setup');
    expect(RESOURCE_SCOPES).not.toContain('wallets:setup');

    const discovery = await request(app).get('/.well-known/oauth-authorization-server');
    expect(discovery.body.scopes_supported).toContain('wallets:setup');
    const metadata = await request(app).get('/.well-known/oauth-protected-resource/mcp');
    expect(metadata.body.scopes_supported).not.toContain('wallets:setup');

    const readToken = await issueOauth(admin, 'wallets:read');
    const denied = await mcpRequest(readToken, 'tools/call', {
      name: 'wallets_prepare_setup',
      arguments: {
        name: 'Scope Denied',
        amount: 1000,
        fundingMethod: 'online',
        ...CONTACT,
      },
    });
    expect(denied.status).toBe(403);
    expect(`${denied.headers['www-authenticate'] || ''} ${JSON.stringify(denied.body)}`).toContain('wallets:setup');

    const writeToken = await issueOauth(admin, 'catalog:read wallets:read wallets:setup');
    const ticketRes = await mcpRequest(writeToken, 'tools/call', {
      name: 'wallets_prepare_document_upload',
      arguments: {},
    });
    expect(ticketRes.status, ticketRes.text).toBe(200);
    const ticketBody = rpcBody(ticketRes);
    expect(ticketBody?.result, JSON.stringify(ticketBody)).toBeTruthy();
    const ticketCall = ticketBody.result;
    expect(ticketCall.isError).not.toBe(true);
    expect(ticketCall.structuredContent.ticketId).toBeTruthy();
    expect(ticketCall.structuredContent.uploadUrl).toContain('/mcp/wallet-documents/');

    const status = await getWalletDocumentUpload({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      ticketId: ticketCall.structuredContent.ticketId,
    });
    expect(status.status).toBe('pending');
    expect(await OauthGrantBinding.countDocuments({})).toBeGreaterThan(0);
  });
  it('prepare setup has no wallet side effects', async () => {
    await prepareWalletSetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: {
        name: 'Preview Only',
        amount: 9_000,
        fundingMethod: 'online',
        ...CONTACT,
      },
    });
    expect(await Wallet.countDocuments({ tenantId: tenant._id, name: 'Preview Only' })).toBe(0);
  });

  it('rejects expired and invalid upload tickets', async () => {
    const ticket = await prepareWalletDocumentUpload({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
    });
    await expect(
      completeWalletDocumentUpload({
        ticketId: ticket.ticketId,
        uploadToken: 'wrong-token',
        file: { buffer: Buffer.from('%PDF'), originalname: 'po.pdf', mimetype: 'application/pdf' },
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    await McpWalletDocumentTicket.updateOne(
      { tenantId: tenant._id, ticketId: ticket.ticketId },
      { expiresAt: new Date(0) },
    );
    await expect(
      completeWalletDocumentUpload({
        ticketId: ticket.ticketId,
        uploadToken: ticket.uploadToken,
        file: { buffer: Buffer.from('%PDF'), originalname: 'po.pdf', mimetype: 'application/pdf' },
      }),
    ).rejects.toMatchObject({ code: 'CONFIRMATION_EXPIRED' });
  });

  it('rejects forged document URLs that only embed the tenant id substring', async () => {
    expect(() => assertTenantDocumentUrl(tenant._id, `https://evil.example/${tenant._id}/document/x.pdf`)).toThrow();
    expect(() => assertTenantDocumentUrl(tenant._id, `https://evil.example/prefix${tenant._id}/document/x.pdf`)).toThrow();
    expect(() => assertTenantDocumentUrl(tenant._id, `/uploads/${tenant._id}/document/../secret`)).toThrow();
    expect(() => assertTenantDocumentUrl(tenant._id, `/uploads/${otherTenant._id}/document/x.pdf`)).toThrow();
  });

  it('rejects payment verify when walletId does not match the order', async () => {
    const a = await executeWalletSetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: (await prepareWalletSetup({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: { name: 'Pay Bind A', amount: 3_000, fundingMethod: 'online', ...CONTACT },
      })).confirmationId,
      idempotencyKey: 'bind-a',
      input: { name: 'Pay Bind A', amount: 3_000, fundingMethod: 'online', ...CONTACT },
    });
    const b = await executeWalletSetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: (await prepareWalletSetup({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: { name: 'Pay Bind B', amount: 3_000, fundingMethod: 'online', ...CONTACT },
      })).confirmationId,
      idempotencyKey: 'bind-b',
      input: { name: 'Pay Bind B', amount: 3_000, fundingMethod: 'online', ...CONTACT },
    });
    razorpayOrders.create.mockResolvedValue({ id: 'order_bind_a', amount: 300000, currency: 'INR' });
    const order = await executeWalletPaymentOrder({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: (await prepareWalletPaymentOrder({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: { walletId: a.walletId, amount: 3_000 },
      })).confirmationId,
      idempotencyKey: 'bind-order-a',
      input: { walletId: a.walletId, amount: 3_000 },
    });
    const paymentId = 'pay_bind_a';
    const signature = signPayment(order.orderId, paymentId);
    await expect(
      prepareWalletPaymentVerify({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: {
          walletId: b.walletId,
          razorpayOrderId: order.orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: signature,
        },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects uncaptured payments and replays payment orders idempotently', async () => {
    const setup = await executeWalletSetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: (await prepareWalletSetup({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: { name: 'Capture Check', amount: 4_000, fundingMethod: 'online', ...CONTACT },
      })).confirmationId,
      idempotencyKey: 'capture-setup',
      input: { name: 'Capture Check', amount: 4_000, fundingMethod: 'online', ...CONTACT },
    });

    razorpayOrders.create.mockResolvedValue({ id: 'order_uncap', amount: 400000, currency: 'INR' });
    const orderPrep = await prepareWalletPaymentOrder({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { walletId: setup.walletId, amount: 4_000 },
    });
    const first = await executeWalletPaymentOrder({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: orderPrep.confirmationId,
      idempotencyKey: 'order-idem',
      input: { walletId: setup.walletId, amount: 4_000 },
    });
    const second = await executeWalletPaymentOrder({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: orderPrep.confirmationId,
      idempotencyKey: 'order-idem',
      input: { walletId: setup.walletId, amount: 4_000 },
    });
    expect(second.orderId).toBe(first.orderId);
    expect(razorpayOrders.create).toHaveBeenCalledTimes(1);

    const paymentId = 'pay_uncap';
    const signature = signPayment(first.orderId, paymentId);
    razorpayOrders.fetchPayment.mockResolvedValue({
      status: 'created',
      order_id: first.orderId,
      amount: 400000,
    });
    await expect(
      executeWalletPaymentVerify({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        confirmationId: (await prepareWalletPaymentVerify({
          tenantId: tenant._id,
          actorUserId: admin.user._id,
          input: {
            walletId: setup.walletId,
            razorpayOrderId: first.orderId,
            razorpayPaymentId: paymentId,
            razorpaySignature: signature,
          },
        })).confirmationId,
        idempotencyKey: 'verify-uncap',
        input: {
          walletId: setup.walletId,
          razorpayOrderId: first.orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: signature,
        },
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_NOT_CAPTURED' });

    const wallet = await Wallet.findOne({ _id: setup.walletId, tenantId: tenant._id });
    expect(wallet.fundingDocument.approvalStatus).not.toBe('pending');
    expect(Number(wallet.balance)).toBe(0);
  });

  it('rejects stale setup confirmations after a pending wallet appears', async () => {
    const prepared = await prepareWalletSetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { name: 'Stale Setup', amount: 2_500, fundingMethod: 'online', ...CONTACT },
    });
    await Wallet.create({
      tenantId: tenant._id,
      ownerUserId: admin.user._id,
      name: 'Stale Setup',
      currency: 'INR',
      fundingMethod: 'online',
      status: 'wallet_created',
      fundingDocument: { approvalStatus: 'pending', requestedAmount: 2500 },
      ...CONTACT,
    });
    await expect(
      executeWalletSetup({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        confirmationId: prepared.confirmationId,
        idempotencyKey: 'stale-setup',
        input: { name: 'Stale Setup', amount: 2_500, fundingMethod: 'online', ...CONTACT },
      }),
    ).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });
  });

  it('keeps PO-funded wallets at zero balance pending finance approval', async () => {
    const { documentUrl, ticketId } = await uploadPo(admin.user._id);
    const result = await executeWalletSetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: (await prepareWalletSetup({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: {
          name: 'No Auto Credit',
          amount: 15_000,
          fundingMethod: 'po_upload',
          documentUrl,
          documentTicketId: ticketId,
          ...CONTACT,
        },
      })).confirmationId,
      idempotencyKey: 'no-auto-credit',
      input: {
        name: 'No Auto Credit',
        amount: 15_000,
        fundingMethod: 'po_upload',
        documentUrl,
        documentTicketId: ticketId,
        ...CONTACT,
      },
    });
    expect(result.fundingPending).toBe(true);
    expect(result.balance).toBe(0);
    expect(result.fundingApprovalStatus).toBe('pending');
  });


  it('accepts optional period dates as YYYY-MM-DD and rejects inverted ranges', async () => {
    const { documentUrl, ticketId } = await uploadPo(admin.user._id);
    const prepared = await prepareWalletSetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: {
        name: 'Dated Budget',
        amount: 12_000,
        fundingMethod: 'po_upload',
        validFrom: '2026-04-01',
        validTo: '2027-03-31',
        documentUrl,
        documentTicketId: ticketId,
        ...CONTACT,
      },
    });
    expect(prepared.preview.validFrom).toContain('2026-04-01');
    expect(prepared.preview.validTo).toContain('2027-03-31');
    expect(prepared.preview.documentReady).toBe(true);
    const walletsBefore = await Wallet.countDocuments({ tenantId: tenant._id });

    await expect(
      prepareWalletSetup({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: {
          name: 'Bad Range',
          amount: 12_000,
          fundingMethod: 'po_upload',
          validFrom: '2027-04-01',
          validTo: '2027-03-31',
          documentUrl,
          documentTicketId: ticketId,
          ...CONTACT,
        },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    const { documentUrl: doc2, ticketId: ticket2 } = await uploadPo(admin.user._id);
    const noDates = await prepareWalletSetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: {
        name: 'No Dates Budget',
        amount: 8_000,
        fundingMethod: 'po_upload',
        documentUrl: doc2,
        documentTicketId: ticket2,
        ...CONTACT,
      },
    });
    expect(noDates.preview.validFrom).toBeNull();
    expect(noDates.preview.validTo).toBeNull();
    expect(await Wallet.countDocuments({ tenantId: tenant._id })).toBe(walletsBefore);
  });

  it('exposes a browser upload page and completes the PO handoff without creating a wallet', async () => {
    const ticket = await prepareWalletDocumentUpload({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
    });
    expect(ticket.uploadPageUrl).toContain(ticket.ticketId);
    expect(ticket.uploadPageUrl).toContain('#uploadToken=');
    expect(ticket.uploadPageUrl).not.toMatch(/\?[^#]*uploadToken=/);
    expect(ticket.instructions).toMatch(/uploadPageUrl|browser/i);

    const page = await request(app).get(`/api/v1/mcp/wallet-documents/${ticket.ticketId}`);
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toMatch(/html/);
    expect(page.headers['cache-control']).toMatch(/no-store/i);
    expect(page.text).toContain('Upload purchase order');
    expect(page.text).toContain('name="document"');
    expect(page.text).toContain('location.hash');

    const walletsBefore = await Wallet.countDocuments({ tenantId: tenant._id });
    const uploaded = await request(app)
      .post(`/api/v1/mcp/wallet-documents/${ticket.ticketId}`)
      .field('uploadToken', ticket.uploadToken)
      .attach('document', Buffer.from('%PDF-1.4 mock po'), {
        filename: 'agreement.pdf',
        contentType: 'application/pdf',
      });
    expect(uploaded.status).toBe(200);
    expect(uploaded.headers['content-type']).toMatch(/html/);
    expect(uploaded.text).toMatch(/Document uploaded/i);

    const status = await getWalletDocumentUpload({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      ticketId: ticket.ticketId,
    });
    expect(status.status).toBe('ready');
    expect(status.documentUrl).toMatch(/document/);

    const preview = await prepareWalletSetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: {
        name: 'Browser Handoff Budget',
        amount: 9_500,
        fundingMethod: 'po_upload',
        validFrom: '2026-01-01',
        validTo: '2026-12-31',
        documentTicketId: ticket.ticketId,
        ...CONTACT,
      },
    });
    expect(preview.preview.documentReady).toBe(true);
    expect(preview.preview.validFrom).toContain('2026-01-01');
    expect(await Wallet.countDocuments({ tenantId: tenant._id })).toBe(walletsBefore);
  });

  it('rejects expired and unauthorized browser upload page access', async () => {
    const ticket = await prepareWalletDocumentUpload({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
    });

    const unauthorized = await request(app)
      .get(`/api/v1/mcp/wallet-documents/${ticket.ticketId}`)
      .query({ uploadToken: 'not-the-real-token' });
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.text).toMatch(/invalid|expired|token/i);

    await McpWalletDocumentTicket.updateOne(
      { tenantId: tenant._id, ticketId: ticket.ticketId },
      { $set: { expiresAt: new Date(Date.now() - 1_000) } },
    );
    const expired = await request(app)
      .get(`/api/v1/mcp/wallet-documents/${ticket.ticketId}`)
      .query({ uploadToken: ticket.uploadToken });
    expect(expired.status).toBe(410);

    await expect(
      completeWalletDocumentUpload({
        ticketId: ticket.ticketId,
        uploadToken: ticket.uploadToken,
        file: {
          originalname: 'late.pdf',
          mimetype: 'application/pdf',
          buffer: Buffer.from('%PDF-1.4'),
          size: 8,
        },
      }),
    ).rejects.toMatchObject({ code: 'CONFIRMATION_EXPIRED' });
  });



  it('rejects non-PDF uploads on the MCP wallet document route', async () => {
    const ticket = await prepareWalletDocumentUpload({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
    });
    const rejected = await request(app)
      .post(`/api/v1/mcp/wallet-documents/${ticket.ticketId}`)
      .set('X-Mcp-Upload-Token', ticket.uploadToken)
      .attach('document', Buffer.from('\x89PNG'), {
        filename: 'fake.png',
        contentType: 'image/png',
      });
    expect(rejected.status).toBe(415);
  });

  it('invalidates the upload token after success and keeps ready tickets usable past mint expiry', async () => {
    const ticket = await prepareWalletDocumentUpload({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
    });
    expect(ticket.uploadPageUrl).toContain('#uploadToken=');
    expect(ticket.uploadPageUrl).not.toMatch(/\?uploadToken=/);

    const page = await request(app).get(`/api/v1/mcp/wallet-documents/${ticket.ticketId}`);
    expect(page.status).toBe(200);
    expect(page.headers['cache-control']).toMatch(/no-store/i);
    expect(page.headers['referrer-policy']).toBe('no-referrer');
    expect(page.headers['content-security-policy']).toMatch(/default-src 'none'/);
    expect(page.text).toContain('location.hash');

    const uploaded = await request(app)
      .post(`/api/v1/mcp/wallet-documents/${ticket.ticketId}`)
      .set('X-Mcp-Upload-Token', ticket.uploadToken)
      .attach('document', Buffer.from('%PDF-1.4 mock po'), {
        filename: 'po.pdf',
        contentType: 'application/pdf',
      });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.status).toBe('ready');

    const replay = await request(app)
      .post(`/api/v1/mcp/wallet-documents/${ticket.ticketId}`)
      .set('X-Mcp-Upload-Token', ticket.uploadToken)
      .attach('document', Buffer.from('%PDF-1.4 other'), {
        filename: 'other.pdf',
        contentType: 'application/pdf',
      });
    expect(replay.status).toBe(401);

    await McpWalletDocumentTicket.updateOne(
      { tenantId: tenant._id, ticketId: ticket.ticketId },
      { $set: { expiresAt: new Date(Date.now() - 1_000) } },
    );

    // Late POST must not demote ready -> expired (setup still needs the ticket).
    await expect(
      completeWalletDocumentUpload({
        ticketId: ticket.ticketId,
        uploadToken: ticket.uploadToken,
        file: {
          originalname: 'late.pdf',
          mimetype: 'application/pdf',
          buffer: Buffer.from('%PDF-1.4'),
          size: 8,
        },
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    const row = await McpWalletDocumentTicket.findOne({
      tenantId: tenant._id,
      ticketId: ticket.ticketId,
    });
    expect(row.status).toBe('ready');
    expect(row.documentUrl).toMatch(/document/);

    const successPage = await request(app).get(`/api/v1/mcp/wallet-documents/${ticket.ticketId}`);
    expect(successPage.status).toBe(200);
    expect(successPage.text).toMatch(/Document uploaded/i);

    const preview = await prepareWalletSetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: {
        name: 'Post Expiry Ticket Budget',
        amount: 4_000,
        fundingMethod: 'po_upload',
        documentTicketId: ticket.ticketId,
        ...CONTACT,
      },
    });
    expect(preview.preview.documentReady).toBe(true);
  });

});
