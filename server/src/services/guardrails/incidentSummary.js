// Guardrail incident summary (Phase 8.4). Aggregates every agent_runs trace into
// a cross-ticket view: how often each scanner flag fired, which tools were blocked
// during flagged runs, which customers repeat-offend, a per-day trend, and the
// recent incident list. Read-only — the numbers come straight from agent_runs.
import AgentRun from '../../models/AgentRun.js';
import Ticket from '../../models/Ticket.js';
import Customer from '../../models/Customer.js';

const FLAG_TYPES = ['override', 'exfiltration', 'concealment', 'identity_bypass', 'coupon_over_cap'];

export async function summarizeIncidents() {
  const runs = await AgentRun.find()
    .select('ticket_id run_id run_type status guardrail_results prompt_version created_at -_id')
    .lean();
  const tickets = await Ticket.find().select('ticket_id customer_id -_id').lean();
  const customers = await Customer.find().select('customer_id name -_id').lean();

  const ticketCustomer = new Map(tickets.map((t) => [t.ticket_id, t.customer_id]));
  const customerName = new Map(customers.map((c) => [c.customer_id, c.name]));

  const flagCounts = Object.fromEntries(FLAG_TYPES.map((f) => [f, 0]));
  const blockedTools = {};
  const byCustomer = {};
  const byDay = {};
  const incidents = [];
  let flaggedRuns = 0;

  for (const r of runs) {
    const g = r.guardrail_results || {};
    const flags = g.flags || {};
    if (!flags.any) continue;

    flaggedRuns++;
    for (const f of FLAG_TYPES) if (flags[f]) flagCounts[f]++;

    // Tools blocked by policy/guardrail during this incident.
    const denied = Array.isArray(g.policy_denied) ? g.policy_denied : [];
    for (const tool of denied) blockedTools[tool] = (blockedTools[tool] || 0) + 1;

    const cid = ticketCustomer.get(r.ticket_id);
    if (cid) {
      if (!byCustomer[cid]) {
        byCustomer[cid] = { customer_id: cid, name: customerName.get(cid) || cid, count: 0 };
      }
      byCustomer[cid].count++;
    }

    const day = (r.created_at ? new Date(r.created_at) : new Date()).toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;

    incidents.push({
      run_id: r.run_id,
      ticket_id: r.ticket_id,
      customer: cid ? customerName.get(cid) || cid : null,
      decision: g.decision || r.status || null,
      flags: FLAG_TYPES.filter((f) => flags[f]),
      violations: Array.isArray(g.violations) ? g.violations : [],
      denied,
      created_at: r.created_at,
    });
  }

  incidents.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return {
    totals: { runs: runs.length, flagged: flaggedRuns },
    flagCounts,
    blockedTools,
    repeatOffenders: Object.values(byCustomer).sort((a, b) => b.count - a.count),
    trend: Object.entries(byDay)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
    incidents: incidents.slice(0, 50),
  };
}
