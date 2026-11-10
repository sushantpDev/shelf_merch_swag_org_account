import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser, makeFundedWallet } from './helpers.js';
import { AuditLog } from '../src/modules/auditLogs/auditLog.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';
import { WalletTransaction } from '../src/modules/wallets/walletTransaction.model.js';
import { Entity } from '../src/modules/entities/entity.model.js';
import * as ledger from '../src/services/ledger.service.js';
import { prepareMcpWrite, executeMcpWrite } from '../src/modules/mcp/mcpWriteSafety.js';
import { McpWriteConfirmation } from '../src/modules/mcp/mcpWriteConfirmation.model.js';
import { McpWriteIdempotency } from '../src/modules/mcp/mcpWriteIdempotency.model.js';

const SECRET_EMAIL = 'hidden-person@example.com';
const SECRET_TOKEN = 'redeem-secret-token-value';
const SECRET_PAYMENT = 'pay_secret_razorpay_value';

let tenant;
let actor;
let effects;

beforeAll(connectTestDb);
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  tenant = await makeTenant({ slug: 'write-safety' });
  actor = await makeUser(tenant, 'company_admin', 'tenant');
  effects = 0;
});

function operation(overrides = {}) {
  return {
    operation: 'fixture.note',
    authorize: async ({ user, tenant: workspace }) => {
      if (workspace.status !== 'active') {
        const error = new Error('Workspace is not active');
        error.status = 403;
        error.code = 'TENANT_INACTIVE';
        throw error;
      }
      if (user.role !== 'company_admin') {
        const error = new Error('This role cannot confirm the operation');
        error.status = 403;
        error.code = 'FORBIDDEN';
        throw error;
      }
    },
    validate: (payload) => ({ amount: payload.amount, note: payload.note }),
    resourceState: () => ({ status: overrides.status?.() ?? 'approved' }),
    financialConstraint: async ({ payload }) => {
      const available = overrides.available?.() ?? 1000;
      if (payload.amount > available) {
        const error = new Error('Insufficient funds for this preview');
        error.status = 422;
        error.code = 'INSUFFICIENT_FUNDS';
        throw error;
      }
    },
    summary: (payload) => ({ amount: payload.amount, email: payload.email, note: payload.note }),
    execute: async () => {
      effects += 1;
      if (overrides.fail) throw new Error('operation failed');
      return { applied: true, email: SECRET_EMAIL, redemptionToken: SECRET_TOKEN };
    },
    reconcile: overrides.reconcile,
    ...overrides.handlers,
  };
}

function payload(amount = 100) {
  return {
    amount,
    note: 'ok',
    email: SECRET_EMAIL,
    redemptionToken: SECRET_TOKEN,
    razorpay_payment_id: SECRET_PAYMENT,
  };
}

async function prepare(extra = {}) {
  const spec = operation(extra);
  return prepareMcpWrite({
    tenantId: extra.tenantId ?? tenant._id,
    actorUserId: extra.actorUserId ?? actor.user._id,
    operation: spec.operation,
    payload: extra.payload ?? payload(),
    authorize: spec.authorize,
    validate: spec.validate,
    resourceState: spec.resourceState,
    financialConstraint: spec.financialConstraint,
    summary: spec.summary,
    ttlMs: extra.ttlMs,
    now: extra.now,
  });
}

function execute(prepared, extra = {}) {
  const spec = operation(extra);
  return executeMcpWrite({
    tenantId: extra.tenantId ?? tenant._id,
    actorUserId: extra.actorUserId ?? actor.user._id,
    operation: spec.operation,
    confirmationId: prepared.confirmationId,
    payload: extra.payload ?? payload(),
    idempotencyKey: extra.idempotencyKey ?? 'confirm-once',
    authorize: spec.authorize,
    validate: spec.validate,
    resourceState: spec.resourceState,
    financialConstraint: spec.financialConstraint,
    execute: spec.execute,
    reconcile: spec.reconcile,
    now: extra.now,
  });
}

describe('MCP write safety foundation', () => {
  it('prepares without changing business state and hides sensitive fields', async () => {
    const prepared = await prepare();
    expect(effects).toBe(0);
    expect(prepared.confirmationId).toEqual(expect.any(String));
    expect(prepared.summary.email).toBe('[redacted]');
    expect(prepared.summary.note).toBe('ok');
    expect(JSON.stringify(prepared)).not.toContain(SECRET_EMAIL);
    expect(JSON.stringify(prepared)).not.toContain(SECRET_TOKEN);
    expect(JSON.stringify(prepared)).not.toContain(SECRET_PAYMENT);
    const stored = JSON.stringify(await McpWriteConfirmation.findOne({ tenantId: tenant._id, confirmationId: prepared.confirmationId }).lean());
    expect(stored).not.toContain(SECRET_EMAIL);
    expect(stored).not.toContain(SECRET_TOKEN);
    expect(stored).not.toContain(SECRET_PAYMENT);

    const audits = await AuditLog.find({ tenantId: tenant._id }).lean();
    const text = JSON.stringify(audits);
    expect(text).toContain('mcp_write.attempted');
    expect(text).not.toContain(SECRET_EMAIL);
    expect(text).not.toContain(SECRET_TOKEN);
    expect(text).not.toContain(SECRET_PAYMENT);
    expect(text).not.toContain(prepared.confirmationId);
  });

  it('executes once, replays the same key, and rejects a reused confirmation', async () => {
    const prepared = await prepare();
    const first = await execute(prepared, { idempotencyKey: 'once' });
    expect(first.applied).toBe(true);
    expect(first.email).toBe('[redacted]');
    expect(JSON.stringify(first)).not.toContain(SECRET_TOKEN);
    expect(effects).toBe(1);

    const replay = await execute(prepared, { idempotencyKey: 'once' });
    expect(replay.applied).toBe(true);
    expect(effects).toBe(1);

    const again = await prepare();
    await expect(execute(again, { idempotencyKey: 'once', payload: payload(101) })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
    });

    await expect(execute(prepared, { idempotencyKey: 'second-key' })).rejects.toMatchObject({
      code: 'CONFIRMATION_REUSED',
    });
    expect(effects).toBe(1);

    const reconciled = await execute(prepared, {
      idempotencyKey: 'second-key-reconcile',
      reconcile: async () => ({ outcome: 'completed', result: { applied: true, email: SECRET_EMAIL } }),
      handlers: { execute: async () => { effects += 1; return { applied: true }; } },
    });
    expect(reconciled.applied).toBe(true);
    expect(reconciled.email).toBe('[redacted]');
    expect(effects).toBe(1);

    const audits = JSON.stringify(await AuditLog.find({ tenantId: tenant._id }).lean());
    expect(audits).toContain('mcp_write.confirmed');
    expect(audits).toContain('mcp_write.successful');
    expect(audits).toContain('mcp_write.reconciled');
  });

  it('allows only one of several concurrent executions', async () => {
    const prepared = await prepare();
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => execute(prepared, { idempotencyKey: 'race' })),
    );
    const fulfilled = results.filter((entry) => entry.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    expect(fulfilled.every((entry) => entry.value.applied === true)).toBe(true);
    expect(effects).toBe(1);
    const rejected = results.filter((entry) => entry.status === 'rejected').map((entry) => entry.reason.code);
    expect(rejected.every((code) => code === 'IDEMPOTENT_REPLAY_IN_FLIGHT' || code === 'CONFIRMATION_REUSED')).toBe(true);
  });

  it('rejects a stale preview, an authorization change, a suspended workspace, and an expired confirmation', async () => {
    let current = new Date('2026-01-01T00:00:00Z');
    const expiring = await prepare({ ttlMs: 1000, now: () => current });
    current = new Date('2026-01-01T00:00:02Z');
    await expect(execute(expiring, { now: () => current, idempotencyKey: 'expired' })).rejects.toMatchObject({
      code: 'CONFIRMATION_EXPIRED',
    });

    let status = 'approved';
    const stale = await prepare({ status: () => status });
    status = 'launched';
    await expect(execute(stale, { status: () => status, idempotencyKey: 'stale' })).rejects.toMatchObject({
      code: 'CONFIRMATION_STALE',
    });
    expect(effects).toBe(0);

    const altered = await prepare();
    await expect(execute(altered, { idempotencyKey: 'altered', payload: payload(250) })).rejects.toMatchObject({
      code: 'CONFIRMATION_MISMATCH',
    });
    const kept = await McpWriteConfirmation.findOne({ tenantId: tenant._id, confirmationId: altered.confirmationId });
    expect(kept.status).toBe('pending');
    await execute(altered, { idempotencyKey: 'altered-ok' });
    expect(effects).toBe(1);

    let available = 1000;
    const poor = await prepare({ available: () => available });
    available = 10;
    await expect(execute(poor, { available: () => available, idempotencyKey: 'poor' })).rejects.toMatchObject({
      code: 'INSUFFICIENT_FUNDS',
    });

    const other = await makeUser(tenant, 'company_admin', 'tenant');
    const foreignActor = await prepare();
    await expect(
      execute(foreignActor, { actorUserId: other.user._id, idempotencyKey: 'other-actor' }),
    ).rejects.toMatchObject({ code: 'CONFIRMATION_INVALID' });
    const stillPending = await McpWriteConfirmation.findOne({ tenantId: tenant._id, confirmationId: foreignActor.confirmationId });
    expect(stillPending.status).toBe('pending');

    const otherTenant = await makeTenant({ slug: 'other-workspace' });
    const outsider = await makeUser(otherTenant, 'company_admin', 'tenant');
    const cross = await prepare();
    await expect(
      execute(cross, { tenantId: otherTenant._id, actorUserId: outsider.user._id, idempotencyKey: 'cross' }),
    ).rejects.toMatchObject({ code: 'CONFIRMATION_INVALID' });
    const owner = await McpWriteConfirmation.findOne({ tenantId: tenant._id, confirmationId: cross.confirmationId });
    expect(owner.status).toBe('pending');

    const demoted = await prepare();
    await RoleAssignment.updateOne({ _id: actor.assignment._id }, { role: 'recipient' });
    await expect(execute(demoted, { idempotencyKey: 'demoted' })).rejects.toMatchObject({ status: 403 });
    expect(effects).toBe(1);

    tenant.status = 'suspended';
    await tenant.save();
    const suspended = await prepare().catch((error) => error);
    expect(suspended.code).toBe('TENANT_INACTIVE');

    const audits = JSON.stringify(await AuditLog.find({ tenantId: tenant._id }).lean());
    expect(audits).toContain('mcp_write.rejected');
  });

  it('records a failed operation once and replays that failure', async () => {
    const prepared = await prepare({ handlers: { execute: async () => { effects += 1; throw new Error('operation failed'); } } });
    await expect(execute(prepared, { idempotencyKey: 'fails', handlers: { execute: async () => { effects += 1; throw new Error('operation failed'); } } })).rejects.toThrow('operation failed');
    await expect(execute(prepared, { idempotencyKey: 'fails', handlers: { execute: async () => { effects += 1; throw new Error('operation failed'); } } })).rejects.toMatchObject({
      code: 'MCP_WRITE_FAILED',
    });
    expect(effects).toBe(1);
    const audits = JSON.stringify(await AuditLog.find({ tenantId: tenant._id }).lean());
    expect(audits).toContain('mcp_write.failed');
    expect(audits).not.toContain(SECRET_EMAIL);
  });


  it('reconciles a recoverable failure without repeating an uncertain effect', async () => {
    let outcome = 'uncertain';
    const prepared = await prepare({
      reconcile: async () => (outcome === 'completed'
        ? { outcome: 'completed', result: { applied: true, settled: true, email: SECRET_EMAIL } }
        : { outcome }),
    });
    await expect(execute(prepared, {
      idempotencyKey: 'recover-fail',
      reconcile: async () => ({ outcome }),
      handlers: { execute: async () => { effects += 1; throw new Error('operation failed'); } },
    })).rejects.toThrow('operation failed');
    expect(effects).toBe(1);

    await expect(execute(prepared, {
      idempotencyKey: 'recover-fail',
      reconcile: async () => ({ outcome: 'uncertain' }),
      handlers: { execute: async () => { effects += 1; return { applied: true }; } },
    })).rejects.toMatchObject({ code: 'IDEMPOTENCY_RECONCILIATION_REQUIRED' });
    expect(effects).toBe(1);

    outcome = 'absent';
    await expect(execute(prepared, {
      idempotencyKey: 'recover-fail',
      reconcile: async () => ({ outcome: 'absent' }),
      handlers: { execute: async () => { effects += 1; return { applied: true }; } },
    })).rejects.toMatchObject({ code: 'MCP_WRITE_FAILED' });
    expect(effects).toBe(1);

    const replay = await Promise.all([0, 1].map(() => execute(prepared, {
      idempotencyKey: 'recover-fail',
      reconcile: async () => ({ outcome: 'completed', result: { applied: true, settled: true, email: SECRET_EMAIL } }),
      handlers: { execute: async () => { effects += 1; return { applied: true, settled: false }; } },
    })));
    expect(effects).toBe(1);
    expect(replay[0].settled).toBe(true);
    expect(replay[1].settled).toBe(true);
    expect(replay[0].email).toBe('[redacted]');
    const stored = await McpWriteIdempotency.findOne({ tenantId: tenant._id, key: 'recover-fail' });
    expect(stored.status).toBe('completed');
    expect(JSON.stringify(stored.result)).not.toContain(SECRET_EMAIL);
  });

  it('keeps a permanent failure without reconciliation', async () => {
    const prepared = await prepare();
    const denied = new Error('not allowed');
    denied.status = 403;
    denied.code = 'FORBIDDEN';
    await expect(execute(prepared, {
      idempotencyKey: 'permanent',
      reconcile: async () => ({ outcome: 'completed', result: { applied: true } }),
      handlers: { execute: async () => { effects += 1; throw denied; } },
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(execute(prepared, {
      idempotencyKey: 'permanent',
      reconcile: async () => { effects += 10; return { outcome: 'completed', result: { applied: true } }; },
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(effects).toBe(1);
  });
  it('debits a campaign spend once when concurrent ledger calls share an idempotency key', async () => {
    const funded = await makeFundedWallet(tenant, { amount: 5000, name: 'Spend' });
    const entity = await Entity.create({ tenantId: tenant._id, walletId: funded._id, name: 'Ops' });
    await ledger.createTransaction({
      tenantId: tenant._id,
      walletId: funded._id,
      type: 'allocation_to_entity',
      amount: 1250,
      relatedEntityId: entity._id,
    });
    const key = 'campaign_spend:race-campaign';
    const calls = Array.from({ length: 4 }, () =>
      ledger.createTransaction({
        tenantId: tenant._id,
        walletId: funded._id,
        type: 'campaign_spend',
        amount: -1250,
        relatedEntityId: entity._id,
        idempotencyKey: key,
        description: 'Campaign launch',
      }),
    );
    const txns = await Promise.all(calls);
    expect(new Set(txns.map((txn) => String(txn._id))).size).toBe(1);
    const wallet = await Wallet.findOne({ _id: funded._id, tenantId: tenant._id });
    expect(wallet.balance).toBe(3750);
    const rows = await WalletTransaction.find({ tenantId: tenant._id, idempotencyKey: key });
    expect(rows).toHaveLength(1);
    const spent = await Entity.findOne({ _id: entity._id, tenantId: tenant._id });
    expect(spent.spentAmount).toBe(1250);
  });
});
