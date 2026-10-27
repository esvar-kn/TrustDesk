import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badges } from './Badges.jsx';
import TriageCard from './TriageCard.jsx';
import DraftPanel from './DraftPanel.jsx';
import ActionPanel from './ActionPanel.jsx';

export default function TicketDetail({ ticketId, user, onChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draftRes, setDraftRes] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api(`/tickets/${ticketId}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) return <p className="muted">Loading ticket…</p>;
  if (error) return <div className="banner error">{error}</div>;
  if (!data) return null;

  const { customer, order } = data;

  return (
    <div className="detail">
      {/* Original message */}
      <div className="card">
        <div className="row">
          <strong>{data.ticket_id}</strong>
          <Badges triage={data.triage} />
        </div>
        <h3 className="ticket-subject">{data.subject}</h3>
        <blockquote className="msg">{data.body}</blockquote>
        <p className="muted small">
          via {data.channel || 'n/a'} · {data.created_at}
        </p>
      </div>

      {/* Customer + order context */}
      <div className="detail-cols">
        <div className="card">
          <h3>Customer</h3>
          {customer ? (
            <div className="kv-grid">
              <div className="kv">
                <span className="k">Name</span>
                <span className="v">{customer.name}</span>
              </div>
              <div className="kv">
                <span className="k">Tier</span>
                <span className="v">
                  <span className="badge badge-cat">{customer.tier}</span>
                </span>
              </div>
              <div className="kv">
                <span className="k">Verified</span>
                <span className="v">
                  <span className={`chip ${customer.verified ? 'ok' : 'warn'}`}>
                    {customer.verified ? 'verified' : 'unverified'}
                  </span>
                </span>
              </div>
              <div className="kv">
                <span className="k">Tags</span>
                <span className="v muted">{(customer.tags || []).join(', ') || '—'}</span>
              </div>
            </div>
          ) : (
            <p className="muted small">No customer linked.</p>
          )}
        </div>

        <div className="card">
          <h3>Order</h3>
          {order ? (
            <div className="kv-grid">
              <div className="kv">
                <span className="k">Order</span>
                <span className="v">{order.order_id}</span>
              </div>
              <div className="kv">
                <span className="k">Status</span>
                <span className="v">{order.status}</span>
              </div>
              <div className="kv">
                <span className="k">Delivered</span>
                <span className="v">{order.delivered_at || '—'}</span>
              </div>
              <div className="kv">
                <span className="k">Return until</span>
                <span className="v">{order.eligible_return_until || '—'}</span>
              </div>
              <div className="kv">
                <span className="k">Total</span>
                <span className="v">
                  {order.total} {order.currency}
                </span>
              </div>
              <div className="kv">
                <span className="k">Items</span>
                <span className="v muted">
                  {(order.items || [])
                    .map((i) => `${i.sku} (${i.category}${i.final_sale ? ', final sale' : ''})`)
                    .join('; ')}
                </span>
              </div>
            </div>
          ) : (
            <p className="muted small">No order linked.</p>
          )}
        </div>
      </div>

      <TriageCard
        ticketId={data.ticket_id}
        triage={data.triage}
        onTriaged={async () => {
          await load();
          onChanged?.();
        }}
      />

      <DraftPanel ticketId={data.ticket_id} onDrafted={setDraftRes} />

      <ActionPanel
        user={user}
        ticketId={data.ticket_id}
        customer={customer}
        order={order}
        recommended={draftRes?.draft?.actions || []}
      />
    </div>
  );
}
