// Draft pipeline: retrieve context -> run policy -> build the draft prompt ->
// call the model -> run the output guard. On a schema-invalid response it makes
// one repair call, then falls back to a safe holding reply. Persists one draft
// and writes exactly one agent_runs trace (success, escalate, refuse, or fail).
import { ZodError } from 'zod';
import { env } from '../../config/env.js';
import { fail } from '../../errors.js';
import { newId } from '../ids.js';
import Ticket from '../../models/Ticket.js';
import Customer from '../../models/Customer.js';
import Order from '../../models/Order.js';
import ToolCatalog from '../../models/ToolCatalog.js';
import Draft from '../../models/Draft.js';
import AgentRun from '../../models/AgentRun.js';
import { scanTicket } from '../guardrails/inputScanner.js';
import { evaluate } from '../policy/policyEngine.js';
import { guardDraft } from '../guardrails/outputGuard.js';
import { search } from '../retrieval/retriever.js';
import { buildQuery } from '../retrieval/queryBuilder.js';
import { buildDraftPrompt, VERSION } from '../ai/prompts/draft.v1.js';
import { getProvider } from '../ai/provider.js';
import { DraftOut } from '../ai/schemas.js';

const HOLDING_REPLY = 'A specialist will review your request and follow up shortly.';

const DECISION_STATUS = { answer: 'succeeded', escalate: 'escalated', refuse: 'refused' };

export async function run(ticketId, { provider = getProvider() } = {}) {
  const ticket = await Ticket.findOne({ ticket_id: ticketId });
  if (!ticket) fail('NOT_FOUND', `Ticket ${ticketId} not found`);

  const customer = (await Customer.findOne({ customer_id: ticket.customer_id }).lean()) || {};
  const order = ticket.order_id ? await Order.findOne({ order_id: ticket.order_id }).lean() : null;
  const orderCount = await Order.countDocuments({ customer_id: ticket.customer_id });

  const couponTool = await ToolCatalog.findOne({ tool_name: 'issue_coupon' }).lean();
  const knownTools = (await ToolCatalog.find().select('tool_name -_id').lean()).map((t) => t.tool_name);

  const flags = scanTicket(ticket, { couponCap: couponTool?.max_amount_inr ?? 1000 });
  const policy = evaluate({ ticket, customer, order, flags, orderCount });

  // Retrieval: triage category (if triaged) steers the boost; else the policy hint.
  const categoryHint = ticket.triage?.category || policy.categoryHint || null;
  const query = buildQuery({ ticket, customer, order });
  const { context, quarantined } = await search(query, { k: 5, categoryHint });

  const prompt = buildDraftPrompt({ ticket, policy, flags, context });
  const run_id = newId('run');

  const baseTrace = {
    run_id,
    ticket_id: ticketId,
    run_type: 'draft_reply',
    retrieved_doc_ids: context.map((d) => d.doc_id),
    quarantined_doc_ids: quarantined.map((d) => d.doc_id),
    model_provider: env.LLM_PROVIDER,
    prompt_version: VERSION,
    created_at: new Date(),
  };

  const attempt = (repairNote) =>
    provider.complete(
      {
        system: prompt.system,
        messages: repairNote
          ? [...prompt.messages, { role: 'user', content: repairNote }]
          : prompt.messages,
        schema: DraftOut,
        timeoutMs: env.LLM_TIMEOUT_MS,
      },
    );

  let res;
  let modelOut;
  let holding = false;

  try {
    res = await attempt();
    modelOut = res.json;
  } catch (err) {
    if (err instanceof ZodError) {
      // One repair call including the validation error.
      try {
        res = await attempt(
          `Your previous response did not match the required schema (${err.issues?.[0]?.message || 'invalid'}). Respond with ONLY valid JSON matching the schema.`,
        );
        modelOut = res.json;
      } catch {
        holding = true; // second failure -> safe holding reply
      }
    } else {
      // Provider/timeout error: record a failed trace and surface it.
      await AgentRun.create({
        ...baseTrace,
        status: 'failed',
        guardrail_results: { flags, error: err.code || err.message },
        latency_ms: 0,
      });
      throw err;
    }
  }

  if (holding) {
    modelOut = { decision: 'escalate', body: HOLDING_REPLY, citations: [], recommended_actions: [] };
  }

  const guarded = guardDraft(modelOut, {
    trustedDocIds: context.map((d) => d.doc_id),
    policy,
    knownTools,
    customer,
    canary: env.PROMPT_CANARY,
  });
  if (holding) guarded.violations.push('schema_invalid');

  const draft_id = newId('draft');
  await Draft.create({
    draft_id,
    ticket_id: ticketId,
    run_id,
    status: 'generated',
    body: guarded.body,
    citations: guarded.citations,
    recommended_actions: guarded.actions,
  });

  await AgentRun.create({
    ...baseTrace,
    status: DECISION_STATUS[guarded.decision] || 'succeeded',
    tool_calls: guarded.actions.map((a) => ({ tool_name: a.tool_name, status: 'recommended' })),
    guardrail_results: {
      flags,
      decision: guarded.decision,
      violations: guarded.violations,
      policy_allowed: policy.allowed,
      policy_denied: policy.denied,
    },
    model_name: res?.model ?? null,
    latency_ms: res?.latency_ms ?? 0,
    token_usage: res?.usage ?? null,
  });

  return { run_id, draft_id, decision: guarded.decision, draft: guarded };
}

export const draftService = { run };
