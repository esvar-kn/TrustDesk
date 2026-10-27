// Anthropic adapter — same complete() interface as the OpenAI-compatible one,
// but Anthropic is not OpenAI-compatible: `system` is a top-level field, there
// is no response_format, and current Claude models reject `temperature`. JSON is
// requested in the system prompt and parsed from the text blocks. The SDK's
// timeout + maxRetries handle 429/5xx with backoff and retry-after.
import { performance } from 'node:perf_hooks';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { AppError } from '../../errors.js';
import { mapProviderError, parseJsonObject } from './providerErrors.js';

let client;
function getClient() {
  if (client) return client;
  if (!env.LLM_API_KEY) throw new AppError('AI_PROVIDER_ERROR', 'LLM_API_KEY is not set');
  client = new Anthropic({
    apiKey: env.LLM_API_KEY,
    baseURL: env.LLM_BASE_URL || undefined,
    timeout: env.LLM_TIMEOUT_MS,
    maxRetries: env.LLM_MAX_RETRIES,
  });
  return client;
}

function toMessages(messages = []) {
  return messages.map((m) =>
    typeof m === 'string' ? { role: 'user', content: m } : { role: m.role || 'user', content: m.content },
  );
}

export const anthropicProvider = {
  name: 'anthropic',
  async complete({ system, messages, schema, timeoutMs } = {}) {
    if (!env.LLM_MODEL) throw new AppError('AI_PROVIDER_ERROR', 'LLM_MODEL is not set');
    const start = performance.now();

    const sys = `${system ? `${system}\n\n` : ''}Respond with ONLY a single valid JSON object — no prose, no code fences.`;

    let resp;
    try {
      // No `temperature` — current Claude models reject it.
      resp = await getClient().messages.create(
        {
          model: env.LLM_MODEL,
          max_tokens: 1024,
          system: sys,
          messages: toMessages(messages),
        },
        { timeout: timeoutMs ?? env.LLM_TIMEOUT_MS },
      );
    } catch (err) {
      throw mapProviderError(err);
    }

    const text = (resp.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    let json = parseJsonObject(text);
    if (schema) json = schema.parse(json);

    return {
      json,
      model: resp.model || env.LLM_MODEL,
      usage: resp.usage ?? null,
      latency_ms: Math.round(performance.now() - start),
    };
  },
};
