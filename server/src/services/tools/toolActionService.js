// Tool-action service. Phase 4.1 implements request(): the only way an action
// is created. The AI path never calls this — a draft merely *recommends*; a
// request needs an authenticated click. Idempotency rests on the unique
// idempotency_key index (plus a payload hash to catch key reuse).
import { fail } from '../../errors.js';
import { newId } from '../ids.js';
import { payloadHash } from '../hash.js';
import Ticket from '../../models/Ticket.js';
import ToolAction from '../../models/ToolAction.js';
import Approval from '../../models/Approval.js';
import { registry } from './registry.js';
import { executors } from './executors/index.js';
import { evaluateTicket } from '../policy/evaluateTicket.js';

const EXECUTING_LEASE_MS = 60_000;

// The payload must be consistent with the ticket it is filed under.
function assertPayloadMatchesTicket(payload, ticket, order) {
  if (payload.order_id != null && payload.order_id !== ticket.order_id) {
    fail('VALIDATION_ERROR', 'payload.order_id does not match the ticket');
  }
  if (payload.customer_id != null && payload.customer_id !== ticket.customer_id) {
    fail('VALIDATION_ERROR', 'payload.customer_id does not match the ticket');
  }
  if (payload.sku != null) {
    const skus = (order?.items || []).map((i) => i.sku);
    if (!skus.includes(payload.sku)) fail('VALIDATION_ERROR', `sku ${payload.sku} is not in the order`);
  }
}

export async function request({ ticketId, toolName, payload = {} }, actor = {}) {
  const tool = await registry.assertExists(toolName); // NOT_FOUND
  registry.assertRequiredFields(tool, payload); // VALIDATION_ERROR

  const ticket = await Ticket.findOne({ ticket_id: ticketId });
  if (!ticket) fail('NOT_FOUND', `Ticket ${ticketId} not found`);
  if (!ticket.triage) fail('INVALID_STATE', 'Run triage before requesting an action');

  registry.assertAllowedCategory(tool, ticket.triage.category); // POLICY_BLOCKED
  registry.assertAmountCap(tool, payload); // POLICY_BLOCKED

  const { policy, order } = await evaluateTicket(ticket);
  if (!policy.allowed.includes(toolName)) {
    fail('POLICY_BLOCKED', `Policy does not allow ${toolName} for this ticket`);
  }
  assertPayloadMatchesTicket(payload, ticket, order);

  const payload_hash = payloadHash(payload);

  try {
    const action = await ToolAction.create({
      action_id: newId('act'),
      ticket_id: ticketId,
      tool_name: toolName,
      payload,
      payload_hash,
      idempotency_key: payload.idempotency_key,
      risk_level: tool.risk_level,
      requires_human_approval: tool.requires_human_approval,
      requested_by: actor.sub || actor.username || null,
      status: tool.requires_human_approval ? 'approval_required' : 'approved',
    });
    return { action: action.toObject(), replay: false };
  } catch (err) {
    if (err?.code !== 11000) throw err; // not a duplicate-key error
    // Same idempotency_key already exists: replay only if the payload matches.
    const existing = await ToolAction.findOne({ idempotency_key: payload.idempotency_key }).lean();
    if (!existing) throw err;
    if (existing.payload_hash !== payload_hash) {
      fail('IDEMPOTENCY_KEY_REUSED', 'idempotency_key reused with a different payload');
    }
    return { action: existing, replay: true };
  }
}

// Manager decision on an action. The atomic filter enforces both "still
// awaiting a decision" and "not the requester" (no self-approval) in one step;
// a no-match means already-decided, self-approval, or missing. The unique
// approvals.action_id index is a second guard against a double decision.
export async function approve(actionId, { decision, reason } = {}, reviewer = {}) {
  const reviewerId = reviewer.sub || reviewer.username || null;
  const nextStatus = decision === 'approved' ? 'approved' : 'rejected';

  const action = await ToolAction.findOneAndUpdate(
    { action_id: actionId, status: 'approval_required', requested_by: { $ne: reviewerId } },
    { $set: { status: nextStatus } },
    { new: true },
  );
  if (!action) fail('INVALID_STATE', 'Action is not awaiting your decision');

  try {
    await Approval.create({
      approval_id: newId('apr'),
      action_id: actionId,
      reviewer_id: reviewerId,
      decision,
      reason,
    });
  } catch (err) {
    if (err?.code === 11000) fail('INVALID_STATE', 'Action already has a decision');
    throw err;
  }
  return action.toObject();
}

// Execute an approved action. Idempotent and crash-safe: an executed action
// replays its stored result; an executing-lease prevents concurrent double
// execution (and lets a stale lease be re-acquired); the executor itself is
// keyed on idempotency_key, so the side effect lands at most once.
export async function execute(actionId) {
  const cur = await ToolAction.findOne({ action_id: actionId }).lean();
  if (!cur) fail('NOT_FOUND', `Action ${actionId} not found`);
  if (cur.status === 'executed') return cur; // replay the stored result
  if (cur.status === 'approval_required') fail('APPROVAL_REQUIRED', 'Action needs approval first');

  const staleBefore = new Date(Date.now() - EXECUTING_LEASE_MS);
  const action = await ToolAction.findOneAndUpdate(
    {
      action_id: actionId,
      $or: [
        { status: { $in: ['approved', 'failed'] } },
        { status: 'executing', executing_since: { $lt: staleBefore } },
      ],
    },
    { $set: { status: 'executing', executing_since: new Date() } },
    { new: true },
  );
  if (!action) fail('INVALID_STATE', 'Action cannot be executed in its current state');

  const executor = executors[action.tool_name];
  if (!executor) fail('TOOL_EXECUTION_FAILED', `No executor for ${action.tool_name}`);

  try {
    const result = await executor(action);
    return ToolAction.findOneAndUpdate(
      { action_id: actionId },
      { $set: { status: 'executed', result, executed_at: new Date() } },
      { new: true },
    ).lean();
  } catch (err) {
    await ToolAction.updateOne({ action_id: actionId }, { $set: { status: 'failed', error: err.message } });
    fail('TOOL_EXECUTION_FAILED', err.message);
  }
}

export const toolActionService = { request, approve, execute };
