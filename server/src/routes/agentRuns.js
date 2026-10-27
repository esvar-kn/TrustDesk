import { Router } from 'express';
import { fail } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import AgentRun from '../models/AgentRun.js';

export const agentRunsRouter = Router();
agentRunsRouter.use(requireAuth);

// GET /api/agent-runs/:runId → one trace.
agentRunsRouter.get('/:runId', async (req, res) => {
  const run = await AgentRun.findOne({ run_id: req.params.runId }).select('-_id -__v').lean();
  if (!run) fail('NOT_FOUND', `Run ${req.params.runId} not found`);
  res.json(run);
});
