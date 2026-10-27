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

  const triage = {
    category: merged.category,
    priority: merged.priority,
    sentiment: model.sentiment,
    should_escalate: merged.should_escalate,
    reason_summary: model.reason_summary,
    run_id,
    overrides: merged.overrides,
  };
  ticket.triage = triage;
  await ticket.save();

  const status = merged.should_escalate ? 'escalated' : 'succeeded';
  await writeRun({
    ...baseTrace,
    status,
    guardrail_results: {
      flags,
      policy_allowed: policy.allowed,
      policy_denied: policy.denied,
      policy_escalate: policy.escalate,
      overrides: merged.overrides,
    },
    model_name: res.model,
    latency_ms: res.latency_ms,
    token_usage: res.usage ?? null,
  });

  return { run_id, triage };
}

export const triageService = { run };
