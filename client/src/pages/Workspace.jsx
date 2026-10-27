import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import TicketQueue from '../components/TicketQueue.jsx';
import TicketDetail from '../components/TicketDetail.jsx';
import TraceDrawer from '../components/TraceDrawer.jsx';
import EvalView from '../components/EvalView.jsx';

const TABS = ['Workspace', 'Trace', 'Evals'];

export default function Workspace({ user }) {
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState('Workspace');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadTickets = useCallback(async () => {
    try {
      const t = await api('/tickets');
      setTickets(t);
      setSelectedId((cur) => cur ?? t[0]?.ticket_id ?? null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  return (
    <div className="ws">
      <aside className="ws-queue">
        <div className="queue-head">
          <h2>Tickets</h2>
          <span className="muted small">{tickets.length}</span>
        </div>
        {loading && <p className="muted small">Loading…</p>}
        {error && <div className="banner error">{error}</div>}
        <TicketQueue tickets={tickets} selectedId={selectedId} onSelect={setSelectedId} />
      </aside>

      <section className="ws-detail">
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t} className={`tab${t === tab ? ' active' : ''}`} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
        <div className="tab-body">
          {tab === 'Workspace' &&
            (selectedId ? (
              <TicketDetail key={selectedId} ticketId={selectedId} user={user} onChanged={loadTickets} />
            ) : (
              <p className="muted">Select a ticket from the queue.</p>
            ))}
          {tab === 'Trace' && <TraceDrawer ticketId={selectedId} />}
          {tab === 'Evals' && <EvalView />}
        </div>
      </section>
    </div>
  );
}
