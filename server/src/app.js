// Express application. Exported without a listener so it can be driven by
// Supertest. Express 5 forwards rejected promises from async handlers to the
// error handler, so routes can simply throw (or call fail()).
import express from 'express';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { ticketsRouter } from './routes/tickets.js';
import { documentsRouter } from './routes/documents.js';
import { agentRunsRouter } from './routes/agentRuns.js';
import { toolActionsRouter } from './routes/toolActions.js';
import { evalRunsRouter } from './routes/evalRuns.js';
import { analyticsRouter } from './routes/analytics.js';
import { usersRouter } from './routes/users.js';
import { notificationsRouter } from './routes/notifications.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  app.use(express.json());

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/tickets', ticketsRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/agent-runs', agentRunsRouter);
  app.use('/api/tool-actions', toolActionsRouter);
  app.use('/api/eval-runs', evalRunsRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/notifications', notificationsRouter);

  // 404 for anything unmatched, then the central coded error handler (last).
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
