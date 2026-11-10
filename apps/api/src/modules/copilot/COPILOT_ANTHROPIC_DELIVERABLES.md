# Embedded Copilot — Anthropic Claude Provider

## Architecture

```text
React Copilot (unchanged SSE contract)
        |
Copilot Chat API
        |
resolveCopilotProviderStatus (COPILOT_AI_PROVIDER)
   /                    \
OpenAI adapter      Anthropic adapter
   \                    /
Shared tool orchestrator (listOpenAiToolsForRole + runCopilotTool)
        |
Existing MCP *ForCaller handlers
```

Provider-specific message / tool formats stay inside adapters. The 67 MCP tools are not duplicated.

## Environment

```env
EMBEDDED_COPILOT_ENABLED=true
COPILOT_AI_PROVIDER=anthropic   # or openai
ANTHROPIC_API_KEY=...           # backend only
ANTHROPIC_MODEL=claude-sonnet-5-5
# OpenAI remains available:
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
```

- Missing credentials for the **selected** provider return `PROVIDER_DISABLED`.
- Never silently falls back to the other provider.
- WRITE flags remain default `false`. Do not enable against Atlas.

## Files changed

- `copilotAiProvider.js` — provider selection
- `providers/openaiChatAdapter.js` — OpenAI streaming + tools
- `providers/anthropicChatAdapter.js` — Claude Messages streaming + tool_use/tool_result
- `copilotChat.service.js` — shared orchestration
- `copilotCapabilities.js` / `copilot.controller.js` — status + abort signal
- `copilotUsage.service.js` / model — provider-aware usage estimates
- `copilotConversation.model.js` — store `toolCalls` for multi-turn continuity
- `env.js` — `COPILOT_AI_PROVIDER`, max output tokens, pricing knobs
- `tests/copilot-anthropic-provider.test.js`

## Tool calling

- Claude receives the same authorized READ + enabled PREPARE tools as OpenAI.
- EXECUTE tools are never model-visible.
- Every `tool_use` gets a matching `tool_result` before the next model turn.
- Invalid / unauthorized tool names are rejected by `runCopilotTool` and returned as tool errors (conversation continues).

## Streaming

Existing SSE event types unchanged: `delta`, `tool`, `artifacts`, `done`, `error`.

## Tests

`tests/copilot-anthropic-provider.test.js` (15) + existing Copilot suites — all passing with mocked Anthropic (no live API key required).

## First live Claude READ test (manual)

1. Keep all `EMBEDDED_COPILOT_WRITE_*=false` while `MONGO_URL` is Atlas.
2. In `apps/api/.env` set:
   - `COPILOT_AI_PROVIDER=anthropic`
   - `ANTHROPIC_API_KEY=<company key>`
   - `ANTHROPIC_MODEL=claude-sonnet-5-5` (or another id from `GET https://api.anthropic.com/v1/models`)
   - `EMBEDDED_COPILOT_ENABLED=true`
3. Restart the API. Open Copilot as company admin.
4. Ask READ-only prompts only:
   - "Show me five apparel products with prices."
   - "Show my customized kits."
   - "Show my available department budget."
   - "Find employees in my department."
5. Confirm SSE deltas, tool events, and real catalog/workspace data.
6. Do **not** enable write flags or run financial WRITE prompts against Atlas.

Optional model check (non-generation):
`curl https://api.anthropic.com/v1/models -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01"`
