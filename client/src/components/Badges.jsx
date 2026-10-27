// Triage badges: category + priority (+ escalate), or an "untriaged" chip.
export function Badges({ triage }) {
  if (!triage) return <span className="badge badge-muted">untriaged</span>;
  return (
    <span className="badges">
      <span className="badge badge-cat">{triage.category}</span>
      <span className={`badge pri-${triage.priority}`}>{triage.priority}</span>
      {triage.should_escalate && <span className="badge pri-urgent">escalate</span>}
    </span>
  );
}
