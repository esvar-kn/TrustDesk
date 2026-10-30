import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badges, Badge } from './Badges.jsx';
import { Card, CardHead, Field, btnOutline, Banner } from './ui.jsx';
import TriageCard from './TriageCard.jsx';
import DraftPanel from './DraftPanel.jsx';
import ActionPanel from './ActionPanel.jsx';
import ConversationThread from './ConversationThread.jsx';
import { SevBanner, ActionAudit, KbProvenance } from './SecurityPanels.jsx';

const DAY = 86_400_000;
const fmtDate = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '—');
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / DAY);

// Deterministic return-window timeline, computed from the order's own dates.
function slaModel(ticket, order) {
  if (!order) return { kind: 'none', text: 'No linked order' };
  if (order.status === 'in_transit') return { kind: 'transit', text: 'In transit — no return window yet' };
  if (!order.delivered_at || !order.eligible_return_until) return { kind: 'none', text: 'No return window' };
  const windowDays = daysBetween(order.delivered_at, order.eligible_return_until);
  const day = daysBetween(order.delivered_at, ticket.created_at);
  const within = new Date(ticket.created_at) <= new Date(`${order.eligible_return_until}T23:59:59Z`);
  return {
    kind: within ? 'within' : 'elapsed',
    text: within ? `Within return window (Day ${day} of ${windowDays})` : 'Return window elapsed',
    nodes: [
      { label: 'Delivered', date: order.delivered_at, state: 'done' },
      { label: 'Ticket', date: ticket.created_at, state: within ? 'current' : 'done' },
      { label: 'Window end', date: order.eligible_return_until, state: within ? 'future' : 'done' },
    ],
  };
}

export default function TicketDetail({ ticketId, user, version = 0, onChanged, onOpenTrace }) {
  const readOnly = user?.role === 'auditor';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draftRes, setDraftRes] = useState(null);
  const [run, setRun] = useState(null); // agent-run trace, fetched when flagged
  const [reopenBusy, setReopenBusy] = useState(false);

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

  // Reload when the parent bumps `version` (e.g. after a bulk-triage run) so the
  // open ticket's triage reflects the change without being re-selected.
  useEffect(() => {
    if (version) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // When the scanner flagged the ticket, pull the draft's agent-run trace for the
  // denied actions and quarantined docs shown in the defense panels.
  useEffect(() => {
    if (draftRes?.flags?.any && draftRes.run_id) {
      api(`/agent-runs/${draftRes.run_id}`)
        .then(setRun)
        .catch(() => setRun(null));
    } else {
      setRun(null);
    }
  }, [draftRes]);

  async function reopen() {
    setReopenBusy(true);
    setError(null);
    try {
      await api(`/tickets/${ticketId}/reopen`, { method: 'POST' });
      await load();
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setReopenBusy(false);
    }
  }

  if (loading && !data) return <p className="text-body-md text-on-surface-variant p-space-md">Loading ticket…</p>;
  if (error) return <div className="p-space-md"><Banner tone="blocked">{error}</Banner></div>;
  if (!data) return null;

  const { customer, order } = data;
  const sla = slaModel(data, order);
  const flagged = Boolean(draftRes?.flags?.any);
  const denied = run?.guardrail_results?.policy_denied || [];
  const verified = run?.retrieved_doc_ids || draftRes?.draft?.citations || [];
  const quarantined = run?.quarantined_doc_ids || [];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-space-lg items-start">
      {/* Center column */}
      <div className="flex flex-col gap-space-lg min-w-0">
        {flagged && <SevBanner flags={draftRes.flags} />}
        <Card>
          <div className="flex items-center justify-between gap-space-md">
            <span className="mono text-code-md text-on-surface-variant tnum">{data.ticket_id}</span>
            <Badges triage={data.triage} />
          </div>
          <h2 className="text-headline-md font-semibold mt-space-xs">{data.subject}</h2>
          {data.status === 'resolved' && (
            <div className="flex items-center justify-between gap-space-md mt-space-md">
              <Badge tone="safe" icon="task_alt">resolved</Badge>
              <button className={btnOutline} onClick={reopen} disabled={reopenBusy}>
                <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                {reopenBusy ? 'Reopening…' : 'Reopen'}
              </button>
            </div>
          )}
        </Card>

        <ConversationThread ticket={data} readOnly={readOnly} onChanged={load} />

        <TriageCard
          ticketId={data.ticket_id}
          triage={data.triage}
          flagged={flagged}
          readOnly={readOnly}
          onTriaged={async () => {
            await load();
            onChanged?.();
          }}
        />

        <DraftPanel
          ticketId={data.ticket_id}
          readOnly={readOnly}
          onDrafted={setDraftRes}
          onAddedToThread={load}
          resolved={data.status === 'resolved'}
          onSent={() => {
            load();
            onChanged?.();
          }}
        />

        <ActionPanel
          user={user}
          ticketId={data.ticket_id}
          customer={customer}
          order={order}
          recommended={draftRes?.draft?.actions || []}
          onChanged={onChanged}
        />

        {flagged && <ActionAudit denied={denied} recommended={draftRes?.draft?.actions || []} />}
      </div>

      {/* Right inspector */}
      <aside className="flex flex-col gap-space-lg">
        <Card>
          <CardHead icon="badge" title="Customer Identity">
            {customer &&
              (customer.verified ? (
                <Badge tone="safe" icon="verified">verified</Badge>
              ) : (
                <Badge tone="pending" icon="help">unverified</Badge>
              ))}
          </CardHead>
          {customer ? (
            <div className="grid grid-cols-2 gap-space-md">
              <Field label="Name">{customer.name}</Field>
              <Field label="Tier">
                <Badge tone="neutral">{customer.tier}</Badge>
              </Field>
              <Field label="Email" mono>{customer.email || '—'}</Field>
              <Field label="Tags">{(customer.tags || []).join(', ') || '—'}</Field>
            </div>
          ) : (
            <p className="text-body-sm text-on-surface-variant">No customer linked.</p>
          )}
        </Card>

        <Card>
          <CardHead icon="package_2" title="Active Order" />
          {order ? (
            <div className="grid grid-cols-2 gap-space-md">
              <Field label="Order" mono>{order.order_id}</Field>
              <Field label="Status">{order.status}</Field>
              <Field label="Delivered" mono>{fmtDate(order.delivered_at)}</Field>
              <Field label="Return until" mono>{fmtDate(order.eligible_return_until)}</Field>
              <Field label="Total" mono>{order.total} {order.currency}</Field>
              <Field label="Items">
                {(order.items || []).map((i) => `${i.sku}${i.final_sale ? ' (final sale)' : ''}`).join(', ') || '—'}
              </Field>
            </div>
          ) : (
            <p className="text-body-sm text-on-surface-variant">No order linked.</p>
          )}
        </Card>

        <Card>
          <CardHead icon="schedule" title="Policy SLA Validation" />
          <div
            className={`flex items-center gap-space-sm px-space-md py-space-sm rounded-md text-body-md ${
              sla.kind === 'within'
                ? 'bg-status-safe-bg text-status-safe-fg'
                : sla.kind === 'elapsed'
                  ? 'bg-status-blocked-bg text-status-blocked-fg'
                  : 'bg-surface-container-low text-on-surface-variant'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {sla.kind === 'within' ? 'check_circle' : sla.kind === 'elapsed' ? 'cancel' : 'info'}
            </span>
            {sla.text}
          </div>
          {sla.nodes && (
            <ol className="flex items-start justify-between mt-space-md">
              {sla.nodes.map((n, i) => (
                <li key={i} className="flex flex-col items-center gap-space-2xs text-center flex-1">
                  <span
                    className={`material-symbols-outlined text-[18px] ${
                      n.state === 'done' ? 'text-primary-container' : n.state === 'current' ? 'text-status-escalated-fg' : 'text-outline'
                    }`}
                  >
                    {n.state === 'done' ? 'check_circle' : n.state === 'current' ? 'radio_button_checked' : 'radio_button_unchecked'}
                  </span>
                  <span className="text-label-sm text-on-surface">{n.label}</span>
                  <span className="mono text-code-sm text-on-surface-variant">{fmtDate(n.date)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {flagged && <KbProvenance verified={verified} quarantined={quarantined} />}

        <Card>
          <CardHead icon="fingerprint" title="Execution Provenance" />
          <div className="grid grid-cols-2 gap-space-md">
            <Field label="Run ID" mono>{draftRes?.run_id || data.triage?.run_id || '—'}</Field>
            <Field label="Decision">{draftRes?.decision || '—'}</Field>
            <Field label="Guard violations" mono>{draftRes?.draft?.violations?.length ?? '—'}</Field>
            <Field label="Prompt version" mono>{draftRes?.prompt_version || 'v1'}</Field>
          </div>
          <button className={`${btnOutline} w-full mt-space-md`} onClick={onOpenTrace}>
            <span className="material-symbols-outlined text-[16px]">lan</span>
            Open Trace Drawer
          </button>
        </Card>
      </aside>
    </div>
  );
}
