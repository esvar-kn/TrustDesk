// Shared UI primitives for the redesigned workspace (Phase 7.3).
export const btnPrimary =
  'inline-flex items-center justify-center gap-space-xs h-8 px-space-md rounded-lg bg-primary-container text-on-primary text-label-md font-semibold hover:bg-primary transition-colors disabled:opacity-50 disabled:cursor-default';
export const btnOutline =
  'inline-flex items-center justify-center gap-space-xs h-8 px-space-md rounded-lg border border-rule bg-surface-container-lowest text-on-surface text-label-md hover:bg-surface-container-low transition-colors disabled:opacity-50 disabled:cursor-default';
export const btnDanger =
  'inline-flex items-center justify-center gap-space-xs h-8 px-space-md rounded-lg border border-status-blocked-outline bg-surface-container-lowest text-status-blocked-fg text-label-md hover:bg-status-blocked-bg transition-colors disabled:opacity-50 disabled:cursor-default';

export function Card({ children, className = '' }) {
  return (
    <section
      className={`rounded-lg border border-rule bg-surface-container-lowest shadow-card p-space-lg ${className}`}
    >
      {children}
    </section>
  );
}

export function CardHead({ icon, title, children }) {
  return (
    <div className="flex items-center justify-between gap-space-md mb-space-md">
      <h3 className="flex items-center gap-space-sm text-headline-sm font-semibold">
        {icon && <span className="material-symbols-outlined text-[18px] text-primary-container">{icon}</span>}
        {title}
      </h3>
      {children}
    </div>
  );
}

export function Field({ label, children, mono = false }) {
  return (
    <div className="flex flex-col gap-space-2xs">
      <span className="text-label-sm uppercase tracking-wide text-on-surface-variant">{label}</span>
      <span className={`text-body-md text-on-surface ${mono ? 'mono text-code-md' : ''}`}>{children}</span>
    </div>
  );
}

export function Banner({ tone = 'blocked', children }) {
  const tones = {
    blocked: 'bg-status-blocked-bg border-status-blocked-outline text-status-blocked-fg',
    pending: 'bg-status-pending-bg border-status-pending-outline text-status-pending-fg',
    safe: 'bg-status-safe-bg border-status-safe-outline text-status-safe-fg',
  };
  return (
    <div className={`flex items-center gap-space-sm px-space-md py-space-sm rounded-md border text-body-md ${tones[tone]}`}>
      <span className="material-symbols-outlined text-[18px]">
        {tone === 'blocked' ? 'error' : tone === 'pending' ? 'warning' : 'check_circle'}
      </span>
      {children}
    </div>
  );
}
