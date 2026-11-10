import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { encryptToken } from '../src/utils/tokenEncryption.js';
import { ZohoIntegration } from '../src/modules/integrations/zoho/zohoIntegration.model.js';
import { Contact } from '../src/modules/contacts/contact.model.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { User } from '../src/modules/users/user.model.js';
import * as envModule from '../src/config/env.js';
import {
  classifyZohoRevokeResponse,
  disconnectZoho,
  retryUnresolvedZohoRevocation,
  revokeZohoRefreshToken,
} from '../src/modules/integrations/zoho/zohoToken.service.js';

beforeEach(async () => {
  await connectTestDb();
  await clearTestDb();
  envModule.env.ZOHO_CLIENT_ID = 'test-zoho-client';
  envModule.env.ZOHO_CLIENT_SECRET = 'test-zoho-secret';
  envModule.env.ZOHO_REDIRECT_URI = 'https://shelfmerch.io/api/integrations/zoho/callback';
  envModule.env.ZOHO_ACCOUNTS_URL = 'https://accounts.zoho.in';
  envModule.env.TOKEN_ENCRYPTION_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  vi.spyOn(envModule, 'zohoPeopleConfigured').mockReturnValue(true);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await disconnectTestDb();
});

describe('Zoho refresh token revocation', () => {
  it('posts the refresh token to the Accounts revoke endpoint and does not log it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const secret = 'refresh-secret-do-not-log';
    const fetchMock = vi.fn(async (_url, init) => {
      expect(String(init.body)).toContain(secret);
      return new Response(JSON.stringify({ status: 'success' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await revokeZohoRefreshToken(secret);
    expect(result).toMatchObject({ revoked: true, reason: 'revoked' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://accounts.zoho.in/oauth/v2/revoke/token');
    expect(String(url)).not.toContain(secret);
    const init = fetchMock.mock.calls[0][1];
    expect(String(init.headers.Authorization)).toMatch(/^Basic /);
    expect(String(init.body)).toContain('token_type=refresh_token');
    const logged = [warn, info, log].flatMap((spy) => spy.mock.calls).flat().join(' ');
    expect(logged).not.toContain(secret);
  });

  it('treats a 400 invalid_token body as already revoked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_token' }), { status: 400 })),
    );
    await expect(revokeZohoRefreshToken('gone')).resolves.toMatchObject({
      revoked: true,
      reason: 'already_invalid',
      errorCode: 'invalid_token',
    });
  });

  it('does not treat a bare HTTP 400 or client errors as successful revocation', () => {
    expect(classifyZohoRevokeResponse(400, null)).toMatchObject({
      revoked: false,
      reason: 'unconfirmed_client_response',
    });
    expect(classifyZohoRevokeResponse(400, { error: 'invalid_client' })).toMatchObject({
      revoked: false,
      reason: 'invalid_client',
    });
    expect(classifyZohoRevokeResponse(400, { error: 'invalid_request' })).toMatchObject({
      revoked: false,
      reason: 'invalid_request',
    });
    expect(classifyZohoRevokeResponse(401, { error: 'unauthorized_client' })).toMatchObject({
      revoked: false,
      reason: 'client_auth_failed',
    });
  });

  it('reports network failures without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    await expect(revokeZohoRefreshToken('still-secret')).resolves.toMatchObject({
      revoked: false,
      reason: 'network_error',
    });
  });

  it('clears local tokens after a failed revoke and keeps imported contacts', async () => {
    const tenant = await Tenant.create({ name: 'Revoke Co', slug: `revoke-${Date.now()}` });
    const user = await User.create({
      tenantId: tenant._id,
      name: 'Admin',
      email: `admin-${Date.now()}@test.io`,
      status: 'active',
    });
    await Contact.create({
      tenantId: tenant._id,
      name: 'Imported Person',
      email: 'imported@example.com',
      source: 'hris',
      zohoRecordId: 'zp-1',
    });
    await ZohoIntegration.create({
      tenantId: tenant._id,
      connectedByUserId: user._id,
      encryptedAccessToken: encryptToken('access-plain'),
      encryptedRefreshToken: encryptToken('refresh-plain'),
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      status: 'connected',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );

    const doc = await disconnectZoho(tenant._id);
    expect(doc.status).toBe('disconnected');
    expect(doc.encryptedAccessToken).toBe('');
    expect(doc.encryptedRefreshToken).not.toBe('');
    expect(doc.remoteAuthorization).toBe('unresolved');
    expect(doc.lastError).toBe('ZOHO_REVOKE_unexpected');
    expect(doc.lastError).not.toContain('refresh-plain');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ status: 'success' }), { status: 200 })),
    );
    const retried = await retryUnresolvedZohoRevocation(tenant._id);
    expect(retried).toMatchObject({ revoked: true, reason: 'revoked' });
    const cleared = await ZohoIntegration.findOne({ tenantId: tenant._id });
    expect(cleared.encryptedRefreshToken).toBe('');
    expect(cleared.remoteAuthorization).toBe('revoked');

    const contact = await Contact.findOne({ tenantId: tenant._id, zohoRecordId: 'zp-1' });
    expect(contact.email).toBe('imported@example.com');
    const other = await ZohoIntegration.find({ tenantId: { $ne: tenant._id } });
    expect(other).toHaveLength(0);
  });
});
