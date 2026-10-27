import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const STATUS_CLASS = { succeeded: 'ok', escalated: 'warn', refused: 'danger', failed: 'danger' };

export default function TraceDrawer({ ticketId }) {
  const [runs, setRuns] = useState([]);
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!ticketId) {
      setRuns([]);
      return;
    }
    try {
      setRuns(await api(`/tickets/${ticketId}/runs`));
    } catch (e) {
      setError(e.message);
    }
  }, [ticketId]);

  useEffect(() => {
    load();
  }, [load]);

  async function expand(runId, fallback) {
    if (open === runId) {
      setOpen(null);
      setDetail(null);
      return;
    }
    setOpen(runId);
    try {
      setDetail(await api(`/agent-runs/${runId}`));
    } catch {
      setDetail(fallback);
    }
  }

  if (!ticketId) return <p className="muted">Select a ticket to see its run traces.</p>;

  return (
    <div>
      <div className="row">
        <h3>Run traces — {ticketId}</h3>
        <button className="btn ghost" onClick={load}>
          Refresh
        </button>
      </div>
      {error && <div className="banner error">{error}</div>}
      {runs.length === 0 ? (
        <p className="muted small">No runs yet — run triage or draft on this ticket.</p>
      ) : (
        <ul className="trace-list">
          {runs.map((r) => (
            <li key={r.run_id} className="trace-item">
              <button className="trace-head" onClick={() => expand(r.run_id, r)}>
                <span className={`chip ${STATUS_CLASS[r.status] || ''}`}>{r.run_type}</span>
                <span className="muted small">
                  {r.status} · {r.model_name || r.model_provider} ·{' '}
                  {r.created_at ? new Date(r.created_at).toLocaleTimeString() : ''}
                </span>
              </button>
              {open === r.run_id && (
                <pre className="trace-json">{JSON.stringify(detail ?? r, null, 2)}</pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
