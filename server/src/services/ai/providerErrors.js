// Maps SDK errors to the app's coded errors. Timeouts become AI_TIMEOUT (504);
// everything else (429/5xx/parse/connection) becomes AI_PROVIDER_ERROR (502).
import { AppError } from '../../errors.js';

export function mapProviderError(err) {
  if (err instanceof AppError) return err;
  const name = err?.name || '';
  const status = err?.status;
  if (/timeout/i.test(name) || status === 408 || err?.code === 'ETIMEDOUT') {
    return new AppError('AI_TIMEOUT', 'LLM request timed out');
  }
  return new AppError('AI_PROVIDER_ERROR', err?.message || 'LLM provider error');
}

// Extract a JSON object from model text, tolerating ```json fences or prose.
export function parseJsonObject(text) {
  const cleaned = String(text)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new AppError('AI_PROVIDER_ERROR', 'model did not return valid JSON');
  }
}
