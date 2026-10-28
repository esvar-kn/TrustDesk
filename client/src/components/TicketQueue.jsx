import { Badges } from './Badges.jsx';

const CHANNEL_ICON = { email: 'mail', chat: 'chat', phone: 'call', web: 'language' };

function relTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (Number.isNaN(mins)) return '';
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

export default function TicketQueue({ tickets, selectedId, onSelect }) {
  return (
    <ul className="flex flex-col gap-space-sm">
      {tickets.map((t) => {
        const active = t.ticket_id === selectedId;
        return (
          <li key={t.ticket_id}>
            <button
              onClick={() => onSelect(t.ticket_id)}
              className={`w-full text-left rounded-lg border p-space-md flex flex-col gap-space-xs transition-colors ${
                active
                  ? 'border-primary-container bg-surface-container ring-1 ring-primary-container'
                  : 'border-rule bg-surface-container-lowest hover:bg-surface-container-low'
              }`}
            >
              <div className="flex items-center justify-between gap-space-sm">
                <span className="mono text-code-sm text-on-surface-variant tnum">{t.ticket_id}</span>
                <span className="flex items-center gap-space-2xs mono text-code-sm text-outline">
                  <span className="material-symbols-outlined text-[13px]">
                    {CHANNEL_ICON[t.channel] || 'mail'}
                  </span>
                  {relTime(t.created_at)}
                </span>
              </div>
              <div className="text-body-md text-on-surface leading-snug line-clamp-2">{t.subject}</div>
              <Badges triage={t.triage} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
