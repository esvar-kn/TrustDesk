import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Card, CardHead, btnPrimary, btnDanger, Field, Banner } from './ui.jsx';
import { Badge } from './Badges.jsx';

const STATUS_TONE = {
  approval_required: 'pending',
  approved: 'escalated',
  executing: 'pending',
  executed: 'safe',
  rejected: 'blocked',
  failed: 'blocked',
};

// Deterministic idempotency key + prefilled payload for each tool.
function buildPayload(tool, { ticketId, customer, order }) {
  const anchor = order?.order_id || customer?.customer_id || ticketId;
  const base = { idempotency_key: `${ticketId}:${tool}:${anchor}` };
  switch (tool) {
    case 'create_replacement_order':
      return { ...base, order_id: order?.order_id, sku: order?.items?.[0]?.sku, reason: 'Reported damaged on arrival' };
    case 'start_refund_review':
      return { ...base, order_id: order?.order_id, amount: order?.total, reason: 'Duplicate/erroneous charge review' };
    case 'open_carrier_investigation':
      return { ...base, order_id: order?.order_id, tracking_number: order?.tracking_number, reason: 'Shipment not moving' };
    case 'issue_coupon':
      return { ...base, customer_id: customer?.customer_id, amount: 500, reason: 'Goodwill gesture' };
    case 'lock_account':
      return { ...base, customer_id: customer?.customer_id, reason: 'Account security lock' };
    case 'escalate_to_human':
      return { ...base, ticket_id: ticketId, reason: 'Escalated for human review', queue: 'human-review' };
    default:
      return base;
  }
}

export default function ActionPanel({ user, ticketId, customer, order, recommended = [], onChanged }) {
  const isManager = user?.role === 'manager';
  const canRequest = user?.role === 'agent' || user?.role === 'manager';
  const [actions, setActions] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // key of the in-flight operation

  const load = useCallback(async () => {
    try {
      setActions(await api(`/tool-actions?ticket_id=${ticketId}`));
    } catch (e) {
      setError(e.message);
    }
  }, [ticketId]);

  useEffect(() => {
    load();
  }, [load]);

  async function op(key, fn) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
      // Let the workspace refresh queue state (e.g. the "Awaiting approval"
      // count) after a request / approval / execution changes an action.
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  const request = (tool) =>
    op(`req-${tool}`, () =>
      api('/tool-actions', {
        method: 'POST',
        body: { ticket_id: ticketId, tool_name: tool, payload: buildPayload(tool, { ticketId, customer, order }) },
      }),
    );

  const decide = (id, decision) =>
    op(`${decision}-${id}`, () =>
      api(`/tool-actions/${id}/approve`, { method: 'POST', body: { decision, reason: `${decision} via console` } }),
    );

  const execute = (id) => op(`exec-${id}`, () => api(`/tool-actions/${id}/execute`, { method: 'POST' }));

  // Recommended tools not already requested (escalate_to_human needs no execution flow).
  const requestable = recommended
    .map((a) => a.tool_name)
    .filter((t) => t !== 'escalate_to_human' && !actions.some((a) => a.tool_name === t));

  const payloadRows = (tool, p) => {
    if (tool === 'create_replacement_order')
      return [['Target order', p.order_id], ['SKU dispatch', p.sku], ['System reason', p.reason]];
    if (tool === 'start_refund_review')
      return [['Target order', p.order_id], ['Amount', `${p.amount} INR`], ['System reason', p.reason]];
    if (tool === 'issue_coupon')
      return [['Customer', p.customer_id], ['Amount', `${p.amount} INR`], ['System reason', p.reason]];
    return Object.entries(p)
      .filter(([k]) => k !== 'idempotency_key')
      .map(([k, v]) => [k.replace(/_/g, ' '), String(v)]);
  };

  return (
    <Card>
      <CardHead icon="task_alt" title="Recommended Action">
        {!isManager && <span className="text-body-sm text-on-surface-variant">Approve/execute is manager-only</span>}
      </CardHead>

      {error && <Banner tone="blocked">{error}</Banner>}

      {canRequest && requestable.length > 0 && (
        <div className="flex flex-col gap-space-sm">
          {requestable.map((tool) => {
            const p = buildPayload(tool, { ticketId, customer, order });
            return (
              <div key={tool} className="rounded-md border border-rule bg-surface-container-low p-space-md flex flex-col gap-space-sm">
                <div className="flex items-center justify-between gap-space-md">
                  <span className="flex items-center gap-space-sm font-semibold text-body-lg">
                    <span className="material-symbols-outlined text-[18px] text-primary-container">bolt</span>
                    {tool}
                  </span>
                  <Badge tone="pending" icon="lock">Needs manager approval</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-sm">
                  {payloadRows(tool, p).map(([k, v]) => (
                    <Field key={k} label={k} mono>
                      {v ?? '—'}
                    </Field>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-space-md">
                  <span className="mono text-code-sm text-on-surface-variant truncate">idem: {p.idempotency_key}</span>
                  <button className={btnPrimary} disabled={busy === `req-${tool}`} onClick={() => request(tool)}>
                    <span className="material-symbols-outlined text-[16px]">verified_user</span>
                    {busy === `req-${tool}` ? 'Requesting…' : 'Request action'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {actions.length === 0 ? (
        requestable.length === 0 && (
          <p className="text-body-md text-on-surface-variant">No actions requested yet.</p>
        )
      ) : (
        <ul className="flex flex-col gap-space-sm mt-space-sm">
          {actions.map((a) => (
            <li key={a.action_id} className="rounded-md border border-rule bg-surface-container-lowest p-space-md flex flex-col gap-space-sm">
              <div className="flex items-center justify-between gap-space-md">
                <span className="font-semibold text-body-lg">{a.tool_name}</span>
                <Badge tone={STATUS_TONE[a.status] || 'neutral'}>{a.status.replace(/_/g, ' ')}</Badge>
              </div>
              <span className="mono text-code-sm text-on-surface-variant truncate">idem: {a.idempotency_key}</span>
              {a.result && (
                <span className="mono text-code-sm text-status-safe-fg">
                  → {a.result.replacement_id || a.result.refund_review_id || JSON.stringify(a.result)}
                </span>
              )}
              <div className="flex items-center gap-space-sm">
                {isManager && a.status === 'approval_required' && (
                  <>
                    <button className={btnPrimary} disabled={busy === `approved-${a.action_id}`} onClick={() => decide(a.action_id, 'approved')}>
                      Approve &amp; Sign
                    </button>
                    <button className={btnDanger} disabled={busy === `rejected-${a.action_id}`} onClick={() => decide(a.action_id, 'rejected')}>
                      Reject
                    </button>
                  </>
                )}
                {isManager && a.status === 'approved' && (
                  <button className={btnPrimary} disabled={busy === `exec-${a.action_id}`} onClick={() => execute(a.action_id)}>
                    <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                    {busy === `exec-${a.action_id}` ? 'Executing…' : 'Execute action'}
                  </button>
                )}
                {!isManager && a.status === 'approval_required' && (
                  <span className="text-body-sm text-on-surface-variant">Awaiting manager approval</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
