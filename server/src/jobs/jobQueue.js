// In-process job queue backed by p-limit. Eval runs are I/O-bound LLM calls, so
// a concurrency-limited in-process queue keeps the event loop free for ordinary
// requests without needing Redis/BullMQ. Jobs die with the process — the
// eval_runs.status field makes that visible.
import pLimit from 'p-limit';
import { env } from '../config/env.js';

const limit = pLimit(env.EVAL_CONCURRENCY);

// Schedule fn to run under the concurrency limit. The returned promise is
// intentionally NOT awaited by request handlers (fire-and-forget off the
// request path); the job records its own outcome.
export function enqueue(fn) {
  return limit(fn);
}

export function queueStats() {
  return { active: limit.activeCount, pending: limit.pendingCount };
}
