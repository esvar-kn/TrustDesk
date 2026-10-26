// HTTP entrypoint. Starts the listener immediately so /api/health stays
// available, then connects to MongoDB (wired in Phase 1.1). A failed initial
// connection is logged rather than fatal; Mongoose retries in the background.
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDb, disconnectDb } from './db/connect.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`TrustDesk API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

connectDb().catch((err) => logger.error({ err }, 'initial mongo connection failed'));

function shutdown(signal) {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await disconnectDb().catch(() => {});
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
