import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';

import { fail } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import Customer from '../models/Customer.js';
import Order from '../models/Order.js';
import Ticket from '../models/Ticket.js';
import AgentRun from '../models/AgentRun.js';
import { triageService } from '../services/triage/triageService.js';
import { draftService } from '../services/drafts/draftService.js';

const PROJECTION = '-_id -__v';

// Only these fields are accepted on create; unknown keys (e.g. a planted
// expected_*) are dropped by Zod, and the Ticket schema strips them again.
const createTicketSchema = z.object({
  customer_id: z.string().min(1),
  order_id: z.string().min(1).optional(),
  channel: z.string().optional(),
  subject: z.string().optional(),
  body: z.string().min(1), // the customer message — stored verbatim
});

export const ticketsRouter = Router();

// All ticket routes require authentication.
ticketsRouter.use(requireAuth);

// GET /api/tickets → all tickets (no label fields; those live in seed_labels).
ticketsRouter.get('/', async (_req, res) => {
  const tickets = await Ticket.find().select(PROJECTION).sort({ ticket_id: 1 }).lean();
  res.json(tickets);
});

// GET /api/tickets/:id → ticket with linked customer and order context.
ticketsRouter.get('/:id', async (req, res) => {
  const ticket = await Ticket.findOne({ ticket_id: req.params.id }).select(PROJECTION).lean();
  if (!ticket) fail('NOT_FOUND', `Ticket ${req.params.id} not found`);

  const customer = await Customer.findOne({ customer_id: ticket.customer_id })
    .select(PROJECTION)
    .lean();
  const order = ticket.order_id
    ? await Order.findOne({ order_id: ticket.order_id }).select(PROJECTION).lean()
    : null;

  res.json({ ...ticket, customer, order });
});

// POST /api/tickets/:id/triage → classify (scan + policy + model + merge).
ticketsRouter.post('/:id/triage', async (req, res) => {
  const result = await triageService.run(req.params.id);
  res.json(result);
});

// POST /api/tickets/:id/draft-reply → cited draft through the guarded pipeline.
ticketsRouter.post('/:id/draft-reply', async (req, res) => {
  const result = await draftService.run(req.params.id);
  res.json(result);
});

// GET /api/tickets/:id/runs → all agent-run traces for a ticket, newest first.
ticketsRouter.get('/:id/runs', async (req, res) => {
  const runs = await AgentRun.find({ ticket_id: req.params.id })
    .select('-_id -__v')
    .sort({ created_at: -1 })
    .lean();
  res.json(runs);
});

// POST /api/tickets → store a new ticket verbatim.
ticketsRouter.post('/', validateBody(createTicketSchema), async (req, res) => {
  const ticket_id = `tkt_${crypto.randomUUID().slice(0, 8)}`;
  const doc = await Ticket.create({
    ...req.body,
    ticket_id,
    created_at: new Date().toISOString(),
    status: 'open',
  });
  const created = doc.toObject();
  delete created._id;
  delete created.__v;
  res.status(201).json(created);
});
