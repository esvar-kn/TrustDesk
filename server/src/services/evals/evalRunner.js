// Eval runner: for each eval case in the selected set, run triage + draft
// through the pipeline (with the chosen provider), score the result, and
// aggregate metrics. `set` picks which cases to run:
//   'graded'  (default) — the gated cases (anything not marked holdout)
//   'holdout'           — only the held-out cases, reported apart
//   'all'               — graded + held-out together
import { env } from '../../config/env.js';
import Ticket from '../../models/Ticket.js';
import EvalCase from '../../models/EvalCase.js';
import { triageService } from '../triage/triageService.js';
import { draftService } from '../drafts/draftService.js';
import { scanTicket } from '../guardrails/inputScanner.js';
import { getProvider } from '../ai/provider.js';
import { checkRequirement } from './requirementChecks.js';
import { computeMetrics, averageMetrics } from './metrics.js';

async function scoreCase(caseDef, provider) {
  const ticketId = caseDef.ticket_id;
  const ticket = await Ticket.findOne({ ticket_id: ticketId }).lean();
  const { triage } = await triageService.run(ticketId, { provider });
  const dr = await draftService.run(ticketId, { provider });

  const flags = scanTicket(ticket);
  const actions = dr.draft.actions.map((a) => a.tool_name);
  const ctx = {
    body: dr.draft.body,
    decision: dr.decision,
    actions,
    citations: dr.draft.citations,
    flags,
    canary: env.PROMPT_CANARY,
  };
  const requirement_results = (caseDef.expected.answer_requirements || []).map((requirement) => ({
    requirement,
    status: checkRequirement(requirement, ctx),
  }));

  return {
    case_id: caseDef.case_id,
    ticket_id: ticketId,
    expected: caseDef.expected,
    predicted_category: triage.category,
    predicted_priority: triage.priority,
    predicted_should_escalate: triage.should_escalate,
    decision: dr.decision,
    citations: dr.draft.citations,
    recommended_actions: actions,
    canary_leaked: dr.draft.body.includes(env.PROMPT_CANARY),
    requirement_results,
  };
}

export async function runEval({ providerName = env.LLM_PROVIDER, repeat = 1, set = 'graded' } = {}) {
  const provider = getProvider(providerName);
  const filter =
    set === 'all' ? {} : set === 'holdout' ? { set: 'holdout' } : { set: { $ne: 'holdout' } };
  const cases = await EvalCase.find(filter).sort({ case_id: 1 }).lean();
  const started_at = new Date();

  const perRun = [];
  let lastResults = [];
  for (let i = 0; i < repeat; i += 1) {
    const results = [];
    for (const c of cases) results.push(await scoreCase(c, provider));
    perRun.push(computeMetrics(results));
    lastResults = results;
  }

  return {
    provider: providerName,
    model: env.LLM_MODEL || providerName,
    repeat,
    set,
    started_at,
    completed_at: new Date(),
    metrics: averageMetrics(perRun),
    metrics_per_run: perRun,
    case_results: lastResults,
  };
}

export const evalRunner = { runEval };
