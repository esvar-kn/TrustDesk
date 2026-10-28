// AI Execution Trace (Phase 7.6). Renders an agent-run as deterministic,
// numbered steps built from the run's own fields: scanner flags, retrieved vs
// quarantined docs, policy allow/deny, and the action boundary — plus the raw
// execution JSON with copy / export. Everything shown is real run data; no
// invented telemetry (cosine scores, token cost, "drift %") is fabricated.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badge } from './Badges.jsx';
import { btnOutline, Banner } from './ui.jsx';

const STATUS_TONE = { succeeded: 'safe', escalated: 'escalated', refused: 'blocked', failed: 'blocked' };
const FLAG_LABELS = {
  override: 'instruction override',
  exfiltration: 'secret exfiltration',
  concealment: 'reviewer concealment',
  identity_bypass: 'identity bypass',
  coupon_over_cap: 'coupon over cap',
};

function Step({ n, icon, title, meta, last, children }) {
  return (
    <div className="flex gap-space-sm">
      <div className="flex flex-col items-center">
        <span className="flex items-center justify-center h-6 w-6 shrink-0 rounded-full bg-primary-container text-on-primary text-label-sm font-semibold">
          {n}
        </span>
        {!last && <span className="flex-1 w-px bg-rule my-space-2xs" />}
      </div>
      <div className="flex-1 pb-space-md min-w-0">
        <div className="flex items-center justify-between gap-space-sm">
          <span className="flex items-center gap-space-xs text-label-md font-semibold">
            <span className="material-symbols-outlined text-[16px] text-primary-container">{icon}</span>
            {title}
          </span>
          {meta && <span className="mono text-code-sm text-on-surface-variant shrink-0">{meta}</span>}
        </div>
        <div className="mt-space-xs text-body-sm">{children}</div>
      </div>
    </div>
  );
}

function DocList({ ids, tone = 'neutral' }) {
  if (!ids?.length) return <span className="text-on-surface-variant">none</span>;
  return (
    <div className="flex flex-wrap gap-space-2xs">
      {ids.map((id) => (
        <span key={id} className="mono text-code-sm">
          <Badge tone={tone}>{id}</Badge>
        </span>
      ))}
    </div>
  );
}

export default function TraceDrawer({ ticketId }) {
  const [runs, setRuns] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const loadRuns = useCallback(async () => {
    if (!ticketId) return;
    try {
      const r = await api(`/tickets/${ticketId}/runs`);
      setRuns(r);
      setSelectedId((cur) => cur ?? r[0]?.run_id ?? null);
    } catch (e) {
      setError(e.message);
    }
  }, [ticketId]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let live = true;
    api(`/agent-runs/${selectedId}`)
      .then((d) => live && setDetail(d))
      .catch(() => live && setDetail(runs.find((r) => r.run_id === selectedId) || null));
    return () => {
      live = false;
    };
  }, [selectedId, runs]);

  if (!ticketId) return <p className="text-body-md text-on-surface-variant">Select a ticket to see its run trace.</p>;

  const run = detail;
  const gr = run?.guardrail_results || {};
  const flags = Object.keys(FLAG_LABELS).filter((k) => gr.flags?.[k]);

  async function copyPayload() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(run, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  function exportTrace() {
    const blob = new Blob([`${JSON.stringify(run)}\n`], { type: 'application/x-ndjson' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${run.run_id}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-space-md">
      {error && <Banner tone="blocked">{error}</Banner>}

      {runs.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant">No runs yet — run triage or draft on this ticket.</p>
      ) : (
        <>
          {/* Run selector */}
          <div className="flex flex-wrap gap-space-xs">
            {runs.map((r) => (
              <button
                key={r.run_id}
                onClick={() => setSelectedId(r.run_id)}
                className={`flex items-center gap-space-2xs px-space-sm py-space-2xs rounded border text-label-sm transition-colors ${
                  selectedId === r.run_id
                    ? 'bg-primary-container text-on-primary border-primary-container'
                    : 'bg-surface-container-low text-on-surface-variant border-rule hover:bg-surface-container'
                }`}
              >
                {r.run_type?.replace(/_/g, ' ') || 'run'}
                <span className="mono text-code-sm opacity-80">{r.run_id?.slice(-4)}</span>
              </button>
            ))}
          </div>

          {!run ? (
            <p className="text-body-sm text-on-surface-variant">Loading trace…</p>
          ) : (
            <>
              {/* Telemetry header */}
              <div className="rounded-lg border border-rule bg-surface-container-low p-space-md flex flex-col gap-space-sm">
                <div className="flex items-center justify-between gap-space-sm">
                  <span className="flex items-center gap-space-xs mono text-code-md">
                    <span className="material-symbols-outlined text-[16px] text-primary-container">tag</span>
                    {run.run_id}
                  </span>
                  <Badge tone={STATUS_TONE[run.status] || 'neutral'} icon="check_circle">
                    {run.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-space-sm text-body-sm">
                  <div className="flex flex-col">
                    <span className="text-label-sm uppercase text-on-surface-variant">Engine</span>
                    <span className="mono text-code-md">{run.model_name || run.model_provider || '—'}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-label-sm uppercase text-on-surface-variant">Latency</span>
                    <span className="mono text-code-md">{run.latency_ms != null ? `${run.latency_ms}ms` : '—'}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-label-sm uppercase text-on-surface-variant">Prompt</span>
                    <span className="mono text-code-md">{run.prompt_version || '—'}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-label-sm uppercase text-on-surface-variant">When</span>
                    <span className="mono text-code-sm">{run.created_at ? new Date(run.created_at).toLocaleTimeString() : '—'}</span>
                  </div>
                </div>
                <span className="flex items-center gap-space-xs text-code-sm mono text-primary-container">
                  <span className="material-symbols-outlined text-[14px]">verified</span>
                  Deterministic pipeline
                </span>
              </div>

              {/* Numbered steps */}
              <div className="rounded-lg border border-rule bg-surface-container-lowest p-space-md">
                <Step n={1} icon="security" title="Input Sanitization & Security Scan">
                  {flags.length ? (
                    <div className="flex flex-wrap gap-space-2xs">
                      {flags.map((f) => (
                        <Badge key={f} tone="blocked">{FLAG_LABELS[f]}</Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="flex items-center gap-space-xs text-status-safe-fg">
                      <span className="material-symbols-outlined text-[16px]">check</span>
                      No adversarial flags
                    </span>
                  )}
                </Step>

                <Step
                  n={2}
                  icon="plagiarism"
                  title="Grounding Knowledge Retrieval"
                  meta={`${run.retrieved_doc_ids?.length || 0} retrieved`}
                >
                  <DocList ids={run.retrieved_doc_ids} tone="neutral" />
                  {run.quarantined_doc_ids?.length > 0 && (
                    <div className="mt-space-xs">
                      <span className="text-label-sm uppercase text-status-blocked-fg">Quarantined</span>
                      <div className="mt-space-2xs">
                        <DocList ids={run.quarantined_doc_ids} tone="blocked" />
                      </div>
                    </div>
                  )}
                </Step>

                <Step n={3} icon="rule" title="Deterministic Policy Verification">
                  <div className="flex flex-col gap-space-xs">
                    <div className="flex items-center gap-space-xs">
                      <span className="text-on-surface-variant">decision:</span>
                      <Badge tone={STATUS_TONE[run.status] || 'neutral'}>{gr.decision || run.status}</Badge>
                    </div>
                    {gr.policy_allowed?.length > 0 && (
                      <div>
                        <span className="text-label-sm uppercase text-on-surface-variant">Allowed</span>
                        <div className="mt-space-2xs"><DocList ids={gr.policy_allowed} tone="safe" /></div>
                      </div>
                    )}
                    {gr.policy_denied?.length > 0 && (
                      <div>
                        <span className="text-label-sm uppercase text-on-surface-variant">Denied</span>
                        <div className="mt-space-2xs"><DocList ids={gr.policy_denied} tone="blocked" /></div>
                      </div>
                    )}
                  </div>
                </Step>

                <Step n={4} icon="bolt" title="Action Boundary" last>
                  {run.tool_calls?.length ? (
                    <div className="flex flex-col gap-space-2xs">
                      {run.tool_calls.map((t, i) => (
                        <span key={i} className="flex items-center gap-space-xs mono text-code-sm">
                          <Badge tone="neutral">{t.status || 'recommended'}</Badge>
                          {t.tool_name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-on-surface-variant">No tool calls recommended.</span>
                  )}
                </Step>
              </div>

              {/* Raw JSON + actions */}
              <div className="rounded-lg border border-rule bg-surface-container-lowest">
                <button
                  onClick={() => setShowJson((v) => !v)}
                  className="w-full flex items-center justify-between gap-space-sm px-space-md py-space-sm text-label-md"
                >
                  <span className="flex items-center gap-space-xs">
                    <span className="material-symbols-outlined text-[16px] text-primary-container">data_object</span>
                    Complete Execution JSON
                  </span>
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                    {showJson ? 'expand_less' : 'expand_more'}
                  </span>
                </button>
                {showJson && (
                  <pre className="mono text-code-sm leading-relaxed px-space-md pb-space-md overflow-x-auto max-h-80 overflow-y-auto">
                    {JSON.stringify(run, null, 2)}
                  </pre>
                )}
              </div>

              <div className="flex items-center gap-space-sm">
                <button className={btnOutline} onClick={copyPayload}>
                  <span className="material-symbols-outlined text-[16px]">{copied ? 'done' : 'content_copy'}</span>
                  {copied ? 'Copied' : 'Copy raw payload'}
                </button>
                <button className={btnOutline} onClick={exportTrace}>
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  Export trace (.jsonl)
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
