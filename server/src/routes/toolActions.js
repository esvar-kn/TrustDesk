import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, requireRole, blockAuditorWrites } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { toolActionService } from '../services/tools/toolActionService.js';
import { buildAuditPacket } from '../services/compliance/auditPacket.js';
import ToolAction from '../models/ToolAction.js';

const clean = (a) => {
  if (!a) return a;
  const { _id, __v, ...rest } = a;
  return rest;
};

export const toolActionsRouter = Router();
toolActionsRouter.use(requireAuth);
toolActionsRouter.use(blockAuditorWrites);

const createSchema = z.object({
  ticket_id: z.string().min(1),
  tool_name: z.string().min(1),
  payload: z.record(z.string(), z.any()),
});

// POST /api/tool-actions → request an action (any authenticated agent).
// A replay sets the Idempotent-Replay header.
toolActionsRouter.post('/', validateBody(createSchema), async (req, res) => {
  const { ticket_id, tool_name, payload } = req.body;
  const { action, replay } = await toolActionService.request(
    { ticketId: ticket_id, toolName: tool_name, payload },
    req.user,
  );
  if (replay) res.set('Idempotent-Replay', 'true');
  res.status(replay ? 200 : 201).json(clean(action));
});

// GET /api/tool-actions?ticket_id= → list actions (optionally by ticket).
toolActionsRouter.get('/', async (req, res) => {
  const filter = req.query.ticket_id ? { ticket_id: req.query.ticket_id.toString() } : {};
  const actions = await ToolAction.find(filter).select('-_id -__v').sort({ created_at: -1 }).lean();
  res.json(actions);
});

const approveSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'needs_changes']),
  reason: z.string().optional(),
});

// POST /api/tool-actions/:id/approve → manager decision.
toolActionsRouter.post(
  '/:id/approve',
  requireRole('manager'),
  validateBody(approveSchema),
  async (req, res) => {
    const action = await toolActionService.approve(req.params.id, req.body, req.user);
    res.json(clean(action));
  },
);

// GET /api/tool-actions/:id/audit-packet → deterministic, signed compliance
// packet for this action (Phase 8.6). Byte-stable for a terminal action.
toolActionsRouter.get('/:id/audit-packet', async (req, res) => {
  res.json(await buildAuditPacket(req.params.id));
});

// POST /api/tool-actions/:id/execute → manager executes an approved action.
toolActionsRouter.post('/:id/execute', requireRole('manager'), async (req, res) => {
  const action = await toolActionService.execute(req.params.id);
  res.json(clean(action));
});
