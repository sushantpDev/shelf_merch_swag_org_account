import OpenAI from 'openai';
import { env } from '../../../config/env.js';

export function createOpenAiClient({ apiKey = env.OPENAI_API_KEY } = {}) {
  const key = apiKey?.trim();
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

export function toOpenAiTools(openAiTools) {
  return openAiTools?.length ? openAiTools : undefined;
}

export function toOpenAiMessages(systemPrompt, messages) {
  const out = [{ role: 'system', content: systemPrompt }];
  for (const m of messages) {
    if (m.role === 'tool') {
      out.push({
        role: 'tool',
        tool_call_id: m.toolCallId,
        content: m.content || '',
      });
      continue;
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      out.push({
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: {
            name: call.name,
            arguments: typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments || {}),
          },
        })),
      });
      continue;
    }
    if (m.role === 'user' || m.role === 'assistant' || m.role === 'system') {
      out.push({ role: m.role, content: m.content || '' });
    }
  }
  return out;
}

/**
 * Stream one OpenAI completion turn.
 * @returns {{ text: string, toolCalls: Array<{id,name,arguments}>, usage: {promptTokens,completionTokens}, finishReason: string|null }}
 */
export async function streamOpenAiCompletion({
  client,
  model = env.OPENAI_MODEL,
  systemPrompt,
  messages,
  tools,
  signal,
  onTextDelta,
}) {
  const openAiMessages = Array.isArray(messages?.[0]) || messages?.[0]?.role === 'system'
    ? messages
    : toOpenAiMessages(systemPrompt, messages);

  const stream = await client.chat.completions.create(
    {
      model,
      messages: openAiMessages,
      tools: toOpenAiTools(tools),
      stream: true,
      stream_options: { include_usage: true },
    },
    signal ? { signal } : undefined,
  );

  let text = '';
  let pendingToolCalls = [];
  let finishReason = null;
  let promptTokens = 0;
  let completionTokens = 0;

  for await (const chunk of stream) {
    if (signal?.aborted) {
      const err = new Error('Request aborted');
      err.code = 'ABORT_ERR';
      throw err;
    }
    const choice = chunk.choices?.[0];
    if (chunk.usage) {
      promptTokens += chunk.usage.prompt_tokens || 0;
      completionTokens += chunk.usage.completion_tokens || 0;
    }
    if (!choice) continue;
    finishReason = choice.finish_reason || finishReason;
    const delta = choice.delta || {};
    if (delta.content) {
      text += delta.content;
      onTextDelta?.(delta.content);
    }
    if (delta.tool_calls) {
      for (const part of delta.tool_calls) {
        const index = part.index ?? 0;
        if (!pendingToolCalls[index]) {
          pendingToolCalls[index] = {
            id: part.id || '',
            name: '',
            arguments: '',
          };
        }
        if (part.id) pendingToolCalls[index].id = part.id;
        if (part.function?.name) pendingToolCalls[index].name += part.function.name;
        if (part.function?.arguments) pendingToolCalls[index].arguments += part.function.arguments;
      }
    }
  }

  pendingToolCalls = pendingToolCalls.filter(Boolean).map((call) => ({
    id: call.id,
    name: call.name,
    arguments: call.arguments || '{}',
  }));

  return {
    text,
    toolCalls: pendingToolCalls,
    usage: { promptTokens, completionTokens },
    finishReason,
  };
}

export function appendOpenAiAssistantToolTurn(messages, { text, toolCalls }) {
  messages.push({
    role: 'assistant',
    content: text || null,
    tool_calls: toolCalls.map((call) => ({
      id: call.id,
      type: 'function',
      function: { name: call.name, arguments: call.arguments || '{}' },
    })),
  });
}

export function appendOpenAiToolResult(messages, { toolCallId, content }) {
  messages.push({
    role: 'tool',
    tool_call_id: toolCallId,
    content,
  });
}
