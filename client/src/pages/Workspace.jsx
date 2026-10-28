import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import TicketQueue from '../components/TicketQueue.jsx';
import TicketDetail from '../components/TicketDetail.jsx';
import TraceDrawer from '../components/TraceDrawer.jsx';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'needs_triage', label: 'Needs triage' },
  { id: 'escalated', label: 'Escalated' },
  { id: 'awaiting_approval', label: 'Awaiting approval' },
];

export default function Workspace({ user, query = '', focusTicketId = null }) {
  const [tickets, setTickets] = useState([]);
  const [pendingTickets, setPendingTickets] = useState(new Set());
  const [selectedId, setSelectedId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [traceOpen, setTraceOpen] = useState(false);

  const loadTickets = useCallback(async () => {
    try {
      const t = await api('/tickets');
      setTickets(t);
      setSelectedId((cur) => cur ?? t[0]?.ticket_id ?? null);
      // Which tickets have a pending approval (for the "Awaiting approval" chip).
      try {
        const acts = await api('/tool-actions');
        setPendingTickets(new Set(acts.filter((a) => a.status === 'approval_required').map((a) => a.ticket_id)));
      } catch {
        /* non-fatal: chip count just stays 0 */
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (focusTicketId) setSelectedId(focusTicketId);
  }, [focusTicketId]);

  const matchesStatus = useCallback(
    (t) => {
      if (statusFilter === 'needs_triage') return !t.triage;
      if (statusFilter === 'escalated') return Boolean(t.triage?.should_escalate);
      if (statusFilter === 'awaiting_approval') return pendingTickets.has(t.ticket_id);
      return true;
    },
    [statusFilter, pendingTickets],
  );

  const counts = useMemo(
    () => ({
      all: tickets.length,
      needs_triage: tickets.filter((t) => !t.triage).length,
      escalated: tickets.filter((t) => t.triage?.should_escalate).length,
      awaiting_approval: tickets.filter((t) => pendingTickets.has(t.ticket_id)).length,
    }),
    [tickets, pendingTickets],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((t) => {
      if (!matchesStatus(t)) return false;
      if (!q) return true;
      return (
        t.ticket_id.toLowerCase().includes(q) ||
        (t.subject || '').toLowerCase().includes(q) ||
        (t.triage?.category || '').toLowerCase().includes(q)
      );
    });
  }, [tickets, query, matchesStatus]);

  return (
    <div className="ws">
      <aside className="ws-queue">
        <div className="flex items-center justify-between mb-space-sm">
          <h2 className="flex items-center gap-space-xs text-headline-sm font-semibold">
            <span className="material-symbols-outlined text-[18px] text-primary-container">inbox</span>
            Tickets
          </h2>
          <span className="mono text-code-sm text-on-surface-variant tnum">
            {filtered.length}
            {(query.trim() || statusFilter !== 'all') && ` / ${tickets.length}`}
          </span>
        </div>

        <div className="flex flex-wrap gap-space-2xs mb-space-md">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`flex items-center gap-space-2xs px-space-sm py-space-2xs rounded text-label-sm border transition-colors ${
                statusFilter === f.id
                  ? 'bg-primary-container text-on-primary border-primary-container'
                  : 'bg-surface-container-lowest text-on-surface-variant border-rule hover:bg-surface-container-low'
              }`}
            >
              {f.label}
              <span className="mono text-code-sm opacity-80">{counts[f.id]}</span>
            </button>
          ))}
        </div>

        {loading && <p className="text-body-sm text-on-surface-variant">Loading…</p>}
        {error && <div className="banner error">{error}</div>}
        {!loading && filtered.length === 0 && (
          <p className="text-body-sm text-on-surface-variant">No tickets match this view.</p>
        )}
        <TicketQueue tickets={filtered} selectedId={selectedId} onSelect={setSelectedId} />
      </aside>

      <section className="ws-detail">
        {selectedId ? (
          <TicketDetail
            key={selectedId}
            ticketId={selectedId}
            user={user}
            onChanged={loadTickets}
            onOpenTrace={() => setTraceOpen(true)}
          />
        ) : (
          <p className="text-body-md text-on-surface-variant">Select a ticket from the queue.</p>
        )}
      </section>

      {traceOpen && (
        <>
          <button
            type="button"
            aria-label="Close trace drawer"
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setTraceOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[420px] bg-surface-container-lowest border-l border-rule shadow-drawer overflow-y-auto">
            <div className="sticky top-0 flex items-center justify-between gap-space-md px-margin py-space-md bg-surface-container-lowest border-b border-rule">
              <span className="flex items-center gap-space-sm text-headline-sm font-semibold">
                <span className="material-symbols-outlined text-[20px] text-primary-container">lan</span>
                Execution Trace
              </span>
              <button
                type="button"
                onClick={() => setTraceOpen(false)}
                aria-label="Close"
                className="flex items-center justify-center h-8 w-8 rounded-lg text-on-surface-variant hover:bg-surface-container-high"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="px-margin py-space-md">
              <TraceDrawer ticketId={selectedId} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
