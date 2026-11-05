// Express application. Exported without a listener so it can be driven by
// Supertest. Express 5 forwards rejected promises from async handlers to the
// error handler, so routes can simply throw (or call fail()).
import express from 'express';
import { randomUUID } from 'node:crypto';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { env, isTest, corsOrigins } from './config/env.js';
import { logger } from './config/logger.js';
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

  // Behind a proxy/load balancer in production, trust the first hop so the
  // rate limiter and logging see the real client IP (not the proxy's).
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);

  // Security headers. This is a JSON API (no inline scripts/styles of its own),
  // so helmet's defaults are a good fit; CSP mainly matters for the client build.
  app.use(helmet());

  // CORS. Browser requests from the configured origin(s) only. Auth is a Bearer
  // token (no cookies), so credentials are not enabled. Expose the custom
  // response headers so a cross-origin client can read them.
  app.use(
    cors({
      origin: corsOrigins,
      credentials: false,
      exposedHeaders: ['X-Total-Count', 'X-Request-Id'],
    }),
  );

  // Per-request structured logging with a correlation id. Honour an inbound
  // X-Request-Id (set by an upstream proxy) or mint one, and echo it back so a
  // client/log line can be traced end to end. Logger is silent under test.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = req.headers['x-request-id'] || randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
    }),
  );

  app.use(express.json());

  // Rate limiting (skipped under test to keep the suite deterministic). A strict
  // limiter guards the login route against credential stuffing; a looser one
  // caps overall per-IP traffic. Both key on IP and return the coded error shape.
  if (!isTest) {
    const limited = (max) =>
      rateLimit({
        windowMs: env.RATE_LIMIT_WINDOW_MS,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down.' } },
      });
    app.use('/api/auth/login', limited(env.AUTH_RATE_LIMIT_MAX));
    app.use('/api', limited(env.RATE_LIMIT_MAX));
  }

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
