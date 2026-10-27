import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const STATUS_CLASS = {
  approval_required: 'warn',
  approved: 'accent',
  executing: 'warn',
  executed: 'ok',
  rejected: 'danger',
  failed: 'danger',
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

export default function ActionPanel({ user, ticketId, customer, order, recommended = [] }) {
  const isManager = user?.role === 'manager';
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

  return (
    <div className="card">
      <div className="row">
        <h3>Actions</h3>
        {!isManager && <span className="muted small">Approve/execute is manager-only</span>}
      </div>

      {error && <div className="banner error">{error}</div>}

      {requestable.length > 0 && (
        <div className="recommend">
          <span className="k">Recommended — request for approval</span>
          {requestable.map((tool) => {
            const p = buildPayload(tool, { ticketId, customer, order });
            return (
              <div key={tool} className="rec-row">
                <div>
                  <strong>{tool}</strong>
                  <div className="muted small payload">{p.idempotency_key}</div>
                </div>
                <button className="btn" disabled={busy === `req-${tool}`} onClick={() => request(tool)}>
                  {busy === `req-${tool}` ? 'Requesting…' : 'Request'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {actions.length === 0 ? (
        <p className="muted small">No actions requested yet.</p>
      ) : (
        <ul className="action-list">
          {actions.map((a) => (
            <li key={a.action_id} className="action-row">
              <div className="row">
                <strong>{a.tool_name}</strong>
                <span className={`chip ${STATUS_CLASS[a.status] || ''}`}>{a.status}</span>
              </div>
              <div className="muted small payload">{a.idempotency_key}</div>
              {a.result && (
                <div className="muted small">
                  → {a.result.replacement_id || a.result.refund_review_id || JSON.stringify(a.result)}
                </div>
              )}
              <div className="action-btns">
                {isManager && a.status === 'approval_required' && (
                  <>
                    <button className="btn" disabled={busy === `approved-${a.action_id}`} onClick={() => decide(a.action_id, 'approved')}>
                      Approve
                    </button>
                    <button className="btn danger" disabled={busy === `rejected-${a.action_id}`} onClick={() => decide(a.action_id, 'rejected')}>
                      Reject
                    </button>
                  </>
                )}
                {isManager && a.status === 'approved' && (
                  <button className="btn" disabled={busy === `exec-${a.action_id}`} onClick={() => execute(a.action_id)}>
                    {busy === `exec-${a.action_id}` ? 'Executing…' : 'Execute'}
                  </button>
                )}
                {!isManager && a.status === 'approval_required' && (
                  <span className="muted small">awaiting manager approval</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
