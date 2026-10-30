import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { summarizeAnalytics } from '../services/analytics/summary.js';

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

// GET /api/analytics → operational metrics summary (Phase 8.7).
analyticsRouter.get('/', async (_req, res) => {
  res.json(await summarizeAnalytics());
});
