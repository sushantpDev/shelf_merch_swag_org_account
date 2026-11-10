import { createHash, randomBytes } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';
import { WalletTransaction } from '../src/modules/wallets/walletTransaction.model.js';
import { Entity } from '../src/modules/entities/entity.model.js';
import { AuditLog } from '../src/modules/auditLogs/auditLog.model.js';
import { User } from '../src/modules/users/user.model.js';
import { OauthGrantBinding } from '../src/modules/oauth/oauthGrantBinding.model.js';
import { McpWriteConfirmation } from '../src/modules/mcp/mcpWriteConfirmation.model.js';
import { McpWriteIdempotency } from '../src/modules/mcp/mcpWriteIdempotency.model.js';
import { LOCAL_OAUTH_CLIENT_ID, LOCAL_OAUTH_REDIRECT_URI, mcpResourceUrl } from '../src/modules/oauth/oauth.config.js';
import { RESOURCE_SCOPES } from '../src/modules/oauth/oauthScopes.js';
import { revokeOauthGrantsForUser } from '../src/modules/oauth/oauthRevoke.js';
import { SlackConnection } from '../src/modules/integrations/slack/slackConnection.model.js';
import { flushPendingSlackNotifications } from '../src/modules/integrations/slack/slackNotify.service.js';
import { encryptToken } from '../src/utils/tokenEncryption.js';
import * as envModule from '../src/config/env.js';
import * as ledger from '../src/services/ledger.service.js';
import { authHeader, makeEntity, makeFundedWallet, makeTenant, makeUser } from './helpers.js';
import { listDepartments } from '../src/modules/mcp/entitiesRead.js';
import { SUGGESTED_DEPARTMENT_NAMES } from '../src/modules/mcp/departmentSuggestions.js';
import {
  executeAssignManager,
  executeEntitySetup,
  prepareAssignManager,
  prepareEntitySetup,
} from '../src/modules/mcp/entitiesWrite.js';

const allocateControl = vi.hoisted(() => ({ fail: false }));
const inviteEmails = vi.hoisted(() => []);
vi.mock('../src/modules/wallets/wallets.service.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    allocate: vi.fn(async (args) => {
      if (allocateControl.fail) {
        allocateControl.fail = false;
        const error = new Error('allocation stopped');
        error.code = 'MCP_WRITE_FAILED';
        throw error;
      }
      return actual.allocate(args);
    }),
  };
});
vi.mock('../src/services/email.service.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    sendInviteEmail: vi.fn(async (to) => {
      inviteEmails.push(to);
      return { success: true };
    }),
  };
});

const PROTOCOL = '2026-07-28';
let app;
let tenant;
let admin;
let wallet;

function setupInput(name = 'People', budget = 400, email = 'people.manager@example.com') {
  return {
    walletId: String(wallet._id),
    departments: [{
      name,
      budget,
      manager: { name: 'Priya Shah', email, role: 'Department Manager', mobile: '' },
    }],
  };
}

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
  vi.spyOn(envModule, 'slackConfigured').mockReturnValue(true);
  envModule.env.TOKEN_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  envModule.env.APP_URL = 'https://shelfmerch.io';
});

afterAll(async () => {
  vi.restoreAllMocks();
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  allocateControl.fail = false;
  inviteEmails.length = 0;
  tenant = await makeTenant({ slug: 'entity-setup' });
  admin = await makeUser(tenant, 'company_admin', 'tenant');
  wallet = await makeFundedWallet(tenant, { name: 'Operating', amount: 1_000 });
});

describe('department listing', () => {
  it('keeps departments inside the tenant and the manager assignment', async () => {
    const managed = await makeEntity(tenant, wallet, 'People', {
      managerUserId: admin.user._id,
      allocatedAmount: 100,
      spentAmount: 25,
      description: 'People ops',
      expectedUsers: 12,
    });
    await makeEntity(tenant, wallet, 'Hidden');
    const other = await makeTenant({ slug: 'other-entities' });
    const otherWallet = await makeFundedWallet(other, { amount: 500 });
    await makeEntity(other, otherWallet, 'Foreign');
    const manager = await makeUser(tenant, 'entity_manager', 'entity', {
      email: 'only-people@example.com',
      assignedEntityIds: [managed._id],
    });

    const adminRows = await listDepartments({ tenantId: tenant._id, user: { userId: admin.user._id, role: 'company_admin', scopeType: 'tenant', assignedEntityIds: [] } });
    expect(adminRows.departments.map((row) => row.name).sort()).toEqual(['Hidden', 'People']);
    expect(adminRows.departments.find((row) => row.name === 'People')).toMatchObject({
      entityId: String(managed._id),
      description: 'People ops',
      expectedUsers: 12,
      allocatedAmount: 100,
      remainingAmount: 75,
      walletId: String(wallet._id),
      walletName: 'Operating',
    });
    expect(adminRows.suggestedDepartments.map((row) => row.name)).toEqual([...SUGGESTED_DEPARTMENT_NAMES]);
    expect(adminRows.suggestedDepartments.every((row) => row.alreadyExists === false)).toBe(true);
    expect(JSON.stringify(adminRows)).not.toContain('@');

    const managerRows = await listDepartments({
      tenantId: tenant._id,
      user: { ...manager.user.toObject(), role: 'entity_manager', scopeType: 'entity', assignedEntityIds: [String(managed._id)] },
    });
    expect(managerRows.departments.map((row) => row.name)).toEqual(['People']);
    await expect(listDepartments({
      tenantId: tenant._id,
      user: { role: 'entity_manager', scopeType: 'entity', userId: manager.user._id, assignedEntityIds: [] },
    })).resolves.toBeTruthy();
  });

  it('marks suggested departments that already exist', async () => {
    await makeEntity(tenant, wallet, 'Marketing', { description: 'Existing marketing', expectedUsers: 8 });
    const rows = await listDepartments({
      tenantId: tenant._id,
      user: { userId: admin.user._id, role: 'company_admin', scopeType: 'tenant', assignedEntityIds: [] },
    });
    const marketing = rows.suggestedDepartments.find((row) => row.name === 'Marketing');
    const sales = rows.suggestedDepartments.find((row) => row.name === 'Sales');
    expect(marketing).toMatchObject({ alreadyExists: true, suggestedManagerRole: 'Marketing Manager' });
    expect(sales).toMatchObject({ alreadyExists: false });
    expect(rows.departments.find((row) => row.name === 'Marketing')).toMatchObject({
      description: 'Existing marketing',
      expectedUsers: 8,
    });
  });
});

describe('department setup', () => {
  it('previews a department without saving it', async () => {
    const prepared = await prepareEntitySetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: setupInput(),
    });
    expect(prepared.preview.totalAllocation).toBe(400);
    expect(prepared.preview.before.unallocatedAmount).toBe(1000);
    expect(prepared.preview.after.unallocatedAmount).toBe(600);
    expect(prepared.preview.departments[0]).toMatchObject({ name: 'People', action: 'create', invitation: 'new_invitation' });
    expect(prepared.preview.notices.map((notice) => notice.kind)).toEqual(['manager_invitation', 'slack_budget']);
    expect(await Entity.countDocuments({ tenantId: tenant._id })).toBe(0);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'allocation_to_entity' })).toBe(0);
  });

  it('creates the department, manager, and exact wallet allocation once', async () => {
    const prepared = await prepareEntitySetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: setupInput(),
    });
    const result = await executeEntitySetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: setupInput(),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'setup-people',
    });
    expect(result.departments).toEqual([
      expect.objectContaining({ name: 'People', allocatedAmount: 400, remainingAmount: 400, invitePending: true }),
    ]);
    expect(result).toMatchObject({ balance: 1000, allocatedAmount: 400, unallocatedAmount: 600 });
    const entity = await Entity.findOne({ tenantId: tenant._id, name: 'People' });
    expect(entity.managerEmail).toBe('people.manager@example.com');
    expect(await User.countDocuments({ email: 'people.manager@example.com' })).toBe(1);
    const txn = await WalletTransaction.find({ tenantId: tenant._id, type: 'allocation_to_entity' });
    expect(txn).toHaveLength(1);
    expect(txn[0].amount).toBe(400);

    const again = await executeEntitySetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: setupInput(),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'setup-people',
    });
    expect(again.allocatedAmount).toBe(400);
    expect(await Entity.countDocuments({ tenantId: tenant._id, name: 'People' })).toBe(1);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'allocation_to_entity' })).toBe(1);
    expect(await User.countDocuments({ email: 'people.manager@example.com' })).toBe(1);
  });

  it('rejects a department manager who is already a company admin', async () => {
    await expect(prepareEntitySetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: setupInput('People', 100, admin.user.email),
    })).rejects.toMatchObject({ code: 'ROLE_CONFLICT' });
    expect(await Entity.countDocuments({ tenantId: tenant._id })).toBe(0);
    const manager = await makeUser(tenant, 'entity_manager', 'entity');
    await expect(prepareEntitySetup({
      tenantId: tenant._id,
      actorUserId: manager.user._id,
      input: setupInput(),
    })).rejects.toMatchObject({ status: 403 });
  });

  it('uses one allocation when the same department is set up together', async () => {
    const first = await prepareEntitySetup({ tenantId: tenant._id, actorUserId: admin.user._id, input: setupInput('People', 300) });
    const second = await prepareEntitySetup({ tenantId: tenant._id, actorUserId: admin.user._id, input: setupInput('People', 300) });
    await Promise.allSettled([
      executeEntitySetup({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: setupInput('People', 300),
        confirmationId: first.confirmationId,
        idempotencyKey: 'setup-a',
      }),
      executeEntitySetup({
        tenantId: tenant._id,
        actorUserId: admin.user._id,
        input: setupInput('People', 300),
        confirmationId: second.confirmationId,
        idempotencyKey: 'setup-b',
      }),
    ]);
    expect(await Entity.countDocuments({ tenantId: tenant._id, name: 'People' })).toBe(1);
    expect((await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id })).allocatedAmount).toBe(300);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'allocation_to_entity' })).toBe(1);
  });

  it('rejects an expired preview and a preview whose wallet changed', async () => {
    const expired = await prepareEntitySetup({ tenantId: tenant._id, actorUserId: admin.user._id, input: setupInput('Old', 100) });
    await McpWriteConfirmation.updateOne({ tenantId: tenant._id, confirmationId: expired.confirmationId }, { expiresAt: new Date(0) });
    await expect(executeEntitySetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: setupInput('Old', 100),
      confirmationId: expired.confirmationId,
      idempotencyKey: 'setup-expired',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_EXPIRED' });

    const stale = await prepareEntitySetup({ tenantId: tenant._id, actorUserId: admin.user._id, input: setupInput('Fresh', 100) });
    await ledger.createTransaction({ tenantId: tenant._id, walletId: wallet._id, type: 'fund_in', amount: 50 });
    await expect(executeEntitySetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: setupInput('Fresh', 100),
      confirmationId: stale.confirmationId,
      idempotencyKey: 'setup-stale',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });
    expect(await Entity.countDocuments({ tenantId: tenant._id })).toBe(0);
  });

  it('continues after the wallet step stops and does not allocate twice', async () => {
    allocateControl.fail = true;
    const prepared = await prepareEntitySetup({ tenantId: tenant._id, actorUserId: admin.user._id, input: setupInput('People', 250) });
    await expect(executeEntitySetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: setupInput('People', 250),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'setup-crash',
    })).rejects.toBeTruthy();
    expect(await Entity.countDocuments({ tenantId: tenant._id, name: 'People' })).toBe(1);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'allocation_to_entity' })).toBe(0);

    const recovered = await prepareEntitySetup({ tenantId: tenant._id, actorUserId: admin.user._id, input: setupInput('People', 250) });
    expect(recovered.preview.departments[0]).toMatchObject({ action: 'finish_budget', invitation: 'already_assigned' });
    expect(recovered.preview.notices[0].detail).toContain('No new invitation');
    const result = await executeEntitySetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: setupInput('People', 250),
      confirmationId: recovered.confirmationId,
      idempotencyKey: 'setup-recover',
    });
    expect(result.allocatedAmount).toBe(250);
    expect(await Entity.countDocuments({ tenantId: tenant._id, name: 'People' })).toBe(1);
    expect(await User.countDocuments({ email: 'people.manager@example.com' })).toBe(1);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'allocation_to_entity' })).toBe(1);

    await McpWriteIdempotency.updateOne(
      { tenantId: tenant._id, key: 'setup-recover' },
      { status: 'pending', result: null, leaseExpiresAt: new Date(0), leaseOwner: '' },
    );
    const replay = await executeEntitySetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: setupInput('People', 250),
      confirmationId: recovered.confirmationId,
      idempotencyKey: 'setup-recover',
    });
    expect(replay.allocatedAmount).toBe(250);
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'allocation_to_entity' })).toBe(1);
  });

  it('sends the budget Slack notice once', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, ts: '1' }),
    });
    await SlackConnection.create({
      tenantId: tenant._id,
      teamId: 'T_MCP',
      teamName: 'ShelfMerch Slack',
      encryptedBotToken: encryptToken('xoxb-mcp-slack-test'),
      installedByUserId: admin.user._id,
      status: 'connected',
      connectedAt: new Date(),
      defaultChannelId: 'C_DEFAULT',
      defaultChannelName: 'employee-gifting',
      notifications: { budgetAssigned: true, walletApproved: true, lowBudget: false, pointsDistributed: true, kitsAssigned: true, orderDispatched: true, deliveryFailed: true, shopLaunched: true },
    });
    const prepared = await prepareEntitySetup({ tenantId: tenant._id, actorUserId: admin.user._id, input: setupInput() });
    expect(fetchMock).not.toHaveBeenCalled();
    await executeEntitySetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: setupInput(),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'setup-slack',
    });
    await flushPendingSlackNotifications();
    const first = fetchMock.mock.calls.map((call) => String(call[1]?.body || ''));
    expect(first.some((body) => body.includes('People'))).toBe(true);
    expect(first.join('\n')).not.toContain('people.manager@example.com');
    await executeEntitySetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: setupInput(),
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'setup-slack',
    });
    await flushPendingSlackNotifications();
    expect(fetchMock.mock.calls).toHaveLength(first.length);
    fetchMock.mockRestore();
  });
});


  it('saves an optional role and mobile number without returning the number', async () => {
    const mobile = '9876543210';
    const input = {
      walletId: String(wallet._id),
      departments: [{
        name: 'Facilities',
        budget: 200,
        manager: { name: 'Rita Das', email: 'rita.facilities@example.com', role: 'Operations Manager', mobile },
      }],
    };
    const prepared = await prepareEntitySetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
    });
    expect(prepared.preview.departments[0]).toMatchObject({
      managerName: 'Rita Das',
      managerTitle: 'Operations Manager',
      mobileProvided: true,
    });
    expect(JSON.stringify(prepared)).not.toContain(mobile);

    const result = await executeEntitySetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'setup-facilities',
    });
    expect(JSON.stringify(result)).not.toContain(mobile);
    const entity = await Entity.findOne({ tenantId: tenant._id, name: 'Facilities' });
    expect(entity.managerTitle).toBe('Operations Manager');
    const manager = await User.findOne({ email: 'rita.facilities@example.com' });
    expect(manager.phone).toBe(mobile);
    const listed = await listDepartments({
      tenantId: tenant._id,
      user: { userId: admin.user._id, role: 'company_admin', scopeType: 'tenant', assignedEntityIds: [] },
    });
    expect(listed.departments.find((row) => row.name === 'Facilities').manager.title).toBe('Operations Manager');
    expect(JSON.stringify(listed)).not.toContain(mobile);
    expect(JSON.stringify(await AuditLog.find({ tenantId: tenant._id }).lean())).not.toContain(mobile);

    await expect(prepareEntitySetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: {
        walletId: String(wallet._id),
        departments: [{
          name: 'Facilities Two',
          budget: 100,
          manager: { name: 'Rita Das', email: 'rita.two@example.com', role: '', mobile: '123' },
        }],
      },
    })).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(await Entity.countDocuments({ tenantId: tenant._id, name: 'Facilities Two' })).toBe(0);
  });

describe('department manager assignment', () => {
  it('assigns the first manager and does not replace or elevate anyone', async () => {
    const entity = await makeEntity(tenant, wallet, 'Finance');
    const prepared = await prepareAssignManager({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { entityId: String(entity._id), manager: setupInput().departments[0].manager },
    });
    expect(prepared.preview.invitation).toBe('new_invitation');
    expect(await User.countDocuments({ email: 'people.manager@example.com' })).toBe(0);
    const assigned = await executeAssignManager({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { entityId: String(entity._id), manager: setupInput().departments[0].manager },
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'assign-finance',
    });
    expect(assigned.invitePending).toBe(true);
    expect(await User.countDocuments({ email: 'people.manager@example.com' })).toBe(1);
    await executeAssignManager({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: { entityId: String(entity._id), manager: setupInput().departments[0].manager },
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'assign-finance',
    });
    expect(await User.countDocuments({ email: 'people.manager@example.com' })).toBe(1);

    await expect(prepareAssignManager({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: {
        entityId: String(entity._id),
        manager: { name: 'Other Person', email: 'other.manager@example.com', role: '', mobile: '' },
      },
    })).rejects.toMatchObject({ code: 'MANAGER_ALREADY_ASSIGNED' });
  });
});

describe('allocate budget parity gaps', () => {
  it('creates custom departments with description and expectedUsers and defaults suggested copy', async () => {
    const input = {
      walletId: String(wallet._id),
      departments: [
        {
          name: 'Marketing',
          budget: 200,
          manager: {
            name: 'Maya Market',
            email: 'maya.market@example.com',
            role: 'Marketing Manager',
            mobile: '',
            sendInvite: true,
          },
        },
        {
          name: 'Special Projects',
          description: 'One-off campaign kits',
          expectedUsers: 4,
          budget: 150,
          manager: {
            name: 'Sam Special',
            email: 'sam.special@example.com',
            role: 'Project Lead',
            mobile: '9876543210',
            sendInvite: true,
          },
        },
      ],
    };
    const prepared = await prepareEntitySetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
    });
    expect(prepared.preview.totalAllocation).toBe(350);
    expect(prepared.preview.departments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'Marketing',
        description: 'Department merchandise and campaigns.',
        expectedUsers: 10,
        sendInvite: true,
        invitation: 'new_invitation',
      }),
      expect.objectContaining({
        name: 'Special Projects',
        description: 'One-off campaign kits',
        expectedUsers: 4,
        mobileProvided: true,
      }),
    ]));
    expect(await Entity.countDocuments({ tenantId: tenant._id })).toBe(0);

    const result = await executeEntitySetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'setup-parity-meta',
    });
    expect(result.totalAllocation).toBe(350);
    const marketing = await Entity.findOne({ tenantId: tenant._id, name: 'Marketing' }).lean();
    const special = await Entity.findOne({ tenantId: tenant._id, name: 'Special Projects' }).lean();
    expect(marketing).toMatchObject({
      description: 'Department merchandise and campaigns.',
      expectedUsers: 10,
      allocatedAmount: 200,
    });
    expect(special).toMatchObject({
      description: 'One-off campaign kits',
      expectedUsers: 4,
      allocatedAmount: 150,
    });
    expect(inviteEmails).toEqual(expect.arrayContaining([
      'maya.market@example.com',
      'sam.special@example.com',
    ]));
  });

  it('honors sendInvite false without emailing and still assigns the manager', async () => {
    const entity = await makeEntity(tenant, wallet, 'Quiet');
    const input = {
      entityId: String(entity._id),
      manager: {
        name: 'Quiet Manager',
        email: 'quiet.manager@example.com',
        role: 'Ops Lead',
        mobile: '',
        sendInvite: false,
      },
    };
    const prepared = await prepareAssignManager({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
    });
    expect(prepared.preview).toMatchObject({
      sendInvite: false,
      invitation: 'assign_without_invite',
    });
    const result = await executeAssignManager({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input,
      confirmationId: prepared.confirmationId,
      idempotencyKey: 'assign-no-invite',
    });
    expect(result).toMatchObject({
      departmentName: 'Quiet',
      managerName: 'Quiet Manager',
      invitePending: true,
    });
    const user = await User.findOne({ email: 'quiet.manager@example.com' });
    expect(user.status).toBe('invited');
    expect(inviteEmails).toEqual([]);
  });

  it('rejects duplicate department names and over-budget multi-department totals on prepare', async () => {
    await expect(prepareEntitySetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: {
        walletId: String(wallet._id),
        departments: [
          { name: 'Twin', budget: 100, manager: { name: 'A', email: 'a.twin@example.com' } },
          { name: 'twin', budget: 100, manager: { name: 'B', email: 'b.twin@example.com' } },
        ],
      },
    })).rejects.toMatchObject({ code: 'VALIDATION' });

    await expect(prepareEntitySetup({
      tenantId: tenant._id,
      actorUserId: admin.user._id,
      input: {
        walletId: String(wallet._id),
        departments: [
          { name: 'Marketing', budget: 700, manager: { name: 'A', email: 'm1@example.com' } },
          { name: 'Sales', budget: 400, manager: { name: 'B', email: 'm2@example.com' } },
        ],
      },
    })).rejects.toMatchObject({ code: 'ALLOCATION_EXCEEDS_BALANCE' });
    expect(await Entity.countDocuments({ tenantId: tenant._id })).toBe(0);
  });

  it('rejects cross-tenant assign and leaves prepare without mutations', async () => {
    const other = await makeTenant({ slug: 'other-assign' });
    const otherAdmin = await makeUser(other, 'company_admin', 'tenant');
    const entity = await makeEntity(tenant, wallet, 'Local');
    await expect(prepareAssignManager({
      tenantId: other._id,
      actorUserId: otherAdmin.user._id,
      input: {
        entityId: String(entity._id),
        manager: { name: 'X', email: 'x@example.com', sendInvite: true },
      },
    })).rejects.toBeTruthy();
    expect(await Entity.findOne({ _id: entity._id, tenantId: tenant._id })).toMatchObject({
      managerEmail: '',
      managerUserId: null,
    });
    expect(inviteEmails).toEqual([]);
  });
});

function s256(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

async function login(email, password) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken;
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
    state: 'entities',
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

describe('department OAuth scopes', () => {
  it('requires a separate consent and stops working when the grant is revoked', async () => {
    expect(RESOURCE_SCOPES).not.toContain('entities:read');
    expect(RESOURCE_SCOPES).not.toContain('entities:write');
    const password = 'correct-horse-1';
    const email = 'admin-entity-setup@test.io';
    admin = await makeUser(tenant, 'company_admin', 'tenant', { email, password });
    admin.token = await login(email, password);

    const anonymous = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const challenge = anonymous.headers['www-authenticate'] || '';
    expect(challenge).toContain('employees:read');
    expect(challenge).not.toContain('entities:read');
    expect(challenge).not.toContain('entities:write');
    const metadata = await request(app).get('/.well-known/oauth-protected-resource/mcp');
    expect(metadata.body.scopes_supported).not.toContain('entities:write');
    const discovery = await request(app).get('/.well-known/openid-configuration');
    expect(discovery.body.scopes_supported).toContain('entities:read');
    expect(discovery.body.scopes_supported).toContain('entities:write');

    const readOnly = await issueOauth(admin, 'wallets:read');
    const denied = await mcpRequest(readOnly, 'tools/call', {
      name: 'entities_list',
      arguments: {},
    });
    expect(denied.status).toBe(403);

    const writeToken = await issueOauth(admin, 'entities:read entities:write');
    const listed = await mcpRequest(writeToken, 'tools/list');
    expect(listed.status).toBe(200);
    const body = listed.body?.result || JSON.parse(String(listed.text).split('\n').find((line) => line.startsWith('data: '))?.slice(6) || '{}').result;
    const names = body.tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining([
      'entities_list',
      'entities_prepare_setup',
      'entities_execute_setup',
      'entities_prepare_assign_manager',
      'entities_execute_assign_manager',
      'budget_prepare_allocation',
      'budget_execute_allocation',
      'employees_prepare_create',
      'shops_prepare_create',
      'campaigns_prepare_launch',
    ]));

    await revokeOauthGrantsForUser(admin.user._id, { tenantId: tenant._id });
    const revoked = await mcpRequest(writeToken, 'tools/call', { name: 'entities_list', arguments: {} });
    expect(revoked.status).toBe(401);
    expect(await OauthGrantBinding.countDocuments({ userId: admin.user._id })).toBe(0);
  });
});
