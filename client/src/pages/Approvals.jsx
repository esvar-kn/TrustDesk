// Approvals — Manager Authorization Gateway (Phase 7.5). A two-pane gateway:
// a pending-actions queue and a detail pane with payload inspection, the
// idempotency guarantee, a policy / return-window reference, the manager
// sign-off (approve / reject), and the execution stepper + execute. All wired to
// the real tool-action endpoints, role-gated, with server-enforced no-self-approval.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Card, CardHead, Field, Banner, btnPrimary, btnDanger, btnOutline } from '../components/ui.jsx';
import { Badge } from '../components/Badges.jsx';

const TOOL_TITLE = {
  create_replacement_order: 'Create replacement order',
  start_refund_review: 'Start refund review',
  issue_coupon: 'Issue goodwill coupon',
  open_carrier_investigation: 'Open carrier investigation',
  lock_account: 'Lock account',
  escalate_to_human: 'Escalate to human',
};
const TOOL_CATEGORY = {
  create_replacement_order: 'replacement',
  start_refund_review: 'refund',
  issue_coupon: 'credit',
};
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'replacement', label: 'Replacement' },
  { id: 'refund', label: 'Refund' },
  { id: 'credit', label: 'Credit' },
];
const RISK_TONE = { low: 'safe', medium: 'pending', high: 'blocked' };
const STATUS_TONE = {
  approval_required: 'pending',
  approved: 'escalated',
  executing: 'pending',
  executed: 'safe',
  rejected: 'blocked',
  failed: 'blocked',
};
const fmtDate = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '—');

function holdTime(iso) {
  if (!iso) return '—';
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (Number.isNaN(mins)) return '—';
  if (mins < 60) return `${mins}m waiting`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h waiting`;
  return `${Math.round(hrs / 24)}d waiting`;
}

function StepNode({ label, sub, state }) {
  const icon = state === 'done' ? 'check_circle' : state === 'current' ? 'radio_button_checked' : 'radio_button_unchecked';
  const color = state === 'done' ? 'text-primary-container' : state === 'current' ? 'text-status-escalated-fg' : 'text-outline';
  return (
    <li className="flex flex-col items-center gap-space-2xs text-center flex-1">
      <span className={`material-symbols-outlined text-[20px] ${color}`}>{icon}</span>
      <span className="text-label-md text-on-surface">{label}</span>
      <span className="mono text-code-sm text-on-surface-variant">{sub}</span>
    </li>
  );
}

export default function Approvals({ user, onOpenTicket }) {
  const [actions, setActions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [ticketCtx, setTicketCtx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(null);
  const isManager = user?.role === 'manager';

  const load = useCallback(async () => {
    try {
      const rows = await api('/tool-actions');
      setActions(rows);
      setSelectedId((cur) => cur ?? rows.find((a) => a.status === 'approval_required')?.action_id ?? rows[0]?.action_id ?? null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(() => actions.find((a) => a.action_id === selectedId) || null, [actions, selectedId]);

  // Ticket context for the selected action (customer/order → return-window timeline).
  useEffect(() => {
    if (!selected) {
      setTicketCtx(null);
      return;
    }
    let live = true;
    api(`/tickets/${selected.ticket_id}`)
      .then((t) => live && setTicketCtx(t))
      .catch(() => live && setTicketCtx(null));
    return () => {
      live = false;
    };
  }, [selected]);

  const counts = useMemo(() => {
    const c = { all: actions.length };
    for (const a of actions) {
      const cat = TOOL_CATEGORY[a.tool_name];
      if (cat) c[cat] = (c[cat] || 0) + 1;
    }
    return c;
  }, [actions]);

  const visible = useMemo(() => {
    const ordered = [...actions].sort((a, b) => {
      const pa = a.status === 'approval_required' ? 0 : 1;
      const pb = b.status === 'approval_required' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    return filter === 'all' ? ordered : ordered.filter((a) => TOOL_CATEGORY[a.tool_name] === filter);
  }, [actions, filter]);

  const pendingCount = actions.filter((a) => a.status === 'approval_required').length;

  async function act(key, fn) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      setReason('');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  const decide = (decision) =>
    act(decision, () =>
      api(`/tool-actions/${selected.action_id}/approve`, {
        method: 'POST',
        body: { decision, reason: reason.trim() || `${decision} via gateway` },
      }),
    );
  const execute = () =>
    act('execute', () => api(`/tool-actions/${selected.action_id}/execute`, { method: 'POST' }));

  // Download the deterministic, signed compliance packet for this action.
  async function exportPacket() {
    setBusy('export');
    setError(null);
    try {
      const packet = await api(`/tool-actions/${selected.action_id}/audit-packet`);
      const text = JSON.stringify(packet, null, 2);
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-packet-${selected.action_id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  const isRequester = selected && selected.requested_by === user?.username;
  const order = ticketCtx?.order;
  const withinWindow =
    order?.eligible_return_until && ticketCtx
      ? new Date(ticketCtx.created_at) <= new Date(`${order.eligible_return_until}T23:59:59Z`)
      : null;

  return (
    <div className="h-full overflow-hidden grid grid-cols-1 lg:grid-cols-[320px_1fr]">
      {/* Pending queue */}
      <aside className="border-r border-rule overflow-y-auto p-space-lg flex flex-col gap-space-md">
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-headline-sm font-semibold">Pending Actions</h2>
            <Badge tone="pending">Live queue</Badge>
          </div>
          <p className="text-body-sm text-on-surface-variant mt-space-2xs">
            {pendingCount} require explicit approval
          </p>
        </div>

        <div className="flex flex-wrap gap-space-2xs">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`flex items-center gap-space-2xs px-space-sm py-space-2xs rounded text-label-sm border transition-colors ${
                filter === f.id
                  ? 'bg-primary-container text-on-primary border-primary-container'
                  : 'bg-surface-container-lowest text-on-surface-variant border-rule hover:bg-surface-container-low'
              }`}
            >
              {f.label}
              <span className="mono text-code-sm opacity-80">{counts[f.id] || 0}</span>
            </button>
          ))}
        </div>

        {loading && <p className="text-body-sm text-on-surface-variant">Loading…</p>}
        {!loading && visible.length === 0 && (
          <p className="text-body-sm text-on-surface-variant">No actions in this view.</p>
        )}

        <ul className="flex flex-col gap-space-sm">
          {visible.map((a) => {
            const active = a.action_id === selectedId;
            const amount = a.payload?.amount;
            return (
              <li key={a.action_id}>
                <button
                  onClick={() => setSelectedId(a.action_id)}
                  className={`w-full text-left rounded-lg border p-space-md flex flex-col gap-space-xs transition-colors ${
                    active
                      ? 'border-primary-container bg-surface-container ring-1 ring-primary-container'
                      : 'border-rule bg-surface-container-lowest hover:bg-surface-container-low'
                  }`}
                >
                  <div className="flex items-center justify-between gap-space-sm">
                    <span className="mono text-code-sm text-on-surface-variant">{a.tool_name}</span>
                    <Badge tone={RISK_TONE[a.risk_level] || 'neutral'}>
                      {a.risk_level || 'low'} risk{amount ? ` · ₹${amount}` : ''}
                    </Badge>
                  </div>
                  <span className="mono text-code-sm text-on-surface-variant">{a.ticket_id}</span>
                  <div className="flex items-center justify-between gap-space-sm">
                    <Badge tone={STATUS_TONE[a.status] || 'neutral'}>{a.status.replace(/_/g, ' ')}</Badge>
                    <span className="flex items-center gap-space-2xs text-code-sm mono text-outline">
                      <span className="material-symbols-outlined text-[13px]">schedule</span>
                      {holdTime(a.created_at)}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Detail */}
      <div className="overflow-y-auto p-space-lg">
        {error && <div className="mb-space-md"><Banner tone="blocked">{error}</Banner></div>}
        {!selected ? (
          <p className="text-body-md text-on-surface-variant">Select a pending action to review.</p>
        ) : (
          <div className="max-w-4xl flex flex-col gap-space-lg">
            {/* Header */}
            <Card>
              <div className="flex flex-wrap items-center gap-space-sm mb-space-sm">
                <Badge tone={STATUS_TONE[selected.status] || 'neutral'}>{selected.status.replace(/_/g, ' ')}</Badge>
                <span className="mono text-code-sm text-on-surface-variant">TOOL: {selected.tool_name}</span>
              </div>
              <div className="flex items-start justify-between gap-space-md">
                <h1 className="text-headline-lg font-semibold">{TOOL_TITLE[selected.tool_name] || selected.tool_name}</h1>
                <button className={btnOutline} onClick={exportPacket} disabled={busy === 'export'}>
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  {busy === 'export' ? 'Exporting…' : 'Export audit packet'}
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-space-md mt-space-md">
                <Field label="Ticket" mono>
                  <button className="text-primary-container hover:underline" onClick={() => onOpenTicket(selected.ticket_id)}>
                    {selected.ticket_id}
                  </button>
                </Field>
                <Field label="Requester">{selected.requested_by || '—'}</Field>
                <Field label="Submitted" mono>{selected.created_at ? new Date(selected.created_at).toLocaleString() : '—'}</Field>
                <Field label="Risk">
                  <Badge tone={RISK_TONE[selected.risk_level] || 'neutral'}>{selected.risk_level || 'low'}</Badge>
                </Field>
              </div>
            </Card>

            {/* Reasoning / context */}
            <Card>
              <CardHead icon="smart_toy" title="AI Agent Reasoning & Context" />
              <p className="text-body-md">
                <span className="font-medium">Reason: </span>
                {selected.payload?.reason || '—'}
              </p>
              <div className="flex flex-wrap gap-space-md mt-space-md text-body-sm text-on-surface-variant">
                <span className="flex items-center gap-space-2xs">
                  <span className="material-symbols-outlined text-[16px] text-status-safe-fg">verified_user</span>
                  Requested through the guarded pipeline
                </span>
                <span className="flex items-center gap-space-2xs">
                  <span className="material-symbols-outlined text-[16px] text-primary-container">policy</span>
                  Policy allowed this tool
                </span>
              </div>
            </Card>

            {/* Payload inspection */}
            <Card>
              <CardHead icon="data_object" title="Action Payload Inspection" />
              <table className="w-full text-body-md">
                <tbody>
                  {Object.entries(selected.payload || {})
                    .filter(([k]) => k !== 'idempotency_key')
                    .map(([k, v]) => (
                      <tr key={k} className="border-b border-rule last:border-0">
                        <td className="py-space-xs pr-space-md text-label-md uppercase tracking-wide text-on-surface-variant whitespace-nowrap">
                          {k.replace(/_/g, ' ')}
                        </td>
                        <td className="py-space-xs mono text-code-md text-on-surface">{String(v)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <div className="mt-space-md rounded-md bg-surface-container-low border border-rule p-space-md">
                <span className="flex items-center gap-space-xs text-label-sm uppercase tracking-wide text-on-surface-variant">
                  <span className="material-symbols-outlined text-[16px]">key</span>
                  Idempotency key
                </span>
                <div className="mono text-code-md mt-space-2xs break-all">{selected.idempotency_key}</div>
                <p className="text-body-sm text-on-surface-variant mt-space-xs">
                  Retries with this key never create a second record.
                </p>
              </div>
            </Card>

            {/* Policy governance + return window */}
            <Card>
              <CardHead icon="balance" title="Policy Governance Reference" />
              <div className="flex flex-wrap items-center gap-space-sm">
                {ticketCtx?.triage?.category && <Badge tone="neutral">{ticketCtx.triage.category}</Badge>}
                {withinWindow !== null && (
                  <Badge tone={withinWindow ? 'safe' : 'blocked'}>
                    {withinWindow ? 'Within return window' : 'Return window elapsed'}
                  </Badge>
                )}
              </div>
              {order?.delivered_at && order?.eligible_return_until && (
                <ol className="flex items-start justify-between mt-space-md">
                  <StepNode label="Delivered" sub={fmtDate(order.delivered_at)} state="done" />
                  <StepNode label="Ticket" sub={fmtDate(ticketCtx.created_at)} state={withinWindow ? 'current' : 'done'} />
                  <StepNode label="Window end" sub={fmtDate(order.eligible_return_until)} state={withinWindow ? 'future' : 'done'} />
                </ol>
              )}
            </Card>

            {/* Manager sign-off */}
            <Card>
              <CardHead icon="approval" title="Manager Authorization Sign-off" />
              {!isManager ? (
                <Banner tone="pending">Read-only — approval and execution require a manager.</Banner>
              ) : selected.status === 'approval_required' ? (
                <>
                  <label className="text-label-md uppercase tracking-wide text-on-surface-variant">
                    Decision reason &amp; audit annotation
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="Why are you approving or rejecting this action?"
                    className="mt-space-xs w-full rounded-md border border-rule bg-surface-container-lowest p-space-md text-body-md outline-none focus:border-focus-ring focus:ring-2 focus:ring-focus-ring/30"
                  />
                  {isRequester && (
                    <p className="mt-space-sm flex items-center gap-space-xs text-body-sm text-status-pending-fg">
                      <span className="material-symbols-outlined text-[16px]">info</span>
                      You requested this action — a different manager must approve it.
                    </p>
                  )}
                  <div className="flex items-center gap-space-sm mt-space-md">
                    <button
                      className={btnPrimary}
                      disabled={busy === 'approved' || isRequester}
                      onClick={() => decide('approved')}
                    >
                      <span className="material-symbols-outlined text-[16px]">verified</span>
                      {busy === 'approved' ? 'Signing…' : 'Approve & Sign'}
                    </button>
                    <button className={btnDanger} disabled={busy === 'rejected'} onClick={() => decide('rejected')}>
                      <span className="material-symbols-outlined text-[16px]">close</span>
                      Reject
                    </button>
                  </div>
                </>
              ) : (
                <Banner tone={selected.status === 'rejected' ? 'blocked' : 'safe'}>
                  This action is {selected.status.replace(/_/g, ' ')}.
                </Banner>
              )}
            </Card>

            {/* Execution */}
            <Card>
              <CardHead icon="rocket_launch" title="Execution State" />
              <ol className="flex items-start justify-between">
                <StepNode label="Requested" sub={selected.requested_by || '—'} state="done" />
                <StepNode
                  label="Approved"
                  sub={['approved', 'executing', 'executed'].includes(selected.status) ? 'signed' : selected.status === 'rejected' ? 'rejected' : 'pending'}
                  state={['approved', 'executing', 'executed'].includes(selected.status) ? 'done' : selected.status === 'rejected' ? 'done' : 'future'}
                />
                <StepNode
                  label="Executed"
                  sub={selected.status === 'executed' ? 'done' : 'pending'}
                  state={selected.status === 'executed' ? 'done' : selected.status === 'approved' ? 'current' : 'future'}
                />
              </ol>

              {isManager && selected.status === 'approved' && (
                <button className={`${btnPrimary} w-full mt-space-md`} disabled={busy === 'execute'} onClick={execute}>
                  <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                  {busy === 'execute' ? 'Executing…' : 'Execute action'}
                </button>
              )}

              {selected.result && (
                <div className="mt-space-md rounded-md border border-status-safe-outline bg-status-safe-bg p-space-md">
                  <span className="flex items-center gap-space-xs text-label-md font-semibold text-status-safe-fg">
                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                    {selected.result.replacement_id || selected.result.refund_review_id || 'Executed'}
                  </span>
                  <pre className="mono text-code-sm text-on-surface-variant mt-space-xs whitespace-pre-wrap break-all">
                    {JSON.stringify(selected.result, null, 2)}
                  </pre>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
