import { useState } from 'react';
import { api } from '../api.js';

const DECISION_CLASS = { answer: 'ok', escalate: 'warn', refuse: 'danger' };

export default function DraftPanel({ ticketId, onDrafted }) {
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [cite, setCite] = useState(null);
  const [citeBusy, setCiteBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await api(`/tickets/${ticketId}/draft-reply`, { method: 'POST' });
      setRes(r);
      setCite(null);
      onDrafted?.(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleCite(id) {
    if (cite?.doc_id === id) {
      setCite(null);
      return;
    }
    setCiteBusy(true);
    try {
      setCite(await api(`/documents/${id}`));
    } catch (e) {
      setCite({ doc_id: id, title: id, error: e.message, chunks: [] });
    } finally {
      setCiteBusy(false);
    }
  }

  const draft = res?.draft;
  const activeFlags = Object.entries(res?.flags || {})
    .filter(([k, v]) => v && k !== 'any')
    .map(([k]) => k);
  const guardItems = [...activeFlags, ...(draft?.violations || [])];

  return (
    <div className="card">
      <div className="row">
        <h3>Draft reply</h3>
        <button className="btn" onClick={run} disabled={busy}>
          {busy ? 'Drafting…' : draft ? 'Re-draft' : 'Draft reply'}
        </button>
      </div>

      {error && <div className="banner error">{error}</div>}

      {!draft ? (
        <p className="muted small">No draft yet — generate a cited reply through the guarded pipeline.</p>
      ) : (
        <>
          <div className="row">
            <span className={`chip decision ${DECISION_CLASS[draft.decision] || ''}`}>
              {draft.decision}
            </span>
          </div>

          {guardItems.length > 0 && (
            <div className="guard-banner">⚠ Guardrails flagged: {guardItems.join(', ')}</div>
          )}

          <blockquote className="msg draft-body">{draft.body}</blockquote>

          {draft.citations?.length > 0 && (
            <div className="cites">
              <span className="k">Citations</span>
              <div className="cite-chips">
                {draft.citations.map((id) => (
                  <button
                    key={id}
                    className={`cite-chip${cite?.doc_id === id ? ' active' : ''}`}
                    onClick={() => toggleCite(id)}
                  >
                    {id}
                  </button>
                ))}
              </div>
            </div>
          )}

          {citeBusy && <p className="muted small">Loading citation…</p>}
          {cite && (
            <div className="snippet">
              <strong>{cite.title || cite.doc_id}</strong>
              {cite.error ? (
                <p className="muted small">{cite.error}</p>
              ) : (
                (cite.chunks || []).map((c, i) => (
                  <div key={i} className="snippet-chunk">
                    {c.heading && <div className="snippet-head">{c.heading}</div>}
                    <div className="muted small">{c.text}</div>
                  </div>
                ))
              )}
            </div>
          )}

          {draft.actions?.length > 0 && (
            <div className="rec-actions">
              <span className="k">Recommended actions</span>
              <div className="cite-chips">
                {draft.actions.map((a, i) => (
                  <span key={i} className="chip" title={a.reason}>
                    {a.tool_name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
