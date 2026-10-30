// Guardrail Incidents dashboard (Phase 8.4). A cross-ticket view of every scanner
// flag / SEV-1 block, aggregated from agent_runs via GET /agent-runs/incidents:
// flag-type counts, blocked-tool tallies, repeat-offender customers, a per-day
// trend, and the recent incident list (click a row to open the ticket).
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Card, CardHead, btnOutline, Banner } from './ui.jsx';
import { Badge } from './Badges.jsx';

const FLAG_META = {
  override: { label: 'Instruction override', icon: 'gavel' },
  exfiltration: { label: 'Secret exfiltration', icon: 'key' },
  concealment: { label: 'Reviewer concealment', icon: 'visibility_off' },
  identity_bypass: { label: 'Identity bypass', icon: 'badge' },
  coupon_over_cap: { label: 'Coupon over cap', icon: 'payments' },
};

const DECISION_TONE = { refuse: 'blocked', escalate: 'escalated', answer: 'safe' };
const fmtWhen = (iso) => (iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') : '—');

function Bar({ label, icon, count, max, tone = 'primary' }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  const fill = tone === 'blocked' ? 'bg-status-blocked-fg' : 'bg-primary-container';
  return (
    <div className="flex flex-col gap-space-2xs">
      <div className="flex items-center justify-between gap-space-sm text-body-sm">
        <span className="flex items-center gap-space-xs text-on-surface">
          {icon && <span className="material-symbols-outlined text-[16px] text-on-surface-variant">{icon}</span>}
          {label}
        </span>
        <span className="mono text-code-sm tnum text-on-surface-variant">{count}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-surface-container-high overflow-hidden">
        <div className={`h-full ${fill}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value, icon, tone }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <span className="text-label-md uppercase tracking-wide text-on-surface-variant">{label}</span>
        <span className={`material-symbols-outlined text-[18px] ${tone || 'text-on-surface-variant'}`}>{icon}</span>
      </div>
      <div className="text-headline-xl font-semibold mt-space-xs tnum">{value}</div>
    </Card>
  );
}

export default function GuardrailDashboard({ onOpenTicket }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await api('/agent-runs/incidents'));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const maxFlag = data ? Math.max(1, ...Object.values(data.flagCounts)) : 1;
  const toolEntries = data ? Object.entries(data.blockedTools).sort((a, b) => b[1] - a[1]) : [];
  const maxTool = toolEntries.length ? Math.max(1, ...toolEntries.map(([, n]) => n)) : 1;
  const blockedTotal = toolEntries.reduce((s, [, n]) => s + n, 0);
  const maxDay = data?.trend?.length ? Math.max(1, ...data.trend.map((d) => d.count)) : 1;

  return (
    <div className="flex flex-col gap-space-lg">
      <div className="flex items-start justify-between gap-space-md">
        <div className="flex flex-col gap-space-2xs">
          <h1 className="flex items-center gap-space-sm text-headline-lg font-semibold">
            <span className="material-symbols-outlined text-[22px] text-primary-container">security</span>
            Guardrail Incidents
          </h1>
          <p className="text-body-md text-on-surface-variant">
            Every scanner flag and blocked action across all tickets, from the agent-run audit log.
          </p>
        </div>
        <button className={btnOutline} onClick={load} disabled={loading}>
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <Banner tone="blocked">{error}</Banner>}
      {loading && !data && <p className="text-body-md text-on-surface-variant">Loading incidents…</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-space-lg">
            <Stat label="Flagged runs" value={data.totals.flagged} icon="gpp_maybe" tone="text-status-blocked-fg" />
            <Stat label="Total runs" value={data.totals.runs} icon="manage_search" />
            <Stat label="Repeat offenders" value={data.repeatOffenders.filter((c) => c.count > 1).length} icon="person_alert" />
            <Stat label="Blocked actions" value={blockedTotal} icon="block" tone="text-status-blocked-fg" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-lg">
            <Card>
              <CardHead icon="flag" title="Flag types" />
              <div className="flex flex-col gap-space-md">
                {Object.keys(FLAG_META).map((f) => (
                  <Bar key={f} label={FLAG_META[f].label} icon={FLAG_META[f].icon} count={data.flagCounts[f] || 0} max={maxFlag} />
                ))}
              </div>
            </Card>

            <Card>
              <CardHead icon="block" title="Blocked tools" />
              {toolEntries.length === 0 ? (
                <p className="text-body-md text-on-surface-variant">No tools have been blocked.</p>
              ) : (
                <div className="flex flex-col gap-space-md">
                  {toolEntries.map(([tool, n]) => (
                    <Bar key={tool} label={tool} icon="bolt" count={n} max={maxTool} tone="blocked" />
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-lg">
            <Card>
              <CardHead icon="person_alert" title="Repeat offenders" />
              {data.repeatOffenders.length === 0 ? (
                <p className="text-body-md text-on-surface-variant">No flagged customers.</p>
              ) : (
                <ul className="flex flex-col gap-space-sm">
                  {data.repeatOffenders.map((c) => (
                    <li key={c.customer_id} className="flex items-center justify-between gap-space-sm">
                      <span className="flex items-center gap-space-sm text-body-md">
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">person</span>
                        {c.name}
                        <span className="mono text-code-sm text-outline">{c.customer_id}</span>
                      </span>
                      <Badge tone={c.count > 1 ? 'blocked' : 'pending'}>
                        {c.count} {c.count === 1 ? 'flag' : 'flags'}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHead icon="timeline" title="Trend by day" />
              {data.trend.length === 0 ? (
                <p className="text-body-md text-on-surface-variant">No incidents recorded.</p>
              ) : (
                <div className="flex flex-col gap-space-sm">
                  {data.trend.map((d) => (
                    <Bar key={d.date} label={d.date} count={d.count} max={maxDay} tone="blocked" />
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card>
            <CardHead icon="list_alt" title="Recent incidents" />
            {data.incidents.length === 0 ? (
              <p className="text-body-md text-on-surface-variant">No incidents yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-body-sm">
                  <thead>
                    <tr className="text-label-sm uppercase tracking-wide text-on-surface-variant">
                      <th className="text-left font-medium py-space-xs pr-space-md">Ticket</th>
                      <th className="text-left font-medium py-space-xs pr-space-md">Customer</th>
                      <th className="text-left font-medium py-space-xs pr-space-md">Decision</th>
                      <th className="text-left font-medium py-space-xs pr-space-md">Flags</th>
                      <th className="text-left font-medium py-space-xs">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.incidents.map((i) => (
                      <tr
                        key={i.run_id}
                        onClick={() => onOpenTicket?.(i.ticket_id)}
                        className="border-t border-rule hover:bg-surface-container-low cursor-pointer"
                      >
                        <td className="mono text-code-md py-space-sm pr-space-md text-primary-container">{i.ticket_id}</td>
                        <td className="py-space-sm pr-space-md text-on-surface">{i.customer || '—'}</td>
                        <td className="py-space-sm pr-space-md">
                          <Badge tone={DECISION_TONE[i.decision] || 'neutral'}>{i.decision || '—'}</Badge>
                        </td>
                        <td className="py-space-sm pr-space-md">
                          <span className="inline-flex flex-wrap gap-space-2xs">
                            {i.flags.map((f) => (
                              <Badge key={f} tone="blocked" icon={FLAG_META[f]?.icon}>
                                {f}
                              </Badge>
                            ))}
                          </span>
                        </td>
                        <td className="mono text-code-sm py-space-sm text-on-surface-variant whitespace-nowrap">
                          {fmtWhen(i.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
