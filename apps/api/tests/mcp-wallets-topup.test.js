import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';
import { WalletTransaction } from '../src/modules/wallets/walletTransaction.model.js';
import { McpWriteIdempotency } from '../src/modules/mcp/mcpWriteIdempotency.model.js';
import { McpWalletDocumentTicket } from '../src/modules/mcp/mcpWalletDocumentTicket.model.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { authHeader, makeFundedWallet, makeTenant, makeUser } from './helpers.js';
import {
  executeWalletPaymentOrder,
  executeWalletPaymentVerify,
  prepareWalletPaymentOrder,
  prepareWalletPaymentVerify,
} from '../src/modules/mcp/walletsSetupWrite.js';
import {
  prepareWalletDocumentUpload,
} from '../src/modules/mcp/walletsDocumentUpload.js';
import {
  executeWalletTopup,
  prepareWalletTopup,
} from '../src/modules/mcp/walletsTopupWrite.js';
import { rejectFunding } from '../src/modules/platform/finance.service.js';
import { LOCAL_OAUTH_CLIENT_ID, LOCAL_OAUTH_REDIRECT_URI, mcpResourceUrl } from '../src/modules/oauth/oauth.config.js';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { env } from '../src/config/env.js';

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

function signPayment(orderId, paymentId) {
  return createHmac('sha256', env.RAZORPAY_KEY_SECRET || 'test-key-secret')
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

let app;
let tenant;
let admin;
let manager;
let otherTenant;
let otherAdmin;
let wallet;

function s256(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
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
    state: 'wallet-topup',
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

async function uploadPo(actorUserId) {
  const ticket = await prepareWalletDocumentUpload({
    tenantId: tenant._id,
    actorUserId,
  });
  const uploaded = await request(app)
    .post(`/api/v1/mcp/wallet-documents/${ticket.ticketId}`)
    .set('X-Mcp-Upload-Token', ticket.uploadToken)
    .attach('document', Buffer.from('%PDF-1.4 mock topup po'), {
      filename: 'topup-po.pdf',
      contentType: 'application/pdf',
    });
  expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201);
  return {
    ticketId: ticket.ticketId,
    documentUrl: uploaded.body.documentUrl,
  };
}

function topupInput(overrides = {}) {
  return {
    walletId: String(wallet._id),
    amount: 10_000,
    fundingMethod: 'po_upload',
    description: 'Q3 gifting budget',
    docType: 'Purchase Order',
    docNumber: 'PO-TOP-1',
    ...overrides,
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
  tenant = await makeTenant({ slug: 'wallet-topup' });
  admin = await makeUser(tenant, 'company_admin', 'tenant');
  manager = await makeUser(tenant, 'entity_manager', 'tenant');
  otherTenant = await makeTenant({ slug: 'wallet-topup-other' });
  otherAdmin = await makeUser(otherTenant, 'company_admin', 'tenant');
  wallet = await makeFundedWallet(tenant, { name: 'Company Wallet', amount: 50_000 });
});

describe('MCP organization wallet top-up', () => {
  it('accepts ticket-only prepare then url-only execute without CONFIRMATION_MISMATCH', async () => {
    const { documentUrl, ticketId } = await uploadPo(admin.user._id);
    const prepared = await prepareWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: {
        walletId: String(wallet._id),
        amount: 10_000,
        fundingMethod: 'po_upload',
        docType: 'Purchase Order',
        docNumber: 'PO-MISMATCH-1',
        documentTicketId: ticketId,
        // no documentUrl, no description — mirrors ChatGPT prepare after upload poll
      },
    });

    const result = await executeWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'topup-ticket-then-url',
      input: {
        walletId: String(wallet._id),
        amount: 10_000,
        fundingMethod: 'po_upload',
        docType: 'Purchase Order',
        docNumber: 'PO-MISMATCH-1',
        documentUrl,
        // no documentTicketId — mirrors ChatGPT execute using resolved URL
      },
    });
    expect(result).toMatchObject({
      fundingPending: true,
      requestedAmount: 10_000,
      balance: 50_000,
      documentAttached: true,
    });
    const ticket = await McpWalletDocumentTicket.findOne({ ticketId, tenantId: tenant._id });
    expect(ticket.status).toBe('consumed');
  });

  it('treats omitted and empty optional description as the same confirmation payload', async () => {
    const { documentUrl, ticketId } = await uploadPo(admin.user._id);
    const prepared = await prepareWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: {
        walletId: String(wallet._id),
        amount: 4_000,
        docNumber: 'PO-DESC-1',
        documentTicketId: ticketId,
      },
    });
    const result = await executeWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'topup-desc-normalize',
      input: {
        walletId: String(wallet._id),
        amount: 4_000,
        docNumber: 'PO-DESC-1',
        description: '',
        documentUrl,
        documentTicketId: ticketId,
      },
    });
    expect(result.fundingPending).toBe(true);
    expect(result.balance).toBe(50_000);
  });

  it('rejects true payload drift with CONFIRMATION_MISMATCH without funding or ticket consume', async () => {
    const { documentUrl, ticketId } = await uploadPo(admin.user._id);
    const prepared = await prepareWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: topupInput({
        amount: 10_000,
        description: 'Q3 note',
        documentUrl,
        documentTicketId: ticketId,
      }),
    });

    await expect(executeWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'topup-true-mismatch',
      input: topupInput({
        amount: 12_000,
        description: 'Q3 note',
        documentUrl,
        documentTicketId: ticketId,
      }),
    })).rejects.toMatchObject({ code: 'CONFIRMATION_MISMATCH' });

    const after = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    expect(after.fundingDocument.approvalStatus).not.toBe('pending');
    expect(Number(after.balance)).toBe(50_000);
    expect(after.fundingDocument.fileUrl || '').toBeFalsy();
    const ticket = await McpWalletDocumentTicket.findOne({ ticketId, tenantId: tenant._id });
    expect(ticket.status).toBe('ready');
    expect(await WalletTransaction.countDocuments({
      tenantId: tenant._id,
      walletId: wallet._id,
      type: 'fund_in',
    })).toBe(1);
  });

  it('rejects document, PO number, or wallet drift and blocks ticket/document swap', async () => {
    const { documentUrl, ticketId } = await uploadPo(admin.user._id);
    const prepared = await prepareWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: topupInput({
        amount: 10_000,
        docNumber: 'PO-SAFE-1',
        documentUrl,
        documentTicketId: ticketId,
      }),
    });

    await expect(executeWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'topup-docnum-mismatch',
      input: topupInput({
        amount: 10_000,
        docNumber: 'PO-SAFE-2',
        documentUrl,
        documentTicketId: ticketId,
      }),
    })).rejects.toMatchObject({ code: 'CONFIRMATION_MISMATCH' });

    const otherWallet = await makeFundedWallet(tenant, { name: 'Other Wallet', amount: 20_000 });
    await expect(executeWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'topup-wallet-mismatch',
      input: topupInput({
        walletId: String(otherWallet._id),
        amount: 10_000,
        docNumber: 'PO-SAFE-1',
        documentUrl,
        documentTicketId: ticketId,
      }),
    })).rejects.toMatchObject({ code: 'CONFIRMATION_MISMATCH' });

    const swapped = await uploadPo(admin.user._id);
    await expect(executeWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'topup-doc-swap',
      input: topupInput({
        amount: 10_000,
        docNumber: 'PO-SAFE-1',
        documentUrl: swapped.documentUrl,
        documentTicketId: ticketId,
      }),
    })).rejects.toMatchObject({ code: expect.stringMatching(/INVALID_DOCUMENT_URL|CONFIRMATION_MISMATCH/) });

    const after = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    expect(after.fundingDocument.approvalStatus).not.toBe('pending');
    expect(Number(after.balance)).toBe(50_000);
    const ticket = await McpWalletDocumentTicket.findOne({ ticketId, tenantId: tenant._id });
    expect(ticket.status).toBe('ready');
  });

  it('exposes prepare/execute top-up tools over MCP', async () => {
    const token = await issueOauth(admin, 'openid offline_access wallets:setup wallets:read');
    const listed = await mcpRequest(token, 'tools/list');
    const body = rpcBody(listed);
    const names = (body?.result?.tools || []).map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining([
      'wallets_prepare_topup',
      'wallets_execute_topup',
      'wallets_prepare_payment_order',
      'wallets_prepare_document_upload',
      'wallet_list_balances',
    ]));
  });

  it('prepares a PO top-up without mutating the wallet, then executes pending finance request', async () => {
    const { documentUrl, ticketId } = await uploadPo(admin.user._id);
    const before = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    const prepared = await prepareWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: topupInput({ documentUrl, documentTicketId: ticketId }),
    });
    expect(prepared.preview).toMatchObject({
      walletId: String(wallet._id),
      amount: 10_000,
      fundingMethod: 'po_upload',
      documentReady: true,
      currentBalance: 50_000,
      financeApprovalRequired: true,
      balanceUnchangedUntilFinanceApproval: true,
    });

    const mid = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    expect(mid.fundingDocument.approvalStatus).toBe(before.fundingDocument.approvalStatus);
    expect(Number(mid.balance)).toBe(50_000);
    expect(mid.fundingDocument.fileUrl || '').toBe(before.fundingDocument.fileUrl || '');

    const result = await executeWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'topup-po-happy',
      input: topupInput({ documentUrl, documentTicketId: ticketId }),
    });
    expect(result).toMatchObject({
      fundingPending: true,
      fundingApprovalStatus: 'pending',
      requestedAmount: 10_000,
      balance: 50_000,
      documentAttached: true,
      nextStep: 'finance_approval',
    });

    const after = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    expect(after.fundingDocument.approvalStatus).toBe('pending');
    expect(Number(after.fundingDocument.requestedAmount)).toBe(10_000);
    expect(after.fundingDocument.docType).toBe('Purchase Order');
    expect(after.fundingDocument.docNumber).toBe('PO-TOP-1');
    expect(after.fundingDocument.fileUrl).toBeTruthy();
    expect(Number(after.balance)).toBe(50_000);
    expect(await WalletTransaction.countDocuments({
      tenantId: tenant._id,
      walletId: wallet._id,
      type: 'fund_in',
    })).toBe(1); // initial seed only
  });

  it('rejects unauthorized roles, cross-tenant wallets, invalid amounts, and missing PO fields', async () => {
    const { documentUrl, ticketId } = await uploadPo(admin.user._id);
    await expect(prepareWalletTopup({
      tenantId: tenant._id,
      actorUserId: manager.user._id,
      input: topupInput({ documentUrl, documentTicketId: ticketId }),
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(prepareWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: topupInput({
        walletId: String((await makeFundedWallet(otherTenant, { name: 'Other', amount: 1_000 }))._id),
        documentUrl,
        documentTicketId: ticketId,
      }),
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await expect(prepareWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: topupInput({ amount: 0, documentUrl, documentTicketId: ticketId }),
    })).rejects.toMatchObject({ code: 'VALIDATION' });

    await expect(prepareWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: topupInput({ documentTicketId: undefined, documentUrl: undefined }),
    })).rejects.toMatchObject({ code: 'DOCUMENT_REQUIRED' });

    await expect(prepareWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: topupInput({ docNumber: '  ', documentUrl, documentTicketId: ticketId }),
    })).rejects.toMatchObject({ code: 'DOC_NUMBER_REQUIRED' });

    await expect(prepareWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: topupInput({ fundingMethod: 'online' }),
    })).rejects.toMatchObject({ code: 'USE_RAZORPAY' });
  });

  it('rejects expired upload tickets and blocks duplicate pending top-ups', async () => {
    const ticket = await prepareWalletDocumentUpload({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
    });
    const { McpWalletDocumentTicket } = await import('../src/modules/mcp/mcpWalletDocumentTicket.model.js');
    await McpWalletDocumentTicket.updateOne(
      { ticketId: ticket.ticketId, tenantId: tenant._id },
      { $set: { expiresAt: new Date(0) } },
    );
    await expect(prepareWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: topupInput({ documentTicketId: ticket.ticketId }),
    })).rejects.toMatchObject({ code: 'CONFIRMATION_EXPIRED' });

    const { documentUrl, ticketId } = await uploadPo(admin.user._id);
    const prepared = await prepareWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: topupInput({ documentUrl, documentTicketId: ticketId }),
    });
    await executeWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'topup-pending-once',
      input: topupInput({ documentUrl, documentTicketId: ticketId }),
    });

    const { documentUrl: doc2, ticketId: ticket2 } = await uploadPo(admin.user._id);
    await expect(prepareWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: topupInput({ amount: 5_000, documentUrl: doc2, documentTicketId: ticket2 }),
    })).rejects.toMatchObject({ code: 'FUNDING_PENDING' });
  });

  it('blocks confirmation reuse, stale confirmations, and concurrent duplicates', async () => {
    const { documentUrl, ticketId } = await uploadPo(admin.user._id);
    const prepared = await prepareWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: topupInput({ documentUrl, documentTicketId: ticketId }),
    });
    const first = await executeWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'topup-idem-1',
      input: topupInput({ documentUrl, documentTicketId: ticketId }),
    });
    expect(first.requestedAmount).toBe(10_000);

    const sameKey = await executeWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'topup-idem-1',
      input: topupInput({ documentUrl, documentTicketId: ticketId }),
    });
    expect(sameKey.requestedAmount).toBe(10_000);

    await expect(executeWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'topup-idem-other',
      input: topupInput({ documentUrl, documentTicketId: ticketId }),
    })).rejects.toMatchObject({ code: 'CONFIRMATION_REUSED' });

    await rejectFunding({ walletId: wallet._id, reason: 'test reset' });
    const { documentUrl: docB, ticketId: ticketB } = await uploadPo(admin.user._id);
    const stalePrep = await prepareWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: topupInput({ amount: 7_000, documentUrl: docB, documentTicketId: ticketB }),
    });
    await Wallet.updateOne(
      { _id: wallet._id, tenantId: tenant._id },
      { $set: { 'fundingDocument.approvalStatus': 'pending', 'fundingDocument.requestedAmount': 1 } },
    );
    await expect(executeWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: stalePrep.confirmationId,
      idempotencyKey: 'topup-stale',
      input: topupInput({ amount: 7_000, documentUrl: docB, documentTicketId: ticketB }),
    })).rejects.toMatchObject({ code: expect.stringMatching(/CONFIRMATION_STALE|FUNDING_PENDING/) });

    await Wallet.updateOne(
      { _id: wallet._id, tenantId: tenant._id },
      { $set: { 'fundingDocument.approvalStatus': 'rejected', 'fundingDocument.requestedAmount': 0, 'fundingDocument.fileUrl': '' } },
    );
    const { documentUrl: docC, ticketId: ticketC } = await uploadPo(admin.user._id);
    const racePrep = await prepareWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: topupInput({ amount: 3_000, documentUrl: docC, documentTicketId: ticketC }),
    });
    const concurrent = await Promise.allSettled(
      Array.from({ length: 5 }, () => executeWalletTopup({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        confirmationId: racePrep.confirmationId,
        idempotencyKey: 'topup-race',
        input: topupInput({ amount: 3_000, documentUrl: docC, documentTicketId: ticketC }),
      })),
    );
    const fulfilled = concurrent.filter((entry) => entry.status === 'fulfilled');
    const rejected = concurrent.filter((entry) => entry.status === 'rejected');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    expect(fulfilled.every((entry) => entry.value.requestedAmount === 3_000)).toBe(true);
    expect(rejected.every((entry) => (
      entry.reason?.code === 'IDEMPOTENT_REPLAY_IN_FLIGHT'
      || entry.reason?.code === 'CONFIRMATION_REUSED'
      || entry.reason?.code === 'FUNDING_PENDING'
    ))).toBe(true);
    const after = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    expect(after.fundingDocument.approvalStatus).toBe('pending');
    expect(Number(after.fundingDocument.requestedAmount)).toBe(3_000);
    expect(Number(after.balance)).toBe(50_000);
  });

  it('recovers a timed-out execute without double-submitting funding', async () => {
    const { documentUrl, ticketId } = await uploadPo(admin.user._id);
    const prepared = await prepareWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: topupInput({ amount: 4_500, documentUrl, documentTicketId: ticketId }),
    });
    const first = await executeWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'topup-timeout',
      input: topupInput({ amount: 4_500, documentUrl, documentTicketId: ticketId }),
    });
    expect(first.requestedAmount).toBe(4_500);

    await McpWriteIdempotency.updateOne(
      { key: 'topup-timeout', tenantId: tenant._id, actorUserId: admin.user._id },
      { $set: { status: 'pending', result: null, leaseOwner: 'stale-worker', leaseExpiresAt: new Date(0) } },
    );

    const recovered = await executeWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'topup-timeout',
      input: topupInput({ amount: 4_500, documentUrl, documentTicketId: ticketId }),
    });
    expect(recovered).toMatchObject({
      fundingPending: true,
      requestedAmount: 4_500,
      balance: 50_000,
    });
    const after = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    expect(Number(after.fundingDocument.requestedAmount)).toBe(4_500);
    expect(Number(after.balance)).toBe(50_000);
  });

  it('allows retry after finance rejection and keeps online top-up on payment tools', async () => {
    const { documentUrl, ticketId } = await uploadPo(admin.user._id);
    await executeWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: (await prepareWalletTopup({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: topupInput({ documentUrl, documentTicketId: ticketId }),
      })).confirmationId,
      idempotencyKey: 'topup-reject-first',
      input: topupInput({ documentUrl, documentTicketId: ticketId }),
    });
    await rejectFunding({ walletId: wallet._id, reason: 'incomplete PO' });
    const rejected = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    expect(rejected.fundingDocument.approvalStatus).toBe('rejected');
    expect(Number(rejected.balance)).toBe(50_000);

    const { documentUrl: doc2, ticketId: ticket2 } = await uploadPo(admin.user._id);
    const retry = await executeWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: (await prepareWalletTopup({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: topupInput({ amount: 12_000, documentUrl: doc2, documentTicketId: ticket2 }),
      })).confirmationId,
      idempotencyKey: 'topup-reject-retry',
      input: topupInput({ amount: 12_000, documentUrl: doc2, documentTicketId: ticket2 }),
    });
    expect(retry).toMatchObject({
      fundingPending: true,
      requestedAmount: 12_000,
      balance: 50_000,
    });

    await rejectFunding({ walletId: wallet._id, reason: 'switch to online' });
    razorpayOrders.create.mockResolvedValue({ id: 'order_topup', amount: 800000, currency: 'INR' });
    const orderPrep = await prepareWalletPaymentOrder({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { walletId: String(wallet._id), amount: 8_000 },
    });
    const order = await executeWalletPaymentOrder({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: orderPrep.confirmationId,
      idempotencyKey: 'topup-online-order',
      input: { walletId: String(wallet._id), amount: 8_000 },
    });
    expect(order.orderId).toBe('order_topup');
    expect(order.amount).toBe(8_000);
    const still = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    expect(still.fundingDocument.approvalStatus).not.toBe('pending');
    expect(Number(still.balance)).toBe(50_000);
  });
  it('does not create a pending funding request when document attachment fails', async () => {
    const { documentUrl, ticketId } = await uploadPo(admin.user._id);
    const prepared = await prepareWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: topupInput({ documentUrl, documentTicketId: ticketId }),
    });

    const walletsService = await import('../src/modules/wallets/wallets.service.js');
    const actualAssert = walletsService.assertTenantDocumentUrl;
    let assertCalls = 0;
    const assertSpy = vi.spyOn(walletsService, 'assertTenantDocumentUrl').mockImplementation((tenantId, url) => {
      assertCalls += 1;
      // First check (payload resolve) succeeds; failure during attach path must not fund.
      if (assertCalls === 1) return actualAssert(tenantId, url);
      const err = new Error('bad document');
      err.code = 'INVALID_DOCUMENT_URL';
      err.status = 400;
      throw err;
    });
    const fundSpy = vi.spyOn(walletsService, 'fundWallet');

    await expect(executeWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'topup-attach-fail',
      input: topupInput({ documentUrl, documentTicketId: ticketId }),
    })).rejects.toMatchObject({ code: 'INVALID_DOCUMENT_URL' });

    expect(fundSpy).not.toHaveBeenCalled();
    assertSpy.mockRestore();
    fundSpy.mockRestore();

    const after = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    expect(after.fundingDocument.approvalStatus).not.toBe('pending');
    expect(Number(after.balance)).toBe(50_000);

    const retryPrep = await prepareWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: topupInput({ amount: 2_200, documentUrl, documentTicketId: ticketId }),
    });
    const recovered = await executeWalletTopup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: retryPrep.confirmationId,
      idempotencyKey: 'topup-attach-retry',
      input: topupInput({ amount: 2_200, documentUrl, documentTicketId: ticketId }),
    });
    expect(recovered).toMatchObject({
      fundingPending: true,
      requestedAmount: 2_200,
      balance: 50_000,
      documentAttached: true,
    });
  });

  it('binds document tickets to tenant and actor and rejects cross-actor reuse', async () => {
    const { documentUrl, ticketId } = await uploadPo(admin.user._id);
    const peer = await makeUser(tenant, 'company_admin', 'tenant', { email: 'peer-topup@test.io' });
    await expect(prepareWalletTopup({
      tenantId: tenant._id,
      actorUserId: peer.user._id,
      input: topupInput({ documentUrl, documentTicketId: ticketId }),
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await expect(prepareWalletTopup({
      tenantId: otherTenant._id,
      actorUserId: otherAdmin.user._id,
      input: topupInput({
        walletId: String((await makeFundedWallet(otherTenant, { name: 'Other Co', amount: 1_000 }))._id),
        documentUrl,
        documentTicketId: ticketId,
      }),
    })).rejects.toMatchObject({ code: expect.stringMatching(/NOT_FOUND|INVALID_DOCUMENT_URL/) });
  });

  it('verifies Razorpay top-up on an existing funded wallet without crediting balance', async () => {
    razorpayOrders.create.mockResolvedValue({ id: 'order_existing_topup', amount: 600000, currency: 'INR' });
    const order = await executeWalletPaymentOrder({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: (await prepareWalletPaymentOrder({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: { walletId: String(wallet._id), amount: 6_000 },
      })).confirmationId,
      idempotencyKey: 'existing-topup-order',
      input: { walletId: String(wallet._id), amount: 6_000 },
    });

    const paymentId = 'pay_existing_topup';
    const signature = signPayment(order.orderId, paymentId);
    razorpayOrders.fetchPayment.mockResolvedValue({
      status: 'captured',
      order_id: order.orderId,
      amount: 600000,
    });

    const verifyPrep = await prepareWalletPaymentVerify({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: {
        walletId: String(wallet._id),
        razorpayOrderId: order.orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      },
    });
    const verified = await executeWalletPaymentVerify({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: verifyPrep.confirmationId,
      idempotencyKey: 'existing-topup-verify',
      input: {
        walletId: String(wallet._id),
        razorpayOrderId: order.orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      },
    });
    expect(verified).toMatchObject({
      verified: true,
      pendingApproval: true,
      status: 'pending_approval',
      balance: 50_000,
    });

    const replay = await executeWalletPaymentVerify({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      confirmationId: verifyPrep.confirmationId,
      idempotencyKey: 'existing-topup-verify',
      input: {
        walletId: String(wallet._id),
        razorpayOrderId: order.orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      },
    });
    expect(replay.idempotent || replay.pendingApproval).toBeTruthy();
    expect(replay.balance).toBe(50_000);

    await expect(prepareWalletPaymentOrder({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { walletId: String(wallet._id), amount: 1_000 },
    })).rejects.toMatchObject({ code: 'FUNDING_PENDING' });

    const funded = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    expect(funded.fundingDocument.approvalStatus).toBe('pending');
    expect(Number(funded.fundingDocument.requestedAmount)).toBe(6_000);
    expect(Number(funded.balance)).toBe(50_000);
    expect(await WalletTransaction.countDocuments({
      tenantId: tenant._id,
      walletId: wallet._id,
      type: 'fund_in',
    })).toBe(1);
  });

});
