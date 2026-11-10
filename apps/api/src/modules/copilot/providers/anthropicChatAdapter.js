import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../../config/env.js';

export function createAnthropicClient({ apiKey = env.ANTHROPIC_API_KEY } = {}) {
  const key = apiKey?.trim();
  if (!key) return null;
  return new Anthropic({
    apiKey: key,
    defaultHeaders: env.ANTHROPIC_API_VERSION
      ? { 'anthropic-version': env.ANTHROPIC_API_VERSION }
      : undefined,
  });
}

/** Convert OpenAI-shaped Copilot tools to Anthropic tool definitions. */
export function toAnthropicTools(openAiTools = []) {
  return openAiTools.map((tool) => {
    const fn = tool.function || tool;
    const schema = fn.parameters && typeof fn.parameters === 'object'
      ? fn.parameters
      : { type: 'object', properties: {} };
    const input_schema = {
      type: schema.type || 'object',
      properties: schema.properties || {},
      ...(Array.isArray(schema.required) ? { required: schema.required } : {}),
      ...(schema.additionalProperties !== undefined
        ? { additionalProperties: schema.additionalProperties }
        : {}),
    };
    return {
      name: fn.name,
      description: fn.description || '',
      input_schema,
    };
  });
}

function parseArgsObject(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Convert persisted ShelfMerch conversation messages into Anthropic Messages API turns.
 * System prompt is passed separately as top-level `system`.
 */
export function toAnthropicMessages(messages = []) {
  const out = [];
  let i = 0;
  while (i < messages.length) {
    const m = messages[i];
    if (m.role === 'system') {
      i += 1;
      continue;
    }
    if (m.role === 'user') {
      out.push({
        role: 'user',
        content: Array.isArray(m.content) ? m.content : (m.content || ''),
      });
      i += 1;
      continue;
    }
    if (m.role === 'assistant') {
      const content = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const call of m.toolCalls || []) {
        content.push({
          type: 'tool_use',
          id: call.id,
          name: call.name,
          input: parseArgsObject(call.arguments),
        });
      }
      if (!content.length) content.push({ type: 'text', text: '' });
      out.push({ role: 'assistant', content });
      i += 1;
      continue;
    }
    if (m.role === 'tool') {
      const results = [];
      while (i < messages.length && messages[i].role === 'tool') {
        const toolMsg = messages[i];
        results.push({
          type: 'tool_result',
          tool_use_id: toolMsg.toolCallId,
          content: toolMsg.content || '',
        });
        i += 1;
      }
      out.push({ role: 'user', content: results });
      continue;
    }
    i += 1;
  }
  return out;
}

/**
 * Stream one Claude Messages completion.
 * Does not auto-run tools — returns tool_use for ShelfMerch orchestration.
 */
export async function streamAnthropicCompletion({
  client,
  model = env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
  systemPrompt,
  messages,
  tools,
  signal,
  onTextDelta,
}) {
  const anthropicTools = toAnthropicTools(tools || []);
  const stream = client.messages.stream(
    {
      model,
      max_tokens: env.EMBEDDED_COPILOT_MAX_OUTPUT_TOKENS,
      system: systemPrompt,
      messages,
      ...(anthropicTools.length ? { tools: anthropicTools } : {}),
    },
    signal ? { signal } : undefined,
  );

  let text = '';
  const toolBlocksByIndex = new Map();
  let stopReason = null;
  let promptTokens = 0;
  let completionTokens = 0;

  for await (const event of stream) {
    if (signal?.aborted) {
      try {
        stream.abort?.();
      } catch {
        /* ignore */
      }
      const err = new Error('Request aborted');
      err.code = 'ABORT_ERR';
      throw err;
    }

    if (event.type === 'message_start' && event.message?.usage) {
      promptTokens += event.message.usage.input_tokens || 0;
    }
    if (event.type === 'content_block_start') {
      const block = event.content_block;
      if (block?.type === 'tool_use') {
        toolBlocksByIndex.set(event.index, {
          id: block.id,
          name: block.name,
          argumentsJson: '',
        });
      }
    }
    if (event.type === 'content_block_delta') {
      const delta = event.delta;
      if (delta?.type === 'text_delta' && delta.text) {
        text += delta.text;
        onTextDelta?.(delta.text);
      }
      if (delta?.type === 'input_json_delta' && delta.partial_json != null) {
        const current = toolBlocksByIndex.get(event.index);
        if (current) current.argumentsJson += delta.partial_json;
      }
    }
    if (event.type === 'message_delta') {
      if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
      if (event.usage?.output_tokens != null) completionTokens = event.usage.output_tokens;
      if (event.usage?.input_tokens != null) {
        promptTokens = Math.max(promptTokens, event.usage.input_tokens);
      }
    }
  }

  let toolCalls = [...toolBlocksByIndex.values()]
    .filter((row) => row?.id && row?.name)
    .map((row) => ({
      id: row.id,
      name: row.name,
      arguments: row.argumentsJson || '{}',
    }));

  try {
    const finalMessage = await stream.finalMessage();
    if (finalMessage?.usage) {
      promptTokens = finalMessage.usage.input_tokens || promptTokens;
      completionTokens = finalMessage.usage.output_tokens || completionTokens;
    }
    if (finalMessage?.stop_reason) stopReason = finalMessage.stop_reason;
    if (Array.isArray(finalMessage?.content)) {
      const fromFinal = [];
      let finalText = '';
      for (const block of finalMessage.content) {
        if (block.type === 'text' && block.text) finalText += block.text;
        if (block.type === 'tool_use') {
          fromFinal.push({
            id: block.id,
            name: block.name,
            arguments: JSON.stringify(block.input || {}),
          });
        }
      }
      if (fromFinal.length) toolCalls = fromFinal;
      if (finalText && !text) text = finalText;
    }
  } catch {
    /* keep streamed partials */
  }

  return {
    text,
    toolCalls,
    usage: { promptTokens, completionTokens },
    finishReason: stopReason,
  };
}

export function appendAnthropicAssistantToolTurn(messages, { text, toolCalls }) {
  const content = [];
  if (text) content.push({ type: 'text', text });
  for (const call of toolCalls) {
    content.push({
      type: 'tool_use',
      id: call.id,
      name: call.name,
      input: parseArgsObject(call.arguments),
    });
  }
  messages.push({
    role: 'assistant',
    content: content.length ? content : [{ type: 'text', text: '' }],
  });
}

export function appendAnthropicToolResults(messages, results) {
  messages.push({
    role: 'user',
    content: results.map((row) => ({
      type: 'tool_result',
      tool_use_id: row.toolCallId,
      content: row.content,
      ...(row.isError ? { is_error: true } : {}),
    })),
  });
}
