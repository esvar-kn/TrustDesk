import { useState } from 'react';
import { api } from '../api.js';
import { Card, CardHead, btnOutline, Banner } from './ui.jsx';

const PRIORITY_TEXT = {
  low: 'text-on-surface-variant',
  medium: 'text-on-surface',
  high: 'text-status-pending-fg',
  urgent: 'text-status-blocked-fg',
};

function Cell({ label, children }) {
  return (
    <div className="flex flex-col gap-space-2xs border-l border-rule pl-space-md first:border-l-0 first:pl-0">
      <span className="text-label-sm uppercase tracking-wide text-on-surface-variant">{label}</span>
      <span className="text-headline-sm font-semibold capitalize">{children}</span>
    </div>
  );
}

export default function TriageCard({ ticketId, triage, flagged = false, readOnly = false, onTriaged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await api(`/tickets/${ticketId}/triage`, { method: 'POST' });
      await onTriaged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHead icon="account_tree" title="AI Triage Classification">
        {!readOnly && (
          <button className={btnOutline} onClick={run} disabled={busy}>
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            {busy ? 'Running…' : triage ? 'Run triage again' : 'Run triage'}
          </button>
        )}
      </CardHead>

      {error && <Banner tone="blocked">{error}</Banner>}

      {!triage ? (
        <p className="text-body-md text-on-surface-variant">
          Not triaged yet — run triage to classify this ticket.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-space-md">
            <Cell label="Category">{triage.category}</Cell>
            <Cell label="Priority">
              <span className={PRIORITY_TEXT[triage.priority] || ''}>{triage.priority}</span>
            </Cell>
            <Cell label="Sentiment">{triage.sentiment}</Cell>
            {triage.confidence != null && (
              <Cell label="Confidence">
                <span className={triage.confidence < 0.6 ? 'text-status-pending-fg' : 'text-on-surface'}>
                  {Math.round(triage.confidence * 100)}%
                </span>
              </Cell>
            )}
            <Cell label="Escalate">
              <span
                className={`inline-flex items-center gap-space-2xs ${
                  triage.should_escalate ? 'text-status-escalated-fg' : 'text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {triage.should_escalate ? 'arrow_outward' : 'check'}
                </span>
                {triage.should_escalate ? (flagged ? 'Yes (Mandatory)' : 'Yes') : 'No'}
              </span>
            </Cell>
          </div>

          {flagged && (
            <p className="mt-space-md flex items-center gap-space-xs px-space-md py-space-sm rounded-md bg-status-blocked-bg text-status-blocked-fg text-body-sm">
              <span className="material-symbols-outlined text-[16px]">rule</span>
              Adversarial prompt pattern detected — autonomous execution suspended.
            </p>
          )}

          {triage.reason_summary && (
            <p className="mt-space-md px-space-md py-space-sm rounded-md bg-surface-container-low text-body-md text-on-surface-variant">
              <span className="font-medium text-on-surface">Reason: </span>
              {triage.reason_summary}
            </p>
          )}

          {triage.overrides?.length > 0 && (
            <div className="mt-space-md">
              <span className="text-label-sm uppercase tracking-wide text-on-surface-variant">
                Policy overrides
              </span>
              <ul className="mt-space-xs flex flex-col gap-space-2xs">
                {triage.overrides.map((o, i) => (
                  <li key={i} className="text-body-sm mono text-on-surface-variant">
                    {o.field}: {String(o.from)} → <span className="text-on-surface">{String(o.to)}</span> ({o.reason})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
