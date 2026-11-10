import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { Contact } from '../src/modules/contacts/contact.model.js';
import { signAccessToken } from '../src/modules/auth/auth.service.js';
import { ZohoIntegration } from '../src/modules/integrations/zoho/zohoIntegration.model.js';
import { clearMemoryOAuthStates } from '../src/modules/integrations/zoho/zohoOAuthState.service.js';
import { encryptToken } from '../src/utils/tokenEncryption.js';
import * as envModule from '../src/config/env.js';
import { syncZohoEmployees } from '../src/modules/integrations/zoho/zohoSync.service.js';

let app;
let tenant;
let admin;
let adminToken;
let managerToken;

async function makeUser(role, scopeType) {
  const user = await User.create({
    tenantId: tenant._id,
    name: `${role} user`,
    email: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.io`,
    status: 'active',
  });
  const assignment = await RoleAssignment.create({
    tenantId: tenant._id,
    userId: user._id,
    role,
    scopeType,
  });
  return { user, token: signAccessToken(user, assignment) };
}

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
  vi.spyOn(envModule, 'zohoPeopleConfigured').mockReturnValue(true);
  envModule.env.ZOHO_CLIENT_ID = 'test-zoho-client';
  envModule.env.ZOHO_CLIENT_SECRET = 'test-zoho-secret';
  envModule.env.ZOHO_REDIRECT_URI = 'https://shelfmerch.io/api/integrations/zoho/callback';
  envModule.env.ZOHO_ACCOUNTS_URL = 'https://accounts.zoho.in';
  envModule.env.TOKEN_ENCRYPTION_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  envModule.env.APP_URL = 'http://localhost:8080';
  envModule.env.BASE_URL = 'http://localhost:8080';
});

afterAll(async () => {
  vi.restoreAllMocks();
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  clearMemoryOAuthStates();
  tenant = await Tenant.create({ name: 'Rubix', slug: 'rubix-zoho' });
  ({ user: admin, token: adminToken } = await makeUser('company_admin', 'tenant'));
  ({ token: managerToken } = await makeUser('entity_manager', 'entity'));
});

describe('Zoho People connect / callback / disconnect', () => {
  it('GET /connect requires authentication', async () => {
    const res = await request(app).get('/api/integrations/zoho/connect');
    expect(res.status).toBe(401);
  });

  it('GET /connect rejects entity managers (admin-only write)', async () => {
    const res = await request(app)
      .get('/api/integrations/zoho/connect')
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(403);
  });

  it('GET /connect redirects company admin to Zoho Accounts with state cookie', async () => {
    const res = await request(app)
      .get('/api/integrations/zoho/connect')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^https:\/\/accounts\.zoho\.in\/oauth\/v2\/auth\?/);
    const loc = new URL(res.headers.location);
    expect(loc.searchParams.get('client_id')).toBe('test-zoho-client');
    expect(loc.searchParams.get('response_type')).toBe('code');
    expect(loc.searchParams.get('access_type')).toBe('offline');
    expect(loc.searchParams.get('prompt')).toBe('consent');
    expect(loc.searchParams.get('scope')).toBe(
      'ZOHOPEOPLE.forms.READ,ZOHOPEOPLE.organization.READ',
    );
    expect(loc.searchParams.get('state')).toBeTruthy();
    expect(loc.searchParams.get('redirect_uri')).toBe(envModule.env.ZOHO_REDIRECT_URI);
    expect(res.headers.location).toContain('redirect_uri=https%3A%2F%2F');
    expect(res.headers.location).not.toContain('%253A');

    const setCookie = res.headers['set-cookie'] || [];
    expect(setCookie.some((c) => c.startsWith('zoho_oauth_state='))).toBe(true);
    expect(res.headers.location).not.toContain('test-zoho-secret');
  });

  it('GET /callback rejects invalid state', async () => {
    const res = await request(app)
      .get('/api/integrations/zoho/callback')
      .query({ code: 'abc', state: 'not-a-real-state-value-xxxxxxxxxx' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('zoho=error');
  });

  it('GET /callback handles permission denial', async () => {
    const res = await request(app)
      .get('/api/integrations/zoho/callback')
      .query({ error: 'access_denied', state: 'whatever' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('zoho=error');
    expect(res.headers.location).toContain('reason=denied');
  });

  it('DELETE /disconnect clears tokens and marks disconnected', async () => {
    await ZohoIntegration.create({
      tenantId: tenant._id,
      connectedByUserId: admin._id,
      zohoOrganizationId: 'org-1',
      zohoOrganizationName: 'Rubix Org',
      encryptedAccessToken: encryptToken('access-plain'),
      encryptedRefreshToken: encryptToken('refresh-plain'),
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      apiDomain: 'https://www.zohoapis.in',
      zohoLocation: 'in',
      status: 'connected',
      connectedAt: new Date(),
    });

    const fetchMock = vi.fn(async (url, init) => {
      expect(String(url)).toBe('https://accounts.zoho.in/oauth/v2/revoke/token');
      expect(String(url)).not.toContain('refresh-plain');
      expect(String(init.headers.Authorization || init.headers.authorization)).toMatch(/^Basic /);
      expect(String(init.body)).toContain('token_type=refresh_token');
      expect(String(init.body)).toContain('refresh-plain');
      return new Response(JSON.stringify({ status: 'success' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(app)
      .delete('/api/integrations/zoho/disconnect')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(fetchMock).toHaveBeenCalled();
    vi.unstubAllGlobals();

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('not_connected');
    expect(JSON.stringify(res.body)).not.toContain('access-plain');

    const doc = await ZohoIntegration.findOne({ tenantId: tenant._id });
    expect(doc.status).toBe('disconnected');
    expect(doc.encryptedAccessToken).toBe('');
    expect(doc.encryptedRefreshToken).toBe('');
  });

  it('GET /status never returns tokens', async () => {
    await ZohoIntegration.create({
      tenantId: tenant._id,
      connectedByUserId: admin._id,
      zohoOrganizationId: '89740123',
      zohoOrganizationName: 'Rubix Org',
      encryptedAccessToken: encryptToken('access-plain'),
      encryptedRefreshToken: encryptToken('refresh-plain'),
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      apiDomain: 'https://www.zohoapis.in',
      zohoLocation: 'in',
      status: 'connected',
      connectedAt: new Date(),
    });

    const res = await request(app)
      .get('/api/integrations/zoho/status')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('connected');
    expect(res.body.integration.zohoOrganizationName).toBe('Rubix Org');
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('access-plain');
    expect(raw).not.toContain('refresh-plain');
    expect(raw).not.toContain('encryptedAccessToken');
  });

  it('GET /status requires authentication', async () => {
    const res = await request(app).get('/api/integrations/zoho/status');
    expect(res.status).toBe(401);
  });

  it('GET /status is tenant-scoped (does not leak another tenant connection)', async () => {
    const otherTenant = await Tenant.create({ name: 'Acme Zoho', slug: 'acme-zoho' });
    await ZohoIntegration.create({
      tenantId: otherTenant._id,
      connectedByUserId: admin._id,
      zohoOrganizationName: 'Secret Other Org',
      encryptedAccessToken: encryptToken('other-access'),
      encryptedRefreshToken: encryptToken('other-refresh'),
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      apiDomain: 'https://www.zohoapis.in',
      zohoLocation: 'in',
      status: 'connected',
      connectedAt: new Date(),
    });

    const res = await request(app)
      .get('/api/integrations/zoho/status')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('not_connected');
    expect(res.body.integration).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain('Secret Other Org');
  });

  it('GET /status returns connected for legacy needs_attention rows with organisation id', async () => {
    await ZohoIntegration.create({
      tenantId: tenant._id,
      connectedByUserId: admin._id,
      zohoOrganizationId: '89740123',
      zohoOrganizationName: 'Chitlu Innovations Private Limited',
      encryptedAccessToken: encryptToken('access-plain'),
      encryptedRefreshToken: encryptToken('refresh-plain'),
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      apiDomain: 'https://www.zohoapis.in',
      zohoLocation: 'in',
      status: 'needs_attention',
      connectedAt: new Date(),
      lastError: '',
    });

    const res = await request(app)
      .get('/api/integrations/zoho/status')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('connected');
    expect(res.body.integration.zohoOrganizationName).toBe('Chitlu Innovations Private Limited');
  });

  it('GET /status returns needs_attention for refresh-token failure', async () => {
    await ZohoIntegration.create({
      tenantId: tenant._id,
      connectedByUserId: admin._id,
      zohoOrganizationId: '89740123',
      encryptedAccessToken: encryptToken('access-plain'),
      encryptedRefreshToken: encryptToken('refresh-plain'),
      accessTokenExpiresAt: new Date(Date.now() - 3600_000),
      apiDomain: 'https://www.zohoapis.in',
      zohoLocation: 'in',
      status: 'expired',
      connectedAt: new Date(),
      lastError: 'Token refresh failed',
    });

    const res = await request(app)
      .get('/api/integrations/zoho/status')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('needs_attention');
  });
});

describe('Zoho employee sync upsert', () => {
  it('creates on first sync and updates on second without duplicates', async () => {
    await ZohoIntegration.create({
      tenantId: tenant._id,
      connectedByUserId: admin._id,
      zohoOrganizationId: '89740123',
      zohoOrganizationName: '',
      encryptedAccessToken: encryptToken('access-plain'),
      encryptedRefreshToken: encryptToken('refresh-plain'),
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      apiDomain: 'https://www.zohoapis.in',
      zohoLocation: 'in',
      status: 'connected',
      connectedAt: new Date(),
    });

    const nestedPayload = {
      response: {
        result: [
          {
            '1001': [
              {
                Zoho_ID: 1001,
                EmployeeID: 'E1',
                FirstName: 'Ada',
                LastName: 'Lovelace',
                EmailID: 'ada@example.com',
              },
            ],
          },
        ],
        message: 'Data fetched successfully',
        status: 0,
      },
    };

    const orgPayload = {
      Company: '89740123',
      ContactPerson: 'Anonymous',
      TimeZone: 'Asia/Kolkata',
    };

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const payload = url.includes('/api/v3/organization') ? orgPayload : nestedPayload;
      return { ok: true, status: 200, json: async () => payload };
    });

    try {
      const first = await syncZohoEmployees(tenant._id);
      expect(first.created).toBe(1);
      expect(first.updated).toBe(0);
      expect(first.skipped).toBe(0);
      expect(first.totalFetched).toBe(1);
      expect(await Contact.countDocuments({ tenantId: tenant._id })).toBe(1);

      const second = await syncZohoEmployees(tenant._id);
      expect(second.created).toBe(0);
      expect(second.updated).toBe(1);
      expect(await Contact.countDocuments({ tenantId: tenant._id })).toBe(1);

      const contact = await Contact.findOne({ tenantId: tenant._id, zohoRecordId: '1001' });
      expect(contact.email).toBe('ada@example.com');
      expect(contact.source).toBe('hris');

      const integ = await ZohoIntegration.findOne({ tenantId: tenant._id });
      expect(integ.zohoOrganizationId).toBe('89740123');
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('reports skip reason when zoho record id is missing', async () => {
    await ZohoIntegration.create({
      tenantId: tenant._id,
      connectedByUserId: admin._id,
      encryptedAccessToken: encryptToken('access-plain'),
      encryptedRefreshToken: encryptToken('refresh-plain'),
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      apiDomain: 'https://www.zohoapis.in',
      zohoLocation: 'in',
      status: 'connected',
      connectedAt: new Date(),
    });

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/v3/organization')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ Company: '89740123', ContactPerson: 'Anonymous' }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          response: {
            result: [{ FirstName: 'NoId', EmailID: 'noid@example.com' }],
            status: 0,
          },
        }),
      };
    });

    try {
      const summary = await syncZohoEmployees(tenant._id);
      expect(summary.created).toBe(0);
      expect(summary.skipped).toBe(1);
      expect(summary.skippedByReason.MISSING_ZOHO_RECORD_ID).toBe(1);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
