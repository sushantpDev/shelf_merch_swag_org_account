import { describe, it, expect, vi, afterEach } from 'vitest';
import { logger } from '../src/config/logger.js';
import { logZohoEmployeeFetchDebug } from '../src/modules/integrations/zoho/zohoPeople.service.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Zoho employee fetch logging', () => {
  it('does not log employee bodies, emails, names, or tokens', () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const secretEmail = 'ada.lovelace@example.com';
    const secretName = 'Ada Lovelace';
    const token = '1000.access.token.value';

    logZohoEmployeeFetchDebug({
      phase: 'primary',
      requestUrl: `https://people.zoho.in/people/api/forms/employee/getRecords?authtoken=${token}`,
      httpStatus: 400,
      responseBody: {
        response: {
          result: [{ EmailID: secretEmail, FirstName: secretName, Mobile: '555-0100' }],
          errors: { code: 7021 },
        },
      },
      responseHeaders: { authorization: `Zoho-oauthtoken ${token}` },
      error: new Error(`failed for ${secretEmail}`),
    });

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledOnce();
    const payload = JSON.stringify(errorSpy.mock.calls);
    expect(payload).toContain('zoho_employee_fetch');
    expect(payload).toContain('7021');
    expect(payload).toContain('400');
    expect(payload).not.toContain(secretEmail);
    expect(payload).not.toContain(secretName);
    expect(payload).not.toContain('555-0100');
    expect(payload).not.toContain(token);
    expect(payload).not.toContain('result');
  });
});
