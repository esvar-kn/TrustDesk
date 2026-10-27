import { useState } from 'react';
import { api } from '../api.js';

export default function TriageCard({ ticketId, triage, onTriaged }) {
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
    <div className="card">
      <div className="row">
        <h3>Triage</h3>
        <button className="btn" onClick={run} disabled={busy}>
          {busy ? 'Running…' : triage ? 'Re-run triage' : 'Run triage'}
        </button>
      </div>

      {error && <div className="banner error">{error}</div>}

      {!triage ? (
        <p className="muted small">Not triaged yet — run triage to classify this ticket.</p>
      ) : (
        <>
          <div className="kv-grid">
            <div className="kv">
              <span className="k">Category</span>
              <span className="v">{triage.category}</span>
            </div>
            <div className="kv">
              <span className="k">Priority</span>
              <span className={`v pri-text pri-${triage.priority}`}>{triage.priority}</span>
            </div>
            <div className="kv">
              <span className="k">Sentiment</span>
              <span className="v">{triage.sentiment}</span>
            </div>
            <div className="kv">
              <span className="k">Escalate</span>
              <span className="v">{triage.should_escalate ? 'Yes' : 'No'}</span>
            </div>
          </div>
          {triage.reason_summary && <p className="reason">{triage.reason_summary}</p>}
          {triage.overrides?.length > 0 && (
            <div className="overrides">
              <span className="k">Policy overrides</span>
              <ul>
                {triage.overrides.map((o, i) => (
                  <li key={i}>
                    {o.field}: {String(o.from)} → {String(o.to)} <span className="muted">({o.reason})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
