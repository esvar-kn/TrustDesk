import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import TicketQueue from '../components/TicketQueue.jsx';
import TicketDetail from '../components/TicketDetail.jsx';
import TraceDrawer from '../components/TraceDrawer.jsx';
import { btnOutline } from '../components/ui.jsx';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'needs_triage', label: 'Needs triage' },
  { id: 'escalated', label: 'Escalated' },
  { id: 'awaiting_approval', label: 'Awaiting approval' },
  { id: 'resolved', label: 'Resolved' },
];

export default function Workspace({ user, query = '', focusTicketId = null }) {
  const [tickets, setTickets] = useState([]);
  const [pendingTickets, setPendingTickets] = useState(new Set());
  const [selectedId, setSelectedId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [traceOpen, setTraceOpen] = useState(false);
  const drawerRef = useRef(null);
  // Bulk triage (Phase 8.2): progress + per-ticket result for "Triage all untriaged".
  const [bulk, setBulk] = useState(null); // { running, done, total, ok, failed: [{ticket_id, error}] }
  const [detailVersion, setDetailVersion] = useState(0); // bump to refresh the open ticket
  const readOnly = user?.role === 'auditor';
  const PAGE = 50;
  const [limit, setLimit] = useState(PAGE); // queue render cap (Phase 8.9 pagination)

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

  // Reset the queue render cap when the view narrows (keeps the DOM small for
  // large queues; 500+ tickets render one 50-row page at a time).
  useEffect(() => {
    setLimit(PAGE);
  }, [query, statusFilter]);

  // Trace drawer accessibility (Phase 8.9): focus into it on open, trap Tab, and
  // close on Escape.
  useEffect(() => {
    if (!traceOpen) return undefined;
    const el = drawerRef.current;
    const focusables = () =>
      el
        ? [...el.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter(
            (n) => !n.disabled,
          )
        : [];
    focusables()[0]?.focus();
    function onKey(e) {
      if (e.key === 'Escape') {
        setTraceOpen(false);
        return;
      }
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const idx = f.indexOf(document.activeElement);
        if (e.shiftKey && idx <= 0) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && idx === f.length - 1) {
          e.preventDefault();
          f[0].focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [traceOpen]);

  // Triage every untriaged ticket through the same guarded per-ticket endpoint,
  // one at a time so progress is live and a single failure never aborts the rest.
  const triageAllUntriaged = useCallback(async () => {
    const targets = tickets.filter((t) => !t.triage).map((t) => t.ticket_id);
    if (!targets.length) return;
    const failed = [];
    setBulk({ running: true, done: 0, total: targets.length, ok: 0, failed });
    for (const id of targets) {
      try {
        await api(`/tickets/${id}/triage`, { method: 'POST' });
      } catch (e) {
        failed.push({ ticket_id: id, error: e.message });
      }
      setBulk((b) => ({ ...b, done: b.done + 1, ok: b.done + 1 - failed.length, failed: [...failed] }));
    }
    await loadTickets();
    setDetailVersion((v) => v + 1); // refresh the open ticket's triage
    setBulk({ running: false, done: targets.length, total: targets.length, ok: targets.length - failed.length, failed });
  }, [tickets, loadTickets]);

  const matchesStatus = useCallback(
    (t) => {
      if (statusFilter === 'needs_triage') return !t.triage;
      if (statusFilter === 'escalated') return Boolean(t.triage?.should_escalate);
      if (statusFilter === 'awaiting_approval') return pendingTickets.has(t.ticket_id);
      if (statusFilter === 'resolved') return t.status === 'resolved';
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
      resolved: tickets.filter((t) => t.status === 'resolved').length,
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

        {counts.needs_triage > 0 && !bulk?.running && !readOnly && (
          <button className={`${btnOutline} w-full mb-space-md`} onClick={triageAllUntriaged}>
            <span className="material-symbols-outlined text-[16px]">bolt</span>
            Triage all untriaged ({counts.needs_triage})
          </button>
        )}

        {bulk?.running && (
          <div className="mb-space-md flex flex-col gap-space-2xs" role="status" aria-live="polite">
            <div className="flex items-center justify-between text-body-sm text-on-surface-variant">
              <span>Triaging…</span>
              <span className="mono text-code-sm tnum">
                {bulk.done}/{bulk.total}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-surface-container-high overflow-hidden">
              <div
                className="h-full bg-primary-container transition-all"
                style={{ width: `${Math.round((bulk.done / bulk.total) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {bulk && !bulk.running && (
          <div className="mb-space-md flex flex-col gap-space-xs rounded-md border border-rule bg-surface-container-low px-space-md py-space-sm" role="status" aria-live="polite">
            <div className="flex items-center justify-between gap-space-sm">
              <span className="flex items-center gap-space-xs text-body-sm text-on-surface">
                <span
                  className={`material-symbols-outlined text-[16px] ${
                    bulk.failed.length ? 'text-status-pending-fg' : 'text-status-safe-fg'
                  }`}
                >
                  {bulk.failed.length ? 'warning' : 'check_circle'}
                </span>
                Triaged {bulk.ok} · {bulk.failed.length} failed
              </span>
              <button
                className="text-on-surface-variant hover:text-on-surface"
                aria-label="Dismiss"
                onClick={() => setBulk(null)}
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
            {bulk.failed.length > 0 && (
              <ul className="flex flex-col gap-space-2xs">
                {bulk.failed.map((f) => (
                  <li key={f.ticket_id} className="mono text-code-sm text-status-blocked-fg">
                    {f.ticket_id}: {f.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {loading && <p className="text-body-sm text-on-surface-variant">Loading…</p>}
        {error && <div className="banner error">{error}</div>}
        {!loading && filtered.length === 0 && (
          <p className="text-body-sm text-on-surface-variant">No tickets match this view.</p>
        )}
        <TicketQueue tickets={filtered.slice(0, limit)} selectedId={selectedId} onSelect={setSelectedId} />
        {filtered.length > limit && (
          <button
            className={`${btnOutline} w-full mt-space-sm`}
            onClick={() => setLimit((n) => n + PAGE)}
          >
            <span className="material-symbols-outlined text-[16px]">expand_more</span>
            Show more ({filtered.length - limit} remaining)
          </button>
        )}
      </aside>

      <section className="ws-detail">
        {selectedId ? (
          <TicketDetail
            key={selectedId}
            ticketId={selectedId}
            user={user}
            version={detailVersion}
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
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Execution trace"
            className="fixed inset-y-0 right-0 z-50 w-full max-w-[420px] bg-surface-container-lowest border-l border-rule shadow-drawer overflow-y-auto"
          >
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
