// Triage pipeline: scan customer text -> run the policy engine -> ask the model
// to classify -> merge with policy floors -> persist ticket.triage and write
// exactly one agent_runs trace (whether it succeeds, escalates, or fails).
import { env } from '../../config/env.js';
import { fail } from '../../errors.js';
import { newId } from '../ids.js';
import Ticket from '../../models/Ticket.js';
import Customer from '../../models/Customer.js';
import Order from '../../models/Order.js';
import ToolCatalog from '../../models/ToolCatalog.js';
import AgentRun from '../../models/AgentRun.js';
import { scanTicket } from '../guardrails/inputScanner.js';
import { evaluate, mergeTriage } from '../policy/policyEngine.js';
import { buildTriagePrompt, VERSION } from '../ai/prompts/triage.v1.js';
import { getProvider } from '../ai/provider.js';
import { TriageOut } from '../ai/schemas.js';
import { notifier } from '../notifications/notify.js';

async function writeRun(fields) {
  return AgentRun.create({ run_type: 'triage', created_at: new Date(), ...fields });
}

// run(ticketId, { provider }) — provider is injectable for tests; defaults to
// the configured provider.
export async function run(ticketId, { provider = getProvider() } = {}) {
  const ticket = await Ticket.findOne({ ticket_id: ticketId });
  if (!ticket) fail('NOT_FOUND', `Ticket ${ticketId} not found`);

  const customer = (await Customer.findOne({ customer_id: ticket.customer_id }).lean()) || {};
  const order = ticket.order_id
    ? await Order.findOne({ order_id: ticket.order_id }).lean()
    : null;
  const orderCount = await Order.countDocuments({ customer_id: ticket.customer_id });

  const couponTool = await ToolCatalog.findOne({ tool_name: 'issue_coupon' }).lean();
  const flags = scanTicket(ticket, { couponCap: couponTool?.max_amount_inr ?? 1000 });

  const policy = evaluate({ ticket, customer, order, flags, orderCount });
  const run_id = newId('run');
  const prompt = buildTriagePrompt({ ticket, policy, flags });

  const baseTrace = {
    run_id,
    ticket_id: ticketId,
    retrieved_doc_ids: [],
    quarantined_doc_ids: [],
    tool_calls: [],
    model_provider: env.LLM_PROVIDER,
    prompt_version: VERSION,
  };

  let res;
  try {
    res = await provider.complete({ ...prompt, schema: TriageOut, timeoutMs: env.LLM_TIMEOUT_MS });
  } catch (err) {
    await writeRun({
      ...baseTrace,
      status: 'failed',
      guardrail_results: { flags, policy_escalate: policy.escalate, error: err.code || err.message },
      latency_ms: 0,
    });
    throw err;
  }

  const model = res.json;
  const merged = mergeTriage(model, policy);

  // Confidence gate (Phase 8.5): a low-confidence classification forces escalate,
  // on top of the deterministic policy escalation (policy can still only add).
  const confidence = typeof model.confidence === 'number' ? model.confidence : 1;
  const lowConfidence = confidence < env.CONFIDENCE_THRESHOLD;
  const should_escalate = merged.should_escalate || lowConfidence;
  const overrides = [...merged.overrides];
  if (lowConfidence && !merged.should_escalate) {
    overrides.push({ field: 'should_escalate', from: false, to: true, reason: 'low_confidence' });
  }

  const triage = {
    category: merged.category,
    priority: merged.priority,
    sentiment: model.sentiment,
    should_escalate,
    confidence,
    reason_summary: model.reason_summary,
    run_id,
    overrides,
  };
  ticket.triage = triage;
  await ticket.save();

  // Notify the human-review queue when the ticket escalates (Phase 8.9).
  if (should_escalate) {
    const escReason = overrides.find((o) => o.field === 'should_escalate')?.reason || 'triage';
    await notifier.emitEscalation(ticketId, escReason).catch(() => {});
  }

  const status = should_escalate ? 'escalated' : 'succeeded';
  await writeRun({
    ...baseTrace,
    status,
    guardrail_results: {
      flags,
      policy_allowed: policy.allowed,
      policy_denied: policy.denied,
      policy_escalate: policy.escalate,
      overrides,
      confidence,
      low_confidence: lowConfidence,
    },
    model_name: res.model,
    latency_ms: res.latency_ms,
    token_usage: res.usage ?? null,
  });

  return { run_id, triage };
}

export const triageService = { run };
