import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { Contact } from '../src/modules/contacts/contact.model.js';
import { signAccessToken } from '../src/modules/auth/auth.service.js';
import { MergeConnection } from '../src/modules/integrations/merge/mergeConnection.model.js';
import { MergeHrisEmployee } from '../src/modules/integrations/merge/models/mergeHrisEmployee.model.js';
import { ZohoIntegration } from '../src/modules/integrations/zoho/zohoIntegration.model.js';
import {
  isSyntheticZohoEmail,
  toZohoDirectoryEmployee,
  zohoContactDuplicatesMergeEmployee,
} from '../src/modules/integrations/zoho/zohoDirectoryEmployees.js';

const SYNCED_AT = '2026-10-29T06:30:00.000Z';

describe('Zoho directory employee mapping', () => {
  it('hides the synthetic employees.local address and ignores the default country', () => {
    expect(isSyntheticZohoEmail('zoho.42@employees.local')).toBe(true);
    const row = toZohoDirectoryEmployee(
      {
        _id: 'contact-1',
        name: 'Asha Rao',
        firstName: 'Asha',
        lastName: 'Rao',
        email: 'zoho.42@employees.local',
        designation: 'Designer',
        department: 'Studio',
        workLocation: 'Hyderabad',
        employmentStatus: 'Active',
        address: { country: 'IN' },
        updatedAt: SYNCED_AT,
      },
      { _id: 'zoho-1', status: 'connected', lastSyncedAt: SYNCED_AT },
    );
    expect(row.provider).toBe('zoho-people');
    expect(row.workEmail).toBe('');
    expect(row.country).toBe('');
    expect(row.locationName).toBe('Hyderabad');
    expect(row.effectiveEmploymentStatus).toBe('ACTIVE');
    expect(row.connectionStatus).toBe('connected');
  });

  it('skips a Zoho contact that is already listed from Merge', () => {
    expect(
      zohoContactDuplicatesMergeEmployee(
        { email: 'priya@example.com', mergeEmployeeId: '' },
        { emails: new Set(['priya@example.com']), mergeEmployeeIds: new Set() },
      ),
    ).toBe(true);
    expect(
      zohoContactDuplicatesMergeEmployee(
        { email: 'zoho.9@employees.local', mergeEmployeeId: 'merge-9' },
        { emails: new Set(), mergeEmployeeIds: new Set(['merge-9']) },
      ),
    ).toBe(true);
    expect(
      zohoContactDuplicatesMergeEmployee(
        { email: 'new@example.com', mergeEmployeeId: '' },
        { emails: new Set(['priya@example.com']), mergeEmployeeIds: new Set(['merge-9']) },
      ),
    ).toBe(false);
  });
});

describe('GET /api/integrations/merge/employees with Zoho People', () => {
  let app;
  let tenant;
  let otherTenant;
  let adminToken;
  let adminId;

  beforeAll(async () => {
    await connectTestDb();
    app = createApp();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    tenant = await Tenant.create({ name: 'Rubix', slug: `rubix-zoho-dir-${Date.now()}` });
    otherTenant = await Tenant.create({
      name: 'Other',
      slug: `other-zoho-dir-${Date.now()}`,
    });
    const admin = await User.create({
      tenantId: tenant._id,
      name: 'Admin',
      email: `admin-${Date.now()}@test.io`,
      status: 'active',
    });
    adminId = admin._id;
    const assignment = await RoleAssignment.create({
      tenantId: tenant._id,
      userId: admin._id,
      role: 'company_admin',
      scopeType: 'tenant',
    });
    adminToken = signAccessToken(admin, assignment);
  });

  async function connectZoho(status = 'connected') {
    return ZohoIntegration.create({
      tenantId: tenant._id,
      connectedByUserId: adminId,
      status,
      lastSyncedAt: new Date(SYNCED_AT),
    });
  }

  it('lists Zoho-synced contacts for the current workspace and keeps Merge employees', async () => {
    await connectZoho();
    const gusto = await MergeConnection.create({
      tenantId: tenant._id,
      connectedByUserId: adminId,
      provider: 'gusto',
      status: 'connected',
      lastSyncStatus: 'success',
      lastSyncAt: new Date(SYNCED_AT),
    });
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: gusto._id,
      provider: 'gusto',
      mergeEmployeeId: 'merge-priya',
      displayName: 'Priya Sharma',
      workEmail: 'priya@example.com',
      employmentStatus: 'ACTIVE',
      lastSyncedAt: new Date(SYNCED_AT),
      source: 'merge',
    });
    await Contact.create({
      tenantId: tenant._id,
      name: 'Asha Rao',
      firstName: 'Asha',
      lastName: 'Rao',
      email: 'asha@example.com',
      designation: 'Designer',
      employmentStatus: 'Active',
      zohoRecordId: 'zoho-asha',
      source: 'hris',
    });
    await Contact.create({
      tenantId: tenant._id,
      name: 'Priya Sharma',
      email: 'priya@example.com',
      zohoRecordId: 'zoho-priya',
      mergeEmployeeId: 'merge-priya',
      source: 'hris',
    });
    await Contact.create({
      tenantId: tenant._id,
      name: 'Manual Person',
      email: 'manual@example.com',
      source: 'manual',
    });
    const removed = await Contact.create({
      tenantId: tenant._id,
      name: 'Removed Person',
      email: 'removed@example.com',
      zohoRecordId: 'zoho-removed',
      source: 'hris',
    });
    await removed.softDelete();
    await Contact.create({
      tenantId: otherTenant._id,
      name: 'Other Workspace',
      email: 'other@example.com',
      zohoRecordId: 'zoho-other',
      source: 'hris',
    });

    const res = await request(app)
      .get('/api/integrations/merge/employees')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.directory).toMatchObject({
      state: 'connected',
      lastSuccessfulSyncAt: SYNCED_AT,
      retainSnapshot: false,
    });
    const names = res.body.employees.map((employee) => employee.displayName).sort();
    expect(names).toEqual(['Asha Rao', 'Priya Sharma']);
    const asha = res.body.employees.find((employee) => employee.displayName === 'Asha Rao');
    expect(asha.provider).toBe('zoho-people');
    expect(asha.effectiveEmploymentStatus).toBe('ACTIVE');
    expect(asha.workEmail).toBe('asha@example.com');
    expect(JSON.stringify(res.body)).not.toMatch(/encrypted|accessToken|refreshToken/i);

    const filtered = await request(app)
      .get(`/api/integrations/merge/employees?connectionId=${gusto._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(filtered.body.employees.map((employee) => employee.displayName)).toEqual(['Priya Sharma']);
  });

  it('treats a connected Zoho integration with no Merge connection as an active directory', async () => {
    await connectZoho();
    await Contact.create({
      tenantId: tenant._id,
      name: 'No Email',
      email: 'zoho.77@employees.local',
      employeeCode: '77',
      zohoRecordId: 'zoho-77',
      employmentStatus: 'Active',
      source: 'hris',
    });

    const res = await request(app)
      .get('/api/integrations/merge/employees')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.directory.state).toBe('connected');
    expect(res.body.employees).toHaveLength(1);
    expect(res.body.employees[0]).toMatchObject({
      displayName: 'No Email',
      provider: 'zoho-people',
      workEmail: '',
      connectionStatus: 'connected',
    });
  });
});
