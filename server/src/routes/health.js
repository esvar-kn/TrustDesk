// Liveness + readiness probes.
import { Router } from 'express';
import mongoose from 'mongoose';

export const healthRouter = Router();

// Liveness: the process is up. No DB dependency, so it answers even before Mongo
// is connected — a load balancer uses this to decide whether to restart the pod.
healthRouter.get('/', (_req, res) => {
  res.json({ ok: true });
});

// Readiness: the app can actually serve DB-backed traffic. 1 === connected.
// Returns 503 until Mongo is reachable, so a balancer holds traffic back.
healthRouter.get('/ready', (_req, res) => {
  const ready = mongoose.connection.readyState === 1;
  const db = ['disconnected', 'connected', 'connecting', 'disconnecting'][
    mongoose.connection.readyState
  ] || 'unknown';
  res.status(ready ? 200 : 503).json({ ok: ready, db });
});
