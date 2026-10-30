// Human-review queue bell (Phase 8.9). Polls /api/notifications for escalations,
// shows an unread count, and opens the ticket from a notification (marking it read).
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';

export default function NotificationsBell({ onOpenTicket }) {
  const [data, setData] = useState({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  async function load() {
    try {
      setData(await api('/notifications'));
    } catch {
      /* non-fatal */
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  async function openTicket(n) {
    try {
      await api(`/notifications/${n.notification_id}/read`, { method: 'POST' });
    } catch {
      /* ignore */
    }
    setOpen(false);
    load();
    onOpenTicket?.(n.ticket_id);
  }

  async function markAll() {
    try {
      await api('/notifications/read-all', { method: 'POST' });
    } catch {
      /* ignore */
    }
    load();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative flex items-center justify-center h-8 w-8 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
      >
        <span className="material-symbols-outlined text-[18px]">notifications</span>
        {data.unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-[3px] rounded-full bg-status-blocked-fg text-on-primary text-[10px] font-semibold flex items-center justify-center tnum">
            {data.unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-space-xs w-80 max-h-96 overflow-y-auto rounded-lg border border-rule bg-surface-container-lowest shadow-drawer z-50"
        >
          <div className="sticky top-0 flex items-center justify-between px-space-md py-space-sm border-b border-rule bg-surface-container-lowest">
            <span className="text-label-md font-semibold">Human-review queue</span>
            {data.unread > 0 && (
              <button onClick={markAll} className="mono text-code-sm text-primary-container hover:underline">
                Mark all read
              </button>
            )}
          </div>
          {data.items.length === 0 ? (
            <p className="px-space-md py-space-md text-body-sm text-on-surface-variant">No escalations.</p>
          ) : (
            <ul>
              {data.items.map((n) => (
                <li key={n.notification_id}>
                  <button
                    role="menuitem"
                    onClick={() => openTicket(n)}
                    className={`w-full text-left px-space-md py-space-sm border-b border-rule last:border-0 hover:bg-surface-container-low ${n.read ? 'opacity-60' : ''}`}
                  >
                    <span className="flex items-start gap-space-xs text-body-sm text-on-surface">
                      <span className="material-symbols-outlined text-[16px] text-status-escalated-fg">arrow_outward</span>
                      {n.message}
                    </span>
                    <span className="mono text-code-sm text-outline">
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
