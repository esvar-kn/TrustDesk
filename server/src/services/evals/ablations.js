// Ablation harness for the eval report. Re-runs the triage+draft pipeline over
// the eval cases with one guardrail removed, so the report can show what each
// component is worth. It composes the same pure pieces the production pipeline
// uses (policy engine, prompts, retrieval, output guard, requirement checks) but
// with a toggle — it does NOT change the production triage/draft services.
//
//   scanner:false  → the input scanner is off (flags = {}), so scanner-derived
//                    policy (unsafe_instruction escalation, KB-SECURITY-001,
//                    sensitive-tool denial) never fires.
//   guard:false    → the output guard is skipped; the raw model output is scored
//                    (no citation filter, required-doc injection, action
//                    allowlist, leak refusal, or escalation override).
import { env } from '../../config/env.js';
import Ticket from '../../models/Ticket.js';
import Customer from '../../models/Customer.js';
import Order from '../../models/Order.js';
import ToolCatalog from '../../models/ToolCatalog.js';
import EvalCase from '../../models/EvalCase.js';
import { scanTicket } from '../guardrails/inputScanner.js';
import { evaluate, mergeTriage } from '../policy/policyEngine.js';
import { guardDraft } from '../guardrails/outputGuard.js';
import { search } from '../retrieval/retriever.js';
import { buildQuery } from '../retrieval/queryBuilder.js';
import { buildTriagePrompt } from '../ai/prompts/triage.v1.js';
import { buildDraftPrompt } from '../ai/prompts/draft.v1.js';
import { TriageOut, DraftOut } from '../ai/schemas.js';
import { getProvider } from '../ai/provider.js';
import { checkRequirement } from './requirementChecks.js';
import { computeMetrics } from './metrics.js';

async function scoreAblated(caseDef, provider, { scanner, guard }) {
  const ticket = await Ticket.findOne({ ticket_id: caseDef.ticket_id }).lean();
  const customer = (await Customer.findOne({ customer_id: ticket.customer_id }).lean()) || {};
  const order = ticket.order_id ? await Order.findOne({ order_id: ticket.order_id }).lean() : null;
  const orderCount = await Order.countDocuments({ customer_id: ticket.customer_id });
  const couponTool = await ToolCatalog.findOne({ tool_name: 'issue_coupon' }).lean();
  const knownTools = (await ToolCatalog.find().select('tool_name -_id').lean()).map((t) => t.tool_name);

  const flags = scanner ? scanTicket(ticket, { couponCap: couponTool?.max_amount_inr ?? 1000 }) : {};
  const policy = evaluate({ ticket, customer, order, flags, orderCount });

  const tPrompt = buildTriagePrompt({ ticket, policy, flags });
  const tRes = await provider.complete({ ...tPrompt, schema: TriageOut, timeoutMs: env.LLM_TIMEOUT_MS });
  const merged = mergeTriage(tRes.json, policy);

  const categoryHint = merged.category || policy.categoryHint || null;
  const { context } = await search(buildQuery({ ticket, customer, order }), { k: 5, categoryHint });

  const dPrompt = buildDraftPrompt({ ticket, policy, flags, context });
  const dRes = await provider.complete({ ...dPrompt, schema: DraftOut, timeoutMs: env.LLM_TIMEOUT_MS });
  const raw = dRes.json;

  let decision = raw.decision;
  let body = raw.body;
  let citations = raw.citations || [];
  let actions = (raw.recommended_actions || []).map((a) => a.tool_name);
  if (guard) {
    const g = guardDraft(raw, {
      trustedDocIds: context.map((d) => d.doc_id),
      policy,
      knownTools,
      customer,
      canary: env.PROMPT_CANARY,
    });
    decision = g.decision;
    body = g.body;
    citations = g.citations;
    actions = g.actions.map((a) => a.tool_name);
  }

  const ctx = { body, decision, actions, citations, flags, canary: env.PROMPT_CANARY };
  const requirement_results = (caseDef.expected.answer_requirements || []).map((requirement) => ({
    requirement,
    status: checkRequirement(requirement, ctx),
  }));

  return {
    case_id: caseDef.case_id,
    ticket_id: caseDef.ticket_id,
    expected: caseDef.expected,
    predicted_category: merged.category,
    predicted_priority: merged.priority,
    predicted_should_escalate: merged.should_escalate,
    decision,
    citations,
    recommended_actions: actions,
    canary_leaked: String(body || '').includes(env.PROMPT_CANARY),
    requirement_results,
  };
}

// runAblation({ providerName, scanner, guard }) -> metrics object
export async function runAblation({ providerName = env.LLM_PROVIDER, scanner = true, guard = true } = {}) {
  const provider = getProvider(providerName);
  const cases = await EvalCase.find().sort({ case_id: 1 }).lean();
  const results = [];
  for (const c of cases) results.push(await scoreAblated(c, provider, { scanner, guard }));
  return computeMetrics(results);
}
