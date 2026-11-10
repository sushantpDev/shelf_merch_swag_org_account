import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { authHeader, makeTenant, makeUser } from './helpers.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import {
  resolveCopilotProviderStatus,
  providerDisabledMessage,
} from '../src/modules/copilot/copilotAiProvider.js';
import {
  toAnthropicMessages,
  toAnthropicTools,
  streamAnthropicCompletion,
  appendAnthropicAssistantToolTurn,
  appendAnthropicToolResults,
} from '../src/modules/copilot/providers/anthropicChatAdapter.js';
import { listOpenAiToolsForRole, runCopilotTool, registeredToolNames } from '../src/modules/copilot/copilotTools.js';
import { streamAssistantTurn } from '../src/modules/copilot/copilotChat.service.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';
import { buildCopilotToolCtx } from '../src/modules/copilot/buildCallerCtx.js';
import { estimateCostUsd } from '../src/modules/copilot/copilotUsage.service.js';
import * as anthropicAdapter from '../src/modules/copilot/providers/anthropicChatAdapter.js';
import * as openaiAdapter from '../src/modules/copilot/providers/openaiChatAdapter.js';

let app;
const prev = {
  enabled: env.EMBEDDED_COPILOT_ENABLED,
  provider: env.COPILOT_AI_PROVIDER,
  openaiKey: env.OPENAI_API_KEY,
  anthropicKey: env.ANTHROPIC_API_KEY,
  anthropicModel: env.ANTHROPIC_MODEL,
  writeStore: env.EMBEDDED_COPILOT_WRITE_STORE_CREATE,
};

beforeAll(async () => {
  env.EMBEDDED_COPILOT_ENABLED = 'true';
  env.OPENAI_API_KEY = '';
  env.ANTHROPIC_API_KEY = '';
  env.COPILOT_AI_PROVIDER = 'openai';
  await connectTestDb();
  app = createApp();
});

afterAll(async () => {
  Object.assign(env, {
    EMBEDDED_COPILOT_ENABLED: prev.enabled,
    COPILOT_AI_PROVIDER: prev.provider,
    OPENAI_API_KEY: prev.openaiKey,
    ANTHROPIC_API_KEY: prev.anthropicKey,
    ANTHROPIC_MODEL: prev.anthropicModel,
    EMBEDDED_COPILOT_WRITE_STORE_CREATE: prev.writeStore,
  });
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  clearTenantLimitCache();
  env.EMBEDDED_COPILOT_ENABLED = 'true';
  env.OPENAI_API_KEY = '';
  env.ANTHROPIC_API_KEY = '';
  env.COPILOT_AI_PROVIDER = 'openai';
  env.EMBEDDED_COPILOT_WRITE_STORE_CREATE = 'false';
  env.ANTHROPIC_MODEL = 'claude-sonnet-5-5';
  vi.restoreAllMocks();
});

describe('Copilot Anthropic provider selection', () => {
  it('selects anthropic when configured with ANTHROPIC_API_KEY', () => {
    env.COPILOT_AI_PROVIDER = 'anthropic';
    env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const status = resolveCopilotProviderStatus();
    expect(status).toMatchObject({
      selected: 'anthropic',
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
    });
  });

  it('returns PROVIDER_DISABLED for anthropic without silently switching to openai', () => {
    env.COPILOT_AI_PROVIDER = 'anthropic';
    env.ANTHROPIC_API_KEY = '';
    env.OPENAI_API_KEY = 'sk-openai-present';
    const status = resolveCopilotProviderStatus();
    expect(status.provider).toBe('disabled');
    expect(status.selected).toBe('anthropic');
    expect(providerDisabledMessage(status)).toContain('ANTHROPIC_API_KEY');
  });

  it('keeps openai selected and disabled when openai key missing', () => {
    env.COPILOT_AI_PROVIDER = 'openai';
    env.OPENAI_API_KEY = '';
    env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const status = resolveCopilotProviderStatus();
    expect(status.selected).toBe('openai');
    expect(status.provider).toBe('disabled');
  });

  it('status endpoint reports selectedProvider for anthropic', async () => {
    env.COPILOT_AI_PROVIDER = 'anthropic';
    env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin');
    const res = await request(app).get('/api/v1/copilot/status').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.selectedProvider).toBe('anthropic');
    expect(res.body.provider).toBe('anthropic');
    expect(res.body.model).toBe('claude-sonnet-5-5');
  });

  it('chat returns PROVIDER_DISABLED when Claude key is missing', async () => {
    env.COPILOT_AI_PROVIDER = 'anthropic';
    env.ANTHROPIC_API_KEY = '';
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin');
    const created = await request(app)
      .post('/api/v1/copilot/conversations')
      .set(authHeader(token))
      .send({});
    const res = await request(app)
      .post(`/api/v1/copilot/conversations/${created.body.id}/messages`)
      .set(authHeader(token))
      .send({ content: 'Show apparel products' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('PROVIDER_DISABLED');
    expect(res.text).toContain('ANTHROPIC_API_KEY');
  });
});

describe('Claude tool translation', () => {
  it('maps OpenAI tool schemas into Anthropic input_schema tools', () => {
    const tools = listOpenAiToolsForRole('company_admin');
    const anthropicTools = toAnthropicTools(tools);
    expect(anthropicTools.length).toBe(tools.length);
    expect(anthropicTools[0]).toEqual(
      expect.objectContaining({
        name: expect.any(String),
        description: expect.any(String),
        input_schema: expect.objectContaining({ type: 'object' }),
      }),
    );
    expect(anthropicTools.every((t) => !String(t.name).includes('execute'))).toBe(true);
  });

  it('never exposes EXECUTE tools to the model tool list', () => {
    env.EMBEDDED_COPILOT_WRITE_STORE_CREATE = 'true';
    const names = listOpenAiToolsForRole('company_admin').map((t) => t.function.name);
    expect(names).toContain('shops_prepare_create');
    expect(names).not.toContain('shops_execute_create');
    expect(registeredToolNames()).toEqual(
      expect.arrayContaining(['shops_prepare_create', 'shops_execute_create']),
    );
  });

  it('converts multi-turn history including tool_use/tool_result blocks', () => {
    const converted = toAnthropicMessages([
      { role: 'user', content: 'Show apparel' },
      {
        role: 'assistant',
        content: 'Looking that up.',
        toolCalls: [{ id: 'toolu_1', name: 'catalog_search', arguments: '{"category":"Apparel"}' }],
      },
      {
        role: 'tool',
        toolCallId: 'toolu_1',
        toolName: 'catalog_search',
        content: '{"items":[]}',
      },
      { role: 'assistant', content: 'No apparel matched.' },
    ]);
    expect(converted[0]).toEqual({ role: 'user', content: 'Show apparel' });
    expect(converted[1].role).toBe('assistant');
    expect(converted[1].content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'tool_use', id: 'toolu_1', name: 'catalog_search' }),
      ]),
    );
    expect(converted[2]).toEqual({
      role: 'user',
      content: [expect.objectContaining({ type: 'tool_result', tool_use_id: 'toolu_1' })],
    });
  });

  it('parses streamed Claude tool_use blocks via mocked SDK stream', async () => {
    const events = [
      {
        type: 'message_start',
        message: { usage: { input_tokens: 12, output_tokens: 0 } },
      },
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Checking catalog.' },
      },
      {
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'tool_use', id: 'toolu_abc', name: 'catalog_search' },
      },
      {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '{"category":"Apparel","limit":5}' },
      },
      {
        type: 'message_delta',
        delta: { stop_reason: 'tool_use' },
        usage: { output_tokens: 20 },
      },
    ];

    const client = {
      messages: {
        stream() {
          return {
            async *[Symbol.asyncIterator]() {
              for (const event of events) yield event;
            },
            async finalMessage() {
              return {
                stop_reason: 'tool_use',
                usage: { input_tokens: 12, output_tokens: 20 },
                content: [
                  { type: 'text', text: 'Checking catalog.' },
                  {
                    type: 'tool_use',
                    id: 'toolu_abc',
                    name: 'catalog_search',
                    input: { category: 'Apparel', limit: 5 },
                  },
                ],
              };
            },
            abort() {},
          };
        },
      },
    };

    const deltas = [];
    const result = await streamAnthropicCompletion({
      client,
      systemPrompt: 'test',
      messages: [{ role: 'user', content: 'Show apparel' }],
      tools: listOpenAiToolsForRole('company_admin'),
      onTextDelta: (t) => deltas.push(t),
    });
    expect(deltas.join('')).toBe('Checking catalog.');
    expect(result.toolCalls).toEqual([
      {
        id: 'toolu_abc',
        name: 'catalog_search',
        arguments: JSON.stringify({ category: 'Apparel', limit: 5 }),
      },
    ]);
    expect(result.usage.promptTokens).toBe(12);
    expect(result.usage.completionTokens).toBe(20);
  });

  it('appends tool results so every tool_use gets a tool_result', () => {
    const messages = [];
    appendAnthropicAssistantToolTurn(messages, {
      text: '',
      toolCalls: [{ id: 'toolu_1', name: 'kits_list', arguments: '{}' }],
    });
    appendAnthropicToolResults(messages, [
      { toolCallId: 'toolu_1', content: '{"items":[]}', isError: false },
    ]);
    expect(messages[1].content[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'toolu_1',
    });
  });
});

describe('Claude streamAssistantTurn orchestration (mocked)', () => {
  it('streams text, runs authorized tools, and persists multi-turn context', async () => {
    env.COPILOT_AI_PROVIDER = 'anthropic';
    env.ANTHROPIC_API_KEY = 'sk-ant-test';

    vi.spyOn(anthropicAdapter, 'createAnthropicClient').mockReturnValue({});
    vi.spyOn(anthropicAdapter, 'streamAnthropicCompletion')
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [
          {
            id: 'toolu_1',
            name: 'catalog_search',
            arguments: JSON.stringify({ category: 'Apparel', limit: 2 }),
          },
        ],
        usage: { promptTokens: 10, completionTokens: 5 },
        finishReason: 'tool_use',
      })
      .mockResolvedValueOnce({
        text: 'Here are apparel options.',
        toolCalls: [],
        usage: { promptTokens: 20, completionTokens: 8 },
        finishReason: 'end_turn',
      });

    const tenant = await makeTenant();
    const { user, assignment } = await makeUser(tenant, 'company_admin');
    const conversation = await CopilotConversation.create({
      tenantId: tenant._id,
      userId: user._id,
      title: 'New conversation',
      messages: [],
    });
    const toolCtx = buildCopilotToolCtx({
      user: {
        userId: user._id,
        role: assignment.role,
        scopeType: assignment.scopeType,
        scopeId: assignment.scopeId,
        assignedEntityIds: [],
      },
      tenantId: tenant._id,
    });

    const events = [];
    await streamAssistantTurn({
      tenantId: tenant._id,
      userId: user._id,
      role: 'company_admin',
      conversationId: conversation._id,
      content: 'Show apparel products',
      toolCtx,
      onEvent: (event) => events.push(event),
    });

    expect(events.some((e) => e.type === 'tool' && e.name === 'catalog_search')).toBe(true);
    expect(events.some((e) => e.type === 'delta')).toBe(true);
    expect(events.at(-1)?.type).toBe('done');
    expect(events.at(-1)?.usage?.provider).toBe('anthropic');

    const saved = await CopilotConversation.findById(conversation._id).lean();
    expect(saved.messages.some((m) => m.role === 'tool' && m.toolName === 'catalog_search')).toBe(
      true,
    );
    expect(saved.messages.some((m) => m.role === 'assistant' && m.toolCalls?.length)).toBe(true);
  });

  it('rejects unknown / unauthorized tool names without breaking persistence path', async () => {
    env.COPILOT_AI_PROVIDER = 'anthropic';
    env.ANTHROPIC_API_KEY = 'sk-ant-test';
    vi.spyOn(anthropicAdapter, 'createAnthropicClient').mockReturnValue({});
    vi.spyOn(anthropicAdapter, 'streamAnthropicCompletion')
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [{ id: 'toolu_x', name: 'not_a_real_tool', arguments: '{}' }],
        usage: { promptTokens: 1, completionTokens: 1 },
        finishReason: 'tool_use',
      })
      .mockResolvedValueOnce({
        text: 'I could not use that tool.',
        toolCalls: [],
        usage: { promptTokens: 2, completionTokens: 2 },
        finishReason: 'end_turn',
      });

    const tenant = await makeTenant();
    const { user, assignment } = await makeUser(tenant, 'company_admin');
    const conversation = await CopilotConversation.create({
      tenantId: tenant._id,
      userId: user._id,
      title: 'New conversation',
      messages: [],
    });
    const toolCtx = buildCopilotToolCtx({
      user: {
        userId: user._id,
        role: assignment.role,
        scopeType: assignment.scopeType,
        scopeId: assignment.scopeId,
        assignedEntityIds: [],
      },
      tenantId: tenant._id,
    });
    const events = [];
    await streamAssistantTurn({
      tenantId: tenant._id,
      userId: user._id,
      role: 'company_admin',
      conversationId: conversation._id,
      content: 'Do something forbidden',
      toolCtx,
      onEvent: (e) => events.push(e),
    });
    expect(events.some((e) => e.type === 'tool' && e.status === 'error')).toBe(true);
    expect(events.at(-1)?.type).toBe('done');
  });

  it('still supports OpenAI path when provider is openai', async () => {
    env.COPILOT_AI_PROVIDER = 'openai';
    env.OPENAI_API_KEY = 'sk-openai-test';
    vi.spyOn(openaiAdapter, 'createOpenAiClient').mockReturnValue({});
    vi.spyOn(openaiAdapter, 'streamOpenAiCompletion').mockResolvedValue({
      text: 'Hello from OpenAI.',
      toolCalls: [],
      usage: { promptTokens: 3, completionTokens: 4 },
      finishReason: 'stop',
    });

    const tenant = await makeTenant();
    const { user, assignment } = await makeUser(tenant, 'company_admin');
    const conversation = await CopilotConversation.create({
      tenantId: tenant._id,
      userId: user._id,
      title: 'New conversation',
      messages: [],
    });
    const toolCtx = buildCopilotToolCtx({
      user: {
        userId: user._id,
        role: assignment.role,
        scopeType: assignment.scopeType,
        scopeId: assignment.scopeId,
        assignedEntityIds: [],
      },
      tenantId: tenant._id,
    });
    const events = [];
    await streamAssistantTurn({
      tenantId: tenant._id,
      userId: user._id,
      role: 'company_admin',
      conversationId: conversation._id,
      content: 'Hello',
      toolCtx,
      onEvent: (e) => events.push(e),
    });
    expect(events.some((e) => e.type === 'delta' && e.text.includes('OpenAI'))).toBe(true);
    expect(events.at(-1)?.usage?.provider).toBe('openai');
  });

  it('uses provider-specific cost estimates', () => {
    expect(estimateCostUsd(1_000_000, 0, 'anthropic')).toBeGreaterThan(
      estimateCostUsd(1_000_000, 0, 'openai'),
    );
  });

  it('rejects model EXECUTE even when write flag is on', async () => {
    env.EMBEDDED_COPILOT_WRITE_STORE_CREATE = 'true';
    const tenant = await makeTenant();
    const { user, assignment } = await makeUser(tenant, 'company_admin');
    const ctx = buildCopilotToolCtx({
      user: {
        userId: user._id,
        role: assignment.role,
        scopeType: assignment.scopeType,
        scopeId: assignment.scopeId,
        assignedEntityIds: [],
      },
      tenantId: tenant._id,
    });
    await expect(
      runCopilotTool(
        'shops_execute_create',
        ctx,
        { name: 'Nope', confirmationId: 'c'.repeat(24), idempotencyKey: 'x'.repeat(8) },
        'company_admin',
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
