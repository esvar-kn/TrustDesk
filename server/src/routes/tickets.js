import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';

import { fail } from '../errors.js';
import { requireAuth, blockAuditorWrites } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import Customer from '../models/Customer.js';
import Order from '../models/Order.js';
import Ticket from '../models/Ticket.js';
import AgentRun from '../models/AgentRun.js';
import Draft from '../models/Draft.js';
import ToolCatalog from '../models/ToolCatalog.js';
import { triageService } from '../services/triage/triageService.js';
import { draftService } from '../services/drafts/draftService.js';
import { scanInput } from '../services/guardrails/inputScanner.js';
import { newId } from '../services/ids.js';

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

// All ticket routes require authentication; auditors are read-only.
ticketsRouter.use(requireAuth);
ticketsRouter.use(blockAuditorWrites);

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

// POST /api/tickets/:id/messages → append a conversation turn (Phase 8.1).
// Customer turns are scanned verbatim (re-scan on every follow-up); agent turns
// (e.g. a drafted reply added to the thread) are not scanned. The first append to
// a legacy ticket seeds the thread with its original message.
const addMessageSchema = z.object({
  body: z.string().min(1),
  role: z.enum(['customer', 'agent']).optional().default('customer'),
});

ticketsRouter.post('/:id/messages', validateBody(addMessageSchema), async (req, res) => {
  const ticket = await Ticket.findOne({ ticket_id: req.params.id });
  if (!ticket) fail('NOT_FOUND', `Ticket ${req.params.id} not found`);

  const { body, role } = req.body;

  if (!ticket.messages?.length) {
    ticket.messages = [
      {
        message_id: newId('msg'),
        role: 'customer',
        body: ticket.body,
        created_at: ticket.created_at,
        flags: null,
      },
    ];
  }

  // Re-scan customer turns only; never scan an agent/drafted turn.
  let flags = null;
  if (role === 'customer') {
    const couponTool = await ToolCatalog.findOne({ tool_name: 'issue_coupon' }).lean();
    flags = scanInput(body, { couponCap: couponTool?.max_amount_inr ?? 1000 });
  }

  ticket.messages.push({
    message_id: newId('msg'),
    role,
    body,
    created_at: new Date().toISOString(),
    flags,
  });
  await ticket.save();

  res.status(201).json({ messages: ticket.messages });
});

// POST /api/tickets/:id/send → send the latest draft and resolve the ticket
// (Phase 8.3). Mock "send": the drafted reply is appended to the thread as an
// agent turn (unless it already is) and the draft is marked sent.
ticketsRouter.post('/:id/send', async (req, res) => {
  const ticket = await Ticket.findOne({ ticket_id: req.params.id });
  if (!ticket) fail('NOT_FOUND', `Ticket ${req.params.id} not found`);

  const draft = await Draft.findOne({ ticket_id: req.params.id }).sort({ created_at: -1 });
  if (!draft || !draft.body) fail('INVALID_STATE', 'No draft to send for this ticket');

  if (!ticket.messages?.length) {
    ticket.messages = [
      {
        message_id: newId('msg'),
        role: 'customer',
        body: ticket.body,
        created_at: ticket.created_at,
        flags: null,
      },
    ];
  }

  const last = ticket.messages[ticket.messages.length - 1];
  const alreadySent = last && last.role === 'agent' && last.body === draft.body;
  if (!alreadySent) {
    ticket.messages.push({
      message_id: newId('msg'),
      role: 'agent',
      body: draft.body,
      created_at: new Date().toISOString(),
      flags: null,
    });
  }

  ticket.status = 'resolved';
  await ticket.save();
  draft.status = 'sent';
  await draft.save();

  res.json({ ok: true, status: ticket.status, messages: ticket.messages });
});

// POST /api/tickets/:id/reopen → move a resolved ticket back to open (Phase 8.3).
ticketsRouter.post('/:id/reopen', async (req, res) => {
  const ticket = await Ticket.findOne({ ticket_id: req.params.id });
  if (!ticket) fail('NOT_FOUND', `Ticket ${req.params.id} not found`);
  ticket.status = 'open';
  await ticket.save();
  res.json({ ok: true, status: ticket.status });
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

// GET /api/tickets/:id/draft → the latest persisted draft for a ticket, rebuilt
// into the same shape POST /draft-reply returns (draft + flags + provenance), so
// the console can rehydrate a previously generated draft when a ticket is
// reopened. Returns null when the ticket has no draft yet.
ticketsRouter.get('/:id/draft', async (req, res) => {
  const draft = await Draft.findOne({ ticket_id: req.params.id })
    .select('-_id -__v')
    .sort({ created_at: -1 })
    .lean();
  if (!draft) {
    res.json(null);
    return;
  }

  const trace = draft.run_id
    ? await AgentRun.findOne({ run_id: draft.run_id }).select('-_id -__v').lean()
    : null;
  const guard = trace?.guardrail_results || {};

  res.json({
    run_id: draft.run_id,
    draft_id: draft.draft_id,
    decision: guard.decision || null,
    prompt_version: trace?.prompt_version || 'v1',
    flags: guard.flags || {},
    draft: {
      decision: guard.decision || null,
      body: draft.body,
      citations: draft.citations || [],
      violations: guard.violations || [],
      actions: draft.recommended_actions || [],
    },
  });
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
