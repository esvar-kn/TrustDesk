// Operations Analytics (Phase 8.7). Support-ops metrics from GET /api/analytics —
// deflection, resolution and escalation rates, median AI latency and approval
// turnaround, the draft decision mix, and tool-action outcomes. Every number is
// derived from the raw collections, so it reconciles with a direct query.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Card, CardHead, btnOutline, Banner } from './ui.jsx';
import { Badge } from './Badges.jsx';

const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
function fmtMs(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60000).toFixed(1)} min`;
}

function Stat({ label, value, sub, icon, tone }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <span className="text-label-md uppercase tracking-wide text-on-surface-variant">{label}</span>
        <span className={`material-symbols-outlined text-[18px] ${tone || 'text-on-surface-variant'}`}>{icon}</span>
      </div>
      <div className="text-headline-xl font-semibold mt-space-xs tnum">{value}</div>
      {sub && <div className="text-body-sm text-on-surface-variant mt-space-2xs">{sub}</div>}
    </Card>
  );
}

const MIX_TONE = { answer: 'bg-status-safe-fg', escalate: 'bg-status-escalated-fg', refuse: 'bg-status-blocked-fg' };

export default function AnalyticsView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await api('/analytics'));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const mix = data?.deflection;
  const mixTotal = mix?.drafted || 0;
  const outcomes = data ? Object.entries(data.actions.byStatus).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div className="flex flex-col gap-space-lg">
      <div className="flex items-start justify-between gap-space-md">
        <div className="flex flex-col gap-space-2xs">
          <h1 className="flex items-center gap-space-sm text-headline-lg font-semibold">
            <span className="material-symbols-outlined text-[22px] text-primary-container">monitoring</span>
            Operations Analytics
          </h1>
          <p className="text-body-md text-on-surface-variant">
            Support-ops metrics derived from tickets, agent runs, and tool actions.
          </p>
        </div>
        <button className={btnOutline} onClick={load} disabled={loading}>
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <Banner tone="blocked">{error}</Banner>}
      {loading && !data && <p className="text-body-md text-on-surface-variant">Loading analytics…</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-space-lg">
            <Stat
              label="Deflection rate"
              value={pct(data.deflection.rate)}
              sub={`${data.deflection.answered}/${data.deflection.drafted} drafts answered`}
              icon="task_alt"
              tone="text-status-safe-fg"
            />
            <Stat
              label="Resolution rate"
              value={pct(data.tickets.resolution_rate)}
              sub={`${data.tickets.resolved}/${data.tickets.total} tickets resolved`}
              icon="done_all"
            />
            <Stat
              label="Escalation rate"
              value={pct(data.escalation_rate)}
              sub={`of ${data.tickets.triaged} triaged`}
              icon="alt_route"
              tone="text-status-escalated-fg"
            />
            <Stat
              label="Median AI latency"
              value={fmtMs(data.latency_ms.median)}
              sub={`over ${data.latency_ms.count} runs`}
              icon="speed"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-lg">
            <Card>
              <CardHead icon="schedule" title="Approval turnaround" />
              <div className="text-headline-xl font-semibold tnum">{fmtMs(data.approval_turnaround_ms.median)}</div>
              <p className="text-body-sm text-on-surface-variant mt-space-2xs">
                median over {data.approval_turnaround_ms.count} decisions
              </p>
            </Card>

            <Card className="lg:col-span-2">
              <CardHead icon="donut_small" title="Draft decision mix" />
              {mixTotal === 0 ? (
                <p className="text-body-md text-on-surface-variant">No drafts generated yet.</p>
              ) : (
                <div className="flex flex-col gap-space-md">
                  {['answer', 'escalate', 'refuse'].map((k) => (
                    <div key={k} className="flex flex-col gap-space-2xs">
                      <div className="flex items-center justify-between text-body-sm">
                        <span className="capitalize text-on-surface">{k}</span>
                        <span className="mono text-code-sm tnum text-on-surface-variant">
                          {mix[k === 'answer' ? 'answered' : k === 'escalate' ? 'escalated' : 'refused']}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-surface-container-high overflow-hidden">
                        <div
                          className={`h-full ${MIX_TONE[k]}`}
                          style={{
                            width: `${Math.round(
                              (mix[k === 'answer' ? 'answered' : k === 'escalate' ? 'escalated' : 'refused'] / mixTotal) * 100,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card>
            <CardHead icon="bolt" title="Tool-action outcomes">
              <span className="mono text-code-sm text-on-surface-variant">{data.actions.total} total</span>
            </CardHead>
            {outcomes.length === 0 ? (
              <p className="text-body-md text-on-surface-variant">No actions requested yet.</p>
            ) : (
              <ul className="flex flex-wrap gap-space-sm">
                {outcomes.map(([status, n]) => (
                  <li key={status}>
                    <Badge tone={status === 'executed' ? 'safe' : status === 'rejected' || status === 'failed' ? 'blocked' : 'pending'}>
                      {status.replace(/_/g, ' ')} · {n}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
