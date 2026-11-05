// HTTP entrypoint. Starts the listener immediately so /api/health stays
// available, then connects to MongoDB (wired in Phase 1.1). A failed initial
// connection is logged rather than fatal; Mongoose retries in the background.
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDb, disconnectDb } from './db/connect.js';
import EvalRun from './models/EvalRun.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`TrustDesk API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// Eval jobs run in-process (they die with the process), so any run left 'queued'
// or 'running' belongs to a previous process that exited mid-job. Mark them
// failed on boot so the UI doesn't show a run stuck forever.
async function reconcileOrphanedEvalRuns() {
  const r = await EvalRun.updateMany(
    { status: { $in: ['queued', 'running'] } },
    { $set: { status: 'failed', error: 'interrupted by a server restart', completed_at: new Date() } },
  );
  if (r.modifiedCount) logger.warn({ count: r.modifiedCount }, 'marked orphaned eval runs as failed');
}

connectDb()
  .then(reconcileOrphanedEvalRuns)
  .catch((err) => logger.error({ err }, 'initial mongo connection failed'));

function shutdown(signal) {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await disconnectDb().catch(() => {});
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
