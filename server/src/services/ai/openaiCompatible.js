// OpenAI-compatible adapter — covers OpenAI, Google (Gemini's OpenAI endpoint)
// and Groq, differing only by base URL (derived from LLM_PROVIDER). JSON mode,
// temperature 0. The SDK's built-in timeout + maxRetries handle 429/5xx with
// exponential backoff and honour retry-after.
import { performance } from 'node:perf_hooks';
import OpenAI from 'openai';
import { env, getProviderBaseUrl } from '../../config/env.js';
import { AppError } from '../../errors.js';
import { mapProviderError, parseJsonObject } from './providerErrors.js';

// Lazy client: built on first use, so importing this module needs no API key
// (the factory only hands this provider out when a real provider is selected).
let client;
function getClient() {
  if (client) return client;
  if (!env.LLM_API_KEY) throw new AppError('AI_PROVIDER_ERROR', 'LLM_API_KEY is not set');
  client = new OpenAI({
    apiKey: env.LLM_API_KEY,
    baseURL: getProviderBaseUrl() ?? undefined,
    timeout: env.LLM_TIMEOUT_MS,
    maxRetries: env.LLM_MAX_RETRIES,
  });
  return client;
}

function toMessages(system, messages = []) {
  const out = [];
  // response_format json_object requires the word "json" somewhere in the prompt.
  if (system) out.push({ role: 'system', content: `${system}\nReturn only a valid JSON object.` });
  for (const m of messages) out.push(typeof m === 'string' ? { role: 'user', content: m } : m);
  return out;
}

export const openaiCompatibleProvider = {
  name: 'openai-compatible',
  async complete({ system, messages, schema, timeoutMs } = {}) {
    if (!env.LLM_MODEL) throw new AppError('AI_PROVIDER_ERROR', 'LLM_MODEL is not set');
    const start = performance.now();

    let resp;
    try {
      resp = await getClient().chat.completions.create(
        {
          model: env.LLM_MODEL,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: toMessages(system, messages),
          max_tokens: 1024,
        },
        { timeout: timeoutMs ?? env.LLM_TIMEOUT_MS },
      );
    } catch (err) {
      throw mapProviderError(err);
    }

    const text = resp.choices?.[0]?.message?.content ?? '';
    let json = parseJsonObject(text);
    if (schema) json = schema.parse(json); // ZodError bubbles up for the repair path

    return {
      json,
      model: resp.model || env.LLM_MODEL,
      usage: resp.usage ?? null,
      latency_ms: Math.round(performance.now() - start),
    };
  },
};
