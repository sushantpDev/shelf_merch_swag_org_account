import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/env.js', () => ({
  env: {
    EMBEDDED_COPILOT_DAILY_USER_TOKENS: 1000,
    EMBEDDED_COPILOT_DAILY_TENANT_TOKENS: 5000,
    EMBEDDED_COPILOT_OPENAI_INPUT_USD_PER_MTOK: 0.4,
    EMBEDDED_COPILOT_OPENAI_OUTPUT_USD_PER_MTOK: 1.6,
    EMBEDDED_COPILOT_ANTHROPIC_INPUT_USD_PER_MTOK: 2,
    EMBEDDED_COPILOT_ANTHROPIC_OUTPUT_USD_PER_MTOK: 10,
  },
}));

const findOne = vi.fn();
const aggregate = vi.fn();

vi.mock('../src/modules/copilot/copilotUsage.model.js', () => ({
  CopilotUsage: {
    findOne: (...args) => findOne(...args),
    aggregate: (...args) => aggregate(...args),
    findOneAndUpdate: vi.fn(),
  },
}));

describe('copilot quota messaging', () => {
  beforeEach(() => {
    findOne.mockReset();
    aggregate.mockReset();
  });

  it('labels ShelfMerch user quota distinctly from provider rate limits', async () => {
    findOne.mockReturnValue({ lean: async () => ({ totalTokens: 1500 }) });
    aggregate.mockResolvedValue([{ total: 1500 }]);
    const { assertWithinQuota } = await import('../src/modules/copilot/copilotUsage.service.js');
    await expect(
      assertWithinQuota({ tenantId: 't1', userId: 'u1' }),
    ).rejects.toMatchObject({
      code: 'COPILOT_USER_QUOTA',
      message: expect.stringMatching(/ShelfMerch Copilot daily token limit.*not an Anthropic/i),
    });
  });
});
