// Audit status badges. Status is never communicated by colour alone — each badge
// pairs a tint with a label (and an icon where it adds meaning).
const TONES = {
  neutral: 'bg-surface-container-high text-on-surface-variant border-rule',
  teal: 'bg-secondary-container text-on-secondary-container border-secondary-container',
  safe: 'bg-status-safe-bg text-status-safe-fg border-status-safe-outline',
  pending: 'bg-status-pending-bg text-status-pending-fg border-status-pending-outline',
  blocked: 'bg-status-blocked-bg text-status-blocked-fg border-status-blocked-outline',
  escalated: 'bg-status-escalated-bg text-status-escalated-fg border-status-escalated-outline',
};

const PRIORITY_TONE = { low: 'neutral', medium: 'teal', high: 'pending', urgent: 'blocked' };

export function Badge({ tone = 'neutral', icon, children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-space-2xs px-space-xs py-[1px] rounded border text-label-sm uppercase tracking-wide ${TONES[tone] || TONES.neutral} ${className}`}
    >
      {icon && <span className="material-symbols-outlined text-[13px]">{icon}</span>}
      {children}
    </span>
  );
}

// Triage summary badges used in the queue and ticket header.
export function Badges({ triage }) {
  if (!triage) return <Badge tone="neutral">untriaged</Badge>;
  return (
    <span className="inline-flex flex-wrap items-center gap-space-2xs">
      <Badge tone="neutral">{triage.category}</Badge>
      <Badge tone={PRIORITY_TONE[triage.priority] || 'neutral'}>{triage.priority}</Badge>
      {triage.should_escalate && (
        <Badge tone="escalated" icon="arrow_outward">
          escalate
        </Badge>
      )}
    </span>
  );
}
