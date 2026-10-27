import { Badges } from './Badges.jsx';

export default function TicketQueue({ tickets, selectedId, onSelect }) {
  return (
    <ul className="queue">
      {tickets.map((t) => (
        <li key={t.ticket_id}>
          <button
            className={`queue-item${t.ticket_id === selectedId ? ' active' : ''}`}
            onClick={() => onSelect(t.ticket_id)}
          >
            <div className="row">
              <span className="qid">{t.ticket_id}</span>
              <Badges triage={t.triage} />
            </div>
            <div className="qsubj">{t.subject}</div>
          </button>
        </li>
      ))}
    </ul>
  );
}
