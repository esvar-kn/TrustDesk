import { Router } from 'express';
import { fail } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import AgentRun from '../models/AgentRun.js';
import { summarizeIncidents } from '../services/guardrails/incidentSummary.js';

export const agentRunsRouter = Router();
agentRunsRouter.use(requireAuth);

// GET /api/agent-runs/incidents → cross-ticket guardrail incident summary
// (Phase 8.4). Registered before /:runId so "incidents" isn't read as a run id.
agentRunsRouter.get('/incidents', async (_req, res) => {
  res.json(await summarizeIncidents());
});

// GET /api/agent-runs/:runId → one trace.
agentRunsRouter.get('/:runId', async (req, res) => {
  const run = await AgentRun.findOne({ run_id: req.params.runId }).select('-_id -__v').lean();
  if (!run) fail('NOT_FOUND', `Run ${req.params.runId} not found`);
  res.json(run);
});
