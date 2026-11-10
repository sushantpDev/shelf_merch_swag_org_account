import { env } from '../../config/env.js';

/**
 * Resolve the configured Copilot AI provider.
 * Never silently falls back to another provider when credentials are missing.
 */
export function resolveCopilotProviderStatus() {
  const selected = env.COPILOT_AI_PROVIDER === 'anthropic' ? 'anthropic' : 'openai';

  if (selected === 'anthropic') {
    const configured = Boolean(env.ANTHROPIC_API_KEY?.trim());
    const model = (env.ANTHROPIC_MODEL || 'claude-sonnet-5-5').trim() || 'claude-sonnet-5-5';
    return {
      selected,
      provider: configured ? 'anthropic' : 'disabled',
      model: configured ? model : null,
      missingCredential: configured ? null : 'ANTHROPIC_API_KEY',
    };
  }

  const configured = Boolean(env.OPENAI_API_KEY?.trim());
  return {
    selected,
    provider: configured ? 'openai' : 'disabled',
    model: configured ? env.OPENAI_MODEL : null,
    missingCredential: configured ? null : 'OPENAI_API_KEY',
  };
}

/** Back-compat alias used by older status callers/tests. */
export function openaiProviderStatus() {
  const status = resolveCopilotProviderStatus();
  return {
    provider: status.provider,
    model: status.model,
  };
}

export function providerDisabledMessage(status = resolveCopilotProviderStatus()) {
  if (status.selected === 'anthropic') {
    return 'AI provider is not configured. Set ANTHROPIC_API_KEY to enable Claude for the copilot.';
  }
  return 'AI provider is not configured. Set OPENAI_API_KEY to enable the copilot.';
}
