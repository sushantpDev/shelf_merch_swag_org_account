import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { BUILT_IN_PLATFORM_TEAM } from '../src/modules/platform/platformTeamDefaults.js';
import { ensureBuiltInPlatformTeam } from '../src/modules/platform/team.service.js';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

describe('built-in platform team bootstrap', () => {
  it('creates every built-in assignee and remains idempotent', async () => {
    await ensureBuiltInPlatformTeam();
    await ensureBuiltInPlatformTeam();

    const emails = BUILT_IN_PLATFORM_TEAM.map((member) => member.email);
    const users = await User.find({ email: { $in: emails } }).lean();
    const assignments = await RoleAssignment.find({
      tenantId: null,
      scopeType: 'platform',
      userId: { $in: users.map((user) => user._id) },
    }).lean();

    expect(users).toHaveLength(BUILT_IN_PLATFORM_TEAM.length);
    expect(assignments).toHaveLength(BUILT_IN_PLATFORM_TEAM.length);
    for (const member of BUILT_IN_PLATFORM_TEAM) {
      const user = users.find((item) => item.email === member.email);
      const assignment = assignments.find((item) => String(item.userId) === String(user?._id));
      expect(user?.name).toBe(member.name);
      expect(user?.status).toBe('active');
      expect(assignment?.role).toBe(member.role);
    }
  });

  it('does not overwrite an existing built-in account or assignment', async () => {
    const user = await User.create({
      tenantId: null,
      name: 'Existing Admin',
      email: 'admin@shelfmerch.io',
      status: 'suspended',
    });
    await RoleAssignment.create({
      tenantId: null,
      userId: user._id,
      role: 'platform_ops_admin',
      scopeType: 'platform',
    });

    await ensureBuiltInPlatformTeam();

    const unchangedUser = await User.findById(user._id).lean();
    const unchangedAssignment = await RoleAssignment.findOne({ userId: user._id }).lean();
    expect(unchangedUser?.name).toBe('Existing Admin');
    expect(unchangedUser?.status).toBe('suspended');
    expect(unchangedAssignment?.role).toBe('platform_ops_admin');
  });
});
