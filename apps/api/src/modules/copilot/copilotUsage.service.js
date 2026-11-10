import { env } from '../../config/env.js';
import { ApiError } from '../../utils/errors.js';
import { CopilotUsage } from './copilotUsage.model.js';

function utcDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/** Rough USD estimate for logging only — not billing. Provider-specific rates. */
export function estimateCostUsd(promptTokens, completionTokens, provider = 'openai') {
  const inputPerM =
    provider === 'anthropic'
      ? env.EMBEDDED_COPILOT_ANTHROPIC_INPUT_USD_PER_MTOK
      : env.EMBEDDED_COPILOT_OPENAI_INPUT_USD_PER_MTOK;
  const outputPerM =
    provider === 'anthropic'
      ? env.EMBEDDED_COPILOT_ANTHROPIC_OUTPUT_USD_PER_MTOK
      : env.EMBEDDED_COPILOT_OPENAI_OUTPUT_USD_PER_MTOK;
  return Number(
    ((promptTokens / 1_000_000) * inputPerM + (completionTokens / 1_000_000) * outputPerM).toFixed(6),
  );
}

export async function assertWithinQuota({ tenantId, userId }) {
  const day = utcDay();
  const [userRow, tenantAgg] = await Promise.all([
    CopilotUsage.findOne({ day, tenantId, userId }).lean(),
    CopilotUsage.aggregate([
      { $match: { day, tenantId } },
      { $group: { _id: null, total: { $sum: '$totalTokens' } } },
    ]),
  ]);
  const userTokens = userRow?.totalTokens ?? 0;
  const tenantTokens = tenantAgg[0]?.total ?? 0;
  if (userTokens >= env.EMBEDDED_COPILOT_DAILY_USER_TOKENS) {
    throw new ApiError(
      429,
      `ShelfMerch Copilot daily token limit reached for this user (${userTokens.toLocaleString('en-US')} / ${env.EMBEDDED_COPILOT_DAILY_USER_TOKENS.toLocaleString('en-US')} tokens). This is ShelfMerch's internal quota, not an Anthropic or OpenAI API rate limit. It resets at 00:00 UTC.`,
      'COPILOT_USER_QUOTA',
    );
  }
  if (tenantTokens >= env.EMBEDDED_COPILOT_DAILY_TENANT_TOKENS) {
    throw new ApiError(
      429,
      `ShelfMerch Copilot daily token limit reached for this workspace (${tenantTokens.toLocaleString('en-US')} / ${env.EMBEDDED_COPILOT_DAILY_TENANT_TOKENS.toLocaleString('en-US')} tokens). This is ShelfMerch's internal quota, not an Anthropic or OpenAI API rate limit. It resets at 00:00 UTC.`,
      'COPILOT_TENANT_QUOTA',
    );
  }
  return {
    day,
    userTokens,
    tenantTokens,
    userLimit: env.EMBEDDED_COPILOT_DAILY_USER_TOKENS,
    tenantLimit: env.EMBEDDED_COPILOT_DAILY_TENANT_TOKENS,
  };
}

export async function recordUsage({
  tenantId,
  userId,
  promptTokens = 0,
  completionTokens = 0,
  provider = 'openai',
  model = null,
  toolCallCount = 0,
  latencyMs = 0,
}) {
  const day = utcDay();
  const totalTokens = promptTokens + completionTokens;
  const estimatedCostUsd = estimateCostUsd(promptTokens, completionTokens, provider);
  await CopilotUsage.findOneAndUpdate(
    { day, tenantId, userId },
    {
      $inc: {
        promptTokens,
        completionTokens,
        totalTokens,
        requestCount: 1,
        estimatedCostUsd,
        toolCallCount,
      },
      $set: {
        lastProvider: provider,
        lastModel: model,
        lastLatencyMs: latencyMs,
      },
    },
    { upsert: true, new: true },
  );
  return { promptTokens, completionTokens, totalTokens, estimatedCostUsd, provider, model };
}
