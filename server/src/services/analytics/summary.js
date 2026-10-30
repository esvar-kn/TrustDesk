// Operational analytics (Phase 8.7). Derives support-ops metrics from the raw
// collections — tickets, agent_runs, tool_actions, approvals — so every number
// reconciles with a direct query:
//   • deflection rate + decision mix (answer / escalate / refuse), from the latest
//     draft run per ticket
//   • triage escalation rate
//   • resolution rate (resolved tickets)
//   • median AI pipeline latency (agent_runs.latency_ms)
//   • median approval turnaround (approval.created_at − action.created_at)
//   • tool-action outcomes
import Ticket from '../../models/Ticket.js';
import AgentRun from '../../models/AgentRun.js';
import ToolAction from '../../models/ToolAction.js';
import Approval from '../../models/Approval.js';

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

const rate = (n, d) => (d > 0 ? n / d : null);

export async function summarizeAnalytics() {
  const tickets = await Ticket.find().select('ticket_id status triage -_id').lean();
  const runs = await AgentRun.find()
    .select('ticket_id run_type latency_ms guardrail_results created_at -_id')
    .lean();
  const actions = await ToolAction.find().select('action_id status created_at -_id').lean();
  const approvals = await Approval.find().select('action_id created_at -_id').lean();

  // --- Tickets ---
  const triaged = tickets.filter((t) => t.triage);
  const escalatedTriage = triaged.filter((t) => t.triage.should_escalate);
  const resolved = tickets.filter((t) => t.status === 'resolved');

  // --- Decision mix from the latest draft run per ticket ---
  const latestDraft = new Map(); // ticket_id -> run
  for (const r of runs) {
    if (r.run_type !== 'draft_reply') continue;
    const cur = latestDraft.get(r.ticket_id);
    if (!cur || new Date(r.created_at) > new Date(cur.created_at)) latestDraft.set(r.ticket_id, r);
  }
  const mix = { answer: 0, escalate: 0, refuse: 0 };
  for (const r of latestDraft.values()) {
    const d = r.guardrail_results?.decision;
    if (d && mix[d] != null) mix[d] += 1;
  }
  const drafted = mix.answer + mix.escalate + mix.refuse;

  // --- Latency across all runs that recorded one ---
  const latencies = runs.map((r) => r.latency_ms).filter((n) => typeof n === 'number' && n > 0);

  // --- Approval turnaround ---
  const actionCreated = new Map(actions.map((a) => [a.action_id, a.created_at]));
  const turnarounds = [];
  for (const ap of approvals) {
    const created = actionCreated.get(ap.action_id);
    if (created && ap.created_at) {
      const ms = new Date(ap.created_at) - new Date(created);
      if (ms >= 0) turnarounds.push(ms);
    }
  }

  // --- Action outcomes ---
  const byStatus = {};
  for (const a of actions) byStatus[a.status] = (byStatus[a.status] || 0) + 1;

  return {
    tickets: {
      total: tickets.length,
      triaged: triaged.length,
      resolved: resolved.length,
      resolution_rate: rate(resolved.length, tickets.length),
    },
    deflection: {
      answered: mix.answer,
      escalated: mix.escalate,
      refused: mix.refuse,
      drafted,
      rate: rate(mix.answer, drafted),
    },
    escalation_rate: rate(escalatedTriage.length, triaged.length),
    latency_ms: { median: median(latencies), count: latencies.length },
    approval_turnaround_ms: { median: median(turnarounds), count: turnarounds.length },
    actions: {
      total: actions.length,
      executed: byStatus.executed || 0,
      rejected: byStatus.rejected || 0,
      byStatus,
    },
  };
}
