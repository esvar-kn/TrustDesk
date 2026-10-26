// Liveness probe. No DB dependency so it answers even before Mongo is wired in.
import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (req, res) => {
  res.json({ ok: true });
});
