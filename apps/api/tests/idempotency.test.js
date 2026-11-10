import { describe, it, expect, vi, beforeEach } from 'vitest';

const redisMock = {
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
};

vi.mock('../src/config/redis.js', () => ({
  ensureRedisReady: vi.fn(),
  getRedis: () => redisMock,
}));

import { ensureRedisReady } from '../src/config/redis.js';
import {
  beginIdempotency,
  buildIdempotencyKey,
  completeIdempotency,
  releaseIdempotency,
} from '../src/services/idempotency.service.js';

describe('idempotency service', () => {
  const scope = { key: 'fund-once', tenantId: 'tenant1', userId: 'user1' };

  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.set.mockReset();
    redisMock.get.mockReset();
    redisMock.del.mockReset();
  });

  it('builds a stable Redis key from scope parts', () => {
    expect(buildIdempotencyKey(scope)).toBe('idempotency:fund-once:tenant1:user1');
    expect(buildIdempotencyKey({ key: 'x', tenantId: null, userId: null })).toBe('idempotency:x:_:_');
  });

  it('reserves a new key in Redis', async () => {
    ensureRedisReady.mockResolvedValue(true);
    redisMock.set.mockResolvedValue('OK');

    const result = await beginIdempotency(scope);
    expect(result).toEqual({ action: 'proceed' });
    expect(redisMock.set).toHaveBeenCalledWith(
      'idempotency:fund-once:tenant1:user1',
      '__pending__',
      'NX',
      'EX',
      86400,
    );
  });

  it('replays a completed Redis response', async () => {
    ensureRedisReady.mockResolvedValue(true);
    redisMock.set.mockResolvedValue(null);
    redisMock.get.mockResolvedValue(JSON.stringify({ statusCode: 201, response: { ok: true } }));

    const result = await beginIdempotency(scope);
    expect(result).toEqual({ action: 'replay', statusCode: 201, response: { ok: true } });
  });

  it('resumes an expired recoverable reservation and keeps a live one in flight', async () => {
    ensureRedisReady.mockResolvedValue(true);
    redisMock.set.mockResolvedValue(null);
    redisMock.get.mockImplementation((key) => {
      if (String(key).endsWith(':lease')) return JSON.stringify({ expiresAt: Date.now() - 1000 });
      return '__pending__';
    });
    await expect(beginIdempotency(scope, { recover: true })).resolves.toEqual({ action: 'proceed' });

    redisMock.get.mockImplementation((key) => {
      if (String(key).endsWith(':lease')) return JSON.stringify({ expiresAt: Date.now() + 60_000 });
      return '__pending__';
    });
    await expect(beginIdempotency(scope, { recover: true })).resolves.toEqual({ action: 'in_flight' });
  });

  it('detects in-flight Redis requests', async () => {
    ensureRedisReady.mockResolvedValue(true);
    redisMock.set.mockResolvedValue(null);
    redisMock.get.mockResolvedValue('__pending__');

    const result = await beginIdempotency(scope);
    expect(result).toEqual({ action: 'in_flight' });
  });

  it('stores completed responses in Redis', async () => {
    ensureRedisReady.mockResolvedValue(true);
    await completeIdempotency(scope, { statusCode: 201, response: { funded: true } });
    expect(redisMock.set).toHaveBeenCalledWith(
      'idempotency:fund-once:tenant1:user1',
      JSON.stringify({ statusCode: 201, response: { funded: true } }),
      'EX',
      86400,
    );
  });

  it('releases failed requests from Redis', async () => {
    ensureRedisReady.mockResolvedValue(true);
    await releaseIdempotency(scope);
    expect(redisMock.del).toHaveBeenCalledWith('idempotency:fund-once:tenant1:user1');
  });
});
