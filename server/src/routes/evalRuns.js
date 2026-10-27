import { Router } from 'express';
import { z } from 'zod';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { fail } from '../errors.js';
import { newId } from '../services/ids.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { enqueue } from '../jobs/jobQueue.js';
import { runEval } from '../services/evals/evalRunner.js';
import EvalRun from '../models/EvalRun.js';

export const evalRunsRouter = Router();
evalRunsRouter.use(requireAuth);

const startSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'google', 'groq', 'mock']).optional(),
  repeat: z.number().int().positive().max(10).optional(),
});

// POST /api/eval-runs → 202 immediately; the eval runs off the request path.
evalRunsRouter.post('/', validateBody(startSchema), async (req, res) => {
  const provider = req.body.provider || env.LLM_PROVIDER;
  const repeat = req.body.repeat || 1;
  const eval_run_id = newId('eval');

  await EvalRun.create({ eval_run_id, status: 'queued', provider, started_at: new Date() });

  // Fire-and-forget: not awaited, so the response returns at once.
  enqueue(async () => {
    try {
      await EvalRun.updateOne({ eval_run_id }, { $set: { status: 'running' } });
      const result = await runEval({ providerName: provider, repeat });
      await EvalRun.updateOne(
        { eval_run_id },
        {
          $set: {
            status: 'completed',
            total_cases: result.case_results.length,
            metrics: result.metrics,
            case_results: result.case_results,
            completed_at: new Date(),
          },
        },
      );
    } catch (err) {
      logger.error({ err, eval_run_id }, 'eval job failed');
      await EvalRun.updateOne(
        { eval_run_id },
        { $set: { status: 'failed', error: err.message, completed_at: new Date() } },
      );
    }
  });

  res.status(202).json({ eval_run_id, status: 'queued' });
});

// GET /api/eval-runs → summaries, newest first (no per-case detail).
evalRunsRouter.get('/', async (_req, res) => {
  const runs = await EvalRun.find()
    .select('-_id -__v -case_results')
    .sort({ started_at: -1 })
    .lean();
  res.json(runs);
});

// GET /api/eval-runs/:id → full run including case_results.
evalRunsRouter.get('/:id', async (req, res) => {
  const run = await EvalRun.findOne({ eval_run_id: req.params.id }).select('-_id -__v').lean();
  if (!run) fail('NOT_FOUND', `Eval run ${req.params.id} not found`);
  res.json(run);
});
