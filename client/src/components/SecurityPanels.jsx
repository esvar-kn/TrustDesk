// Adversarial "Active Defense Isolation" panels (Phase 7.4). Rendered only when
// the input scanner raised a flag. Everything shown is real: flags come from the
// draft response, denied actions and quarantined docs from the agent-run trace.
import { Card, CardHead } from './ui.jsx';
import { Badge } from './Badges.jsx';

const FLAG_META = {
  override: { label: 'Instruction override', icon: 'gavel' },
  concealment: { label: 'Concealment from reviewer', icon: 'visibility_off' },
  coupon_over_cap: { label: 'Coupon above cap', icon: 'payments' },
  exfiltration: { label: 'Secret exfiltration attempt', icon: 'key' },
  identity_bypass: { label: 'Identity verification bypass', icon: 'no_accounts' },
};

function activeFlags(flags = {}) {
  return Object.keys(FLAG_META).filter((k) => flags[k]);
}

// Top-of-column SEV banner summarising the detected flags.
export function SevBanner({ flags }) {
  const names = activeFlags(flags);
  if (!names.length) return null;
  return (
    <div className="rounded-lg border border-status-blocked-outline bg-status-blocked-bg p-space-lg flex flex-col gap-space-md">
      <div className="flex items-center justify-between gap-space-md">
        <span className="flex items-center gap-space-sm text-headline-md font-semibold text-status-blocked-fg">
          <span className="material-symbols-outlined text-[22px]">gpp_maybe</span>
          Unsafe instruction detected
        </span>
        <span className="mono text-code-sm font-semibold px-space-sm py-space-2xs rounded bg-status-blocked-fg text-on-primary">
          SEV-1 SECURITY ALERT
        </span>
      </div>
      <div className="flex flex-wrap gap-space-sm">
        {names.map((n) => (
          <span
            key={n}
            className="inline-flex items-center gap-space-2xs px-space-sm py-space-2xs rounded border border-status-blocked-outline bg-surface-container-lowest text-status-blocked-fg text-label-md"
          >
            <span className="material-symbols-outlined text-[16px]">{FLAG_META[n].icon}</span>
            {FLAG_META[n].label}
          </span>
        ))}
      </div>
      <p className="text-body-md text-status-blocked-fg">
        TrustDesk did not follow these instructions. This ticket was escalated to a human.
      </p>
    </div>
  );
}

// Action Audit — which tool calls the policy/guard blocked, and the escalation.
export function ActionAudit({ denied = [], recommended = [] }) {
  const escalated = recommended.some((a) => a.tool_name === 'escalate_to_human');
  if (!denied.length && !escalated) return null;
  return (
    <Card>
      <CardHead icon="rule" title="Action Audit & Execution Trace">
        <span className="mono text-code-sm text-on-surface-variant">
          {denied.length + (escalated ? 1 : 0)} operations evaluated
        </span>
      </CardHead>
      <ul className="flex flex-col gap-space-sm">
        {denied.map((tool) => (
          <li
            key={tool}
            className="flex items-start gap-space-sm rounded-md border border-status-blocked-outline bg-status-blocked-bg p-space-md"
          >
            <span className="material-symbols-outlined text-[18px] text-status-blocked-fg">block</span>
            <div className="flex flex-col gap-space-2xs">
              <span className="flex items-center gap-space-sm">
                <span className="mono text-code-md line-through text-status-blocked-fg">{tool}</span>
                <Badge tone="blocked">blocked</Badge>
              </span>
              <span className="text-body-sm text-status-blocked-fg">
                Not allowed: denied by policy / guardrail · Status 403 Forbidden
              </span>
            </div>
          </li>
        ))}
        {escalated && (
          <li className="flex items-start gap-space-sm rounded-md border border-status-safe-outline bg-status-safe-bg p-space-md">
            <span className="material-symbols-outlined text-[18px] text-status-safe-fg">check_circle</span>
            <div className="flex flex-col gap-space-2xs">
              <span className="flex items-center gap-space-sm">
                <span className="mono text-code-md text-status-safe-fg">escalate_to_human</span>
                <Badge tone="safe">done</Badge>
              </span>
              <span className="text-body-sm text-status-safe-fg">Routed to a human specialist.</span>
            </div>
          </li>
        )}
      </ul>
    </Card>
  );
}

// KB Provenance Isolation — trusted docs used vs quarantined (never shown to the model).
export function KbProvenance({ verified = [], quarantined = [] }) {
  return (
    <Card>
      <CardHead icon="shield_lock" title="KB Provenance Isolation" />
      <p className="text-body-sm text-on-surface-variant mb-space-md">
        Model retrieval sandbox enforcement active.
      </p>
      <span className="text-label-sm uppercase tracking-wide text-on-surface-variant">
        Verified knowledge documents
      </span>
      <ul className="flex flex-col gap-space-xs mt-space-xs">
        {verified.length ? (
          verified.map((id) => (
            <li key={id} className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-[16px] text-status-safe-fg">verified</span>
              <span className="mono text-code-md">{id}</span>
            </li>
          ))
        ) : (
          <li className="text-body-sm text-on-surface-variant">None retrieved.</li>
        )}
      </ul>
      {quarantined.length > 0 && (
        <div className="mt-space-md rounded-md border border-status-blocked-outline bg-status-blocked-bg p-space-md">
          <span className="flex items-center justify-between gap-space-sm">
            <span className="flex items-center gap-space-xs text-label-md font-semibold text-status-blocked-fg">
              <span className="material-symbols-outlined text-[16px]">block</span>
              Quarantined document
            </span>
            <Badge tone="blocked">sandboxed</Badge>
          </span>
          <ul className="flex flex-col gap-space-2xs mt-space-sm">
            {quarantined.map((id) => (
              <li key={id} className="mono text-code-md text-status-blocked-fg">
                {id}
              </li>
            ))}
          </ul>
          <p className="text-body-sm text-status-blocked-fg mt-space-xs">
            Untrusted source — never shown to the AI. Preserved for the human compliance reviewer.
          </p>
        </div>
      )}
    </Card>
  );
}
